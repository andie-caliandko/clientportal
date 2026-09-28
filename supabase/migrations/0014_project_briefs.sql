-- Project briefs: internal documents per client for the team (never clients).
create table if not exists client_briefs (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references agencies on delete cascade,
  client_id uuid not null references clients on delete cascade,
  title text not null,
  notes text,
  url text,
  file_path text,
  file_name text,
  created_by uuid references auth.users,
  created_at timestamptz not null default now(),
  check (url is not null or file_path is not null)
);
create index if not exists client_briefs_client on client_briefs (client_id, created_at desc);
alter table client_briefs enable row level security;

-- Team on the account (and admins) can read; anyone who can edit the client can change them.
drop policy if exists briefs_read on client_briefs;
create policy briefs_read on client_briefs for select using (is_client_staff(client_id));
drop policy if exists briefs_write on client_briefs;
create policy briefs_write on client_briefs for all using (can_edit_client(client_id)) with check (can_edit_client(client_id));

-- Brief files live at briefs/<agency id>/<client id>/<file>.
insert into storage.buckets (id, name, public) values ('briefs', 'briefs', false) on conflict (id) do nothing;
drop policy if exists "team reads briefs" on storage.objects;
create policy "team reads briefs" on storage.objects for select using (
  bucket_id = 'briefs' and is_client_staff(((storage.foldername(name))[2])::uuid)
);
drop policy if exists "editors upload briefs" on storage.objects;
create policy "editors upload briefs" on storage.objects for insert with check (
  bucket_id = 'briefs' and can_edit_client(((storage.foldername(name))[2])::uuid)
);
drop policy if exists "editors delete briefs" on storage.objects;
create policy "editors delete briefs" on storage.objects for delete using (
  bucket_id = 'briefs' and can_edit_client(((storage.foldername(name))[2])::uuid)
);
