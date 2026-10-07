/* eslint-disable @typescript-eslint/ban-ts-comment -- Node runs TypeScript outside the browser project. */
// @ts-nocheck
import assert from 'node:assert/strict'
import test from 'node:test'
import { createNightclubDataset } from '../../../../demo/datasets/nightclub/nightclubDatasets.ts'
import { advanceNightclubRound, deliverNightclubRound, finishNightclubOccupancy, nightclubAccountLabel, nightclubBalance, nightclubCashSummary, openNightclubAccount, openNightclubBottle, refundNightclubRound, settleNightclubRound } from '../nightclubAccounts.ts'
import { registerNightclubCourtesy } from '../nightclubCourtesies.ts'

const at = '2026-09-25T22:00:00Z'
function setup() {
  let data = createNightclubDataset('empty')
  data.shift = { id: 'shift', status: 'open', openedAt: at, openedBy: 'Caja', openingFloat: 0 }
  data.products = [
    { id: 'ron', name: 'Ron', category: 'Botellas', price: 300, preparationArea: 'Barra', stockUnits: 10, inventoryMode: 'unit', recipe: [{ inventoryId: 'ron-stock', quantity: 1 }] },
    { id: 'beer', name: 'Cerveza', category: 'Cervezas', price: 25, preparationArea: 'Directo', stockUnits: 20, inventoryMode: 'unit', recipe: [{ inventoryId: 'beer-stock', quantity: 1 }] },
  ]
  data.inventory = [{ id: 'ron-stock', name: 'Ron', unit: 'unit', current: 10, minimum: 0 }, { id: 'beer-stock', name: 'Cerveza', unit: 'unit', current: 20, minimum: 0 }]
  data.members = [{ id: 'carlos', name: 'Carlos', active: true, quota: 3, policy: { anchorAt: at, repeatDays: 7, windowDays: 7 } }]
  data = openNightclubAccount(data, 'night-table-general-1', 'Mesero', at)
  return { data, id: data.accounts[0].id }
}

test('venta QR: pago, caja, stock y comanda se confirman juntos; mesa sigue ocupada', () => {
  const { data, id } = setup()
  const next = settleNightclubRound(data, id, [{ productId: 'ron', quantity: 1 }], { method: 'qr' }, 'Mesero', at, 'op-1')
  assert.equal(data.inventory[0].current, 10)
  assert.equal(next.inventory[0].current, 9)
  assert.equal(next.accounts[0].rounds[0].authorization, 'payment')
  assert.equal(next.accounts[0].rounds[0].status, 'pending')
  assert.equal(next.accounts[0].payments[0].roundId, next.accounts[0].rounds[0].id)
  assert.equal(nightclubCashSummary(next).qrSales, 300)
  assert.equal(next.tables[0].status, 'occupied')
})

test('segunda ronda conserva pago y pedido independientes', () => {
  const { data: initial, id } = setup()
  let data = initial
  data = settleNightclubRound(data, id, [{ productId: 'ron', quantity: 1 }], { method: 'qr' }, 'Mesero', at, 'op-1')
  data = settleNightclubRound(data, id, [{ productId: 'beer', quantity: 4 }], { method: 'cash', received: 150 }, 'Mesero', at, 'op-2')
  assert.equal(data.accounts[0].rounds.length, 2)
  assert.equal(data.accounts[0].payments.length, 2)
  assert.equal(data.accounts[0].payments[1].change, 50)
  assert.equal(nightclubCashSummary(data).cashSales, 100)
  assert.equal(nightclubBalance(data.accounts[0]), 0)
})

