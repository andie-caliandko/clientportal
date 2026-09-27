-- Client portal: multi-agency schema.
-- Every row belongs to an agency. Row-level security keeps agencies apart.
--
-- Team roles:
--   admin            every client; can change or delete anything, manage the team
--   account_manager  only clients they're added to (client_team); can make changes there
--   creator          only clients they're added to; view only
-- Client contacts see their own portal and, of the team, only their account manager.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Agencies and people
-- ---------------------------------------------------------------------------

create table agencies (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  portal_domain text unique,               -- e.g. clients.cali-ko.com
  brand jsonb not null default '{}'::jsonb, -- colors, fonts, logos
  timezone text not null default 'America/New_York',
  approval_window_hours int not null default 48,
  approval_skip_weekends boolean not null default true,
  notify_emails text[] not null default '{}', -- who hears about client activity
  monthly_rhythm jsonb not null default '[]'::jsonb, -- week-by-week team checklist shown above Tasks
  new_client_tasks jsonb not null default '[]'::jsonb, -- team tasks created for every new client
  plan text not null default 'founding',
  created_at timestamptz not null default now()
);

create table agency_members (
  agency_id uuid not null references agencies on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  role text not null check (role in ('admin', 'account_manager', 'creator')),
  display_name text not null,
  title text,
  email text not null,
  primary key (agency_id, user_id)
);

create table clients (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references agencies on delete cascade,
  name text not null,
  slug text not null,
  account_manager_id uuid references auth.users on delete set null,
  slack_channel_id text,
  drive_folder_id text,
  rella_space_url text,
  dubsado_email text,          -- the client's email in Dubsado, used to match signed contracts
  dubsado_project_url text,
  website text,
  start_date date,
  created_at timestamptz not null default now(),
  unique (agency_id, slug)
);

-- Which teammates (account managers and creators) are on which client. Admins
-- don't need rows here; they see every client.
create table client_team (
  client_id uuid not null references clients on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  added_at timestamptz not null default now(),
  primary key (client_id, user_id)
);

-- The account manager is always on the client's team.
create function add_account_manager_to_team() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.account_manager_id is not null then
    insert into client_team (client_id, user_id) values (new.id, new.account_manager_id)
    on conflict do nothing;
  end if;
  return new;
end $$;

create trigger account_manager_on_team after insert or update of account_manager_id on clients
  for each row execute function add_account_manager_to_team();

create table client_users (
  client_id uuid not null references clients on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  role text not null default 'member' check (role in ('owner', 'member')),
  display_name text not null,
  email text not null,
  created_at timestamptz not null default now(),
  primary key (client_id, user_id)
);

-- A client has an owner plus at most one extra person.
create function enforce_client_user_limit() returns trigger
language plpgsql as $$
begin
  if (select count(*) from client_users where client_id = new.client_id) >= 2 then
    raise exception 'A client portal can have at most 2 people';
  end if;
  return new;
end $$;

create trigger client_user_limit before insert on client_users
  for each row execute function enforce_client_user_limit();

-- ---------------------------------------------------------------------------
-- Access helpers (security definer so policies can call them without recursion)
-- ---------------------------------------------------------------------------

create function is_agency_member(a uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from agency_members where agency_id = a and user_id = auth.uid())
$$;

create function is_agency_admin(a uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from agency_members
    where agency_id = a and user_id = auth.uid() and role = 'admin'
  )
$$;

-- Admins and account managers can make changes; creators can't.
create function is_agency_editor(a uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from agency_members
    where agency_id = a and user_id = auth.uid() and role in ('admin', 'account_manager')
  )
$$;

create function is_client_user(c uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from client_users where client_id = c and user_id = auth.uid())
$$;

-- Team member who can see this client: an admin, or anyone added to its team.
create function is_client_staff(c uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from clients cl
    join agency_members m on m.agency_id = cl.agency_id and m.user_id = auth.uid()
    where cl.id = c
      and (m.role = 'admin' or exists (select 1 from client_team t where t.client_id = c and t.user_id = auth.uid()))
  )
$$;

-- Team member who can change this client: an admin, or an account manager on its team.
create function can_edit_client(c uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from clients cl
    join agency_members m on m.agency_id = cl.agency_id and m.user_id = auth.uid()
    where cl.id = c
      and (m.role = 'admin'
        or (m.role = 'account_manager' and exists (select 1 from client_team t where t.client_id = c and t.user_id = auth.uid())))
  )
$$;

