-- Reset deliberadamente destrutivo do domínio MB Imob.
-- Apaga somente tabelas/funções imob_*; auth.users e o domínio nftoledo são preservados.

drop table if exists imob_receipts cascade;
drop table if exists imob_monthly_leases cascade;
drop table if exists imob_imports cascade;
drop table if exists imob_leases cascade;
drop table if exists imob_properties cascade;
drop table if exists imob_renters cascade;
drop table if exists imob_owners cascade;
drop table if exists imob_company_settings cascade;
drop table if exists imob_memberships cascade;
drop table if exists imob_stores cascade;
drop table if exists imob_tenants cascade;
drop table if exists imob_organizations cascade;

drop function if exists imob_current_org_id() cascade;
drop function if exists imob_current_tenant_id() cascade;
drop function if exists imob_current_store_id() cascade;
drop function if exists imob_is_manager() cascade;
drop function if exists imob_replace_csv_import(date, text, text, jsonb) cascade;
drop function if exists imob_set_receipt_selection(uuid, uuid[]) cascade;
drop function if exists imob_save_receipts(uuid, jsonb) cascade;

create table imob_tenants (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table imob_stores (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references imob_tenants(id) on delete cascade,
  store_id text not null,
  name text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (tenant_id, store_id),
  unique (id, tenant_id)
);

create table imob_memberships (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  tenant_id uuid not null references imob_tenants(id) on delete cascade,
  store_id uuid not null,
  role text not null check (role in ('admin', 'manager', 'employee')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (user_id, tenant_id, store_id),
  foreign key (store_id, tenant_id) references imob_stores(id, tenant_id) on delete cascade
);

create table imob_company_settings (
  tenant_id uuid primary key references imob_tenants(id) on delete cascade,
  razao_social text,
  nome_fantasia text,
  cnpj text,
  logradouro text,
  numero text,
  complemento text,
  bairro text,
  cidade text,
  uf text,
  cep text,
  creci text,
  signatory_name text,
  signatory_title text default 'Sócia – Administrativa',
  document_label text not null default 'DIMOB',
  logo_path text,
  updated_at timestamptz not null default now()
);

create table imob_owners (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  store_id uuid not null,
  name text not null,
  document text,
  email text,
  phone text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, store_id, name),
  unique (id, tenant_id, store_id),
  foreign key (store_id, tenant_id) references imob_stores(id, tenant_id) on delete cascade
);

create table imob_renters (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  store_id uuid not null,
  name text not null,
  document text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, store_id, name),
  unique (id, tenant_id, store_id),
  foreign key (store_id, tenant_id) references imob_stores(id, tenant_id) on delete cascade
);

create table imob_properties (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  store_id uuid not null,
  owner_id uuid not null,
  external_code text,
  category text,
  street text not null,
  number text not null,
  complement text not null default '',
  city text,
  state text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, store_id, owner_id, external_code, street, number, complement),
  unique (id, tenant_id, store_id),
  foreign key (store_id, tenant_id) references imob_stores(id, tenant_id) on delete cascade,
  foreign key (owner_id, tenant_id, store_id) references imob_owners(id, tenant_id, store_id) on delete cascade
);

create table imob_leases (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  store_id uuid not null,
  property_id uuid not null,
  renter_id uuid,
  contract_number text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (store_id, tenant_id) references imob_stores(id, tenant_id) on delete cascade,
  foreign key (property_id, tenant_id, store_id) references imob_properties(id, tenant_id, store_id) on delete cascade,
  foreign key (renter_id, tenant_id, store_id) references imob_renters(id, tenant_id, store_id)
);

create unique index imob_one_active_lease_per_property
  on imob_leases (property_id) where active = true;

create table imob_imports (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  store_id uuid not null,
  competence date not null,
  source_filename text not null,
  source_hash text,
  status text not null default 'review' check (status in ('review', 'confirmed', 'superseded')),
  imported_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  confirmed_at timestamptz,
  unique (id, tenant_id, store_id),
  foreign key (store_id, tenant_id) references imob_stores(id, tenant_id) on delete cascade
);

