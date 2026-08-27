-- Ajustes incrementais pós-auditoria. Esta migration não apaga dados.
-- A migration 005 já foi aplicada; por isso as correções são aditivas.

create or replace function imob_normalize_text(p_value text)
returns text
language sql
immutable
strict
set search_path = public
as $$
  select regexp_replace(
    translate(
      upper(btrim(p_value)),
      'ÁÀÃÂÄÉÈÊËÍÌÎÏÓÒÕÔÖÚÙÛÜÇÑ',
      'AAAAAEEEEIIIIOOOOOUUUUCN'
    ),
    '\\s+', ' ', 'g'
  )
$$;

-- Impede que variações apenas de caixa, acento ou espaços criem uma segunda pessoa.
create unique index if not exists imob_owners_normalized_name_key
  on imob_owners (tenant_id, store_id, imob_normalize_text(name));

create unique index if not exists imob_renters_normalized_name_key
  on imob_renters (tenant_id, store_id, imob_normalize_text(name));

-- Conserva a implementação transacional da 005 como base interna e publica
-- uma camada que autoriza a operação, normaliza nomes e compara uma correção
-- do mesmo mês com a versão que ela substitui.
alter function imob_replace_csv_import(date, text, text, jsonb)
  rename to imob_replace_csv_import_base;

revoke all on function imob_replace_csv_import_base(date, text, text, jsonb) from public;
revoke all on function imob_replace_csv_import_base(date, text, text, jsonb) from authenticated;