test('pedido en barra sin nombre se cobra sin crear cliente; nombre opcional se conserva', () => {
  const { data: initial, id: tableAccountId } = setup()
  let data = openNightclubAccount(initial, { type: 'customer', displayName: '' }, 'Mesero', at)
  const anonymous = data.accounts.at(-1)
  assert.equal(anonymous.customerId, undefined)
  assert.equal(anonymous.customerDisplayName, undefined)
  assert.equal(nightclubAccountLabel(anonymous, data), 'Venta rápida – Barra')
  assert.equal(data.customers.length, initial.customers.length)
  data = settleNightclubRound(data, anonymous.id, [{ productId: 'beer', quantity: 1 }], { method: 'cash' }, 'Mesero', at, 'bar-cash')
  assert.equal(data.accounts.at(-1).payments[0].amount, 25)
  assert.equal(data.accounts.at(-1).rounds[0].authorization, 'payment')
  assert.equal(nightclubCashSummary(data).cashSales, 25)
  assert.equal(data.inventory.find(item => item.id === 'beer-stock').current, 19)

  data = openNightclubAccount(data, { type: 'customer', displayName: 'Juan' }, 'Mesero', at)
  const named = data.accounts.at(-1)
  assert.equal(named.customerDisplayName, 'Juan')
  assert.equal(nightclubAccountLabel(named, data), 'Pedido en Barra – Juan')
  data = settleNightclubRound(data, named.id, [{ productId: 'ron', quantity: 1 }], { method: 'qr' }, 'Mesero', at, 'bar-qr')
  assert.equal(data.accounts.at(-1).rounds[0].status, 'pending')
  assert.equal(nightclubCashSummary(data).qrSales, 300)
  assert.equal(data.accounts.find(account => account.id === tableAccountId).rounds.length, 0)
  assert.equal(data.tables[0].status, 'occupied')
})

test('cambiar de mesa a BAR conserva cuentas independientes y no hereda cliente', () => {
  const { data: initial, id: tableAccountId } = setup()
  const tableBefore = initial.tables[0].activeAccountId
  let data = openNightclubAccount(initial, { type: 'bar', displayName: 'Carlos' }, 'Mesero', at)
  const named = data.accounts.at(-1)
  assert.equal(named.orderType, 'BAR')
  assert.equal(named.tableId, undefined)
  assert.equal(named.serviceTarget.type, 'bar')
  data = settleNightclubRound(data, named.id, [{ productId: 'beer', quantity: 1 }], { method: 'qr' }, 'Mesero', at, 'direct-1')
  data = openNightclubAccount(data, { type: 'bar' }, 'Mesero', at)
  const quick = data.accounts.at(-1)
  assert.equal(nightclubAccountLabel(quick, data), 'Venta rápida – Barra')
  assert.equal(quick.customerDisplayName, undefined)
  data = settleNightclubRound(data, quick.id, [{ productId: 'beer', quantity: 1 }], { method: 'cash' }, 'Mesero', at, 'direct-2')
  assert.equal(data.accounts.find(account => account.id === tableAccountId).rounds.length, 0)
  assert.equal(data.tables[0].activeAccountId, tableBefore)
  assert.equal(data.inventory.find(item => item.id === 'beer-stock').current, 18)
  assert.equal(nightclubCashSummary(data).totalSales, 50)
  assert.equal(data.customers.length, initial.customers.length)
  assert.throws(() => openNightclubAccount(data, { type: 'bar', tableId: data.tables[0].id }, 'Mesero', at), /no puede tener mesa/)
})

test('borrador sin pago no crea venta, comanda ni movimiento', () => {
  const { data } = setup()
  const draft = [{ productId: 'ron', quantity: 1 }]
  draft[0].quantity = 2
  draft.pop()
  assert.equal(data.accounts[0].rounds.length, 0)
  assert.equal(data.inventoryMovements.length, 0)
  assert.equal(nightclubCashSummary(data).totalSales, 0)
})

test('cortesía válida autoriza Barra, consume cupo y stock sin tocar Caja', () => {
  const { data, id } = setup()
  const next = registerNightclubCourtesy(data, { memberId: 'carlos', productId: 'ron', quantity: 1, accountId: id }, 'Mesero', at)
  assert.equal(next.accounts[0].rounds[0].authorization, 'courtesy')
  assert.equal(next.accounts[0].rounds[0].status, 'pending')
  assert.equal(next.inventory[0].current, 9)
  assert.equal(next.courtesies[0].quantity, 1)
  assert.equal(nightclubCashSummary(next).totalSales, 0)
})

