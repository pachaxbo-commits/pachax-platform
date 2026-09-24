import type { CatalogCategory, Order, OrderItem, Product } from '../../../types'
import type { RestaurantTable } from '../../../demo/mocks/restaurantMock'
import { settlePayments } from './restaurantEngine.ts'

const active = (order: Order) => order.paymentStatus !== 'paid' && order.status !== 'cancelled'

export function resolveOrderTable(order: Order, tables: RestaurantTable[]): RestaurantTable | undefined {
  if (order.tableId) return tables.find(table => table.id === order.tableId)
  if (order.fulfillmentType !== 'table' || !order.tableInfo) return undefined
  const name = order.tableInfo.trim().toLocaleLowerCase('es-BO')
  const exact = tables.find(table => table.name.toLocaleLowerCase('es-BO') === name)
  if (exact) return exact
  const number = name.match(/^(?:mesa\s*)?(\d+)$/)?.[1]
  return number ? tables.find(table => table.number === Number(number)) : undefined
}

export function reconcileTableOrders(orders: Order[], tables: RestaurantTable[]) {
  const normalizedOrders = orders.map(order => {
    const table = resolveOrderTable(order, tables)
    return table && order.tableId !== table.id ? { ...order, tableId: table.id, tableInfo: table.name } : order
  })
  const normalizedTables = tables.map(table => {
    const linked = normalizedOrders.find(order => order.id === table.activeOrderId && active(order))
      || normalizedOrders.find(order => order.tableId === table.id && active(order))
    if (linked) return { ...table, activeOrderId: linked.id, status: table.status === 'bill_requested' ? 'bill_requested' as const : 'occupied' as const }
    if (table.activeOrderId) return { ...table, activeOrderId: undefined, status: 'available' as const, openedAt: undefined, openedBy: undefined, diners: undefined }
    return table
  })
  return { orders: normalizedOrders, tables: normalizedTables }
}

export function placeRestaurantOrder(orders: Order[], tables: RestaurantTable[], incoming: Order) {
  const table = incoming.fulfillmentType === 'table' ? resolveOrderTable(incoming, tables) : undefined
  if (incoming.fulfillmentType === 'table' && !table) throw new Error('Selecciona una mesa válida.')
  if (table && (table.active === false || table.archivedAt)) throw new Error('Esta mesa está desactivada.')
  if (table?.status === 'bill_requested') throw new Error('Reabre la cuenta antes de añadir productos.')
  if (table?.status === 'reserved' && !table.activeOrderId) throw new Error('La mesa está reservada.')
  const current = table?.activeOrderId ? orders.find(order => order.id === table.activeOrderId && active(order)) : undefined
  if (table?.activeOrderId && !current) throw new Error('La mesa necesita reconciliación antes de vender.')
  if (current) {
    const lineIds = new Set(current.items.map(line => line.id))
    const added = incoming.items.filter(line => !lineIds.has(line.id))
    if (!added.length) throw new Error('No hay productos nuevos.')
    const subtotal = added.reduce((sum, line) => sum + line.lineTotal, 0)
    const updated: Order = { ...current, items: [...current.items, ...added], total: current.total + subtotal, productSubtotal: (current.productSubtotal ?? current.total) + subtotal, status: 'pending' }
    return { orders: orders.map(order => order.id === current.id ? updated : order), tables, order: updated, added: true }
  }
  const placed: Order = table ? { ...incoming, tableId: table.id, tableInfo: table.name, accountStatus: 'open' } : incoming
  return {
    orders: [placed, ...orders],
    tables: table ? tables.map(item => item.id === table.id ? { ...item, status: 'occupied' as const, activeOrderId: placed.id, openedAt: item.openedAt || placed.createdAt, openedBy: item.openedBy || placed.createdBy } : item) : tables,
    order: placed,
    added: false,
  }
}

