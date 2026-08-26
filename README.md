# ImobRecibos

Sistema mensal de importação de locações, revisão de alterações e geração de recibos por imóvel.

## Início

1. Copie as variáveis do Supabase para `.env.local` (o ambiente inicial usa as mesmas credenciais do `nftoledo`).
2. Execute a migration em `supabase/migrations/202608260001_imobiliaria_multitenant.sql` no Supabase.
3. Crie uma organização, filial e associação do usuário autenticado em `imob_organizations`, `imob_stores` e `imob_memberships`.
4. Execute `npm install` e `npm run dev`.

O domínio da imobiliária usa tabelas com prefixo `imob_`, preservando as tabelas e o gatilho de autenticação já usados pelo `nftoledo`.
