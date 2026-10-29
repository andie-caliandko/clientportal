-- People who opened a gallery's share link. They enter their email first; the team sees the list.
create table if not exists gallery_viewers (
  id uuid primary key default gen_random_uuid(),
  shoot_id uuid not null references content_shoots on delete cascade,
  client_id uuid not null references clients on delete cascade,
  email text not null,
  first_viewed_at timestamptz not null default now(),
  last_viewed_at timestamptz not null default now(),
  visits int not null default 1,
  unique (shoot_id, email)
);
alter table gallery_viewers enable row level security;
-- Only the team reads them; the share page writes them from the server.
drop policy if exists gallery_viewers_team on gallery_viewers;
create policy gallery_viewers_team on gallery_viewers for select using (is_client_staff(client_id));