create function can_see_client(c uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select is_client_staff(c) or is_client_user(c)
$$;

-- ---------------------------------------------------------------------------
-- Onboarding
-- ---------------------------------------------------------------------------

create table onboarding_steps (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references agencies on delete cascade,
  position int not null,
  kind text not null check (kind in ('contract', 'questionnaire', 'upload_branding', 'upload_content', 'booking', 'custom')),
  title text not null,
  help text not null default '',
  action_label text not null default 'Start',
  action_url text,                      -- booking page, contract link, etc.
  unique (agency_id, position)
);

create table client_step_status (
  client_id uuid not null references clients on delete cascade,
  step_id uuid not null references onboarding_steps on delete cascade,
  completed_at timestamptz not null default now(),
  completed_by uuid references auth.users,
  primary key (client_id, step_id)
);

create table questions (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references agencies on delete cascade,
  position int not null,
  prompt text not null,
  hint text not null default '',
  required boolean not null default true,
  unique (agency_id, position)
);

create table answers (
  client_id uuid not null references clients on delete cascade,
  question_id uuid not null references questions on delete cascade,
  body text not null default '',
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users,
  primary key (client_id, question_id)
);

create table uploads (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references agencies on delete cascade,
  client_id uuid not null references clients on delete cascade,
  kind text not null check (kind in ('branding', 'content')),
  file_name text not null,
  storage_path text not null,
  drive_file_id text,                   -- filled in once copied to Google Drive
  created_by uuid references auth.users,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Strategy, reports and content calendars
-- ---------------------------------------------------------------------------

create table documents (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references agencies on delete cascade,
  client_id uuid not null references clients on delete cascade,
  kind text not null check (kind in ('strategy', 'report')),
  title text not null,
  storage_path text not null,
  created_by uuid references auth.users,
  created_at timestamptz not null default now()
);

create table content_calendars (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references agencies on delete cascade,
  client_id uuid not null references clients on delete cascade,
  month date not null,                  -- first day of the month it covers
  rella_url text not null,
  sent_at timestamptz not null default now(),
  due_at timestamptz not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'auto_approved')),
  resolved_at timestamptz,
  reminder_sent_at timestamptz,
  created_by uuid references auth.users
);

