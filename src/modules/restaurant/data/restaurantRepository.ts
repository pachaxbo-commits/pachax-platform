import {
  collection,
  doc,
  onSnapshot,
  query,
  where,
  orderBy,
  limit,
} from 'firebase/firestore'
import { getFirebaseContext } from '../../../lib/firebase'
import { gateway } from '../../../services/gateway'
import type { Order, OrderStatus, Product } from '../../../types'
import type { RestaurantSector, RestaurantTable } from '../types'

import type { FloorAction } from '../domain/restaurantFloor'
import type { RestaurantShift } from '../views/RestaurantExperience'
import type { RestaurantCustomer } from '../domain/restaurantCustomers'
import type { CustomerDraft } from '../components/RestaurantCustomerForm'
import type { InventoryMovement, InventoryMovementType } from '../domain/inventoryEngine'
import type { CashMovement } from '../domain/cashEngine'
import type { RestaurantMember, Role } from '../components/RestaurantUsers'

export interface RestaurantOperationalState {
  activeShiftId: string | null
  updatedAt?: string
}

const generateOpId = () => `op_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`

async function dispatchCommand<T = unknown>(
  tenantId: string,
  branchId: string,
  commandType: string,
  payload: Record<string, unknown> = {}
): Promise<T> {
  const operationId = generateOpId()
  return gateway<T>('tenantGateway', {
    action: 'restaurantCommand',
    tenantId,
    branchId: branchId || 'main',
    operationId,
    commandType,
    payload,
  })
}

export function subscribeOperationalState(
  tenantId: string,
  branchId: string,
  onNext: (state: RestaurantOperationalState) => void,
  onError?: (err: Error) => void
): () => void {
  let unsub: (() => void) | null = null
  let active = true

  getFirebaseContext().then(ctx => {
    if (!active || !ctx) return
    const stateRef = doc(ctx.db, 'tenants', tenantId, 'restaurantOperationalState', branchId || 'main')
    unsub = onSnapshot(
      stateRef,
      snap => {
        if (!active) return
        const data = snap.data()
        onNext({
          activeShiftId: data?.activeShiftId || null,
          updatedAt: data?.updatedAt,
        })
      },
      err => {
        if (active && onError) onError(err)
      }
    )
  }).catch(err => {
    if (active && onError) onError(err)
  })

  return () => {
    active = false
    if (unsub) unsub()
  }
}

export function subscribeActiveShift(
  tenantId: string,
  shiftId: string,
  onNext: (shift: RestaurantShift | null) => void,
  onError?: (err: Error) => void
): () => void {
  if (!shiftId) {
    onNext(null)
    return () => {}
  }

  let unsub: (() => void) | null = null
  let active = true

  getFirebaseContext().then(ctx => {
    if (!active || !ctx) return
    const shiftRef = doc(ctx.db, 'tenants', tenantId, 'restaurantShifts', shiftId)
    unsub = onSnapshot(
      shiftRef,
      snap => {
        if (!active) return
        if (!snap.exists()) {
          onNext(null)
          return
        }
        const data = snap.data()
        const shift: RestaurantShift = {
          id: snap.id,
          openedAt: data.openedAt || new Date().toISOString(),
          openedBy: data.openedBy || '',
          openingFloat: Number(data.openingFloat) || 0,
          closedAt: data.closedAt,
          closedBy: data.closedBy,
          expectedCashAtClose: data.expectedCash,
          reconciliation: data.reconciliation || (data.countedCash != null ? {
            countedCash: data.countedCash,
            difference: data.difference,
          } : undefined),
        }
        onNext(shift)
      },
      err => {
        if (active && onError) onError(err)
      }
    )
  }).catch(err => {
    if (active && onError) onError(err)
  })

  return () => {
    active = false
    if (unsub) unsub()
  }
}

export function subscribeShiftHistory(
  tenantId: string,
  branchId: string,
  onNext: (shifts: RestaurantShift[]) => void,
  onError?: (err: Error) => void
): () => void {
  let unsub: (() => void) | null = null
  let active = true

  getFirebaseContext().then(ctx => {
    if (!active || !ctx) return
    const shiftsCol = collection(ctx.db, 'tenants', tenantId, 'restaurantShifts')
    const q = query(
      shiftsCol,
      where('branchId', '==', branchId || 'main'),
      orderBy('openedAt', 'desc'),
      limit(20)
    )
    unsub = onSnapshot(
      q,
      snap => {
        if (!active) return
        const shifts: RestaurantShift[] = snap.docs.map(docSnap => {
          const data = docSnap.data()
          return {
            id: docSnap.id,
            openedAt: data.openedAt || new Date().toISOString(),
            openedBy: data.openedBy || '',
            openingFloat: Number(data.openingFloat) || 0,
            closedAt: data.closedAt,
            closedBy: data.closedBy,
            expectedCashAtClose: data.expectedCash,
            reconciliation: data.reconciliation || (data.countedCash != null ? {
              countedCash: data.countedCash,
              difference: data.difference,
            } : undefined),
          }
        })
        onNext(shifts)
      },
      err => {
        if (active && onError) onError(err)
      }
    )
  }).catch(err => {
    if (active && onError) onError(err)
  })

  return () => {
    active = false
    if (unsub) unsub()
  }
}

