import type { DemoDatasetMode, RestaurantDataset } from '../types'
import {
  RESTAURANT_CATEGORIES,
  RESTAURANT_PRODUCTS,
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
  const baseTables: RestaurantTable[] = [
    { id: 't1', number: 1, name: 'Mesa 1', capacity: 2, status: 'available' },
    { id: 't2', number: 2, name: 'Mesa 2', capacity: 4, status: 'available' },
    { id: 't3', number: 3, name: 'Mesa 3', capacity: 4, status: 'available' },
    { id: 't4', number: 4, name: 'Mesa 4', capacity: 6, status: 'available' },
  ]

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
  const fullProducts: Product[] = RESTAURANT_PRODUCTS.map((p) => ({
    ...p,
    image: FOOD_IMAGES[p.id] || p.image || '',
  }))

  const fullTables: RestaurantTable[] = INITIAL_TABLES.map((t) => ({ ...t }))

  const fullOrders: Order[] = INITIAL_RESTAURANT_ORDERS.map((o) => ({
    ...o,
    items: o.items.map((it) => ({
      ...it,
      modifiers: {
        extras: [...it.modifiers.extras],
        options: [...it.modifiers.options],
        note: it.modifiers.note,
      },
    })),
  }))

  const openedAt = new Date(Date.now() - 4 * 3600000).toISOString()
  const fullShift = {
    id: 'shift-demo-01',
    openedAt,
    openedBy: 'Cajero Bistró Demo',
    openingFloat: 200,
    expectedCashAtClose: 452,
    reconciliation: {
      countedCash: 452,
      difference: 0,
      expenses: 0,
    },
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
