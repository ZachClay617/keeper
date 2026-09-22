import { supabase } from './supabaseClient'
import { $, esc } from './dom'

type LogCategory = 'Vet' | 'Vaccine' | 'Grooming' | 'Maintenance' | 'Checkup' | 'Other'

interface CareLogEntry {
  id: string
  pet_id: string
  date: string
  title: string
  category: LogCategory
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
  if (petId) {
    await fetchEntries(petId)
    if (token !== requestToken) return // a newer pet was selected while this was in flight
  }
  renderLog()
}

export function onSignedOut() {
  currentPetId = null
  entries = []
}
