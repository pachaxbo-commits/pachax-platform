const BOLIVIA_TIME_ZONE = 'America/La_Paz'

export interface QrDateDisplay {
  text: string
  precision: 'date-time' | 'date' | 'none'
}

function validDayKey(value: string): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return null
  const [, year, month, day] = match
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)))
  return date.getUTCFullYear() === Number(year) && date.getUTCMonth() + 1 === Number(month) && date.getUTCDate() === Number(day)
    ? `${day}/${month}/${year}`
    : null
}

function formatDate(date: Date, includeTime: boolean): string {
  const parts = new Intl.DateTimeFormat('es-BO', {
    timeZone: BOLIVIA_TIME_ZONE,
    day: '2-digit', month: '2-digit', year: 'numeric',
    ...(includeTime ? { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' as const } : {}),
  }).formatToParts(date)
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]))
  const dateText = `${values.day}/${values.month}/${values.year}`
  return includeTime ? `${dateText} · ${values.hour}:${values.minute}` : dateText
}

/** Show an unambiguous timestamp in Bolivia; never invent a time for legacy dates. */
export function formatQrRecordDate(timestamp: unknown, dayKey?: unknown): QrDateDisplay {
  if (typeof timestamp === 'string') {
    const value = timestamp.trim()
    const dateOnly = validDayKey(value)
    if (dateOnly) return { text: dateOnly, precision: 'date' }

    if (/(?:Z|[+-]\d{2}:?\d{2})$/i.test(value)) {
      const date = new Date(value)
      if (!Number.isNaN(date.getTime())) return { text: formatDate(date, true), precision: 'date-time' }
    }

    // A timestamp without an offset has no reliable clock time. Keep only its
    // recorded calendar date rather than interpreting it in the device zone.
    const localDate = /^(\d{4}-\d{2}-\d{2})T/.exec(value)?.[1]
    if (localDate) {
      const parsed = validDayKey(localDate)
      if (parsed) return { text: parsed, precision: 'date' }
    }
  } else if (timestamp instanceof Date && !Number.isNaN(timestamp.getTime())) {
    return { text: formatDate(timestamp, true), precision: 'date-time' }
  } else if (typeof timestamp === 'object' && timestamp !== null) {
    const value = timestamp as { toDate?: () => Date; seconds?: number; nanoseconds?: number }
    try {
      const date = typeof value.toDate === 'function'
        ? value.toDate()
        : typeof value.seconds === 'number'
          ? new Date(value.seconds * 1000 + Math.floor((value.nanoseconds || 0) / 1_000_000))
          : null
      if (date && !Number.isNaN(date.getTime())) return { text: formatDate(date, true), precision: 'date-time' }
    } catch { /* fall through to a date-only fallback */ }
  }

  const fallback = typeof dayKey === 'string' ? validDayKey(dayKey.trim()) : null
  return fallback ? { text: fallback, precision: 'date' } : { text: 'Fecha no disponible', precision: 'none' }
}
