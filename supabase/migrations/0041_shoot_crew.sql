-- Who's going to each content shoot: teammates (who get it on their Google Calendar) and the photographer.
alter table content_shoots add column if not exists crew uuid[] not null default '{}';
alter table content_shoots add column if not exists photographer text;

-- The Google Calendar event made for each teammate on a shoot, so it can be moved or removed later.
create table if not exists shoot_calendar_events (
  shoot_id uuid not null references content_shoots on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  event_id text not null,
  primary key (shoot_id, user_id)
);
alter table shoot_calendar_events enable row level security;
drop policy if exists shoot_calendar_events_read on shoot_calendar_events;
create policy shoot_calendar_events_read on shoot_calendar_events for select using (
  exists (select 1 from content_shoots s where s.id = shoot_id and is_client_staff(s.client_id))
);
