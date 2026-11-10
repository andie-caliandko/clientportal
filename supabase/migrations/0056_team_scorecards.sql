-- Team scorecards: each teammate's mission and KPIs (with targets by quarter), and what they hit
-- each month. Only the owner sees them, plus any admins the owner shares them with.

alter table agencies add column if not exists scorecards_shared_with uuid[] not null default '{}';

create or replace function can_see_scorecards(a uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from agencies g
    where g.id = a and (g.owner_id = auth.uid() or (auth.uid() = any(g.scorecards_shared_with) and is_agency_admin(a)))
  )
$$;

create table if not exists team_scorecards (
  agency_id uuid not null references agencies on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  role_title text not null default '',
  mission text not null default '',
  kpis jsonb not null default '[]',
  updated_at timestamptz not null default now(),
  primary key (agency_id, user_id)
);

create table if not exists team_scorecard_months (
  agency_id uuid not null references agencies on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  month text not null check (month ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  "values" jsonb not null default '{}',
  note text not null default '',
  updated_at timestamptz not null default now(),
  primary key (agency_id, user_id, month)
);

alter table team_scorecards enable row level security;
alter table team_scorecard_months enable row level security;
drop policy if exists team_scorecards_viewers on team_scorecards;
create policy team_scorecards_viewers on team_scorecards for all using (can_see_scorecards(agency_id)) with check (can_see_scorecards(agency_id));
drop policy if exists team_scorecard_months_viewers on team_scorecard_months;
create policy team_scorecard_months_viewers on team_scorecard_months for all using (can_see_scorecards(agency_id)) with check (can_see_scorecards(agency_id));
