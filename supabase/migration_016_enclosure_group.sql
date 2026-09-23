-- Lets pets be marked as sharing a physical enclosure — a free-text label;
-- any active pets with the same non-empty label are shown as enclosure
-- mates on each other's profile.
-- Run once in the Supabase SQL Editor.

alter table public.pets add column enclosure_group text;