-- Clients approve through this function so they can only flip pending -> approved.
create function approve_calendar(cal uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  update content_calendars
     set status = 'approved', resolved_at = now()
   where id = cal and status = 'pending' and (is_client_user(client_id) or can_edit_client(client_id));
end $$;

-- ---------------------------------------------------------------------------
-- Messages and tasks
-- ---------------------------------------------------------------------------

create table messages (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references agencies on delete cascade,
  client_id uuid not null references clients on delete cascade,
  author_id uuid references auth.users,
  author_name text not null,
  author_kind text not null check (author_kind in ('client', 'team')),
  body text not null,
  source text not null default 'portal' check (source in ('portal', 'slack')),
  slack_ts text unique,
  created_at timestamptz not null default now()
);

create table tasks (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references agencies on delete cascade,
  client_id uuid references clients on delete cascade,
  title text not null,
  source text not null default 'manual', -- manual, portal, slack, rella, dubsado, calendar, drive
  status text not null default 'todo' check (status in ('todo', 'doing', 'waiting', 'done')),
  assignee_id uuid references auth.users on delete set null,        -- a teammate, or
  client_assignee_id uuid references auth.users on delete set null, -- a client contact
  note text,
  due_at timestamptz,
  auto boolean not null default false,
  created_by uuid references auth.users,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  completed_by uuid references auth.users,
  completion_comment text,
  completion_file_path text,
  reminders_sent int not null default 0,  -- client reminders sent: 2 days, 5 days, 1 week overdue
  check (assignee_id is null or client_assignee_id is null),
  check (client_assignee_id is null or client_id is not null)
);

-- Clients finish their tasks through this function, so they can only mark
-- their own client's tasks done and add a comment or file.
create function complete_client_task(task uuid, comment text, file_path text) returns void
language plpgsql security definer set search_path = public as $$
begin
  update tasks
     set status = 'done',
         completed_at = now(),
         completed_by = auth.uid(),
         completion_comment = nullif(trim(comment), ''),
         completion_file_path = file_path
   where id = task
     and client_assignee_id is not null
     and status <> 'done'
     and is_client_user(client_id)
     and (file_path is null or split_part(file_path, '/', 2) = client_id::text);
end $$;

-- Connected accounts (Google, etc). Holds secrets, so there are no row-level
-- policies: only the server, using the service key, can read or write it.
create table agency_integrations (
  agency_id uuid primary key references agencies on delete cascade,
  google_email text,
  google_refresh_token text,
  deadlines_calendar_id text,    -- e.g. the "C&K Due Dates" calendar
  deadlines_calendar_name text,
  updated_at timestamptz not null default now()
);

-- Each teammate's own check-offs on the monthly rhythm. Personal: people see
-- their own, and admins see everyone's progress.
create table rhythm_checks (
  agency_id uuid not null references agencies on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  month date not null,   -- first day of the month
  week int not null check (week between 1 and 4),
  item int not null,
  checked_at timestamptz not null default now(),
  primary key (agency_id, user_id, month, week, item)
);

-- ---------------------------------------------------------------------------
-- Internal account health (never visible to clients)
-- ---------------------------------------------------------------------------

create table kpis (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references agencies on delete cascade,
  client_id uuid not null references clients on delete cascade,
  name text not null,
  unit text not null default 'number' check (unit in ('number', 'percent', 'currency')),
  higher_is_better boolean not null default true,
  good numeric not null,
  better numeric not null,
  best numeric not null,
  benchmark text,                        -- industry standard, for reference
  position int not null default 0,
  created_at timestamptz not null default now(),
  check (case when higher_is_better then good <= better and better <= best else good >= better and better >= best end)
);

-- One reading per KPI per week (week = that week's Monday).
create table kpi_entries (
  kpi_id uuid not null references kpis on delete cascade,
  client_id uuid not null references clients on delete cascade,
  week date not null,
  value numeric not null,
  entered_by uuid references auth.users,
  entered_at timestamptz not null default now(),
  primary key (kpi_id, week)
);

create table scorecard_notes (
  client_id uuid not null references clients on delete cascade,
  week date not null,
  note text not null,
  updated_by uuid references auth.users,
  updated_at timestamptz not null default now(),
  primary key (client_id, week)
);

create index on clients (agency_id);
create index on client_team (user_id);
create index on kpis (client_id, position);
create index on kpi_entries (client_id, week);
create index on messages (client_id, created_at);
create index on tasks (agency_id, status);
create index on content_calendars (status, due_at);
create index on documents (client_id, kind);

-- ---------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------

alter table agencies enable row level security;
alter table agency_members enable row level security;
alter table clients enable row level security;
alter table client_users enable row level security;
alter table client_team enable row level security;
alter table onboarding_steps enable row level security;
alter table client_step_status enable row level security;
alter table questions enable row level security;
alter table answers enable row level security;
alter table uploads enable row level security;
alter table documents enable row level security;
alter table content_calendars enable row level security;
alter table messages enable row level security;
alter table tasks enable row level security;
alter table rhythm_checks enable row level security;
alter table agency_integrations enable row level security;
alter table kpis enable row level security;
alter table kpi_entries enable row level security;
alter table scorecard_notes enable row level security;

-- Agencies: members and their clients can read their agency.
create policy agency_read on agencies for select using (
  is_agency_member(id)
  or exists (select 1 from clients c where c.agency_id = agencies.id and is_client_user(c.id))
);
create policy agency_admin_update on agencies for update using (is_agency_admin(id));

-- Team sees the whole team. Clients see only their own account manager.
create policy members_read on agency_members for select using (
  is_agency_member(agency_id)
  or exists (select 1 from clients c where c.account_manager_id = agency_members.user_id and is_client_user(c.id))
);
create policy members_admin_write on agency_members for all
  using (is_agency_admin(agency_id)) with check (is_agency_admin(agency_id));

create policy clients_read on clients for select using (can_see_client(id));
create policy clients_admin_write on clients for all
  using (is_agency_admin(agency_id)) with check (is_agency_admin(agency_id));

create policy client_team_read on client_team for select using (is_client_staff(client_id));
create policy client_team_admin_write on client_team for all
  using (exists (select 1 from clients c where c.id = client_id and is_agency_admin(c.agency_id)))
  with check (exists (select 1 from clients c where c.id = client_id and is_agency_admin(c.agency_id)));

create policy client_users_read on client_users for select using (can_see_client(client_id));
create policy client_users_staff_write on client_users for all
  using (can_edit_client(client_id)) with check (can_edit_client(client_id));

-- Agency templates: readable by the agency's team and clients, editable by admins.
create policy steps_read on onboarding_steps for select using (
  is_agency_member(agency_id)
  or exists (select 1 from clients c where c.agency_id = onboarding_steps.agency_id and is_client_user(c.id))
);
create policy steps_admin_write on onboarding_steps for all
  using (is_agency_admin(agency_id)) with check (is_agency_admin(agency_id));

create policy questions_read on questions for select using (
  is_agency_member(agency_id)
  or exists (select 1 from clients c where c.agency_id = questions.agency_id and is_client_user(c.id))
);
create policy questions_admin_write on questions for all
  using (is_agency_admin(agency_id)) with check (is_agency_admin(agency_id));

-- Client-scoped data: everyone who can see the client can read it. Client
-- contacts and editors (admins, account managers) can add to it; creators can't.
create policy step_status_read on client_step_status for select using (can_see_client(client_id));
create policy step_status_insert on client_step_status for insert with check (is_client_user(client_id) or can_edit_client(client_id));
create policy step_status_staff_delete on client_step_status for delete using (can_edit_client(client_id));

create policy answers_read on answers for select using (can_see_client(client_id));
create policy answers_write on answers for insert with check (is_client_user(client_id) or can_edit_client(client_id));
create policy answers_update on answers for update using (is_client_user(client_id) or can_edit_client(client_id));

create policy uploads_read on uploads for select using (can_see_client(client_id));
create policy uploads_insert on uploads for insert with check (is_client_user(client_id) or can_edit_client(client_id));
create policy uploads_delete on uploads for delete using (can_edit_client(client_id));

create policy documents_read on documents for select using (can_see_client(client_id));
create policy documents_staff_write on documents for all
  using (can_edit_client(client_id)) with check (can_edit_client(client_id));

create policy calendars_read on content_calendars for select using (can_see_client(client_id));
create policy calendars_staff_write on content_calendars for all
  using (can_edit_client(client_id)) with check (can_edit_client(client_id));

create policy messages_read on messages for select using (can_see_client(client_id));
create policy messages_insert on messages for insert with check (
  (author_kind = 'client' and author_id = auth.uid() and is_client_user(client_id))
  or (author_kind = 'team' and can_edit_client(client_id))
);

-- Team tasks are internal; tasks assigned to a client contact are also visible
-- in that client's portal. Creators can see tasks on their clients but not change them.
create policy tasks_read on tasks for select using (
  (is_agency_member(agency_id) and (client_id is null or is_client_staff(client_id)))
  or (client_assignee_id is not null and is_client_user(client_id))
);
create policy tasks_write on tasks for all
  using (is_agency_editor(agency_id) and (client_id is null or can_edit_client(client_id)))
  with check (is_agency_editor(agency_id) and (client_id is null or can_edit_client(client_id)));

create policy rhythm_read on rhythm_checks for select using (
  (user_id = auth.uid() and is_agency_member(agency_id)) or is_agency_admin(agency_id)
);
create policy rhythm_write_own on rhythm_checks for all
  using (user_id = auth.uid() and is_agency_member(agency_id))
  with check (user_id = auth.uid() and is_agency_member(agency_id));

-- Account health is team-only: no client policies at all.
create policy kpis_read on kpis for select using (is_client_staff(client_id));
create policy kpis_write on kpis for all using (can_edit_client(client_id)) with check (can_edit_client(client_id));
create policy kpi_entries_read on kpi_entries for select using (is_client_staff(client_id));
create policy kpi_entries_write on kpi_entries for all using (can_edit_client(client_id)) with check (can_edit_client(client_id));
create policy scorecard_notes_read on scorecard_notes for select using (is_client_staff(client_id));
create policy scorecard_notes_write on scorecard_notes for all using (can_edit_client(client_id)) with check (can_edit_client(client_id));

-- ---------------------------------------------------------------------------
-- Storage: private buckets, files stored under <agency_id>/<client_id>/...
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public) values
  ('documents', 'documents', false),
  ('uploads', 'uploads', false)
on conflict (id) do nothing;

create policy "client files readable" on storage.objects for select using (
  bucket_id in ('documents', 'uploads')
  and can_see_client(((storage.foldername(name))[2])::uuid)
);
create policy "clients upload their files" on storage.objects for insert with check (
  bucket_id = 'uploads' and can_see_client(((storage.foldername(name))[2])::uuid)
);
create policy "staff upload documents" on storage.objects for insert with check (
  bucket_id = 'documents' and can_edit_client(((storage.foldername(name))[2])::uuid)
);
create policy "editors remove files" on storage.objects for delete using (
  bucket_id in ('documents', 'uploads') and can_edit_client(((storage.foldername(name))[2])::uuid)
);
