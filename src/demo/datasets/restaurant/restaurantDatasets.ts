import type { DemoDatasetMode, RestaurantDataset } from '../types'
import {
  RESTAURANT_CATEGORIES,
  RESTAURANT_PRODUCTS,
  RESTAURANT_INVENTORY_PRODUCTS,
  RESTAURANT_EXTRAS,
  INITIAL_TABLES,
  INITIAL_RESTAURANT_ORDERS,
  type RestaurantTable,
} from '../../mocks/restaurantMock'
import type { Order, Product } from '../../../types'

// Curated high-resolution food images for full business demo
const FOOD_IMAGES: Record<string, string> = {
  'prod-1': 'https://images.unsplash.com/photo-1544025162-d76694265947?w=500&auto=format&fit=crop&q=80', // Lomo fino
  'prod-2': 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=500&auto=format&fit=crop&q=80', // Hamburguesa artesanal
  'prod-3': 'https://images.unsplash.com/photo-1572695157366-5e585ab2b69f?w=500&auto=format&fit=crop&q=80', // Bruschetta
  'prod-4': 'https://images.unsplash.com/photo-1513558161293-cdaf765ed2fd?w=500&auto=format&fit=crop&q=80', // Limonada
  'prod-5': 'https://images.unsplash.com/photo-1510812431401-41d2bd2722f3?w=500&auto=format&fit=crop&q=80', // Vino tinto
  'prod-6': 'https://images.unsplash.com/photo-1571877227200-a0d98ea607e9?w=500&auto=format&fit=crop&q=80', // Tiramisú
}

/**
 * Minimum viable tenant state for a freshly created restaurant:
 * - Base tables available in main salon (ready for service)
 * - Empty catalogue (ready for onboarding / product creation)
 * - 0 historic orders
 * - Shift closed (ready for cashier opening)
 */
export function createEmptyRestaurantDataset(): RestaurantDataset {
  const baseTables: RestaurantTable[] = INITIAL_TABLES.map((table) => ({
    ...table, status: 'available', activeOrderId: undefined, openedAt: undefined,
    openedBy: undefined, diners: undefined,
  }))

  return {
    tables: baseTables,
    products: [],
    orders: [],
    shift: null,
    categories: RESTAURANT_CATEGORIES.map((c) => ({ id: c.id, name: c.name })),
    quickExtras: [],
  }
}

/**
 * Rich, fully populated operational dataset of an ongoing restaurant.
 * Always returns deep clones to guarantee immutable factories.
 */
export function createFullRestaurantDataset(): RestaurantDataset {
  const fullProducts: Product[] = [...RESTAURANT_PRODUCTS, ...RESTAURANT_INVENTORY_PRODUCTS].map((p) => ({
    ...p,
    recipe: p.recipe?.map((line) => ({ ...line })),
    image: FOOD_IMAGES[p.id] || p.image || '',
  }))

  const fullTables: RestaurantTable[] = INITIAL_TABLES.map((t) => ({ ...t }))

  const fullOrders: Order[] = INITIAL_RESTAURANT_ORDERS.map((o) => ({
    ...o,
    total: o.items.reduce((sum, item) => sum + item.lineTotal, 0),
    productSubtotal: o.items.reduce((sum, item) => sum + item.lineTotal, 0),
    payment: o.payment ? {
      ...o.payment,
      cashAmount: o.payment.method === 'cash' ? o.items.reduce((sum, item) => sum + item.lineTotal, 0) : o.payment.cashAmount,
      cashReceived: o.payment.method === 'cash' ? o.items.reduce((sum, item) => sum + item.lineTotal, 0) : o.payment.cashReceived,
    } : o.payment,
    tableId: o.tableId,
    submittedBatches: [{ id: `batch-${o.id}`, sequence: 1, createdAt: o.createdAt, itemIds: o.items.map((item) => item.id) }],
    items: o.items.map((it) => ({
      ...it,
      productArea: fullProducts.find((product) => product.id === it.productId)?.preparationArea || 'Cocina',
      status: o.status === 'ready' ? 'ready' : o.status === 'preparing' ? 'preparing' : 'pending',
      modifiers: {
        extras: [...it.modifiers.extras],
        options: [...it.modifiers.options],
        note: it.modifiers.note,
      },
    })),
  }))

  const paidAt = new Date(Date.now() - 75 * 60000).toISOString()
  fullOrders.push({
    id: 'ord-105', sequence: 39, displayNumber: '039', status: 'delivered',
    orderSource: 'local', fulfillmentType: 'pickup', customerName: 'Carlos Mendizábal',
    total: 58, productSubtotal: 58, paymentStatus: 'paid', paymentMethod: 'cash', expectedPaymentMethod: 'cash',
    payment: { method: 'cash', cashAmount: 58, qrAmount: 0, cashReceived: 58, change: 0 },
    items: [{ id: 'l10', productId: 'prod-1', name: 'Lomo a la Pimienta', basePrice: 58, quantity: 1, lineTotal: 58, modifiers: { extras: [], options: [], note: '' }, status: 'delivered', productArea: 'Cocina' }],
    createdAt: paidAt, paidAt, closedAt: paidAt, createdBy: 'Mesero Ana', paidBy: 'Cajero Bistró Demo',
    shiftId: 'shift-demo-01', accountStatus: 'closed',
  })

  const openedAt = new Date(Date.now() - 4 * 3600000).toISOString()
  const fullShift = {
    id: 'shift-demo-01',
    openedAt,
    openedBy: 'Cajero Bistró Demo',
    openingFloat: 200,
    status: 'open' as const,
    reconciliation: { expenses: 0 },
  }

  return {
    tables: fullTables,
    products: fullProducts,
    orders: fullOrders,
    shift: fullShift,
    categories: RESTAURANT_CATEGORIES.map((c) => ({ id: c.id, name: c.name })),
    quickExtras: RESTAURANT_EXTRAS.map((e) => ({ ...e })),
  }
}

export function createRestaurantDataset(mode: DemoDatasetMode = 'full'): RestaurantDataset {
  return mode === 'empty' ? createEmptyRestaurantDataset() : createFullRestaurantDataset()
}
