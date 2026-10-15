// @ts-expect-error Node test types are intentionally absent from the browser tsconfig.
import assert from 'node:assert/strict'
// @ts-expect-error Node test types are intentionally absent from the browser tsconfig.
import test from 'node:test'
import { createNightclubDataset } from '../../../../demo/datasets/nightclub/nightclubDatasets.ts'
import { nightclubLoyaltyReport } from '../nightclubLoyalty.ts'
import { cancelNightclubRound, deliverNightclubRound, exchangeNightclubPaidProduct, nightclubCustomerPaidSummary, openNightclubAccount, recordNightclubPayment, requestNightclubBill, sendNightclubRound, settleNightclubRound } from '../nightclubAccounts.ts'

const at = '2026-10-07T21:00:00Z'
const line = [{ productId: 'beer', quantity: 1 }]
function setup(destination: 'table' | 'bar') {
  let data = createNightclubDataset('empty')
  data.shift = { id: 'shift', status: 'open', openedAt: at, openedBy: 'Caja', openingFloat: 200 }
  data.customers = [
    { id: 'ana', name: 'Ana', phone: '70000111', visits: 0, totalSpent: 0, active: true },
    { id: 'beto', name: 'Beto', phone: '70000222', visits: 0, totalSpent: 0, active: true },
  ]
  data.products = [{ id: 'beer', name: 'Cerveza', category: 'Bebidas', price: 25, preparationArea: 'Directo', stockUnits: 10, inventoryMode: 'unit', recipe: [{ inventoryId: 'stock', quantity: 1 }] }]
  data.inventory = [{ id: 'stock', name: 'Cerveza', unit: 'unit', current: 10, minimum: 0 }]
  if (destination === 'table') {
    data.zones = [{ id: 'zone', name: 'General', sortOrder: 0 }]
    data.tables = [{ id: 'table', zoneId: 'zone', name: 'Mesa 1', capacity: 4, status: 'available' }]
  }
  data = openNightclubAccount(data, destination === 'table' ? { type: 'table', tableId: 'table' } : { type: 'bar', customerId: 'ana' }, 'Servicio', at)
  return { data, accountId: data.accounts[0].id }
}
const summary = (data: ReturnType<typeof setup>['data'], id: string) => nightclubCustomerPaidSummary(data, id)

test('Mesa: tres rondas de dos clientes y una anónima, pagos parciales y persistencia', () => {
  const { data: initial, accountId } = setup('table')
  let data = sendNightclubRound(initial, accountId, line, 'Servicio', at, 'round-a', 'ana')
  data = sendNightclubRound(data, accountId, line, 'Servicio', at, 'round-b', 'beto')
  assert.throws(() => sendNightclubRound(data, accountId, line, 'Servicio', at, 'round-b', 'ana'), /otro destino o cliente/)
  data = sendNightclubRound(data, accountId, line, 'Servicio', at, 'round-anon', null)
  assert.deepEqual(data.accounts[0].rounds.map(round => round.customerId), ['ana', 'beto', null])
  assert.equal(summary(data, 'ana').spent, 0)
  assert.equal(summary(data, 'beto').spent, 0)
  for (const round of data.accounts[0].rounds) data = deliverNightclubRound(data, accountId, round.id, 'Servicio', at)
  data = requestNightclubBill(data, accountId, 'Servicio', at)
  data = recordNightclubPayment(data, accountId, { method: 'cash', amount: 30, received: 40, operationId: 'pay-1' }, 'Caja', at)
  assert.deepEqual(data.accounts[0].payments?.[0].allocations?.map(item => [item.customerId, item.amount]), [['ana', 25], ['beto', 5]])
  assert.deepEqual(summary(data, 'ana'), { visits: 1, spent: 25 })
  assert.deepEqual(summary(data, 'beto'), { visits: 1, spent: 5 })
  assert.equal(recordNightclubPayment(data, accountId, { method: 'cash', amount: 30, operationId: 'pay-1' }, 'Caja', at), data)
  data = recordNightclubPayment(data, accountId, { method: 'qr', amount: 45, operationId: 'pay-2' }, 'Caja', at)
  assert.deepEqual(data.accounts[0].payments?.[1].allocations?.map(item => [item.customerId, item.amount]), [['beto', 20], [null, 25]])
  assert.equal(summary(data, 'ana').spent, 25)
  assert.equal(summary(data, 'beto').spent, 25)
  assert.equal(data.accounts[0].status, 'closed')
  const restored = JSON.parse(JSON.stringify(data)) as typeof data
  restored.customers[0].name = 'Ana editada'
  assert.equal(restored.accounts[0].rounds[0].customerNameSnapshot, 'Ana')
  assert.deepEqual(summary(restored, 'beto'), { visits: 1, spent: 25 })
})

