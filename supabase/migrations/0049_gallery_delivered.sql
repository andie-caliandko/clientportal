-- When the gallery reached the client (added to their portal, or emailed to them). The shoot then
-- shows "Gallery sent" and "Complete", and its remaining planning tasks are checked off.
alter table content_shoots add column if not exists gallery_delivered_at timestamptz;
-- Galleries already in a client's portal count as delivered.
update content_shoots set gallery_delivered_at = gallery_sent_at where gallery_sent_at is not null and gallery_delivered_at is null;
