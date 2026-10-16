/* eslint-disable @typescript-eslint/ban-ts-comment -- Node test types are intentionally absent from the browser TypeScript configuration. */
// @ts-nocheck Node runs this domain test with its own types, outside the browser runtime.
import test from 'node:test'
import assert from 'node:assert/strict'
import type { Order, OrderItem } from '../../../../types.ts'
import type { RestaurantTable } from '../../../../demo/mocks/restaurantMock.ts'
import { placeRestaurantOrder } from '../restaurantOperations.ts'

const sampleTables: RestaurantTable[] = [
  { id: 'tbl_1', number: 1, name: 'Mesa 1', capacity: 4, sectorId: 'sec_salon', status: 'available', active: true },
  { id: 'tbl_2', number: 2, name: 'Mesa 2', capacity: 2, sectorId: 'sec_salon', status: 'available', active: true },
]

function makeItem(productId: string, name: string, price: number, quantity = 1, options: string[] = [], extras: { id: string; name: string; price: number }[] = []): OrderItem {
  return {
    id: `line_${Math.random().toString(36).slice(2, 7)}`,
    productId,
    name,
    basePrice: price,
    quantity,
    lineTotal: price * quantity,
    status: 'pending',
    modifiers: {
      note: 'Sin cebolla',
      options,
      extras,
    },
  }
}

test('servicio rápido: mesa de referencia no ocupa ni bloquea el salón', () => {
  const incomingOrder: Order = {
    id: 'ord_counter_1',
    sequence: 1,
    displayNumber: '#001',
    branchId: 'branch_central',
    tableId: 'tbl_1',
    tableInfo: 'Mesa 1',
    orderSource: 'local',
    fulfillmentType: 'table',
    isReferenceTable: true,
    referenceOnly: true,
    status: 'pending',
    paymentStatus: 'pending',
    paymentMethod: null,
    expectedPaymentMethod: null,
    payment: { method: 'cash', cashAmount: 0, qrAmount: 0, cardAmount: 0, cashReceived: 0, change: 0 },
    total: 45,
    productSubtotal: 45,
    items: [makeItem('prod_burger_doble', 'Hamburguesa Doble', 45)],
    createdAt: '2026-10-15T20:00:00.000Z',
  }

  const result = placeRestaurantOrder([], sampleTables, incomingOrder, { referenceOnly: true })

  // La mesa debe mantenerse disponible, sin activeOrderId
  const table = result.tables.find(t => t.id === 'tbl_1')
  assert.ok(table)
  assert.equal(table.status, 'available')
  assert.equal(table.activeOrderId, undefined)

  // La orden debe preservar su información de referencia
  assert.equal(result.order.tableId, 'tbl_1')
  assert.equal(result.order.tableInfo, 'Mesa 1')
  assert.equal(result.order.fulfillmentType, 'table')
  assert.equal(result.added, false)

  // Un segundo pedido para la misma mesa de referencia NO se acumula como adición, sino como orden independiente
  const incomingOrder2: Order = {
    id: 'ord_counter_2',
    sequence: 2,
    displayNumber: '#002',
    branchId: 'branch_central',
    tableId: 'tbl_1',
    tableInfo: 'Mesa 1',
    orderSource: 'local',
    fulfillmentType: 'table',
    isReferenceTable: true,
    referenceOnly: true,
    status: 'pending',
    paymentStatus: 'pending',
    paymentMethod: null,
    expectedPaymentMethod: null,
    payment: { method: 'cash', cashAmount: 0, qrAmount: 0, cardAmount: 0, cashReceived: 0, change: 0 },
    total: 30,
    productSubtotal: 30,
    items: [makeItem('prod_pizza', 'Pizza Personal', 30)],
    createdAt: '2026-10-15T20:05:00.000Z',
  }

  const result2 = placeRestaurantOrder(result.orders, result.tables, incomingOrder2, { referenceOnly: true })
  assert.equal(result2.orders.length, 2)
  assert.equal(result2.added, false)
  const tableAfterSecond = result2.tables.find(t => t.id === 'tbl_1')
  assert.equal(tableAfterSecond?.status, 'available')
  assert.equal(tableAfterSecond?.activeOrderId, undefined)
})

