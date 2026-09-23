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
  }

  const { error: profileError } = await supabase
    .from('profiles')
    .update({ last_shopping_reset_month: currentKey })
    .eq('id', userId)
  if (profileError) console.error('Failed to record shopping archive month', profileError)
}
