-- Multi-day content shoots: an optional last day (same as the first day when empty).
alter table content_shoots add column if not exists end_date date;
alter table content_shoots drop constraint if exists content_shoots_end_after_start;
alter table content_shoots add constraint content_shoots_end_after_start check (end_date is null or end_date >= shoot_date);
