import { supabase } from './supabaseClient'
import { todayKey, nowTimeKey } from './timezone'
import { $, esc } from './dom'

interface Reminder {
  id: string
  owner_id: string
  pet_id: string | null
  text: string
  remind_time: string | null
  created_at: string
  pets: { name: string; status: string } | null
}

interface PetOption {
  id: string
  name: string
  status: 'active' | 'memorial'
}

interface RecentMessage {
  id: string
  text: string
  time: string
}

let wired = false
let reminders: Reminder[] = []
let allPetOptions: PetOption[] = []
let recentMessages: RecentMessage[] = []

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

async function fetchAllPets() {
  const { data, error } = await supabase.from('pets').select('id, name, status').order('created_at', { ascending: true })
  if (error) {
    console.error('Failed to load pets for reminders', error)
    allPetOptions = []
    return
  }
  allPetOptions = (data as PetOption[]) || []
}

/** Active pets, plus any memorialized pet that still has a reminder attached
 * (so there's always a way to clean those up, instead of them becoming
 * permanently invisible once the pet is memorialized). */
function managerPetOptions(): PetOption[] {
  const petIdsWithReminders = new Set(reminders.filter((r) => r.pet_id).map((r) => r.pet_id))
  return allPetOptions.filter((p) => p.status === 'active' || petIdsWithReminders.has(p.id))
}

function visibleReminders(): Reminder[] {
  return reminders.filter((r) => !r.pets || r.pets.status !== 'memorial')
}

/** Logs a pet's toast message (thank-you or check-in) into the bell panel once its toast disappears. */
export function logPetMessage(text: string) {
  recentMessages.unshift({ id: `${Date.now()}-${Math.random()}`, text, time: new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) })
  if (recentMessages.length > 20) recentMessages.length = 20
  renderBell()
}

function renderBell() {
  const list = $('notifList')
  const badge = $('bellBadge')
  const reminderItems = visibleReminders()
  const total = reminderItems.length + recentMessages.length
  if (!total) {
    list.innerHTML = '<div class="notif-empty">No reminders right now.</div>'
    badge.style.display = 'none'
  } else {
    let html = ''
    if (recentMessages.length) {
      html += '<div class="notif-section-label">Recent messages</div>'
      html += recentMessages.map((m) => `<div class="notif-item notif-item-message"><span class="notif-time">${esc(m.time)}</span> ${esc(m.text)}</div>`).join('')
    }
    if (reminderItems.length) {
      if (recentMessages.length) html += '<div class="notif-section-label">Reminders</div>'
      html += reminderItems
        .map((r) => {
          const label = r.pets ? `${esc(r.pets.name)}: ${esc(r.text)}` : esc(r.text)
          return `<div class="notif-item">${label}</div>`
        })
        .join('')
    }
    list.innerHTML = html
    badge.style.display = 'flex'
    badge.textContent = String(total)
  }
}

function formatTime(time: string): string {
  const [h, m] = time.split(':').map(Number)
  const dt = new Date(2000, 0, 1, h, m)
  return dt.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
}

function reminderRowHtml(r: Reminder): string {
  const timeBadge = r.remind_time ? `<span class="reminder-time-badge">${esc(formatTime(r.remind_time))}</span>` : ''
  return `<div class="reminder-row"><span class="care-label">${esc(r.text)}${timeBadge}</span><button class="delete-btn reminder-delete-btn" data-id="${r.id}" aria-label="Remove reminder">×</button></div>`
}

function emptyRow(): string {
  return '<div class="empty-state" style="padding:6px 2px; text-align:left;">No reminders yet.</div>'
}

