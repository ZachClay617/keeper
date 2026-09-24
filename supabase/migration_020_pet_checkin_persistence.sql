-- Two changes so pet messages survive reloads and keep working even when
-- nobody has the app open:
--
-- 1. pet_checkin_schedule: each pet's daily 3-10 random check-in times are
--    now persisted (not regenerated in memory each session). Any client
--    that opens the app checks for schedule rows whose time has passed and
--    haven't fired yet — including ones that passed while nobody was
--    looking — and fires them then, so no check-in is silently skipped just
--    because the site was dormant.
--
-- 2. pet_messages: the "Recent messages" list in the Reminders bell (both
--    check-in and daily-task thank-you messages) is now a real table
--    instead of in-memory state, so it survives reloads and only clears
--    when a user explicitly dismisses an entry.
--
-- Run once in the Supabase SQL Editor.

create table public.pet_checkin_schedule (
  id uuid primary key default gen_random_uuid(),
  pet_id uuid not null references public.pets(id) on delete cascade,
  date date not null,
  time text not null,
  fired boolean not null default false,
  created_at timestamptz not null default now(),
  unique (pet_id, date, time)
);

create index pet_checkin_schedule_pet_date_idx on public.pet_checkin_schedule(pet_id, date);

alter table public.pet_checkin_schedule enable row level security;

create policy "pet_checkin_schedule: owner full access" on public.pet_checkin_schedule
  for all using (
    exists (select 1 from public.pets where pets.id = pet_checkin_schedule.pet_id and pets.owner_id = auth.uid())
  ) with check (
    exists (select 1 from public.pets where pets.id = pet_checkin_schedule.pet_id and pets.owner_id = auth.uid())
  );

create table public.pet_messages (
  id uuid primary key default gen_random_uuid(),
  pet_id uuid not null references public.pets(id) on delete cascade,
  message text not null,
  dismissed boolean not null default false,
  created_at timestamptz not null default now()
);

create index pet_messages_pet_idx on public.pet_messages(pet_id);

alter table public.pet_messages enable row level security;

create policy "pet_messages: owner full access" on public.pet_messages
  for all using (
    exists (select 1 from public.pets where pets.id = pet_messages.pet_id and pets.owner_id = auth.uid())
  ) with check (
    exists (select 1 from public.pets where pets.id = pet_messages.pet_id and pets.owner_id = auth.uid())
  );
