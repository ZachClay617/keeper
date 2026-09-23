-- Replaces manual age entry with an estimated birthday, from which age is
-- computed and displayed live (years, months, days). The old `age` text
-- column is kept as a read-only fallback for pets that predate this and have
-- no birthday set.
-- Run once in the Supabase SQL Editor.

alter table public.pets add column birthday date;
