import { todayKey } from './timezone'

/** Calendar-aware years/months/days between a birthday and today (or a given date). */
export function ageBreakdown(birthday: string, today: string = todayKey()): { years: number; months: number; days: number } {
  const [by, bm, bd] = birthday.split('-').map(Number)
  const [ty, tm, td] = today.split('-').map(Number)

  let years = ty - by
  let months = tm - bm
  let days = td - bd

  if (days < 0) {
    months -= 1
    const prevMonthLastDay = new Date(ty, tm - 1, 0).getDate() // day 0 of this month = last day of previous month
    days += prevMonthLastDay
  }
  if (months < 0) {
    years -= 1
    months += 12
  }
  return { years: Math.max(0, years), months: Math.max(0, months), days: Math.max(0, days) }
}

/** "2 years, 3 months, 14 days" — omits leading zero units, but always shows at least one. */
export function formatAge(birthday: string, today: string = todayKey()): string {
  const { years, months, days } = ageBreakdown(birthday, today)
  const parts: string[] = []
  if (years > 0) parts.push(`${years} ${years === 1 ? 'year' : 'years'}`)
  if (months > 0 || years > 0) parts.push(`${months} ${months === 1 ? 'month' : 'months'}`)
  parts.push(`${days} ${days === 1 ? 'day' : 'days'}`)
  return parts.join(', ')
}