export function subscribeTables(
  tenantId: string,
  branchId: string,
  onNext: (tables: RestaurantTable[]) => void,
  onError?: (err: Error) => void
): () => void {
  let unsub: (() => void) | null = null
  let active = true

  getFirebaseContext().then(ctx => {
    if (!active || !ctx) return
    const col = collection(ctx.db, 'tenants', tenantId, 'restaurantTables')
    const q = query(col, where('branchId', '==', branchId || 'main'))
    unsub = onSnapshot(
      q,
      snap => {
        if (!active) return
        const tables: RestaurantTable[] = snap.docs.map(d => ({
          ...d.data(),
          id: d.id,
        } as RestaurantTable))
        onNext(tables)
      },
      err => {
        if (active && onError) onError(err)
      }
    )
  }).catch(err => {
    if (active && onError) onError(err)
  })

  return () => {
    active = false
    if (unsub) unsub()
  }
}

export function subscribeSectors(
  tenantId: string,
  branchId: string,
  onNext: (sectors: RestaurantSector[]) => void,
  onError?: (err: Error) => void
): () => void {
  let unsub: (() => void) | null = null
  let active = true

  getFirebaseContext().then(ctx => {
    if (!active || !ctx) return
    const col = collection(ctx.db, 'tenants', tenantId, 'restaurantSectors')
    const q = query(col, where('branchId', '==', branchId || 'main'))
    unsub = onSnapshot(
      q,
      snap => {
        if (!active) return
        const sectors: RestaurantSector[] = snap.docs.map(d => ({
          ...d.data(),
          id: d.id,
        } as RestaurantSector))
        onNext(sectors)
      },
      err => {
        if (active && onError) onError(err)
      }
    )
  }).catch(err => {
    if (active && onError) onError(err)
  })

  return () => {
    active = false
    if (unsub) unsub()
  }
}

export function subscribeOrders(
  tenantId: string,
  branchId: string,
  onNext: (orders: Order[]) => void,
  onError?: (err: Error) => void
): () => void {
  let unsub: (() => void) | null = null
  let active = true

  getFirebaseContext().then(ctx => {
    if (!active || !ctx) return
    const col = collection(ctx.db, 'tenants', tenantId, 'restaurantOrders')
    const q = query(col, where('branchId', '==', branchId || 'main'))
    unsub = onSnapshot(
      q,
      snap => {
        if (!active) return
        const orders: Order[] = snap.docs.map(d => ({
          ...d.data(),
          id: d.id,
        } as Order))
        onNext(orders)
      },
      err => {
        if (active && onError) onError(err)
      }
    )
  }).catch(err => {
    if (active && onError) onError(err)
  })

  return () => {
    active = false
    if (unsub) unsub()
  }
}

export function subscribeProducts(
  tenantId: string,
  onNext: (products: Product[]) => void,
  onError?: (err: Error) => void
): () => void {
  let unsub: (() => void) | null = null
  let active = true

  getFirebaseContext().then(ctx => {
    if (!active || !ctx) return
    const col = collection(ctx.db, 'tenants', tenantId, 'products')
    unsub = onSnapshot(
      col,
      snap => {
        if (!active) return
        const products: Product[] = snap.docs.map(d => ({
          ...d.data(),
          id: d.id,
        } as Product))
        onNext(products)
      },
      err => {
        if (active && onError) onError(err)
      }
    )
  }).catch(err => {
    if (active && onError) onError(err)
  })

  return () => {
    active = false
    if (unsub) unsub()
  }
}

