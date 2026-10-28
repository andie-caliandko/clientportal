-- Clients can add a caption or notes to each photo or video they upload, so the team isn't guessing.
alter table uploads add column if not exists note text;
