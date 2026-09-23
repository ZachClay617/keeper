-- Adds photo storage support: account avatars now, pet photos in a follow-up
-- feature sharing the same bucket. Run once in the Supabase SQL Editor.

alter table public.profiles add column avatar_url text;

-- One public bucket for all app photos, organized by path prefix:
--   avatars/<user_id>/avatar.jpg
--   pets/<pet_id>/profile.jpg
--   pets/<pet_id>/gallery/<uuid>.jpg
insert into storage.buckets (id, name, public)
values ('photos', 'photos', true)
on conflict (id) do nothing;

-- Anyone can view (bucket is public; images have no sensitive content).
create policy "photos: public read" on storage.objects
  for select using (bucket_id = 'photos');

-- A user can only write their own avatar folder.
create policy "photos: owner manages own avatar" on storage.objects
  for all
  using (
    bucket_id = 'photos'
    and (storage.foldername(name))[1] = 'avatars'
    and (storage.foldername(name))[2] = auth.uid()::text
  )
  with check (
    bucket_id = 'photos'
    and (storage.foldername(name))[1] = 'avatars'
    and (storage.foldername(name))[2] = auth.uid()::text
  );

-- A user can only write photos under a pet they own.
create policy "photos: owner manages own pet photos" on storage.objects
  for all
  using (
    bucket_id = 'photos'
    and (storage.foldername(name))[1] = 'pets'
    and exists (
      select 1 from public.pets
      where pets.id::text = (storage.foldername(name))[2]
      and pets.owner_id = auth.uid()
    )
  )
  with check (
    bucket_id = 'photos'
    and (storage.foldername(name))[1] = 'pets'
    and exists (
      select 1 from public.pets
      where pets.id::text = (storage.foldername(name))[2]
      and pets.owner_id = auth.uid()
    )
  );
