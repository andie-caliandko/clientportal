-- Files attached to messages (from the portal or shared in Slack).
alter table messages add column if not exists attachments jsonb not null default '[]'::jsonb;
alter table messages alter column body set default '';

-- Message attachments are uploads too, so they're listed on the client page and copied to Drive.
alter table uploads drop constraint if exists uploads_kind_check;
alter table uploads add constraint uploads_kind_check check (kind in ('branding', 'content', 'task', 'message'));
