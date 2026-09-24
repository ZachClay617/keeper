export type TempUnit = 'F' | 'C'

let currentTempUnit: TempUnit = 'F'

export function setAccountTempUnit(unit: string | null | undefined) {
  currentTempUnit = unit === 'C' ? 'C' : 'F'
}

export function getAccountTempUnit(): TempUnit {
  return currentTempUnit
}

export function tempUnitLabel(): string {
  return currentTempUnit === 'C' ? '°C' : '°F'
}

/** Fahrenheit (as stored) -> the account's display unit. */
export function fromF(f: number): number {
  return currentTempUnit === 'C' ? ((f - 32) * 5) / 9 : f
}

/** The account's display unit -> Fahrenheit (for storage). */
export function toF(value: number): number {
  return currentTempUnit === 'C' ? (value * 9) / 5 + 32 : value
}
