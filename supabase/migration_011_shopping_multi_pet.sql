-- Lets a shopping item be assigned to more than one pet's list at once (or
-- zero pets, for the general/household list), replacing the single
-- shopping_items.pet_id column. The item itself still exists as exactly one
-- row in shopping_items — shopping_item_pets is just which lists it shows up
-- on, so the master/full shopping list never double-counts it.
-- Run once in the Supabase SQL Editor.

create table public.shopping_item_pets (
  id uuid primary key default gen_random_uuid(),
  shopping_item_id uuid not null references public.shopping_items(id) on delete cascade,
  pet_id uuid not null references public.pets(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  unique (shopping_item_id, pet_id)
);

create index shopping_item_pets_item_idx on public.shopping_item_pets(shopping_item_id);
create index shopping_item_pets_pet_idx on public.shopping_item_pets(pet_id);

alter table public.shopping_item_pets enable row level security;

create policy "shopping_item_pets: owner full access" on public.shopping_item_pets
  for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

-- Carry forward each item's existing single-pet assignment into the new table.
insert into public.shopping_item_pets (shopping_item_id, pet_id, owner_id)
select id, pet_id, owner_id from public.shopping_items where pet_id is not null;

alter table public.shopping_items drop column pet_id;
