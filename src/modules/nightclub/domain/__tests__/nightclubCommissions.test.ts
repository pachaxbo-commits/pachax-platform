/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
import assert from 'node:assert/strict'
import test from 'node:test'
import { createNightclubDataset } from '../../../../demo/datasets/nightclub/nightclubDatasets.ts'
import { advanceNightclubRound, deliverNightclubRound, openNightclubAccount, recordNightclubPayment, refundNightclubRound, requestNightclubBill, sendNightclubRound, settleNightclubRound, nightclubCashSummary, nightclubProfitSummary } from '../nightclubAccounts.ts'
import { nightclubCommissionSummary, payNightclubCommissions, synchronizeNightclubCommissions } from '../nightclubCommissions.ts'

const at = '2026-10-08T20:00:00Z'
function setup() {
  let data = createNightclubDataset('empty')
  data.shift = { id: 'shift-1', status: 'open', openedAt: at, openedBy: 'Caja', openingFloat: 100 }
  data.staff = [
    { id: 'waiter-marco', name: 'Marco', role: 'waiter', active: true },
    { id: 'waiter-valeria', name: 'Valeria', role: 'waiter', active: true },
    { id: 'service-ana', name: 'Ana', role: 'service', active: true },
  ]
  data.inventory = [{ id: 'stock-1', name: 'Whisky', unit: 'unit', current: 8, minimum: 0, unitCost: 100 }]
  data.products = [{ id: 'bottle-1', name: 'Whisky - Botella', category: 'Licores', price: 300, preparationArea: 'Barra', stockUnits: 8, inventoryMode: 'unit', recipe: [{ inventoryId: 'stock-1', quantity: 1 }], commission: { enabled: true, type: 'percentage', value: 10 } }]
  data = openNightclubAccount(data, 'night-table-general-1', 'Caja', at)
  return { data, accountId: data.accounts[0].id }
}
function confirmPayment(data, roundId, amount = 300) {
  data.accounts[0].payments = [{ id: 'payment-1', roundId, method: 'cash', amount, cashAmount: amount, qrAmount: 0, cardAmount: 0, received: amount, change: 0, paidAt: at, paidBy: 'Caja', status: 'confirmed' }]
  return synchronizeNightclubCommissions(data, at)
}

test('la comisión se acredita al mesero vendedor solo cuando la venta está pagada; entrega ajena no cambia titular', () => {
  const { data: initial, accountId } = setup()
  let data = sendNightclubRound(initial, accountId, [{ productId: 'bottle-1', quantity: 1 }], 'Caja', at, 'commission-order', null, 'waiter-marco')
  const roundId = data.accounts[0].rounds[0].id
  assert.equal(data.accounts[0].rounds[0].sellerStaffId, 'waiter-marco')
  assert.equal(data.commissions?.length || 0, 0)
  data.products[0].commission.value = 50
  data = confirmPayment(data, roundId)
  assert.equal(data.commissions?.[0].staffId, 'waiter-marco')
  assert.equal(data.commissions?.[0].status, 'earned')
  assert.equal(data.commissions?.[0].amount, 30)
  data = advanceNightclubRound(data, accountId, roundId, 'Barra', at)
  data = advanceNightclubRound(data, accountId, roundId, 'Barra', at)
  data = deliverNightclubRound(data, accountId, roundId, 'Ana', at)
  assert.equal(data.commissions?.[0].staffId, 'waiter-marco')
  assert.equal(data.commissions?.length, 1)
  const again = synchronizeNightclubCommissions(structuredClone(data), at)
  assert.equal(again.commissions?.length, 1)
  const paidPart = payNightclubCommissions(again, { staffId: 'waiter-marco', amount: 10, method: 'cash', operationId: 'commission-payment-1' }, 'Admin', at)
  assert.equal(paidPart.commissions?.[0].paidAmount, 10)
  assert.equal(paidPart.commissions?.[0].status, 'earned')
  const paid = payNightclubCommissions(paidPart, { staffId: 'waiter-marco', amount: 20, method: 'cash', operationId: 'commission-payment-2' }, 'Admin', at)
  assert.equal(paid.commissions?.[0].status, 'paid')
  assert.equal(paid.commissionPayments?.length, 2)
  assert.equal(paid.cashMovements?.filter(item => item.commissionPaymentId).length, 2)
  assert.equal(payNightclubCommissions(paid, { staffId: 'waiter-marco', amount: 20, method: 'cash', operationId: 'commission-payment-2' }, 'Admin', at), paid)
  assert.throws(() => payNightclubCommissions(paid, { staffId: 'waiter-marco', amount: 1, method: 'cash' }, 'Admin', at), /saldo pendiente/)
  assert.throws(() => payNightclubCommissions(paid, { staffId: 'waiter-marco', amount: 0.001, method: 'cash' }, 'Admin', at), /centavos/)
  assert.equal(nightclubProfitSummary(paid).commissions, 30)
  assert.equal(nightclubProfitSummary(paid).expenses, 0)
  assert.equal(nightclubCommissionSummary(paid, 'waiter-marco').pending, 0)
  assert.equal(nightclubCashSummary(paid).expectedCash, 370)
})

