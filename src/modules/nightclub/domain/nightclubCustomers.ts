import type { NightclubCustomer, NightclubDataset } from './nightclubAccounts'

/** Calendar date only; never converted through a timestamp or timezone. */
export function normalizeNightclubBirthday(value?: string): string | undefined {
  if (!value) return undefined
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) throw new Error('Ingresa una fecha de cumpleaños válida.')
  const year = Number(match[1]); const month = Number(match[2]); const day = Number(match[3])
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)
  const days = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
  if (year < 1 || month < 1 || month > 12 || day < 1 || day > days[month - 1]) throw new Error('Ingresa una fecha de cumpleaños válida.')
  return value
}

export function nightclubBirthdayMonthDay(value?: string): string | null {
  return normalizeNightclubBirthday(value)?.slice(5) || null
}

export function formatNightclubBirthday(value?: string): string {
  const birthday = normalizeNightclubBirthday(value)
  return birthday ? `${birthday.slice(8, 10)}/${birthday.slice(5, 7)}/${birthday.slice(0, 4)}` : 'No registrada'
}

export function saveNightclubCustomer(dataset: NightclubDataset, customer: NightclubCustomer): NightclubDataset {
  const next = structuredClone(dataset)
  const birthday = normalizeNightclubBirthday(customer.birthday)
  const previous = next.customers.find(item => item.id === customer.id)
  const saved: NightclubCustomer = { ...customer, birthday, convivenciaStatus: previous?.convivenciaStatus || 'green' }
  if (!birthday) delete saved.birthday
  const index = next.customers.findIndex(item => item.id === customer.id)
  if (index >= 0) next.customers[index] = saved
  else next.customers.push(saved)
  return next
}
