-- The Drive folder where each client's folder is created automatically.
alter table agency_integrations add column if not exists drive_root_folder_id text;
alter table agency_integrations add column if not exists drive_root_folder_name text;
