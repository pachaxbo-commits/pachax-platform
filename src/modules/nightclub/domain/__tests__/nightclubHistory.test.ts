/* eslint-disable @typescript-eslint/ban-ts-comment -- Node runs this test outside the browser project. */
// @ts-nocheck
import assert from 'node:assert/strict'
import test from 'node:test'
import { createNightclubDataset } from '../../../../demo/datasets/nightclub/nightclubDatasets.ts'
import { addNightclubCourtesy, addNightclubRound, applyNightclubDiscount, closeNightclubAccount, closeNightclubShift, openNightclubAccount, reopenNightclubBill, requestNightclubBill, reverseNightclubItem } from '../nightclubAccounts.ts'
import { nightclubAccountTimeline, selectNightclubHistory } from '../nightclubHistory.ts'

const filters = (shiftId: string) => ({ shiftId, from: '', to: '', query: '', table: '', waiter: '', product: '', category: '', paymentMethod: '', status: 'all', user: '' })

test('la jornada cruza medianoche con snapshots, pagos, cortesía y anulación auditables', () => {
  let data = createNightclubDataset('empty')
  data.shift = { id: 'turno-sabado', status: 'open', openedAt: '2026-09-26T20:00:00-04:00', openingFloat: 200, openedBy: 'Caja' }
  data.products = [
    { id: 'beer', name: 'Cerveza original', category: 'Cervezas', price: 25, preparationArea: 'Directo', stockUnits: 10, inventoryMode: 'unit', inventoryId: 'beer-stock', recipe: [{ inventoryId: 'beer-stock', quantity: 1 }] },
    { id: 'shot', name: 'Shot tequila', category: 'Shots', price: 20, preparationArea: 'Barra', stockUnits: 10, inventoryMode: 'unit', inventoryId: 'shot-stock', recipe: [{ inventoryId: 'shot-stock', quantity: 1 }] },
  ]
  data.inventory = [{ id: 'beer-stock', name: 'Cerveza', unit: 'unit', current: 10, minimum: 0 }, { id: 'shot-stock', name: 'Tequila', unit: 'unit', current: 10, minimum: 0 }]
  data = openNightclubAccount(data, 'night-table-general-1', 'Carlos', '2026-09-26T22:14:00-04:00')
  const id = data.tables[0].activeAccountId
  data = addNightclubRound(data, id, [{ productId: 'beer', quantity: 2 }], 'Carlos', '2026-09-26T22:17:00-04:00')
  data = addNightclubRound(data, id, [{ productId: 'shot', quantity: 1 }], 'Carlos', '2026-09-26T23:42:00-04:00')
  const shotRound = data.accounts[0].rounds[1]
  data = reverseNightclubItem(data, id, shotRound.id, shotRound.items[0].id, 'Administrador', 'Mesa equivocada', 'cancelled', '2026-09-26T23:45:00-04:00')
  assert.equal(data.inventory.find(item => item.id === 'shot-stock').current, 10)
  assert.throws(() => addNightclubCourtesy(data, id, [{ productId: 'shot', quantity: 2 }], 'Carlos', 'waiter', 'Invitado'), /administración/)
  data = addNightclubCourtesy(data, id, [{ productId: 'shot', quantity: 2 }], 'Administrador', 'admin', 'Invitado', '2026-09-27T00:15:00-04:00')
  assert.equal(data.inventory.find(item => item.id === 'shot-stock').current, 8)
  data = requestNightclubBill(data, id, 'Carlos', '2026-09-27T01:34:00-04:00')
  data = closeNightclubAccount(data, id, { method: 'qr', amount: 20 }, 'Caja', '2026-09-27T01:35:00-04:00')
  data = reopenNightclubBill(data, id, 'Caja', '2026-09-27T02:00:00-04:00')
  data = addNightclubRound(data, id, [{ productId: 'beer', quantity: 1 }], 'Carlos', '2026-09-27T02:12:00-04:00')
  data = requestNightclubBill(data, id, 'Carlos', '2026-09-27T03:45:00-04:00')
  data = closeNightclubAccount(data, id, { method: 'cash', amount: 55, received: 60 }, 'Administrador', '2026-09-27T03:46:00-04:00')
  assert.equal(data.accounts[0].status, 'closed')
  assert.equal(data.accounts[0].subtotal, 75)
  assert.equal(data.accounts[0].payments.length, 2)
  assert.equal(data.tables[0].status, 'available')
  data.products[0].name = 'Cerveza nueva'; data.products[0].price = 40
  const timeline = nightclubAccountTimeline(data.accounts[0], data)
  assert.equal(timeline.filter(entry => entry.type === 'payment').length, 2)
  assert.equal(timeline.find(entry => entry.type === 'sale' && entry.productId === 'beer').productName, 'Cerveza original')
  assert.equal(timeline.find(entry => entry.type === 'sale' && entry.productId === 'beer').unitPrice, 25)
  assert.ok(timeline.some(entry => entry.type === 'cancelled' && entry.reason === 'Mesa equivocada'))
  assert.ok(timeline.some(entry => entry.type === 'courtesy' && entry.commercialValue === 40))
  assert.ok(timeline.some(entry => entry.type === 'reopened'))
  const opened = new Date(data.shift.openedAt)
  const businessDate = `${opened.getFullYear()}-${String(opened.getMonth() + 1).padStart(2, '0')}-${String(opened.getDate()).padStart(2, '0')}`
  const selected = selectNightclubHistory(data, { ...filters('turno-sabado'), from: businessDate, to: businessDate })
  assert.equal(selected.accounts.length, 1)
  assert.equal(selected.summary.salesTotal, 75)
  assert.equal(selected.summary.courtesyValue, 40)
  assert.equal(selected.summary.cancelledValue, 20)
  assert.equal(selected.summary.productsSold, 3)
  assert.equal(selected.productLocations.find(item => item.productId === 'beer').quantity, 3)
  assert.equal(selectNightclubHistory(data, { ...filters('turno-sabado'), product: 'shot' }).accounts.length, 1)
  assert.equal(selectNightclubHistory(data, { ...filters('turno-sabado'), paymentMethod: 'qr' }).accounts.length, 1)
  assert.equal(selectNightclubHistory(data, filters('turno-sabado'), { role: 'waiter', actor: 'Otro mesero' }).accounts.length, 0)
  data = closeNightclubShift(data, 'Caja', 255, '2026-09-27T05:00:00-04:00')
  data = { ...data, shiftHistory: [data.shift], shift: { id: 'turno-domingo', status: 'open', openedAt: '2026-09-27T20:00:00-04:00', openingFloat: 0, openedBy: 'Caja' } }
  assert.equal(selectNightclubHistory(data, filters('turno-sabado')).accounts.length, 1)
  assert.equal(selectNightclubHistory(data, filters('turno-domingo')).accounts.length, 0)
})

