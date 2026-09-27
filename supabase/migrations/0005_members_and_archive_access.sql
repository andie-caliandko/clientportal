-- Clients see the teammates on their account (not just the account manager);
-- the app hides admins from that list. Archived clients are admin-only.
-- Client seats stay capped at 2 (the existing trigger).

drop policy if exists members_read on agency_members;
create policy members_read on agency_members for select using (
  is_agency_member(agency_id)
  or exists (select 1 from clients c where c.account_manager_id = agency_members.user_id and is_client_user(c.id))
  or exists (select 1 from client_team t where t.user_id = agency_members.user_id and is_client_user(t.client_id))
);

drop policy if exists client_team_read on client_team;
create policy client_team_read on client_team for select using (is_client_staff(client_id) or is_client_user(client_id));

create or replace function is_client_staff(c uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from clients cl
    join agency_members m on m.agency_id = cl.agency_id and m.user_id = auth.uid()
    where cl.id = c
      and (m.role = 'admin'
        or (cl.archived_at is null and exists (select 1 from client_team t where t.client_id = c and t.user_id = auth.uid())))
  )
$$;

create or replace function can_edit_client(c uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from clients cl
    join agency_members m on m.agency_id = cl.agency_id and m.user_id = auth.uid()
    where cl.id = c
      and (m.role = 'admin'
        or (m.role = 'account_manager' and cl.archived_at is null
            and exists (select 1 from client_team t where t.client_id = c and t.user_id = auth.uid())))
  )
$$;
