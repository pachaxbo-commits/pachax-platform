/* eslint-disable @typescript-eslint/ban-ts-comment -- Node runs TypeScript outside the browser project. */
// @ts-nocheck
import assert from 'node:assert/strict'
import test from 'node:test'
import { createNightclubDataset } from '../../../../demo/datasets/nightclub/nightclubDatasets.ts'
import { closeNightclubShift, nightclubCashReconciliation, nightclubCashSummary, nightclubProfitSummary, openNightclubShift } from '../nightclubAccounts.ts'
import { selectNightclubShiftClosures } from '../nightclubShiftHistory.ts'

const at = '2026-10-07T22:00:00Z'
const dataset = () => {
  const data = createNightclubDataset('empty')
  data.accounts = []
  data.cashMovements = []
  data.shift = { id: 'shift', status: 'open', openedAt: at, openedBy: 'Caja', openingFloat: 200 }
  return data
}

test('arqueo impide faltantes y permite caja cuadrada o sobrante', () => {
  const cases = [
    { input: '', valid: false, difference: null, canClose: false },
    { input: '0', valid: true, difference: -200, canClose: false },
    { input: '50', valid: true, difference: -150, canClose: false },
    { input: '199', valid: true, difference: -1, canClose: false },
    { input: '200', valid: true, difference: 0, canClose: true },
    { input: '201', valid: true, difference: 1, canClose: true },
    { input: '250', valid: true, difference: 50, canClose: true },
  ]
  for (const item of cases) {
    const actual = nightclubCashReconciliation(200, item.input)
    assert.equal(actual.valid, item.valid, `contado: ${item.input}`)
    assert.equal(actual.difference, item.difference, `contado: ${item.input}`)
    assert.equal(actual.canClose, item.canClose, `contado: ${item.input}`)
  }
  assert.equal(nightclubCashReconciliation(200, 'no es un monto').canClose, false)
})

test('la función rechaza faltantes y montos inválidos sin cambiar el turno', () => {
  const data = dataset()
  for (const counted of ['', NaN, -1, 0, 50, 199]) {
    assert.throws(() => closeNightclubShift(data, 'Caja', counted, at), /efectivo contado válido|faltante/)
    assert.equal(data.shift.status, 'open')
    assert.equal(data.audit?.filter(item => item.type === 'shift_closed').length || 0, 0)
  }
})

test('cierre cuadrado conserva datos, auditoría e historial del turno', () => {
  const data = dataset()
  const closed = closeNightclubShift(data, 'Caja', 200, at)
  assert.deepEqual({ status: closed.shift.status, countedCash: closed.shift.countedCash, expectedCash: closed.shift.expectedCash, difference: closed.shift.difference, closedAt: closed.shift.closedAt, closedBy: closed.shift.closedBy },
    { status: 'closed', countedCash: 200, expectedCash: 200, difference: 0, closedAt: at, closedBy: 'Caja' })
  assert.equal(closed.audit.at(-1).type, 'shift_closed')
  assert.equal(data.shift.status, 'open')
  const next = openNightclubShift(closed, 'Caja', 100, at)
  assert.deepEqual(next.shiftHistory.at(-1), closed.shift)
})

test('sobrante cierra y queda solo como diferencia de arqueo, sin aumentar ventas ni ganancia', () => {
  const data = dataset()
  data.shift.openingFloat = 1108
  const salesBefore = nightclubCashSummary(data).totalSales
  const profitBefore = nightclubProfitSummary(data).netProfit
  const closed = closeNightclubShift(data, 'Cajera Ana', 1110, at)
  assert.equal(closed.shift.status, 'closed')
  assert.equal(closed.shift.reconciliationStatus, 'surplus')
  assert.equal(closed.shift.expectedCash, 1108)
  assert.equal(closed.shift.countedCash, 1110)
  assert.equal(closed.shift.difference, 2)
  assert.equal(closed.shift.totalSales, salesBefore)
  assert.equal(closed.shift.incomeTotal, 0)
  assert.equal(closed.shift.expenseTotal, 0)
  assert.equal(nightclubCashSummary(closed).totalSales, salesBefore)
  assert.equal(nightclubProfitSummary(closed).netProfit, profitBefore)
  assert.equal(closed.audit.at(-1).details.difference, 2)
})

test('historial de cierres conserva totales, filtra y ordena por cierre reciente', () => {
  const first = dataset()
  first.cashMovements = [
    { id: 'in', shiftId: 'shift', type: 'income', method: 'cash', amount: 25, description: 'Entrada', at, actor: 'Caja' },
    { id: 'out', shiftId: 'shift', type: 'expense', method: 'cash', amount: 10, description: 'Salida', at, actor: 'Caja' },
  ]
  const closed = closeNightclubShift(first, 'Cajera Ana', 217, '2026-10-08T02:00:00Z')
  const next = openNightclubShift(closed, 'Cajera B', 100, '2026-10-08T03:00:00Z')
  const last = closeNightclubShift(next, 'Cajera B', 100, '2026-10-08T05:00:00Z')
  const all = { from: '', to: '', cashier: '', status: 'all' }
  const rows = selectNightclubShiftClosures(last, all)
  assert.deepEqual(rows.map(row => row.shift.closedBy), ['Cajera B', 'Cajera Ana'])
  assert.equal(rows[1].expectedCash, 215)
  assert.equal(rows[1].difference, 2)
  assert.equal(rows[1].incomeTotal, 25)
  assert.equal(rows[1].expenseTotal, 10)
  assert.equal(rows[1].totalSales, 0)
  assert.deepEqual(selectNightclubShiftClosures(last, { ...all, cashier: 'Cajera Ana' }).map(row => row.shift.closedBy), ['Cajera Ana'])
  assert.deepEqual(selectNightclubShiftClosures(last, { ...all, status: 'balanced' }).map(row => row.shift.closedBy), ['Cajera B'])
  assert.deepEqual(selectNightclubShiftClosures(last, { ...all, status: 'surplus' }).map(row => row.shift.closedBy), ['Cajera Ana'])
  assert.equal(selectNightclubShiftClosures(last, { ...all, from: '2026-10-09' }).length, 0)
  assert.equal(selectNightclubShiftClosures(last, { ...all, to: '2026-10-07' }).length, 0)
})

test('la comparación usa centavos cuando el esperado acumula error de coma flotante', () => {
  const data = dataset()
  data.shift.openingFloat = 0.1 + 0.2
  assert.equal(nightclubCashSummary(data).expectedCash, 0.3)
  assert.equal(nightclubCashReconciliation(data.shift.openingFloat, '0.30').difference, 0)
  assert.equal(closeNightclubShift(data, 'Caja', 0.3, at).shift.difference, 0)
})