create or replace function imob_replace_csv_import(
  p_competence date,
  p_source_filename text,
  p_source_hash text,
  p_rows jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_member imob_memberships%rowtype;
  v_same_month_import_id uuid;
  v_new_import_id uuid;
  v_previous_rows jsonb := '[]'::jsonb;
  v_normalized_rows jsonb := '[]'::jsonb;
  v_previous jsonb;
begin
  select * into v_member
  from imob_memberships
  where user_id = auth.uid() and active = true
  order by created_at, id
  limit 1;

  if not found or v_member.role not in ('admin', 'manager') then
    raise exception 'Somente administradores e gerentes podem importar CSV.';
  end if;

  -- A cópia da importação vigente é feita antes de a função base a superseder.
  select id into v_same_month_import_id
  from imob_imports
  where tenant_id = v_member.tenant_id
    and store_id = v_member.store_id
    and competence = p_competence
    and status in ('review', 'confirmed')
  order by created_at desc, id desc
  limit 1;

  if v_same_month_import_id is not null then
    select coalesce(jsonb_agg(to_jsonb(monthly)), '[]'::jsonb)
    into v_previous_rows
    from imob_monthly_leases monthly
    where monthly.import_id = v_same_month_import_id;
  end if;

  -- Reusa a grafia cadastrada quando o CSV diferir somente por acento, caixa
  -- ou espaços. Assim a função base encontra o mesmo proprietário/inquilino.
  select coalesce(jsonb_agg(
    jsonb_set(
      jsonb_set(row_value, '{ownerName}', to_jsonb(coalesce(owner_match.name, row_value ->> 'ownerName'))),
      '{renterName}', to_jsonb(coalesce(renter_match.name, row_value ->> 'renterName'))
    )
  ), '[]'::jsonb)
  into v_normalized_rows
  from jsonb_array_elements(p_rows) row_value
  left join lateral (
    select name from imob_owners
    where tenant_id = v_member.tenant_id
      and store_id = v_member.store_id
      and imob_normalize_text(name) = imob_normalize_text(row_value ->> 'ownerName')
    order by created_at, id limit 1
  ) owner_match on true
  left join lateral (
    select name from imob_renters
    where tenant_id = v_member.tenant_id
      and store_id = v_member.store_id
      and row_value ->> 'renterName' is not null
      and imob_normalize_text(name) = imob_normalize_text(row_value ->> 'renterName')
    order by created_at, id limit 1
  ) renter_match on true;

  v_new_import_id := imob_replace_csv_import_base(
    p_competence, p_source_filename, p_source_hash, v_normalized_rows
  );

  -- Se o arquivo foi corrigido no mesmo mês, o imóvel que desapareceu não é
  -- apagado do cadastro: entra no novo snapshot como vago.
  for v_previous in select value from jsonb_array_elements(v_previous_rows)
  loop
    if v_previous ->> 'property_id' is not null
      and v_previous ->> 'status' <> 'owner_inactive'
      and not exists (
        select 1 from imob_monthly_leases current_month
        where current_month.import_id = v_new_import_id
          and current_month.property_id = (v_previous ->> 'property_id')::uuid
      ) then
      insert into imob_monthly_leases (
        import_id, tenant_id, store_id, owner_id, property_id, renter_id,
        contract_number, external_code, category, street, number, complement,
        rent_amount, commission_amount, commission_rate, status,
        change_notes, selected_for_receipt
      ) values (
        v_new_import_id, v_member.tenant_id, v_member.store_id,
        (v_previous ->> 'owner_id')::uuid, (v_previous ->> 'property_id')::uuid,
        nullif(v_previous ->> 'renter_id', '')::uuid, v_previous ->> 'contract_number',
        v_previous ->> 'external_code', v_previous ->> 'category',
        v_previous ->> 'street', v_previous ->> 'number',
        coalesce(v_previous ->> 'complement', ''),
        nullif(v_previous ->> 'rent_amount', '')::numeric,
        nullif(v_previous ->> 'commission_amount', '')::numeric,
        nullif(v_previous ->> 'commission_rate', '')::numeric,
        'vacant', array['Imóvel não apareceu no CSV corrigido desta competência'], false
      );
    end if;
  end loop;

  -- Mantém também a marcação do proprietário que deixou de constar no arquivo.
  insert into imob_monthly_leases (
    import_id, tenant_id, store_id, owner_id, street, number, complement,
    status, change_notes, selected_for_receipt
  )
  select distinct
    v_new_import_id, v_member.tenant_id, v_member.store_id,
    (previous_row ->> 'owner_id')::uuid, 'Sem imóvel ativo', '', '',
    'owner_inactive', array['Proprietário não apareceu no CSV corrigido desta competência'], false
  from jsonb_array_elements(v_previous_rows) previous_row
  where previous_row ->> 'status' <> 'owner_inactive'
    and not exists (
      select 1 from imob_monthly_leases current_month
      where current_month.import_id = v_new_import_id
        and current_month.owner_id = (previous_row ->> 'owner_id')::uuid
        and current_month.status in ('active', 'changed', 'pending_data')
    )
    and not exists (
      select 1 from imob_monthly_leases current_month
      where current_month.import_id = v_new_import_id
        and current_month.owner_id = (previous_row ->> 'owner_id')::uuid
        and current_month.status = 'owner_inactive'
    );

  return v_new_import_id;
end;
$$;

revoke all on function imob_replace_csv_import(date, text, text, jsonb) from public;
grant execute on function imob_replace_csv_import(date, text, text, jsonb) to authenticated;

-- Somente gestores podem alterar o domínio; employees mantêm a consulta da loja.
drop policy if exists "imob owners by store" on imob_owners;
drop policy if exists "imob renters by store" on imob_renters;
drop policy if exists "imob properties by store" on imob_properties;
drop policy if exists "imob leases by store" on imob_leases;
drop policy if exists "imob imports by store" on imob_imports;
drop policy if exists "imob monthly leases by store" on imob_monthly_leases;
drop policy if exists "imob receipts by store" on imob_receipts;

create policy "imob owners by store read" on imob_owners for select using (tenant_id = imob_current_tenant_id() and store_id = imob_current_store_id());
create policy "imob renters by store read" on imob_renters for select using (tenant_id = imob_current_tenant_id() and store_id = imob_current_store_id());
create policy "imob properties by store read" on imob_properties for select using (tenant_id = imob_current_tenant_id() and store_id = imob_current_store_id());
create policy "imob leases by store read" on imob_leases for select using (tenant_id = imob_current_tenant_id() and store_id = imob_current_store_id());
create policy "imob imports by store read" on imob_imports for select using (tenant_id = imob_current_tenant_id() and store_id = imob_current_store_id());
create policy "imob monthly leases by store read" on imob_monthly_leases for select using (tenant_id = imob_current_tenant_id() and store_id = imob_current_store_id());
create policy "imob receipts by store read" on imob_receipts for select using (tenant_id = imob_current_tenant_id() and store_id = imob_current_store_id());

create policy "imob owners by store write" on imob_owners for all using (tenant_id = imob_current_tenant_id() and store_id = imob_current_store_id() and imob_is_manager()) with check (tenant_id = imob_current_tenant_id() and store_id = imob_current_store_id() and imob_is_manager());
create policy "imob renters by store write" on imob_renters for all using (tenant_id = imob_current_tenant_id() and store_id = imob_current_store_id() and imob_is_manager()) with check (tenant_id = imob_current_tenant_id() and store_id = imob_current_store_id() and imob_is_manager());
create policy "imob properties by store write" on imob_properties for all using (tenant_id = imob_current_tenant_id() and store_id = imob_current_store_id() and imob_is_manager()) with check (tenant_id = imob_current_tenant_id() and store_id = imob_current_store_id() and imob_is_manager());
create policy "imob leases by store write" on imob_leases for all using (tenant_id = imob_current_tenant_id() and store_id = imob_current_store_id() and imob_is_manager()) with check (tenant_id = imob_current_tenant_id() and store_id = imob_current_store_id() and imob_is_manager());
create policy "imob imports by store write" on imob_imports for all using (tenant_id = imob_current_tenant_id() and store_id = imob_current_store_id() and imob_is_manager()) with check (tenant_id = imob_current_tenant_id() and store_id = imob_current_store_id() and imob_is_manager());
create policy "imob monthly leases by store write" on imob_monthly_leases for all using (tenant_id = imob_current_tenant_id() and store_id = imob_current_store_id() and imob_is_manager()) with check (tenant_id = imob_current_tenant_id() and store_id = imob_current_store_id() and imob_is_manager());
create policy "imob receipts by store write" on imob_receipts for all using (tenant_id = imob_current_tenant_id() and store_id = imob_current_store_id() and imob_is_manager()) with check (tenant_id = imob_current_tenant_id() and store_id = imob_current_store_id() and imob_is_manager());

create or replace function imob_set_receipt_selection(p_import_id uuid, p_selected_ids uuid[])
returns void language plpgsql security definer set search_path = public as $$
declare
  v_tenant_id uuid := imob_current_tenant_id();
  v_store_id uuid := imob_current_store_id();
begin
  if not imob_is_manager() then raise exception 'Somente administradores e gerentes podem selecionar documentos.'; end if;
  if not exists (select 1 from imob_imports where id = p_import_id and tenant_id = v_tenant_id and store_id = v_store_id) then
    raise exception 'Importação não encontrada para esta filial.';
  end if;
  update imob_monthly_leases set selected_for_receipt = id = any(coalesce(p_selected_ids, '{}'::uuid[]))
  where import_id = p_import_id and tenant_id = v_tenant_id and store_id = v_store_id;
end;
$$;

alter function imob_save_receipts(uuid, jsonb)
  rename to imob_save_receipts_base;

revoke all on function imob_save_receipts_base(uuid, jsonb) from public;
revoke all on function imob_save_receipts_base(uuid, jsonb) from authenticated;

create or replace function imob_save_receipts(p_import_id uuid, p_receipts jsonb)
returns integer language plpgsql security definer set search_path = public as $$
begin
  if not imob_is_manager() then raise exception 'Somente administradores e gerentes podem gerar documentos.'; end if;
  return imob_save_receipts_base(p_import_id, p_receipts);
end;
$$;

revoke all on function imob_save_receipts(uuid, jsonb) from public;
grant execute on function imob_save_receipts(uuid, jsonb) to authenticated;
