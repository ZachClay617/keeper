export const timezoneOptions: { value: string; label: string }[] = [
  { value: 'device', label: 'Automatic (device time zone)' },
  { value: 'America/New_York', label: 'Eastern Time — New York' },
  { value: 'America/Chicago', label: 'Central Time — Chicago' },
  { value: 'America/Denver', label: 'Mountain Time — Denver' },
  { value: 'America/Los_Angeles', label: 'Pacific Time — Los Angeles' },
  { value: 'America/Anchorage', label: 'Alaska Time — Anchorage' },
  { value: 'Pacific/Honolulu', label: 'Hawaii Time — Honolulu' },
  { value: 'Europe/London', label: 'London' },
  { value: 'Europe/Berlin', label: 'Central Europe — Berlin' },
  { value: 'Asia/Kolkata', label: 'India — Kolkata' },
  { value: 'Asia/Shanghai', label: 'China — Shanghai' },
  { value: 'Asia/Tokyo', label: 'Japan — Tokyo' },
  { value: 'Australia/Sydney', label: 'Sydney' },
  { value: 'UTC', label: 'UTC' },
]

let currentTimezone = 'device'

export function setAccountTimezone(tz: string | null | undefined) {
  currentTimezone = tz || 'device'
}

export function getAccountTimezone(): string {
  return currentTimezone
}

/** Today's date as YYYY-MM-DD, in the account's timezone (or the device's, if unset). */
export function todayKey(): string {
  const tz = currentTimezone === 'device' ? undefined : currentTimezone
  return new Intl.DateTimeFormat('en-CA', tz ? { timeZone: tz } : {}).format(new Date())
}

/** The current calendar month as YYYY-MM, in the account's timezone. */
export function currentMonthKey(): string {
  return todayKey().slice(0, 7)
}

/** The current time of day as HH:MM (24h), in the account's timezone. */
export function nowTimeKey(): string {
  const tz = currentTimezone === 'device' ? undefined : currentTimezone
  return new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, ...(tz ? { timeZone: tz } : {}) }).format(new Date())
}
