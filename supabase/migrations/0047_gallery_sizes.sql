-- Sharp previews made on the server from each photo's original: a grid preview and a large
-- version for the full-screen view (the original stays for downloads).
alter table shoot_gallery_items add column if not exists large_path text;
alter table shoot_gallery_items add column if not exists sized_at timestamptz;          -- set once done (or given up on)
alter table shoot_gallery_items add column if not exists sizing_claimed_at timestamptz; -- one run per photo at a time