create unique index imob_one_active_import_per_competence
  on imob_imports (tenant_id, store_id, competence)
  where status in ('review', 'confirmed');

create table imob_monthly_leases (
  id uuid primary key default gen_random_uuid(),
  import_id uuid not null,
  tenant_id uuid not null,
  store_id uuid not null,
  owner_id uuid not null,
  property_id uuid,
  renter_id uuid,
  contract_number text,
  external_code text,
  category text,
  street text not null,
  number text not null,
  complement text not null default '',
  rent_amount numeric(12,2),
  commission_amount numeric(12,2),
  commission_rate numeric(7,4),
  status text not null check (status in ('active', 'vacant', 'owner_inactive', 'changed', 'pending_data')),
  change_notes text[] not null default '{}',
  selected_for_receipt boolean not null default false,
  created_at timestamptz not null default now(),
  unique (id, tenant_id, store_id),
  foreign key (import_id, tenant_id, store_id) references imob_imports(id, tenant_id, store_id) on delete cascade,
  foreign key (owner_id, tenant_id, store_id) references imob_owners(id, tenant_id, store_id),
  foreign key (property_id, tenant_id, store_id) references imob_properties(id, tenant_id, store_id),
  foreign key (renter_id, tenant_id, store_id) references imob_renters(id, tenant_id, store_id)
);

create table imob_receipts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  store_id uuid not null,
  monthly_lease_id uuid not null unique,
  generated_by uuid references auth.users(id),
  generated_at timestamptz not null default now(),
  filename text not null,
  document_html text not null,
  foreign key (store_id, tenant_id) references imob_stores(id, tenant_id) on delete cascade,
  foreign key (monthly_lease_id, tenant_id, store_id) references imob_monthly_leases(id, tenant_id, store_id) on delete cascade
);

create or replace function imob_current_tenant_id()
returns uuid language sql security definer stable set search_path = public as $$
  select tenant_id from imob_memberships
  where user_id = auth.uid() and active = true
  order by created_at, id limit 1
$$;

create or replace function imob_current_store_id()
returns uuid language sql security definer stable set search_path = public as $$
  select store_id from imob_memberships
  where user_id = auth.uid() and active = true
  order by created_at, id limit 1
$$;

create or replace function imob_is_manager()
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from imob_memberships
    where user_id = auth.uid()
      and active = true
      and tenant_id = imob_current_tenant_id()
      and store_id = imob_current_store_id()
      and role in ('admin', 'manager')
  )
$$;

alter table imob_tenants enable row level security;
alter table imob_stores enable row level security;
alter table imob_memberships enable row level security;
alter table imob_company_settings enable row level security;
alter table imob_owners enable row level security;
alter table imob_renters enable row level security;
alter table imob_properties enable row level security;
alter table imob_leases enable row level security;
alter table imob_imports enable row level security;
alter table imob_monthly_leases enable row level security;
alter table imob_receipts enable row level security;

create policy "imob tenant read" on imob_tenants for select using (id = imob_current_tenant_id());
create policy "imob store read" on imob_stores for select using (tenant_id = imob_current_tenant_id() and id = imob_current_store_id());
create policy "imob membership own read" on imob_memberships for select using (user_id = auth.uid());
create policy "imob settings read" on imob_company_settings for select using (tenant_id = imob_current_tenant_id());
create policy "imob settings insert" on imob_company_settings for insert with check (tenant_id = imob_current_tenant_id() and imob_is_manager());
create policy "imob settings update" on imob_company_settings for update using (tenant_id = imob_current_tenant_id() and imob_is_manager()) with check (tenant_id = imob_current_tenant_id() and imob_is_manager());

