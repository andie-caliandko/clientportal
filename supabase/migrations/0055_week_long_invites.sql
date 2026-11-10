-- Portal invites last a week: each invite gets its own link (good for 7 days) instead of the
-- sign-in service's one-day link, and a reminder goes out 2 days before it expires.
alter table client_users add column if not exists invite_token text unique;
alter table client_users add column if not exists invite_expires_at timestamptz;