test('filtros por mesero, período y estado conservan pagos e historial', () => {
  const { data: initial, accountId } = setup()
  let data = sendNightclubRound(initial, accountId, [{ productId: 'bottle-1', quantity: 1 }], 'Caja', at, 'order-1', null, 'waiter-marco')
  data = confirmPayment(data, data.accounts[0].rounds[0].id)
  assert.equal(nightclubCommissionSummary(data, { staffId: 'waiter-marco', from: '2026-10-01', to: '2026-10-31', status: 'pending' }).rows.length, 1)
  assert.equal(nightclubCommissionSummary(data, { staffId: 'waiter-valeria' }).rows.length, 0)
  assert.equal(nightclubCommissionSummary(data, { from: '2026-11-01' }).rows.length, 0)
  data = payNightclubCommissions(data, { staffId: 'waiter-marco', amount: 30, method: 'qr', operationId: 'pay-1' }, 'Admin', at)
  assert.equal(nightclubCommissionSummary(data, { status: 'paid' }).rows.length, 1)
  assert.equal(nightclubCommissionSummary(data, { status: 'pending' }).rows.length, 0)
  assert.equal(data.commissionPayments?.[0].staffId, 'waiter-marco')
  assert.throws(() => payNightclubCommissions(data, { staffId: 'service-ana', amount: 1, method: 'cash' }, 'Admin', at), /mesero/)
})

test('sin mesero vendedor o sin pago completo no se crea comisión; el cobro inmediato respeta el mesero', () => {
  const { data: initial, accountId } = setup()
  let data = sendNightclubRound(initial, accountId, [{ productId: 'bottle-1', quantity: 1 }], 'Caja', at, 'service-order', null, 'service-ana')
  data = confirmPayment(data, data.accounts[0].rounds[0].id)
  assert.equal(data.commissions?.length || 0, 0)
  data = sendNightclubRound(data, accountId, [{ productId: 'bottle-1', quantity: 1 }], 'Caja', at, 'waiter-order', null, 'waiter-valeria')
  const roundId = data.accounts[0].rounds.at(-1).id
  data.accounts[0].payments.push({ id: 'partial', roundId, method: 'cash', amount: 100, cashAmount: 100, qrAmount: 0, cardAmount: 0, received: 100, change: 0, paidAt: at, paidBy: 'Caja', status: 'confirmed' })
  synchronizeNightclubCommissions(data, at)
  assert.equal(data.commissions?.length || 0, 0)
  data.accounts[0].payments.push({ id: 'remaining', roundId, method: 'qr', amount: 200, cashAmount: 0, qrAmount: 200, cardAmount: 0, received: 0, change: 0, paidAt: at, paidBy: 'Caja', status: 'confirmed' })
  synchronizeNightclubCommissions(data, at)
  assert.equal(data.commissions?.[0].staffId, 'waiter-valeria')
  const quick = settleNightclubRound(data, accountId, [{ productId: 'bottle-1', quantity: 1 }], { method: 'qr' }, 'Caja', at, 'quick-order', 'waiter-marco')
  assert.equal(quick.commissions?.length, 2)
  assert.equal(quick.commissions?.find(item => item.staffId === 'waiter-marco')?.amount, 30)
  assert.equal(quick.inventory[0].current, 5)
})

