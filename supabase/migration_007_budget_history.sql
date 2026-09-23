-- Supports viewing past months' budgets on the Budget page. A pet's
-- monthly_budget is a single mutable value with no history of its own, so
-- we snapshot it at the same month-boundary archive point shopping lists
-- already get archived at (see src/shoppingArchive.ts).
-- Run once in the Supabase SQL Editor.

create table public.budget_snapshots (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  pet_id uuid references public.pets (id) on delete cascade,
  month text not null,
  budget numeric,
  created_at timestamptz not null default now()
);

alter table public.budget_snapshots enable row level security;

create policy "budget_snapshots: owner full access" on public.budget_snapshots
  for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
