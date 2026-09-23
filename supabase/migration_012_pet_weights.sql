-- Weight log for the Care Log tab: each entry is one weigh-in (value, unit,
-- date), charted as a line over time and listed as a visual log.
-- Run once in the Supabase SQL Editor.

create table public.pet_weights (
  id uuid primary key default gen_random_uuid(),
  pet_id uuid not null references public.pets(id) on delete cascade,
  weight numeric not null,
  unit text not null default 'lb' check (unit in ('lb', 'kg')),
  date date not null,
  created_at timestamptz not null default now()
);

create index pet_weights_pet_date_idx on public.pet_weights(pet_id, date);

alter table public.pet_weights enable row level security;

create policy "pet_weights: owner full access" on public.pet_weights
  for all using (
    exists (select 1 from public.pets where pets.id = pet_weights.pet_id and pets.owner_id = auth.uid())
  ) with check (
    exists (select 1 from public.pets where pets.id = pet_weights.pet_id and pets.owner_id = auth.uid())
  );
