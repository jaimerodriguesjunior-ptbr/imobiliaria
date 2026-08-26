-- O trigger de auth.users e compartilhado pelo projeto Supabase.
-- Ele cria dados do nftoledo somente quando a origem for informada
-- explicitamente nos metadados do novo usuario.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  new_org_id uuid;
begin
  if coalesce(new.raw_user_meta_data->>'application', '') <> 'nftoledo' then
    return new;
  end if;

  insert into organizations (name)
  values (coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)))
  returning id into new_org_id;

  insert into profiles (id, organization_id, full_name)
  values (
    new.id,
    new_org_id,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1))
  );

  return new;
end;
$$;
