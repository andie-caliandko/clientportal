-- CEO dashboard: dismiss a "new client to set up" (for example, an existing
-- client who paid from a different email). Later Dubsado events for that email stay dismissed.
alter table client_signups add column if not exists dismissed_at timestamptz;
