-- Lets a care log entry carry a time of day, so future-dated entries (a vet
-- appointment, a cage clean) can show as an "Upcoming" section in Care Log
-- and trigger an in-app alert when that time arrives.
-- Run once in the Supabase SQL Editor.

alter table public.care_log_entries add column time text;