export function cancelRestaurantOrder(orders: Order[], tables: RestaurantTable[], orderId: string, at: string, actor: string) {
  const order = orders.find(item => item.id === orderId)
  if (!order || !active(order)) return null
  const table = resolveOrderTable(order, tables)
  return {
    orders: orders.map(item => item.id === orderId ? { ...item, status: 'cancelled' as const, cancelledAt: at, cancelledBy: actor, accountStatus: 'closed' as const } : item),
    tables: tables.map(item => item.id === table?.id && item.activeOrderId === orderId ? { ...item, status: 'available' as const, activeOrderId: undefined, openedAt: undefined, openedBy: undefined, diners: undefined } : item),
  }
}

export function releasePaidTable(tables: RestaurantTable[], order: Order) {
  const table = resolveOrderTable(order, tables)
  return tables.map(item => item.id === table?.id && item.activeOrderId === order.id ? { ...item, status: 'available' as const, activeOrderId: undefined, openedAt: undefined, openedBy: undefined, diners: undefined } : item)
}

export function completeRestaurantPayment(orders: Order[], tables: RestaurantTable[], orderId: string, input: { method: 'cash' | 'qr' | 'card' | 'mixed'; received: number; cashAmount?: number; qrAmount?: number; cardAmount?: number }, actor: string, at: string) {
  const order = orders.find(item => item.id === orderId)
  if (!order || order.paymentStatus === 'paid' || order.status === 'cancelled') throw new Error('La cuenta no está disponible para cobrar.')
  const drafts = input.method === 'mixed'
    ? ([{ method: 'cash' as const, amount: input.cashAmount || 0, received: input.received }, { method: 'qr' as const, amount: input.qrAmount || 0 }, { method: 'card' as const, amount: input.cardAmount || 0 }].filter(item => item.amount > 0))
    : [{ method: input.method, amount: order.total, received: input.method === 'cash' ? input.received : undefined }]
  const payments = settlePayments(order.total, drafts, actor, at)
  const cashAmount = payments.filter(item => item.method === 'cash').reduce((sum, item) => sum + item.amount, 0)
  const qrAmount = payments.filter(item => item.method === 'qr').reduce((sum, item) => sum + item.amount, 0)
  const cardAmount = payments.filter(item => item.method === 'card').reduce((sum, item) => sum + item.amount, 0)
  const received = payments.filter(item => item.method === 'cash').reduce((sum, item) => sum + (item.received || 0), 0)
  const change = payments.reduce((sum, item) => sum + (item.change || 0), 0)
  const paid: Order = { ...order, paymentStatus: 'paid', paymentMethod: input.method, payment: { method: input.method, cashAmount, qrAmount, cardAmount, cashReceived: received, change }, payments, paidAt: at, paidBy: actor, closedAt: at, accountStatus: 'closed' }
  return { orders: orders.map(item => item.id === orderId ? paid : item), tables: releasePaidTable(tables, order), order: paid }
}

export function selectRestaurantProducts(products: Product[], categories: CatalogCategory[], selectedCategoryId: string): Product[] {
  const visibleCategoryIds = new Set(categories.filter(category => category.isActive && category.isVisible).map(category => category.id))
  return products.filter(product => product.restaurantType !== 'ingredient' && product.isActive && product.isVisible && product.availability === 'available' && (selectedCategoryId === 'all' || product.categoryId === selectedCategoryId) && (categories.length === 0 || visibleCategoryIds.has(product.categoryId))).sort((a, b) => a.sortOrder - b.sortOrder)
}

export function makeRestaurantOrderItem(product: Product, item: Pick<OrderItem, 'id' | 'quantity' | 'modifiers'>, at: string): OrderItem {
  const extrasTotal = item.modifiers.extras.reduce((sum, extra) => sum + extra.price, 0)
  return { ...item, productId: product.id, name: product.name, basePrice: product.price, lineTotal: (product.price + extrasTotal) * item.quantity, createdAt: at, productArea: product.preparationArea || (product.restaurantType === 'beverage' ? 'Barra' : 'Cocina'), status: 'pending' }
}
