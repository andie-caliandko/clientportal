-- Weekly and monthly KPIs. The weekly scorecard is the social numbers (plus Mon/Fri updates);
-- the rest of the client health template is a Monthly client check, done once a month.
-- Monthly readings are saved on the first of the month.
alter table kpis add column if not exists cadence text not null default 'weekly' check (cadence in ('weekly', 'monthly'));
update kpis set cadence = 'monthly' where template_key is not null and template_key <> 'updates';

-- Readings already entered weekly for monthly KPIs: keep the latest one in each month, on the first of the month.
drop table if exists monthly_latest;
create temporary table monthly_latest as
  select distinct on (e.kpi_id, date_trunc('month', e.week))
    e.kpi_id, e.client_id, date_trunc('month', e.week)::date as week, e.value, e.entered_by, e.entered_at
  from kpi_entries e join kpis k on k.id = e.kpi_id
  where k.cadence = 'monthly'
  order by e.kpi_id, date_trunc('month', e.week), e.week desc;
delete from kpi_entries e using kpis k where k.id = e.kpi_id and k.cadence = 'monthly';
insert into kpi_entries (kpi_id, client_id, week, value, entered_by, entered_at)
  select kpi_id, client_id, week, value, entered_by, entered_at from monthly_latest;
drop table monthly_latest;

-- Adds any template KPIs a client doesn't have yet. Ones already there (or edited) are left alone.
create or replace function seed_health_template(c uuid) returns void
language sql security definer set search_path = public as $$
  insert into kpis (agency_id, client_id, name, unit, higher_is_better, good, better, best, benchmark, position, template_key, category, choices, cadence)
  select cl.agency_id, cl.id, t.name, 'number', true, t.good, t.better, t.best, t.benchmark, t.pos, t.key, t.category, t.choices, case when t.key = 'updates' then 'weekly' else 'monthly' end
  from clients cl,
  (values
    ('updates',      'Communication', 'Mon/Fri updates sent',                         1, 2, 2,  null::text, array['All sent', '1 missed', '2+ missed'], -100),
    ('response',     'Communication', 'Client response time',                         1, 2, 2,  null, array['Within 2 business days', '3–5 days', '5+ days or no reply'], -99),
    ('checkin',      'Relationship',  'Monthly check-in held',                        1, 2, 2,  null, array['Held', 'Rescheduled', 'Missed'], -98),
    ('satisfaction', 'Relationship',  'Satisfaction score (1–10)',                    6, 8, 10, 'Asked on the monthly call.', null, -97),
    ('contact',      'Relationship',  'Point of contact',                             1, 2, 2,  null, array['Stable', 'New contact (under 60 days)', 'Contact left, no replacement'], -96),
    ('deadlines',    'Delivery',      'Our deadlines met',                            1, 2, 2,  null, array['All met', '1 missed', '2+ missed'], -95),
    ('assets',       'Delivery',      'Client delivers assets and approvals on time', 1, 2, 2,  null, array['On time', 'Some delays', 'Blocking our work'], -94),
    ('invoices',     'Financial',     'Invoices paid on time',                        1, 2, 2,  null, array['On time', 'Under 30 days late', '30+ days late'], -93),
    ('renewal',      'Gut check',     'Account lead''s renewal confidence (1–5)',     3, 4, 5,  null, null, -92)
  ) as t(key, category, name, good, better, best, benchmark, choices, pos)
  where cl.id = c
  on conflict (client_id, template_key) where template_key is not null do nothing;
$$;
revoke execute on function seed_health_template(uuid) from public, anon, authenticated;
