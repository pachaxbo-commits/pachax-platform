// @ts-nocheck Node executes this file directly, outside the browser TypeScript project.
import assert from 'node:assert/strict'
import test from 'node:test'
import { consumePrintedBatch, recipeCost, settlePayments } from '../restaurantEngine.ts'
import type { Order, Product } from '../../../../types.ts'

test('pago dividido exige cubrir el total y calcula cambio solo en efectivo', () => {
  const paid = settlePayments(100, [{ method: 'cash', amount: 40, received: 50 }, { method: 'qr', amount: 60 }], 'Caja', '2026-01-01T00:00:00Z')
  assert.equal(paid.reduce((sum, item) => sum + item.amount, 0), 100)
  assert.equal(paid[0].change, 10)
  assert.equal(paid[1].change, 0)
  assert.throws(() => settlePayments(100, [{ method: 'cash', amount: 99, received: 99 }], 'Caja', '2026-01-01T00:00:00Z'))
})

test('costo teórico y consumo de comanda son idempotentes', () => {
  const ingredient = { id: 'i', name: 'Carne', categoryId: 'ingredient', price: 0, image: '', availability: 'available', sortOrder: 0, isActive: true, isVisible: true, restaurantType: 'ingredient', stockBase: 1000, unitCost: 0.04 } satisfies Product
  const plate = { ...ingredient, id: 'p', name: 'Plato', restaurantType: 'prepared', recipe: [{ ingredientId: 'i', quantityBase: 200 }] } satisfies Product
  assert.equal(recipeCost(plate, [ingredient, plate]), 8)
  const order = { id: 'o', items: [{ id: 'l', productId: 'p', name: 'Plato', basePrice: 20, quantity: 2, lineTotal: 40, modifiers: { extras: [], options: [], note: '' } }], submittedBatches: [{ id: 'b', sequence: 1, createdAt: '', itemIds: ['l'] }] } as Order
  const first = consumePrintedBatch(order, 'b', [ingredient, plate], [], '')
  const second = consumePrintedBatch(order, 'b', first.products, first.movements, '')
  assert.equal(first.products[0].stockBase, 600)
  assert.equal(second.products[0].stockBase, 600)
  assert.equal(second.movements.length, 1)
})
