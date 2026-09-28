-- Who each agency template is for. Admins always see every template.
alter table agency_templates add column if not exists visible_to text[] not null default '{admin,account_manager,creator}';

create or replace function agency_role(a uuid) returns text
language sql stable security definer set search_path = public as $$
  select role from agency_members where agency_id = a and user_id = auth.uid() limit 1
$$;

drop policy if exists templates_read on agency_templates;
create policy templates_read on agency_templates for select using (
  is_agency_admin(agency_id) or (is_agency_member(agency_id) and agency_role(agency_id) = any(visible_to))
);

-- Template files follow the same rule as the template they belong to.
drop policy if exists "team reads templates" on storage.objects;
create policy "team reads templates" on storage.objects for select using (
  bucket_id = 'templates' and exists (
    select 1 from agency_templates t
    where t.file_path = storage.objects.name
      and (is_agency_admin(t.agency_id) or (is_agency_member(t.agency_id) and agency_role(t.agency_id) = any(t.visible_to)))
  )
);
