-- In-app notifications (bell + pop-ups), client logos, and Drive sync for task files.

create table if not exists notifications (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references agencies on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  client_id uuid references clients on delete cascade,
  kind text not null,          -- message, task, approval
  title text not null,
  body text,
  link text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists notifications_user_idx on notifications (user_id, created_at desc);
alter table notifications enable row level security;
drop policy if exists notifications_own_read on notifications;
create policy notifications_own_read on notifications for select using (user_id = auth.uid());
drop policy if exists notifications_own_update on notifications;
create policy notifications_own_update on notifications for update using (user_id = auth.uid());
-- Pop-ups: stream new notifications to the signed-in person.
do $$ begin
  alter publication supabase_realtime add table notifications;
exception when duplicate_object then null; end $$;

-- Client logos (public: they're shown on the client's portal).
alter table clients add column if not exists logo_path text;
insert into storage.buckets (id, name, public) values ('logos', 'logos', true) on conflict (id) do nothing;
drop policy if exists "logos readable" on storage.objects;
create policy "logos readable" on storage.objects for select using (bucket_id = 'logos');
drop policy if exists "editors upload logos" on storage.objects;
create policy "editors upload logos" on storage.objects for insert with check (
  bucket_id = 'logos' and can_edit_client(((storage.foldername(name))[2])::uuid)
);

-- Files clients attach when finishing a task are uploads too, so they sync to Drive.
alter table uploads drop constraint if exists uploads_kind_check;
alter table uploads add constraint uploads_kind_check check (kind in ('branding', 'content', 'task'));
