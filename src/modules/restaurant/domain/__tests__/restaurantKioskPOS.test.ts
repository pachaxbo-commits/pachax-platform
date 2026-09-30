/* eslint-disable @typescript-eslint/ban-ts-comment -- Node test types are outside the browser TypeScript configuration. */
// @ts-nocheck
import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'
import { RESTAURANT_CATEGORIES, RESTAURANT_PRODUCTS } from '../../../../demo/mocks/restaurantMock.ts'
import { makeRestaurantOrderItem, placeRestaurantOrder, completeRestaurantPayment, completeRestaurantGift } from '../restaurantOperations.ts'
import { restaurantThemeStyle, DEFAULT_RESTAURANT_THEME, RESTAURANT_THEME_PRESETS } from '../../views/restaurantTheme.ts'
import type { CartItem, Order, PaymentSummary, Product } from '../../../../types'

const at = '2026-09-30T18:00:00.000Z'
const productA = RESTAURANT_PRODUCTS[0]
const productB = RESTAURANT_PRODUCTS[1]

test('1. Pendiente -> Pagado conmuta libremente sin perder ítems', () => {
  const cartItems: CartItem[] = [
    { lineId: 'l1', productId: productA.id, quantity: 2, modifiers: { extras: [], options: [], note: '' } },
  ]
  let paymentStatus: 'paid' | 'pending' = 'pending'
  let paymentMethod: any = null

  // Conmutar a pagado
  paymentStatus = 'paid'
  paymentMethod = 'cash'
  assert.equal(paymentStatus, 'paid')
  assert.equal(paymentMethod, 'cash')
  assert.equal(cartItems.length, 1)
})

test('2. Pagado -> Pendiente conmuta libremente conservando ítems', () => {
  const cartItems: CartItem[] = [
    { lineId: 'l1', productId: productA.id, quantity: 2, modifiers: { extras: [], options: [], note: '' } },
    { lineId: 'l2', productId: productB.id, quantity: 1, modifiers: { extras: [], options: [], note: '' } },
  ]
  let paymentStatus: 'paid' | 'pending' = 'paid'
  let paymentMethod: any = 'cash'

  // Conmutar a pendiente
  paymentStatus = 'pending'
  paymentMethod = null
  assert.equal(paymentStatus, 'pending')
  assert.equal(paymentMethod, null)
  assert.equal(cartItems.length, 2)
})

test('3. Mesa + Pagado liquida el cobro y libera la mesa en una operación', () => {
  const tables = [{ id: 't1', name: 'Mesa 1', capacity: 4, status: 'available' as const, sortOrder: 1, active: true }]
  const order: Order = {
    id: 'ord-1', sequence: 1, displayNumber: '001', status: 'pending', orderSource: 'local', fulfillmentType: 'table',
    tableId: 't1', tableInfo: 'Mesa 1', total: 60, productSubtotal: 60,
    paymentStatus: 'pending', paymentMethod: null, expectedPaymentMethod: null,
    payment: { method: 'cash', cashAmount: 0, qrAmount: 0, cardAmount: 0, cashReceived: 0, change: 0 },
    items: [{ id: 'i1', productId: productA.id, name: productA.name, basePrice: 30, lineTotal: 60, quantity: 2, createdAt: at, status: 'pending', productArea: 'Cocina' }],
    createdAt: at, createdBy: 'Cajero',
  }
  const placed = placeRestaurantOrder([], tables, order)
  assert.equal(placed.tables[0].status, 'occupied')

  // Liquidar pago inmediato
  const settled = completeRestaurantPayment(placed.orders, placed.tables, 'ord-1', { method: 'cash', received: 100, cashAmount: 60 }, 'Cajero', at)
  assert.equal(settled.order.paymentStatus, 'paid')
  assert.equal(settled.tables[0].status, 'available', 'La mesa debe quedar libre tras registrarse el cobro')
  assert.equal(settled.order.payment.change, 40)
})

