import { useEffect, useState } from 'react'
import { doc, onSnapshot } from 'firebase/firestore'
import { getFirebaseContext } from '../../../lib/firebase'
import type { NightclubDataset } from '../domain/nightclubAccounts'
import { subscribeToNightclubFirestoreDataset } from './nightclubFirestoreDataset'
import type { NightclubFinancialReadScope } from './nightclubFinancialSubscriptions'
import { resolveNightclubFinancialReadScope } from './nightclubFinancialSubscriptions'

interface FirestoreDatasetState {
  key: string
  data: NightclubDataset | null
  error: NightclubFirestoreDatasetError | null
  authorizedCashboxIds: string[]
}

export type NightclubFirestoreDatasetErrorKind = 'permission' | 'network' | 'unavailable'

export interface NightclubFirestoreDatasetError {
  kind: NightclubFirestoreDatasetErrorKind
}

type FirestoreErrorLike = { code?: unknown; message?: unknown }

/** Keeps Firestore transport details out of production UI states. */
export function classifyNightclubFirestoreError(error: FirestoreErrorLike): NightclubFirestoreDatasetError {
  const code = typeof error.code === 'string' ? error.code : ''
  if (code === 'permission-denied' || code === 'firestore/permission-denied') return { kind: 'permission' }
  if (['unavailable', 'deadline-exceeded', 'cancelled'].includes(code)) return { kind: 'network' }
  return { kind: 'unavailable' }
}

/**
 * Production data has no local fallback. The signed-in member and their own
 * operator context are subscribed separately, so an old Studio selection can
 * never choose a product cashbox.
 */
export function useNightclubFirestoreDataset(tenantId: string, branchId = 'main', includeInventory = false, enabled = true, options: { operatorUid?: string; includeCashboxContext?: boolean; financialReadScope?: NightclubFinancialReadScope } = {}) {
  const configuredScope = options.financialReadScope ?? { kind: 'unresolved' as const }
  const configuredScopeKey = configuredScope.kind === 'restricted' ? `restricted:${[...configuredScope.cashboxIds].sort().join(',')}` : configuredScope.kind
  const key = `${tenantId}:${branchId}:${includeInventory ? 'inventory' : 'operations'}:${enabled ? 'enabled' : 'disabled'}:${options.operatorUid || 'anonymous'}:${options.includeCashboxContext ? 'cashbox' : 'no-cashbox'}:${options.operatorUid ? 'member-scope' : configuredScopeKey}`
  const [state, setState] = useState<FirestoreDatasetState>({ key, data: null, error: null, authorizedCashboxIds: [] })
  const visible = state.key === key ? state : { key, data: null, error: null, authorizedCashboxIds: [] }

  useEffect(() => {
    let unsubscribeData: () => void = () => {}
    let unsubscribeMember: () => void = () => {}
    let cancelled = false
    if (!enabled) return () => { cancelled = true }
    void (async () => {
      const context = await getFirebaseContext()
      if (!context || context.tenantId !== tenantId) {
        if (!cancelled) setState({ key, data: null, error: { kind: 'unavailable' }, authorizedCashboxIds: [] })
        return
      }
      let currentScopeKey = ''
      const startDataset = (scope: NightclubFinancialReadScope) => {
        const scopeKey = scope.kind === 'restricted' ? `restricted:${[...scope.cashboxIds].sort().join(',')}` : scope.kind
        if (scopeKey === currentScopeKey || cancelled) return
        currentScopeKey = scopeKey
        unsubscribeData()
        unsubscribeData = () => {}
        setState({ key, data: null, error: null, authorizedCashboxIds: scope.kind === 'restricted' ? scope.cashboxIds : [] })
        if (scope.kind === 'unresolved') return
        unsubscribeData = subscribeToNightclubFirestoreDataset(
          context.db,
          tenantId,
          branchId,
          value => { if (!cancelled) setState({ key, data: value, error: null, authorizedCashboxIds: scope.kind === 'restricted' ? scope.cashboxIds : [] }) },
          value => { if (!cancelled) setState({ key, data: null, error: classifyNightclubFirestoreError(value), authorizedCashboxIds: scope.kind === 'restricted' ? scope.cashboxIds : [] }) },
          { includeInventory, operatorUid: options.operatorUid, includeCashboxContext: options.includeCashboxContext, financialReadScope: scope },
        ).unsubscribe
      }
      if (options.operatorUid) unsubscribeMember = onSnapshot(
        doc(context.db, 'tenants', tenantId, 'members', options.operatorUid),
        snapshot => {
          if (!snapshot.exists()) { startDataset({ kind: 'unresolved' }); return }
          startDataset(resolveNightclubFinancialReadScope(snapshot.data()))
        },
        value => { if (!cancelled) setState({ key, data: null, error: classifyNightclubFirestoreError(value), authorizedCashboxIds: [] }) },
      )
      else startDataset(options.financialReadScope ?? { kind: 'unresolved' })
    })()
    return () => { cancelled = true; unsubscribeData(); unsubscribeMember() }
  }, [tenantId, branchId, includeInventory, enabled, key, options.operatorUid, options.includeCashboxContext, options.financialReadScope])

  return { data: visible.data, error: visible.error, loading: visible.data === null && visible.error === null, authorizedCashboxIds: visible.authorizedCashboxIds }
}
