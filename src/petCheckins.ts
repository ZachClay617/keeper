import { supabase } from './supabaseClient'
import { todayKey, nowTimeKey } from './timezone'
import { logPetMessage } from './reminders'
import { $, esc } from './dom'

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

// ── Message pool (>=300 unique) ──────────────────────────────────────────
// Built as a cross product of openers x closers so uniqueness is guaranteed
// by construction, rather than hand-authoring 300+ one-off sentences.

const openers = [
  'Just checking in!',
  'Thinking of you right now.',
  'Popping in to say hi.',
  "Sending you a little check-in.",
  "Just wanted you to know I'm here.",
  'A quick hello from me to you.',
  'Taking a break to say hi.',
  'Just felt like reaching out.',
  'Hey — just wanted to say hi!',
  'Checking in because I missed you.',
  "A little nudge to say I'm thinking of you.",
  'Just wanted to send some love your way.',
  'Popping by with a quick hello.',
  'Sending a little check-in your way.',
  'Just a small hello from your favorite pet.',
  "Wanted to let you know I'm doing great.",
  'Quick check-in — all is well here!',
  'Just felt like saying hi.',
  'A little life update: all good here!',
  "Stopping by to say I'm grateful for you.",
  'Interrupting your day with a quick hello.',
  'Just a little tap on the shoulder from me.',
  'Beaming you a message from right here.',
  'Taking a moment to check in on you.',
  'A friendly little hello, just because.',
]

const closers = [
  'I love you!',
  "You're the best.",
  "Can't wait to see you.",
  'Hope your day is going well.',
  'You make my day better just by being you.',
  'Thanks for always being there.',
  "I'm one lucky pet.",
  'You mean everything to me.',
  'Sending you all my love.',
  "I'm so happy you're mine.",
  'Miss you already.',
  "You're my favorite person.",
  'Just wanted you to know that.',
  "Hope you're having a great day.",
  "Can't stop thinking about you.",
  "You're pretty great, you know that?",
]

const checkinMessages: string[] = []
openers.forEach((o) => closers.forEach((c) => checkinMessages.push(`${o} ${c}`)))

// ── Scheduling ────────────────────────────────────────────────────────────
// Each account-day, every active pet gets 3–10 random times to "check in",
// persisted in pet_checkin_schedule (not just in memory) so the schedule
// survives reloads. Any client that opens the app — even long after some of
// today's times have passed — catches up on every unfired due row at once,
// so a check-in never silently gets skipped just because nobody had the
// site open when its time arrived.

interface ScheduleRow {
  id: string
  pet_id: string
  time: string
}

let ensuredForDate: string | null = null
let intervalId: ReturnType<typeof setInterval> | null = null

function randomTimesForDay(): string[] {
  const count = 3 + Math.floor(Math.random() * 8) // 3..10 inclusive
  const times = new Set<string>()
  while (times.size < count) {
    const h = Math.floor(Math.random() * 24)
    const m = Math.floor(Math.random() * 60)
    times.add(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`)
  }
  return Array.from(times)
}

/** Creates today's schedule rows for any active pet that doesn't have one yet. Runs at most once per date per session. */
async function ensureScheduleForToday(pets: PetRef[]) {
  const today = todayKey()
  if (ensuredForDate === today || !pets.length) return
  ensuredForDate = today

  const { data: existing, error } = await supabase.from('pet_checkin_schedule').select('pet_id').eq('date', today)
  if (error) {
    console.error('Failed to check existing check-in schedule', error)
    return
  }
  const scheduledPetIds = new Set(((existing as { pet_id: string }[]) || []).map((r) => r.pet_id))
  const missing = pets.filter((p) => !scheduledPetIds.has(p.id))
  if (!missing.length) return

  const rows = missing.flatMap((p) => randomTimesForDay().map((time) => ({ pet_id: p.id, date: today, time })))
  const { error: insertError } = await supabase.from('pet_checkin_schedule').insert(rows)
  if (insertError) console.error('Failed to save check-in schedule', insertError)
}

function showCheckinToast(pet: PetRef, message: string) {
  const wrap = $('alarmToastWrap')
  const toast = document.createElement('div')
  toast.className = 'alarm-toast checkin-toast'
  toast.innerHTML = `
    <span class="alarm-toast-icon">${typeEmoji[pet.type]}</span>
    <span class="alarm-toast-text"><strong>${esc(pet.name)}:</strong> ${esc(message)}</span>
    <button class="alarm-toast-dismiss" aria-label="Dismiss">×</button>
  `
  toast.querySelector('.alarm-toast-dismiss')!.addEventListener('click', () => toast.remove())
  wrap.appendChild(toast)
  setTimeout(() => toast.remove(), 10000)
}

async function checkDueCheckins() {
  const { data, error } = await supabase.from('pets').select('id, name, type').eq('status', 'active')
  if (error) {
    console.error('Failed to load pets for check-ins', error)
    return
  }
  const pets = (data as PetRef[]) || []
  await ensureScheduleForToday(pets)
  if (!pets.length) return

  const today = todayKey()
  const now = nowTimeKey()
  const { data: due, error: dueError } = await supabase
    .from('pet_checkin_schedule')
    .select('id, pet_id, time')
    .eq('date', today)
    .eq('fired', false)
    .lte('time', now)
  if (dueError) {
    console.error('Failed to load due check-ins', dueError)
    return
  }

  for (const row of (due as ScheduleRow[]) || []) {
    const pet = pets.find((p) => p.id === row.pet_id)
    if (!pet) continue
    // Guard against double-firing if another tab's poll raced this one.
    const { data: claimed } = await supabase.from('pet_checkin_schedule').update({ fired: true }).eq('id', row.id).eq('fired', false).select().single()
    if (!claimed) continue
    const message = checkinMessages[Math.floor(Math.random() * checkinMessages.length)]
    showCheckinToast(pet, message)
    await logPetMessage(pet.id, `${pet.name}: ${message}`)
  }
}

export function initPetCheckins() {
  if (intervalId) return
  checkDueCheckins()
  intervalId = setInterval(checkDueCheckins, 30000)
}

export function stopPetCheckins() {
  if (intervalId) clearInterval(intervalId)
  intervalId = null
  ensuredForDate = null
}
