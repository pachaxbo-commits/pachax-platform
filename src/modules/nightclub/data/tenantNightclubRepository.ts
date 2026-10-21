import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit as fsLimit,
  onSnapshot,
  orderBy,
  query,
  where,
} from 'firebase/firestore'
import { getFirebaseContext } from '../../../lib/firebase'
import { gateway } from '../../../services/gateway'
import type {
  NightclubAccount,
  NightclubCashMovement,
  NightclubCashbox,
  NightclubCommission,
  NightclubCommissionPayment,
  NightclubCommissionPaymentDraft,
  NightclubCourtesy,
  NightclubCourtesyDraft,
  NightclubCustomer,
  NightclubCustomerIncident,
  NightclubCustomerStatus,
  NightclubInventoryBalance,
  NightclubInventoryItem,
  NightclubInventoryLot,
  NightclubInventoryMovement,
  NightclubLocation,
  NightclubMember,
  NightclubOpenBottle,
  NightclubOperatorContext,
  NightclubPayment,
  NightclubPaymentDraft,
  NightclubProduct,
  NightclubReservation,
  NightclubRound,
  NightclubRoundDraft,
  NightclubServiceTarget,
  NightclubShift,
  NightclubStaff,
  NightclubTable,
  NightclubTransfer,
  NightclubZone,
} from '../domain/nightclubAccounts.ts'
import {
  assembleOperationalAccounts,
  resolveShiftIdToTrack,
} from '../domain/nightclubAccounts.ts'
import type { ReservationDraft } from '../domain/nightclubFloor.ts'
import type {
  NightclubConsumptionDraft,
  NightclubLoungeSale,
  NightclubLoungeSaleDraft,
  NightclubPromoter,
  NightclubPromoterConsumption,
  NightclubPromoterEvent,
  NightclubSaleDraft,
  NightclubTicketSale,
} from '../domain/nightclubPromoters.ts'

import type {
  NightclubCatalogSnapshot,
  NightclubFloorSnapshot,
  NightclubInventorySnapshot,
  NightclubLocationInventorySnapshot,
  NightclubRepository,
  Unsubscribe,
} from './nightclubRepository'
import type { NightclubFinancialReadScope } from './nightclubFinancialSubscriptions'
import { NIGHTCLUB_CASHBOX_STATUS_QUERY_CHUNK_SIZE, subscribeCashboxScopedCollection } from './nightclubFinancialSubscriptions'

const generateOpId = () => `op_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`

export { assembleOperationalAccounts, resolveShiftIdToTrack }

export class TenantNightclubRepository implements NightclubRepository {
  private readonly tenantId: string
  private readonly branchId: string
  private readonly uid?: string

  constructor(tenantId: string, branchId = 'main', uid?: string) {
    this.tenantId = tenantId
    this.branchId = branchId
    this.uid = uid
  }

  private async dispatch<T = unknown>(
    commandType: string,
    operationId = generateOpId(),
    payload: Record<string, unknown> = {}
  ): Promise<T> {
    return gateway<T>('tenantGateway', {
      action: 'nightclubCommand',
      tenantId: this.tenantId,
      branchId: this.branchId,
      operationId,
      commandType,
      payload,
    })
  }

