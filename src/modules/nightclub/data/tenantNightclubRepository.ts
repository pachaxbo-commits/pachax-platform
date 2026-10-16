import {
  collection,
  doc,
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
  NightclubCustomer,
  NightclubInventoryItem,
  NightclubInventoryMovement,
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
  NightclubZone,
} from '../domain/nightclubAccounts'
import type {
  NightclubCatalogSnapshot,
  NightclubFloorSnapshot,
  NightclubInventorySnapshot,
  NightclubRepository,
  Unsubscribe,
} from './nightclubRepository'

const generateOpId = () => `op_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`

export class TenantNightclubRepository implements NightclubRepository {
  private readonly tenantId: string
  private readonly branchId: string

  constructor(tenantId: string, branchId = 'main') {
    this.tenantId = tenantId
    this.branchId = branchId
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

  subscribeFloor(listener: (value: NightclubFloorSnapshot) => void): Unsubscribe {
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
        () => {}
      )

      unsubTables = onSnapshot(
        query(tablesRef, where('branchId', '==', this.branchId)),
        snap => {
          tables = snap.docs.map(d => ({ id: d.id, ...(d.data() as Omit<NightclubTable, 'id'>) }))
          emit()
        },
        () => {}
      )

      unsubRes = onSnapshot(
        query(resRef, where('branchId', '==', this.branchId)),
        snap => {
          reservations = snap.docs.map(d => ({ id: d.id, ...(d.data() as Omit<NightclubReservation, 'id'>) }))
          emit()
        },
        () => {}
      )
    })

    return () => {
      active = false
      if (unsubZones) unsubZones()
      if (unsubTables) unsubTables()
      if (unsubRes) unsubRes()
    }
  }

  subscribeOpenAccounts(listener: (value: NightclubAccount[]) => void): Unsubscribe {
    let rawAccounts: Array<Record<string, unknown> & { id: string }> = []
    let rounds: NightclubRound[] = []
    let payments: NightclubPayment[] = []
    let active = true

    let unsubAcc: Unsubscribe | null = null
    let unsubRounds: Unsubscribe | null = null
    let unsubPayments: Unsubscribe | null = null

    const emit = () => {
      if (!active) return
      const assembled: NightclubAccount[] = rawAccounts.map(raw => {
        const accountId = raw.id
        const accRounds = rounds.filter(r => (r as unknown as { accountId: string }).accountId === accountId)
        const accPayments = payments.filter(p => (p as unknown as { accountId: string }).accountId === accountId)
        return {
          ...(raw as unknown as NightclubAccount),
          id: accountId,
          rounds: accRounds,
          payments: accPayments,
          payment: accPayments.at(-1),
        }
      })
      listener(assembled)
    }

    void getFirebaseContext().then(ctx => {
      if (!ctx || !active) return
      const accRef = collection(ctx.db, 'tenants', this.tenantId, 'nightclubAccounts')
      const roundsRef = collection(ctx.db, 'tenants', this.tenantId, 'nightclubRounds')
      const paymentsRef = collection(ctx.db, 'tenants', this.tenantId, 'nightclubPayments')

      unsubAcc = onSnapshot(
        query(accRef, where('branchId', '==', this.branchId), where('status', 'in', ['open', 'bill_requested'])),
        snap => {
          rawAccounts = snap.docs.map(d => ({ id: d.id, ...(d.data() as Record<string, unknown>) }))
          emit()
        },
        () => {}
      )

      unsubRounds = onSnapshot(
        query(roundsRef, where('branchId', '==', this.branchId)),
        snap => {
          rounds = snap.docs.map(d => ({ ...(d.data() as Record<string, unknown>), id: d.id } as unknown as NightclubRound))
          emit()
        },
        () => {}
      )

      unsubPayments = onSnapshot(
        query(paymentsRef, where('branchId', '==', this.branchId)),
        snap => {
          payments = snap.docs.map(d => ({ ...(d.data() as Record<string, unknown>), id: d.id } as unknown as NightclubPayment))
          emit()
        },
        () => {}
      )
    })

    return () => {
      active = false
      if (unsubAcc) unsubAcc()
      if (unsubRounds) unsubRounds()
      if (unsubPayments) unsubPayments()
    }
  }

  subscribeActiveBarRounds(listener: (value: NightclubRound[]) => void): Unsubscribe {
    let active = true
    let unsub: Unsubscribe | null = null

    void getFirebaseContext().then(ctx => {
      if (!ctx || !active) return
      const roundsRef = collection(ctx.db, 'tenants', this.tenantId, 'nightclubRounds')
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

  subscribeActiveShift(listener: (value: NightclubShift | null) => void): Unsubscribe {
    let active = true
    let unsubState: Unsubscribe | null = null
    let unsubShift: Unsubscribe | null = null
    let currentShiftId: string | null = null

    void getFirebaseContext().then(ctx => {
      if (!ctx || !active) return
      const stateRef = doc(ctx.db, 'tenants', this.tenantId, 'nightclubOperationalState', this.branchId)

      unsubState = onSnapshot(stateRef, snap => {
        if (!active) return
        const activeShiftId = snap.data()?.activeShiftId || null
        if (activeShiftId === currentShiftId) return
        currentShiftId = activeShiftId

        if (unsubShift) {
          unsubShift()
          unsubShift = null
        }

        if (!activeShiftId) {
          listener(null)
          return
        }

        const shiftRef = doc(ctx.db, 'tenants', this.tenantId, 'nightclubShifts', activeShiftId)
        unsubShift = onSnapshot(shiftRef, shiftSnap => {
          if (!active) return
          if (!shiftSnap.exists()) {
            listener(null)
          } else {
            listener({ id: shiftSnap.id, ...(shiftSnap.data() as Omit<NightclubShift, 'id'>) })
          }
        })
      })
    })

    return () => {
      active = false
      if (unsubState) unsubState()
      if (unsubShift) unsubShift()
    }
  }

  subscribeCatalog(listener: (value: NightclubCatalogSnapshot) => void): Unsubscribe {
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
        () => {}
      )
    })

    return () => {
      active = false
      if (unsub) unsub()
    }
  }

  subscribeInventory(listener: (value: NightclubInventorySnapshot) => void): Unsubscribe {
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
        () => {}
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
        () => {}
      )
    })

    return () => {
      active = false
      if (unsubInv) unsubInv()
      if (unsubMov) unsubMov()
    }
  }

  subscribeCashMovements(shiftId: string, listener: (value: NightclubCashMovement[]) => void): Unsubscribe {
    if (!shiftId) {
      listener([])
      return () => {}
    }
    let active = true
    let unsub: Unsubscribe | null = null

    void getFirebaseContext().then(ctx => {
      if (!ctx || !active) return
      const cashRef = collection(ctx.db, 'tenants', this.tenantId, 'nightclubCashMovements')
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
        () => {}
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
      const item = d.data() as { displayName?: string; email?: string; roleId?: string; status?: string; nightclubPermissions?: string[] }
      return {
        id: d.id,
        name: item.displayName || item.email || d.id,
        email: item.email || '',
        role: (item.roleId || 'waiter') as NightclubStaff['role'],
        active: item.status === 'active',
        permissions: item.nightclubPermissions,
      }
    })
  }

  async getCashMovements(shiftId: string): Promise<NightclubCashMovement[]> {
    const ctx = await getFirebaseContext()
    if (!ctx || !shiftId) return []
    const ref = collection(ctx.db, 'tenants', this.tenantId, 'nightclubCashMovements')
    const snap = await getDocs(query(ref, where('branchId', '==', this.branchId), where('shiftId', '==', shiftId)))
    return snap.docs.map(d => {
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

  async refundRound(input: { operationId: string; accountId: string; roundId: string; reason: string }): Promise<void> {
    await this.dispatch('refundRound', input.operationId, {
      accountId: input.accountId,
      roundId: input.roundId,
      reason: input.reason,
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
}
