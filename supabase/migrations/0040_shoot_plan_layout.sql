-- Shoot plans get the full layout: overview, setups (each with its own shot table),
-- locations, optional models and the day's schedule, all kept together as one document.
alter table shoot_plans add column if not exists content jsonb not null default '{}';
alter table shoot_plan_shares add column if not exists content jsonb not null default '{}';

-- Signed model waivers. Team only: clients never see these files.
create table if not exists shoot_waivers (
  id uuid primary key default gen_random_uuid(),
  shoot_id uuid not null references content_shoots on delete cascade,
  client_id uuid not null references clients on delete cascade,
  model_id text,                    -- the model in the plan it belongs to
  file_path text not null,
  file_name text not null,
  uploaded_by uuid references auth.users,
  created_at timestamptz not null default now()
);
create index if not exists shoot_waivers_shoot on shoot_waivers (shoot_id);
alter table shoot_waivers enable row level security;
drop policy if exists shoot_waivers_team on shoot_waivers;
create policy shoot_waivers_team on shoot_waivers for all using (is_client_staff(client_id)) with check (is_client_staff(client_id));

-- Files live under <agency>/<client>/<shoot>/...
insert into storage.buckets (id, name, public) values ('waivers', 'waivers', false) on conflict (id) do nothing;
drop policy if exists "team reads waivers" on storage.objects;
create policy "team reads waivers" on storage.objects for select using (
  bucket_id = 'waivers' and is_client_staff(((storage.foldername(name))[2])::uuid)
);
drop policy if exists "team uploads waivers" on storage.objects;
create policy "team uploads waivers" on storage.objects for insert with check (
  bucket_id = 'waivers' and is_client_staff(((storage.foldername(name))[2])::uuid)
);
drop policy if exists "team deletes waivers" on storage.objects;
create policy "team deletes waivers" on storage.objects for delete using (
  bucket_id = 'waivers' and is_client_staff(((storage.foldername(name))[2])::uuid)
);
