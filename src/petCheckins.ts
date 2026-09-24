import { supabase } from './supabaseClient'
import { todayKey, nowTimeKey } from './timezone'
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
// Each account-day, every active pet gets 3–10 random times to "check in".
// The schedule and fired-set live only in memory — a reload could re-roll
// the day's times, same accepted tradeoff as the other alarm features.

let scheduleDate: string | null = null
let timesByPet = new Map<string, string[]>()
const firedKeys = new Set<string>()
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

async function ensureScheduleForToday(pets: PetRef[]) {
  const today = todayKey()
  if (scheduleDate === today) return
  scheduleDate = today
  timesByPet = new Map()
  pets.forEach((p) => timesByPet.set(p.id, randomTimesForDay()))
}

function showCheckinToast(pet: PetRef) {
  const wrap = $('alarmToastWrap')
  const toast = document.createElement('div')
  toast.className = 'alarm-toast checkin-toast'
  const message = checkinMessages[Math.floor(Math.random() * checkinMessages.length)]
  toast.innerHTML = `
    <span class="alarm-toast-icon">${typeEmoji[pet.type]}</span>
    <span class="alarm-toast-text"><strong>${esc(pet.name)}:</strong> ${esc(message)}</span>
    <button class="alarm-toast-dismiss" aria-label="Dismiss">×</button>
  `
  toast.querySelector('.alarm-toast-dismiss')!.addEventListener('click', () => toast.remove())
  wrap.appendChild(toast)
  setTimeout(() => toast.remove(), 15000)
}

async function checkDueCheckins() {
  const { data, error } = await supabase.from('pets').select('id, name, type').eq('status', 'active')
  if (error) {
    console.error('Failed to load pets for check-ins', error)
    return
  }
  const pets = (data as PetRef[]) || []
  await ensureScheduleForToday(pets)

  const now = nowTimeKey()
  const today = todayKey()
  pets.forEach((pet) => {
    const times = timesByPet.get(pet.id) || []
    times.forEach((t) => {
      const key = `${pet.id}:${today}:${t}`
      if (firedKeys.has(key)) return
      if (t <= now) {
        firedKeys.add(key)
        showCheckinToast(pet)
      }
    })
  })
}

export function initPetCheckins() {
  if (intervalId) return
  checkDueCheckins()
  intervalId = setInterval(checkDueCheckins, 30000)
}

export function stopPetCheckins() {
  if (intervalId) clearInterval(intervalId)
  intervalId = null
  scheduleDate = null
  timesByPet = new Map()
  firedKeys.clear()
}
