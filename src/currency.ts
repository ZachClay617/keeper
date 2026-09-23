export type CurrencyCode = 'USD' | 'EUR' | 'GBP' | 'JPY' | 'CAD' | 'AUD' | 'INR' | 'CNY' | 'CHF' | 'MXN' | 'BRL' | 'KRW'

export const currencyOptions: { value: CurrencyCode; label: string; symbol: string }[] = [
  { value: 'USD', label: 'US Dollar', symbol: '$' },
  { value: 'EUR', label: 'Euro', symbol: '€' },
  { value: 'GBP', label: 'British Pound', symbol: '£' },
  { value: 'JPY', label: 'Japanese Yen', symbol: '¥' },
  { value: 'CAD', label: 'Canadian Dollar', symbol: 'CA$' },
  { value: 'AUD', label: 'Australian Dollar', symbol: 'AU$' },
  { value: 'INR', label: 'Indian Rupee', symbol: '₹' },
  { value: 'CNY', label: 'Chinese Yuan', symbol: '¥' },
  { value: 'CHF', label: 'Swiss Franc', symbol: 'Fr' },
  { value: 'MXN', label: 'Mexican Peso', symbol: 'MX$' },
  { value: 'BRL', label: 'Brazilian Real', symbol: 'R$' },
  { value: 'KRW', label: 'South Korean Won', symbol: '₩' },
]

let currentCurrency: CurrencyCode = 'USD'

export function setAccountCurrency(code: string | null | undefined) {
  currentCurrency = (currencyOptions.find((c) => c.value === code)?.value as CurrencyCode) || 'USD'
}

export function getAccountCurrency(): CurrencyCode {
  return currentCurrency
}

export function currencySymbol(): string {
  return currencyOptions.find((c) => c.value === currentCurrency)?.symbol || '$'
}

/** e.g. "$12.50" — the account's currency symbol plus a two-decimal amount. */
export function formatMoney(amount: number): string {
  return `${currencySymbol()}${amount.toFixed(2)}`
}
