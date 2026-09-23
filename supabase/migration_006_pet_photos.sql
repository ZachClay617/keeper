-- Adds pet profile pictures and a per-pet photo gallery.
-- Run once in the Supabase SQL Editor. (Reuses the "photos" storage bucket
-- and its RLS policies created in migration_005_photos.sql.)

alter table public.pets add column avatar_url text;

create table public.pet_photos (
  id uuid primary key default gen_random_uuid(),
  pet_id uuid not null references public.pets (id) on delete cascade,
  url text not null,
  created_at timestamptz not null default now()
);

alter table public.pet_photos enable row level security;

create policy "pet_photos: owner full access" on public.pet_photos
  for all using (
    exists (select 1 from public.pets where pets.id = pet_photos.pet_id and pets.owner_id = auth.uid())
  ) with check (
    exists (select 1 from public.pets where pets.id = pet_photos.pet_id and pets.owner_id = auth.uid())
  );

-- NOTE: the "photos: owner manages own pet photos" storage.objects policy from
-- migration_005_photos.sql was later corrected — Supabase Storage's RLS engine
-- doesn't evaluate a cross-table EXISTS() the way plain Postgres RLS does, so
-- every real upload was rejected even though the ownership check was true.
-- Fixed by embedding the owner's user id directly in the path (matching the
-- avatars policy's proven pattern) instead of joining through pets:
alter policy "photos: owner manages own pet photos" on storage.objects
  using (
    bucket_id = 'photos'
    and (storage.foldername(name))[1] = 'pets'
    and (storage.foldername(name))[2] = auth.uid()::text
  )
  with check (
    bucket_id = 'photos'
    and (storage.foldername(name))[1] = 'pets'
    and (storage.foldername(name))[2] = auth.uid()::text
  );
-- Paths are now pets/<owner_id>/<pet_id>/profile.jpg and
-- pets/<owner_id>/<pet_id>/gallery/<uuid>.jpg (see src/pets.ts).
