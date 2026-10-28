/** Shares overlapping requests while allowing the next request after settlement. */
export function createSingleFlight<TArgs extends unknown[], TResult>(
  task: (...args: TArgs) => Promise<TResult>,
): (...args: TArgs) => Promise<TResult> {
  let inFlight: Promise<TResult> | null = null

  return (...args: TArgs) => {
    if (inFlight) return inFlight

    const current = task(...args)
    inFlight = current
    void current.finally(() => {
      if (inFlight === current) inFlight = null
    }).catch(() => undefined)
    return current
  }
}
