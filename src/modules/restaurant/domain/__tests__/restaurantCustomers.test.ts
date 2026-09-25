/* eslint-disable @typescript-eslint/ban-ts-comment -- Node test types are outside the browser TypeScript configuration. */
// @ts-nocheck Node executes this test directly outside the browser TypeScript project.
import assert from 'node:assert/strict'
import test from 'node:test'
import type { Order } from '../../../../types.ts'
import { customerOrders, customerSummary, legacyCustomersFromOrders, normalizeCustomerPhone, whatsappUrl, type RestaurantCustomer } from '../restaurantCustomers.ts'

const customer: RestaurantCustomer = { id: 'c1', firstName: 'Juan', lastName: 'Pérez', countryCode: '591', phone: '70712345', normalizedPhone: '59170712345', active: true, createdAt: '2026-09-01', updatedAt: '2026-09-01' }
const order = (id: string, overrides: Partial<Order> = {}) => ({ id, createdAt: '2026-09-20T12:00:00.000Z', status: 'delivered', paymentStatus: 'paid', total: 50, customerId: 'c1', ...overrides }) as Order

test('normaliza teléfono y construye enlaces WhatsApp sin enviar mensajes', () => {
  assert.equal(normalizeCustomerPhone('+591', '707-12345'), '59170712345')
  assert.equal(normalizeCustomerPhone('+591', '+591 70712345'), '59170712345')
  assert.equal(whatsappUrl(customer), 'https://wa.me/59170712345')
  assert.match(whatsappUrl(customer, 'Hola Juan'), /text=Hola\+Juan/)
})

test('historial cuenta pedidos pagados por ID y conserva vínculo tras editar teléfono', () => {
  const paid = order('o1')
  const pending = order('o2', { paymentStatus: 'pending', total: 30 })
  const cancelled = order('o3', { status: 'cancelled' })
  const summary = customerSummary({ ...customer, phone: '70000000', normalizedPhone: '59170000000' }, [paid, pending, cancelled])
  assert.equal(summary.orders.length, 2)
  assert.equal(summary.visits, 1)
  assert.equal(summary.totalSpent, 50)
  assert.equal(summary.lastVisit, paid.createdAt)
})

test('pedidos sin ID se resuelven por teléfono y clientes legacy sin teléfono por nombre', () => {
  const oldPhone = order('old-phone', { customerId: undefined, customerPhone: '+591 70712345' })
  assert.equal(customerOrders(customer, [oldPhone]).length, 1)
  const oldName = order('old-name', { customerId: undefined, customerName: 'María López', customerPhone: undefined })
  const migrated = legacyCustomersFromOrders([oldName])
  assert.equal(migrated.length, 1)
  assert.equal(migrated[0].normalizedPhone, '')
  assert.equal(customerOrders(migrated[0], [oldName]).length, 1)
})