create policy "imob owners by store" on imob_owners for all using (tenant_id = imob_current_tenant_id() and store_id = imob_current_store_id()) with check (tenant_id = imob_current_tenant_id() and store_id = imob_current_store_id());
create policy "imob renters by store" on imob_renters for all using (tenant_id = imob_current_tenant_id() and store_id = imob_current_store_id()) with check (tenant_id = imob_current_tenant_id() and store_id = imob_current_store_id());
create policy "imob properties by store" on imob_properties for all using (tenant_id = imob_current_tenant_id() and store_id = imob_current_store_id()) with check (tenant_id = imob_current_tenant_id() and store_id = imob_current_store_id());
create policy "imob leases by store" on imob_leases for all using (tenant_id = imob_current_tenant_id() and store_id = imob_current_store_id()) with check (tenant_id = imob_current_tenant_id() and store_id = imob_current_store_id());
create policy "imob imports by store" on imob_imports for all using (tenant_id = imob_current_tenant_id() and store_id = imob_current_store_id()) with check (tenant_id = imob_current_tenant_id() and store_id = imob_current_store_id());
create policy "imob monthly leases by store" on imob_monthly_leases for all using (tenant_id = imob_current_tenant_id() and store_id = imob_current_store_id()) with check (tenant_id = imob_current_tenant_id() and store_id = imob_current_store_id());
create policy "imob receipts by store" on imob_receipts for all using (tenant_id = imob_current_tenant_id() and store_id = imob_current_store_id()) with check (tenant_id = imob_current_tenant_id() and store_id = imob_current_store_id());

-- Processa o CSV inteiro dentro de uma única transação do PostgreSQL.
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
  v_prior_import_id uuid;
  v_row jsonb;
  v_prior imob_monthly_leases%rowtype;
  v_owner_id uuid;
  v_owner_document text;
  v_renter_id uuid;
  v_renter_document text;
  v_property_id uuid;
  v_property_city text;
  v_property_state text;
  v_lease_id uuid;
  v_owner_name text;
  v_renter_name text;
  v_street text;
  v_number text;
  v_complement text;
  v_property_code text;
  v_category text;
  v_contract_number text;
  v_rent numeric(12,2);
  v_commission numeric(12,2);
  v_rate numeric(7,4);
  v_notes text[];
  v_status text;
  v_property_ids uuid[] := '{}';
  v_owner_ids uuid[] := '{}';
