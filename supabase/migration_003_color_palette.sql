-- Adds an account-level color palette preference (Settings > Appearance).
-- Run once in the Supabase SQL Editor.

alter table public.profiles
  add column color_palette text not null default 'sage'
  check (color_palette in ('sage', 'blue', 'amber'));
