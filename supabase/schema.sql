-- Keeper database schema
-- Run this once in the Supabase SQL Editor (Project > SQL Editor > New query).

-- ── profiles ──────────────────────────────────────────────────────────────
-- One row per auth.users row. Supabase Auth already owns id/email/password;
-- this table holds the rest of the User entity from the data model.
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  name text not null,
  timezone text not null default 'device',
  misc_monthly_budget numeric,
  created_at timestamptz not null default now()
);

-- Auto-create a profile row whenever someone signs up.
-- `name` is read from the signup call's options.data.name (see src/auth.ts).
create function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, name)
  values (new.id, coalesce(new.raw_user_meta_data->>'name', ''));
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ── pets ──────────────────────────────────────────────────────────────────
create table public.pets (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  type text not null check (type in ('dog', 'cat', 'small_animal', 'bird', 'reptile', 'fish', 'other')),
  species text,
  breed_or_morph text,
  age text,
  weight text,
  enclosure_size text,
  since_date date,
  personality text,
  care_notes text,
  status text not null default 'active' check (status in ('active', 'memorial')),
  passed_date date,
  memory_note text,
  monthly_budget numeric,
  created_at timestamptz not null default now()
);

-- ── daily_care_items ──────────────────────────────────────────────────────
-- The recurring task itself, e.g. "walk Milo at 7:30am" — not whether it
-- happened today (that's daily_completions below).
create table public.daily_care_items (
  id uuid primary key default gen_random_uuid(),
  pet_id uuid not null references public.pets (id) on delete cascade,
  label text not null,
  time text,
  category text not null check (category in ('Feeding', 'Exercise', 'Medication', 'Hygiene', 'Environment', 'Health')),
  detail text,
  created_at timestamptz not null default now()
);

-- ── daily_completions ─────────────────────────────────────────────────────
-- One row per completed item per day. No row = "not done" that day, which
-- is what makes the daily history view possible without a nightly reset job.
create table public.daily_completions (
  id uuid primary key default gen_random_uuid(),
  daily_item_id uuid not null references public.daily_care_items (id) on delete cascade,
  pet_id uuid not null references public.pets (id) on delete cascade,
  date date not null,
  completed_at timestamptz not null default now(),
  unique (daily_item_id, date)
);

-- ── reminders ─────────────────────────────────────────────────────────────
-- pet_id null = account-level reminder (e.g. the monthly budget-review nudge).
create table public.reminders (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  pet_id uuid references public.pets (id) on delete cascade,
  text text not null,
  created_at timestamptz not null default now()
);

-- ── shopping_items ────────────────────────────────────────────────────────
-- pet_id null = the account's general/household list rather than one animal.
create table public.shopping_items (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  pet_id uuid references public.pets (id) on delete cascade,
  item text not null,
  qty text,
  category text not null check (category in ('Food', 'Litter & Bedding', 'Medical', 'Toys', 'Grooming', 'Tank/Enclosure', 'Other')),
  due_date date,
  est_price numeric,
  got boolean not null default false,
  got_month text,
  created_at timestamptz not null default now()
);

-- ── care_log_entries ──────────────────────────────────────────────────────
create table public.care_log_entries (
  id uuid primary key default gen_random_uuid(),
  pet_id uuid not null references public.pets (id) on delete cascade,
  date date not null,
  title text not null,
  category text not null check (category in ('Vet', 'Vaccine', 'Grooming', 'Maintenance', 'Checkup', 'Other')),
  created_at timestamptz not null default now()
);

-- ── row-level security ────────────────────────────────────────────────────
-- Every table is scoped to the signed-in user, either directly (owner_id)
-- or through the pet it belongs to (pet_id -> pets.owner_id).

alter table public.profiles enable row level security;
alter table public.pets enable row level security;
alter table public.daily_care_items enable row level security;
alter table public.daily_completions enable row level security;
alter table public.reminders enable row level security;
alter table public.shopping_items enable row level security;
alter table public.care_log_entries enable row level security;

create policy "profiles: owner full access" on public.profiles
  for all using (auth.uid() = id) with check (auth.uid() = id);

create policy "pets: owner full access" on public.pets
  for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

create policy "daily_care_items: owner full access" on public.daily_care_items
  for all using (
    exists (select 1 from public.pets where pets.id = daily_care_items.pet_id and pets.owner_id = auth.uid())
  ) with check (
    exists (select 1 from public.pets where pets.id = daily_care_items.pet_id and pets.owner_id = auth.uid())
  );

create policy "daily_completions: owner full access" on public.daily_completions
  for all using (
    exists (select 1 from public.pets where pets.id = daily_completions.pet_id and pets.owner_id = auth.uid())
  ) with check (
    exists (select 1 from public.pets where pets.id = daily_completions.pet_id and pets.owner_id = auth.uid())
  );

create policy "reminders: owner full access" on public.reminders
  for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

create policy "shopping_items: owner full access" on public.shopping_items
  for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

create policy "care_log_entries: owner full access" on public.care_log_entries
  for all using (
    exists (select 1 from public.pets where pets.id = care_log_entries.pet_id and pets.owner_id = auth.uid())
  ) with check (
    exists (select 1 from public.pets where pets.id = care_log_entries.pet_id and pets.owner_id = auth.uid())
  );