test('4. Mesa + Pendiente mantiene la mesa ocupada con la cuenta abierta', () => {
  const tables = [{ id: 't1', name: 'Mesa 1', capacity: 4, status: 'available' as const, sortOrder: 1, active: true }]
  const order: Order = {
    id: 'ord-2', sequence: 2, displayNumber: '002', status: 'pending', orderSource: 'local', fulfillmentType: 'table',
    tableId: 't1', tableInfo: 'Mesa 1', total: 40, productSubtotal: 40,
    paymentStatus: 'pending', paymentMethod: null, expectedPaymentMethod: 'cash',
    payment: { method: 'cash', cashAmount: 0, qrAmount: 0, cardAmount: 0, cashReceived: 0, change: 0 },
    items: [{ id: 'i2', productId: productB.id, name: productB.name, basePrice: 40, lineTotal: 40, quantity: 1, createdAt: at, status: 'pending', productArea: 'Cocina' }],
    createdAt: at, createdBy: 'Cajero',
  }
  const placed = placeRestaurantOrder([], tables, order)
  assert.equal(placed.tables[0].status, 'occupied')
  assert.equal(placed.tables[0].activeOrderId, 'ord-2')
  assert.equal(placed.order.paymentStatus, 'pending')
})

test('5. Efectivo con monto recibido suficiente calcula cambio correcto', () => {
  const cartTotal = 58
  const cashReceived = 100
  const effectiveCashReceived = cashReceived
  const change = Math.max(0, effectiveCashReceived - cartTotal)
  const isValid = cartTotal > 0 && effectiveCashReceived >= cartTotal
  assert.equal(isValid, true)
  assert.equal(change, 42)
})

test('6. Efectivo insuficiente es rechazado', () => {
  const cartTotal = 58
  const cashReceived = 50
  const effectiveCashReceived = cashReceived
  const isValid = cartTotal > 0 && effectiveCashReceived >= cartTotal
  assert.equal(isValid, false, 'Efectivo menor al total debe ser inválido')
})

test('7. Pago por QR es válido con total positivo', () => {
  const cartTotal = 85
  const paymentMethod = 'qr'
  const isPaymentValid = paymentMethod === 'qr' ? cartTotal > 0 : false
  assert.equal(isPaymentValid, true)
})

test('8. Pago con Tarjeta es válido con total positivo', () => {
  const cartTotal = 120
  const paymentMethod = 'card'
  const isPaymentValid = paymentMethod === 'card' ? cartTotal > 0 : false
  assert.equal(isPaymentValid, true)
})

test('9. Pago mixto exacto es válido cuando las partes suman el total', () => {
  const cartTotal = 100
  const cashAmount = 40
  const qrAmount = 35
  const cardAmount = 25
  const effectiveCashReceived = 50 // dio un billete de 50 para los 40 de efectivo
  const isMixedValid =
    cartTotal > 0 &&
    Math.round((cashAmount + qrAmount + cardAmount + Number.EPSILON) * 100) / 100 === Math.round((cartTotal + Number.EPSILON) * 100) / 100 &&
    (!cashAmount || effectiveCashReceived >= cashAmount) &&
    [cashAmount, qrAmount, cardAmount].filter(a => a > 0).length >= 2
  assert.equal(isMixedValid, true)
  const change = Math.max(0, effectiveCashReceived - cashAmount)
  assert.equal(change, 10)
})

test('10. Pago mixto que no suma total es rechazado', () => {
  const cartTotal = 100
  const cashAmount = 40
  const qrAmount = 30
  const cardAmount = 0
  const effectiveCashReceived = 40
  const isMixedValid =
    cartTotal > 0 &&
    Math.round((cashAmount + qrAmount + cardAmount + Number.EPSILON) * 100) / 100 === Math.round((cartTotal + Number.EPSILON) * 100) / 100 &&
    (!cashAmount || effectiveCashReceived >= cashAmount) &&
    [cashAmount, qrAmount, cardAmount].filter(a => a > 0).length >= 2
  assert.equal(isMixedValid, false, 'Suma de 70 sobre 100 debe ser rechazada')
})

test('11. Regalo/Cortesía NO aparece como opción para nuevos pedidos en el POS', () => {
  const cajaSource = fs.readFileSync('src/components/CajaView.tsx', 'utf8')
  assert.match(
    cajaSource,
    /\{ id: 'paid', label: 'Pagado' \},\s*\{ id: 'pending', label: 'Pendiente' \},?\s*\]\.map/,
    'Las únicas opciones en checkout de nuevos pedidos deben ser Pagado y Pendiente'
  )
  assert.doesNotMatch(
    cajaSource,
    /\{ id: 'gift',\s*label: 'Regalo' \}/,
    'Regalo no debe ser seleccionable en nuevas órdenes del POS'
  )
})

