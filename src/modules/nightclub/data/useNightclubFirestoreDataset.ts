import { useEffect, useState } from 'react'
import { doc, onSnapshot } from 'firebase/firestore'
import { getFirebaseContext } from '../../../lib/firebase'
import type { NightclubDataset } from '../domain/nightclubAccounts'
import { subscribeToNightclubFirestoreDataset } from './nightclubFirestoreDataset'

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
export function useNightclubFirestoreDataset(tenantId: string, branchId = 'main', includeInventory = false, enabled = true, options: { operatorUid?: string; includeCashboxContext?: boolean } = {}) {
  const key = `${tenantId}:${branchId}:${includeInventory ? 'inventory' : 'operations'}:${enabled ? 'enabled' : 'disabled'}:${options.operatorUid || 'anonymous'}:${options.includeCashboxContext ? 'cashbox' : 'no-cashbox'}`
  const [state, setState] = useState<FirestoreDatasetState>({ key, data: null, error: null, authorizedCashboxIds: [] })
  const visible = state.key === key ? state : { key, data: null, error: null, authorizedCashboxIds: [] }

  useEffect(() => {
    let unsubscribe: () => void = () => {}
    let unsubscribeMember: () => void = () => {}
    let cancelled = false
    if (!enabled) return () => { cancelled = true }
    void (async () => {
      const context = await getFirebaseContext()
      if (!context || context.tenantId !== tenantId) {
        if (!cancelled) setState({ key, data: null, error: { kind: 'unavailable' }, authorizedCashboxIds: [] })
        return
      }
      unsubscribe = subscribeToNightclubFirestoreDataset(
        context.db,
        tenantId,
        branchId,
        value => { if (!cancelled) setState(previous => ({ key, data: value, error: null, authorizedCashboxIds: previous.key === key ? previous.authorizedCashboxIds : [] })) },
        value => { if (!cancelled) setState({ key, data: null, error: classifyNightclubFirestoreError(value), authorizedCashboxIds: [] }) },
        { includeInventory, operatorUid: options.operatorUid, includeCashboxContext: options.includeCashboxContext },
      ).unsubscribe
      if (options.operatorUid) unsubscribeMember = onSnapshot(
        doc(context.db, 'tenants', tenantId, 'members', options.operatorUid),
        snapshot => {
          const rawIds = snapshot.data()?.cashboxIds
          const authorizedCashboxIds = Array.isArray(rawIds) ? rawIds.filter((value): value is string => typeof value === 'string') : []
          if (!cancelled) setState(previous => ({ ...previous, key, authorizedCashboxIds }))
        },
        value => { if (!cancelled) setState({ key, data: null, error: classifyNightclubFirestoreError(value), authorizedCashboxIds: [] }) },
      )
    })()
    return () => { cancelled = true; unsubscribe(); unsubscribeMember() }
  }, [tenantId, branchId, includeInventory, enabled, key, options.operatorUid, options.includeCashboxContext])

  return { data: visible.data, error: visible.error, loading: visible.data === null && visible.error === null, authorizedCashboxIds: visible.authorizedCashboxIds }
}