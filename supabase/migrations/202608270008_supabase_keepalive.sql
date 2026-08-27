-- Mantém o banco ativo mesmo durante os períodos de pouco uso da aplicação.
-- O pg_cron executa uma consulta local, sem depender de sessão de usuário,
-- Edge Function ou chamada HTTP externa.

create extension if not exists pg_cron with schema pg_catalog;

create or replace function public.imob_keepalive()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform 1;
end;
$$;

revoke all on function public.imob_keepalive() from public;

do $$
declare
  v_job_id bigint;
begin
  -- Permite reaplicar a migration sem criar jobs duplicados.
  select jobid into v_job_id
  from cron.job
  where jobname = 'imob-keepalive';

  if v_job_id is not null then
    perform cron.unschedule(v_job_id);
  end if;

  -- A expressão */5 representa os dias 1, 6, 11, 16, 21, 26 e 31 de cada
  -- mês. Para o objetivo de evitar inatividade, esse intervalo é suficiente
  -- e o job executa sempre às 03:00 (horário do servidor do Supabase).
  perform cron.schedule(
    'imob-keepalive',
    '0 3 */5 * *',
    'select public.imob_keepalive();'
  );
end;
$$;
