import {
  collection,
  onSnapshot,
  query,
  where,
  type Firestore,
  type QueryConstraint,
} from 'firebase/firestore'
import type { Unsubscribe } from './nightclubRepository'

export type NightclubFinancialReadScope =
  | { kind: 'unresolved' }
  | { kind: 'unrestricted' }
  | { kind: 'restricted'; cashboxIds: string[] }

// Keep the cartesian OR expansion within Firestore's 30-disjunction limit when
// a query also uses status `in` (currently two statuses for open accounts).
export const NIGHTCLUB_CASHBOX_QUERY_CHUNK_SIZE = 30
export const NIGHTCLUB_CASHBOX_STATUS_QUERY_CHUNK_SIZE = 15

export function canStartNightclubFinancialRead(scope: NightclubFinancialReadScope): boolean {
  return scope.kind === 'unrestricted' || (scope.kind === 'restricted' && scope.cashboxIds.length > 0)
}

export function sameNightclubFinancialReadScope(left: NightclubFinancialReadScope, right: NightclubFinancialReadScope): boolean {
  if (left.kind !== right.kind) return false
  if (left.kind !== 'restricted' || right.kind !== 'restricted') return true
  return [...new Set(left.cashboxIds)].sort().join('\u0000') === [...new Set(right.cashboxIds)].sort().join('\u0000')
}

export function resolveNightclubFinancialReadScope(member: Record<string, unknown> | undefined): NightclubFinancialReadScope {
  if (!member || member.status !== 'active') return { kind: 'unresolved' }
  if (member.roleId === 'owner' || member.roleId === 'admin') return { kind: 'unrestricted' }
  if (!Object.prototype.hasOwnProperty.call(member, 'cashboxIds')) return { kind: 'unrestricted' }
  if (Array.isArray(member.cashboxIds) && member.cashboxIds.every(id => typeof id === 'string')) {
    return { kind: 'restricted', cashboxIds: member.cashboxIds }
  }
  return { kind: 'restricted', cashboxIds: [] }
}

export function subscribeCashboxScopedCollection<T extends { id: string }>(args: {
  db: Firestore
  path: string[]
  branchId: string
  cashboxIds: string[]
  chunkSize?: number
  constraints?: QueryConstraint[]
  mapDocument: (id: string, data: Record<string, unknown>) => T
  listener: (rows: T[]) => void
  onError?: (err: Error) => void
}): Unsubscribe {
  const { db, path, branchId, constraints = [], mapDocument, listener, onError } = args
  const chunkSize = Math.max(1, Math.min(args.chunkSize ?? NIGHTCLUB_CASHBOX_QUERY_CHUNK_SIZE, NIGHTCLUB_CASHBOX_QUERY_CHUNK_SIZE))
  const cashboxIds = [...new Set(args.cashboxIds.filter(id => typeof id === 'string' && id.length > 0))]
  if (!cashboxIds.length) {
    listener([])
    return () => {}
  }

  let active = true
  const groups = new Map<string, Map<string, T>>()
  const subscriptions: Unsubscribe[] = []
  const emit = () => {
    if (!active) return
    const merged = new Map<string, T>()
    for (const group of groups.values()) for (const [id, row] of group) merged.set(id, row)
    listener([...merged.values()])
  }
  const ref = collection(db, path.join('/'))
  for (let offset = 0; offset < cashboxIds.length; offset += chunkSize) {
    const ids = cashboxIds.slice(offset, offset + chunkSize)
    const key = ids.join('\u0000')
    groups.set(key, new Map())
    subscriptions.push(onSnapshot(
      query(ref, where('branchId', '==', branchId), where('cashboxId', 'in', ids), ...constraints),
      snapshot => {
        if (!active) return
        groups.set(key, new Map(snapshot.docs.map(document => [document.id, mapDocument(document.id, document.data() as Record<string, unknown>)])))
        emit()
      },
      error => { if (active) onError?.(error) },
    ))
  }
  return () => {
    active = false
    subscriptions.forEach(unsubscribe => unsubscribe())
    groups.clear()
  }
}
