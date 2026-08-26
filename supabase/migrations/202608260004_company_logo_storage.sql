-- Logo da imobiliaria: arquivo no Storage e apenas o caminho salvo no tenant.

alter table imob_company_settings
  add column if not exists logo_path text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'imob-logos',
  'imob-logos',
  true,
  5242880,
  array['image/png', 'image/jpeg', 'image/webp']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "imob logos public read" on storage.objects;
drop policy if exists "imob logos managers insert" on storage.objects;
drop policy if exists "imob logos managers delete" on storage.objects;

create policy "imob logos public read"
on storage.objects for select
using (bucket_id = 'imob-logos');

create policy "imob logos managers insert"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'imob-logos'
  and exists (
    select 1
    from imob_memberships
    where user_id = auth.uid()
      and active = true
      and role in ('admin', 'manager')
      and tenant_id::text = (storage.foldername(name))[1]
  )
);

create policy "imob logos managers delete"
on storage.objects for delete to authenticated
using (
  bucket_id = 'imob-logos'
  and exists (
    select 1
    from imob_memberships
    where user_id = auth.uid()
      and active = true
      and role in ('admin', 'manager')
      and tenant_id::text = (storage.foldername(name))[1]
  )
);
