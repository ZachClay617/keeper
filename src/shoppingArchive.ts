import { supabase } from './supabaseClient'
import { currentMonthKey } from './timezone'

function lastDayOfMonth(monthKey: string): string {
  const [y, m] = monthKey.split('-').map(Number)
  const d = new Date(y, m, 0) // day 0 of next month = last day of this month
  const yy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yy}-${mm}-${dd}`
}

/**
 * Snapshots each pet's monthly_budget and the account's misc budget under
 * `month`, since monthly_budget is a single mutable value with no history —
 * without this, "last month's budget" would just be whatever it's set to
 * *today*, which may have changed since.
 */
async function snapshotBudgets(userId: string, month: string) {
  const [petsRes, profileRes] = await Promise.all([
    supabase.from('pets').select('id, monthly_budget').eq('owner_id', userId),
    supabase.from('profiles').select('misc_monthly_budget').eq('id', userId).single(),
  ])
  if (petsRes.error) {
    console.error('Failed to read pets for budget snapshot', petsRes.error)
    return
  }
  const rows = (petsRes.data || []).map((p) => ({ owner_id: userId, pet_id: p.id, month, budget: p.monthly_budget }))
  rows.push({ owner_id: userId, pet_id: null as unknown as string, month, budget: profileRes.data?.misc_monthly_budget ?? null })
  const { error } = await supabase.from('budget_snapshots').insert(rows)
  if (error) console.error('Failed to snapshot budgets', error)
}

/**
 * Archives the previous month's shopping list at a month boundary: every item
 * (bought or not) is stamped with that finished month, except items whose due
 * date is after the reset point — those carry forward untouched on the live
 * list. Runs once per account per month, tracked via profiles.last_shopping_reset_month.
 * A null lastResetMonth (first run for this account) just starts tracking —
 * nothing existing gets archived retroactively.
 */
export async function runMonthlyShoppingArchive(userId: string, lastResetMonth: string | null) {
  const currentKey = currentMonthKey()
  if (lastResetMonth === currentKey) return

  if (lastResetMonth) {
    const cutoff = lastDayOfMonth(lastResetMonth)
    const { error } = await supabase
      .from('shopping_items')
      .update({ archived_month: lastResetMonth })
      .eq('owner_id', userId)
      .is('archived_month', null)
      .or(`due_date.is.null,due_date.lte.${cutoff}`)
    if (error) console.error('Failed to archive shopping list', error)

    await snapshotBudgets(userId, lastResetMonth)
  }

  const { error: profileError } = await supabase
    .from('profiles')
    .update({ last_shopping_reset_month: currentKey })
    .eq('id', userId)
  if (profileError) console.error('Failed to record shopping archive month', profileError)
}