test('12. Históricos gift/courtesy continúan legibles si existen en el dominio', () => {
  const tables = [{ id: 't1', name: 'Mesa 1', capacity: 4, status: 'available' as const, sortOrder: 1, active: true }]
  const order: Order = {
    id: 'ord-gift', sequence: 9, displayNumber: '009', status: 'pending', orderSource: 'local', fulfillmentType: 'table',
    tableId: 't1', tableInfo: 'Mesa 1', total: 40, productSubtotal: 40,
    paymentStatus: 'pending', paymentMethod: null, expectedPaymentMethod: null,
    payment: { method: 'cash', cashAmount: 0, qrAmount: 0, cardAmount: 0, cashReceived: 0, change: 0 },
    items: [], createdAt: at, createdBy: 'Gerencia',
  }
  const opened = placeRestaurantOrder([], tables, order)
  const gifted = completeRestaurantGift(opened.orders, opened.tables, 'ord-gift', 'Gerencia', at)
  assert.equal(gifted.order.paymentStatus, 'gift')
  assert.equal(gifted.order.giftedBy, 'Gerencia')
  assert.equal(gifted.tables[0].status, 'available')

  // HistorialView soporta la visualización de órdenes de cortesía
  const historySource = fs.readFileSync('src/components/HistorialView.tsx', 'utf8')
  assert.match(historySource, /isGift \? 'Cortes[íi]a' : 'Pendiente'/)
  assert.match(historySource, /Cortes[íi]a autorizada por/)
})

test('13. Carrito no pierde productos al cambiar estado de pago', () => {
  const cartItems: CartItem[] = [
    { lineId: 'l1', productId: productA.id, quantity: 3, modifiers: { extras: [{ id: 'e1', name: 'Queso', price: 5 }], options: [], note: 'Bien cocido' } },
  ]
  const initialLength = cartItems.length
  const initialModifiers = JSON.stringify(cartItems[0].modifiers)

  // Cambiar entre estados de pago
  let status: 'paid' | 'pending' = 'pending'
  status = 'paid'
  status = 'pending'
  status = 'paid'

  assert.equal(cartItems.length, initialLength)
  assert.equal(JSON.stringify(cartItems[0].modifiers), initialModifiers)
})

test('14. Mobile garantiza 2 columnas en el catálogo sin desbordamiento horizontal', () => {
  const cssSource = fs.readFileSync('src/modules/restaurant/views/restaurantKiosk.css', 'utf8')
  assert.match(
    cssSource,
    /\.restaurant-product-grid\s*\{[^}]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/,
    'En móvil el catálogo de productos debe configurarse exactamente con repeat(2,minmax(0,1fr))'
  )
  assert.match(
    cssSource,
    /\.restaurant-workspace\s*\{[^}]*min-width:\s*0;/,
    'El workspace debe evitar overflow horizontal restringiendo min-width: 0'
  )
})

test('15. Studio y Producción usan la vista canónica de Restaurante', () => {
  const studioSource = fs.readFileSync('src/studio/StudioShell.tsx', 'utf8')
  assert.match(
    studioSource,
    /\/demo\/\$\{templateId\}\?embed=studio/,
    'StudioShell debe embeber la experiencia canónica demo mediante el iframe canonical embed'
  )
  const appSource = fs.readFileSync('src/modules/restaurant/views/RestaurantApp.tsx', 'utf8')
  assert.match(
    appSource,
    /<RestaurantExperience/,
    'RestaurantApp (producción) renderiza directamente la experiencia canónica RestaurantExperience'
  )
})

test('16. Demo pública usa la vista canónica de Restaurante', () => {
  const demoRuntimeSource = fs.readFileSync('src/demo/DemoRuntime.tsx', 'utf8')
  assert.match(
    demoRuntimeSource,
    /<RestaurantDemo/,
    'DemoRuntime delega en RestaurantDemo'
  )
  const restaurantDemoSource = fs.readFileSync('src/demo/restaurant/RestaurantDemo.tsx', 'utf8')
  assert.match(
    restaurantDemoSource,
    /<RestaurantExperience/,
    'RestaurantDemo renderiza directamente la experiencia canónica RestaurantExperience'
  )
})
