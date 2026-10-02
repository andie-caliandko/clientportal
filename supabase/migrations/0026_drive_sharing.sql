-- Clients can be given access to their own Google Drive folder from their portal.
alter table clients add column if not exists drive_shared boolean not null default false;
-- The Branding and Content folders inside it, for direct links.
alter table clients add column if not exists drive_branding_id text;
alter table clients add column if not exists drive_content_id text;
