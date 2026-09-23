-- Replaces the free-text "enclosure group" label with a real pets<->pets
-- relationship, picked from a dropdown of the account's own pets instead of
-- typed text. Each pair is stored once (pet_id < mate_pet_id lexically);
-- the app reads both directions to build each pet's full mate list.
-- Run once in the Supabase SQL Editor.

alter table public.pets drop column if exists enclosure_group;

create table public.enclosure_mates (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  pet_id uuid not null references public.pets(id) on delete cascade,
  mate_pet_id uuid not null references public.pets(id) on delete cascade,
  check (pet_id <> mate_pet_id),
  unique (pet_id, mate_pet_id)
);

create index enclosure_mates_pet_idx on public.enclosure_mates(pet_id);
create index enclosure_mates_mate_idx on public.enclosure_mates(mate_pet_id);

alter table public.enclosure_mates enable row level security;

create policy "enclosure_mates: owner full access" on public.enclosure_mates
  for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
