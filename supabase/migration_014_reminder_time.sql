-- Lets a reminder carry a daily time of day, so it fires an in-app alert
-- (like a care log entry's time already does) instead of only showing in
-- the bell panel. Reminders have no date — they're evergreen/recurring — so
-- a time-based reminder re-fires once every day it's still set.
-- Run once in the Supabase SQL Editor.

alter table public.reminders add column remind_time text;
