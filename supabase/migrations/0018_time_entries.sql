-- Time tracker: what each teammate spent time on, by client (or internal work).
create table if not exists time_entries (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references agencies on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  client_id uuid references clients on delete set null,
  description text not null default '',
  started_at timestamptz not null,
  ended_at timestamptz,
  created_at timestamptz not null default now(),
  check (ended_at is null or ended_at >= started_at)
);
create index if not exists time_entries_agency_start on time_entries (agency_id, started_at);
create index if not exists time_entries_user_start on time_entries (user_id, started_at);
-- One running timer per person.
create unique index if not exists time_entries_one_running on time_entries (user_id) where ended_at is null;
alter table time_entries enable row level security;

-- Everyone sees and changes their own time; admins see and change everyone's.
drop policy if exists time_read on time_entries;
create policy time_read on time_entries for select using (user_id = auth.uid() or is_agency_admin(agency_id));
drop policy if exists time_write on time_entries;
create policy time_write on time_entries for all
  using ((user_id = auth.uid() and is_agency_member(agency_id)) or is_agency_admin(agency_id))
  with check ((user_id = auth.uid() and is_agency_member(agency_id)) or is_agency_admin(agency_id));
