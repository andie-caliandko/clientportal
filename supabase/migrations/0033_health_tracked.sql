-- Some accounts don't get a red / yellow / green health rating. They show "Not tracked" instead.
alter table clients add column if not exists health_tracked boolean not null default true;
