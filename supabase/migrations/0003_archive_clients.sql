-- Archive clients whose term has ended without deleting anything.
alter table clients add column if not exists archived_at timestamptz;
alter table clients add column if not exists archived_by uuid references auth.users;

-- Archived clients' contacts lose access to their portal data. The team keeps it.
create or replace function is_client_user(c uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from client_users cu
    join clients cl on cl.id = cu.client_id
    where cu.client_id = c and cu.user_id = auth.uid() and cl.archived_at is null
  )
$$;
