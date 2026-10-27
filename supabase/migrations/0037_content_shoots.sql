-- Content shoots: scheduled per client, one-off or repeating. Clients see their upcoming
-- shoots in the portal; each shoot makes planning tasks for the account manager.
create table if not exists content_shoots (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references agencies on delete cascade,
  client_id uuid not null references clients on delete cascade,
  shoot_date date not null,
  start_time text,                 -- "10:00", wall clock in the agency's time zone
  location text,
  details text,                    -- shown to the client
  repeat text check (repeat in ('monthly', 'every_2_months', 'quarterly', 'every_6_months', 'yearly')),
  series_id uuid,                  -- the first shoot of a repeating series
  status text not null default 'scheduled' check (status in ('scheduled', 'cancelled')),
  created_by uuid references auth.users,
  created_at timestamptz not null default now()
);
create index if not exists content_shoots_client_date on content_shoots (client_id, shoot_date);
create index if not exists content_shoots_series on content_shoots (series_id);
alter table content_shoots enable row level security;

-- The client's team and admins see them, and so does the client; people who can edit the client manage them.
drop policy if exists shoots_read on content_shoots;
create policy shoots_read on content_shoots for select using (is_client_staff(client_id) or is_client_user(client_id));
drop policy if exists shoots_write on content_shoots;
create policy shoots_write on content_shoots for all using (can_edit_client(client_id)) with check (can_edit_client(client_id));

-- Planning tasks belong to their shoot (moved with it, removed if it's cancelled).
alter table tasks add column if not exists shoot_id uuid references content_shoots on delete cascade;
create index if not exists tasks_shoot on tasks (shoot_id);
