/* eslint-disable @typescript-eslint/ban-ts-comment -- Node tests run outside the browser TypeScript project. */
// @ts-nocheck Node executes this file directly, outside the browser TypeScript project.
import assert from 'node:assert/strict'
import test from 'node:test'
import { createNightclubDataset } from '../../../../demo/datasets/nightclub/nightclubDatasets.ts'
import { addNightclubRound, closeNightclubAccount, closeNightclubShift, nightclubCashSummary, openNightclubAccount, requestNightclubBill, advanceNightclubRound, reopenNightclubBill } from '../nightclubAccounts.ts'

test('an open nightclub table keeps one account across multiple rounds', () => {
  let data = createNightclubDataset('empty')
  data = { ...data, shift: { id: 'shift-test', status: 'open', openedAt: '2026-09-25T20:00:00Z', openingFloat: 500, openedBy: 'Owner' }, products: [{ id: 'beer', category: 'Cervezas', name: 'Cerveza', price: 25, preparationArea: 'Directo', stockUnits: 10, recipe: [{ inventoryId: 'beer-stock', quantity: 1 }] }], inventory: [{ id: 'beer-stock', name: 'Cerveza', unit: 'unit', current: 10, minimum: 2 }] }
  data = openNightclubAccount(data, 'night-table-general-1', 'Mesero', '2026-09-25T21:00:00Z')
  const accountId = data.tables[0].activeAccountId!
  data = addNightclubRound(data, accountId, [{ productId: 'beer', quantity: 2 }], 'Mesero', '2026-09-25T21:05:00Z')
  data = addNightclubRound(data, accountId, [{ productId: 'beer', quantity: 1 }], 'Mesero', '2026-09-25T22:00:00Z')
  assert.equal(data.accounts.length, 1)
  assert.equal(data.accounts[0].rounds.length, 2)
  assert.equal(data.accounts[0].subtotal, 75)
  assert.equal(data.products[0].stockUnits, 7)
  assert.equal(data.inventory[0].current, 7)
  assert.deepEqual(data.inventoryMovements.map(item => item.quantity), [-2, -1])
})

test('request, payment and release keep the same table/account identity', () => {
  let data = createNightclubDataset('full')
  const table = data.tables.find(item => item.activeAccountId)!
  const accountId = table.activeAccountId!
  data = requestNightclubBill(data, accountId)
  assert.equal(data.tables.find(item => item.id === table.id)?.status, 'bill_requested')
  data = closeNightclubAccount(data, accountId, { method: 'cash', received: 700 }, 'Caja', '2026-09-25T23:30:00Z')
  assert.equal(data.accounts.find(item => item.id === accountId)?.status, 'closed')
  assert.equal(data.tables.find(item => item.id === table.id)?.status, 'available')
  assert.equal(data.tables.find(item => item.id === table.id)?.activeAccountId, undefined)
  assert.equal(data.accounts.find(item => item.id === accountId)?.payment?.change, 20)
  assert.equal(nightclubCashSummary(data).cashSales, 680)
})

test('multi-product rounds consume ml and units, while payments never consume stock twice', () => {
  let data = createNightclubDataset('full')
  data = openNightclubAccount(data, 'night-table-general-1', 'Servicio')
  const id = data.tables.find(item => item.id === 'night-table-general-1').activeAccountId
  const beforeVodka = data.inventory.find(item => item.id === 'vodka-ml').current
  const beforeMixers = data.inventory.find(item => item.id === 'mixer-can').current
  data = addNightclubRound(data, id, [{ productId: 'combo-1', quantity: 1 }, { productId: 'cocktail-1', quantity: 2 }], 'Servicio')
  assert.equal(data.inventory.find(item => item.id === 'vodka-ml').current, beforeVodka - 870)
  assert.equal(data.inventory.find(item => item.id === 'mixer-can').current, beforeMixers - 6)
  assert.equal(data.inventoryMovements.filter(item => item.accountId === id).length, 3)
  const roundId = data.accounts.find(item => item.id === id).rounds[0].id
  data = advanceNightclubRound(data, id, roundId, 'Barra')
  data = advanceNightclubRound(data, id, roundId, 'Barra')
  assert.equal(data.accounts.find(item => item.id === id).rounds[0].status, 'ready')
  data = requestNightclubBill(data, id)
  data = reopenNightclubBill(data, id, 'Caja')
  data = requestNightclubBill(data, id)
  const movementCount = data.inventoryMovements.length
  assert.throws(() => closeNightclubAccount(data, id, { method: 'cash', received: 10 }), /Monto insuficiente/)
  data = closeNightclubAccount(data, id, { method: 'mixed', cashAmount: 300, qrAmount: 356, cardAmount: 0, received: 350 }, 'Caja')
  assert.equal(data.inventoryMovements.length, movementCount)
  assert.equal(nightclubCashSummary(data).cashSales, 300)
  assert.equal(nightclubCashSummary(data).qrSales, 356)
  assert.equal(data.accounts.find(item => item.id === id).payment.change, 50)
  assert.throws(() => closeNightclubAccount(data, id, { method: 'cash' }), /solicitarse/)
})

test('cash closure requires all accounts closed and reconciles counted cash', () => {
  let data = createNightclubDataset('full')
  assert.throws(() => closeNightclubShift(data, 'Caja', 1000), /cuentas abiertas/)
  for (const account of data.accounts.filter(item => item.status === 'open')) {
    data = requestNightclubBill(data, account.id)
    data = closeNightclubAccount(data, account.id, { method: 'qr' }, 'Caja')
  }
  data = closeNightclubShift(data, 'Caja', 1000)
  assert.equal(data.shift.status, 'closed')
  assert.equal(data.shift.difference, 0)
})

test('a second account cannot replace an occupied table', () => {
  const data = createNightclubDataset('full')
  const table = data.tables.find(item => item.activeAccountId)!
  assert.throws(() => openNightclubAccount(data, table.id, 'Otro usuario'), /cuenta activa/)
})

test('nightclub empty and full datasets keep valid linked identities', () => {
  const empty = createNightclubDataset('empty')
  assert.equal(empty.zones.length, 5)
  assert.equal(empty.tables.length, 10)
  assert.equal(empty.products.length, 0)
  assert.equal(empty.accounts.length, 0)
  assert.equal(empty.shift, null)

  const full = createNightclubDataset('full')
  assert.ok(full.products.length >= 7)
  assert.equal(full.shift?.status, 'open')
  for (const account of full.accounts) {
    const table = full.tables.find(item => item.id === account.tableId)
    assert.ok(table)
    assert.equal(table?.activeAccountId, account.id)
    for (const round of account.rounds) for (const item of round.items) assert.ok(full.products.some(product => product.id === item.productId))
  }
  for (const reservation of full.reservations) assert.ok(full.tables.some(table => table.id === reservation.tableId))
})
