-- Revenue from before the portal (imported from a spreadsheet), for lifetime and yearly totals.
create table if not exists revenue_entries (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references agencies on delete cascade,
  paid_on date not null,
  amount numeric not null,
  client_name text,
  client_id uuid references clients on delete set null,
  note text,
  batch_id uuid not null,
  batch_name text,
  created_by uuid references auth.users,
  created_at timestamptz not null default now()
);
create index if not exists revenue_entries_agency on revenue_entries (agency_id, paid_on);
alter table revenue_entries enable row level security;
drop policy if exists revenue_ceo on revenue_entries;
create policy revenue_ceo on revenue_entries for all using (can_see_ceo(agency_id)) with check (can_see_ceo(agency_id));
