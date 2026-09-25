// @ts-nocheck Node executes this test directly outside the browser TypeScript project.
import assert from 'node:assert/strict'
import test from 'node:test'
import { confirmInventoryLines, convertInventoryQuantity, inventoryShiftRows, openingInventorySnapshot, returnInventoryLine, stockAwareProducts, changeInventoryStock, reconcileInventoryLedger } from '../inventoryEngine.ts'

const at = '2026-09-24T20:00:00Z'
const product = (id, stockBase, baseUnit = 'unit', extra = {}) => ({ id, name: id, categoryId: 'beverages', price: 12, image: '', availability: 'available', sortOrder: 0, isActive: true, isVisible: true, restaurantType: 'direct', baseUnit, stockBase, minimumStockBase: 2, ...extra })
const line = (id, productId, quantity) => ({ id, productId, name: productId, basePrice: 12, quantity, lineTotal: quantity * 12, modifiers: { extras: [], options: [], note: '' } })
const order = (id, tableId) => ({ id, tableId, shiftId: 'shift-1', items: [], submittedBatches: [] })

test('dos mesas confirman consumo inmediatamente, cancelación parcial y recarga conservan 20', () => {
  const initial = [product('corona', 24)]
  const snapshot = openingInventorySnapshot(initial)
  const firstLine = line('l1', 'corona', 2)
  const secondLine = line('l2', 'corona', 3)
  const first = confirmInventoryLines(order('o1', 't1'), [firstLine], initial, [], at, 'Mesero A')
  assert.equal(first.products[0].stockBase, 22)
  const second = confirmInventoryLines(order('o2', 't2'), [secondLine], first.products, first.movements, at, 'Mesero B')
  assert.equal(second.products[0].stockBase, 19)
  const returned = returnInventoryLine(order('o1', 't1'), firstLine, 1, second.products, second.movements, at, 'Mesero A', 'cancel-1')
  assert.equal(returned.products[0].stockBase, 20)
  assert.deepEqual(returned.movements.map(movement => movement.quantityBase), [-2, -3, 1])
  assert.equal(returned.movements[0].tableId, 't1')
  assert.equal(returned.movements[1].shiftId, 'shift-1')
  const reloaded = structuredClone({ products: returned.products, movements: returned.movements })
  const reprint = confirmInventoryLines(order('o1', 't1'), [firstLine], reloaded.products, reloaded.movements, at, 'Mesero A')
  assert.equal(reprint.products[0].stockBase, 20)
  assert.equal(reprint.movements.length, 3)
  const repeatedReturn = returnInventoryLine(order('o1', 't1'), firstLine, 1, returned.products, returned.movements, at, 'Mesero A', 'cancel-1')
  assert.equal(repeatedReturn.products[0].stockBase, 20)
  const [row] = inventoryShiftRows(returned.products, snapshot, returned.movements, 'shift-1', { corona: { physical: 19, countedAt: at, countedBy: 'Cajero' } })
  assert.equal(row.initial, 24)
  assert.equal(row.sales, -5)
  assert.equal(row.returns, 1)
  assert.equal(row.theoretical, 20)
  assert.equal(row.physical, 19)
  assert.equal(row.difference, -1)
  assert.equal(returned.products[0].stockBase, 20)
})

test('stock insuficiente rechaza operación completa incluso entre líneas de un pedido', () => {
  const available = [product('corona', 2)]
  assert.throws(() => confirmInventoryLines(order('o1', 't1'), [line('l1', 'corona', 3)], available, [], at, 'Mesero'), /Stock insuficiente/)
  assert.throws(() => confirmInventoryLines(order('o1', 't1'), [line('l1', 'corona', 1), line('l2', 'corona', 2)], available, [], at, 'Mesero'), /Stock insuficiente/)
  assert.equal(available[0].stockBase, 2)
  assert.equal(stockAwareProducts([product('corona', 0)])[0].availability, 'soldout')
})

test('recetas descuentan cada ingrediente y su devolución usa la receta vendida aunque cambie después', () => {
  const ingredients = [product('pan', 10), product('carne', 1000, 'g'), product('queso', 200, 'g'), product('papa', 1000, 'g')]
  const burger = product('burger', undefined, 'unit', { restaurantType: 'prepared', recipe: [{ ingredientId: 'pan', quantityBase: 1 }, { ingredientId: 'carne', quantityBase: 180 }, { ingredientId: 'queso', quantityBase: 30 }, { ingredientId: 'papa', quantityBase: 200 }] })
  const sold = confirmInventoryLines(order('o1', 't1'), [line('l1', 'burger', 2)], [...ingredients, burger], [], at, 'Mesero')
  assert.deepEqual(sold.products.slice(0, 4).map(item => item.stockBase), [8, 640, 140, 600])
  const changedRecipe = sold.products.map(item => item.id === 'burger' ? { ...item, recipe: [{ ingredientId: 'pan', quantityBase: 2 }] } : item)
  const returned = returnInventoryLine(order('o1', 't1'), line('l1', 'burger', 2), 1, changedRecipe, sold.movements, at, 'Mesero', 'cancel-1')
  assert.deepEqual(returned.products.slice(0, 4).map(item => item.stockBase), [9, 820, 170, 800])
})

test('botella por copa, conversiones y tipos de salida preservan trazabilidad', () => {
  assert.equal(convertInventoryQuantity(0.75, 'l', 'ml'), 750)
  assert.equal(convertInventoryQuantity(1.2, 'kg', 'g'), 1200)
  assert.throws(() => convertInventoryQuantity(1, 'kg', 'ml'))
  const bottle = product('vino-ml', 750, 'ml')
  const glass = product('copa', undefined, 'unit', { restaurantType: 'beverage', recipe: [{ ingredientId: 'vino-ml', quantityBase: 150 }] })
  const sold = confirmInventoryLines(order('o1', 't1'), [line('l1', 'copa', 5)], [bottle, glass], [], at, 'Mesero')
  assert.equal(sold.products[0].stockBase, 0)
  const waste = changeInventoryStock(product('vino-ml', 750, 'ml'), 700, [], 'waste', 'Botella rota', at, 'Barra', 'shift-1')
  assert.equal(waste.movement.type, 'waste')
  assert.equal(waste.movement.quantityBase, -50)
  assert.equal(waste.movement.createdBy, 'Barra')
})

test('migración deja movimiento explícito si stock local y libro de movimientos difieren', () => {
  const products = [product('corona', 22)]
  const movements = [{ id: 'old', operationId: 'old', productId: 'corona', productName: 'corona', quantityBase: -5, type: 'sale', createdAt: at, shiftId: 'shift-1' }]
  const reconciled = reconcileInventoryLedger(products, { corona: 24 }, movements, 'shift-1', at)
  assert.equal(reconciled.length, 2)
  assert.equal(reconciled[1].type, 'migration_reconciliation')
  assert.equal(reconciled[1].quantityBase, 3)
  assert.equal(inventoryShiftRows(products, { corona: 24 }, reconciled, 'shift-1')[0].theoretical, 22)
  assert.equal(reconcileInventoryLedger(products, { corona: 24 }, reconciled, 'shift-1', at).length, 2)
})
