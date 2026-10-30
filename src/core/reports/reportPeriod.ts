import type { ReportPeriodV1 } from './reportTypes.ts'

export interface UtcReportRange { startInclusive: Date; endExclusive: Date }

function dateParts(dateKey: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey)
  if (!match) throw new Error('Usa fechas con formato AAAA-MM-DD.')
  const [, year, month, day] = match
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)))
  if (date.toISOString().slice(0, 10) !== dateKey) throw new Error('La fecha del periodo no existe.')
  return { year: Number(year), month: Number(month), day: Number(day) }
}

function nextDate(dateKey: string): string {
  const { year, month, day } = dateParts(dateKey)
  return new Date(Date.UTC(year, month - 1, day + 1)).toISOString().slice(0, 10)
}

function localMidnightAsUtc(dateKey: string, timeZone: string): Date {
  const { year, month, day } = dateParts(dateKey)
  // Iteratively correct the UTC guess by the difference between the desired
  // wall-clock time and the formatted time in the company's IANA timezone.
  const wallClockUtc = Date.UTC(year, month - 1, day)
  let guess = wallClockUtc
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  })
  for (let iteration = 0; iteration < 4; iteration += 1) {
    const parts = Object.fromEntries(formatter.formatToParts(new Date(guess)).map(part => [part.type, part.value]))
    const formattedAsUtc = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute), Number(parts.second))
    const offset = formattedAsUtc - guess
    const corrected = wallClockUtc - offset
    if (corrected === guess) break
    guess = corrected
  }
  return new Date(guess)
}

export function reportPeriodUtcRange(period: ReportPeriodV1): UtcReportRange {
  if (period.endDate < period.startDate) throw new Error('La fecha final debe ser igual o posterior a la inicial.')
  // Validate the zone even if the period is empty.
  new Intl.DateTimeFormat('en', { timeZone: period.timeZone })
  return {
    startInclusive: localMidnightAsUtc(period.startDate, period.timeZone),
    endExclusive: localMidnightAsUtc(nextDate(period.endDate), period.timeZone),
  }
}

export function isInReportPeriod(value: string | Date, period: ReportPeriodV1): boolean {
  const timestamp = value instanceof Date ? value : new Date(value)
  if (!Number.isFinite(timestamp.getTime())) return false
  const { startInclusive, endExclusive } = reportPeriodUtcRange(period)
  return timestamp >= startInclusive && timestamp < endExclusive
}

export function localDateKey(value: string | Date, timeZone: string): string {
  const date = value instanceof Date ? value : new Date(value)
  if (!Number.isFinite(date.getTime())) return ''
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date)
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]))
  return `${values.year}-${values.month}-${values.day}`
}