test('Barra: el cliente de la cuenta no se atribuye automáticamente a cada pedido', () => {
  const { data: initial, accountId } = setup('bar')
  let data = sendNightclubRound(initial, accountId, line, 'Servicio', at, 'bar-beto', 'beto')
  data = sendNightclubRound(data, accountId, line, 'Servicio', at, 'bar-anon', null)
  assert.equal(data.accounts[0].customerId, 'ana')
  for (const round of data.accounts[0].rounds) data = deliverNightclubRound(data, accountId, round.id, 'Servicio', at)
  data = requestNightclubBill(data, accountId, 'Servicio', at)
  data = recordNightclubPayment(data, accountId, { method: 'qr', amount: 50, operationId: 'bar-pay' }, 'Caja', at)
  assert.equal(summary(data, 'ana').spent, 0)
  assert.equal(summary(data, 'beto').spent, 25)
  assert.deepEqual(data.accounts[0].payments?.[0].allocations?.map(item => item.customerId), ['beto', null])
})

test('Ronda cancelada e ID de cliente inválido nunca generan consumo atribuido', () => {
  const { data: initial, accountId } = setup('table')
  assert.throws(() => sendNightclubRound(initial, accountId, line, 'Servicio', at, 'bad', 'missing'), /cliente registrado/)
  let data = sendNightclubRound(initial, accountId, line, 'Servicio', at, 'keep', 'ana')
  data = sendNightclubRound(data, accountId, line, 'Servicio', at, 'cancel', 'beto')
  data = cancelNightclubRound(data, accountId, data.accounts[0].rounds[1].id, 'Servicio', 'No solicitado', at)
  data = deliverNightclubRound(data, accountId, data.accounts[0].rounds[0].id, 'Servicio', at)
  data = requestNightclubBill(data, accountId, 'Servicio', at)
  data = recordNightclubPayment(data, accountId, { method: 'cash', amount: 25, received: 25 }, 'Caja', at)
  assert.equal(summary(data, 'ana').spent, 25)
  assert.equal(summary(data, 'beto').spent, 0)
  assert.equal(data.accounts[0].payments?.[0].allocations?.length, 1)
})

test('un cambio pagado conserva el cliente y ajusta su consumo por diferencia', () => {
  const { data: initial, accountId } = setup('bar')
  initial.products.push({ id: 'premium', name: 'Premium', category: 'Bebidas', price: 35, preparationArea: 'Directo', stockUnits: 10, inventoryMode: 'unit', recipe: [{ inventoryId: 'premium-stock', quantity: 1 }] })
  initial.products.push({ id: 'simple', name: 'Simple', category: 'Bebidas', price: 20, preparationArea: 'Directo', stockUnits: 10, inventoryMode: 'unit', recipe: [{ inventoryId: 'simple-stock', quantity: 1 }] })
  initial.inventory.push({ id: 'premium-stock', name: 'Premium', unit: 'unit', current: 10, minimum: 0 })
  initial.inventory.push({ id: 'simple-stock', name: 'Simple', unit: 'unit', current: 10, minimum: 0 })
  const paid = settleNightclubRound(initial, accountId, line, { method: 'cash', received: 25 }, 'Caja', at, 'paid-original')
  const source = paid.accounts[0].rounds[0]
  const exchange = (replacementProductId: string, extra: boolean) => exchangeNightclubPaidProduct(paid, {
    operationId: 'exchange-' + replacementProductId, accountId, roundId: source.id, itemId: source.items[0].id,
    quantity: 1, replacementProductId, reason: 'Cambio solicitado', preparedTreatment: 'recoverable',
    ...(extra ? { additionalPayment: { method: 'qr' as const, amount: 10 } } : { lowerSettlement: 'cash_refund' as const }),
  }, 'admin', at)
  const higher = exchange('premium', true)
  assert.equal(higher.accounts[0].rounds.at(-1)?.customerId, 'ana')
  assert.equal(summary(higher, 'ana').spent, 35)
  assert.equal(nightclubLoyaltyReport(higher, 2026, 10)[0].monthSpent, 35)
  const lower = exchange('simple', false)
  assert.equal(lower.accounts[0].rounds.at(-1)?.customerId, 'ana')
  assert.equal(summary(lower, 'ana').spent, 20)
  assert.equal(nightclubLoyaltyReport(lower, 2026, 10)[0].monthSpent, 20)
})