test('venta directa en barra no ocupa mesa y aparece por producto', () => {
  let data = createNightclubDataset('full')
  const occupiedBefore = data.tables.filter(table => table.activeAccountId).length
  data = openNightclubAccount(data, { type: 'bar' }, 'Carlos')
  const account = data.accounts.at(-1)
  data = addNightclubRound(data, account.id, [{ productId: 'beer-1', quantity: 2 }], 'Carlos')
  data = requestNightclubBill(data, account.id, 'Carlos')
  data = closeNightclubAccount(data, account.id, { method: 'qr' }, 'Caja')
  assert.equal(data.tables.filter(table => table.activeAccountId).length, occupiedBefore)
  const selected = selectNightclubHistory(data, filters(data.shift.id))
  assert.ok(selected.accounts.some(row => row.account.id === account.id && row.label === 'Venta directa en barra'))
  assert.ok(selected.productLocations.find(item => item.productId === 'beer-1').places.some(place => place.label === 'Venta directa en barra' && place.quantity === 2))
})

test('descuento autorizado conserva motivo, actor y total histórico', () => {
  let data = createNightclubDataset('full')
  data = openNightclubAccount(data, { type: 'bar' }, 'Carlos')
  const id = data.accounts.at(-1).id
  data = addNightclubRound(data, id, [{ productId: 'beer-1', quantity: 2 }], 'Carlos')
  const original = data.accounts.at(-1).subtotal
  assert.throws(() => applyNightclubDiscount(data, id, 5, 'Promoción', 'Carlos', 'waiter'), /administración/)
  data = applyNightclubDiscount(data, id, 5, 'Promoción', 'Administrador', 'admin', '2026-09-27T01:00:00-04:00')
  assert.equal(data.accounts.at(-1).subtotal, original - 5)
  const selected = selectNightclubHistory(data, filters(data.shift.id))
  assert.equal(selected.summary.discountValue, 5)
  assert.ok(selected.accounts.find(row => row.account.id === id).entries.some(entry => entry.type === 'discount' && entry.reason === 'Promoción' && entry.actor === 'Administrador'))
})
