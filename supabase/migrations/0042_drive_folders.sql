-- Google Drive, more automatic:
--  * new clients get their own folder inside the agency's Clients folder,
--  * each content shoot gets a folder (sent plan PDF, signed model waivers, the shoot's files),
--  * strategy and analytics PDFs are copied into Reports,
--  * the submitted onboarding questionnaire is saved in the client's main folder.
alter table agencies add column if not exists drive_clients_folder_id text;

alter table content_shoots add column if not exists drive_folder_id text;

alter table shoot_plan_shares add column if not exists drive_file_id text;
alter table shoot_waivers add column if not exists drive_file_id text;
alter table clients add column if not exists drive_questionnaire_id text;

-- 'pending' copies to Drive on the next run. Reports already in the portal are left alone,
-- so nothing that's already in Drive gets copied a second time.
alter table documents add column if not exists drive_status text not null default 'pending' check (drive_status in ('pending', 'done', 'skipped'));
alter table documents add column if not exists drive_file_id text;
update documents set drive_status = 'skipped' where drive_status = 'pending' and created_at < now();
