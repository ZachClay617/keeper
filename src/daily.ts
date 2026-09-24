import { supabase } from './supabaseClient'
import { todayKey } from './timezone'
import { fromF, toF, tempUnitLabel } from './tempUnit'
import { logPetMessage } from './reminders'
import { $, esc } from './dom'

type Category = 'Feeding' | 'Exercise' | 'Medication' | 'Hygiene' | 'Environment' | 'Health'
type PetType = 'dog' | 'cat' | 'small_animal' | 'bird' | 'reptile' | 'fish' | 'other'

interface PetRef {
  id: string
  name: string
  type: PetType
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

interface DailyCareItem {
  id: string
  pet_id: string
  label: string
  time: string | null
  category: Category
  detail: string | null
  recurring: boolean
  date: string | null
  created_at: string
}

/** Recurring items show every day; a non-recurring item only shows on the one day it was assigned. */
function itemShowsOn(item: DailyCareItem, dateKey: string): boolean {
  return item.recurring || item.date === dateKey
}

function formatDateKey(key: string): string {
  const [y, m, d] = key.split('-').map(Number)
  const dt = new Date(y, m - 1, d)
  return dt.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}

function shiftDateKey(key: string, delta: number): string {
  const [y, m, d] = key.split('-').map(Number)
  const dt = new Date(y, m - 1, d)
  dt.setDate(dt.getDate() + delta)
  const yy = dt.getFullYear()
  const mm = String(dt.getMonth() + 1).padStart(2, '0')
  const dd = String(dt.getDate()).padStart(2, '0')
  return `${yy}-${mm}-${dd}`
}

function tomorrowKey(): string {
  return shiftDateKey(todayKey(), 1)
}

interface PlannedTask {
  id: string
  pet_id: string
  date: string
  label: string
  done: boolean
  created_at: string
}

interface ReptileCondition {
  id: string
  pet_id: string
  date: string
  humidity: number | null
  temp_f: number | null
  created_at: string
}

let currentPetId: string | null = null
let currentPet: PetRef | null = null
let items: DailyCareItem[] = []
let completedToday = new Set<string>()
let historyDates: string[] = []
let viewingDate: string | null = null
let wired = false
let plannedForTomorrow: PlannedTask[] = []
let plannedForToday: PlannedTask[] = []
let plannedForViewingDate: PlannedTask[] = []
let planTomorrowOpen = false
/** `${petId}:${dateKey}` combos that have already gotten their "all done" thank-you toast. */
const thanksShown = new Set<string>()
let habitatEntries: ReptileCondition[] = []

async function fetchItems(petId: string) {
  const { data, error } = await supabase
    .from('daily_care_items')
    .select('*')
    .eq('pet_id', petId)
    .order('created_at', { ascending: true })
  if (error) {
    console.error('Failed to load daily care items', error)
    items = []
    return
  }
  items = (data as DailyCareItem[]) || []
}

async function fetchCompletionsForDate(petId: string, date: string): Promise<Set<string>> {
  const { data, error } = await supabase
    .from('daily_completions')
    .select('daily_item_id')
    .eq('pet_id', petId)
    .eq('date', date)
  if (error) {
    console.error('Failed to load completions', error)
    return new Set()
  }
  return new Set((data || []).map((r: { daily_item_id: string }) => r.daily_item_id))
}

async function fetchHistoryDates(petId: string): Promise<string[]> {
  const today = todayKey()
  const { data, error } = await supabase
    .from('daily_completions')
    .select('date')
    .eq('pet_id', petId)
    .lt('date', today)
  if (error) {
    console.error('Failed to load daily history', error)
    return []
  }
  const dates = Array.from(new Set((data || []).map((r: { date: string }) => r.date)))
  return dates.sort().reverse()
}

async function fetchPlannedTasks(petId: string, date: string): Promise<PlannedTask[]> {
  const { data, error } = await supabase
    .from('planned_tasks')
    .select('*')
    .eq('pet_id', petId)
    .eq('date', date)
    .order('created_at', { ascending: true })
  if (error) {
    console.error('Failed to load planned tasks', error)
    return []
  }
  return (data as PlannedTask[]) || []
}

async function fetchHabitatEntries(petId: string): Promise<ReptileCondition[]> {
  const { data, error } = await supabase
    .from('reptile_conditions')
    .select('*')
    .eq('pet_id', petId)
    .order('date', { ascending: false })
    .order('created_at', { ascending: false })
  if (error) {
    console.error('Failed to load habitat conditions', error)
    return []
  }
  return (data as ReptileCondition[]) || []
}

/** Renders a small line chart into `wrapId` for whichever entries have a non-null value from `valueOf`. */
function renderMiniChart(wrapId: string, entries: ReptileCondition[], valueOf: (e: ReptileCondition) => number | null, formatValue: (v: number) => string) {
  const wrap = $(wrapId)
  const points_ = [...entries]
    .reverse() // oldest first, for a left-to-right line
    .map((e) => ({ entry: e, value: valueOf(e) }))
    .filter((p): p is { entry: ReptileCondition; value: number } => p.value != null)
  if (points_.length < 2) {
    wrap.innerHTML = '<div class="empty-state" style="padding:4px 0;">Not enough readings yet.</div>'
    return
  }

  const W = 600
  const H = 120
  const padX = 12
  const padTop = 14
  const padBottom = 20
  const values = points_.map((p) => p.value)
  const minV = Math.min(...values)
  const maxV = Math.max(...values)
  const range = maxV - minV || 1
  const chartH = H - padTop - padBottom
  const stepX = (W - padX * 2) / (points_.length - 1)

  const coords = points_.map((p, i) => {
    const x = padX + stepX * i
    const y = padTop + chartH - ((p.value - minV) / range) * chartH
    return { x, y }
  })

  const linePath = coords.map((c, i) => `${i === 0 ? 'M' : 'L'}${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(' ')
  const areaPath = `${linePath} L${coords[coords.length - 1].x.toFixed(1)},${H - padBottom} L${coords[0].x.toFixed(1)},${H - padBottom} Z`

  const dots = coords
    .map((c, i) => {
      const p = points_[i]
      return `<circle cx="${c.x.toFixed(1)}" cy="${c.y.toFixed(1)}" r="3.5" fill="var(--moss)" stroke="var(--surface)" stroke-width="2"><title>${esc(formatDateKey(p.entry.date))} — ${esc(formatValue(p.value))}</title></circle>`
    })
    .join('')

  const firstLabel = `<text x="${coords[0].x}" y="${H - 5}" text-anchor="start" style="font-size:10px; fill:var(--ink-soft);">${esc(formatDateKey(points_[0].entry.date))}</text>`
  const lastLabel = `<text x="${coords[coords.length - 1].x}" y="${H - 5}" text-anchor="end" style="font-size:10px; fill:var(--ink-soft);">${esc(formatDateKey(points_[points_.length - 1].entry.date))}</text>`

  wrap.innerHTML = `
    <svg viewBox="0 0 ${W} ${H}" class="habitat-chart" preserveAspectRatio="none">
      <path d="${areaPath}" fill="color-mix(in srgb, var(--moss) 14%, transparent)" stroke="none"></path>
      <path d="${linePath}" fill="none" stroke="var(--moss)" stroke-width="2.5"></path>
      ${dots}
      ${firstLabel}
      ${lastLabel}
    </svg>
  `
}

function formatHabitatEntry(e: ReptileCondition): string {
  const parts: string[] = []
  if (e.humidity != null) parts.push(`${e.humidity}% humidity`)
  if (e.temp_f != null) parts.push(`${Math.round(fromF(e.temp_f) * 10) / 10}${tempUnitLabel()}`)
  return parts.join(', ') || 'No values'
}

function renderHabitatList() {
  const wrap = $('habitatList')
  if (!habitatEntries.length) {
    wrap.innerHTML = '<div class="empty-state" style="padding:6px 0;">No readings logged yet.</div>'
    return
  }
  wrap.innerHTML = habitatEntries
    .map(
      (e) => `
      <div class="reminder-row" data-id="${e.id}">
        <span class="care-label">${esc(formatDateKey(e.date))} — ${esc(formatHabitatEntry(e))}</span>
        <button class="delete-btn habitat-delete" data-id="${e.id}" aria-label="Remove reading">×</button>
      </div>
    `
    )
    .join('')
  wrap.querySelectorAll<HTMLButtonElement>('.habitat-delete').forEach((btn) => {
    btn.addEventListener('click', () => deleteHabitatEntry(btn.dataset.id!))
  })
}

function renderHabitatCharts() {
  renderMiniChart('habitatHumidityChartWrap', habitatEntries, (e) => e.humidity, (v) => `${v}%`)
  renderMiniChart('habitatTempChartWrap', habitatEntries, (e) => (e.temp_f != null ? fromF(e.temp_f) : null), (v) => `${Math.round(v * 10) / 10}${tempUnitLabel()}`)
}

function renderHabitatCard() {
  const card = $('habitatCard')
  if (!currentPet || currentPet.type !== 'reptile' || viewingDate) {
    card.style.display = 'none'
    return
  }
  card.style.display = ''
  ;($('habitatTempUnit') as HTMLElement).textContent = tempUnitLabel()
  ;($('habitatTempUnit2') as HTMLElement).textContent = tempUnitLabel()
  renderHabitatCharts()
  renderHabitatList()
}

async function deleteHabitatEntry(id: string) {
  const { error } = await supabase.from('reptile_conditions').delete().eq('id', id)
  if (error) {
    console.error(error)
    return
  }
  habitatEntries = habitatEntries.filter((e) => e.id !== id)
  renderHabitatCharts()
  renderHabitatList()
}

async function saveHabitatCondition() {
  if (!currentPetId) return
  const humidityInput = $('habitat-humidity') as HTMLInputElement
  const tempInput = $('habitat-temp') as HTMLInputElement
  const humidity = humidityInput.value ? Number(humidityInput.value) : null
  const temp_f = tempInput.value ? toF(Number(tempInput.value)) : null
  if (humidity == null && temp_f == null) return
  const { data, error } = await supabase
    .from('reptile_conditions')
    .insert({ pet_id: currentPetId, date: todayKey(), humidity, temp_f })
    .select()
    .single()
  if (error) {
    console.error(error)
    return
  }
  habitatEntries.unshift(data as ReptileCondition)
  humidityInput.value = ''
  tempInput.value = ''
  renderHabitatCharts()
  renderHabitatList()
}

function renderPlanTomorrow() {
  const card = $('planTomorrowCard')
  const body = $('planTomorrowBody')
  const subtitle = $('planTomorrowSubtitle')
  const list = $('planTomorrowList')

  if (!currentPetId) {
    card.style.display = 'none'
    return
  }
  card.style.display = ''
  card.classList.toggle('open', planTomorrowOpen)
  body.style.display = planTomorrowOpen ? '' : 'none'
  subtitle.textContent = plannedForTomorrow.length
    ? `${plannedForTomorrow.length} planned for ${formatDateKey(tomorrowKey())}`
    : `Jot down anything special for ${formatDateKey(tomorrowKey())}`

  if (!plannedForTomorrow.length) {
    list.innerHTML = '<div class="plan-tomorrow-empty">Nothing planned yet.</div>'
  } else {
    list.innerHTML = ''
    plannedForTomorrow.forEach((task) => {
      const row = document.createElement('div')
      row.className = 'plan-tomorrow-item'
      row.dataset.id = task.id
      row.innerHTML = `
        <span class="plan-tomorrow-label">${esc(task.label)}</span>
        <button class="plan-tomorrow-delete" aria-label="Remove">×</button>
      `
      list.appendChild(row)
    })
  }
}

async function addPlannedTask() {
  if (!currentPetId) return
  const input = $('planTomorrowInput') as HTMLInputElement
  const label = input.value.trim()
  if (!label) return
  const { data, error } = await supabase
    .from('planned_tasks')
    .insert({ pet_id: currentPetId, date: tomorrowKey(), label })
    .select()
    .single()
  if (error) {
    console.error(error)
    return
  }
  plannedForTomorrow.push(data as PlannedTask)
  input.value = ''
  renderPlanTomorrow()
}

async function deletePlannedTask(taskId: string): Promise<boolean> {
  const { error } = await supabase.from('planned_tasks').delete().eq('id', taskId)
  if (error) {
    console.error(error)
    return false
  }
  return true
}

async function removeTomorrowTask(taskId: string) {
  if (!(await deletePlannedTask(taskId))) return
  plannedForTomorrow = plannedForTomorrow.filter((t) => t.id !== taskId)
  renderPlanTomorrow()
}

async function togglePlannedToday(taskId: string) {
  const task = plannedForToday.find((t) => t.id === taskId)
  if (!task) return
  const wasChecking = !task.done
  const { error } = await supabase.from('planned_tasks').update({ done: !task.done }).eq('id', taskId)
  if (error) {
    console.error(error)
    return
  }
  task.done = !task.done
  await renderDaily()
  celebrateIfAllDone(wasChecking)
}

function renderDayPicker() {
  const picker = $('dayPicker') as HTMLSelectElement
  const dates = viewingDate && !historyDates.includes(viewingDate) ? [viewingDate, ...historyDates].sort().reverse() : historyDates
  let html = '<option value="today">Today</option>'
  dates.forEach((d) => {
    html += `<option value="${d}">${formatDateKey(d)}</option>`
  })
  picker.innerHTML = html
  picker.value = viewingDate || 'today'
  ;($('dayNextBtn') as HTMLButtonElement).disabled = !viewingDate
}

async function renderDaily() {
  const list = $('dailyList')
  const addBtn = $('addItemBtn')
  const banner = $('historyBanner')
  const heading = $('dailyHeading')

  if (!currentPetId) {
    heading.textContent = 'Daily Care'
    banner.style.display = 'none'
    addBtn.style.display = 'none'
    list.innerHTML = '<div class="empty-state">Add a pet to get started.</div>'
    $('dayPicker').innerHTML = ''
    $('progressText').textContent = ''
    ;($('progressBar') as HTMLElement).style.width = '0%'
    renderPlanTomorrow()
    renderHabitatCard()
    return
  }

  renderDayPicker()
  renderPlanTomorrow()
  renderHabitatCard()

  if (viewingDate) {
    heading.textContent = formatDateKey(viewingDate)
    banner.style.display = ''
    banner.textContent = 'Viewing a past day — read only.'
    addBtn.style.display = 'none'

    const dayCompletions = await fetchCompletionsForDate(currentPetId, viewingDate)
    plannedForViewingDate = await fetchPlannedTasks(currentPetId, viewingDate)
    const dayItems = items.filter((i) => itemShowsOn(i, viewingDate!))
    list.innerHTML = ''
    plannedForViewingDate.forEach((task) => {
      const row = document.createElement('div')
      row.className = 'care-row readonly today-plan-row' + (task.done ? ' done' : '')
      row.innerHTML = `
        <span class="check-box"></span>
        <div class="care-main">
          <div class="care-label-row">
            <span class="care-label">${esc(task.label)}</span>
            <span class="care-chip plan-chip">Planned</span>
          </div>
        </div>
        <span class="care-time"></span>
      `
      list.appendChild(row)
    })
    if (!dayItems.length && !plannedForViewingDate.length) {
      list.innerHTML = '<div class="empty-state">No record for this day.</div>'
    } else {
      dayItems.forEach((item) => {
        const done = dayCompletions.has(item.id)
        const row = document.createElement('div')
        row.className = 'care-row readonly' + (done ? ' done' : '')
        row.innerHTML = `
          <span class="check-box"></span>
          <div class="care-main">
            <div class="care-label-row">
              <span class="care-label">${esc(item.label)}</span>
              <span class="care-chip">${item.category}</span>
              ${!item.recurring ? '<span class="care-chip one-off-chip">One-time</span>' : ''}
            </div>
            ${item.detail ? `<div class="care-detail">${esc(item.detail)}</div>` : ''}
          </div>
          <span class="care-time">${item.time ? esc(item.time) : ''}</span>
        `
        list.appendChild(row)
      })
    }
    const total = dayItems.length + plannedForViewingDate.length
    const done = dayItems.filter((i) => dayCompletions.has(i.id)).length + plannedForViewingDate.filter((t) => t.done).length
    $('progressText').textContent = `${done} of ${total} done`
    ;($('progressBar') as HTMLElement).style.width = (total ? (done / total) * 100 : 0) + '%'
    return
  }

  heading.textContent = 'Today — ' + formatDateKey(todayKey())
  banner.style.display = 'none'
  addBtn.style.display = ''
  list.innerHTML = ''
  plannedForToday.forEach((task) => {
    const row = document.createElement('div')
    row.className = 'care-row today-plan-row' + (task.done ? ' done' : '')
    row.dataset.planId = task.id
    row.innerHTML = `
      <button class="check-box" aria-label="Toggle done"></button>
      <div class="care-main">
        <div class="care-label-row">
          <span class="care-label">${esc(task.label)}</span>
          <span class="care-chip plan-chip">Planned</span>
        </div>
      </div>
      <span class="care-time"></span>
      <button class="delete-btn" aria-label="Remove">×</button>
    `
    list.appendChild(row)
  })
  const todayItems = items.filter((i) => itemShowsOn(i, todayKey()))
  if (!todayItems.length && !plannedForToday.length) {
    list.innerHTML = '<div class="empty-state">No care items yet — add one to get started.</div>'
  } else {
    todayItems.forEach((item) => {
      const checked = completedToday.has(item.id)
      const row = document.createElement('div')
      row.className = 'care-row' + (checked ? ' done' : '')
      row.dataset.id = item.id
      row.innerHTML = `
        <button class="check-box" aria-label="Toggle done"></button>
        <div class="care-main">
          <div class="care-label-row">
            <span class="care-label">${esc(item.label)}</span>
            <span class="care-chip">${item.category}</span>
            ${!item.recurring ? '<span class="care-chip one-off-chip">One-time</span>' : ''}
          </div>
          ${item.detail ? `<div class="care-detail">${esc(item.detail)}</div>` : ''}
        </div>
        <span class="care-time">${item.time ? esc(item.time) : ''}</span>
        <button class="delete-btn" aria-label="Delete item">×</button>
      `
      list.appendChild(row)
    })
  }
  updateProgress()
}

function updateProgress() {
  const todayItems = items.filter((i) => itemShowsOn(i, todayKey()))
  const total = todayItems.length + plannedForToday.length
  const done = todayItems.filter((i) => completedToday.has(i.id)).length + plannedForToday.filter((t) => t.done).length
  $('progressText').textContent = `${done} of ${total} done today`
  ;($('progressBar') as HTMLElement).style.width = (total ? (done / total) * 100 : 0) + '%'
}

async function toggleCompletion(itemId: string) {
  if (!currentPetId) return
  const date = todayKey()
  const wasChecking = !completedToday.has(itemId)
  if (completedToday.has(itemId)) {
    const { error } = await supabase
      .from('daily_completions')
      .delete()
      .eq('daily_item_id', itemId)
      .eq('date', date)
    if (error) {
      console.error(error)
      return
    }
    completedToday.delete(itemId)
  } else {
    const { error } = await supabase
      .from('daily_completions')
      .insert({ daily_item_id: itemId, pet_id: currentPetId, date })
    if (error) {
      console.error(error)
      return
    }
    completedToday.add(itemId)
  }
  await renderDaily()
  celebrateIfAllDone(wasChecking)
}

async function deleteItem(itemId: string) {
  const { error } = await supabase.from('daily_care_items').delete().eq('id', itemId)
  if (error) {
    console.error(error)
    return
  }
  items = items.filter((i) => i.id !== itemId)
  completedToday.delete(itemId)
  await renderDaily()
}

// ── Add care item modal ─────────────────────────────────────────────────

function openAddItemModal() {
  const modalTitle = $('modalTitle')
  const modalBody = $('modalBody')
  modalTitle.textContent = 'Add a care item'
  modalBody.innerHTML = `
    <div class="field"><label for="f-label">Item</label><input id="f-label" type="text" placeholder="e.g. Give ear drops"></div>
    <div class="field"><label for="f-time">Time</label><input id="f-time" type="text" placeholder="e.g. 8:00 AM"></div>
    <div class="field"><label for="f-cat">Category</label>
      <select id="f-cat">
        <option>Feeding</option><option>Exercise</option><option>Medication</option>
        <option>Hygiene</option><option>Environment</option><option>Health</option>
      </select>
    </div>
    <div class="field"><label for="f-detail">Detail (optional)</label><input id="f-detail" type="text" placeholder="e.g. amount, dose, instructions"></div>
    <div class="field checkbox-field">
      <label><input type="checkbox" id="f-recurring" checked> Repeat every day</label>
    </div>
    <div class="field" id="f-oneoff-date-wrap" style="display:none;">
      <label for="f-oneoff-date">Just for this day</label>
      <input id="f-oneoff-date" type="date" value="${viewingDate || todayKey()}">
    </div>
    <div class="auth-error" id="dailyFormError"></div>
    <button class="btn-primary btn-block" id="modalSubmit">Add item</button>
  `
  $('modalOverlay').classList.add('open')
  $('modalSubmit').addEventListener('click', handleAddItemSubmit)
  const recurringCheckbox = $('f-recurring') as HTMLInputElement
  const dateWrap = $('f-oneoff-date-wrap')
  recurringCheckbox.addEventListener('change', () => {
    dateWrap.style.display = recurringCheckbox.checked ? 'none' : ''
  })
}

function closeModal() {
  $('modalOverlay').classList.remove('open')
}

async function handleAddItemSubmit() {
  if (!currentPetId) return
  const labelInput = document.getElementById('f-label') as HTMLInputElement
  const label = labelInput.value.trim()
  if (!label) {
    labelInput.focus()
    return
  }
  const time = (document.getElementById('f-time') as HTMLInputElement).value.trim()
  const category = (document.getElementById('f-cat') as HTMLSelectElement).value as Category
  const detail = (document.getElementById('f-detail') as HTMLInputElement).value.trim()
  const recurring = (document.getElementById('f-recurring') as HTMLInputElement).checked
  const oneOffDate = (document.getElementById('f-oneoff-date') as HTMLInputElement).value

  const { data, error } = await supabase
    .from('daily_care_items')
    .insert({
      pet_id: currentPetId,
      label,
      time: time || null,
      category,
      detail: detail || null,
      recurring,
      date: recurring ? null : oneOffDate || todayKey(),
    })
    .select()
    .single()
  if (error) {
    const errEl = $('dailyFormError')
    errEl.textContent = error.message
    errEl.classList.add('visible')
    return
  }
  items.push(data as DailyCareItem)
  closeModal()
  await renderDaily()
}

async function goToDay(delta: number) {
  if (!currentPetId) return
  const current = viewingDate || todayKey()
  const next = shiftDateKey(current, delta)
  viewingDate = next >= todayKey() ? null : next
  await renderDaily()
}

function wireStaticControls() {
  $('addItemBtn').addEventListener('click', openAddItemModal)
  $('dayPrevBtn').addEventListener('click', () => goToDay(-1))
  $('dayNextBtn').addEventListener('click', () => goToDay(1))
  ;($('dayPicker') as HTMLSelectElement).addEventListener('change', async (e) => {
    const value = (e.target as HTMLSelectElement).value
    viewingDate = value === 'today' ? null : value
    await renderDaily()
  })
  $('dailyList').addEventListener('click', (e) => {
    if (viewingDate) return
    const target = e.target as HTMLElement
    const row = target.closest('.care-row') as HTMLElement | null
    if (!row) return
    const planId = row.dataset.planId
    if (planId) {
      if (target.closest('.check-box')) {
        togglePlannedToday(planId)
      } else if (target.closest('.delete-btn')) {
        deletePlannedTask(planId).then((ok) => {
          if (!ok) return
          plannedForToday = plannedForToday.filter((t) => t.id !== planId)
          renderDaily()
        })
      }
      return
    }
    const id = row.dataset.id
    if (!id) return
    if (target.closest('.check-box')) {
      toggleCompletion(id)
    } else if (target.closest('.delete-btn')) {
      deleteItem(id)
    }
  })

  $('habitatAddBtn').addEventListener('click', saveHabitatCondition)

  $('planTomorrowToggle').addEventListener('click', () => {
    planTomorrowOpen = !planTomorrowOpen
    renderPlanTomorrow()
  })
  $('planTomorrowAddBtn').addEventListener('click', addPlannedTask)
  ;($('planTomorrowInput') as HTMLInputElement).addEventListener('keydown', (e) => {
    if ((e as KeyboardEvent).key === 'Enter') addPlannedTask()
  })
  $('planTomorrowList').addEventListener('click', (e) => {
    const target = e.target as HTMLElement
    const row = target.closest('.plan-tomorrow-item') as HTMLElement | null
    if (!row) return
    const id = row.dataset.id
    if (id && target.closest('.plan-tomorrow-delete')) {
      removeTomorrowTask(id)
    }
  })
}

// ── "All done for today" thank-you message ──────────────────────────────

const thankYouMessages = [
  'Thank you for taking such good care of me today!',
  "You're the best. Everything's done and I couldn't be happier!",
  "All my tasks are done, and I feel so loved. Thank you!",
  'Another great day thanks to you. Love you!',
  "You never miss a beat with me. I'm so grateful!",
  'Every single thing, done with love. Thank you for today!',
  "I hit the jackpot getting you as my human. Thanks for today!",
  'Not one thing forgotten today. You take such good care of me.',
  "Whatever I did to deserve you, I'd do it again. Thank you!",
  "Today was a good day, all because of you. Thanks!",
  "You always show up for me. I notice, and I'm grateful.",
  'Thanks for never letting me down. Love you so much.',
  "Everything checked off — you're amazing. Thank you!",
  "I couldn't ask for better care. Thank you for today.",
  'You make every day feel special. Thanks for taking care of me!',
  "My whole day, taken care of by you. I'm one lucky pet.",
  'Thank you for always thinking of me first.',
  "You did it all today, and I felt every bit of it. Thanks!",
  'Full belly, happy heart — thank you for today.',
  "I don't say it enough, but thank you for everything.",
  'Every task, every day — you never miss. Thank you!',
  "You're my favorite part of every day. Thanks for today!",
  'Cared for, loved, and grateful. Thank you!',
  "I felt so looked after today. Thank you, truly.",
  'Nothing beats a day where you take care of everything. Thanks!',
  "You always know just what I need. Thank you for today.",
  'Thanks for being so consistent with me — it means everything.',
  "Today went perfectly, thanks to you.",
  'I appreciate you more than you know. Thank you!',
  "You're patient, kind, and always there. Thank you for today.",
  'Every little thing you did today mattered to me. Thanks!',
  "Home is wherever you are. Thanks for taking care of me today.",
  'You make being cared for look easy. Thank you!',
  "I'm grateful for you every single day, but especially today.",
  'Thank you for never rushing through my care.',
  "You went above and beyond today. I noticed. Thank you!",
  'Every day with you is a good day. Thanks for today.',
  "I trust you completely, and today proved why. Thank you!",
  'Thanks for being my person — today and every day.',
  "You made today easy for me. I appreciate that so much.",
  'Nothing missed, nothing forgotten. Thank you for your care.',
  "I feel safe and loved because of days like today. Thanks!",
  'Thank you for showing up for me, even on the busy days.',
  "You always find the time for me. Thank you.",
  'Today was full of little kindnesses from you. Thanks!',
  "I'm thankful for you more than words can say.",
  'Every task done means every need met. Thank you!',
  "You're steady, reliable, and so loving. Thanks for today.",
  'Thank you for the walks, the meals, the everything.',
  "I couldn't have asked for a better day. Thanks to you!",
  'You never forget about me. Thank you for that.',
  "Today reminded me how lucky I am to have you.",
  'Thanks for taking such good care of me, as always.',
  "You're my whole world, and today showed it. Thank you!",
  'Every day you take care of me is a gift. Thanks!',
  "I felt so well looked after today. Thank you.",
  'Thank you for the little routines that keep me happy.',
  "You always follow through. I love that about you. Thanks!",
  'Today was another reminder of how much you care. Thank you!',
  "I appreciate every single thing you did for me today.",
  'Thanks for being so dependable — it means the world to me.',
  "You take such good care of me, and I never take it for granted.",
  'Every task complete, every need met. Thank you!',
  "I'm grateful to be your pet. Thank you for today.",
  'Thank you for making time for me, no matter how busy you are.',
  "You always do right by me. Thanks for today.",
  'Today felt effortless because of all your hard work. Thanks!',
  "I love our routine together. Thank you for keeping it up.",
  'Thanks for the care, the attention, and the love today.',
  "You're thoughtful in every little thing you do for me. Thank you!",
  'Every day, you show up. Today was no exception. Thanks!',
  "I'm so thankful for a human like you.",
  'Thank you for taking such great care of me, start to finish.',
  "You made today wonderful for me. Thank you!",
  'Cared for from morning to night — thank you for that.',
  "I appreciate you looking after every little detail today.",
  'Thanks for being exactly the kind of human I need.',
  "You never let me feel forgotten. Thank you for today.",
  'Every day I get to spend with you is a good one. Thanks!',
]

function showThanksToast(pet: PetRef) {
  const wrap = $('alarmToastWrap')
  const toast = document.createElement('div')
  toast.className = 'alarm-toast thanks-toast'
  const message = thankYouMessages[Math.floor(Math.random() * thankYouMessages.length)]
  toast.innerHTML = `
    <span class="alarm-toast-icon">${typeEmoji[pet.type]}</span>
    <span class="alarm-toast-text"><strong>${esc(pet.name)}:</strong> ${esc(message)}</span>
    <button class="alarm-toast-dismiss" aria-label="Dismiss">×</button>
  `
  toast.querySelector('.alarm-toast-dismiss')!.addEventListener('click', () => toast.remove())
  wrap.appendChild(toast)
  setTimeout(() => toast.remove(), 10000)
  logPetMessage(pet.id, `${pet.name}: ${message}`)
}

/** Call right after a check (not uncheck) toggle — fires the thank-you toast once per pet per day, the moment the last today's-task is checked off. */
function celebrateIfAllDone(justChecked: boolean) {
  if (!justChecked || viewingDate || !currentPetId || !currentPet) return
  const todayItems = items.filter((i) => itemShowsOn(i, todayKey()))
  const total = todayItems.length + plannedForToday.length
  if (!total) return
  const done = todayItems.filter((i) => completedToday.has(i.id)).length + plannedForToday.filter((t) => t.done).length
  if (done !== total) return
  const key = `${currentPetId}:${todayKey()}`
  if (thanksShown.has(key)) return
  thanksShown.add(key)
  showThanksToast(currentPet)
}

let requestToken = 0

export async function onPetSelected(pet: PetRef | null) {
  if (!wired) {
    wireStaticControls()
    wired = true
  }
  const token = ++requestToken
  const petId = pet?.id ?? null
  currentPetId = petId
  currentPet = pet
  viewingDate = null
  items = []
  completedToday = new Set()
  historyDates = []
  plannedForTomorrow = []
  plannedForToday = []
  planTomorrowOpen = false
  habitatEntries = []
  if (petId) {
    await fetchItems(petId)
    if (token !== requestToken) return // a newer pet was selected while this was in flight
    completedToday = await fetchCompletionsForDate(petId, todayKey())
    if (token !== requestToken) return
    historyDates = await fetchHistoryDates(petId)
    if (token !== requestToken) return
    plannedForTomorrow = await fetchPlannedTasks(petId, tomorrowKey())
    if (token !== requestToken) return
    plannedForToday = await fetchPlannedTasks(petId, todayKey())
    if (token !== requestToken) return
    if (pet?.type === 'reptile') {
      habitatEntries = await fetchHabitatEntries(petId)
      if (token !== requestToken) return
    }
  }
  await renderDaily()
}

export function onSignedOut() {
  currentPetId = null
  currentPet = null
  items = []
  completedToday = new Set()
  historyDates = []
  viewingDate = null
  plannedForTomorrow = []
  plannedForToday = []
  planTomorrowOpen = false
  thanksShown.clear()
  habitatEntries = []
}
