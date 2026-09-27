-- Tasks the team marks "Waiting on client" show in the client's portal too,
-- and the client can mark them done. Content-approval reminders (source
-- 'rella') stay internal; clients see those as the approval card instead.

drop policy if exists tasks_read on tasks;
create policy tasks_read on tasks for select using (
  (is_agency_member(agency_id) and (client_id is null or is_client_staff(client_id)))
  or (
    is_client_user(client_id)
    and (client_assignee_id is not null or (status = 'waiting' and source <> 'rella'))
  )
);

create or replace function complete_client_task(task uuid, comment text, file_path text) returns void
language plpgsql security definer set search_path = public as $$
begin
  update tasks
     set status = 'done',
         completed_at = now(),
         completed_by = auth.uid(),
         completion_comment = nullif(trim(comment), ''),
         completion_file_path = file_path
   where id = task
     and status <> 'done'
     and (client_assignee_id is not null or (status = 'waiting' and source <> 'rella'))
     and is_client_user(client_id)
     and (file_path is null or split_part(file_path, '/', 2) = client_id::text);
end $$;
