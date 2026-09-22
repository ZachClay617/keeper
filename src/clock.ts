import { getAccountTimezone } from './timezone'

function resolveTZ(): string {
  const tz = getAccountTimezone()
  return tz === 'device' ? Intl.DateTimeFormat().resolvedOptions().timeZone : tz
}

function formatClock(): string {
  const tz = resolveTZ()
  let datePart: string
  let timePart: string
  try {
    datePart = new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short', month: 'short', day: 'numeric' }).format(new Date())
    timePart = new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true }).format(new Date())
  } catch {
    datePart = new Date().toDateString()
    timePart = new Date().toLocaleTimeString()
  }
  return `${datePart} · ${timePart}`
}

let intervalId: number | undefined

export function startClock() {
  const el = document.getElementById('headerClock')
  if (!el) return
  const tick = () => {
    el.textContent = formatClock()
  }
  tick()
  if (intervalId !== undefined) window.clearInterval(intervalId)
  intervalId = window.setInterval(tick, 1000)
}
