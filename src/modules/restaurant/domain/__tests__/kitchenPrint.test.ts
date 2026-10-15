/* eslint-disable @typescript-eslint/ban-ts-comment -- Node runs this pure formatting test outside the browser project. */
// @ts-nocheck
import assert from 'node:assert/strict'
import test from 'node:test'
import { buildKitchenTicketText } from '../kitchenPrint.ts'

const order = {
  id: 'order-48', sequence: 48, displayNumber: '0048', createdAt: '2026-10-08T13:42:00Z', status: 'pending', orderSource: 'local', fulfillmentType: 'pickup', total: 58, productSubtotal: 58,
  paymentStatus: 'paid', paymentMethod: 'qr', expectedPaymentMethod: null, payment: { method: 'qr', cashAmount: 0, qrAmount: 58, cashReceived: 0, change: 0 }, customerName: 'Carlos',
  items: [],
}
const line = { id: 'line-1', productId: 'burger', name: 'Hamburguesa clásica', basePrice: 38, quantity: 2, lineTotal: 76, modifiers: { extras: [], options: [], note: 'Sin cebolla' } }

test('la comanda de hamburguesería es texto claro sin importes ni pago', () => {
  const text = buildKitchenTicketText({ order, sequence: 1, lines: [line], createdAt: '2026-10-08T13:42:00Z', businessName: 'Hamburguesería Demo' })
  assert.match(text, /COCINA/)
  assert.match(text, /PEDIDO #0048-1/)
  assert.match(text, /PARA LLEVAR/)
  assert.match(text, /2x Hamburguesa clásica/)
  assert.match(text, /OBS: Sin cebolla/)
  assert.match(text, /CLIENTE: Carlos/)
  assert.doesNotMatch(text, /\bQR\b|\bTOTAL\b|\bBs\./i)
})

test('una adición se identifica sin reutilizar una venta anterior', () => {
  const text = buildKitchenTicketText({ order, sequence: 2, lines: [line], createdAt: '2026-10-08T13:42:00Z', kind: 'addition' })
  assert.match(text, /^ADICION/m)
  assert.match(text, /PEDIDO #0048-2/)
})
