-- Reinicialização deliberadamente destrutiva do domínio da imobiliária.
-- Escopo: somente tabelas e funções com prefixo imob_. Não toca no nftoledo.

drop table if exists imob_receipts cascade;
drop table if exists imob_monthly_leases cascade;
drop table if exists imob_imports cascade;
drop table if exists imob_leases cascade;
drop table if exists imob_properties cascade;
drop table if exists imob_renters cascade;
drop table if exists imob_tenants cascade;
drop table if exists imob_owners cascade;
drop table if exists imob_company_settings cascade;
drop table if exists imob_memberships cascade;
drop table if exists imob_stores cascade;
drop table if exists imob_organizations cascade;
drop function if exists imob_current_org_id() cascade;
drop function if exists imob_current_tenant_id() cascade;

-- Tenant é a imobiliária cliente da plataforma.
create table imob_tenants (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Store é uma filial/unidade operacional do tenant.
create table imob_stores (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references imob_tenants(id) on delete cascade,
  store_id text not null,
  name text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (tenant_id, store_id)
);

create table imob_memberships (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  tenant_id uuid not null references imob_tenants(id) on delete cascade,
  store_id uuid references imob_stores(id) on delete set null,
  role text not null check (role in ('admin', 'manager', 'employee')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (user_id, tenant_id, store_id)
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
  updated_at timestamptz not null default now()
);

create table imob_owners (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references imob_tenants(id) on delete cascade,
  name text not null,
  document text,
  email text,
  phone text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, name)
);

-- Renter é o locatário/inquilino, nunca o tenant da plataforma.
create table imob_renters (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references imob_tenants(id) on delete cascade,
  name text not null,
  document text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, name)
);

create table imob_properties (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references imob_tenants(id) on delete cascade,
  owner_id uuid not null references imob_owners(id) on delete cascade,
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
  unique (tenant_id, owner_id, external_code, street, number, complement)
);

create table imob_leases (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references imob_tenants(id) on delete cascade,
  property_id uuid not null references imob_properties(id) on delete cascade,
  renter_id uuid references imob_renters(id) on delete set null,
  contract_number text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table imob_imports (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references imob_tenants(id) on delete cascade,
  store_id uuid references imob_stores(id) on delete set null,
  competence date not null,
  source_filename text not null,
  source_hash text,
  status text not null default 'review' check (status in ('review', 'confirmed', 'superseded')),
  imported_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  confirmed_at timestamptz,
  unique (tenant_id, store_id, competence, status) deferrable initially immediate
);

create table imob_monthly_leases (
  id uuid primary key default gen_random_uuid(),
  import_id uuid not null references imob_imports(id) on delete cascade,
  tenant_id uuid not null references imob_tenants(id) on delete cascade,
  owner_id uuid not null references imob_owners(id),
  property_id uuid references imob_properties(id),
  renter_id uuid references imob_renters(id),
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
  selected_for_receipt boolean not null default true,
  created_at timestamptz not null default now()
);

create table imob_receipts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references imob_tenants(id) on delete cascade,
  monthly_lease_id uuid not null unique references imob_monthly_leases(id) on delete cascade,
  generated_by uuid references auth.users(id),
  generated_at timestamptz not null default now(),
  filename text not null,
  document_html text not null
);

create function imob_current_tenant_id()
returns uuid language sql security definer stable set search_path = public as $$
  select tenant_id from imob_memberships
  where user_id = auth.uid() and active = true
  order by created_at limit 1
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

create policy "imob tenant members" on imob_tenants for all using (id = imob_current_tenant_id()) with check (id = imob_current_tenant_id());
create policy "imob stores members" on imob_stores for all using (tenant_id = imob_current_tenant_id()) with check (tenant_id = imob_current_tenant_id());
create policy "imob memberships own" on imob_memberships for select using (user_id = auth.uid());
create policy "imob settings members" on imob_company_settings for all using (tenant_id = imob_current_tenant_id()) with check (tenant_id = imob_current_tenant_id());
create policy "imob owners members" on imob_owners for all using (tenant_id = imob_current_tenant_id()) with check (tenant_id = imob_current_tenant_id());
create policy "imob renters members" on imob_renters for all using (tenant_id = imob_current_tenant_id()) with check (tenant_id = imob_current_tenant_id());
create policy "imob properties members" on imob_properties for all using (tenant_id = imob_current_tenant_id()) with check (tenant_id = imob_current_tenant_id());
create policy "imob leases members" on imob_leases for all using (tenant_id = imob_current_tenant_id()) with check (tenant_id = imob_current_tenant_id());
create policy "imob imports members" on imob_imports for all using (tenant_id = imob_current_tenant_id()) with check (tenant_id = imob_current_tenant_id());
create policy "imob monthly leases members" on imob_monthly_leases for all using (tenant_id = imob_current_tenant_id()) with check (tenant_id = imob_current_tenant_id());
create policy "imob receipts members" on imob_receipts for all using (tenant_id = imob_current_tenant_id()) with check (tenant_id = imob_current_tenant_id());
