import { supabase } from './supabaseClient'
import { currentMonthKey } from './timezone'
import { showOnly } from './views'
import { refreshCurrentPet, patchCachedPet } from './pets'
import { $, esc } from './dom'

type ShopCategory = 'Food' | 'Litter & Bedding' | 'Medical' | 'Toys' | 'Grooming' | 'Tank/Enclosure' | 'Other'
type PetType = 'dog' | 'cat' | 'small_animal' | 'bird' | 'reptile' | 'fish' | 'other'

interface ShoppingRow {
  id: string
  pet_id: string | null
  item: string
  qty: string | null
  category: ShopCategory
  due_date: string | null
  est_price: number | null
  got: boolean
  got_month: string | null
  pets: { name: string } | null
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

const categoryColor: Record<ShopCategory, string> = {
  Food: 'honey',
  'Litter & Bedding': 'moss',
  Medical: 'clay',
  Toys: 'honey',
  Grooming: 'moss',
  'Tank/Enclosure': 'moss',
  Other: 'moss',
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
      supabase.from('shopping_items').select('*, pets(name)').is('archived_month', null).order('created_at', { ascending: true }),
    ])
    pets = (petsRes.data as PetBudgetRow[]) || []
    miscBudget = profileRes.data?.misc_monthly_budget ?? null
    items = (itemsRes.data as unknown as ShoppingRow[]) || []
    return
  }

  const [snapshotsRes, allPetsRes, itemsRes] = await Promise.all([
    supabase.from('budget_snapshots').select('pet_id, budget').eq('owner_id', user.id).eq('month', viewingMonth),
    supabase.from('pets').select('id, name, type'),
    supabase.from('shopping_items').select('*, pets(name)').eq('archived_month', viewingMonth).order('created_at', { ascending: true }),
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

function computeRows(): RowData[] {
  const month = viewingMonth || currentMonthKey()
  const rows: RowData[] = pets.map((p) => ({
    key: p.id,
    label: p.name,
    emoji: typeEmoji[p.type] || '🐾',
    budget: p.monthly_budget,
    spent: items.filter((i) => i.pet_id === p.id && i.got && i.got_month === month).reduce((s, i) => s + (Number(i.est_price) || 0), 0),
  }))
  const miscSpent = items.filter((i) => !i.pet_id && i.got && i.got_month === month).reduce((s, i) => s + (Number(i.est_price) || 0), 0)
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
          <span class="budget-readonly-value">${p.monthly_budget != null ? '$' + Number(p.monthly_budget).toFixed(2) : 'No budget set'}</span>
        </label>
      `
      )
      .join('')
  } else {
    wrap.innerHTML = pets
      .map(
        (p) => `
        <label class="shop-budget-item"><span class="pet-emoji-sm">${typeEmoji[p.type]}</span>${esc(p.name)}
          <span class="budget-dollar">$</span>
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
  const miscItems = items.filter((i) => !i.pet_id)
  if (!miscItems.length) {
    wrap.innerHTML = '<div class="empty-state" style="padding:6px 0;">Nothing logged yet.</div>'
    return
  }
  wrap.innerHTML = miscItems
    .map(
      (i) => `
      <div class="reminder-row" data-id="${i.id}">
        <span class="care-label">${esc(i.item)}${i.est_price != null ? ` — $${Number(i.est_price).toFixed(2)}` : ''}</span>
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
      pet_id: null,
      item: itemVal,
      category: 'Other' as ShopCategory,
      est_price: priceInput.value ? Number(priceInput.value) : null,
      got: true,
      got_month: currentMonthKey(),
    })
    .select('*, pets(name)')
    .single()
  if (error) {
    console.error(error)
    return
  }
  items.push(data as unknown as ShoppingRow)
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
    `<span class="${overBudget ? 'over' : ''}">$${totalSpent.toFixed(2)}</span> ` +
    `<span style="font-size:18px; color:var(--ink-soft); font-weight:400;">of $${totalBudget.toFixed(2)}</span>`
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
        ? `$${r.spent.toFixed(2)} of $${(r.budget as number).toFixed(2)}`
        : `$${r.spent.toFixed(2)} spent — no budget set`
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
    <div class="legend-row"><span class="swatch" style="background:${spentColor};"></span>Spent — $${totalSpent.toFixed(2)}</div>
    <div class="legend-row"><span class="swatch" style="background: var(--mist);"></span>${over ? 'Over budget by' : 'Remaining'} — $${Math.abs(totalBudget - totalSpent).toFixed(2)}</div>
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
      .select('pet_id, got_month, est_price')
      .eq('owner_id', user.id)
      .eq('got', true)
      .in('got_month', monthKeys),
    supabase.from('pets').select('id, name'),
  ])
  const rows = (itemsRes.data as { pet_id: string | null; got_month: string; est_price: number | null }[]) || []
  const petNames = new Map((petsRes.data as { id: string; name: string }[] | null || []).map((p) => [p.id, p.name]))

  // Ordered list of "series" (pets that have spend in this window, plus Misc last if present)
  const seriesIds = Array.from(new Set(rows.filter((r) => r.pet_id).map((r) => r.pet_id as string)))
  const hasMisc = rows.some((r) => !r.pet_id)
  const series: { id: string | null; label: string }[] = seriesIds.map((id) => ({ id, label: petNames.get(id) || 'Pet' }))
  if (hasMisc) series.push({ id: null, label: 'Miscellaneous' })

  // totals[monthKey][seriesIndex] = amount
  const totals: number[][] = monthKeys.map(() => series.map(() => 0))
  rows.forEach((r) => {
    const mi = monthKeys.indexOf(r.got_month)
    if (mi === -1) return
    const si = series.findIndex((s) => s.id === r.pet_id)
    if (si === -1) return
    totals[mi][si] += Number(r.est_price) || 0
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
      bars += `<text x="${cx}" y="${Math.max(padTop - 2, H - padBottom - (monthTotals[i] / maxTotal) * chartH - 6)}" text-anchor="middle" style="font-size:10px; fill:var(--ink-soft);">$${monthTotals[i].toFixed(0)}</text>`
    }
  })
  svg.innerHTML = bars || `<text x="${W / 2}" y="${H / 2}" text-anchor="middle" style="font-size:13px; fill:var(--ink-soft);">No spending logged yet.</text>`

  legend.innerHTML = series
    .map((s, si) => `<div class="legend-row"><span class="swatch" style="background:${trendPalette[si % trendPalette.length]};"></span>${esc(s.label)}</div>`)
    .join('')
}

function renderForOptions() {
  const sel = $('full-shop-for') as HTMLSelectElement
  let html = '<option value="">General</option>'
  pets.forEach((p) => {
    html += `<option value="${p.id}">${typeEmoji[p.type]} ${esc(p.name)}</option>`
  })
  sel.innerHTML = html
}

function renderFullShoppingTable() {
  const body = $('fullShoppingBody')
  if (!items.length) {
    body.innerHTML = `<tr><td colspan="8" class="empty-state">${viewingMonth ? 'Nothing was on the list that month.' : 'Nothing on any list yet.'}</td></tr>`
    return
  }
  body.innerHTML = items
    .map((item) => {
      const color = categoryColor[item.category] || 'moss'
      const forLabel = item.pets ? esc(item.pets.name) : 'General'
      return `
        <tr class="${item.got ? 'got' : ''}" data-id="${item.id}">
          <td><button class="shop-check" aria-label="Mark as bought"></button></td>
          <td class="shop-item-cell">${esc(item.item)}</td>
          <td>${item.qty ? esc(item.qty) : ''}</td>
          <td><span class="care-chip" style="background: color-mix(in srgb, var(--${color}) 16%, transparent); color: var(--${color});">${item.category}</span></td>
          <td>${esc(formatDate(item.due_date))}</td>
          <td>${item.est_price != null ? '$' + Number(item.est_price).toFixed(2) : '—'}</td>
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
  const forSelect = $('full-shop-for') as HTMLSelectElement

  const itemVal = itemInput.value.trim()
  if (!itemVal) {
    itemInput.focus()
    return
  }
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return

  const petId = forSelect.value || null

  const { data, error } = await supabase
    .from('shopping_items')
    .insert({
      owner_id: user.id,
      pet_id: petId,
      item: itemVal,
      qty: qtyInput.value.trim() || null,
      category: catSelect.value as ShopCategory,
      due_date: dueInput.value || null,
      est_price: priceInput.value ? Number(priceInput.value) : null,
      got: false,
    })
    .select('*, pets(name)')
    .single()

  if (error) {
    console.error(error)
    return
  }

  items.push(data as unknown as ShoppingRow)
  itemInput.value = ''
  qtyInput.value = ''
  dueInput.value = ''
  priceInput.value = ''
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
