-- Archived clients keep their portal for 30 days to download what they need,
-- then their logins are removed automatically. The team keeps everything.
alter table clients add column if not exists access_ends_at timestamptz;
alter table clients add column if not exists logins_removed_at timestamptz;

create or replace function is_client_user(c uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from client_users cu
    join clients cl on cl.id = cu.client_id
    where cu.client_id = c and cu.user_id = auth.uid()
      and (cl.archived_at is null or (cl.access_ends_at is not null and cl.access_ends_at > now()))
  )
$$;
