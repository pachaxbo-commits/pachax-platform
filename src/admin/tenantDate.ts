/**
 * Firestore timestamps can cross the callable boundary as ISO strings or
 * timestamp-shaped objects. Keep Admin tenant lists tolerant of both forms.
 */
export function formatTenantDate(value: unknown): string {
  if (typeof value === 'string') {
    if (!value.trim() || !Number.isFinite(Date.parse(value))) return 'No disponible'
    // Preserve the existing YYYY-MM-DD display for canonical ISO strings.
    const isoDate = value.match(/^\d{4}-\d{2}-\d{2}/)?.[0]
    return isoDate || new Date(value).toISOString().slice(0, 10)
  }

  let date: Date | null = null
  if (value instanceof Date) {
    date = value
  } else if (value && typeof value === 'object') {
    const timestamp = value as {
      toDate?: () => Date
      toMillis?: () => number
      seconds?: number
      _seconds?: number
    }
    try {
      if (typeof timestamp.toDate === 'function') date = timestamp.toDate()
      else if (typeof timestamp.toMillis === 'function') date = new Date(timestamp.toMillis())
      else {
        const seconds = timestamp.seconds ?? timestamp._seconds
        if (typeof seconds === 'number' && Number.isFinite(seconds)) date = new Date(seconds * 1000)
      }
    } catch {
      return 'No disponible'
    }
  }

  return date && Number.isFinite(date.getTime())
    ? date.toISOString().slice(0, 10)
    : 'No disponible'
}
