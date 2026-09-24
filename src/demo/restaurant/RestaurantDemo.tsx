import { useState, useRef } from 'react'
import {
  RESTAURANT_CATEGORIES,
  RESTAURANT_PRODUCTS,
  RESTAURANT_INVENTORY_PRODUCTS,
  RESTAURANT_INGREDIENTS,
  RESTAURANT_EXTRAS,
  INITIAL_TABLES,
  type RestaurantTable,
  type RestaurantSector,
} from '../mocks/restaurantMock'
import type { Order, OrderStatus, Product } from '../../types'
import { consumePrintedBatch, type RestaurantStockMovement } from '../../modules/restaurant/domain/restaurantEngine'
import { calculateCashShiftSummary, type CashMovement } from '../../modules/restaurant/domain/cashEngine'
import { cancelRestaurantOrder, completeRestaurantPayment, placeRestaurantOrder, reconcileTableOrders, resolveOrderTable } from '../../modules/restaurant/domain/restaurantOperations'
import { applyRestaurantFloorAction, migrateRestaurantFloor, type FloorAction } from '../../modules/restaurant/domain/restaurantFloor'
import {
  RestaurantExperience,
  type RestaurantSession,
  type RestaurantShift,
} from '../../modules/restaurant/views/RestaurantExperience'
import { createRestaurantDataset } from '../datasets'
import type { DemoDatasetMode } from '../datasets/types'

type Shift = RestaurantShift
type AuditEvent = {
  id: string
  orderId?: string
  tableId?: string
  type: string
  actor: string
  at: string
  details?: Record<string, unknown>
}
type Batch = { id: string; sequence: number; createdAt: string; printedAt?: string; itemIds: string[] }

const STORAGE_KEY = 'pachax:restaurant-demo:operations:v2'
const LEGACY_KEY = 'pachax:restaurant-demo:operations:v1'

function readSaved<T>(key: string, fallback: T): T {
  try {
    const value = localStorage.getItem(key)
    return value ? (JSON.parse(value) as T) : fallback
  } catch {
    return fallback
  }
}