begin
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) = 0 then
    raise exception 'O CSV não possui locações válidas.';
  end if;

  select * into v_member
  from imob_memberships
  where user_id = auth.uid() and active = true
  order by created_at, id
  limit 1;

  if not found then
    raise exception 'Seu usuário não está vinculado a uma imobiliária e filial ativas.';
  end if;

  select id into v_prior_import_id
  from imob_imports
  where tenant_id = v_member.tenant_id
    and store_id = v_member.store_id
    and status = 'confirmed'
    and competence < p_competence
  order by competence desc, created_at desc, id desc
  limit 1;

  update imob_imports
  set status = 'superseded'
  where tenant_id = v_member.tenant_id
    and store_id = v_member.store_id
    and competence = p_competence
    and status in ('review', 'confirmed');

  insert into imob_imports (
    tenant_id, store_id, competence, source_filename, source_hash, imported_by
  ) values (
    v_member.tenant_id, v_member.store_id, p_competence,
    p_source_filename, p_source_hash, auth.uid()
  ) returning id into v_import_id;

  for v_row in select value from jsonb_array_elements(p_rows)
  loop
    v_owner_name := nullif(btrim(v_row ->> 'ownerName'), '');
    v_renter_name := nullif(btrim(v_row ->> 'renterName'), '');
    v_street := nullif(btrim(v_row ->> 'street'), '');
    v_number := nullif(btrim(v_row ->> 'number'), '');
    v_complement := coalesce(btrim(v_row ->> 'complement'), '');
    v_property_code := nullif(btrim(v_row ->> 'propertyCode'), '');
    v_category := nullif(btrim(v_row ->> 'category'), '');
    v_contract_number := nullif(btrim(v_row ->> 'contractNumber'), '');
    v_rent := nullif(btrim(v_row ->> 'rentAmount'), '')::numeric(12,2);
    v_commission := nullif(btrim(v_row ->> 'commissionAmount'), '')::numeric(12,2);
    v_rate := nullif(btrim(v_row ->> 'commissionRate'), '')::numeric(7,4);

    if v_owner_name is null or v_street is null or v_number is null then
      raise exception 'Há uma linha do CSV sem proprietário ou endereço do imóvel.';
    end if;

    select id, document into v_owner_id, v_owner_document
    from imob_owners
    where tenant_id = v_member.tenant_id
      and store_id = v_member.store_id
      and upper(btrim(name)) = upper(v_owner_name)
    order by created_at, id limit 1;

    if not found then
      insert into imob_owners (tenant_id, store_id, name)
      values (v_member.tenant_id, v_member.store_id, v_owner_name)
      returning id, document into v_owner_id, v_owner_document;
    end if;

    v_renter_id := null;
    v_renter_document := null;
    if v_renter_name is not null then
      select id, document into v_renter_id, v_renter_document
      from imob_renters
      where tenant_id = v_member.tenant_id
        and store_id = v_member.store_id
        and upper(btrim(name)) = upper(v_renter_name)
      order by created_at, id limit 1;

      if not found then
        insert into imob_renters (tenant_id, store_id, name)
        values (v_member.tenant_id, v_member.store_id, v_renter_name)
        returning id, document into v_renter_id, v_renter_document;
      end if;
    end if;

    v_property_id := null;
    v_property_city := null;
    v_property_state := null;
    if v_property_code is not null then
      select id, city, state into v_property_id, v_property_city, v_property_state
      from imob_properties
      where tenant_id = v_member.tenant_id
        and store_id = v_member.store_id
        and owner_id = v_owner_id
        and external_code = v_property_code
      order by created_at, id limit 1;
    end if;

    if v_property_id is null then
      select id, city, state into v_property_id, v_property_city, v_property_state
      from imob_properties
      where tenant_id = v_member.tenant_id
        and store_id = v_member.store_id
        and owner_id = v_owner_id
        and upper(btrim(street)) = upper(v_street)
        and number = v_number
        and upper(btrim(complement)) = upper(v_complement)
      order by created_at, id limit 1;
    end if;

    if v_property_id is null then
      insert into imob_properties (
        tenant_id, store_id, owner_id, external_code, category,
        street, number, complement, active
      ) values (
        v_member.tenant_id, v_member.store_id, v_owner_id, v_property_code,
        v_category, v_street, v_number, v_complement, true
      ) returning id, city, state into v_property_id, v_property_city, v_property_state;
    end if;

    select id into v_lease_id
    from imob_leases
    where tenant_id = v_member.tenant_id
      and store_id = v_member.store_id
      and property_id = v_property_id
      and active = true
    limit 1;

    if found then
      update imob_leases set
        renter_id = v_renter_id,
        contract_number = v_contract_number,
        updated_at = now()
      where id = v_lease_id;
    else
      insert into imob_leases (
        tenant_id, store_id, property_id, renter_id, contract_number
      ) values (
        v_member.tenant_id, v_member.store_id, v_property_id,
        v_renter_id, v_contract_number
      );
    end if;

    v_prior.id := null;
    if v_prior_import_id is not null then
      select * into v_prior
      from imob_monthly_leases
      where import_id = v_prior_import_id and property_id = v_property_id
      order by created_at desc, id desc limit 1;
    end if;

    v_notes := '{}'::text[];
    if v_prior.id is not null then
      if v_prior.rent_amount is distinct from v_rent then
        v_notes := array_append(v_notes, 'Valor do aluguel alterado');
      end if;
      if v_prior.commission_amount is distinct from v_commission then
        v_notes := array_append(v_notes, 'Valor da comissão alterado');
      end if;
      if v_prior.renter_id is distinct from v_renter_id then
        v_notes := array_append(v_notes, 'Locatário alterado');
      end if;
    end if;

    if v_owner_document is null
      or v_renter_id is null
      or v_renter_document is null
      or v_property_city is null
      or v_property_state is null then
      v_status := 'pending_data';
    elsif cardinality(v_notes) > 0 then
      v_status := 'changed';
    else
      v_status := 'active';
    end if;

    insert into imob_monthly_leases (
      import_id, tenant_id, store_id, owner_id, property_id, renter_id,
      contract_number, external_code, category, street, number, complement,
      rent_amount, commission_amount, commission_rate, status,
      change_notes, selected_for_receipt
    ) values (
      v_import_id, v_member.tenant_id, v_member.store_id, v_owner_id,
      v_property_id, v_renter_id, v_contract_number, v_property_code,
      v_category, v_street, v_number, v_complement, v_rent,
      v_commission, v_rate, v_status, v_notes, false
    );

    if not (v_property_id = any(v_property_ids)) then
      v_property_ids := array_append(v_property_ids, v_property_id);
    end if;
    if not (v_owner_id = any(v_owner_ids)) then
      v_owner_ids := array_append(v_owner_ids, v_owner_id);
    end if;
  end loop;

  if v_prior_import_id is not null then
    for v_prior in select * from imob_monthly_leases where import_id = v_prior_import_id
    loop
      if v_prior.property_id is not null
        and not (v_prior.property_id = any(v_property_ids))
        and v_prior.status <> 'owner_inactive' then
        insert into imob_monthly_leases (
          import_id, tenant_id, store_id, owner_id, property_id, renter_id,
          contract_number, external_code, category, street, number, complement,
          rent_amount, commission_amount, commission_rate, status,
          change_notes, selected_for_receipt
        ) values (
          v_import_id, v_member.tenant_id, v_member.store_id, v_prior.owner_id,
          v_prior.property_id, v_prior.renter_id, v_prior.contract_number,
          v_prior.external_code, v_prior.category, v_prior.street,
          v_prior.number, coalesce(v_prior.complement, ''), v_prior.rent_amount,
          v_prior.commission_amount, v_prior.commission_rate, 'vacant',
          array['Imóvel não apareceu no CSV desta competência'], false
        );
      end if;

      if v_prior.status <> 'owner_inactive'
        and not (v_prior.owner_id = any(v_owner_ids))
        and not exists (
          select 1 from imob_monthly_leases
          where import_id = v_import_id
            and owner_id = v_prior.owner_id
            and status = 'owner_inactive'
        ) then
        insert into imob_monthly_leases (
          import_id, tenant_id, store_id, owner_id, street, number,
          complement, status, change_notes, selected_for_receipt
        ) values (
          v_import_id, v_member.tenant_id, v_member.store_id,
          v_prior.owner_id, 'Sem imóvel ativo', '', '', 'owner_inactive',
          array['Proprietário não apareceu no CSV desta competência'], false
        );
      end if;
    end loop;
  end if;

  return v_import_id;
