-- Enriquece cadastros a partir de relatórios que também trazem CPF/CNPJ e localização.
-- A importação-base continua responsável pelo snapshot mensal; esta camada apenas corrige
-- dados cadastrais quando o arquivo informar um valor válido e diferente do já salvo.

do $$
begin
  if to_regprocedure('public.imob_replace_csv_import_snapshot(date, text, text, jsonb)') is null then
    alter function public.imob_replace_csv_import(date, text, text, jsonb)
      rename to imob_replace_csv_import_snapshot;
  end if;
end;
$$;

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
  v_import_id uuid;
begin
  select * into v_member
  from imob_memberships
  where user_id = auth.uid() and active = true
  order by created_at, id
  limit 1;

  if not found or v_member.role not in ('admin', 'manager') then
    raise exception 'Somente administradores e gerentes podem importar relatórios.';
  end if;

  v_import_id := imob_replace_csv_import_snapshot(
    p_competence, p_source_filename, p_source_hash, p_rows
  );

  -- Não sobrescreve CPF/CNPJ com texto vazio ou inválido. O mesmo nome normalizado
  -- identifica a pessoa já reutilizada pelo fluxo de importação.
  with owner_values as (
    select distinct on (imob_normalize_text(row_value ->> 'ownerName'))
      imob_normalize_text(row_value ->> 'ownerName') as normalized_name,
      regexp_replace(coalesce(row_value ->> 'ownerDocument', ''), '[^0-9]', '', 'g') as document
    from jsonb_array_elements(p_rows) row_value
    where length(regexp_replace(coalesce(row_value ->> 'ownerDocument', ''), '[^0-9]', '', 'g')) in (11, 14)
    order by imob_normalize_text(row_value ->> 'ownerName'), row_value ->> 'ownerDocument'
  )
  update imob_owners owner
  set document = owner_values.document, updated_at = now()
  from owner_values
  where owner.tenant_id = v_member.tenant_id
    and owner.store_id = v_member.store_id
    and imob_normalize_text(owner.name) = owner_values.normalized_name
    and owner.document is distinct from owner_values.document;

  with renter_values as (
    select distinct on (imob_normalize_text(row_value ->> 'renterName'))
      imob_normalize_text(row_value ->> 'renterName') as normalized_name,
      regexp_replace(coalesce(row_value ->> 'renterDocument', ''), '[^0-9]', '', 'g') as document
    from jsonb_array_elements(p_rows) row_value
    where nullif(btrim(row_value ->> 'renterName'), '') is not null
      and length(regexp_replace(coalesce(row_value ->> 'renterDocument', ''), '[^0-9]', '', 'g')) in (11, 14)
    order by imob_normalize_text(row_value ->> 'renterName'), row_value ->> 'renterDocument'
  )
  update imob_renters renter
  set document = renter_values.document, updated_at = now()
  from renter_values
  where renter.tenant_id = v_member.tenant_id
    and renter.store_id = v_member.store_id
    and imob_normalize_text(renter.name) = renter_values.normalized_name
    and renter.document is distinct from renter_values.document;

  with property_values as (
    select distinct on (monthly.property_id)
      monthly.property_id,
      nullif(btrim(row_value ->> 'city'), '') as city,
      nullif(upper(btrim(row_value ->> 'state')), '') as state
    from jsonb_array_elements(p_rows) row_value
    join imob_monthly_leases monthly
      on monthly.import_id = v_import_id
      and monthly.contract_number is not distinct from nullif(row_value ->> 'contractNumber', '')
      and monthly.external_code is not distinct from nullif(row_value ->> 'propertyCode', '')
    where monthly.property_id is not null
      and (nullif(btrim(row_value ->> 'city'), '') is not null or nullif(btrim(row_value ->> 'state'), '') is not null)
    order by monthly.property_id, row_value ->> 'contractNumber'
  )
  update imob_properties property
  set city = coalesce(property_values.city, property.city),
      state = coalesce(property_values.state, property.state),
      updated_at = now()
  from property_values
  where property.id = property_values.property_id
    and property.tenant_id = v_member.tenant_id
    and property.store_id = v_member.store_id
    and (
      (property_values.city is not null and property.city is distinct from property_values.city)
      or (property_values.state is not null and property.state is distinct from property_values.state)
    );

  -- A base calcula o status antes desta camada complementar. Recalcula agora
  -- somente os itens desta importação que já ficaram completos.
  update imob_monthly_leases monthly
  set status = 'active'
  where monthly.import_id = v_import_id
    and monthly.status = 'pending_data'
    and exists (select 1 from imob_owners owner where owner.id = monthly.owner_id and owner.document is not null)
    and exists (select 1 from imob_renters renter where renter.id = monthly.renter_id and renter.document is not null)
    and exists (select 1 from imob_properties property where property.id = monthly.property_id and property.city is not null and property.state is not null);

  -- O padrão da revisão é marcar somente itens que podem gerar recibo.
  update imob_monthly_leases
  set selected_for_receipt = status in ('active', 'changed')
  where import_id = v_import_id
    and status in ('active', 'changed', 'pending_data', 'vacant', 'owner_inactive');

  return v_import_id;
end;
$$;

revoke all on function imob_replace_csv_import(date, text, text, jsonb) from public;
grant execute on function imob_replace_csv_import(date, text, text, jsonb) to authenticated;