function loadInitialState(datasetMode: DemoDatasetMode) {
  const savedMode = localStorage.getItem(`${STORAGE_KEY}:dataset-mode`)
  if ((savedMode && savedMode !== datasetMode) || (datasetMode === 'empty' && !savedMode)) {
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith('pachax:restaurant-demo:')) localStorage.removeItem(key)
    }
  }
  const hasCurrent = ['2', '3'].includes(localStorage.getItem(`${STORAGE_KEY}:schemaVersion`) || '')
  const hasLegacy = localStorage.getItem(`${LEGACY_KEY}:orders`) !== null
  if (!hasCurrent && !hasLegacy) {
    const dataset = createRestaurantDataset(datasetMode)
    const linked = reconcileTableOrders(dataset.orders, dataset.tables)
    const state = { ...linked, sectors: dataset.sectors, products: dataset.products, shift: dataset.shift, stockMovements: [] as RestaurantStockMovement[], audit: [] as AuditEvent[], seeded: false }
    for (const key of ['orders', 'tables', 'sectors', 'products', 'shift', 'stockMovements', 'audit'] as const) {
      localStorage.setItem(`${STORAGE_KEY}:${key === 'stockMovements' ? 'stock-movements' : key}`, JSON.stringify(state[key]))
    }
    localStorage.setItem(`${STORAGE_KEY}:schemaVersion`, '3')
    localStorage.setItem(`${STORAGE_KEY}:dataset-mode`, datasetMode)
    localStorage.setItem(`${STORAGE_KEY}:seeded`, 'false')
    return state
  }
  const source = hasCurrent ? STORAGE_KEY : LEGACY_KEY
  const hadOrders = localStorage.getItem(`${source}:orders`) !== null
  const savedOrders = readSaved<Order[]>(`${source}:orders`, [])
  const savedTables = hadOrders
    ? readSaved<RestaurantTable[]>(`${source}:tables`, INITIAL_TABLES)
    : INITIAL_TABLES.map(table => ({ ...table, status: 'available' as const, activeOrderId: undefined, openedAt: undefined, openedBy: undefined, diners: undefined }))
  const floor = migrateRestaurantFloor(normalizeLegacyTables(savedTables, savedOrders), readSaved<RestaurantSector[] | undefined>(`${source}:sectors`, undefined))
  const reconciled = reconcileTableOrders(savedOrders, floor.tables)
  const legacyCatalog = readSaved<Product[]>(`${source}:products`, RESTAURANT_PRODUCTS)
  const catalogCrud = hasCurrent ? [] : readSaved<Product[]>('pachax:restaurant-demo:catalog-crud:v1', [])
  const catalog = (catalogCrud.length ? catalogCrud : legacyCatalog).map(product => {
    const fixture = RESTAURANT_PRODUCTS.find(item => item.id === product.id)
    return fixture ? { ...fixture, ...product, recipe: product.recipe || fixture.recipe, preparationArea: product.preparationArea || fixture.preparationArea, restaurantType: product.restaurantType || fixture.restaurantType } : product
  })
  const legacyInventory = hasCurrent ? [] : readSaved<typeof RESTAURANT_INGREDIENTS>('pachax:restaurant-demo:inventory-crud:v1', [])
  const ingredients = RESTAURANT_INVENTORY_PRODUCTS.map(product => {
    const current = catalog.find(item => item.id === product.id)
    if (current) return current
    const saved = legacyInventory.find(item => item.id === product.id)
    const factor = product.baseUnit === 'g' ? 1000 : 1
    return saved ? { ...product, stockBase: saved.currentStock * factor, minimumStockBase: saved.minStock * factor, unitCost: saved.unitCost / factor } : product
  })
  const products = [...catalog.filter(product => product.restaurantType !== 'ingredient'), ...ingredients, ...catalog.filter(product => product.restaurantType === 'ingredient' && !ingredients.some(item => item.id === product.id))]
  const normalizedOrders = reconciled.orders.map(order => ({ ...order, items: order.items.map(line => ({ ...line, productArea: line.productArea || products.find(product => product.id === line.productId)?.preparationArea || 'Cocina' })) }))
  const seeded = hasCurrent ? readSaved<boolean>(`${STORAGE_KEY}:seeded`, false) : false
  const state = { ...reconciled, sectors: floor.sectors, orders: normalizedOrders, products, shift: readSaved<Shift | null>(`${source}:shift`, null), stockMovements: readSaved<RestaurantStockMovement[]>(`${source}:stock-movements`, []), audit: readSaved<AuditEvent[]>(`${source}:audit`, []), seeded }
  if (!hasCurrent) {
    for (const key of ['orders', 'tables', 'sectors', 'products', 'shift', 'stockMovements', 'audit'] as const) {
      const storageName = key === 'stockMovements' ? 'stock-movements' : key
      localStorage.setItem(`${STORAGE_KEY}:${storageName}`, JSON.stringify(state[key]))
    }
    localStorage.setItem(`${STORAGE_KEY}:schemaVersion`, '3')
    localStorage.setItem(`${STORAGE_KEY}:seeded`, JSON.stringify(seeded))
  }
  if (hasCurrent) {
    localStorage.setItem(`${STORAGE_KEY}:tables`, JSON.stringify(state.tables))
    localStorage.setItem(`${STORAGE_KEY}:sectors`, JSON.stringify(state.sectors))
    localStorage.setItem(`${STORAGE_KEY}:schemaVersion`, '3')
  }
  localStorage.setItem(`${STORAGE_KEY}:dataset-mode`, datasetMode)
  return state
}

