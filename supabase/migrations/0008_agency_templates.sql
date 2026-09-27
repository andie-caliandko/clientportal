-- Agency templates: links and files the whole team can use. Admins manage them.
create table if not exists agency_templates (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references agencies on delete cascade,
  title text not null,
  description text,
  url text,
  file_path text,
  file_name text,
  created_by uuid references auth.users,
  created_at timestamptz not null default now(),
  check (url is not null or file_path is not null)
);
create index if not exists agency_templates_agency on agency_templates (agency_id, created_at desc);
alter table agency_templates enable row level security;

drop policy if exists templates_read on agency_templates;
create policy templates_read on agency_templates for select using (is_agency_member(agency_id));
drop policy if exists templates_admin_write on agency_templates;
create policy templates_admin_write on agency_templates for all
  using (is_agency_admin(agency_id)) with check (is_agency_admin(agency_id));

-- Template files live at templates/<agency id>/<file>.
insert into storage.buckets (id, name, public) values ('templates', 'templates', false) on conflict (id) do nothing;
drop policy if exists "team reads templates" on storage.objects;
create policy "team reads templates" on storage.objects for select using (
  bucket_id = 'templates' and is_agency_member(((storage.foldername(name))[1])::uuid)
);
drop policy if exists "admins upload templates" on storage.objects;
create policy "admins upload templates" on storage.objects for insert with check (
  bucket_id = 'templates' and is_agency_admin(((storage.foldername(name))[1])::uuid)
);
drop policy if exists "admins delete templates" on storage.objects;
create policy "admins delete templates" on storage.objects for delete using (
  bucket_id = 'templates' and is_agency_admin(((storage.foldername(name))[1])::uuid)
);
