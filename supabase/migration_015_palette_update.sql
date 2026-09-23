-- Updates the color_palette check constraint to drop 'amber' and allow the
-- 5 new palettes that replaced it.
-- Run once in the Supabase SQL Editor.

alter table public.profiles drop constraint profiles_color_palette_check;
alter table public.profiles add constraint profiles_color_palette_check
  check (color_palette in ('sage', 'blue', 'terracotta', 'lavender', 'teal', 'rose', 'slate'));