function renderManager() {
  const wrap = document.getElementById('remindersManager')
  if (!wrap) return

  const generalReminders = reminders.filter((r) => !r.pet_id)
  const generalRows = generalReminders.map(reminderRowHtml).join('') || emptyRow()

  const petsHtml = managerPetOptions()
    .map((pet) => {
      const petReminders = reminders.filter((r) => r.pet_id === pet.id)
      const rows = petReminders.map(reminderRowHtml).join('') || emptyRow()
      const memorialNote = pet.status === 'memorial' ? ' (in memory — remove reminders here)' : ''
      return `
        <div class="reminder-pet-block">
          <div class="reminder-pet-name">${esc(pet.name)}${esc(memorialNote)}</div>
          ${rows}
          ${
            pet.status === 'active'
              ? `<div class="reminder-add-row">
                  <input type="text" class="reminder-input" data-pet="${pet.id}" placeholder="Add a reminder for ${esc(pet.name)}">
                  <input type="time" class="reminder-input reminder-time-input" data-pet="${pet.id}" title="Optional: time to alert">
                  <button class="btn-secondary reminder-add-btn" data-pet="${pet.id}" style="margin-top:0;">Add</button>
                </div>`
              : ''
          }
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
        <input type="time" class="reminder-input reminder-time-input" data-pet="" title="Optional: time to alert">
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
  const input = document.querySelector(`.reminder-input[data-pet="${petId || ''}"]`) as HTMLInputElement | null
  const timeInput = document.querySelector(`.reminder-time-input[data-pet="${petId || ''}"]`) as HTMLInputElement | null
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
  const remind_time = timeInput?.value || null
  const { error } = await supabase.from('reminders').insert({ owner_id: user.id, pet_id: petId, text, remind_time })
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
  initReminderAlarms()
}

/** Re-fetches and re-renders just the bell — call after any pet/reminder mutation elsewhere. */
export async function refreshReminders() {
  await fetchReminders()
  renderBell()
}

export async function renderRemindersManager() {
  await fetchAllPets()
  await fetchReminders()
  renderBell()
  renderManager()
}

export function onSignedOut() {
  reminders = []
  allPetOptions = []
  recentMessages = []
  const badge = document.getElementById('bellBadge')
  if (badge) badge.style.display = 'none'
  const list = document.getElementById('notifList')
  if (list) list.innerHTML = ''
  stopReminderAlarms()
}

// ── Reminder-time alarms ─────────────────────────────────────────────────
// Reminders have no date — they're evergreen — so a timed one re-fires once
// per day it's still set. "Fired today" is tracked as `id:dateKey`, which
// naturally resets itself the moment the date rolls over.

let alarmIntervalId: ReturnType<typeof setInterval> | null = null
const firedToday = new Set<string>()

function showReminderAlarmToast(r: Reminder) {
  const wrap = $('alarmToastWrap')
  const toast = document.createElement('div')
  toast.className = 'alarm-toast'
  const petLabel = r.pets ? `${esc(r.pets.name)}: ` : ''
  toast.innerHTML = `
    <span class="alarm-toast-icon">⏰</span>
    <span class="alarm-toast-text">${petLabel}${esc(r.text)}</span>
    <button class="alarm-toast-dismiss" aria-label="Dismiss">×</button>
  `
  toast.querySelector('.alarm-toast-dismiss')!.addEventListener('click', () => toast.remove())
  wrap.appendChild(toast)
  setTimeout(() => toast.remove(), 15000)

  if ('Notification' in window && Notification.permission === 'granted') {
    new Notification(r.pets ? `${r.pets.name}: ${r.text}` : r.text, { body: 'Keeper reminder' })
  }
}

function checkReminderAlarms() {
  const now = nowTimeKey()
  const today = todayKey()
  visibleReminders().forEach((r) => {
    if (!r.remind_time) return
    const key = `${r.id}:${today}`
    if (firedToday.has(key)) return
    if (r.remind_time <= now) {
      firedToday.add(key)
      showReminderAlarmToast(r)
    }
  })
}

export function initReminderAlarms() {
  if (alarmIntervalId) return
  if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission()
  }
  checkReminderAlarms()
  alarmIntervalId = setInterval(checkReminderAlarms, 30000)
}

export function stopReminderAlarms() {
  if (alarmIntervalId) clearInterval(alarmIntervalId)
  alarmIntervalId = null
  firedToday.clear()
}
