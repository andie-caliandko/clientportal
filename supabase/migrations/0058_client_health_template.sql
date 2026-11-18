-- Client health template: the same relationship KPIs on every social client's red / yellow / green scorecard,
-- next to the social performance KPIs each team already sets up per client.
--   template_key: which template KPI this is (null for a client's own KPIs)
--   category:     Communication, Relationship, Delivery, Financial, Gut check
--   choices:      for pick-one KPIs, the Green, Yellow and Red answers in that order (saved as 2, 1, 0)
alter table kpis add column if not exists template_key text;
alter table kpis add column if not exists category text;
alter table kpis add column if not exists choices text[];
create unique index if not exists kpis_client_template on kpis (client_id, template_key) where template_key is not null;

-- Adds any template KPIs a client doesn't have yet. Ones already there (or edited) are left alone.
create or replace function seed_health_template(c uuid) returns void
language sql security definer set search_path = public as $$
  insert into kpis (agency_id, client_id, name, unit, higher_is_better, good, better, best, benchmark, position, template_key, category, choices)
  select cl.agency_id, cl.id, t.name, 'number', true, t.good, t.better, t.best, t.benchmark, t.pos, t.key, t.category, t.choices
  from clients cl,
  (values
    ('updates',      'Communication', 'Mon/Fri updates sent',                         1, 2, 2,  null::text, array['All sent', '1 missed', '2+ missed'], -100),
    ('response',     'Communication', 'Client response time',                         1, 2, 2,  null, array['Within 2 business days', '3–5 days', '5+ days or no reply'], -99),
    ('checkin',      'Relationship',  'Monthly check-in held',                        1, 2, 2,  null, array['Held', 'Rescheduled', 'Missed'], -98),
    ('satisfaction', 'Relationship',  'Satisfaction score (1–10)',                    6, 8, 10, 'Asked on the monthly call. 8–10 is Green, 6–7 Yellow, 5 or below Red.', null, -97),
    ('contact',      'Relationship',  'Point of contact',                             1, 2, 2,  null, array['Stable', 'New contact (under 60 days)', 'Contact left, no replacement'], -96),
    ('deadlines',    'Delivery',      'Our deadlines met',                            1, 2, 2,  null, array['All met', '1 missed', '2+ missed'], -95),
    ('assets',       'Delivery',      'Client delivers assets and approvals on time', 1, 2, 2,  null, array['On time', 'Some delays', 'Blocking our work'], -94),
    ('invoices',     'Financial',     'Invoices paid on time',                        1, 2, 2,  null, array['On time', 'Under 30 days late', '30+ days late'], -93),
    ('renewal',      'Gut check',     'Account lead''s renewal confidence (1–5)',     3, 4, 5,  '4–5 is Green, 3 Yellow, 1–2 Red.', null, -92)
  ) as t(key, category, name, good, better, best, benchmark, choices, pos)
  where cl.id = c
  on conflict (client_id, template_key) where template_key is not null do nothing;
$$;
revoke execute on function seed_health_template(uuid) from public, anon, authenticated;

-- A new social client, or Social media added to an existing one, gets the template.
create or replace function clients_seed_health() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if 'social' = any(new.services) and (tg_op = 'INSERT' or not ('social' = any(coalesce(old.services, '{}')))) then
    perform seed_health_template(new.id);
  end if;
  return new;
end $$;
revoke execute on function clients_seed_health() from public, anon, authenticated;

drop trigger if exists clients_seed_health on clients;
create trigger clients_seed_health after insert or update of services on clients
  for each row execute function clients_seed_health();

-- Every social client today.
select seed_health_template(id) from clients where 'social' = any(services);
