-- Calls can also be sent as a direct invite at a set time ("invite"), besides
-- asking the client to pick a time ("pick"). Invites show in the client's
-- portal once one of their contacts accepts in Google.
alter table call_requests add column if not exists kind text not null default 'pick';
alter table call_requests drop constraint if exists call_requests_kind_check;
alter table call_requests add constraint call_requests_kind_check check (kind in ('pick', 'invite'));
alter table call_requests add column if not exists accepted_at timestamptz;
alter table call_requests add column if not exists guests text[] not null default '{}';
