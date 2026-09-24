-- Allows multiple habitat readings per pet per day (was one, overwritten).
-- Each "Add" now inserts a new reading instead of upserting, so the
-- readings can be charted over time.
-- Run once in the Supabase SQL Editor.

alter table public.reptile_conditions drop constraint reptile_conditions_pet_id_date_key;
