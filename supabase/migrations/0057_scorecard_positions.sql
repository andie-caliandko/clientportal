-- Scorecards by position: one scorecard per position (Account Manager, Director of Operations...)
-- that everyone in that position gets automatically, matched by their role or job title.
-- A person can be given a different position, or a scorecard of their own.

create table if not exists team_scorecard_templates (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references agencies on delete cascade,
  title text not null,
  mission text not null default '',
  kpis jsonb not null default '[]',
  auto_role text,          -- everyone with this team role gets it (say, account_manager)
  auto_title text,         -- or everyone whose job title includes this (say, director of op)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table team_scorecard_templates enable row level security;
drop policy if exists team_scorecard_templates_viewers on team_scorecard_templates;
create policy team_scorecard_templates_viewers on team_scorecard_templates for all using (can_see_scorecards(agency_id)) with check (can_see_scorecards(agency_id));

-- A person's row: the position picked for them (instead of the automatic match), or their own scorecard.
alter table team_scorecards add column if not exists template_id uuid references team_scorecard_templates on delete set null;
alter table team_scorecards add column if not exists custom boolean not null default false;
