-- A client can be set up before they're invited; their main contact is saved for later.
alter table clients add column if not exists contact_name text;
alter table clients add column if not exists contact_email text;
