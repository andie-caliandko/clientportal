-- When each person first set their password and joined, so the team is told once.
alter table client_users add column if not exists joined_at timestamptz;
alter table agency_members add column if not exists joined_at timestamptz;
-- Everyone who has already signed in counts as joined.
update client_users set joined_at = coalesce(joined_at, now())
  where user_id in (select id from auth.users where last_sign_in_at is not null);
update agency_members set joined_at = coalesce(joined_at, now())
  where user_id in (select id from auth.users where last_sign_in_at is not null);
