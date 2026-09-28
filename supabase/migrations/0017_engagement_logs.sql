-- Daily engagement: what the account manager did on each account, each day.
create table if not exists engagement_logs (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references agencies on delete cascade,
  client_id uuid not null references clients on delete cascade,
  day date not null,
  actions text[] not null default '{}',
  links text[] not null default '{}',
  note text,
  logged_by uuid references auth.users,
  updated_at timestamptz not null default now(),
  unique (client_id, day)
);
create index if not exists engagement_logs_agency_day on engagement_logs (agency_id, day);
alter table engagement_logs enable row level security;

-- Internal only: the team on the account (and admins) can see; those who can edit the client can log.
drop policy if exists engagement_read on engagement_logs;
create policy engagement_read on engagement_logs for select using (is_client_staff(client_id));
drop policy if exists engagement_write on engagement_logs;
create policy engagement_write on engagement_logs for all using (can_edit_client(client_id)) with check (can_edit_client(client_id));
