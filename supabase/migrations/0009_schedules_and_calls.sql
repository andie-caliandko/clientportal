-- Each teammate's own Google Calendar connection, their bookable hours, and
-- "pick a time" call requests the team sends to clients.

-- Tokens are only ever read on the server with the service key, so there are
-- deliberately no read policies here.
create table if not exists member_google (
  user_id uuid primary key references auth.users on delete cascade,
  agency_id uuid not null references agencies on delete cascade,
  google_email text,
  refresh_token text not null,
  connected_at timestamptz not null default now()
);
alter table member_google enable row level security;

-- Hours clients can book with each person (agency time zone). Days: 0 = Sunday … 6 = Saturday.
alter table agency_members add column if not exists book_start smallint not null default 9;
alter table agency_members add column if not exists book_end smallint not null default 17;
alter table agency_members add column if not exists book_days smallint[] not null default '{1,2,3,4,5}';

create table if not exists call_requests (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references agencies on delete cascade,
  client_id uuid not null references clients on delete cascade,
  host_id uuid not null references auth.users,
  title text not null,
  note text,
  duration_min smallint not null default 30 check (duration_min between 15 and 180),
  window_start date not null,
  window_end date not null,
  status text not null default 'open' check (status in ('open', 'booked', 'cancelled')),
  event_id text,
  event_start timestamptz,
  event_end timestamptz,
  meet_link text,
  booked_by uuid references auth.users,
  booked_at timestamptz,
  created_by uuid references auth.users,
  created_at timestamptz not null default now()
);
create index if not exists call_requests_client on call_requests (client_id, status);
alter table call_requests enable row level security;

drop policy if exists call_requests_read on call_requests;
create policy call_requests_read on call_requests for select using (can_see_client(client_id));
drop policy if exists call_requests_team_write on call_requests;
create policy call_requests_team_write on call_requests for all
  using (can_edit_client(client_id)) with check (can_edit_client(client_id));