test('reintento del mismo operationId no duplica pago, pedido ni inventario', () => {
  const { data: initial, id } = setup()
  let data = initial
  data = settleNightclubRound(data, id, [{ productId: 'ron', quantity: 1 }], { method: 'qr' }, 'Mesero', at, 'op-1')
  const once = data
  data = settleNightclubRound(data, id, [{ productId: 'ron', quantity: 1 }], { method: 'qr' }, 'Mesero', at, 'op-1')
  assert.equal(data, once)
  assert.equal(data.inventoryMovements.length, 1)
  assert.equal(data.accounts[0].payments.length, 1)
})

test('Barra prepara y marca listo; Servicio entrega', () => {
  const { data: initial, id } = setup()
  let data = initial
  data = settleNightclubRound(data, id, [{ productId: 'ron', quantity: 1 }], { method: 'qr' }, 'Mesero', at, 'op-1')
  const roundId = data.accounts[0].rounds[0].id
  assert.throws(() => deliverNightclubRound(data, id, roundId, 'Mesero'), /todavía no/)
  data = advanceNightclubRound(data, id, roundId, 'Barra')
  data = advanceNightclubRound(data, id, roundId, 'Barra')
  assert.equal(data.accounts[0].rounds[0].status, 'ready')
  data = deliverNightclubRound(data, id, roundId, 'Mesero')
  assert.equal(data.accounts[0].rounds[0].deliveredBy, 'Mesero')
  assert.equal(data.accounts[0].rounds[0].status, 'delivered')
})

test('finalizar ocupación no vuelve a cobrar y conserva historial', () => {
  const { data: initial, id } = setup()
  let data = initial
  for (let i = 0; i < 3; i++) {
    data = settleNightclubRound(data, id, [{ productId: 'beer', quantity: 1 }], { method: 'cash' }, 'Mesero', at, `op-${i}`)
    data = deliverNightclubRound(data, id, data.accounts[0].rounds.at(-1).id, 'Mesero')
  }
  const sales = nightclubCashSummary(data).totalSales
  data = finishNightclubOccupancy(data, id, 'Mesero')
  assert.equal(data.tables[0].status, 'available')
  assert.equal(data.accounts[0].status, 'closed')
  assert.equal(data.accounts[0].rounds.length, 3)
  assert.equal(nightclubCashSummary(data).totalSales, sales)
})

test('reembolso antes de entrega deja auditoría y revierte pago y stock', () => {
  const { data: initial, id } = setup()
  let data = initial
  data = settleNightclubRound(data, id, [{ productId: 'ron', quantity: 1 }], { method: 'qr' }, 'Mesero', at, 'op-1')
  const roundId = data.accounts[0].rounds[0].id
  assert.throws(() => refundNightclubRound(data, id, roundId, 'Admin', 'x'), /motivo/)
  data = refundNightclubRound(data, id, roundId, 'Admin', 'Error de pedido')
  assert.equal(data.accounts[0].payments[0].status, 'refunded')
  assert.equal(data.accounts[0].rounds[0].status, 'cancelled')
  assert.equal(data.inventory[0].current, 10)
  assert.equal(nightclubCashSummary(data).totalSales, 0)
  assert.ok(data.audit.some(event => event.type === 'round_refunded'))
})