test('reembolso invalida la comisión de la venta sin borrar pagos históricos', () => {
  const { data: initial, accountId } = setup()
  let data = sendNightclubRound(initial, accountId, [{ productId: 'bottle-1', quantity: 1 }], 'Caja', at, 'refundable-order', null, 'waiter-marco')
  const roundId = data.accounts[0].rounds[0].id
  data.accounts[0].rounds[0].authorization = 'payment'; data.accounts[0].rounds[0].paymentId = 'payment-2'
  data.accounts[0].payments = [{ id: 'payment-2', roundId, method: 'qr', amount: 300, cashAmount: 0, qrAmount: 300, cardAmount: 0, received: 0, change: 0, paidAt: at, paidBy: 'Caja', status: 'confirmed' }]
  synchronizeNightclubCommissions(data, at)
  data = refundNightclubRound(data, accountId, roundId, 'Admin', 'Pedido duplicado', at)
  assert.equal(data.commissions?.[0]?.status, 'void')
  assert.equal(nightclubCommissionSummary(data).generated, 0)
})

test('flujo real POS → Barra → Servicio → Caja genera una sola comisión al confirmar el pago', () => {
  const { data: initial, accountId } = setup()
  let data = sendNightclubRound(initial, accountId, [{ productId: 'bottle-1', quantity: 1 }], 'Caja', at, 'integrated-order', null, 'waiter-valeria')
  const roundId = data.accounts[0].rounds[0].id
  data = requestNightclubBill(data, accountId, 'Valeria', at)
  data = advanceNightclubRound(data, accountId, roundId, 'Barra', at)
  data = advanceNightclubRound(data, accountId, roundId, 'Barra', at)
  data = deliverNightclubRound(data, accountId, roundId, 'Ana', at)
  assert.equal(data.commissions?.length || 0, 0)
  data = recordNightclubPayment(data, accountId, { method: 'qr', operationId: 'integrated-payment' }, 'Caja', at)
  assert.equal(data.commissions?.length, 1)
  assert.equal(data.commissions?.[0].staffId, 'waiter-valeria')
  assert.equal(recordNightclubPayment(data, accountId, { method: 'qr', operationId: 'integrated-payment' }, 'Caja', at), data)
  assert.equal(data.accounts[0].payments?.length, 1)
  assert.equal(data.inventory[0].current, 7)
})

test('pago filtrado liquida solo las comisiones seleccionadas y no otras del mismo mesero', () => {
  const { data: initial, accountId } = setup()
  let data = sendNightclubRound(initial, accountId, [{ productId: 'bottle-1', quantity: 1 }], 'Caja', at, 'selected-order', null, 'waiter-marco')
  data = confirmPayment(data, data.accounts[0].rounds[0].id)
  const firstId = data.commissions[0].id
  data.commissions.push({ ...data.commissions[0], id: 'commission:other', itemId: 'other', createdAt: '2026-11-08T20:00:00Z', earnedAt: '2026-11-08T20:00:00Z' })
  data = payNightclubCommissions(data, { staffId: 'waiter-marco', commissionIds: [firstId], amount: 10, method: 'cash', operationId: 'filtered-payment' }, 'Admin', at)
  assert.equal(data.commissions.find(item => item.id === firstId).paidAmount, 10)
  assert.equal(data.commissions.find(item => item.id === 'commission:other').paidAmount, 0)
  assert.deepEqual(data.commissionPayments[0].commissionIds, [firstId])
})
