/* eslint-disable @typescript-eslint/ban-ts-comment -- Node test types are intentionally absent from the browser TypeScript configuration. */
// @ts-nocheck Node runs this domain test with its own types, outside the browser runtime.
import assert from 'node:assert/strict'
import test from 'node:test'
import { cancelRestaurantOrder, completeRestaurantPayment, placeRestaurantOrder, reconcileTableOrders, selectRestaurantProducts } from '../restaurantOperations.ts'
import { consumePrintedBatch } from '../restaurantEngine.ts'
import { INITIAL_RESTAURANT_ORDERS, INITIAL_TABLES, RESTAURANT_CATEGORIES, RESTAURANT_INVENTORY_PRODUCTS, RESTAURANT_PRODUCTS } from '../../../../demo/mocks/restaurantMock.ts'

const at = '2026-09-23T13:42:00Z'
const tables = [{ id: 't2', number: 2, name: 'Mesa 2', capacity: 4, status: 'available' }]
const product = { id: 'p', name: 'Lomo', categoryId: 'platos', price: 40, image: '', availability: 'available', sortOrder: 1, isActive: true, isVisible: true, restaurantType: 'prepared', recipe: [{ ingredientId: 'i', quantityBase: 100 }] }
const item = (id: string) => ({ id, productId: 'p', name: 'Lomo', basePrice: 40, quantity: 1, lineTotal: 40, modifiers: { extras: [], options: [], note: '' } })
const order = (id = 'o') => ({ id, sequence: 1, displayNumber: '001', createdAt: at, status: 'pending', orderSource: 'local', fulfillmentType: 'table', tableId: 't2', tableInfo: 'Mesa 2', total: 40, productSubtotal: 40, paymentStatus: 'pending', paymentMethod: null, expectedPaymentMethod: null, payment: { method: 'cash', cashAmount: 0, qrAmount: 0, cashReceived: 0, change: 0 }, items: [item('a')] })

test('POS abre Mesa 2 por ID y añade a la misma cuenta', () => {
  const opened = placeRestaurantOrder([], tables, order())
  assert.equal(opened.tables[0].status, 'occupied')
  assert.equal(opened.tables[0].activeOrderId, 'o')
  const added = placeRestaurantOrder(opened.orders, opened.tables, { ...order('o2'), items: [item('b')] })
  assert.equal(added.orders.length, 1)
  assert.equal(added.order.id, 'o')
  assert.equal(added.order.total, 80)
  assert.equal(added.order.items.length, 2)
  assert.throws(() => placeRestaurantOrder(added.orders, [{ ...added.tables[0], status: 'bill_requested' }], order('o3')), /Reabre/)
})

test('pago libera mesa; una cuenta pagada no se cobra de nuevo', () => {
  const opened = placeRestaurantOrder([], tables, order())
  const paid = completeRestaurantPayment(opened.orders, opened.tables, 'o', { method: 'cash', received: 50 }, 'Caja', at)
  assert.equal(paid.order.paymentStatus, 'paid')
  assert.equal(paid.order.payment.change, 10)
  assert.equal(paid.tables[0].status, 'available')
  assert.equal(paid.tables[0].activeOrderId, undefined)
  assert.throws(() => completeRestaurantPayment(paid.orders, paid.tables, 'o', { method: 'cash', received: 50 }, 'Caja', at))
})

test('cancelar cuenta de mesa elimina referencia activa y conserva historial', () => {
  const opened = placeRestaurantOrder([], tables, order())
  const cancelled = cancelRestaurantOrder(opened.orders, opened.tables, 'o', at, 'Caja')
  assert.equal(cancelled.orders[0].status, 'cancelled')
  assert.equal(cancelled.tables[0].status, 'available')
  assert.equal(cancelled.tables[0].activeOrderId, undefined)
})

test('migración controlada resuelve tableInfo legacy 2 y Mesa 2', () => {
  for (const tableInfo of ['2', 'Mesa 2']) {
    const migrated = reconcileTableOrders([{ ...order(), tableId: undefined, tableInfo }], tables)
    assert.equal(migrated.orders[0].tableId, 't2')
    assert.equal(migrated.tables[0].activeOrderId, 'o')
  }
})

test('comanda repetida consume stock una sola vez', () => {
  const ingredient = { ...product, id: 'i', restaurantType: 'ingredient', stockBase: 500 }
  const ticket = { ...order(), submittedBatches: [{ id: 'b', sequence: 1, createdAt: at, printedAt: at, itemIds: ['a'] }] }
  const first = consumePrintedBatch(ticket, 'b', [ingredient, product], [], at)
  const second = consumePrintedBatch(ticket, 'b', first.products, first.movements, at)
  assert.equal(first.products[0].stockBase, 400)
  assert.equal(second.products[0].stockBase, 400)
  assert.equal(second.movements.length, 1)
})

test('Todos y Bebidas filtran activos, visibles y disponibles', () => {
  const categories = [{ id: 'platos', isActive: true, isVisible: true }, { id: 'bebidas', isActive: true, isVisible: true }]
  const products = [product, { ...product, id: 'b', categoryId: 'bebidas' }, { ...product, id: 'hidden', isVisible: false }, { ...product, id: 'sold', availability: 'soldout' }]
  assert.deepEqual(selectRestaurantProducts(products, categories, 'all').map(item => item.id), ['p', 'b'])
  assert.deepEqual(selectRestaurantProducts(products, categories, 'bebidas').map(item => item.id), ['b'])
})

test('fixture full enlaza mesas, órdenes, productos, categorías e insumos por ID', () => {
  const tableIds = new Set(INITIAL_TABLES.map(table => table.id))
  const productIds = new Set(RESTAURANT_PRODUCTS.map(item => item.id))
  const categoryIds = new Set(RESTAURANT_CATEGORIES.map(item => item.id))
  const ingredientIds = new Set(RESTAURANT_INVENTORY_PRODUCTS.map(item => item.id))
  for (const order of INITIAL_RESTAURANT_ORDERS) {
    assert.ok(tableIds.has(order.tableId))
    for (const line of order.items) assert.ok(productIds.has(line.productId))
  }
  for (const product of RESTAURANT_PRODUCTS) {
    assert.ok(categoryIds.has(product.categoryId))
    assert.ok((product.recipe || []).length > 0, `${product.name} debe tener receta para descontar inventario`)
    for (const ingredient of product.recipe || []) assert.ok(ingredientIds.has(ingredient.ingredientId))
  }
})
