-- CEO tracker: the owner's monthly scorecard (from their CEO dashboard spreadsheet),
-- a lead tracker and their North Star vision. Only CEO dashboard viewers can see any of it.

-- One sheet per month ("2026-11") or per vision year ("vision-2026"): the numbers typed in, as JSON.
create table if not exists ceo_sheets (
  agency_id uuid not null references agencies on delete cascade,
  key text not null,
  data jsonb not null default '{}',
  updated_at timestamptz not null default now(),
  primary key (agency_id, key)
);
alter table ceo_sheets enable row level security;
drop policy if exists ceo_sheets_ceo on ceo_sheets;
create policy ceo_sheets_ceo on ceo_sheets for all using (can_see_ceo(agency_id)) with check (can_see_ceo(agency_id));

-- Merge a few fields into a sheet in one step, so quick edits in different boxes never overwrite each other.
create or replace function ceo_sheet_patch(a uuid, k text, patch jsonb) returns void
language sql security invoker set search_path = public as $$
  insert into ceo_sheets (agency_id, key, data) values (a, k, patch)
  on conflict (agency_id, key) do update set data = ceo_sheets.data || excluded.data, updated_at = now();
$$;

-- The daily trackers: lead generation counts and habits, one number per row per day.
create table if not exists ceo_daily (
  agency_id uuid not null references agencies on delete cascade,
  day date not null,
  row_key text not null,
  value numeric not null default 0,
  primary key (agency_id, day, row_key)
);
alter table ceo_daily enable row level security;
drop policy if exists ceo_daily_ceo on ceo_daily;
create policy ceo_daily_ceo on ceo_daily for all using (can_see_ceo(agency_id)) with check (can_see_ceo(agency_id));

-- Leads: people who might become clients.
create table if not exists ceo_leads (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references agencies on delete cascade,
  name text not null default '',
  business text not null default '',
  first_contact date,
  last_contact date,
  next_contact date,
  temperature text not null default 'warm' check (temperature in ('hot', 'warm', 'cold')),
  source text not null default '',
  status text not null default 'New',
  notes text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists ceo_leads_agency on ceo_leads (agency_id);
alter table ceo_leads enable row level security;
drop policy if exists ceo_leads_ceo on ceo_leads;
create policy ceo_leads_ceo on ceo_leads for all using (can_see_ceo(agency_id)) with check (can_see_ceo(agency_id));
