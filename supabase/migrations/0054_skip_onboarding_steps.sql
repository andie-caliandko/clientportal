-- Take an onboarding step off one client's checklist (say, no content upload for a website-only client).
-- A removed step counts as finished so their progress isn't held up, and it's hidden from their portal.
alter table client_step_status add column if not exists skipped boolean not null default false;