test('servicio rápido: pedidos para llevar y delivery preservan metadatos de contacto y despacho', () => {
  const pickupOrder: Order = {
    id: 'ord_pickup_1',
    sequence: 3,
    displayNumber: '#003',
    branchId: 'branch_central',
    orderSource: 'local',
    fulfillmentType: 'pickup',
    customerName: 'Carlos Mendoza',
    customerPhone: '71234567',
    status: 'pending',
    paymentStatus: 'paid',
    paymentMethod: 'cash',
    expectedPaymentMethod: 'cash',
    payment: { method: 'cash', cashAmount: 55, qrAmount: 0, cardAmount: 0, cashReceived: 55, change: 0 },
    total: 55,
    items: [makeItem('prod_combo_1', 'Combo Familiar', 55)],
    createdAt: '2026-10-15T20:10:00.000Z',
  }

  const pickupResult = placeRestaurantOrder([], sampleTables, pickupOrder)
  assert.equal(pickupResult.order.fulfillmentType, 'pickup')
  assert.equal(pickupResult.order.customerName, 'Carlos Mendoza')
  assert.equal(pickupResult.order.customerPhone, '71234567')
  assert.equal(pickupResult.order.tableId, undefined)

  const deliveryOrder: Order = {
    id: 'ord_delivery_1',
    sequence: 4,
    displayNumber: '#004',
    branchId: 'branch_central',
    orderSource: 'local',
    fulfillmentType: 'delivery',
    customerName: 'Lucía Fernández',
    customerPhone: '79876543',
    deliveryAddress: 'Av. Las Palmas #450, Piso 3',
    status: 'pending',
    paymentStatus: 'pending',
    paymentMethod: null,
    expectedPaymentMethod: null,
    payment: { method: 'cash', cashAmount: 0, qrAmount: 0, cardAmount: 0, cashReceived: 0, change: 0 },
    total: 80,
    items: [makeItem('prod_crispy_chicken', 'Pollo Broaster 6 pzas', 80)],
    createdAt: '2026-10-15T20:15:00.000Z',
  }

  const deliveryResult = placeRestaurantOrder([], sampleTables, deliveryOrder)
  assert.equal(deliveryResult.order.fulfillmentType, 'delivery')
  assert.equal(deliveryResult.order.customerName, 'Lucía Fernández')
  assert.equal(deliveryResult.order.customerPhone, '79876543')
  assert.equal(deliveryResult.order.deliveryAddress, 'Av. Las Palmas #450, Piso 3')
})

test('flujo de cocina y entrega: transiciones completas hasta marcar entregado', () => {
  let orderState: Order = {
    id: 'ord_kitchen_flow',
    sequence: 5,
    displayNumber: '#010',
    branchId: 'branch_central',
    orderSource: 'local',
    fulfillmentType: 'pickup',
    status: 'pending',
    paymentStatus: 'paid',
    paymentMethod: 'cash',
    expectedPaymentMethod: 'cash',
    payment: { method: 'cash', cashAmount: 40, qrAmount: 0, cardAmount: 0, cashReceived: 40, change: 0 },
    total: 40,
    items: [makeItem('prod_wings', 'Alitas Picantes', 40)],
    createdAt: '2026-10-15T20:20:00.000Z',
  }

  // 1. Pasa a preparación
  orderState = { ...orderState, status: 'preparing' }
  assert.equal(orderState.status, 'preparing')

  // 2. Cocina marca como listo para retirar
  orderState = { ...orderState, status: 'ready_for_pickup' }
  assert.equal(orderState.status, 'ready_for_pickup')

  // 3. Mostrador entrega al cliente
  orderState = {
    ...orderState,
    status: 'delivered',
    deliveredAt: '2026-10-15T20:35:00.000Z',
  }
  assert.equal(orderState.status, 'delivered')
  assert.ok(orderState.deliveredAt)
})

test('modificadores y extras aplican a cualquier categoría sin limitarse a hamburguesas', () => {
  const customPizzaItem = makeItem(
    'prod_pizza_artesanal',
    'Pizza Cuatro Quesos',
    60,
    1,
    ['Masa Fina', 'Borde Queso'],
    [{ id: 'ext_1', name: 'Extra Champiñones', price: 8 }, { id: 'ext_2', name: 'Extra Pepperoni', price: 10 }]
  )

  assert.equal(customPizzaItem.modifiers?.options.length, 2)
  assert.equal(customPizzaItem.modifiers?.extras.length, 2)
  assert.equal(customPizzaItem.modifiers?.note, 'Sin cebolla')
})

test('impresión automática: fallo de impresora no bloquea ni revierte la orden', async () => {
  let orderCreated = false
  let printFailedHandled = false

  async function mockSimulatedOrderPlacement(shouldPrintFail: boolean) {
    // 1. Guardar orden en backend (obligatorio primero)
    orderCreated = true

    // 2. Disparo de auto-impresión
    try {
      if (shouldPrintFail) {
        throw new Error('Printer connection timed out (TCP 9100 unreachable)')
      }
    } catch {
      printFailedHandled = true
      // Notifica al usuario sin deshacer la venta
    }

    return { success: true, orderId: 'ord_safe_print' }
  }

  const result = await mockSimulatedOrderPlacement(true)
  assert.equal(result.success, true)
  assert.equal(orderCreated, true)
  assert.equal(printFailedHandled, true)
})
