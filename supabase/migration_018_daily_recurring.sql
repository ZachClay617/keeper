-- Lets a daily care item either repeat every day (the existing default
-- behavior) or be assigned to one specific day only. Next-day planning
-- (planned_tasks) is unaffected by this.
-- Run once in the Supabase SQL Editor.

alter table public.daily_care_items add column recurring boolean not null default true;
alter table public.daily_care_items add column date date;
