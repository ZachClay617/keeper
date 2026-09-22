import { supabase } from './supabaseClient'

interface Reminder {
  id: string
  owner_id: string
  pet_id: string | null
  text: string
  created_at: string
  pets: { name: string; status: string } | null
}

interface PetOption {
  id: string
  name: string
}

function $(id: string): HTMLElement {
  const el = document.getElementById(id)
  if (!el) throw new Error(`Missing #${id}`)
  return el
}

function esc(s: string): string {
  const div = document.createElement('div')
  div.textContent = s
  return div.innerHTML
}

let wired = false
let reminders: Reminder[] = []
let activePetOptions: PetOption[] = []

async function fetchReminders() {
  const { data, error } = await supabase
    .from('reminders')
    .select('*, pets(name, status)')
    .order('created_at', { ascending: true })
  if (error) {
    console.error('Failed to load reminders', error)
    reminders = []
    return
  }
  reminders = (data as unknown as Reminder[]) || []
}

async function fetchActivePets() {
  const { data, error } = await supabase
    .from('pets')
    .select('id, name')
    .eq('status', 'active')
    .order('created_at', { ascending: true })
  if (error) {
    console.error('Failed to load pets for reminders', error)
    activePetOptions = []
    return
  }
  activePetOptions = (data as PetOption[]) || []
}

function visibleReminders(): Reminder[] {
  return reminders.filter((r) => !r.pets || r.pets.status !== 'memorial')
}

function renderBell() {
  const list = $('notifList')
  const badge = $('bellBadge')
  const items = visibleReminders()
  if (!items.length) {
    list.innerHTML = '<div class="notif-empty">No reminders right now.</div>'
    badge.style.display = 'none'
  } else {
    list.innerHTML = items
      .map((r) => {
        const label = r.pets ? `${esc(r.pets.name)}: ${esc(r.text)}` : esc(r.text)
        return `<div class="notif-item">${label}</div>`
      })
      .join('')
    badge.style.display = 'flex'
    badge.textContent = String(items.length)
  }
}

function reminderRowHtml(r: Reminder): string {
  return `<div class="reminder-row"><span class="care-label">${esc(r.text)}</span><button class="delete-btn reminder-delete-btn" data-id="${r.id}" aria-label="Remove reminder">×</button></div>`
}

function emptyRow(): string {
  return '<div class="empty-state" style="padding:6px 2px; text-align:left;">No reminders yet.</div>'
}

function renderManager() {
  const wrap = document.getElementById('remindersManager')
  if (!wrap) return

  const generalReminders = reminders.filter((r) => !r.pet_id)
  const generalRows = generalReminders.map(reminderRowHtml).join('') || emptyRow()

  const petsHtml = activePetOptions
    .map((pet) => {
      const petReminders = reminders.filter((r) => r.pet_id === pet.id)
      const rows = petReminders.map(reminderRowHtml).join('') || emptyRow()
      return `
        <div class="reminder-pet-block">
          <div class="reminder-pet-name">${esc(pet.name)}</div>
          ${rows}
          <div class="reminder-add-row">
            <input type="text" class="reminder-input" data-pet="${pet.id}" placeholder="Add a reminder for ${esc(pet.name)}">
            <button class="btn-secondary reminder-add-btn" data-pet="${pet.id}" style="margin-top:0;">Add</button>
          </div>
        </div>
      `
    })
    .join('')

  wrap.innerHTML = `
    <div class="reminder-pet-block">
      <div class="reminder-pet-name">General</div>
      ${generalRows}
      <div class="reminder-add-row">
        <input type="text" class="reminder-input" data-pet="" placeholder="Add a general reminder">
        <button class="btn-secondary reminder-add-btn" data-pet="" style="margin-top:0;">Add</button>
      </div>
    </div>
    ${petsHtml}
  `

  wrap.querySelectorAll<HTMLButtonElement>('.reminder-add-btn').forEach((btn) => {
    btn.addEventListener('click', () => handleAdd(btn.dataset.pet || null))
  })
  wrap.querySelectorAll<HTMLButtonElement>('.reminder-delete-btn').forEach((btn) => {
    btn.addEventListener('click', () => handleDelete(btn.dataset.id!))
  })
}

async function handleAdd(petId: string | null) {
  const selector = `.reminder-input[data-pet="${petId || ''}"]`
  const input = document.querySelector(selector) as HTMLInputElement | null
  if (!input) return
  const text = input.value.trim()
  if (!text) {
    input.focus()
    return
  }
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return
  const { error } = await supabase.from('reminders').insert({ owner_id: user.id, pet_id: petId, text })
  if (error) {
    console.error(error)
    return
  }
  await fetchReminders()
  renderBell()
  renderManager()
}

async function handleDelete(id: string) {
  const { error } = await supabase.from('reminders').delete().eq('id', id)
  if (error) {
    console.error(error)
    return
  }
  reminders = reminders.filter((r) => r.id !== id)
  renderBell()
  renderManager()
}

function wireBell() {
  $('bellBtn').addEventListener('click', (e) => {
    e.stopPropagation()
    $('notifPanel').classList.toggle('open')
  })
  document.addEventListener('click', (e) => {
    const panel = $('notifPanel')
    const btn = $('bellBtn')
    if (!panel.contains(e.target as Node) && e.target !== btn) panel.classList.remove('open')
  })
}

export async function initReminders() {
  if (!wired) {
    wireBell()
    wired = true
  }
  await fetchReminders()
  renderBell()
}

/** Re-fetches and re-renders just the bell — call after any pet/reminder mutation elsewhere. */
export async function refreshReminders() {
  await fetchReminders()
  renderBell()
}

export async function renderRemindersManager() {
  await fetchActivePets()
  await fetchReminders()
  renderBell()
  renderManager()
}

export function onSignedOut() {
  reminders = []
  activePetOptions = []
  const badge = document.getElementById('bellBadge')
  if (badge) badge.style.display = 'none'
  const list = document.getElementById('notifList')
  if (list) list.innerHTML = ''
}
