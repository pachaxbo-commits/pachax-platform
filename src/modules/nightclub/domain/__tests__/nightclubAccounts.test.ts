// @ts-nocheck Node executes this file directly, outside the browser TypeScript project.
import assert from 'node:assert/strict'
import test from 'node:test'
import { createNightclubDataset } from '../../../../demo/datasets/nightclub/nightclubDatasets.ts'
import { addNightclubRound, closeNightclubAccount, openNightclubAccount, requestNightclubBill } from '../nightclubAccounts.ts'

test('an open nightclub table keeps one account across multiple rounds', () => {
  let data = createNightclubDataset('empty')
  data = { ...data, shift: { id: 'shift-test', status: 'open', openedAt: '2026-09-25T20:00:00Z', openingFloat: 500, openedBy: 'Owner' }, products: [{ id: 'beer', category: 'Cervezas', name: 'Cerveza', price: 25, preparationArea: 'Directo', stockUnits: 10 }] }
  data = openNightclubAccount(data, 'night-table-general-1', 'Mesero', '2026-09-25T21:00:00Z')
  const accountId = data.tables[0].activeAccountId!
  data = addNightclubRound(data, accountId, [{ productId: 'beer', quantity: 2 }], '2026-09-25T21:05:00Z')
  data = addNightclubRound(data, accountId, [{ productId: 'beer', quantity: 1 }], '2026-09-25T22:00:00Z')
  assert.equal(data.accounts.length, 1)
  assert.equal(data.accounts[0].rounds.length, 2)
  assert.equal(data.accounts[0].subtotal, 75)
  assert.equal(data.products[0].stockUnits, 7)
})

test('request, payment and release keep the same table/account identity', () => {
  let data = createNightclubDataset('full')
  const table = data.tables.find(item => item.activeAccountId)!
  const accountId = table.activeAccountId!
  data = requestNightclubBill(data, accountId)
  assert.equal(data.tables.find(item => item.id === table.id)?.status, 'bill_requested')
  data = closeNightclubAccount(data, accountId, '2026-09-25T23:30:00Z')
  assert.equal(data.accounts.find(item => item.id === accountId)?.status, 'closed')
  assert.equal(data.tables.find(item => item.id === table.id)?.status, 'available')
  assert.equal(data.tables.find(item => item.id === table.id)?.activeAccountId, undefined)
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
