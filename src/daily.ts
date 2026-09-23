import { supabase } from './supabaseClient'
import { todayKey } from './timezone'
import { $, esc } from './dom'

type Category = 'Feeding' | 'Exercise' | 'Medication' | 'Hygiene' | 'Environment' | 'Health'

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

let currentPetId: string | null = null
let items: DailyCareItem[] = []
let completedToday = new Set<string>()
let historyDates: string[] = []
let viewingDate: string | null = null
let wired = false
let plannedForTomorrow: PlannedTask[] = []
let plannedForToday: PlannedTask[] = []
let plannedForViewingDate: PlannedTask[] = []
let planTomorrowOpen = false

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
  const { error } = await supabase.from('planned_tasks').update({ done: !task.done }).eq('id', taskId)
  if (error) {
    console.error(error)
    return
  }
  task.done = !task.done
  await renderDaily()
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
    return
  }

  renderDayPicker()
  renderPlanTomorrow()

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

let requestToken = 0

export async function onPetSelected(petId: string | null) {
  if (!wired) {
    wireStaticControls()
    wired = true
  }
  const token = ++requestToken
  currentPetId = petId
  viewingDate = null
  items = []
  completedToday = new Set()
  historyDates = []
  plannedForTomorrow = []
  plannedForToday = []
  planTomorrowOpen = false
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
  }
  await renderDaily()
}

export function onSignedOut() {
  currentPetId = null
  items = []
  completedToday = new Set()
  historyDates = []
  viewingDate = null
  plannedForTomorrow = []
  plannedForToday = []
  planTomorrowOpen = false
}
