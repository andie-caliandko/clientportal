-- Teammates can add a photo of themselves; it replaces their initial next to their name.
alter table agency_members add column if not exists avatar_path text;

insert into storage.buckets (id, name, public) values ('avatars', 'avatars', true) on conflict (id) do nothing;
drop policy if exists "avatars readable" on storage.objects;
create policy "avatars readable" on storage.objects for select using (bucket_id = 'avatars');
-- Each person uploads only into their own folder: avatars/<their user id>/...
drop policy if exists "own avatar upload" on storage.objects;
create policy "own avatar upload" on storage.objects for insert to authenticated with check (
  bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text
);
