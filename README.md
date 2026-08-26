# ImobRecibos

Sistema mensal de importação de locações, revisão de alterações e geração de recibos por imóvel.

## Início

1. Copie as variáveis do Supabase para `.env.local` (o ambiente inicial usa as mesmas credenciais do `nftoledo`).
2. Execute, nesta ordem, as migrations em `supabase/migrations/202608260001_imobiliaria_multitenant.sql`, `supabase/migrations/202608260002_reset_imob_domain.sql`, `supabase/migrations/202608260003_scope_auth_user_trigger.sql` e `supabase/migrations/202608260004_company_logo_storage.sql` no Supabase.
3. Crie um tenant (a imobiliária), uma store (filial) e a associação do usuário autenticado em `imob_tenants`, `imob_stores` e `imob_memberships`.
4. Execute `npm install` e `npm run dev`.

## Primeiro acesso apos a limpeza

Depois de executar a migration de reset, crie novamente a imobiliaria, sua filial
e seu vinculo de administrador. No SQL Editor do Supabase, substitua os dois
valores entre aspas e execute:

```sql
with created_tenant as (
  insert into imob_tenants (name)
  values ('NOME DA IMOBILIARIA')
  returning id
), created_store as (
  insert into imob_stores (tenant_id, store_id, name)
  select id, 'MATRIZ', 'Matriz' from created_tenant
  returning id, tenant_id
)
insert into imob_memberships (user_id, tenant_id, store_id, role)
select 'UUID_DO_USUARIO_AUTH'::uuid, tenant_id, id, 'admin'
from created_store;
```

O UUID esta em **Authentication > Users** no Supabase. Este comando cria apenas
os tres registros iniciais do dominio da imobiliaria.

O domínio da imobiliária usa tabelas com prefixo `imob_`, preservando as tabelas e o gatilho de autenticação já usados pelo `nftoledo`. Neste domínio, tenant é a imobiliária cliente do sistema, store é sua filial e renter é o locatário/inquilino.