export function subscribeCustomers(
  tenantId: string,
  onNext: (customers: RestaurantCustomer[]) => void,
  onError?: (err: Error) => void
): () => void {
  let unsub: (() => void) | null = null
  let active = true

  getFirebaseContext().then(ctx => {
    if (!active || !ctx) return
    const col = collection(ctx.db, 'tenants', tenantId, 'restaurantCustomers')
    unsub = onSnapshot(
      col,
      snap => {
        if (!active) return
        const customers: RestaurantCustomer[] = snap.docs.map(d => ({
          ...d.data(),
          id: d.id,
        } as RestaurantCustomer))
        onNext(customers)
      },
      err => {
        if (active && onError) onError(err)
      }
    )
  }).catch(err => {
    if (active && onError) onError(err)
  })

  return () => {
    active = false
    if (unsub) unsub()
  }
}

export function subscribeInventoryMovements(
  tenantId: string,
  branchId: string,
  onNext: (movements: InventoryMovement[]) => void,
  onError?: (err: Error) => void
): () => void {
  let unsub: (() => void) | null = null
  let active = true

  getFirebaseContext().then(ctx => {
    if (!active || !ctx) return
    const col = collection(ctx.db, 'tenants', tenantId, 'restaurantInventoryMovements')
    const q = query(
      col,
      where('branchId', '==', branchId || 'main'),
      orderBy('createdAt', 'desc'),
      limit(100)
    )
    unsub = onSnapshot(
      q,
      snap => {
        if (!active) return
        const movements: InventoryMovement[] = snap.docs.map(d => ({
          ...d.data(),
          id: d.id,
        } as InventoryMovement))
        onNext(movements)
      },
      err => {
        if (active && onError) onError(err)
      }
    )
  }).catch(err => {
    if (active && onError) onError(err)
  })

  return () => {
    active = false
    if (unsub) unsub()
  }
}

export function subscribeMembers(
  tenantId: string,
  onNext: (members: RestaurantMember[]) => void,
  onError?: (err: Error) => void
): () => void {
  let unsub: (() => void) | null = null
  let active = true

  getFirebaseContext().then(ctx => {
    if (!active || !ctx) return
    const col = collection(ctx.db, 'tenants', tenantId, 'members')
    unsub = onSnapshot(
      col,
      snap => {
        if (!active) return
        const members: RestaurantMember[] = snap.docs.map(d => {
          const data = d.data()
          return {
            id: d.id,
            name: data.displayName || data.email || 'Usuario',
            email: data.email || '',
            role: data.roleId || 'waiter',
            active: data.status === 'active',
          }
        })
        onNext(members)
      },
      err => {
        if (active && onError) onError(err)
      }
    )
  }).catch(err => {
    if (active && onError) onError(err)
  })

  return () => {
    active = false
    if (unsub) unsub()
  }
}

// Operational Mutations
export async function openShift(
  tenantId: string,
  branchId: string,
  openingFloat: number
): Promise<{ shiftId: string }> {
  return dispatchCommand<{ shiftId: string }>(tenantId, branchId, 'openShift', { openingFloat })
}

export async function closeShift(
  tenantId: string,
  branchId: string,
  shiftId: string,
  countedCash: number
): Promise<{ shiftId: string; difference: number }> {
  return dispatchCommand<{ shiftId: string; difference: number }>(tenantId, branchId, 'closeShift', { shiftId, countedCash })
}

export async function openTableOrder(
  tenantId: string,
  branchId: string,
  table: RestaurantTable & { customerId?: string; customerName?: string; customerPhone?: string; diners?: number }
): Promise<{ orderId: string }> {
  return dispatchCommand<{ orderId: string }>(tenantId, branchId, 'openTableOrder', {
    tableId: table.id,
    diners: table.diners,
    customerId: table.customerId,
    customerName: table.customerName,
    customerPhone: table.customerPhone,
  })
}

export async function addOrder(
  tenantId: string,
  branchId: string,
  order: Order
): Promise<{ orderId: string }> {
  return dispatchCommand<{ orderId: string }>(tenantId, branchId, 'addOrder', { order })
}

export async function addProduct(
  tenantId: string,
  branchId: string,
  orderId: string,
  input: { productId: string; quantity: number; note?: string }
): Promise<void> {
  await dispatchCommand(tenantId, branchId, 'addProduct', { orderId, input })
}

export async function advanceStatus(
  tenantId: string,
  branchId: string,
  orderId: string,
  status?: OrderStatus
): Promise<boolean> {
  await dispatchCommand(tenantId, branchId, 'advanceStatus', { orderId, status })
  return true
}

export async function advanceItemStatus(
  tenantId: string,
  branchId: string,
  orderId: string,
  itemId: string,
  status?: 'preparing' | 'ready' | 'delivered'
): Promise<boolean> {
  await dispatchCommand(tenantId, branchId, 'advanceItemStatus', { orderId, itemId, status })
  return true
}

