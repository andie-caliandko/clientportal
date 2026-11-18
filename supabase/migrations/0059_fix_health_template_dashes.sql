-- Fix: the dashes (–) in the client health template were garbled when 0058 was pasted, showing as ",Äì".
-- Puts the dashes back on every client's template KPIs and in the template new social clients get.
update kpis set
  name = replace(name, chr(8218) || chr(196) || chr(236), chr(8211)),
  benchmark = replace(benchmark, chr(8218) || chr(196) || chr(236), chr(8211)),
  choices = (select array_agg(replace(x, chr(8218) || chr(196) || chr(236), chr(8211)) order by n) from unnest(choices) with ordinality as u(x, n))
where template_key is not null;

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
