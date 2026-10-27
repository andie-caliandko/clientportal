-- Content shoot plans: the team drafts a shot list, timeline and plan in private, then sends
-- it to the client. Drafts and sent copies live in separate tables so clients can never read a draft.
create table if not exists shoot_plans (
  shoot_id uuid primary key references content_shoots on delete cascade,
  client_id uuid not null references clients on delete cascade,
  overview text,                          -- goals, wardrobe, props, anything else
  shots jsonb not null default '[]',      -- [{ "text": "..." }]
  timeline jsonb not null default '[]',   -- [{ "time": "10:00", "text": "..." }]
  updated_by uuid references auth.users,
  updated_at timestamptz not null default now()
);
alter table shoot_plans enable row level security;
drop policy if exists shoot_plans_team on shoot_plans;
create policy shoot_plans_team on shoot_plans for all using (is_client_staff(client_id)) with check (is_client_staff(client_id));

-- What the client last received. Written by the server when the team clicks Send to client.
create table if not exists shoot_plan_shares (
  shoot_id uuid primary key references content_shoots on delete cascade,
  client_id uuid not null references clients on delete cascade,
  overview text,
  shots jsonb not null default '[]',
  timeline jsonb not null default '[]',
  shared_by uuid references auth.users,
  shared_at timestamptz not null default now()
);
alter table shoot_plan_shares enable row level security;
drop policy if exists shoot_plan_shares_read on shoot_plan_shares;
create policy shoot_plan_shares_read on shoot_plan_shares for select using (is_client_staff(client_id) or is_client_user(client_id));
