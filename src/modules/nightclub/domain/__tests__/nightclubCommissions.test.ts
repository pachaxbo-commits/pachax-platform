/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
import assert from 'node:assert/strict'
import test from 'node:test'
import { createNightclubDataset } from '../../../../demo/datasets/nightclub/nightclubDatasets.ts'
import { advanceNightclubRound, deliverNightclubRound, openNightclubAccount, refundNightclubRound, sendNightclubRound, nightclubCashSummary, nightclubProfitSummary } from '../nightclubAccounts.ts'
import { nightclubCommissionSummary, payNightclubCommissions } from '../nightclubCommissions.ts'

const at = '2026-10-08T20:00:00Z'
function setup() {
  let data = createNightclubDataset('empty')
  data.shift = { id: 'shift-1', status: 'open', openedAt: at, openedBy: 'Caja', openingFloat: 100 }
  data.staff = [{ id: 'service-1', name: 'Ana', role: 'service', active: true }]
  data.inventory = [{ id: 'stock-1', name: 'Whisky', unit: 'unit', current: 4, minimum: 0, unitCost: 100 }]
  data.products = [{ id: 'bottle-1', name: 'Whisky - Botella', category: 'Licores', price: 300, preparationArea: 'Barra', stockUnits: 4, inventoryMode: 'unit', recipe: [{ inventoryId: 'stock-1', quantity: 1 }], commission: { enabled: true, type: 'percentage', value: 10 } }]
  data = openNightclubAccount(data, 'night-table-general-1', 'Ana', at)
  return { data, accountId: data.accounts[0].id }
}

test('comisión de botella se gana solo al entregar, se paga una vez y no duplica el gasto de utilidad', () => {
  const { data: initial, accountId } = setup()
  let data = sendNightclubRound(initial, accountId, [{ productId: 'bottle-1', quantity: 1 }], 'Caja', at, 'commission-order', null, 'service-1')
  const roundId = data.accounts[0].rounds[0].id
  // La cuenta puede cobrarse directamente para esta prueba: el pago total de la ronda es requisito de comisión.
  data.accounts[0].payments = [{ id: 'payment-1', roundId, method: 'cash', amount: 300, cashAmount: 300, qrAmount: 0, cardAmount: 0, received: 300, change: 0, paidAt: at, paidBy: 'Caja' }]
  data = advanceNightclubRound(data, accountId, roundId, 'Barra', at)
  data = advanceNightclubRound(data, accountId, roundId, 'Barra', at)
  data = deliverNightclubRound(data, accountId, roundId, 'Ana', at)
  assert.equal(data.commissions?.[0].status, 'earned')
  assert.equal(data.commissions?.[0].amount, 30)
  const paid = payNightclubCommissions(data, { staffId: 'service-1', amount: 30, method: 'cash', operationId: 'commission-payment' }, 'Admin', at)
  assert.equal(paid.commissions?.[0].status, 'paid')
  assert.equal(paid.cashMovements?.filter(item => item.commissionPaymentId).length, 1)
  assert.equal(payNightclubCommissions(paid, { staffId: 'service-1', amount: 30, method: 'cash', operationId: 'commission-payment' }, 'Admin', at), paid)
  assert.equal(nightclubProfitSummary(paid).commissions, 30)
  assert.equal(nightclubProfitSummary(paid).expenses, 0)
  assert.equal(nightclubCommissionSummary(paid, 'service-1').pending, 0)
  assert.equal(nightclubCashSummary(paid).expectedCash, 370)
})

test('reembolso invalida la comisión pendiente de una botella', () => {
  const { data: initial, accountId } = setup()
  let data = sendNightclubRound(initial, accountId, [{ productId: 'bottle-1', quantity: 1 }], 'Caja', at, 'refundable-order', null, 'service-1')
  const roundId = data.accounts[0].rounds[0].id
  data.accounts[0].rounds[0].authorization = 'payment'; data.accounts[0].rounds[0].paymentId = 'payment-2'
  data.accounts[0].payments = [{ id: 'payment-2', roundId, method: 'qr', amount: 300, cashAmount: 0, qrAmount: 300, cardAmount: 0, received: 0, change: 0, paidAt: at, paidBy: 'Caja' }]
  data = refundNightclubRound(data, accountId, roundId, 'Admin', 'Pedido duplicado', at)
  assert.equal(data.commissions?.[0]?.status, 'void')
})
