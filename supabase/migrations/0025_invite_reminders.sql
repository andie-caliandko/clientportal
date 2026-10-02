-- Reminders for client portal invites that haven't been accepted: at 48 hours, then a week later.
alter table client_users add column if not exists invite_reminders smallint not null default 0;
alter table client_users add column if not exists invite_reminded_at timestamptz;
