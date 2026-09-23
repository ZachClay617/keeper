-- One-off tasks a user plans for the very next day (distinct from the
-- recurring daily_care_items checklist). A task is created for tomorrow's
-- date; once that date becomes "today" it shows merged into the normal
-- Today list, and after that it's part of read-only history like any
-- other day's items.
-- Run once in the Supabase SQL Editor.

create table public.planned_tasks (
  id uuid primary key default gen_random_uuid(),
  pet_id uuid not null references public.pets(id) on delete cascade,
  date date not null,
  label text not null,
  done boolean not null default false,
  created_at timestamptz not null default now()
);

create index planned_tasks_pet_date_idx on public.planned_tasks(pet_id, date);

alter table public.planned_tasks enable row level security;

create policy "planned_tasks_select" on public.planned_tasks for select
  using (exists (select 1 from public.pets where pets.id = planned_tasks.pet_id and pets.owner_id = auth.uid()));

create policy "planned_tasks_insert" on public.planned_tasks for insert
  with check (exists (select 1 from public.pets where pets.id = planned_tasks.pet_id and pets.owner_id = auth.uid()));

create policy "planned_tasks_update" on public.planned_tasks for update
  using (exists (select 1 from public.pets where pets.id = planned_tasks.pet_id and pets.owner_id = auth.uid()));

create policy "planned_tasks_delete" on public.planned_tasks for delete
  using (exists (select 1 from public.pets where pets.id = planned_tasks.pet_id and pets.owner_id = auth.uid()));
