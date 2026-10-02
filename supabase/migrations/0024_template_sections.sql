-- Agency templates page has two tabs: Templates and SOPs.
alter table agency_templates add column if not exists section text not null default 'templates';
alter table agency_templates drop constraint if exists agency_templates_section_check;
alter table agency_templates add constraint agency_templates_section_check check (section in ('templates', 'sops'));
-- The SOPs tab shows one Google Drive folder with all of them.
alter table agencies add column if not exists sop_folder_url text;
