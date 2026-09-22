import { useState, useRef } from 'react'
import {
  RESTAURANT_CATEGORIES,
  RESTAURANT_PRODUCTS,
  RESTAURANT_EXTRAS,
  INITIAL_TABLES,
  INITIAL_RESTAURANT_ORDERS,
  type RestaurantTable,
} from '../mocks/restaurantMock'
import type { Order, OrderStatus, Product } from '../../types'
import {
  RestaurantExperience,
  type RestaurantSession,
  type RestaurantShift,
} from '../../modules/restaurant/views/RestaurantExperience'

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

const STORAGE_KEY = 'pachax:restaurant-demo:operations:v1'

function readSaved<T>(key: string, fallback: T): T {
  try {
    const value = localStorage.getItem(key)
    return value ? (JSON.parse(value) as T) : fallback
  } catch {
    return fallback
  }
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
        (order.tableInfo === table.name &&
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
}: {
  mode?: 'team' | 'simulated_role'
  simulatedRole?: string
  onSelectRole?: (roleId: string) => void
  logoUrl?: string
  companyName?: string
}) {
  const [savedOrders, setSavedOrders] = useState<Order[]>(() =>
    readSaved(`${STORAGE_KEY}:orders`, INITIAL_RESTAURANT_ORDERS)
  )
  const [orders, setOrders] = useState<Order[]>(() =>
    savedOrders.length ? savedOrders : INITIAL_RESTAURANT_ORDERS
  )
  const [tables, setTables] = useState<RestaurantTable[]>(() =>
    readSaved(`${STORAGE_KEY}:tables`, INITIAL_TABLES)
  )
  const [products, setProducts] = useState<Product[]>(() =>
    readSaved(`${STORAGE_KEY}:products`, RESTAURANT_PRODUCTS)
  )
  const [shift, setShift] = useState<Shift | null>(() =>
    readSaved<Shift | null>(`${STORAGE_KEY}:shift`, null)
  )
  const [audit, setAudit] = useState<AuditEvent[]>(() => readSaved(`${STORAGE_KEY}:audit`, []))
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

  const [legacyTablesMigrated, setLegacyTablesMigrated] = useState(false)
  if (!legacyTablesMigrated) {
    setLegacyTablesMigrated(true)
    const hasSavedTables = localStorage.getItem(`${STORAGE_KEY}:tables`)
    const hasSavedOrders = localStorage.getItem(`${STORAGE_KEY}:orders`)
    if (hasSavedTables && !hasSavedOrders) {
      const reconciled = normalizeLegacyTables(tables, orders)
      if (JSON.stringify(reconciled) !== JSON.stringify(tables)) {
        setTables(reconciled)
        persist('tables', reconciled)
      }
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
    if (!order || !shift || order.paymentStatus === 'paid') return false
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
    if (!product || !current || current.paymentStatus === 'paid') return
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
    const savedBatch: Batch = {
      id: crypto.randomUUID(),
      sequence: existing.length + 1,
      createdAt: timestamp,
      itemIds: [],
    }
    updateOrders((previous) =>
      previous.map((order) =>
        order.id === orderId ? { ...order, submittedBatches: [...existing, savedBatch] } : order
      )
    )
    const locked = new Set(existing.flatMap((batch) => batch.itemIds))
    const lines = current.items.filter((item) => !locked.has(item.id))
    if (!lines.length) {
      orderLocks.current.delete(orderId)
      window.print()
      return
    }
    const at = new Date().toISOString()
    const batch: Batch = {
      id: savedBatch.id,
      sequence: savedBatch.sequence,
      createdAt: savedBatch.createdAt,
      printedAt: at,
      itemIds: lines.map((item) => item.id),
    }
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
    if (!shift || submissionLock.current) return
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
    if (!orders.some((item) => item.id === orderId && item.paymentStatus !== 'paid')) return false
    updateOrders((previous) =>
      previous.map((item) =>
        item.id === orderId
          ? {
              ...item,
              status: 'cancelled',
              cancelledAt: new Date().toISOString(),
              cancelledBy: cashierName,
            }
          : item
      )
    )
    record({ type: 'order_cancelled', orderId })
    return true
  }

  const handleAddOrder = (order: Order) => {
    if (!shift || submissionLock.current) return
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
      const table = tables.find((item) => item.name === order.tableInfo)
      const placed = {
        ...order,
        shiftId: shift.id,
        createdBy: cashierName,
        status: 'pending' as const,
        paymentStatus: 'pending' as const,
        items: ticketItems,
        createdAt: timestamp,
        submittedBatches: [
          {
            id: crypto.randomUUID(),
            sequence: 1,
            createdAt: timestamp,
            printedAt: timestamp,
            itemIds: ticketItems.map((item) => item.id),
          },
        ],
      }
      updateOrders((previous) => [placed, ...previous.filter((item) => item.id !== order.id)])
      if (table)
        updateTables((previous) =>
          previous.map((item) =>
            item.id === table.id
              ? {
                  ...item,
                  status: 'occupied',
                  activeOrderId: placed.id,
                  openedAt: item.openedAt || timestamp,
                  openedBy: item.openedBy || cashierName,
                  diners: item.diners || 2,
                }
              : item
          )
        )
      record({
        type: 'order_created',
        orderId: placed.id,
        tableId: table?.id,
        details: { total: placed.total, batch: 1 },
      })
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
    record({ type: 'bill_requested', orderId: table.activeOrderId, tableId })
  }

  const handleReopenBill = (tableId: string) => {
    const table = tables.find((item) => item.id === tableId)
    if (!shift || !table?.activeOrderId) return
    updateTables((previous) =>
      previous.map((item) => (item.id === tableId ? { ...item, status: 'occupied' } : item))
    )
    record({ type: 'bill_reopened', orderId: table.activeOrderId, tableId })
  }

  const handlePayment = (
    orderId: string,
    input: { method: 'cash' | 'qr' | 'card' | 'other'; received: number }
  ) => {
    const order = orders.find((item) => item.id === orderId)
    const table = tables.find((item) => item.activeOrderId === orderId)
    if (
      !shift ||
      !order ||
      orderLocks.current.has(orderId) ||
      order.paymentStatus === 'paid' ||
      (input.method === 'cash' && input.received < order.total)
    )
      return
    orderLocks.current.add(orderId)
    const timestamp = new Date().toISOString()
    const paidOrder: Order = {
      ...order,
      status: 'delivered',
      paymentStatus: 'paid',
      paymentMethod: input.method === 'qr' ? 'qr' : 'cash',
      payment: {
        method: input.method === 'qr' ? 'qr' : 'cash',
        cashAmount: input.method === 'cash' ? order.total : 0,
        qrAmount: input.method === 'qr' ? order.total : 0,
        cashReceived: input.received,
        change: input.method === 'cash' ? input.received - order.total : 0,
      },
      paidAt: timestamp,
      paidBy: cashierName,
      closedAt: timestamp,
      accountStatus: 'closed',
    }
    updateOrders((previous) => previous.map((item) => (item.id === orderId ? paidOrder : item)))
    if (table)
      updateTables((previous) =>
        previous.map((item) =>
          item.id === table.id
            ? {
                ...item,
                status: 'available',
                activeOrderId: undefined,
                diners: undefined,
                openedAt: undefined,
                openedBy: undefined,
              }
            : item
        )
      )
    record({
      type: 'payment_confirmed',
      orderId,
      tableId: table?.id,
      details: {
        total: order.total,
        method: input.method,
        received: input.received,
        change: paidOrder.payment.change,
      },
    })
    orderLocks.current.delete(orderId)
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
    if (savedOrders === INITIAL_RESTAURANT_ORDERS) {
      updateOrders(() => [])
      setSavedOrders([])
    }
  }

  const closeShift = () => {
    if (!shift || tables.some((table) => table.activeOrderId && table.status !== 'available'))
      return false
    const sales = orders.filter((order) => order.shiftId === shift.id && order.paymentStatus === 'paid')
    const cash = sales.reduce((sum, order) => sum + (order.payment?.cashAmount || 0), 0)
    const closed = {
      ...shift,
      closedAt: new Date().toISOString(),
      closedBy: cashierName,
      expectedCashAtClose: shift.openingFloat + cash,
      reconciliation: {
        ...shift.reconciliation,
        countedCash: undefined,
        difference: undefined,
        expenses: shift.reconciliation?.expenses ?? 0,
      },
    }
    setShift(null)
    setSavedOrders(orders)
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
    if (!shift || (status === 'available' && table?.activeOrderId)) return
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
      products={products}
      shift={shift}
      categories={RESTAURANT_CATEGORIES}
      quickExtras={RESTAURANT_EXTRAS}
      onStartShift={startShift}
      onCloseShift={closeShift}
      onAddOrder={handleAddOrder}
      onAdvanceStatus={handleAdvanceStatus}
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
      onToggleProductActive={(id) =>
        updateProducts((previous) =>
          previous.map((product) =>
            product.id === id ? { ...product, isActive: product.isActive === false } : product
          )
        )
      }
      onSelectRole={onSelectRole}
      onSignOut={() => {}}
    />
  )
}
