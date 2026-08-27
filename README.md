# MB Imob

Sistema mensal de importação de locações, revisão de alterações e geração de recibos por imóvel.

## Início

1. Copie as variáveis do Supabase para `.env.local` (o ambiente inicial usa as mesmas credenciais do `nftoledo`).
2. Garanta que `edimar@4001.com` já exista em **Authentication > Users**.
3. Execute `supabase/migrations/202608260003_scope_auth_user_trigger.sql` caso esse ajuste compartilhado ainda não tenha sido aplicado.
4. Execute `supabase/migrations/202608260005_audit_hardening.sql`. Essa migration apaga e recria somente o domínio `imob_*`, cria o tenant e a filial 4001 e vincula o Edimar como administrador inicial.
5. Execute `npm install` e `npm run dev`.

As migrations `202608260001`, `202608260002` e `202608260004` permanecem no repositório apenas como histórico da primeira versão. Não devem ser reaplicadas depois da `202608260005`.

## Primeiro acesso apos a limpeza

Se o usuário Edimar ainda não existia quando a migration foi executada, crie-o no
Authentication e vincule-o ao tenant e à filial já criados com:

```sql
insert into imob_memberships (user_id, tenant_id, store_id, role)
select
  'UUID_DO_USUARIO_AUTH'::uuid,
  tenant.id,
  store.id,
  'admin'
from imob_tenants tenant
join imob_stores store on store.tenant_id = tenant.id
where tenant.name = '4001 - tenant' and store.store_id = '4001';
```

O UUID está em **Authentication > Users** no Supabase.

O domínio da imobiliária usa tabelas com prefixo `imob_`, preservando as tabelas e o gatilho de autenticação já usados pelo `nftoledo`. Tenant é a imobiliária cliente do sistema, store é sua filial e renter é o locatário/inquilino. Proprietários, inquilinos, imóveis, locações, importações e documentos são isolados por tenant e por store.
