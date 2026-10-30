/** A capped listener cannot prove completeness once it fills its configured page. */
export function reportSourceMayBeTruncated(loadedCount: number, sourceLimit: number): boolean {
  if (!Number.isSafeInteger(loadedCount) || loadedCount < 0 || !Number.isSafeInteger(sourceLimit) || sourceLimit <= 0) return true
  return loadedCount >= sourceLimit
}

export function assertReportSourceComplete(loadedCount: number, sourceLimit: number, label = 'El historial'): void {
  if (reportSourceMayBeTruncated(loadedCount, sourceLimit)) {
    throw new Error(`${label} alcanza el límite de carga actual; no se puede presentar un total completo.`)
  }
}

/** A final page at the exact cap is complete only when the server explicitly says there is no next page. */
export function reportPaginationIsComplete(loadedCount: number, maximum: number, hasMore: boolean): boolean {
  return Number.isSafeInteger(loadedCount) && loadedCount >= 0
    && Number.isSafeInteger(maximum) && maximum > 0
    && loadedCount <= maximum && hasMore === false
}
