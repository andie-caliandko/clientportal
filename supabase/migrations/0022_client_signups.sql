-- New clients from Dubsado (contract signed or first payment) who don't have a portal yet.
create table if not exists client_signups (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references agencies on delete cascade,
  email text not null,
  name text,
  project text,
  contract_signed_at timestamptz,
  paid_at timestamptz,
  amount numeric,
  setup_task_id uuid references tasks on delete set null,
  client_id uuid references clients on delete set null,
  created_at timestamptz not null default now()
);
create unique index if not exists client_signups_email on client_signups (agency_id, lower(email));
alter table client_signups enable row level security;
-- Only CEO dashboard viewers see these (the webhook writes with the service key).
drop policy if exists signups_ceo on client_signups;
create policy signups_ceo on client_signups for all using (can_see_ceo(agency_id)) with check (can_see_ceo(agency_id));
