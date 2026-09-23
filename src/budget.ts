import { supabase } from './supabaseClient'
import { currentMonthKey } from './timezone'
import { showOnly } from './views'
import { refreshCurrentPet, patchCachedPet } from './pets'
import { currencySymbol, formatMoney } from './currency'
import { $, esc } from './dom'

type ShopCategory = 'Food' | 'Litter & Bedding' | 'Medical' | 'Toys' | 'Grooming' | 'Tank/Enclosure' | 'Other'
type PetType = 'dog' | 'cat' | 'small_animal' | 'bird' | 'reptile' | 'fish' | 'other'

interface ShoppingRow {
  id: string
  item: string
  qty: string | null
  category: ShopCategory
  due_date: string | null
  est_price: number | null
  got: boolean
  got_month: string | null
  shopping_item_pets: { pet_id: string; pets: { name: string } | null }[]
}

interface PetBudgetRow {
  id: string
  name: string
  type: PetType
  monthly_budget: number | null
}

interface RowData {
  key: string
  label: string
  emoji: string
  budget: number | null
  spent: number
}

const typeEmoji: Record<PetType, string> = {
  dog: '🐕',
  cat: '🐈',
  small_animal: '🐹',
  bird: '🐦',
  reptile: '🦎',
  fish: '🐠',
  other: '🐾',
}

const trendPalette = [
  'var(--moss)',
  'var(--honey)',
  'var(--clay)',
  'var(--moss-deep)',
  'color-mix(in srgb, var(--moss) 50%, var(--honey))',
  'color-mix(in srgb, var(--clay) 50%, var(--honey))',
  'color-mix(in srgb, var(--moss) 50%, var(--clay))',
  'color-mix(in srgb, var(--moss-deep) 60%, var(--honey))',
]

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  const dt = new Date(iso + 'T00:00:00')
  return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function monthLabel(key: string): string {
  const [y, m] = key.split('-').map(Number)
  return new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
}

function monthLabelShort(key: string): string {
  const [y, m] = key.split('-').map(Number)
  return new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'short' })
}

