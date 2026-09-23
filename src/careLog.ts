import { supabase } from './supabaseClient'
import { $, esc } from './dom'

type LogCategory = 'Vet' | 'Vaccine' | 'Grooming' | 'Maintenance' | 'Checkup' | 'Other'
type WeightUnit = 'lb' | 'kg'

interface CareLogEntry {
  id: string
  pet_id: string
  date: string
  title: string
  category: LogCategory
  created_at: string
}

interface WeightEntry {
  id: string
  pet_id: string
  weight: number
  unit: WeightUnit
  date: string
  created_at: string
}

const categoryColor: Record<LogCategory, string> = {
  Vet: 'clay',
  Vaccine: 'honey',
  Grooming: 'moss',
  Maintenance: 'moss',
  Checkup: 'clay',
  Other: 'moss',
}

function formatDate(iso: string): string {
  const dt = new Date(iso + 'T00:00:00')
  return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

let currentPetId: string | null = null
let entries: CareLogEntry[] = []
let weightEntries: WeightEntry[] = []
let wired = false

async function fetchEntries(petId: string) {
  const { data, error } = await supabase
    .from('care_log_entries')
    .select('*')
    .eq('pet_id', petId)
    .order('date', { ascending: false })
    .order('created_at', { ascending: false })
  if (error) {
    console.error('Failed to load care log entries', error)
    entries = []
    return
  }
  entries = (data as CareLogEntry[]) || []
}

function toLb(weight: number, unit: WeightUnit): number {
  return unit === 'kg' ? weight * 2.20462 : weight
}

async function fetchWeightEntries(petId: string) {
  const { data, error } = await supabase
    .from('pet_weights')
    .select('*')
    .eq('pet_id', petId)
    .order('date', { ascending: false })
    .order('created_at', { ascending: false })
  if (error) {
    console.error('Failed to load weight entries', error)
    weightEntries = []
    return
  }
  weightEntries = (data as WeightEntry[]) || []
}

function formatWeight(w: WeightEntry): string {
  return `${w.weight % 1 === 0 ? w.weight : w.weight.toFixed(1)} ${w.unit}`
}

function renderWeightChart() {
  const wrap = $('weightChartWrap')
  const chronological = [...weightEntries].reverse() // oldest first, for a left-to-right line
  if (chronological.length < 2) {
    wrap.innerHTML = ''
    return
  }

  const W = 600
  const H = 160
  const padX = 12
  const padTop = 16
  const padBottom = 24
  const values = chronological.map((w) => toLb(w.weight, w.unit))
  const minV = Math.min(...values)
  const maxV = Math.max(...values)
  const range = maxV - minV || 1
  const chartH = H - padTop - padBottom
  const stepX = (W - padX * 2) / (chronological.length - 1)

  const points = values.map((v, i) => {
    const x = padX + stepX * i
    const y = padTop + chartH - ((v - minV) / range) * chartH
    return { x, y }
  })

  const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')
  const areaPath = `${linePath} L${points[points.length - 1].x.toFixed(1)},${H - padBottom} L${points[0].x.toFixed(1)},${H - padBottom} Z`

  const dots = points
    .map((p, i) => {
      const entry = chronological[i]
      return `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="4" fill="var(--moss)" stroke="var(--surface)" stroke-width="2"><title>${esc(formatDate(entry.date))} — ${esc(formatWeight(entry))}</title></circle>`
    })
    .join('')

  const firstLabel = `<text x="${points[0].x}" y="${H - 6}" text-anchor="start" style="font-size:10px; fill:var(--ink-soft);">${esc(formatDate(chronological[0].date))}</text>`
  const lastLabel = `<text x="${points[points.length - 1].x}" y="${H - 6}" text-anchor="end" style="font-size:10px; fill:var(--ink-soft);">${esc(formatDate(chronological[chronological.length - 1].date))}</text>`

  wrap.innerHTML = `
    <svg viewBox="0 0 ${W} ${H}" class="weight-chart" preserveAspectRatio="none">
      <path d="${areaPath}" fill="color-mix(in srgb, var(--moss) 14%, transparent)" stroke="none"></path>
      <path d="${linePath}" fill="none" stroke="var(--moss)" stroke-width="2.5"></path>
      ${dots}
      ${firstLabel}
      ${lastLabel}
    </svg>
  `
}

function renderWeightList() {
  const wrap = $('weightList')
  if (!weightEntries.length) {
    wrap.innerHTML = '<div class="empty-state" style="padding:6px 0;">No weight logged yet.</div>'
    return
  }
  wrap.innerHTML = weightEntries
    .map(
      (w) => `
      <div class="reminder-row" data-id="${w.id}">
        <span class="care-label">${esc(formatDate(w.date))} — ${esc(formatWeight(w))}</span>
        <button class="delete-btn weight-delete" data-id="${w.id}" aria-label="Remove weight entry">×</button>
      </div>
    `
    )
    .join('')
  wrap.querySelectorAll<HTMLButtonElement>('.weight-delete').forEach((btn) => {
    btn.addEventListener('click', () => deleteWeightEntry(btn.dataset.id!))
  })
}

async function deleteWeightEntry(id: string) {
  const { error } = await supabase.from('pet_weights').delete().eq('id', id)
  if (error) {
    console.error(error)
    return
  }
  weightEntries = weightEntries.filter((w) => w.id !== id)
  renderWeightChart()
  renderWeightList()
}

async function addWeightEntry() {
  if (!currentPetId) return
  const dateInput = $('weight-date') as HTMLInputElement
  const valueInput = $('weight-value') as HTMLInputElement
  const unitSelect = $('weight-unit') as HTMLSelectElement

  const weight = Number(valueInput.value)
  if (!valueInput.value || Number.isNaN(weight) || weight <= 0) {
    valueInput.focus()
    return
  }
  const date = dateInput.value || new Date().toISOString().slice(0, 10)
  const unit = unitSelect.value as WeightUnit

  const { data, error } = await supabase
    .from('pet_weights')
    .insert({ pet_id: currentPetId, weight, unit, date })
    .select()
    .single()
  if (error) {
    console.error(error)
    return
  }
  weightEntries.push(data as WeightEntry)
  weightEntries.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
  valueInput.value = ''
  renderWeightChart()
  renderWeightList()
}

function renderLog() {
  const wrap = $('logWrap')
  const addBtn = $('addLogBtn')

  if (!currentPetId) {
    wrap.innerHTML = '<div class="empty-state">Add a pet to get started.</div>'
    addBtn.style.display = 'none'
    return
  }

  addBtn.style.display = ''

  if (!entries.length) {
    wrap.innerHTML = '<div class="empty-state">No care history yet — log an event to get started.</div>'
    return
  }

  wrap.innerHTML = '<div class="timeline" id="logList"></div>'
  const logList = $('logList')
  entries.forEach((entry) => {
    const color = categoryColor[entry.category] || 'moss'
    const div = document.createElement('div')
    div.className = 'log-entry'
    div.innerHTML = `
      <div class="log-date">${esc(formatDate(entry.date))}</div>
      <div class="log-title">${esc(entry.title)}</div>
      <span class="log-chip" style="background: color-mix(in srgb, var(--${color}) 16%, transparent); color: var(--${color});">${entry.category}</span>
      <button class="delete-btn" aria-label="Delete entry" data-id="${entry.id}" style="float:right; margin-top:-28px;">×</button>
    `
    logList.appendChild(div)
  })
  logList.querySelectorAll<HTMLButtonElement>('.delete-btn').forEach((btn) => {
    btn.addEventListener('click', () => deleteEntry(btn.dataset.id!))
  })
}

async function deleteEntry(id: string) {
  const { error } = await supabase.from('care_log_entries').delete().eq('id', id)
  if (error) {
    console.error(error)
    return
  }
  entries = entries.filter((e) => e.id !== id)
  renderLog()
}

function openAddEntryModal() {
  const modalTitle = $('modalTitle')
  const modalBody = $('modalBody')
  modalTitle.textContent = 'Log a care event'
  const todayStr = new Date().toISOString().slice(0, 10)
  modalBody.innerHTML = `
    <div class="field"><label for="f-date">Date</label><input id="f-date" type="date" value="${todayStr}"></div>
    <div class="field"><label for="f-title">What happened</label><input id="f-title" type="text" placeholder="e.g. Vet visit for limping"></div>
    <div class="field"><label for="f-logcat">Category</label>
      <select id="f-logcat">
        <option>Vet</option><option>Vaccine</option><option>Grooming</option>
        <option>Maintenance</option><option>Checkup</option><option>Other</option>
      </select>
    </div>
    <div class="auth-error" id="logFormError"></div>
    <button class="btn-primary btn-block" id="modalSubmit">Add entry</button>
  `
  $('modalOverlay').classList.add('open')
  $('modalSubmit').addEventListener('click', handleAddEntrySubmit)
}

function closeModal() {
  $('modalOverlay').classList.remove('open')
}

async function handleAddEntrySubmit() {
  if (!currentPetId) return
  const titleInput = document.getElementById('f-title') as HTMLInputElement
  const title = titleInput.value.trim()
  if (!title) {
    titleInput.focus()
    return
  }
  const date = (document.getElementById('f-date') as HTMLInputElement).value
  const category = (document.getElementById('f-logcat') as HTMLSelectElement).value as LogCategory

  const { data, error } = await supabase
    .from('care_log_entries')
    .insert({ pet_id: currentPetId, date, title, category })
    .select()
    .single()
  if (error) {
    const errEl = $('logFormError')
    errEl.textContent = error.message
    errEl.classList.add('visible')
    return
  }
  entries.unshift(data as CareLogEntry)
  entries.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
  closeModal()
  renderLog()
}

function wireStaticControls() {
  $('addLogBtn').addEventListener('click', openAddEntryModal)
  $('weightAddBtn').addEventListener('click', addWeightEntry)
  $('weight-value').addEventListener('keydown', (e) => {
    if ((e as KeyboardEvent).key === 'Enter') addWeightEntry()
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
  entries = []
  weightEntries = []
  if (petId) {
    await fetchEntries(petId)
    if (token !== requestToken) return // a newer pet was selected while this was in flight
    await fetchWeightEntries(petId)
    if (token !== requestToken) return
  }
  renderLog()
  renderWeightChart()
  renderWeightList()
  ;($('weightAddRow') as HTMLElement).style.display = petId ? '' : 'none'
  if (petId) ($('weight-date') as HTMLInputElement).value = new Date().toISOString().slice(0, 10)
}

export function onSignedOut() {
  currentPetId = null
  entries = []
  weightEntries = []
}
