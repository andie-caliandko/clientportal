-- Each client's contract: a retainer (start + months, renewals) or a one-time project (start + end date).
-- Only CEO dashboard viewers see them.
create table if not exists client_contracts (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references agencies on delete cascade,
  client_id uuid not null references clients on delete cascade,
  kind text not null default 'retainer' check (kind in ('retainer', 'project')),
  start_date date not null,
  months smallint check (months between 1 and 60),
  end_date date,
  status text not null default 'active' check (status in ('active', 'renewed', 'ended')),
  term_number smallint not null default 1,
  note text,
  renewal_flagged_at timestamptz,
  created_at timestamptz not null default now(),
  check ((kind = 'retainer' and months is not null) or (kind = 'project' and end_date is not null))
);
create index if not exists client_contracts_client on client_contracts (client_id, start_date desc);
alter table client_contracts enable row level security;
drop policy if exists contracts_ceo on client_contracts;
create policy contracts_ceo on client_contracts for all using (can_see_ceo(agency_id)) with check (can_see_ceo(agency_id));
-- In case an earlier version of this table was already created.
alter table client_contracts add column if not exists kind text not null default 'retainer';
alter table client_contracts add column if not exists end_date date;
alter table client_contracts alter column months drop not null;