function shiftMonthKey(key: string, delta: number): string {
  const [y, m] = key.split('-').map(Number)
  const d = new Date(y, m - 1 + delta, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

let pets: PetBudgetRow[] = []
let miscBudget: number | null = null
let items: ShoppingRow[] = []
let selectedForPetIds = new Set<string>()
let wired = false
let viewingMonth: string | null = null // null = current (live, editable)
let availableMonths: string[] = [] // past months with archived data, descending

async function fetchAvailableMonths(userId: string) {
  const { data, error } = await supabase.from('budget_snapshots').select('month').eq('owner_id', userId)
  if (error) {
    console.error('Failed to load budget history months', error)
    availableMonths = []
    return
  }
  availableMonths = Array.from(new Set((data || []).map((r: { month: string }) => r.month))).sort().reverse()
}

async function fetchAll() {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return

  if (!viewingMonth) {
    const [petsRes, profileRes, itemsRes] = await Promise.all([
      supabase.from('pets').select('id, name, type, monthly_budget').eq('status', 'active').order('created_at', { ascending: true }),
      supabase.from('profiles').select('misc_monthly_budget').eq('id', user.id).single(),
      supabase
        .from('shopping_items')
        .select('*, shopping_item_pets(pet_id, pets(name))')
        .is('archived_month', null)
        .order('created_at', { ascending: true }),
    ])
    pets = (petsRes.data as PetBudgetRow[]) || []
    miscBudget = profileRes.data?.misc_monthly_budget ?? null
    items = (itemsRes.data as unknown as ShoppingRow[]) || []
    return
  }

  const [snapshotsRes, allPetsRes, itemsRes] = await Promise.all([
    supabase.from('budget_snapshots').select('pet_id, budget').eq('owner_id', user.id).eq('month', viewingMonth),
    supabase.from('pets').select('id, name, type'),
    supabase
      .from('shopping_items')
      .select('*, shopping_item_pets(pet_id, pets(name))')
      .eq('archived_month', viewingMonth)
      .order('created_at', { ascending: true }),
  ])
  const snapshots = (snapshotsRes.data as { pet_id: string | null; budget: number | null }[]) || []
  const petLookup = new Map((allPetsRes.data as { id: string; name: string; type: PetType }[] | null || []).map((p) => [p.id, p]))
  pets = snapshots
    .filter((s) => s.pet_id !== null)
    .map((s) => {
      const p = petLookup.get(s.pet_id as string)
      return { id: s.pet_id as string, name: p?.name || 'Unknown pet', type: p?.type || 'other', monthly_budget: s.budget }
    })
  miscBudget = snapshots.find((s) => s.pet_id === null)?.budget ?? null
  items = (itemsRes.data as unknown as ShoppingRow[]) || []
}

/** An item shared across N pets splits its cost evenly N ways, rather than charging the full price to each. */
function itemShareFor(item: ShoppingRow): number {
  const n = item.shopping_item_pets.length
  return (Number(item.est_price) || 0) / (n || 1)
}

function computeRows(): RowData[] {
  const month = viewingMonth || currentMonthKey()
  const rows: RowData[] = pets.map((p) => ({
    key: p.id,
    label: p.name,
    emoji: typeEmoji[p.type] || '🐾',
    budget: p.monthly_budget,
    spent: items
      .filter((i) => i.shopping_item_pets.some((a) => a.pet_id === p.id) && i.got && i.got_month === month)
      .reduce((s, i) => s + itemShareFor(i), 0),
  }))
  const miscSpent = items
    .filter((i) => !i.shopping_item_pets.length && i.got && i.got_month === month)
    .reduce((s, i) => s + (Number(i.est_price) || 0), 0)
  rows.push({ key: 'misc', label: 'Miscellaneous', emoji: '🧺', budget: miscBudget, spent: miscSpent })
  return rows
}

function renderMonthBar() {
  $('budgetHistoryBanner').style.display = viewingMonth ? '' : 'none'
  $('budgetMonthNote').textContent = viewingMonth
    ? `Viewing ${monthLabel(viewingMonth)}.`
    : `Tracking ${monthLabel(currentMonthKey())} — resets automatically on the 1st of each month.`
  ;($('budgetNextBtn') as HTMLButtonElement).disabled = !viewingMonth

  const picker = $('budgetMonthPicker') as HTMLSelectElement
  const options = ['<option value="">This month</option>']
  const months = viewingMonth && !availableMonths.includes(viewingMonth) ? [viewingMonth, ...availableMonths].sort().reverse() : availableMonths
  months.forEach((m) => {
    options.push(`<option value="${m}">${esc(monthLabel(m))}</option>`)
  })
  picker.innerHTML = options.join('')
  picker.value = viewingMonth || ''
}

function applyReadOnlyState() {
  const readonly = !!viewingMonth
  $('miscExpenseAddRow').style.display = readonly ? 'none' : ''
  $('fullShopAddRow').style.display = readonly ? 'none' : ''
  $('fullShoppingBody').classList.toggle('readonly', readonly)
  $('fullShoppingHeading').textContent = readonly ? 'Shopping List' : 'Full Shopping List'
}

function renderBudgetInputs() {
  const wrap = $('budgetPetInputs')
  const readonly = !!viewingMonth
  if (!pets.length) {
    wrap.innerHTML = `<div class="empty-state" style="padding:0;">${readonly ? 'No budgets recorded for this month.' : 'Add a pet to set a budget.'}</div>`
  } else if (readonly) {
    wrap.innerHTML = pets
      .map(
        (p) => `
        <label class="shop-budget-item"><span class="pet-emoji-sm">${typeEmoji[p.type]}</span>${esc(p.name)}
          <span class="budget-readonly-value">${p.monthly_budget != null ? formatMoney(Number(p.monthly_budget)) : 'No budget set'}</span>
        </label>
      `
      )
      .join('')
  } else {
    wrap.innerHTML = pets
      .map(
        (p) => `
        <label class="shop-budget-item"><span class="pet-emoji-sm">${typeEmoji[p.type]}</span>${esc(p.name)}
          <span class="budget-dollar">${currencySymbol()}</span>
          <input type="number" step="0.01" min="0" class="budget-input pet-budget-input" data-pet="${p.id}" placeholder="No budget" value="${p.monthly_budget ?? ''}">
        </label>
      `
      )
      .join('')
    wrap.querySelectorAll<HTMLInputElement>('.pet-budget-input').forEach((input) => {
      input.addEventListener('change', async () => {
        const petId = input.dataset.pet!
        const value = input.value ? Number(input.value) : null
        const { error } = await supabase.from('pets').update({ monthly_budget: value }).eq('id', petId)
        if (error) {
          console.error(error)
          return
        }
        const pet = pets.find((p) => p.id === petId)
        if (pet) pet.monthly_budget = value
        patchCachedPet(petId, { monthly_budget: value })
        renderHeroAndRows()
        refreshCurrentPet()
      })
    })
  }

  $('budgetMiscDollar').textContent = currencySymbol()
  const miscInput = $('budget-misc') as HTMLInputElement
  if (readonly) {
    miscInput.value = miscBudget != null ? String(miscBudget) : ''
    miscInput.disabled = true
  } else {
    miscInput.value = miscBudget != null ? String(miscBudget) : ''
    miscInput.disabled = false
  }
}

async function saveMiscBudget() {
  const value = ($('budget-misc') as HTMLInputElement).value
  const monthly = value ? Number(value) : null
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return
  const { error } = await supabase.from('profiles').update({ misc_monthly_budget: monthly }).eq('id', user.id)
  if (error) {
    console.error(error)
    return
  }
  miscBudget = monthly
  renderHeroAndRows()
}

function renderMiscExpenseList() {
  const wrap = $('miscExpenseList')
  const readonly = !!viewingMonth
  const miscItems = items.filter((i) => !i.shopping_item_pets.length)
  if (!miscItems.length) {
    wrap.innerHTML = '<div class="empty-state" style="padding:6px 0;">Nothing logged yet.</div>'
    return
  }
  wrap.innerHTML = miscItems
    .map(
      (i) => `
      <div class="reminder-row" data-id="${i.id}">
        <span class="care-label">${esc(i.item)}${i.est_price != null ? ` — ${formatMoney(Number(i.est_price))}` : ''}</span>
        ${readonly ? '' : `<button class="delete-btn misc-expense-delete" data-id="${i.id}" aria-label="Remove expense">×</button>`}
      </div>
    `
    )
    .join('')
  wrap.querySelectorAll<HTMLButtonElement>('.misc-expense-delete').forEach((btn) => {
    btn.addEventListener('click', () => deleteShoppingItem(btn.dataset.id!))
  })
}

async function addMiscExpense() {
  const itemInput = $('misc-expense-item') as HTMLInputElement
  const priceInput = $('misc-expense-price') as HTMLInputElement
  const itemVal = itemInput.value.trim()
  if (!itemVal) {
    itemInput.focus()
    return
  }
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return
  const { data, error } = await supabase
    .from('shopping_items')
    .insert({
      owner_id: user.id,
      item: itemVal,
      category: 'Other' as ShopCategory,
      est_price: priceInput.value ? Number(priceInput.value) : null,
      got: true,
      got_month: currentMonthKey(),
    })
    .select()
    .single()
  if (error) {
    console.error(error)
    return
  }
  items.push({ ...(data as Omit<ShoppingRow, 'shopping_item_pets'>), shopping_item_pets: [] })
  itemInput.value = ''
  priceInput.value = ''
  renderEverythingAfterItemsChange()
  itemInput.focus()
}

function renderHeroAndRows() {
  const rows = computeRows()
  const totalBudget = rows.reduce((s, r) => s + (r.budget || 0), 0)
  const totalSpent = rows.reduce((s, r) => s + r.spent, 0)
  const overBudget = totalBudget > 0 && totalSpent > totalBudget

  $('budgetHeroAmount').innerHTML =
    `<span class="${overBudget ? 'over' : ''}">${formatMoney(totalSpent)}</span> ` +
    `<span style="font-size:18px; color:var(--ink-soft); font-weight:400;">of ${formatMoney(totalBudget)}</span>`
  $('budgetHeroSub').textContent =
    totalBudget > 0
      ? `${Math.round((totalSpent / totalBudget) * 100)}% of ${viewingMonth ? "that month's" : "this month's"} total budget${overBudget ? ' — over budget' : ''}`
      : 'No budget set yet'

  const bigPct = totalBudget > 0 ? Math.min(100, (totalSpent / totalBudget) * 100) : 0
  const bigFill = $('budgetBarBig')
  bigFill.style.width = bigPct + '%'
  bigFill.className = 'budget-bar-big-fill' + (overBudget ? ' over' : '')

  const rowList = $('budgetRowList')
  rowList.innerHTML = rows
    .map((r) => {
      const hasBudget = r.budget !== null && r.budget !== undefined && r.budget > 0
      const pct = hasBudget ? Math.min(100, (r.spent / (r.budget as number)) * 100) : r.spent > 0 ? 100 : 0
      const rOver = hasBudget && r.spent > (r.budget as number)
      const amounts = hasBudget
        ? `${formatMoney(r.spent)} of ${formatMoney(r.budget as number)}`
        : `${formatMoney(r.spent)} spent — no budget set`
      return `
        <div class="budget-row-item${hasBudget ? '' : ' no-budget'}">
          <div class="budget-row-top"><span class="label">${r.emoji} ${esc(r.label)}</span><span class="amounts">${amounts}</span></div>
          <div class="budget-track-pair"><div class="fill${rOver ? ' over' : ''}" style="width:${pct}%;"></div></div>
        </div>
      `
    })
    .join('')

  renderDonut(rows, totalBudget, totalSpent)
}

function renderDonut(rows: RowData[], totalBudget: number, totalSpent: number) {
  const svg = $('budgetDonut')
  const legend = $('budgetDonutLegend')
  const size = 140
  const stroke = 18
  const r = (size - stroke) / 2
  const c = size / 2
  const circumference = 2 * Math.PI * r
  let spentFrac = totalBudget > 0 ? totalSpent / totalBudget : totalSpent > 0 ? 1 : 0
  const over = spentFrac > 1
  spentFrac = Math.min(1, spentFrac)
  const spentLen = circumference * spentFrac
  const remainLen = circumference - spentLen
  const spentColor = over ? 'var(--clay)' : 'var(--moss)'

  svg.innerHTML = `
    <circle cx="${c}" cy="${c}" r="${r}" fill="none" style="stroke: var(--mist); stroke-width:${stroke};"/>
    <circle cx="${c}" cy="${c}" r="${r}" fill="none" style="stroke: ${spentColor}; stroke-width:${stroke}; stroke-dasharray: ${spentLen} ${remainLen}; stroke-linecap: round; transform: rotate(-90deg); transform-origin: ${c}px ${c}px;"/>
    <text x="${c}" y="${c - 2}" text-anchor="middle" style="font-family: 'Fraunces', serif; font-size: 20px; font-weight: 600; fill: var(--ink);">${Math.round(spentFrac * 100)}%</text>
    <text x="${c}" y="${c + 16}" text-anchor="middle" style="font-size: 10.5px; fill: var(--ink-soft);">spent</text>
  `
  legend.innerHTML = `
    <div class="legend-row"><span class="swatch" style="background:${spentColor};"></span>Spent — ${formatMoney(totalSpent)}</div>
    <div class="legend-row"><span class="swatch" style="background: var(--mist);"></span>${over ? 'Over budget by' : 'Remaining'} — ${formatMoney(Math.abs(totalBudget - totalSpent))}</div>
  `
  void rows
}

// ── Spending trend (last 6 months, overall + per pet) ───────────────────

async function renderTrendChart() {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return

  const monthKeys: string[] = []
  for (let i = 5; i >= 0; i--) monthKeys.push(shiftMonthKey(currentMonthKey(), -i))

  const [itemsRes, petsRes] = await Promise.all([
    supabase
      .from('shopping_items')
      .select('got_month, est_price, shopping_item_pets(pet_id)')
      .eq('owner_id', user.id)
      .eq('got', true)
      .in('got_month', monthKeys),
    supabase.from('pets').select('id, name'),
  ])
  const rows = (itemsRes.data as { got_month: string; est_price: number | null; shopping_item_pets: { pet_id: string }[] }[]) || []
  const petNames = new Map((petsRes.data as { id: string; name: string }[] | null || []).map((p) => [p.id, p.name]))

  // Ordered list of "series" (pets that have spend in this window, plus Misc last if present)
  const seriesIds = Array.from(new Set(rows.flatMap((r) => r.shopping_item_pets.map((a) => a.pet_id))))
  const hasMisc = rows.some((r) => !r.shopping_item_pets.length)
  const series: { id: string | null; label: string }[] = seriesIds.map((id) => ({ id, label: petNames.get(id) || 'Pet' }))
  if (hasMisc) series.push({ id: null, label: 'Miscellaneous' })

  // totals[monthKey][seriesIndex] = amount
  const totals: number[][] = monthKeys.map(() => series.map(() => 0))
  rows.forEach((r) => {
    const mi = monthKeys.indexOf(r.got_month)
    if (mi === -1) return
    const assignedIds = r.shopping_item_pets.length ? r.shopping_item_pets.map((a) => a.pet_id) : [null]
    const share = (Number(r.est_price) || 0) / assignedIds.length
    assignedIds.forEach((petId) => {
      const si = series.findIndex((s) => s.id === petId)
      if (si === -1) return
      totals[mi][si] += share
    })
  })
  const monthTotals = totals.map((seriesAmounts) => seriesAmounts.reduce((s, v) => s + v, 0))
  const maxTotal = Math.max(1, ...monthTotals)

  const svg = $('trendChart')
  const legend = $('trendLegend')
  const W = 600
  const H = 180
  const padBottom = 24
  const padTop = 10
  const chartH = H - padBottom - padTop
  const barSlot = W / monthKeys.length
  const barW = Math.min(48, barSlot * 0.55)

  let bars = ''
  monthKeys.forEach((mk, i) => {
    const cx = barSlot * i + barSlot / 2
    let yCursor = H - padBottom
    series.forEach((_s, si) => {
      const amt = totals[i][si]
      if (amt <= 0) return
      const segH = (amt / maxTotal) * chartH
      yCursor -= segH
      bars += `<rect x="${cx - barW / 2}" y="${yCursor}" width="${barW}" height="${segH}" fill="${trendPalette[si % trendPalette.length]}" rx="2"/>`
    })
    bars += `<text x="${cx}" y="${H - 6}" text-anchor="middle" style="font-size:11px; fill:var(--ink-soft);">${esc(monthLabelShort(mk))}</text>`
    if (monthTotals[i] > 0) {
      bars += `<text x="${cx}" y="${Math.max(padTop - 2, H - padBottom - (monthTotals[i] / maxTotal) * chartH - 6)}" text-anchor="middle" style="font-size:10px; fill:var(--ink-soft);">${currencySymbol()}${monthTotals[i].toFixed(0)}</text>`
    }
  })
  svg.innerHTML = bars || `<text x="${W / 2}" y="${H / 2}" text-anchor="middle" style="font-size:13px; fill:var(--ink-soft);">No spending logged yet.</text>`

  legend.innerHTML = series
    .map((s, si) => `<div class="legend-row"><span class="swatch" style="background:${trendPalette[si % trendPalette.length]};"></span>${esc(s.label)}</div>`)
    .join('')
}

// ── Budget report (year-to-date / quarter-to-date) ──────────────────────

function monthsFrom(startMonth: number, endMonth: number, year: string): string[] {
  const months: string[] = []
  for (let m = startMonth; m <= endMonth; m++) months.push(`${year}-${String(m).padStart(2, '0')}`)
  return months
}

async function renderBudgetReport() {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return

  const year = currentMonthKey().slice(0, 4)
  const curMonthNum = Number(currentMonthKey().slice(5, 7))
  const quarterStartMonth = Math.floor((curMonthNum - 1) / 3) * 3 + 1
  const ytdMonths = monthsFrom(1, curMonthNum, year)
  const qtdMonths = monthsFrom(quarterStartMonth, curMonthNum, year)

  const [snapshotsRes, livePetsRes, profileRes, itemsRes] = await Promise.all([
    supabase.from('budget_snapshots').select('month, budget').eq('owner_id', user.id).in('month', ytdMonths),
    supabase.from('pets').select('monthly_budget').eq('owner_id', user.id).eq('status', 'active'),
    supabase.from('profiles').select('misc_monthly_budget').eq('id', user.id).single(),
    supabase
      .from('shopping_items')
      .select('got_month, est_price, category')
      .eq('owner_id', user.id)
      .eq('got', true)
      .in('got_month', ytdMonths),
  ])

  const snapshotByMonth = new Map<string, number>()
  ;((snapshotsRes.data as { month: string; budget: number | null }[]) || []).forEach((s) => {
    snapshotByMonth.set(s.month, (snapshotByMonth.get(s.month) || 0) + (Number(s.budget) || 0))
  })
  const liveMonthTotal =
    ((livePetsRes.data as { monthly_budget: number | null }[]) || []).reduce((sum, p) => sum + (Number(p.monthly_budget) || 0), 0) +
    (Number(profileRes.data?.misc_monthly_budget) || 0)

  const spentByMonth = new Map<string, number>()
  const categoryTotals = new Map<string, number>()
  ;((itemsRes.data as { got_month: string; est_price: number | null; category: string }[]) || []).forEach((r) => {
    const price = Number(r.est_price) || 0
    spentByMonth.set(r.got_month, (spentByMonth.get(r.got_month) || 0) + price)
    categoryTotals.set(r.category, (categoryTotals.get(r.category) || 0) + price)
  })

  const budgetFor = (m: string) => (m === currentMonthKey() ? liveMonthTotal : snapshotByMonth.get(m) ?? 0)
  const spentFor = (m: string) => spentByMonth.get(m) || 0

  const mtdBudget = budgetFor(currentMonthKey())
  const mtdSpent = spentFor(currentMonthKey())
  const ytdBudget = ytdMonths.reduce((s, m) => s + budgetFor(m), 0)
  const ytdSpent = ytdMonths.reduce((s, m) => s + spentFor(m), 0)
  const qtdBudget = qtdMonths.reduce((s, m) => s + budgetFor(m), 0)
  const qtdSpent = qtdMonths.reduce((s, m) => s + spentFor(m), 0)
  const avgMonthlySpend = ytdSpent / ytdMonths.length

  const periodBlock = (label: string, spent: number, budget: number) => {
    const pct = budget > 0 ? Math.min(100, (spent / budget) * 100) : spent > 0 ? 100 : 0
    const over = budget > 0 && spent > budget
    return `
      <div class="report-period">
        <div class="report-period-label">${esc(label)}</div>
        <div class="report-period-amount ${over ? 'over' : ''}">${formatMoney(spent)}</div>
        <div class="report-period-sub">of ${budget > 0 ? formatMoney(budget) : 'no budget set'}</div>
        <div class="progress-track"><div class="progress-fill ${over ? 'over' : ''}" style="width:${pct}%;"></div></div>
      </div>
    `
  }

  $('reportPeriodGrid').innerHTML =
    periodBlock('Month to date', mtdSpent, mtdBudget) +
    periodBlock('This quarter', qtdSpent, qtdBudget) +
    periodBlock(`Year to date (${year})`, ytdSpent, ytdBudget)

  const topCategories = Array.from(categoryTotals.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)

  $('reportExtra').innerHTML = `
    <div class="report-stat-row"><span>Average monthly spend (YTD)</span><strong>${formatMoney(avgMonthlySpend)}</strong></div>
    ${
      topCategories.length
        ? `<div class="section-label" style="margin-top:14px;">Top categories (YTD)</div>` +
          topCategories.map(([cat, amt]) => `<div class="report-stat-row"><span>${esc(cat)}</span><strong>${formatMoney(amt)}</strong></div>`).join('')
        : ''
    }
  `
}

function renderForOptions() {
  const btn = $('fullShopForBtn')
  const panel = $('fullShopForPanel')
  const selectedNames = pets.filter((p) => selectedForPetIds.has(p.id)).map((p) => p.name)
  btn.textContent = selectedNames.length ? selectedNames.join(', ') : 'General'
  if (!pets.length) {
    panel.innerHTML = '<div class="for-multiselect-empty">Add a pet first.</div>'
    return
  }
  panel.innerHTML = pets
    .map(
      (p) => `
      <label class="for-multiselect-option">
        <input type="checkbox" value="${p.id}" ${selectedForPetIds.has(p.id) ? 'checked' : ''}>
        ${typeEmoji[p.type]} ${esc(p.name)}
      </label>
    `
    )
    .join('')
}

function renderFullShoppingTable() {
  const body = $('fullShoppingBody')
  if (!items.length) {
    body.innerHTML = `<tr><td colspan="8" class="empty-state">${viewingMonth ? 'Nothing was on the list that month.' : 'Nothing on any list yet.'}</td></tr>`
    return
  }
  body.innerHTML = items
    .map((item) => {
      const n = item.shopping_item_pets.length
      const forLabel = n ? item.shopping_item_pets.map((a) => esc(a.pets?.name || 'Unknown pet')).join(', ') : 'General'
      const splitHint = n > 1 && item.est_price != null ? `<div class="split-hint">${formatMoney(itemShareFor(item))} each</div>` : ''
      return `
        <tr class="${item.got ? 'got' : ''}" data-id="${item.id}">
          <td><button class="shop-check" aria-label="Mark as bought"></button></td>
          <td class="shop-item-cell">${esc(item.item)}</td>
          <td>${item.qty ? esc(item.qty) : ''}</td>
          <td><span class="care-chip">${item.category}</span></td>
          <td>${esc(formatDate(item.due_date))}</td>
          <td>${item.est_price != null ? formatMoney(Number(item.est_price)) : '—'}${splitHint}</td>
          <td>${forLabel}</td>
          <td><button class="delete-btn" aria-label="Remove item">×</button></td>
        </tr>
      `
    })
    .join('')
}

async function toggleGot(id: string) {
  const item = items.find((i) => i.id === id)
  if (!item) return
  const got = !item.got
  const got_month = got ? currentMonthKey() : null
  const { error } = await supabase.from('shopping_items').update({ got, got_month }).eq('id', id)
  if (error) {
    console.error(error)
    return
  }
  item.got = got
  item.got_month = got_month
  renderEverythingAfterItemsChange()
}

async function deleteShoppingItem(id: string) {
  const { error } = await supabase.from('shopping_items').delete().eq('id', id)
  if (error) {
    console.error(error)
    return
  }
  items = items.filter((i) => i.id !== id)
  renderEverythingAfterItemsChange()
}

async function addFullShoppingItem() {
  const itemInput = $('full-shop-item') as HTMLInputElement
  const qtyInput = $('full-shop-qty') as HTMLInputElement
  const catSelect = $('full-shop-cat') as HTMLSelectElement
  const dueInput = $('full-shop-due') as HTMLInputElement
  const priceInput = $('full-shop-price') as HTMLInputElement

  const itemVal = itemInput.value.trim()
  if (!itemVal) {
    itemInput.focus()
    return
  }
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return

  const { data, error } = await supabase
    .from('shopping_items')
    .insert({
      owner_id: user.id,
      item: itemVal,
      qty: qtyInput.value.trim() || null,
      category: catSelect.value as ShopCategory,
      due_date: dueInput.value || null,
      est_price: priceInput.value ? Number(priceInput.value) : null,
      got: false,
    })
    .select()
    .single()

  if (error) {
    console.error(error)
    return
  }

  const petIds = Array.from(selectedForPetIds)
  if (petIds.length) {
    const { error: linkError } = await supabase
      .from('shopping_item_pets')
      .insert(petIds.map((pet_id) => ({ shopping_item_id: data.id, pet_id, owner_id: user.id })))
    if (linkError) console.error(linkError)
  }

  const row: ShoppingRow = {
    ...(data as Omit<ShoppingRow, 'shopping_item_pets'>),
    shopping_item_pets: petIds.map((pet_id) => ({ pet_id, pets: { name: pets.find((p) => p.id === pet_id)?.name || '' } })),
  }
  items.push(row)
  itemInput.value = ''
  qtyInput.value = ''
  dueInput.value = ''
  priceInput.value = ''
  selectedForPetIds = new Set()
  renderForOptions()
  $('fullShopForPanel').classList.remove('open')
  renderEverythingAfterItemsChange()
  itemInput.focus()
}

function renderEverythingAfterItemsChange() {
  renderMiscExpenseList()
  renderFullShoppingTable()
  renderHeroAndRows()
  refreshCurrentPet()
}

async function goToMonth(month: string | null) {
  viewingMonth = month
  await renderBudget()
}

function wireStaticControls() {
  $('budgetBackBtn').addEventListener('click', hideBudget)
  $('budget-misc').addEventListener('change', saveMiscBudget)
  $('miscExpenseAddBtn').addEventListener('click', addMiscExpense)
  $('fullShopAddBtn').addEventListener('click', addFullShoppingItem)
  $('budgetPrevBtn').addEventListener('click', () => goToMonth(shiftMonthKey(viewingMonth || currentMonthKey(), -1)))
  $('budgetNextBtn').addEventListener('click', () => {
    if (!viewingMonth) return
    const next = shiftMonthKey(viewingMonth, 1)
    goToMonth(next >= currentMonthKey() ? null : next)
  })
  ;($('budgetMonthPicker') as HTMLSelectElement).addEventListener('change', (e) => {
    const value = (e.target as HTMLSelectElement).value
    goToMonth(value || null)
  })
  ;['full-shop-item', 'full-shop-qty'].forEach((id) => {
    document.getElementById(id)?.addEventListener('keydown', (e) => {
      if ((e as KeyboardEvent).key === 'Enter') {
        e.preventDefault()
        addFullShoppingItem()
      }
    })
  })
  $('fullShoppingBody').addEventListener('click', (e) => {
    if (viewingMonth) return
    const row = (e.target as HTMLElement).closest('tr') as HTMLElement | null
    if (!row || !row.dataset.id) return
    const id = row.dataset.id
    if ((e.target as HTMLElement).closest('.shop-check')) {
      toggleGot(id)
    } else if ((e.target as HTMLElement).closest('.delete-btn')) {
      deleteShoppingItem(id)
    }
  })
  $('fullShopForBtn').addEventListener('click', (e) => {
    e.stopPropagation()
    $('fullShopForPanel').classList.toggle('open')
  })
  $('fullShopForPanel').addEventListener('change', (e) => {
    const input = e.target as HTMLInputElement
    if (input.checked) selectedForPetIds.add(input.value)
    else selectedForPetIds.delete(input.value)
    renderForOptions()
  })
  $('fullShopForPanel').addEventListener('click', (e) => e.stopPropagation())
  document.addEventListener('click', () => $('fullShopForPanel').classList.remove('open'))
}

async function renderBudget() {
  await fetchAll()
  renderMonthBar()
  applyReadOnlyState()
  renderBudgetInputs()
  renderMiscExpenseList()
  renderForOptions()
  renderFullShoppingTable()
  renderHeroAndRows()
  await renderTrendChart()
  await renderBudgetReport()
}

export async function showBudget() {
  if (!wired) {
    wireStaticControls()
    wired = true
  }
  showOnly('budgetView')
  viewingMonth = null
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (user) await fetchAvailableMonths(user.id)
  await renderBudget()
}

export function hideBudget() {
  showOnly('appMain')
}

/** Re-renders the budget page's money displays after the account currency changes — a no-op if the page isn't open. */
export async function refreshBudgetCurrency() {
  if ($('budgetView').style.display === 'none') return
  await renderBudget()
}
