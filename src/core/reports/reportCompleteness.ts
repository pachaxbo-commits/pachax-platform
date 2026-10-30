/** A capped listener cannot prove completeness once it fills its configured page. */
export function reportSourceMayBeTruncated(loadedCount: number, sourceLimit: number): boolean {
  if (!Number.isSafeInteger(loadedCount) || loadedCount < 0 || !Number.isSafeInteger(sourceLimit) || sourceLimit <= 0) return true
  return loadedCount >= sourceLimit
}
