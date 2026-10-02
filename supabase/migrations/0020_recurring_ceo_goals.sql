-- Recurring tasks, the CEO dashboard (billing and invoices), and team goals.

-- Recurring tasks: when one is finished, the next is made and "pops up" a little before it's due.
alter table tasks add column if not exists repeat text check (repeat in ('weekly', 'biweekly', 'monthly', 'quarterly', 'yearly'));
alter table tasks add column if not exists show_from timestamptz;
alter table tasks add column if not exists popped_at timestamptz;

-- CEO dashboard: the agency owner sees it; they can share it with chosen admins.
alter table agencies add column if not exists owner_id uuid references auth.users;
alter table agencies add column if not exists ceo_shared_with uuid[] not null default '{}';
update agencies a set owner_id = coalesce(a.owner_id, (
  select m.user_id from agency_members m where m.agency_id = a.id and m.role = 'admin' and lower(coalesce(m.title, '')) = 'ceo' limit 1
));

create or replace function can_see_ceo(a uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from agencies g
    where g.id = a and (g.owner_id = auth.uid() or (auth.uid() = any(g.ceo_shared_with) and is_agency_admin(a)))
  )
$$;

-- What each client pays monthly. Only CEO dashboard viewers can see it.
create table if not exists client_billing (
  client_id uuid primary key references clients on delete cascade,
  agency_id uuid not null references agencies on delete cascade,
  monthly_fee numeric not null default 0,
  billing_day smallint check (billing_day between 1 and 31),
  updated_at timestamptz not null default now()
);
alter table client_billing enable row level security;
drop policy if exists billing_ceo on client_billing;
create policy billing_ceo on client_billing for all using (can_see_ceo(agency_id)) with check (can_see_ceo(agency_id));

-- Each client's invoice for each month: paid or not (from Dubsado through Zapier, or marked by hand).
create table if not exists client_invoices (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references agencies on delete cascade,
  client_id uuid not null references clients on delete cascade,
  month date not null,
  amount numeric,
  status text not null default 'unpaid' check (status in ('paid', 'unpaid')),
  paid_at timestamptz,
  source text not null default 'manual' check (source in ('dubsado', 'manual')),
  note text,
  updated_at timestamptz not null default now(),
  unique (client_id, month)
);
alter table client_invoices enable row level security;
drop policy if exists invoices_ceo on client_invoices;
create policy invoices_ceo on client_invoices for all using (can_see_ceo(agency_id)) with check (can_see_ceo(agency_id));

-- Goals each teammate sets for themselves, monthly or quarterly. Admins can see everyone's.
create table if not exists team_goals (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references agencies on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  period text not null check (period in ('month', 'quarter')),
  period_start date not null,
  title text not null,
  target numeric,
  progress numeric not null default 0,
  done boolean not null default false,
  note text,
  created_at timestamptz not null default now()
);
create index if not exists team_goals_user on team_goals (user_id, period_start);
alter table team_goals enable row level security;
drop policy if exists goals_read on team_goals;
create policy goals_read on team_goals for select using (user_id = auth.uid() or is_agency_admin(agency_id));
drop policy if exists goals_write on team_goals;
create policy goals_write on team_goals for all
  using (user_id = auth.uid() and is_agency_member(agency_id))
  with check (user_id = auth.uid() and is_agency_member(agency_id));
