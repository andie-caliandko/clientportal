-- When each client contact last opened Messages, for the unread count in their menu.
-- Starts at now so older messages don't all show as new.
alter table client_users add column if not exists messages_read_at timestamptz not null default now();
