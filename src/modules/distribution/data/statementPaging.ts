export interface StatementPage<T, Cursor> {
  rows: T[]
  nextCursor?: Cursor
  hasMore: boolean
}

export function assertCompleteStatementHistory(history: { complete?: boolean }): asserts history is { complete: true } {
  if (history.complete !== true) throw new Error('No se puede exportar: el historial no fue confirmado como completo por el servidor.')
}

/** Reads every server page and propagates network/permission failures. */
export async function fetchCompleteStatementPages<T, Cursor>(
  readPage: (cursor: Cursor | undefined, pageSize: number) => Promise<StatementPage<T, Cursor>>,
  pageSize = 250,
): Promise<T[]> {
  const allRows: T[] = []
  let cursor: Cursor | undefined
  while (true) {
    const page = await readPage(cursor, pageSize)
    allRows.push(...page.rows)
    if (!page.hasMore) return allRows
    if (page.rows.length === 0 || page.nextCursor === undefined || Object.is(page.nextCursor, cursor)) {
      throw new Error('No se pudo continuar la paginación del estado de cuenta. El historial no está completo.')
    }
    cursor = page.nextCursor
  }
}
