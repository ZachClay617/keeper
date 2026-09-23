-- A single account-wide currency choice, used to format every money amount
-- in the app (budget, shopping estimated price, etc). Defaults to USD for
-- existing accounts.
-- Run once in the Supabase SQL Editor.

alter table public.profiles add column currency text not null default 'USD';