test('licor por vaso abre botella automáticamente y no duplica el descuento', () => {
  const { data: initial, id } = setup()
  initial.inventory = [{ id: 'ron-stock', name: 'Ron Abuelo', unit: 'unit', current: 30, minimum: 1, bottleCapacityMl: 750, openBottleMl: 0 }]
  initial.products = [{ id: 'ron-vaso', name: 'Ron Abuelo - Vaso', category: 'Licores', price: 25, preparationArea: 'Barra', stockUnits: 450, inventoryMode: 'recipe', recipe: [], bottlePresentation: { inventoryId: 'ron-stock', kind: 'pour', millilitres: 50 } }]
  const first = settleNightclubRound(initial, id, [{ productId: 'ron-vaso', quantity: 1 }], { method: 'qr' }, 'Mesero', at, 'pour-1')
  assert.equal(first.inventory[0].current, 29)
  assert.equal(first.inventory[0].openBottleMl, 700)
  assert.equal(first.inventoryMovements.filter(item => item.type === 'bottle_opened').length, 1)
  const repeated = settleNightclubRound(first, id, [{ productId: 'ron-vaso', quantity: 1 }], { method: 'qr' }, 'Mesero', at, 'pour-1')
  assert.equal(repeated, first)
  const low = structuredClone(first); low.inventory[0].openBottleMl = 20
  const next = settleNightclubRound(low, id, [{ productId: 'ron-vaso', quantity: 1 }], { method: 'qr' }, 'Mesero', at, 'pour-2')
  assert.equal(next.inventory[0].current, 28)
  assert.equal(next.inventory[0].openBottleMl, 720)
  const manual = openNightclubBottle(structuredClone(initial), 'ron-stock', 'Barra', at)
  assert.equal(manual.inventory[0].current, 29)
  assert.equal(manual.inventory[0].openBottleMl, 750)
})


test('refresco de 2 L guarda 2000 ml y descuenta jarras y recetas en ml', () => {
  const { data: initial, id } = setup()
  initial.inventory = [{ id: 'coca-stock', name: 'Coca-Cola 2L', unit: 'unit', current: 100, minimum: 1, bottleCapacityMl: 2 * 1000, openBottleMl: 0 }]
  initial.products = [
    { id: 'coca-jarra', name: 'Coca-Cola - Jarra', category: 'Refrescos', price: 20, preparationArea: 'Barra', stockUnits: 400, inventoryMode: 'recipe', recipe: [], bottlePresentation: { inventoryId: 'coca-stock', kind: 'pour', millilitres: 500 } },
    { id: 'coca-receta', name: 'Mezcla con Coca-Cola', category: 'Cocteles', price: 30, preparationArea: 'Barra', stockUnits: 1, inventoryMode: 'recipe', recipe: [{ inventoryId: 'coca-stock', quantity: 150, unit: 'ml' }] },
  ]
  const afterJar = settleNightclubRound(initial, id, [{ productId: 'coca-jarra', quantity: 1 }], { method: 'qr' }, 'Barra', at, 'coca-jarra-1')
  assert.equal(afterJar.inventory[0].bottleCapacityMl, 2000)
  assert.equal(afterJar.inventory[0].current, 99)
  assert.equal(afterJar.inventory[0].openBottleMl, 1500)
  const opened = afterJar.inventoryMovements.find(item => item.type === 'bottle_opened')
  const poured = afterJar.inventoryMovements.find(item => item.type === 'pour')
  assert.deepEqual([opened?.previous, opened?.current, opened?.openBottleMlBefore, opened?.openBottleMlAfter], [100, 99, 0, 2000])
  assert.deepEqual([poured?.previous, poured?.current, poured?.openBottleMlBefore, poured?.openBottleMlAfter], [99, 99, 0, 1500])
  const secondJar = settleNightclubRound(afterJar, id, [{ productId: 'coca-jarra', quantity: 1 }], { method: 'qr' }, 'Barra', at, 'coca-jarra-2')
  assert.equal(secondJar.inventory[0].current, 99)
  assert.equal(secondJar.inventory[0].openBottleMl, 1000)
  const afterRecipe = settleNightclubRound(secondJar, id, [{ productId: 'coca-receta', quantity: 1 }], { method: 'qr' }, 'Barra', at, 'coca-receta-1')
  assert.equal(afterRecipe.inventory[0].current, 99)
  assert.equal(afterRecipe.inventory[0].openBottleMl, 850)
})