end;
$$;

revoke all on function imob_replace_csv_import(date, text, text, jsonb) from public;
grant execute on function imob_replace_csv_import(date, text, text, jsonb) to authenticated;

-- Troca toda a seleção de documentos em um único update.
create or replace function imob_set_receipt_selection(
  p_import_id uuid,
  p_selected_ids uuid[]
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant_id uuid := imob_current_tenant_id();
  v_store_id uuid := imob_current_store_id();
begin
  if not exists (
    select 1 from imob_imports
    where id = p_import_id
      and tenant_id = v_tenant_id
      and store_id = v_store_id
  ) then
    raise exception 'Importação não encontrada para esta filial.';
  end if;

  update imob_monthly_leases
  set selected_for_receipt = id = any(coalesce(p_selected_ids, '{}'::uuid[]))
  where import_id = p_import_id
    and tenant_id = v_tenant_id
    and store_id = v_store_id;
end;
$$;

revoke all on function imob_set_receipt_selection(uuid, uuid[]) from public;
grant execute on function imob_set_receipt_selection(uuid, uuid[]) to authenticated;

-- Salva/substitui documentos e confirma a importação na mesma transação.
create or replace function imob_save_receipts(
  p_import_id uuid,
  p_receipts jsonb
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant_id uuid := imob_current_tenant_id();
  v_store_id uuid := imob_current_store_id();
  v_receipt jsonb;
  v_monthly_id uuid;
  v_count integer := 0;
begin
  if p_receipts is null or jsonb_typeof(p_receipts) <> 'array' or jsonb_array_length(p_receipts) = 0 then
    raise exception 'Nenhum documento válido foi informado.';
  end if;

  if not exists (
    select 1 from imob_imports
    where id = p_import_id
      and tenant_id = v_tenant_id
      and store_id = v_store_id
  ) then
    raise exception 'Importação não encontrada para esta filial.';
  end if;

  for v_receipt in select value from jsonb_array_elements(p_receipts)
  loop
    v_monthly_id := (v_receipt ->> 'monthly_lease_id')::uuid;
    if not exists (
      select 1 from imob_monthly_leases
      where id = v_monthly_id
        and import_id = p_import_id
        and tenant_id = v_tenant_id
        and store_id = v_store_id
        and selected_for_receipt = true
        and status in ('active', 'changed')
    ) then
      raise exception 'Um documento não pertence à seleção válida desta importação.';
    end if;

    insert into imob_receipts (
      tenant_id, store_id, monthly_lease_id, generated_by,
      filename, document_html, generated_at
    ) values (
      v_tenant_id, v_store_id, v_monthly_id, auth.uid(),
      v_receipt ->> 'filename', v_receipt ->> 'document_html', now()
    )
    on conflict (monthly_lease_id) do update set
      generated_by = excluded.generated_by,
      filename = excluded.filename,
      document_html = excluded.document_html,
      generated_at = excluded.generated_at;
    v_count := v_count + 1;
  end loop;

  update imob_imports
  set status = 'confirmed', confirmed_at = now()
  where id = p_import_id
    and tenant_id = v_tenant_id
    and store_id = v_store_id;

  return v_count;
end;
$$;

revoke all on function imob_save_receipts(uuid, jsonb) from public;
grant execute on function imob_save_receipts(uuid, jsonb) to authenticated;

-- Recria a instalação inicial conhecida. O usuário Auth é preservado pelo reset.
do $$
declare
  v_tenant_id uuid;
  v_store_id uuid;
  v_user_id uuid;
begin
  insert into imob_tenants (name)
  values ('4001 - tenant')
  returning id into v_tenant_id;

  insert into imob_stores (tenant_id, store_id, name)
  values (v_tenant_id, '4001', '4001')
  returning id into v_store_id;

  select id into v_user_id
  from auth.users
  where lower(email) = 'edimar@4001.com'
  order by created_at limit 1;

  if v_user_id is not null then
    insert into imob_memberships (user_id, tenant_id, store_id, role)
    values (v_user_id, v_tenant_id, v_store_id, 'admin');
  end if;

  insert into imob_company_settings (
    tenant_id, razao_social, nome_fantasia, cnpj, logradouro, numero,
    bairro, cidade, uf, cep, creci, signatory_title, document_label
  ) values (
    v_tenant_id, 'Antônio Lopes & Cia Ltda',
    '4001 Empreendimentos Imobiliários', '03.279.846/0001-09',
    'Av. Cel. Otávio Tosta', '290', 'Centro', 'Guaíra', 'PR',
    '85980-046', '3598-J', 'Sócia – Administrativa', 'DIMOB'
  );
end;
$$;

-- Mantém a configuração do Storage alinhada ao novo domínio.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('imob-logos', 'imob-logos', true, 5242880, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "imob logos public read" on storage.objects;
drop policy if exists "imob logos managers insert" on storage.objects;
drop policy if exists "imob logos managers delete" on storage.objects;

create policy "imob logos public read" on storage.objects for select
using (bucket_id = 'imob-logos');

create policy "imob logos managers insert" on storage.objects for insert to authenticated
with check (
  bucket_id = 'imob-logos'
  and exists (
    select 1 from imob_memberships
    where user_id = auth.uid() and active = true
      and role in ('admin', 'manager')
      and tenant_id::text = (storage.foldername(name))[1]
  )
);

create policy "imob logos managers delete" on storage.objects for delete to authenticated
using (
  bucket_id = 'imob-logos'
  and exists (
    select 1 from imob_memberships
    where user_id = auth.uid() and active = true
      and role in ('admin', 'manager')
      and tenant_id::text = (storage.foldername(name))[1]
  )
);