export async function cancelOrder(
  tenantId: string,
  branchId: string,
  orderId: string,
  reason?: string
): Promise<boolean> {
  await dispatchCommand(tenantId, branchId, 'cancelOrder', { orderId, reason })
  return true
}

export async function cancelOrderItem(
  tenantId: string,
  branchId: string,
  orderId: string,
  itemId: string,
  quantity?: number,
  reason?: string
): Promise<boolean> {
  await dispatchCommand(tenantId, branchId, 'cancelOrderItem', { orderId, itemId, quantity, reason })
  return true
}

export async function updateTableStatus(
  tenantId: string,
  branchId: string,
  tableId: string,
  status: RestaurantTable['status']
): Promise<void> {
  await dispatchCommand(tenantId, branchId, 'updateTableStatus', { tableId, status })
}

export async function requestBill(
  tenantId: string,
  branchId: string,
  tableId: string
): Promise<void> {
  await dispatchCommand(tenantId, branchId, 'requestBill', { tableId })
}

export async function reopenBill(
  tenantId: string,
  branchId: string,
  tableId: string
): Promise<void> {
  await dispatchCommand(tenantId, branchId, 'reopenBill', { tableId })
}

export async function recordPayment(
  tenantId: string,
  branchId: string,
  orderId: string,
  input: { method: 'cash' | 'qr' | 'card' | 'mixed'; received: number; cashAmount?: number; qrAmount?: number; cardAmount?: number }
): Promise<void> {
  await dispatchCommand(tenantId, branchId, 'recordPayment', { orderId, ...input })
}

export async function floorAction(
  tenantId: string,
  branchId: string,
  action: FloorAction
): Promise<{ ok: boolean; error?: string }> {
  try {
    await dispatchCommand(tenantId, branchId, 'floorAction', { action })
    return { ok: true }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error al modificar el plano.'
    return { ok: false, error: message }
  }
}

export async function createProduct(
  tenantId: string,
  branchId: string,
  input: { name: string; categoryName: string; price: number; preparationArea: string }
): Promise<void> {
  await dispatchCommand(tenantId, branchId, 'saveProduct', {
    product: {
      name: input.name,
      categoryId: `cat-${input.categoryName.toLowerCase().replace(/\s+/g, '-')}`,
      price: input.price,
      preparationArea: input.preparationArea,
    },
  })
}

export async function saveProducts(
  tenantId: string,
  branchId: string,
  products: Product[]
): Promise<{ ok: boolean; count: number }> {
  return dispatchCommand<{ ok: boolean; count: number }>(tenantId, branchId, 'saveProducts', { products })
}

export async function saveCustomer(
  tenantId: string,
  branchId: string,
  customer: CustomerDraft,
  customerId?: string
): Promise<{ customerId: string; customer: RestaurantCustomer }> {
  return dispatchCommand<{ customerId: string; customer: RestaurantCustomer }>(tenantId, branchId, 'saveCustomer', {
    customer: { ...customer, id: customerId },
  })
}

export async function archiveCustomer(
  tenantId: string,
  branchId: string,
  customerId: string
): Promise<{ customerId: string; active: boolean }> {
  return dispatchCommand<{ customerId: string; active: boolean }>(tenantId, branchId, 'archiveCustomer', { customerId })
}

export async function assignCustomer(
  tenantId: string,
  branchId: string,
  orderId: string,
  customerId: string | undefined
): Promise<void> {
  await dispatchCommand(tenantId, branchId, 'assignCustomer', { orderId, customerId })
}

export async function recordInventoryMovement(
  tenantId: string,
  branchId: string,
  productId: string,
  nextStock: number,
  type: Exclude<InventoryMovementType, 'sale' | 'cancellation_return' | 'command_consumption' | 'migration_reconciliation'>,
  reason: string
): Promise<{ ok: boolean; movementId: string; nextStock: number }> {
  return dispatchCommand<{ ok: boolean; movementId: string; nextStock: number }>(
    tenantId,
    branchId,
    'recordInventoryMovement',
    { productId, nextStock, type, reason }
  )
}

export async function countInventoryItem(
  tenantId: string,
  branchId: string,
  productId: string,
  physical: number,
  note?: string
): Promise<{ ok: boolean; productId: string; physical: number }> {
  return dispatchCommand<{ ok: boolean; productId: string; physical: number }>(
    tenantId,
    branchId,
    'countInventoryItem',
    { productId, physical, note }
  )
}

