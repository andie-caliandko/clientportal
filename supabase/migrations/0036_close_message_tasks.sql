-- Client messages no longer become tasks. Check off the "Reply to …" tasks they made.
update tasks set status = 'done', completed_at = now()
where source = 'portal' and auto and title like 'Reply to %' and status <> 'done';
