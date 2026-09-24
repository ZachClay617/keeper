-- Lets a reptile's daily care page record that day's habitat humidity and
-- temperature (always stored in Fahrenheit; the account's temp_unit
-- preference controls display/entry conversion only). Also adds the
-- account-wide temperature unit preference used by Settings.
-- Run once in the Supabase SQL Editor.

alter table public.profiles add column temp_unit text not null default 'F' check (temp_unit in ('F', 'C'));

create table public.reptile_conditions (
  id uuid primary key default gen_random_uuid(),
  pet_id uuid not null references public.pets(id) on delete cascade,
  date date not null,
  humidity numeric,
  temp_f numeric,
  created_at timestamptz not null default now(),
  unique (pet_id, date)
);

create index reptile_conditions_pet_date_idx on public.reptile_conditions(pet_id, date);

alter table public.reptile_conditions enable row level security;

create policy "reptile_conditions: owner full access" on public.reptile_conditions
  for all using (
    exists (select 1 from public.pets where pets.id = reptile_conditions.pet_id and pets.owner_id = auth.uid())
  ) with check (
    exists (select 1 from public.pets where pets.id = reptile_conditions.pet_id and pets.owner_id = auth.uid())
  );