function normalizeLegacyTables(input: RestaurantTable[], existingOrders: Order[]): RestaurantTable[] {
  return input.map((table) => {
    if (!table.openedAt || /T/.test(table.openedAt)) return table
    const openedAt = new Date(
      `${new Date().toISOString().slice(0, 10)}T${table.openedAt}:00`
    ).toISOString()
    const orderExists = existingOrders.some(
      (order) =>
        order.id === table.activeOrderId ||
        (resolveOrderTable(order, input)?.id === table.id &&
          order.paymentStatus !== 'paid' &&
          order.status !== 'cancelled')
    )
    if (table.activeOrderId && !orderExists)
      return { ...table, openedAt, status: 'available', activeOrderId: undefined, diners: undefined }
    return { ...table, openedAt }
  })
}

export function RestaurantDemo({
  mode = 'team',
  simulatedRole = 'admin',
  onSelectRole,
  logoUrl,
  companyName,
  datasetMode = 'full',
  resetKey = 0,
}: {
  mode?: 'team' | 'simulated_role'
  simulatedRole?: string
  onSelectRole?: (roleId: string) => void
  logoUrl?: string
  companyName?: string
  datasetMode?: DemoDatasetMode
  resetKey?: number
}) {
  const [initial] = useState(() => loadInitialState(datasetMode))
  const seededRef = useRef(initial.seeded)
  const [orders, setOrders] = useState<Order[]>(initial.orders)
  const [tables, setTables] = useState<RestaurantTable[]>(initial.tables)
  const [sectors, setSectors] = useState<RestaurantSector[]>(initial.sectors)
  const [products, setProducts] = useState<Product[]>(initial.products)
  const [stockMovements, setStockMovements] = useState<RestaurantStockMovement[]>(initial.stockMovements)
  const [shift, setShift] = useState<Shift | null>(initial.shift)
  const [audit, setAudit] = useState<AuditEvent[]>(initial.audit)
  void resetKey
  const [cashierName, setCashierName] = useState(
    `Cajero ${simulatedRole === 'waiter' ? 'Ana' : 'Bistró Demo'}`
  )
  const submissionLock = useRef(false)
  void audit

  const persist = <T,>(key: string, value: T) => {
    try {
      localStorage.setItem(`${STORAGE_KEY}:${key}`, JSON.stringify(value))
    } catch {
      /* Private mode may disable storage. */
    }
  }


  const record = (event: Omit<AuditEvent, 'id' | 'actor' | 'at'>) => {
    setAudit((prev) => {
      const next = [
        { ...event, id: crypto.randomUUID(), actor: cashierName, at: new Date().toISOString() },
        ...prev,
      ]
      persist('audit', next)
      return next
    })
  }

  const updateOrders = (updater: (previous: Order[]) => Order[]) => {
    setOrders((previous) => {
      const next = updater(previous)
      persist('orders', next)
      return next
    })
  }

  const updateTables = (updater: (previous: RestaurantTable[]) => RestaurantTable[]) => {
    setTables((previous) => {
      const next = updater(previous)
      persist('tables', next)
      return next
    })
  }

  const handleFloorAction = (action: FloorAction): { ok: boolean; error?: string } => {
    if (!['admin', 'owner', 'team'].includes(mode === 'team' ? 'team' : simulatedRole)) return { ok: false, error: 'No tienes permiso para administrar el salón.' }
    try {
      const next = applyRestaurantFloorAction(tables, sectors, action, new Date().toISOString())
      updateTables(() => next.tables)
      setSectors(next.sectors)
      persist('sectors', next.sectors)
      record({ type: `floor_${action.type}`, tableId: action.type.startsWith('table.') ? action.id : undefined, details: { ...action } })
      return { ok: true }
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : 'No se pudo actualizar el salón.' }
    }
  }

  const updateProducts = (updater: (previous: Product[]) => Product[]) => {
    setProducts((previous) => {
      const next = updater(previous)
      persist('products', next)
      return next
    })
  }

  const orderLocks = useRef(new Set<string>())

  const handleAdvanceStatus = async (orderId: string, status: OrderStatus): Promise<boolean> => {
    const order = orders.find((item) => item.id === orderId)
    if (!order || !shift || order.status === 'cancelled') return false
    const at = new Date().toISOString()
    const previousStatus = order.status
    updateOrders((previous) =>
      previous.map((item) =>
        item.id !== orderId
          ? item
          : {
              ...item,
              status,
              readyAt: status === 'ready' ? at : item.readyAt,
              deliveredAt: status === 'delivered' ? at : item.deliveredAt,
              items: item.items.map((line) => ({
                ...line,
                status: status === 'preparing' ? 'preparing' : status === 'ready' ? 'ready' : status === 'delivered' ? 'delivered' : line.status,
                createdAt: line.createdAt || item.createdAt,
                startedAt: status === 'preparing' ? line.startedAt || at : line.startedAt,
                readyAt: status === 'ready' ? at : line.readyAt,
                deliveredAt: status === 'delivered' ? at : line.deliveredAt,
              })),
              updatedAt: at,
            }
      )
    )
    record({
      type: 'order_status_changed',
      orderId,
      tableId: tables.find((table) => table.activeOrderId === orderId)?.id,
      details: { from: previousStatus, to: status },
    })
    return true
  }

  const handleAddTableProduct = (
    orderId: string,
    input: { productId: string; quantity: number; note: string }
  ) => {
    if (!shift || submissionLock.current || !Number.isInteger(input.quantity) || input.quantity < 1)
      return
    const product = products.find((item) => item.id === input.productId)
    const current = orders.find((item) => item.id === orderId)
    if (!product || !product.isActive || !product.isVisible || product.availability !== 'available' || !current || current.paymentStatus === 'paid' || current.accountStatus === 'bill_requested') return
    submissionLock.current = true
    try {
      const at = new Date().toISOString()
      const line = {
        id: crypto.randomUUID(),
        productId: product.id,
        name: product.name,
        basePrice: product.price,
        quantity: input.quantity,
        lineTotal: product.price * input.quantity,
        modifiers: { extras: [], options: [], note: input.note },
        createdAt: at,
        productArea: product.preparationArea || 'Cocina',
        status: 'pending' as const,
      }
      updateOrders((previous) =>
        previous.map((order) =>
          order.id !== orderId
            ? order
            : {
                ...order,
                status: order.status === 'delivered' ? 'pending' : order.status,
                items: [...order.items, line],
                productSubtotal: (order.productSubtotal || order.total) + line.lineTotal,
                total: order.total + line.lineTotal,
                submittedBatches: (order.submittedBatches as Batch[] | undefined) || [],
              }
        )
      )
      record({
        type: 'product_added',
        orderId,
        tableId: tables.find((table) => table.activeOrderId === orderId)?.id,
        details: {
          productId: product.id,
          quantity: input.quantity,
          batch: ((current.submittedBatches as Batch[] | undefined)?.length || 0) + 1,
        },
      })
    } finally {
      submissionLock.current = false
    }
  }

  const handlePrintBatch = (orderId: string) => {
    const current = orders.find((item) => item.id === orderId)
    if (!current || orderLocks.current.has(orderId)) return
    orderLocks.current.add(orderId)
    const existing = (current.submittedBatches as Batch[] | undefined) || []
    const timestamp = new Date().toISOString()
    const locked = new Set(existing.flatMap((batch) => batch.itemIds))
    const lines = current.items.filter((item) => !locked.has(item.id))
    if (!lines.length) {
      orderLocks.current.delete(orderId)
      return
    }
    const at = new Date().toISOString()
    const batch: Batch = {
      id: crypto.randomUUID(),
      sequence: existing.length + 1,
      createdAt: timestamp,
      printedAt: at,
      itemIds: lines.map((item) => item.id),
    }
    const consumption = consumePrintedBatch(
      { ...current, submittedBatches: [...existing, batch] },
      batch.id,
      products,
      stockMovements,
      at
    )
    updateProducts(() => consumption.products)
    setStockMovements(consumption.movements)
    persist('stock-movements', consumption.movements)
    updateOrders((previous) =>
      previous.map((order) =>
        order.id === orderId ? { ...order, submittedBatches: [...existing, batch] } : order
      )
    )
    record({
      type: 'kitchen_ticket_printed',
      orderId,
      tableId: tables.find((table) => table.activeOrderId === orderId)?.id,
      details: {
        batch: batch.sequence,
        itemIds: batch.itemIds,
        items: lines.map((line) => ({
          quantity: line.quantity,
          name: line.name,
          note: line.modifiers.note,
          area: line.productArea,
        })),
      },
    })
    window.setTimeout(() => orderLocks.current.delete(orderId), 800)
  }

  const handleCreateProduct = (
    tableId: string,
    input: { name: string; categoryName: string; price: number; preparationArea: string },
    orderId?: string
  ) => {
    if (
      !shift ||
      submissionLock.current ||
      !input.name.trim() ||
      !Number.isFinite(input.price) ||
      input.price <= 0
    )
      return
    submissionLock.current = true
    try {
      const categoryId =
        RESTAURANT_CATEGORIES.find(
          (item) => item.name.toLowerCase() === input.categoryName.toLowerCase()
        )?.id || RESTAURANT_CATEGORIES[0].id
      const product: Product = {
        id: crypto.randomUUID(),
        categoryId,
        name: input.name.trim(),
        price: input.price,
        image: '',
        availability: 'available',
        sortOrder: products.length,
        isVisible: true,
        isActive: true,
        preparationArea: input.preparationArea as 'Cocina' | 'Barra' | 'Otro',
      }
      updateProducts((previous) => [...previous, product])
      record({
        type: 'product_created',
        tableId,
        orderId,
        details: {
          productId: product.id,
          name: product.name,
          categoryName: input.categoryName,
          price: input.price,
          area: input.preparationArea,
        },
      })
      if (orderId) {
        const at = new Date().toISOString()
        const line = {
          id: crypto.randomUUID(),
          productId: product.id,
          name: product.name,
          basePrice: product.price,
          quantity: 1,
          lineTotal: product.price,
          modifiers: { extras: [], options: [], note: '' },
          createdAt: at,
          productArea: product.preparationArea,
          status: 'pending' as const,
        }
        updateOrders((previous) =>
          previous.map((order) =>
            order.id !== orderId
              ? order
              : {
                  ...order,
                  items: [...order.items, line],
                  productSubtotal: (order.productSubtotal || order.total) + line.lineTotal,
                  total: order.total + line.lineTotal,
                  submittedBatches: order.submittedBatches || [],
                }
          )
        )
        record({ type: 'product_added', tableId, orderId, details: { productId: product.id, quantity: 1 } })
      } else {
        const table = tables.find((item) => item.id === tableId)
        if (table) createOrderForTable(table, product)
      }
    } finally {
      submissionLock.current = false
    }
  }

  const createOrderForTable = (table: RestaurantTable, firstProduct?: Product) => {
    if (!shift || table.active === false || table.archivedAt || table.activeOrderId || table.status === 'bill_requested' || table.status === 'reserved') return
    const seq = Math.max(0, ...orders.map((order) => order.sequence || 0)) + 1
    const at = new Date().toISOString()
    const lines = firstProduct
      ? [
          {
            id: crypto.randomUUID(),
            productId: firstProduct.id,
            name: firstProduct.name,
            basePrice: firstProduct.price,
            quantity: 1,
            lineTotal: firstProduct.price,
            modifiers: { extras: [], options: [], note: '' },
            createdAt: at,
            productArea: firstProduct.preparationArea || 'Cocina',
            status: 'pending' as const,
          },
        ]
      : []
    const total = lines.reduce((sum, line) => sum + line.lineTotal, 0)
    const created: Order = {
      id: crypto.randomUUID(),
      sequence: seq,
      displayNumber: String(seq).padStart(3, '0'),
      createdAt: at,
      status: 'pending',
      orderSource: 'local',
      fulfillmentType: 'table',
      tableId: table.id,
      tableInfo: table.name,
      customerName: (table as RestaurantTable & { customerName?: string }).customerName || '',
      total,
      productSubtotal: total,
      paymentStatus: 'pending',
      paymentMethod: null,
      expectedPaymentMethod: null,
      payment: { method: 'cash', cashAmount: 0, qrAmount: 0, cashReceived: 0, change: 0 },
      items: lines,
      createdBy: cashierName,
      shiftId: shift.id,
      openedBy: cashierName,
      openedAt: table.openedAt || at,
      submittedBatches: [],
    }
    updateOrders((previous) => [created, ...previous])
    updateTables((previous) =>
      previous.map((item) =>
        item.id === table.id
          ? {
              ...item,
              status: 'occupied',
              activeOrderId: created.id,
              openedAt: at,
              openedBy: cashierName,
              diners: item.diners || 2,
            }
          : item
      )
    )
    record({ type: 'table_opened', tableId: table.id, orderId: created.id })
    if (lines.length)
      record({
        type: 'product_added',
        tableId: table.id,
        orderId: created.id,
        details: { productId: firstProduct?.id, quantity: 1 },
      })
  }

  const handleCancelOrder = async (orderId: string): Promise<boolean> => {
    if (orderLocks.current.has(orderId)) return false
    const result = cancelRestaurantOrder(orders, tables, orderId, new Date().toISOString(), cashierName)
    if (!result) return false
    orderLocks.current.add(orderId)
    updateOrders(() => result.orders)
    updateTables(() => result.tables)
    record({ type: 'order_cancelled', orderId, tableId: resolveOrderTable(orders.find(item => item.id === orderId)!, tables)?.id })
    window.setTimeout(() => orderLocks.current.delete(orderId), 800)
    return true
  }

  const handleAdvanceItemStatus = async (orderId: string, itemId: string, status: 'preparing' | 'ready' | 'delivered'): Promise<boolean> => {
    const order = orders.find(item => item.id === orderId)
    if (!shift || !order || order.status === 'cancelled' || !order.items.some(item => item.id === itemId)) return false
    const at = new Date().toISOString()
    updateOrders(previous => previous.map(item => {
      if (item.id !== orderId) return item
      const lines = item.items.map(line => line.id === itemId ? { ...line, status, startedAt: status === 'preparing' ? line.startedAt || at : line.startedAt, readyAt: status === 'ready' ? line.readyAt || at : line.readyAt, deliveredAt: status === 'delivered' ? line.deliveredAt || at : line.deliveredAt } : line)
      const allDelivered = lines.every(line => line.status === 'delivered')
      const allReady = lines.every(line => line.status === 'ready' || line.status === 'delivered')
      const preparing = lines.some(line => line.status === 'preparing')
      return { ...item, items: lines, status: allDelivered ? 'delivered' as const : allReady ? 'ready' as const : preparing ? 'preparing' as const : 'pending' as const, readyAt: allReady ? item.readyAt || at : item.readyAt, deliveredAt: allDelivered ? item.deliveredAt || at : item.deliveredAt }
    }))
    record({ type: 'item_status_changed', orderId, tableId: order.tableId, details: { itemId, status } })
    return true
  }

  const handleAddOrder = (order: Order): boolean => {
    if (!shift || submissionLock.current) return false
    submissionLock.current = true
    try {
      const timestamp = new Date().toISOString()
      const ticketItems = (order.items || []).map((item) => ({
        ...item,
        createdAt: item.createdAt || timestamp,
        productArea:
          products.find((product) => product.id === item.productId)?.preparationArea || 'Cocina',
        status: 'pending' as const,
      }))
      const candidate: Order = {
        ...order,
        shiftId: shift.id,
        createdBy: cashierName,
        status: 'pending' as const,
        paymentStatus: order.fulfillmentType === 'table' ? 'pending' as const : order.paymentStatus,
        paymentMethod: order.fulfillmentType === 'table' ? null : order.paymentMethod,
        items: ticketItems,
        createdAt: timestamp,
        paidAt: order.fulfillmentType !== 'table' && order.paymentStatus === 'paid' ? timestamp : undefined,
        paidBy: order.fulfillmentType !== 'table' && order.paymentStatus === 'paid' ? cashierName : undefined,
        submittedBatches: [],
      }
      const placed = placeRestaurantOrder(orders, tables, candidate)
      updateOrders(() => placed.orders)
      updateTables(() => placed.tables)
      record({
        type: placed.added ? 'product_added' : 'order_created',
        orderId: placed.order.id,
        tableId: placed.order.tableId,
        details: { total: placed.order.total, itemIds: ticketItems.map(item => item.id) },
      })
      return true
    } catch (error) {
      window.alert(error instanceof Error ? error.message : 'No se pudo crear el pedido.')
      return false
    } finally {
      submissionLock.current = false
    }
  }

  const handleRequestBill = (tableId: string) => {
    const table = tables.find((item) => item.id === tableId)
    if (!shift || !table?.activeOrderId) return
    updateTables((previous) =>
      previous.map((item) => (item.id === tableId ? { ...item, status: 'bill_requested' } : item))
    )
    updateOrders(previous => previous.map(order => order.id === table.activeOrderId ? { ...order, accountStatus: 'bill_requested' } : order))
    record({ type: 'bill_requested', orderId: table.activeOrderId, tableId })
  }

  const handleReopenBill = (tableId: string) => {
    const table = tables.find((item) => item.id === tableId)
    if (!shift || !table?.activeOrderId) return
    updateTables((previous) =>
      previous.map((item) => (item.id === tableId ? { ...item, status: 'occupied' } : item))
    )
    updateOrders(previous => previous.map(order => order.id === table.activeOrderId ? { ...order, accountStatus: 'open' } : order))
    record({ type: 'bill_reopened', orderId: table.activeOrderId, tableId })
  }

  const handlePayment = (
    orderId: string,
    input: { method: 'cash' | 'qr' | 'card' | 'mixed'; received: number; cashAmount?: number; qrAmount?: number; cardAmount?: number }
  ) => {
    const order = orders.find((item) => item.id === orderId)
    const table = order ? resolveOrderTable(order, tables) : undefined
    if (
      !shift ||
      !order ||
      orderLocks.current.has(orderId) ||
      order.paymentStatus === 'paid' ||
      order.status === 'cancelled'
    )
      return
    orderLocks.current.add(orderId)
    let completed = false
    try {
      const paid = completeRestaurantPayment(orders, tables, orderId, input, cashierName, new Date().toISOString())
      updateOrders(() => paid.orders)
      updateTables(() => paid.tables)
      record({ type: 'payment_confirmed', orderId, tableId: table?.id, details: { total: order.total, method: input.method, received: input.received, change: paid.order.payment.change } })
      completed = true
    } catch (error) {
      window.alert(error instanceof Error ? error.message : 'No se pudo confirmar el pago.')
    } finally {
      if (completed) window.setTimeout(() => orderLocks.current.delete(orderId), 800)
      else orderLocks.current.delete(orderId)
    }
  }

  const startShift = (openingFloat: number, openedAt: string, openedBy: string) => {
    if (shift || !Number.isFinite(openingFloat) || openingFloat < 0) return
    const next = {
      id: crypto.randomUUID(),
      openedAt,
      openedBy,
      openingFloat,
      status: 'open' as const,
      reconciliation: { expenses: 0 },
    }
    setShift(next)
    persist('shift', next)
    setCashierName(openedBy)
    record({ type: 'shift_opened', details: { openingFloat } })
    if (seededRef.current) {
      updateOrders(() => [])
      updateTables(previous => previous.map(table => ({ ...table, status: 'available', activeOrderId: undefined, openedAt: undefined, openedBy: undefined, diners: undefined })))
      seededRef.current = false
      persist('seeded', false)
    }
  }

  const closeShift = (countedCash?: number) => {
    if (!shift || countedCash === undefined || !Number.isFinite(countedCash) || countedCash < 0 || tables.some((table) => table.activeOrderId && table.status !== 'available'))
      return false
    const sales = orders.filter((order) => order.shiftId === shift.id && order.paymentStatus === 'paid')
    const movements = readSaved<CashMovement[]>('pachax:restaurant-demo:cash-movements:v1', [])
    const summary = calculateCashShiftSummary(shift.openingFloat, sales, shift.id, movements)
    const closed = {
      ...shift,
      closedAt: new Date().toISOString(),
      closedBy: cashierName,
      expectedCashAtClose: summary.expectedCash,
      reconciliation: {
        ...shift.reconciliation,
        countedCash,
        difference: Math.round((countedCash - summary.expectedCash) * 100) / 100,
        expenses: summary.totalExpenses,
      },
    }
    setShift(null)
    persist('shift-history', [...readSaved<Shift[]>(`${STORAGE_KEY}:shift-history`, []), closed])
    persist('shift', null)
    record({
      type: 'shift_closed',
      details: {
        total: sales.reduce((sum, order) => sum + order.total, 0),
        expectedCash: closed.expectedCashAtClose,
      },
    })
    return true
  }

  const handleUpdateTableStatus = (tableId: string, status: RestaurantTable['status']) => {
    const table = tables.find((item) => item.id === tableId)
    if (!shift || !table || table.active === false || table.archivedAt || (status === 'available' && table.activeOrderId)) return
    updateTables((previous) =>
      previous.map((item) =>
        item.id === tableId
          ? {
              ...item,
              status,
              ...(status === 'occupied' && !item.openedAt
                ? { openedAt: new Date().toISOString(), openedBy: cashierName }
                : {}),
            }
          : item
      )
    )
    record({ type: 'table_status_changed', tableId, details: { status } })
  }

  const session: RestaurantSession = {
    tenantId: 'demo-restaurant',
    restaurantName: companyName || 'Bistró Demo',
    uid: 'demo-cashier-uid',
    userName: cashierName,
    role: mode === 'team' ? 'team' : simulatedRole || 'admin',
  }

  return (
    <RestaurantExperience
      session={session}
      logoUrl={logoUrl}
      companyName={companyName}
      orders={orders}
      tables={tables}
      sectors={sectors}
      products={products}
      shift={shift}
      categories={RESTAURANT_CATEGORIES}
      quickExtras={RESTAURANT_EXTRAS}
      onStartShift={startShift}
      onCloseShift={closeShift}
      onAddOrder={handleAddOrder}
      onAdvanceStatus={handleAdvanceStatus}
      onAdvanceItemStatus={handleAdvanceItemStatus}
      onCancelOrder={handleCancelOrder}
      onPayment={handlePayment}
      onOpenTableOrder={(table) => {
        if (!table.activeOrderId && shift) createOrderForTable(table)
      }}
      onUpdateTableStatus={handleUpdateTableStatus}
      onRequestBill={handleRequestBill}
      onReopenBill={handleReopenBill}
      onAddProduct={handleAddTableProduct}
      onPrintBatch={handlePrintBatch}
      onCreateProduct={handleCreateProduct}
      onFloorAction={handleFloorAction}
      onSaveProducts={(next) => updateProducts(() => next)}
      onResetDemo={() => {
        if (!window.confirm('¿Restablecer todos los datos locales de la demo Restaurante?')) return
        for (const key of Object.keys(localStorage)) if (key.startsWith('pachax:restaurant-demo:')) localStorage.removeItem(key)
        localStorage.removeItem('cocina-tickets-impresos')
        window.location.reload()
      }}
      onSelectRole={onSelectRole}
      onSignOut={() => {}}
    />
  )
}
