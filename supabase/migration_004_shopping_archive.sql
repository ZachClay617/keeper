-- Supports monthly shopping-list archiving (Budget page).
-- Run once in the Supabase SQL Editor.

-- null = still on the live list. Set to a 'YYYY-MM' key once archived at a
-- month boundary — that item then belongs to that month's read-only history.
alter table public.shopping_items
  add column archived_month text;

-- Tracks the last calendar month (YYYY-MM) this account's live shopping list
-- was rolled over for. Compared against the current month on login; when
-- they differ, the previous month's list is archived (see src/shoppingArchive.ts).
alter table public.profiles
  add column last_shopping_reset_month text;
