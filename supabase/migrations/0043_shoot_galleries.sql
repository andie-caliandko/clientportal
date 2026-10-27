-- Content shoot galleries: the team uploads photos and videos to the portal, sends the gallery,
-- and the client views, favorites and downloads them. Each file is also copied to the shoot's Drive folder.
alter table content_shoots add column if not exists gallery_sent_at timestamptz;
alter table content_shoots add column if not exists gallery_cover_id uuid;

create table if not exists shoot_gallery_items (
  id uuid primary key default gen_random_uuid(),
  shoot_id uuid not null references content_shoots on delete cascade,
  client_id uuid not null references clients on delete cascade,
  file_path text not null,
  thumb_path text,                 -- a small preview made in the browser when it's uploaded
  file_name text not null,
  mime text,
  size bigint,
  width int,
  height int,
  position int not null default 0,
  favorite boolean not null default false,   -- the client's picks
  drive_status text not null default 'pending' check (drive_status in ('pending', 'done', 'skipped')),
  drive_file_id text,
  created_by uuid references auth.users,
  created_at timestamptz not null default now()
);
create index if not exists shoot_gallery_items_shoot on shoot_gallery_items (shoot_id, position);
alter table shoot_gallery_items enable row level security;
-- The team manages them. Clients only reach them through the portal once the gallery's been sent.
drop policy if exists gallery_team on shoot_gallery_items;
create policy gallery_team on shoot_gallery_items for all using (is_client_staff(client_id)) with check (is_client_staff(client_id));

-- Files live under <agency>/<client>/<shoot>/...; the team uploads, clients get short-lived links from the server.
insert into storage.buckets (id, name, public) values ('galleries', 'galleries', false) on conflict (id) do nothing;
drop policy if exists "team reads galleries" on storage.objects;
create policy "team reads galleries" on storage.objects for select using (
  bucket_id = 'galleries' and is_client_staff(((storage.foldername(name))[2])::uuid)
);
drop policy if exists "team uploads galleries" on storage.objects;
create policy "team uploads galleries" on storage.objects for insert with check (
  bucket_id = 'galleries' and is_client_staff(((storage.foldername(name))[2])::uuid)
);
drop policy if exists "team deletes galleries" on storage.objects;
create policy "team deletes galleries" on storage.objects for delete using (
  bucket_id = 'galleries' and is_client_staff(((storage.foldername(name))[2])::uuid)
);

-- A copy to Drive is claimed first so two runs never copy the same file twice.
alter table shoot_gallery_items add column if not exists drive_claimed_at timestamptz;
alter table shoot_gallery_items drop constraint if exists shoot_gallery_items_drive_status_check;
alter table shoot_gallery_items add constraint shoot_gallery_items_drive_status_check check (drive_status in ('pending', 'copying', 'done', 'skipped'));