export async function createTenantMember(
  tenantId: string,
  input: { name: string; email: string; role: Role; active: boolean; password?: string }
): Promise<{ uid: string }> {
  if (!input.password || input.password.length < 8) {
    throw new Error('La contraseña es obligatoria y debe tener al menos 8 caracteres.')
  }
  return gateway<{ uid: string }>('tenantGateway', {
    action: 'createMember',
    tenantId,
    operationId: generateOpId(),
    displayName: input.name,
    email: input.email,
    roleId: input.role,
    password: input.password,
    branchIds: ['main'],
  })
}

export async function updateTenantMember(
  tenantId: string,
  uid: string,
  input: { name?: string; role?: Role; active?: boolean }
): Promise<void> {
  await gateway('tenantGateway', {
    action: 'updateMember',
    tenantId,
    uid,
    roleId: input.role,
    active: input.active,
  })
}

export async function deleteTenantMember(
  tenantId: string,
  uid: string
): Promise<void> {
  await gateway('tenantGateway', {
    action: 'deleteMember',
    tenantId,
    uid,
  })
}

export function subscribeCashMovements(
  tenantId: string,
  _branchId: string,
  shiftId: string,
  onNext: (movements: CashMovement[]) => void,
  onError?: (err: Error) => void
): () => void {
  let unsub: (() => void) | null = null
  let active = true

  getFirebaseContext().then(ctx => {
    if (!active || !ctx) return
    const col = collection(ctx.db, 'tenants', tenantId, 'restaurantCashMovements')
    const q = query(
      col,
      where('shiftId', '==', shiftId)
    )
    unsub = onSnapshot(
      q,
      snap => {
        if (!active) return
        const movements: CashMovement[] = snap.docs.map(d => {
          const data = d.data()
          return {
            id: d.id,
            shiftId: data.shiftId || shiftId,
            type: data.type,
            category: data.category || 'other',
            description: data.description || '',
            amount: Number(data.amount) || 0,
            paymentMethod: data.method || data.paymentMethod || 'cash',
            createdAt: data.createdAt?.toDate?.() ? data.createdAt.toDate().toISOString() : (data.createdAt || ''),
            createdBy: data.actorUid || data.createdBy || '',
            note: data.note || '',
            supplier: data.supplier || '',
            workerId: data.workerId || '',
            active: data.active !== false,
          } as CashMovement
        })
        onNext(movements)
      },
      err => {
        if (active && onError) onError(err)
      }
    )
  }).catch(err => {
    if (active && onError) onError(err)
  })

  return () => {
    active = false
    if (unsub) unsub()
  }
}

export async function recordCashMovement(
  tenantId: string,
  branchId: string,
  movement: {
    type: 'income' | 'expense'
    category: string
    description: string
    amount: number
    paymentMethod?: CashMovement['paymentMethod']
    method?: 'cash' | 'qr' | 'card' | 'other'
    note?: string
    supplier?: string
    workerId?: string
  }
): Promise<{ ok: boolean; movementId: string }> {
  const method = movement.paymentMethod || movement.method || 'cash'
  return dispatchCommand<{ ok: boolean; movementId: string }>(
    tenantId,
    branchId,
    'recordCashMovement',
    {
      ...movement,
      method,
      paymentMethod: method,
    }
  )
}

export async function cancelCashMovement(
  tenantId: string,
  branchId: string,
  movementId: string,
  reason?: string
): Promise<{ ok: boolean; movementId: string; active: boolean }> {
  return dispatchCommand<{ ok: boolean; movementId: string; active: boolean }>(
    tenantId,
    branchId,
    'cancelCashMovement',
    { movementId, reason }
  )
}

export async function updateCashMovement(
  tenantId: string,
  branchId: string,
  movementId: string,
  data: Partial<CashMovement> & { method?: 'cash' | 'qr' | 'card' | 'other' }
): Promise<{ ok: boolean; movementId: string }> {
  const method = data.paymentMethod || data.method
  return dispatchCommand<{ ok: boolean; movementId: string }>(
    tenantId,
    branchId,
    'updateCashMovement',
    {
      movementId,
      ...data,
      ...(method ? { method, paymentMethod: method } : {}),
    }
  )
}


export async function archiveProduct(
  tenantId: string,
  branchId: string,
  productId: string
): Promise<{ ok: boolean; productId: string; archived: boolean }> {
  return dispatchCommand<{ ok: boolean; productId: string; archived: boolean }>(
    tenantId,
    branchId,
    'archiveProduct',
    { productId }
  )
}

export async function deleteProduct(
  tenantId: string,
  branchId: string,
  productId: string
): Promise<{ ok: boolean; productId: string; deleted: boolean }> {
  return dispatchCommand<{ ok: boolean; productId: string; deleted: boolean }>(
    tenantId,
    branchId,
    'deleteProduct',
    { productId }
  )
}
