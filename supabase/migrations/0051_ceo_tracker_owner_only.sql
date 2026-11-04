-- The CEO tracker is the owner's alone: sharing the CEO dashboard with admins doesn't share it.
create or replace function is_agency_owner(a uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from agencies g where g.id = a and g.owner_id = auth.uid())
$$;

drop policy if exists ceo_sheets_ceo on ceo_sheets;
create policy ceo_sheets_owner on ceo_sheets for all using (is_agency_owner(agency_id)) with check (is_agency_owner(agency_id));
drop policy if exists ceo_daily_ceo on ceo_daily;
create policy ceo_daily_owner on ceo_daily for all using (is_agency_owner(agency_id)) with check (is_agency_owner(agency_id));
drop policy if exists ceo_leads_ceo on ceo_leads;
create policy ceo_leads_owner on ceo_leads for all using (is_agency_owner(agency_id)) with check (is_agency_owner(agency_id));
