-- What each client gets from us: social, content shoots, website, SEO, paid ads (any mix).
-- Social clients get health scorecards and Daily engagement; the rest default to not tracked.
alter table clients add column if not exists services text[] not null default '{}';
