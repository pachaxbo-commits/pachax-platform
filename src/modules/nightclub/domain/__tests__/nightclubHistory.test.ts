/* eslint-disable @typescript-eslint/ban-ts-comment -- Node runs this test outside the browser project. */
// @ts-nocheck
import assert from 'node:assert/strict'
import test from 'node:test'
import { createNightclubDataset } from '../../../../demo/datasets/nightclub/nightclubDatasets.ts'
import { openNightclubAccount, refundNightclubRound, settleNightclubRound } from '../nightclubAccounts.ts'
import { registerNightclubCourtesy } from '../nightclubCourtesies.ts'
import { nightclubAccountTimeline, selectNightclubHistory } from '../nightclubHistory.ts'

const filters = (shiftId: string) => ({ shiftId, from: '', to: '', query: '', table: '', waiter: '', product: '', category: '', paymentMethod: '', status: 'all', user: '' })
const saturday = '2026-09-26T22:00:00-04:00'
function setup() {
  let data = createNightclubDataset('empty')
  data.shift = { id: 'turno-sabado', status: 'open', openedAt: '2026-09-26T20:00:00-04:00', openingFloat: 200, openedBy: 'Caja' }
  data.products = [
    { id: 'beer', name: 'Cerveza original', category: 'Cervezas', price: 25, preparationArea: 'Directo', stockUnits: 10, inventoryMode: 'unit', recipe: [{ inventoryId: 'beer-stock', quantity: 1 }] },
    { id: 'ron', name: 'Ron', category: 'Botellas', price: 300, preparationArea: 'Barra', stockUnits: 10, inventoryMode: 'unit', recipe: [{ inventoryId: 'ron-stock', quantity: 1 }] },
  ]
  data.inventory = [{ id: 'beer-stock', name: 'Cerveza', unit: 'unit', current: 10, minimum: 0 }, { id: 'ron-stock', name: 'Ron', unit: 'unit', current: 10, minimum: 0 }]
  data.members = [{ id: 'socio', name: 'Socio', active: true, quota: 2, policy: { anchorAt: saturday, repeatDays: 7, windowDays: 7 } }]
  data = openNightclubAccount(data, 'night-table-general-1', 'Mesero', saturday)
  return { data, id: data.accounts[0].id }
}

test('historial usa fecha de jornada, snapshots, pagos previos y cortesías separadas de ventas', () => {
  const { data: initial, id } = setup()
  let data = settleNightclubRound(initial, id, [{ productId: 'beer', quantity: 2 }], { method: 'qr' }, 'Mesero', '2026-09-26T23:00:00-04:00', 'pago-qr')
  data = settleNightclubRound(data, id, [{ productId: 'beer', quantity: 1 }], { method: 'cash', received: 30 }, 'Mesero', '2026-09-27T01:00:00-04:00', 'pago-efectivo')
  data = registerNightclubCourtesy(data, { memberId: 'socio', productId: 'ron', quantity: 1, accountId: id }, 'Administrador', '2026-09-27T01:20:00-04:00')
  data.products[0].name = 'Nombre nuevo'; data.products[0].price = 40
  const timeline = nightclubAccountTimeline(data.accounts[0], data)
  assert.equal(timeline.filter(entry => entry.type === 'payment').length, 2)
  assert.equal(timeline.find(entry => entry.type === 'sale').productName, 'Cerveza original')
  assert.equal(timeline.find(entry => entry.type === 'sale').unitPrice, 25)
  assert.ok(timeline.some(entry => entry.type === 'courtesy' && entry.commercialValue === 300))
  const result = selectNightclubHistory(data, { ...filters('turno-sabado'), from: '2026-09-26', to: '2026-09-26' })
  assert.equal(result.accounts.length, 1)
  assert.equal(result.summary.salesTotal, 75)
  assert.equal(result.summary.courtesyValue, 300)
  assert.equal(result.summary.productsSold, 3)
  assert.equal(result.productLocations.find(item => item.productId === 'beer').quantity, 3)
  assert.equal(selectNightclubHistory(data, { ...filters('turno-sabado'), paymentMethod: 'qr' }).accounts.length, 1)
  assert.equal(selectNightclubHistory(data, { ...filters('turno-sabado'), status: 'courtesy' }).accounts.length, 1)
  assert.equal(selectNightclubHistory(data, filters('turno-sabado'), { role: 'waiter', actor: 'Otro mesero' }).accounts.length, 0)
  assert.equal(selectNightclubHistory(data, { ...filters('turno-sabado'), from: '2026-09-27' }).accounts.length, 0)
})

test('reembolso de ronda no entregada conserva trazabilidad y excluye venta del resumen', () => {
  const { data: initial, id } = setup()
  let data = settleNightclubRound(initial, id, [{ productId: 'ron', quantity: 1 }], { method: 'qr' }, 'Mesero', saturday, 'ronda-ron')
  const roundId = data.accounts[0].rounds[0].id
  data = refundNightclubRound(data, id, roundId, 'Administrador', 'Pedido duplicado', '2026-09-26T22:10:00-04:00')
  const timeline = nightclubAccountTimeline(data.accounts[0], data)
  assert.ok(timeline.some(entry => entry.type === 'cancelled' && entry.reason === 'Pedido duplicado'))
  assert.ok(timeline.some(entry => entry.type === 'refund' && entry.amount === 300))
  const result = selectNightclubHistory(data, { ...filters('turno-sabado'), status: 'cancelled' })
  assert.equal(result.summary.salesTotal, 0)
  assert.equal(result.summary.productsSold, 0)
  assert.equal(result.summary.cancelledValue, 300)
  assert.equal(data.inventory.find(item => item.id === 'ron-stock').current, 10)
})

test('pedido en barra pagado aparece en historial sin ocupar mesa', () => {
  const { data: initial } = setup()
  const occupiedBefore = initial.tables.filter(table => table.activeAccountId).length
  let data = openNightclubAccount(initial, { type: 'customer', displayName: 'Lucía' }, 'Mesero', saturday)
  const id = data.accounts.at(-1).id
  data = settleNightclubRound(data, id, [{ productId: 'beer', quantity: 2 }], { method: 'cash' }, 'Mesero', saturday, 'pedido-barra')
  assert.equal(data.tables.filter(table => table.activeAccountId).length, occupiedBefore)
  const result = selectNightclubHistory(data, filters('turno-sabado'))
  assert.ok(result.accounts.some(row => row.account.id === id && row.label === 'Pedido en Barra – Lucía'))
  assert.ok(result.productLocations.find(item => item.productId === 'beer').places.some(place => place.label === 'Pedido en Barra – Lucía' && place.quantity === 2))
})