  subscribeFloor(listener: (value: NightclubFloorSnapshot) => void, onError?: (err: Error) => void): Unsubscribe {
    let zones: NightclubZone[] = []
    let tables: NightclubTable[] = []
    let reservations: NightclubReservation[] = []
    let active = true

    let unsubZones: Unsubscribe | null = null
    let unsubTables: Unsubscribe | null = null
    let unsubRes: Unsubscribe | null = null

    const emit = () => {
      if (active) listener({ zones, tables, reservations })
    }

    void getFirebaseContext().then(ctx => {
      if (!ctx || !active) return
      const root = collection(ctx.db, 'tenants', this.tenantId, 'nightclubZones')
      const tablesRef = collection(ctx.db, 'tenants', this.tenantId, 'nightclubTables')
      const resRef = collection(ctx.db, 'tenants', this.tenantId, 'nightclubReservations')

      unsubZones = onSnapshot(
        query(root, where('branchId', '==', this.branchId)),
        snap => {
          zones = snap.docs.map(d => ({ id: d.id, ...(d.data() as Omit<NightclubZone, 'id'>) })).sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0))
          emit()
        },
        err => onError?.(err)
      )

      unsubTables = onSnapshot(
        query(tablesRef, where('branchId', '==', this.branchId)),
        snap => {
          tables = snap.docs.map(d => ({ id: d.id, ...(d.data() as Omit<NightclubTable, 'id'>) }))
          emit()
        },
        err => onError?.(err)
      )

      unsubRes = onSnapshot(
        query(resRef, where('branchId', '==', this.branchId)),
        snap => {
          reservations = snap.docs.map(d => ({ id: d.id, ...(d.data() as Omit<NightclubReservation, 'id'>) }))
          emit()
        },
        err => onError?.(err)
      )
    })

    return () => {
      active = false
      if (unsubZones) unsubZones()
      if (unsubTables) unsubTables()
      if (unsubRes) unsubRes()
    }
  }

  subscribeOperationalAccounts(listener: (value: NightclubAccount[]) => void, onError?: (err: Error) => void, options?: { includeRounds?: boolean; includePayments?: boolean; financialReadScope?: NightclubFinancialReadScope }): Unsubscribe {
    let openAccounts: Array<Record<string, unknown> & { id: string }> = []
    let closedAccounts: Array<Record<string, unknown> & { id: string }> = []
    let rounds: NightclubRound[] = []
    let payments: NightclubPayment[] = []
    let active = true

    let unsubOpen: Unsubscribe | null = null
    let unsubClosed: Unsubscribe | null = null
    let unsubRounds: Unsubscribe | null = null
    let unsubPayments: Unsubscribe | null = null

    const includeRounds = options?.includeRounds !== false
    const includePayments = options?.includePayments !== false
    const financialReadScope = options?.financialReadScope ?? { kind: 'unresolved' as const }

    const emit = () => {
      if (!active) return
      const assembled = assembleOperationalAccounts(openAccounts, closedAccounts, rounds, payments)
      listener(assembled)
    }

    void getFirebaseContext().then(ctx => {
      if (!ctx || !active) return
      if (financialReadScope.kind === 'unresolved' || (financialReadScope.kind === 'restricted' && !financialReadScope.cashboxIds.length)) {
        listener([])
        return
      }
      const accRef = collection(ctx.db, 'tenants', this.tenantId, 'nightclubAccounts')
      const roundsRef = collection(ctx.db, 'tenants', this.tenantId, 'nightclubRounds')
      const paymentsRef = collection(ctx.db, 'tenants', this.tenantId, 'nightclubPayments')

      const onOpen = (rows: Array<Record<string, unknown> & { id: string }>) => { if (active) { openAccounts = rows; emit() } }
      const onClosed = (rows: Array<Record<string, unknown> & { id: string }>) => { if (active) { closedAccounts = rows; emit() } }
      const onRounds = (rows: NightclubRound[]) => { if (active) { rounds = rows; emit() } }
      const onPayments = (rows: NightclubPayment[]) => { if (active) { payments = rows; emit() } }
      if (financialReadScope.kind === 'restricted') {
        unsubOpen = subscribeCashboxScopedCollection({ db: ctx.db, path: ['tenants', this.tenantId, 'nightclubAccounts'], branchId: this.branchId, cashboxIds: financialReadScope.cashboxIds, chunkSize: NIGHTCLUB_CASHBOX_STATUS_QUERY_CHUNK_SIZE, constraints: [where('status', 'in', ['open', 'bill_requested'])], mapDocument: (id, data) => ({ id, ...data }), listener: onOpen, onError })
        unsubClosed = subscribeCashboxScopedCollection({ db: ctx.db, path: ['tenants', this.tenantId, 'nightclubAccounts'], branchId: this.branchId, cashboxIds: financialReadScope.cashboxIds, constraints: [where('status', '==', 'closed'), fsLimit(50)], mapDocument: (id, data) => ({ id, ...data }), listener: onClosed, onError })
        if (includeRounds) unsubRounds = subscribeCashboxScopedCollection({ db: ctx.db, path: ['tenants', this.tenantId, 'nightclubRounds'], branchId: this.branchId, cashboxIds: financialReadScope.cashboxIds, constraints: [fsLimit(200)], mapDocument: (id, data) => ({ ...data, id } as unknown as NightclubRound), listener: onRounds, onError })
        if (includePayments) unsubPayments = subscribeCashboxScopedCollection<NightclubPayment & { id: string }>({ db: ctx.db, path: ['tenants', this.tenantId, 'nightclubPayments'], branchId: this.branchId, cashboxIds: financialReadScope.cashboxIds, constraints: [fsLimit(200)], mapDocument: (id, data) => ({ ...data, id }) as NightclubPayment & { id: string }, listener: rows => onPayments(rows), onError })
        return
      }

      unsubOpen = onSnapshot(
        query(accRef, where('branchId', '==', this.branchId), where('status', 'in', ['open', 'bill_requested'])),
        snap => {
          openAccounts = snap.docs.map(d => ({ id: d.id, ...(d.data() as Record<string, unknown>) }))
          emit()
        },
        err => onError?.(err)
      )

      unsubClosed = onSnapshot(
        query(accRef, where('branchId', '==', this.branchId), where('status', '==', 'closed'), fsLimit(50)),
        snap => {
          closedAccounts = snap.docs.map(d => ({ id: d.id, ...(d.data() as Record<string, unknown>) }))
          emit()
        },
        err => onError?.(err)
      )

      if (includeRounds) {
        unsubRounds = onSnapshot(
          query(roundsRef, where('branchId', '==', this.branchId), fsLimit(200)),
          snap => {
            rounds = snap.docs.map(d => ({ ...(d.data() as Record<string, unknown>), id: d.id } as unknown as NightclubRound))
            emit()
          },
          err => onError?.(err)
        )
      }

      if (includePayments) {
        unsubPayments = onSnapshot(
          query(paymentsRef, where('branchId', '==', this.branchId), fsLimit(200)),
          snap => {
            payments = snap.docs.map(d => ({ ...(d.data() as Record<string, unknown>), id: d.id } as unknown as NightclubPayment))
            emit()
          },
          err => onError?.(err)
        )
      }
    })

    return () => {
      active = false
      if (unsubOpen) unsubOpen()
      if (unsubClosed) unsubClosed()
      if (unsubRounds) unsubRounds()
      if (unsubPayments) unsubPayments()
    }
  }

  subscribeOpenAccounts(listener: (value: NightclubAccount[]) => void): Unsubscribe {
    return this.subscribeOperationalAccounts(listener, undefined, { financialReadScope: { kind: 'unresolved' } })
  }

  subscribeActiveBarRounds(listener: (value: NightclubRound[]) => void, financialReadScope: NightclubFinancialReadScope = { kind: 'unresolved' }): Unsubscribe {
    let active = true
    let unsub: Unsubscribe | null = null

    void getFirebaseContext().then(ctx => {
      if (!ctx || !active) return
      const roundsRef = collection(ctx.db, 'tenants', this.tenantId, 'nightclubRounds')
      if (financialReadScope.kind === 'unresolved' || (financialReadScope.kind === 'restricted' && !financialReadScope.cashboxIds.length)) { listener([]); return }
      if (financialReadScope.kind === 'restricted') {
        unsub = subscribeCashboxScopedCollection({ db: ctx.db, path: ['tenants', this.tenantId, 'nightclubRounds'], branchId: this.branchId, cashboxIds: financialReadScope.cashboxIds, chunkSize: NIGHTCLUB_CASHBOX_STATUS_QUERY_CHUNK_SIZE, constraints: [where('status', 'in', ['pending', 'preparing'])], mapDocument: (id, data) => ({ ...data, id } as unknown as NightclubRound), listener: rows => { if (active) listener(rows) } })
        return
      }
      unsub = onSnapshot(
        query(roundsRef, where('branchId', '==', this.branchId), where('status', 'in', ['pending', 'preparing'])),
        snap => {
          if (active) listener(snap.docs.map(d => ({ ...(d.data() as Record<string, unknown>), id: d.id } as unknown as NightclubRound)))
        },
        () => {}
      )
    })

    return () => {
      active = false
      if (unsub) unsub()
    }
  }

  subscribeActiveShift(listener: (value: NightclubShift | null) => void, onError?: (err: Error) => void, financialReadScope: NightclubFinancialReadScope = { kind: 'unresolved' }): Unsubscribe {
    let active = true
    let unsubState: Unsubscribe | null = null
    let unsubShift: Unsubscribe | null = null
    let currentShiftId: string | null = null

    void getFirebaseContext().then(ctx => {
      if (!ctx || !active) return
      if (financialReadScope.kind === 'unresolved' || (financialReadScope.kind === 'restricted' && !financialReadScope.cashboxIds.length)) { listener(null); return }
      const stateRef = doc(ctx.db, 'tenants', this.tenantId, 'nightclubOperationalState', this.branchId)

      unsubState = onSnapshot(stateRef, snap => {
        if (!active) return
        const data = snap.data()
        if (financialReadScope.kind === 'restricted' && (!data?.cashboxId || !financialReadScope.cashboxIds.includes(String(data.cashboxId)))) {
          if (unsubShift) { unsubShift(); unsubShift = null }
          currentShiftId = null
          listener(null)
          return
        }
        const shiftIdToTrack = resolveShiftIdToTrack(data)
        if (shiftIdToTrack === currentShiftId) return
        currentShiftId = shiftIdToTrack

        if (unsubShift) {
          unsubShift()
          unsubShift = null
        }

        if (!shiftIdToTrack) {
          listener(null)
          return
        }

        const shiftRef = doc(ctx.db, 'tenants', this.tenantId, 'nightclubShifts', shiftIdToTrack)
        unsubShift = onSnapshot(shiftRef, shiftSnap => {
          if (!active) return
          if (!shiftSnap.exists()) {
            listener(null)
          } else {
            listener({ id: shiftSnap.id, ...(shiftSnap.data() as Omit<NightclubShift, 'id'>) })
          }
        }, err => onError?.(err))
      }, err => onError?.(err))
    })

    return () => {
      active = false
      if (unsubState) unsubState()
      if (unsubShift) unsubShift()
    }
  }

  subscribeCatalog(listener: (value: NightclubCatalogSnapshot) => void, onError?: (err: Error) => void): Unsubscribe {
    let active = true
    let unsub: Unsubscribe | null = null

    void getFirebaseContext().then(ctx => {
      if (!ctx || !active) return
      const productsRef = collection(ctx.db, 'tenants', this.tenantId, 'nightclubProducts')
      unsub = onSnapshot(
        query(productsRef, where('branchId', '==', this.branchId)),
        snap => {
          if (active) {
            const products = snap.docs
              .map(d => ({ ...(d.data() as Record<string, unknown>), id: d.id } as unknown as NightclubProduct))
              .filter(p => p.active !== false)
            listener({ products })
          }
        },
        err => onError?.(err)
      )
    })

    return () => {
      active = false
      if (unsub) unsub()
    }
  }

  subscribeInventory(listener: (value: NightclubInventorySnapshot) => void, onError?: (err: Error) => void): Unsubscribe {
    let inventory: NightclubInventoryItem[] = []
    let recentMovements: NightclubInventoryMovement[] = []
    let active = true

    let unsubInv: Unsubscribe | null = null
    let unsubMov: Unsubscribe | null = null

    const emit = () => {
      if (active) listener({ inventory, recentMovements })
    }

    void getFirebaseContext().then(ctx => {
      if (!ctx || !active) return
      const invRef = collection(ctx.db, 'tenants', this.tenantId, 'nightclubInventory')
      const movRef = collection(ctx.db, 'tenants', this.tenantId, 'nightclubInventoryMovements')

      unsubInv = onSnapshot(
        query(invRef, where('branchId', '==', this.branchId)),
        snap => {
          inventory = snap.docs.map(d => ({ id: d.id, ...(d.data() as Omit<NightclubInventoryItem, 'id'>) }))
          emit()
        },
        err => onError?.(err)
      )

      unsubMov = onSnapshot(
        query(movRef, where('branchId', '==', this.branchId), orderBy('createdAt', 'desc'), fsLimit(50)),
        snap => {
          recentMovements = snap.docs.map(d => {
            const row = d.data() as Record<string, unknown>
            return {
              id: d.id,
              operationId: (row.operationId as string) || d.id,
              inventoryId: (row.inventoryId as string) || '',
              quantity: (row.quantity as number) || 0,
              previous: (row.previous as number) || 0,
              current: (row.current as number) || 0,
              type: (row.type as NightclubInventoryMovement['type']) || 'sale',
              reason: row.reason as string | undefined,
              at: (row.createdAt as string) || (row.at as string) || new Date().toISOString(),
              actor: (row.actorUid as string) || (row.actor as string) || 'Sistema',
            }
          })
          emit()
        },
        err => onError?.(err)
      )
    })

    return () => {
      active = false
      if (unsubInv) unsubInv()
      if (unsubMov) unsubMov()
    }
  }

  subscribeCashMovements(shiftId: string, listener: (value: NightclubCashMovement[]) => void, onError?: (err: Error) => void, financialReadScope: NightclubFinancialReadScope = { kind: 'unresolved' }): Unsubscribe {
    if (!shiftId) {
      listener([])
      return () => {}
    }
    let active = true
    let unsub: Unsubscribe | null = null

    void getFirebaseContext().then(ctx => {
      if (!ctx || !active) return
      const cashRef = collection(ctx.db, 'tenants', this.tenantId, 'nightclubCashMovements')
      if (financialReadScope.kind === 'unresolved' || (financialReadScope.kind === 'restricted' && !financialReadScope.cashboxIds.length)) { listener([]); return }
      const mapMovement = (id: string, data: Record<string, unknown>): NightclubCashMovement => ({
        id,
        shiftId,
        type: (data.type as 'income' | 'expense') || 'income',
        method: (data.method as 'cash' | 'qr' | 'card') || 'cash',
        amount: (data.amount as number) || 0,
        description: (data.description as string) || `Movimiento ${id}`,
        at: (data.createdAt as string) || new Date().toISOString(),
        actor: (data.actorUid as string) || 'Caja',
        category: data.category as NightclubCashMovement['category'],
      })
      if (financialReadScope.kind === 'restricted') {
        unsub = subscribeCashboxScopedCollection({ db: ctx.db, path: ['tenants', this.tenantId, 'nightclubCashMovements'], branchId: this.branchId, cashboxIds: financialReadScope.cashboxIds, constraints: [where('shiftId', '==', shiftId)], mapDocument: mapMovement, listener: rows => { if (active) listener(rows) }, onError })
        return
      }
      unsub = onSnapshot(
        query(cashRef, where('branchId', '==', this.branchId), where('shiftId', '==', shiftId)),
        snap => {
          if (!active) return
          const list = snap.docs.map(d => {
            const data = d.data() as Record<string, unknown>
            return {
              id: d.id,
              shiftId,
              type: (data.type as 'income' | 'expense') || 'income',
              method: (data.method as 'cash' | 'qr' | 'card') || 'cash',
              amount: (data.amount as number) || 0,
              description: (data.description as string) || `Movimiento ${d.id}`,
              at: (data.createdAt as string) || new Date().toISOString(),
              actor: (data.actorUid as string) || 'Caja',
            }
          })
          listener(list)
        },
        err => onError?.(err)
      )
    })

    return () => {
      active = false
      if (unsub) unsub()
    }
  }

  async getCustomers(_queryText = '', limitCount = 50): Promise<NightclubCustomer[]> {
    const ctx = await getFirebaseContext()
    if (!ctx) return []
    const ref = collection(ctx.db, 'tenants', this.tenantId, 'nightclubCustomers')
    const snap = await getDocs(query(ref, where('branchId', '==', this.branchId), fsLimit(limitCount)))
    return snap.docs
      .map(d => ({ id: d.id, ...(d.data() as Omit<NightclubCustomer, 'id'>) }))
      .filter(c => c.active !== false)
  }

  async getStaff(): Promise<NightclubStaff[]> {
    const ctx = await getFirebaseContext()
    if (!ctx) return []
    const ref = collection(ctx.db, 'tenants', this.tenantId, 'members')
    const snap = await getDocs(ref)
    return snap.docs.map(d => {
      const item = d.data() as { displayName?: string; email?: string; roleId?: string; status?: string; nightclubPermissions?: string[]; cashboxIds?: string[] | null }
      return {
        id: d.id,
        name: item.displayName || item.email || d.id,
        email: item.email || '',
        role: (item.roleId || 'waiter') as NightclubStaff['role'],
        active: item.status === 'active',
        ...(Object.prototype.hasOwnProperty.call(item, 'cashboxIds') ? { cashboxIds: item.cashboxIds } : {}),
        permissions: item.nightclubPermissions,
      }
    })
  }

  async getCashMovements(shiftId: string, financialReadScope: NightclubFinancialReadScope = { kind: 'unresolved' }): Promise<NightclubCashMovement[]> {
    const ctx = await getFirebaseContext()
    if (!ctx || !shiftId || financialReadScope.kind === 'unresolved' || (financialReadScope.kind === 'restricted' && !financialReadScope.cashboxIds.length)) return []
    const ref = collection(ctx.db, 'tenants', this.tenantId, 'nightclubCashMovements')
    const snapshots = financialReadScope.kind === 'unrestricted'
      ? [await getDocs(query(ref, where('branchId', '==', this.branchId), where('shiftId', '==', shiftId)))]
      : await Promise.all(Array.from({ length: Math.ceil(financialReadScope.cashboxIds.length / 30) }, (_, index) => {
        const ids = financialReadScope.cashboxIds.slice(index * 30, index * 30 + 30)
        return getDocs(query(ref, where('branchId', '==', this.branchId), where('shiftId', '==', shiftId), where('cashboxId', 'in', ids)))
      }))
    const movements = new Map<string, NightclubCashMovement>()
    for (const d of snapshots.flatMap(snapshot => snapshot.docs)) {
      const data = d.data() as Record<string, unknown>
      movements.set(d.id, {
        id: d.id,
        shiftId,
        type: (data.type as 'income' | 'expense') || 'income',
        method: (data.method as 'cash' | 'qr' | 'card') || 'cash',
        amount: (data.amount as number) || 0,
        description: (data.description as string) || `Movimiento ${d.id}`,
        at: (data.createdAt as string) || new Date().toISOString(),
        actor: (data.actorUid as string) || 'Caja',
      })
    }
    return [...movements.values()]
  }

  async openAccount(input: { operationId: string; target: NightclubServiceTarget }): Promise<{ accountId: string }> {
    return this.dispatch<{ accountId: string }>('openAccount', input.operationId, { target: input.target })
  }

  async addRound(input: {
    operationId: string
    accountId: string
    items: NightclubRoundDraft[]
    customerId?: string | null
    serviceStaffId?: string
  }): Promise<{ roundId: string; accountId: string; total: number; status: string }> {
    return this.dispatch<{ roundId: string; accountId: string; total: number; status: string }>(
      'addRound',
      input.operationId,
      {
        accountId: input.accountId,
        items: input.items,
        customerId: input.customerId,
        serviceStaffId: input.serviceStaffId,
      }
    )
  }

  async settleRound(input: {
    operationId: string
    accountId: string
    items: NightclubRoundDraft[]
    payment: NightclubPaymentDraft
  }): Promise<{ roundId: string; paymentId: string; total: number }> {
    return this.dispatch<{ roundId: string; paymentId: string; total: number }>('settleRound', input.operationId, {
      accountId: input.accountId,
      items: input.items,
      payment: input.payment,
    })
  }

  async advanceRound(input: { operationId: string; accountId: string; roundId: string }): Promise<void> {
    await this.dispatch('advanceRound', input.operationId, {
      accountId: input.accountId,
      roundId: input.roundId,
    })
  }

  async deliverRound(input: { operationId: string; accountId: string; roundId: string }): Promise<void> {
    await this.dispatch('deliverRound', input.operationId, {
      accountId: input.accountId,
      roundId: input.roundId,
    })
  }

  async requestBill(input: { operationId: string; accountId: string }): Promise<{ accountId: string; status: string }> {
    return this.dispatch<{ accountId: string; status: string }>('requestBill', input.operationId, {
      accountId: input.accountId,
    })
  }

  async reopenBill(input: { operationId: string; accountId: string }): Promise<{ accountId: string; status: string }> {
    return this.dispatch<{ accountId: string; status: string }>('reopenBill', input.operationId, {
      accountId: input.accountId,
    })
  }

  async recordPayment(input: {
    operationId: string
    accountId: string
    amount: number
    method: string
    cashAmount?: number
    qrAmount?: number
    cardAmount?: number
    received?: number
  }): Promise<{ paymentId: string; balance: number }> {
    return this.dispatch<{ paymentId: string; balance: number }>('recordPayment', input.operationId, {
      accountId: input.accountId,
      amount: input.amount,
      method: input.method,
      cashAmount: input.cashAmount,
      qrAmount: input.qrAmount,
      cardAmount: input.cardAmount,
      received: input.received,
    })
  }

  async finishOccupancy(input: { operationId: string; accountId: string }): Promise<void> {
    await this.dispatch('finishOccupancy', input.operationId, {
      accountId: input.accountId,
    })
  }

  async refundRound(input: { operationId: string; accountId: string; roundId: string; reason: string; returnToStock?: boolean; items?: Array<{ itemId: string; quantity: number; returnToStock: boolean }> }): Promise<void> {
    await this.dispatch('refundRound', input.operationId, {
      accountId: input.accountId,
      roundId: input.roundId,
      reason: input.reason,
      returnToStock: input.returnToStock,
      items: input.items,
    })
  }

  async cancelRound(input: { operationId: string; roundId: string; reason: string }): Promise<void> {
    await this.dispatch('cancelRound', input.operationId, {
      roundId: input.roundId,
      reason: input.reason,
    })
  }

  async recordInventoryMovement(input: {
    operationId: string
    inventoryId: string
    quantity: number
    type: NightclubInventoryMovement['type']
    reason: string
  }): Promise<void> {
    await this.dispatch('inventoryMovement', input.operationId, {
      inventoryId: input.inventoryId,
      quantity: input.quantity,
      movementType: input.type,
      reason: input.reason,
    })
  }

  async openShift(input: { operationId: string; openingFloat: number }): Promise<{ shiftId: string }> {
    return this.dispatch<{ shiftId: string }>('openShift', input.operationId, {
      openingFloat: input.openingFloat,
    })
  }

  async closeShift(input: { operationId: string; shiftId: string; countedCash: number }): Promise<void> {
    await this.dispatch('closeShift', input.operationId, {
      shiftId: input.shiftId,
      countedCash: input.countedCash,
    })
  }

  async saveZone(input: { operationId: string; zone: { id?: string; name: string; sortOrder?: number } }): Promise<void> {
    await this.dispatch('saveZone', input.operationId, { zone: input.zone })
  }

  async deleteZone(input: { operationId: string; id: string }): Promise<void> {
    await this.dispatch('deleteZone', input.operationId, { id: input.id })
  }

  async saveTable(input: { operationId: string; table: { id?: string; name: string; zoneId: string; capacity?: number; status?: string } }): Promise<void> {
    await this.dispatch('saveTable', input.operationId, { table: input.table })
  }

  async deleteTable(input: { operationId: string; id: string }): Promise<void> {
    await this.dispatch('deleteTable', input.operationId, { id: input.id })
  }

  async saveProduct(input: { operationId: string; product: NightclubProduct }): Promise<void> {
    await this.dispatch('saveProduct', input.operationId, { product: input.product })
  }

  async saveInventory(input: { operationId: string; item: NightclubInventoryItem }): Promise<void> {
    await this.dispatch('saveInventory', input.operationId, { item: input.item })
  }

  async saveCustomer(input: { operationId: string; customer: NightclubCustomer }): Promise<void> {
    await this.dispatch('saveCustomer', input.operationId, { customer: input.customer })
  }

  async getRoundById(roundId: string): Promise<NightclubRound | null> {
    const ctx = await getFirebaseContext()
    if (!ctx) return null
    const snap = await getDoc(doc(ctx.db, 'tenants', this.tenantId, 'nightclubRounds', roundId))
    if (!snap.exists()) return null
    return { id: snap.id, ...(snap.data() as Omit<NightclubRound, 'id'>) }
  }

  subscribeReservations(listener: (value: NightclubReservation[]) => void): Unsubscribe {
    let active = true
    let unsub: Unsubscribe | null = null
    void getFirebaseContext().then(ctx => {
      if (!ctx || !active) return
      const ref = collection(ctx.db, 'tenants', this.tenantId, 'nightclubReservations')
      unsub = onSnapshot(
        query(ref, where('branchId', '==', this.branchId)),
        snap => {
          if (!active) return
          const list = snap.docs.map(d => ({ id: d.id, ...(d.data() as Omit<NightclubReservation, 'id'>) }))
          listener(list)
        },
        () => {}
      )
    })
    return () => {
      active = false
      if (unsub) unsub()
    }
  }

  subscribePromoters(listener: (value: NightclubPromoter[]) => void, onError?: (err: Error) => void): Unsubscribe {
    let active = true
    let unsub: Unsubscribe | null = null
    void getFirebaseContext().then(ctx => {
      if (!ctx || !active) return
      const ref = collection(ctx.db, 'tenants', this.tenantId, 'nightclubPromoters')
      unsub = onSnapshot(
        query(ref, where('branchId', '==', this.branchId)),
        snap => {
          if (!active) return
          const list = snap.docs.map(d => ({ id: d.id, ...(d.data() as Omit<NightclubPromoter, 'id'>) }))
          listener(list)
        },
        err => onError?.(err)
      )
    })
    return () => {
      active = false
      if (unsub) unsub()
    }
  }

  subscribePromoterEvents(listener: (value: NightclubPromoterEvent[]) => void, onError?: (err: Error) => void): Unsubscribe {
    let active = true
    let unsub: Unsubscribe | null = null
    void getFirebaseContext().then(ctx => {
      if (!ctx || !active) return
      const ref = collection(ctx.db, 'tenants', this.tenantId, 'nightclubPromoterEvents')
      unsub = onSnapshot(
        query(ref, where('branchId', '==', this.branchId)),
        snap => {
          if (!active) return
          const list = snap.docs.map(d => ({ id: d.id, ...(d.data() as Omit<NightclubPromoterEvent, 'id'>) }))
          listener(list)
        },
        err => onError?.(err)
      )
    })
    return () => {
      active = false
      if (unsub) unsub()
    }
  }

  subscribePromoterTicketSales(listener: (value: NightclubTicketSale[]) => void, onError?: (err: Error) => void): Unsubscribe {
    let active = true
    let unsub: Unsubscribe | null = null
    void getFirebaseContext().then(ctx => {
      if (!ctx || !active) return
      const ref = collection(ctx.db, 'tenants', this.tenantId, 'nightclubPromoterTicketSales')
      unsub = onSnapshot(
        query(ref, where('branchId', '==', this.branchId), fsLimit(200)),
        snap => {
          if (!active) return
          const list = snap.docs.map(d => ({ id: d.id, ...(d.data() as Omit<NightclubTicketSale, 'id'>) }))
          listener(list)
        },
        err => onError?.(err)
      )
    })
    return () => {
      active = false
      if (unsub) unsub()
    }
  }

  subscribePromoterLoungeSales(listener: (value: NightclubLoungeSale[]) => void, onError?: (err: Error) => void): Unsubscribe {
    let active = true
    let unsub: Unsubscribe | null = null
    void getFirebaseContext().then(ctx => {
      if (!ctx || !active) return
      const ref = collection(ctx.db, 'tenants', this.tenantId, 'nightclubPromoterLoungeSales')
      unsub = onSnapshot(
        query(ref, where('branchId', '==', this.branchId), fsLimit(100)),
        snap => {
          if (!active) return
          const list = snap.docs.map(d => ({ id: d.id, ...(d.data() as Omit<NightclubLoungeSale, 'id'>) }))
          listener(list)
        },
        err => onError?.(err)
      )
    })
    return () => {
      active = false
      if (unsub) unsub()
    }
  }

  subscribePromoterConsumptions(listener: (value: NightclubPromoterConsumption[]) => void, onError?: (err: Error) => void): Unsubscribe {
    let active = true
    let unsub: Unsubscribe | null = null
    void getFirebaseContext().then(ctx => {
      if (!ctx || !active) return
      const ref = collection(ctx.db, 'tenants', this.tenantId, 'nightclubPromoterConsumptions')
      unsub = onSnapshot(
        query(ref, where('branchId', '==', this.branchId), fsLimit(100)),
        snap => {
          if (!active) return
          const list = snap.docs.map(d => ({ id: d.id, ...(d.data() as Omit<NightclubPromoterConsumption, 'id'>) }))
          listener(list)
        },
        err => onError?.(err)
      )
    })
    return () => {
      active = false
      if (unsub) unsub()
    }
  }

  subscribeMembers(listener: (value: NightclubMember[]) => void, onError?: (err: Error) => void): Unsubscribe {
    let active = true
    let unsub: Unsubscribe | null = null
    void getFirebaseContext().then(ctx => {
      if (!ctx || !active) return
      const ref = collection(ctx.db, 'tenants', this.tenantId, 'nightclubMembers')
      unsub = onSnapshot(
        query(ref, where('branchId', '==', this.branchId), fsLimit(100)),
        snap => {
          if (!active) return
          const list = snap.docs.map(d => ({ id: d.id, ...(d.data() as Omit<NightclubMember, 'id'>) }))
          listener(list)
        },
        err => onError?.(err)
      )
    })
    return () => {
      active = false
      if (unsub) unsub()
    }
  }

  subscribeCourtesies(listener: (value: NightclubCourtesy[]) => void, onError?: (err: Error) => void): Unsubscribe {
    let active = true
    let unsub: Unsubscribe | null = null
    void getFirebaseContext().then(ctx => {
      if (!ctx || !active) return
      const ref = collection(ctx.db, 'tenants', this.tenantId, 'nightclubCourtesies')
      unsub = onSnapshot(
        query(ref, where('branchId', '==', this.branchId), fsLimit(100)),
        snap => {
          if (!active) return
          const list = snap.docs.map(d => ({ id: d.id, ...(d.data() as Omit<NightclubCourtesy, 'id'>) }))
          listener(list)
        },
        err => onError?.(err)
      )
    })
    return () => {
      active = false
      if (unsub) unsub()
    }
  }

  subscribeCommissions(listener: (value: NightclubCommission[]) => void, onError?: (err: Error) => void, financialReadScope: NightclubFinancialReadScope = { kind: 'unresolved' }): Unsubscribe {
    let active = true
    let unsub: Unsubscribe | null = null
    void getFirebaseContext().then(ctx => {
      if (!ctx || !active) return
      if (financialReadScope.kind === 'unresolved' || (financialReadScope.kind === 'restricted' && !financialReadScope.cashboxIds.length)) { listener([]); return }
      if (financialReadScope.kind === 'restricted') {
        unsub = subscribeCashboxScopedCollection({ db: ctx.db, path: ['tenants', this.tenantId, 'nightclubCommissions'], branchId: this.branchId, cashboxIds: financialReadScope.cashboxIds, constraints: [fsLimit(100)], mapDocument: (id, data) => ({ id, ...(data as Omit<NightclubCommission, 'id'>) }), listener: rows => { if (active) listener(rows) }, onError })
        return
      }
      const ref = collection(ctx.db, 'tenants', this.tenantId, 'nightclubCommissions')
      unsub = onSnapshot(
        query(ref, where('branchId', '==', this.branchId), fsLimit(100)),
        snap => {
          if (!active) return
          const list = snap.docs.map(d => ({ id: d.id, ...(d.data() as Omit<NightclubCommission, 'id'>) }))
          listener(list)
        },
        err => onError?.(err)
      )
    })
    return () => {
      active = false
      if (unsub) unsub()
    }
  }

  subscribeCommissionPayments(listener: (value: NightclubCommissionPayment[]) => void, onError?: (err: Error) => void, financialReadScope: NightclubFinancialReadScope = { kind: 'unresolved' }): Unsubscribe {
    let active = true
    let unsub: Unsubscribe | null = null
    void getFirebaseContext().then(ctx => {
      if (!ctx || !active) return
      if (financialReadScope.kind === 'unresolved' || (financialReadScope.kind === 'restricted' && !financialReadScope.cashboxIds.length)) { listener([]); return }
      if (financialReadScope.kind === 'restricted') {
        unsub = subscribeCashboxScopedCollection({ db: ctx.db, path: ['tenants', this.tenantId, 'nightclubCommissionPayments'], branchId: this.branchId, cashboxIds: financialReadScope.cashboxIds, constraints: [fsLimit(100)], mapDocument: (id, data) => ({ id, ...(data as Omit<NightclubCommissionPayment, 'id'>) }), listener: rows => { if (active) listener(rows) }, onError })
        return
      }
      const ref = collection(ctx.db, 'tenants', this.tenantId, 'nightclubCommissionPayments')
      unsub = onSnapshot(
        query(ref, where('branchId', '==', this.branchId), fsLimit(100)),
        snap => {
          if (!active) return
          const list = snap.docs.map(d => ({ id: d.id, ...(d.data() as Omit<NightclubCommissionPayment, 'id'>) }))
          listener(list)
        },
        err => onError?.(err)
      )
    })
    return () => {
      active = false
      if (unsub) unsub()
    }
  }

  subscribeCustomerIncidents(listener: (value: NightclubCustomerIncident[]) => void, onError?: (err: Error) => void): Unsubscribe {
    let active = true
    let unsub: Unsubscribe | null = null
    void getFirebaseContext().then(ctx => {
      if (!ctx || !active) return
      const ref = collection(ctx.db, 'tenants', this.tenantId, 'nightclubCustomerIncidents')
      unsub = onSnapshot(
        query(ref, where('branchId', '==', this.branchId), fsLimit(100)),
        snap => {
          if (!active) return
          const list = snap.docs.map(d => ({ id: d.id, ...(d.data() as Omit<NightclubCustomerIncident, 'id'>) }))
          listener(list)
        },
        err => onError?.(err)
      )
    })
    return () => {
      active = false
      if (unsub) unsub()
    }
  }

  async saveReservation(input: { operationId: string; reservation: ReservationDraft }): Promise<{ reservationId: string }> {
    return this.dispatch<{ reservationId: string }>('saveReservation', input.operationId, { reservation: input.reservation })
  }

  async cancelReservation(input: { operationId: string; id: string }): Promise<void> {
    await this.dispatch('cancelReservation', input.operationId, { id: input.id })
  }

  async arriveReservation(input: { operationId: string; id: string }): Promise<{ reservationId: string; accountId: string }> {
    return this.dispatch<{ reservationId: string; accountId: string }>('arriveReservation', input.operationId, { id: input.id })
  }

  async savePromoter(input: { operationId: string; promoter: NightclubPromoter }): Promise<{ promoterId: string }> {
    return this.dispatch<{ promoterId: string }>('savePromoter', input.operationId, { promoter: input.promoter })
  }

  async deletePromoter(input: { operationId: string; id: string }): Promise<void> {
    await this.dispatch('deletePromoter', input.operationId, { id: input.id })
  }

  async savePromoterEvent(input: { operationId: string; event: Pick<NightclubPromoterEvent, 'id' | 'name' | 'date' | 'status'> }): Promise<{ eventId: string }> {
    return this.dispatch<{ eventId: string }>('savePromoterEvent', input.operationId, { event: input.event })
  }

  async saveTicketSale(input: { operationId: string; sale: NightclubSaleDraft }): Promise<{ saleId: string; total: number }> {
    return this.dispatch<{ saleId: string; total: number }>('saveTicketSale', input.operationId, { sale: input.sale })
  }

  async saveLoungeSale(input: { operationId: string; sale: NightclubLoungeSaleDraft }): Promise<{ saleId: string }> {
    return this.dispatch<{ saleId: string }>('saveLoungeSale', input.operationId, { sale: input.sale })
  }

  async markLoungePaid(input: { operationId: string; saleId: string }): Promise<void> {
    await this.dispatch('markLoungePaid', input.operationId, { saleId: input.saleId })
  }

  async savePromoterConsumption(input: { operationId: string; consumption: NightclubConsumptionDraft }): Promise<{ consumptionId: string }> {
    return this.dispatch<{ consumptionId: string }>('savePromoterConsumption', input.operationId, { consumption: input.consumption })
  }

  async recordCashMovement(input: { operationId: string; type: 'income' | 'expense'; method: 'cash' | 'qr' | 'card'; amount: number; description: string; category?: string; notes?: string }): Promise<{ movementId: string }> {
    return this.dispatch<{ movementId: string }>('recordCashMovement', input.operationId, input)
  }

  async saveBottleInventory(input: { operationId: string; draft: any }): Promise<any> {
    return this.dispatch('saveBottleInventory', input.operationId, input)
  }

  async openBottle(input: { operationId: string; inventoryId: string }): Promise<any> {
    return this.dispatch('openBottle', input.operationId, input)
  }

  async bottleExit(input: { operationId: string; inventoryId: string; millilitres: number; exitType: string; reason: string }): Promise<any> {
    return this.dispatch('bottleExit', input.operationId, input)
  }

  async saveMember(input: { operationId: string; member: NightclubMember }): Promise<any> {
    return this.dispatch('saveMember', input.operationId, input)
  }

  async registerCourtesy(input: { operationId: string; draft: NightclubCourtesyDraft }): Promise<any> {
    return this.dispatch('registerCourtesy', input.operationId, input)
  }

  async cancelCourtesy(input: { operationId: string; courtesyId: string }): Promise<any> {
    return this.dispatch('cancelCourtesy', input.operationId, input)
  }

  async payCommissions(input: { operationId: string; draft: NightclubCommissionPaymentDraft }): Promise<any> {
    return this.dispatch('payCommissions', input.operationId, input)
  }

  async setCustomerStatus(input: { operationId: string; customerId: string; status: NightclubCustomerStatus }): Promise<any> {
    return this.dispatch('setCustomerStatus', input.operationId, input)
  }

  async saveCustomerIncident(input: { operationId: string; incident: any }): Promise<any> {
    return this.dispatch('saveCustomerIncident', input.operationId, input)
  }

  async deleteCustomerIncident(input: { operationId: string; incidentId: string }): Promise<any> {
    return this.dispatch('deleteCustomerIncident', input.operationId, input)
  }

  async assignCustomer(input: { operationId: string; accountId: string; customerId: string | null }): Promise<any> {
    return this.dispatch('assignCustomer', input.operationId, input)
  }

  subscribeOperatorContext(
    uidOrListener: string | ((value: NightclubOperatorContext | null) => void),
    maybeListener?: (value: NightclubOperatorContext | null) => void,
    onError?: (err: Error) => void
  ): Unsubscribe {
    const targetUid = typeof uidOrListener === 'string' ? uidOrListener : this.uid || ''
    const listener = typeof uidOrListener === 'function' ? uidOrListener : maybeListener!
    let active = true
    let unsub: Unsubscribe | null = null
    if (!targetUid) {
      listener(null)
      return () => { active = false }
    }
    void getFirebaseContext().then(ctx => {
      if (!ctx || !active) return
      const docRef = doc(ctx.db, 'tenants', this.tenantId, 'nightclubOperatorContexts', targetUid)
      unsub = onSnapshot(
        docRef,
        snap => {
          if (!active) return
          if (snap.exists() && snap.data()?.branchId === this.branchId) {
            listener({ id: snap.id, ...(snap.data() as Omit<NightclubOperatorContext, 'id'>) })
          } else {
            listener(null)
          }
        },
        err => onError?.(err)
      )
    })
    return () => {
      active = false
      if (unsub) unsub()
    }
  }

  subscribeCashboxes(listener: (value: NightclubCashbox[]) => void, onError?: (err: Error) => void): Unsubscribe {
    let active = true
    let unsub: Unsubscribe | null = null
    void getFirebaseContext().then(ctx => {
      if (!ctx || !active) return
      const ref = collection(ctx.db, 'tenants', this.tenantId, 'nightclubCashboxes')
      unsub = onSnapshot(
        query(ref, where('branchId', '==', this.branchId)),
        snap => {
          if (!active) return
          const list = snap.docs.map(d => ({ id: d.id, ...(d.data() as Omit<NightclubCashbox, 'id'>) }))
          listener(list)
        },
        err => onError?.(err)
      )
    })
    return () => {
      active = false
      if (unsub) unsub()
    }
  }

  subscribeLocations(listener: (value: NightclubLocation[]) => void, onError?: (err: Error) => void): Unsubscribe {
    let active = true
    let unsub: Unsubscribe | null = null
    void getFirebaseContext().then(ctx => {
      if (!ctx || !active) return
      const ref = collection(ctx.db, 'tenants', this.tenantId, 'nightclubLocations')
      unsub = onSnapshot(
        query(ref, where('branchId', '==', this.branchId)),
        snap => {
          if (!active) return
          const list = snap.docs.map(d => ({ id: d.id, ...(d.data() as Omit<NightclubLocation, 'id'>) }))
          listener(list)
        },
        err => onError?.(err)
      )
    })
    return () => {
      active = false
      if (unsub) unsub()
    }
  }

  subscribeLocationInventory(locationId: string, listener: (value: NightclubLocationInventorySnapshot) => void, onError?: (err: Error) => void): Unsubscribe {
    let balances: NightclubInventoryBalance[] = []
    let lots: NightclubInventoryLot[] = []
    let active = true
    let unsubBalances: Unsubscribe | null = null
    let unsubLots: Unsubscribe | null = null

    const emit = () => {
      if (!active) return
      listener({ balances: [...balances], lots: [...lots] })
    }

    void getFirebaseContext().then(ctx => {
      if (!ctx || !active) return
      const balRef = collection(ctx.db, 'tenants', this.tenantId, 'nightclubInventoryBalances')
      unsubBalances = onSnapshot(
        query(balRef, where('branchId', '==', this.branchId), where('locationId', '==', locationId)),
        snap => {
          if (!active) return
          balances = snap.docs.map(d => ({ id: d.id, ...(d.data() as Omit<NightclubInventoryBalance, 'id'>) }))
          emit()
        },
        err => onError?.(err)
      )

      const lotRef = collection(ctx.db, 'tenants', this.tenantId, 'nightclubInventoryLots')
      unsubLots = onSnapshot(
        query(lotRef, where('branchId', '==', this.branchId), where('locationId', '==', locationId)),
        snap => {
          if (!active) return
          lots = snap.docs.map(d => ({ id: d.id, ...(d.data() as Omit<NightclubInventoryLot, 'id'>) }))
          emit()
        },
        err => onError?.(err)
      )
    })

    return () => {
      active = false
      if (unsubBalances) unsubBalances()
      if (unsubLots) unsubLots()
    }
  }

  subscribeInventoryBalances(listener: (value: NightclubInventoryBalance[]) => void, onError?: (err: Error) => void): Unsubscribe {
    let active = true
    let unsub: Unsubscribe | null = null
    void getFirebaseContext().then(ctx => {
      if (!ctx || !active) return
      const ref = collection(ctx.db, 'tenants', this.tenantId, 'nightclubInventoryBalances')
      unsub = onSnapshot(
        query(ref, where('branchId', '==', this.branchId)),
        snap => {
          if (!active) return
          const list = snap.docs.map(d => ({ id: d.id, ...(d.data() as Omit<NightclubInventoryBalance, 'id'>) }))
          listener(list)
        },
        err => onError?.(err)
      )
    })
    return () => {
      active = false
      if (unsub) unsub()
    }
  }

  subscribeInventoryLots(listener: (value: NightclubInventoryLot[]) => void, onError?: (err: Error) => void): Unsubscribe {
    let active = true
    let unsub: Unsubscribe | null = null
    void getFirebaseContext().then(ctx => {
      if (!ctx || !active) return
      const ref = collection(ctx.db, 'tenants', this.tenantId, 'nightclubInventoryLots')
      unsub = onSnapshot(
        query(ref, where('branchId', '==', this.branchId)),
        snap => {
          if (!active) return
          const list = snap.docs.map(d => ({ id: d.id, ...(d.data() as Omit<NightclubInventoryLot, 'id'>) }))
          listener(list)
        },
        err => onError?.(err)
      )
    })
    return () => {
      active = false
      if (unsub) unsub()
    }
  }

  subscribeOpenBottles(listener: (value: NightclubOpenBottle[]) => void, onError?: (err: Error) => void): Unsubscribe {
    let active = true
    let unsub: Unsubscribe | null = null
    void getFirebaseContext().then(ctx => {
      if (!ctx || !active) return
      const ref = collection(ctx.db, 'tenants', this.tenantId, 'nightclubOpenBottles')
      unsub = onSnapshot(
        query(ref, where('branchId', '==', this.branchId)),
        snap => {
          if (!active) return
          const list = snap.docs.map(d => ({ id: d.id, ...(d.data() as Omit<NightclubOpenBottle, 'id'>) }))
          listener(list)
        },
        err => onError?.(err)
      )
    })
    return () => {
      active = false
      if (unsub) unsub()
    }
  }

  subscribeTransfers(listener: (value: NightclubTransfer[]) => void, onError?: (err: Error) => void): Unsubscribe {
    let active = true
    let unsub: Unsubscribe | null = null
    void getFirebaseContext().then(ctx => {
      if (!ctx || !active) return
      const ref = collection(ctx.db, 'tenants', this.tenantId, 'nightclubTransfers')
      unsub = onSnapshot(
        query(ref, where('branchId', '==', this.branchId)),
        snap => {
          if (!active) return
          const list = snap.docs.map(d => ({ id: d.id, ...(d.data() as Omit<NightclubTransfer, 'id'>) }))
          listener(list)
        },
        err => onError?.(err)
      )
    })
    return () => {
      active = false
      if (unsub) unsub()
    }
  }

  subscribeCashboxShifts(listener: (value: NightclubShift[]) => void, onError?: (err: Error) => void, financialReadScope: NightclubFinancialReadScope = { kind: 'unresolved' }): Unsubscribe {
    let active = true
    let unsub: Unsubscribe | null = null
    void getFirebaseContext().then(ctx => {
      if (!ctx || !active) return
      if (financialReadScope.kind === 'unresolved' || (financialReadScope.kind === 'restricted' && !financialReadScope.cashboxIds.length)) { listener([]); return }
      if (financialReadScope.kind === 'restricted') {
        unsub = subscribeCashboxScopedCollection({ db: ctx.db, path: ['tenants', this.tenantId, 'nightclubShifts'], branchId: this.branchId, cashboxIds: financialReadScope.cashboxIds, mapDocument: (id, data) => ({ id, ...(data as Omit<NightclubShift, 'id'>) }), listener: rows => { if (active) listener(rows) }, onError })
        return
      }
      const ref = collection(ctx.db, 'tenants', this.tenantId, 'nightclubShifts')
      unsub = onSnapshot(
        query(ref, where('branchId', '==', this.branchId)),
        snap => {
          if (!active) return
          const list = snap.docs.map(d => ({ id: d.id, ...(d.data() as Omit<NightclubShift, 'id'>) }))
          listener(list)
        },
        err => onError?.(err)
      )
    })
    return () => {
      active = false
      if (unsub) unsub()
    }
  }

  async selectCashbox(input: { operationId: string; cashboxId: string; confirmPending?: boolean }): Promise<{ cashboxId?: string; locationId: string; activeShiftId?: string | null }> {
    return this.dispatch<{ cashboxId?: string; locationId: string; activeShiftId?: string | null }>('selectCashbox', input.operationId, {
      cashboxId: input.cashboxId,
      confirmPending: input.confirmPending === true,
    })
  }

  async initializeNightclubInfrastructure(input: { operationId: string }): Promise<{ status: 'initialized' | 'already_initialized'; warehouseId: string; cashboxId: string }> {
    return this.dispatch('initializeNightclubInfrastructure', input.operationId)
  }

  async createNightclubCashbox(input: { operationId: string; name: string }): Promise<{ status: 'created'; cashboxId: string; locationId: string; name: string }> {
    return this.dispatch('createNightclubCashbox', input.operationId, { name: input.name })
  }

  async openCashboxShift(input: { operationId: string; cashboxId: string; openingFloat: number }): Promise<{ shiftId: string; cashboxId?: string }> {
    return this.dispatch<{ shiftId: string; cashboxId?: string }>('openCashboxShift', input.operationId, {
      cashboxId: input.cashboxId,
      openingFloat: input.openingFloat,
    })
  }

  async closeCashboxShift(input: { operationId: string; cashboxId: string; shiftId?: string; countedCash: number }): Promise<void> {
    await this.dispatch('closeShift', input.operationId, {
      shiftId: input.shiftId,
      countedCash: input.countedCash,
    })
  }

  async receiveWarehouseIntake(input: { operationId: string; receipt: any }): Promise<any> {
    return this.dispatch('receiveWarehouseIntake', input.operationId, { receipt: input.receipt })
  }

  async confirmPhysicalCount(input: { operationId: string; count: any }): Promise<any> {
    return this.dispatch('confirmPhysicalCount', input.operationId, { count: input.count })
  }

  async requestTransfer(input: { operationId: string; transfer: { lines: Array<{ inventoryId: string; quantity: number; unit: 'unit' | 'ml' | 'g' }> } }): Promise<{ transferId: string; destinationLocationId?: string }> {
    return this.dispatch<{ transferId: string; destinationLocationId?: string }>('requestTransfer', input.operationId, {
      transfer: { mode: 'pending_receipt', lines: input.transfer.lines },
    })
  }

  async dispatchTransfer(input: { operationId: string; transferId: string }): Promise<{ transferId: string; status?: string } | void> {
    return this.dispatch<{ transferId: string; status?: string }>('dispatchTransfer', input.operationId, {
      transferId: input.transferId,
    })
  }

  async receiveTransfer(input: { operationId: string; transferId: string }): Promise<{ transferId: string; status?: string } | void> {
    return this.dispatch<{ transferId: string; status?: string }>('receiveTransfer', input.operationId, {
      transferId: input.transferId,
    })
  }
}
