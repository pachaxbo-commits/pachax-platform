/* eslint-disable @typescript-eslint/ban-ts-comment -- Node test executes outside browser TypeScript project. */
// @ts-nocheck Node executes this file outside the browser TypeScript project.
import assert from 'node:assert/strict'
import test from 'node:test'
import { calculateCashShiftSummary, closingDifference } from '../cashEngine.ts'

test('efectivo esperado excluye QR, tarjeta y gastos no pagados con efectivo', () => {
  const orders = [
    { shiftId: 's', paymentStatus: 'paid', payments: [{ method: 'cash', amount: 1200 }, { method: 'qr', amount: 600 }, { method: 'card', amount: 200 }] },
  ]
  const movements = [
    { shiftId: 's', type: 'expense', paymentMethod: 'cash', amount: 250 },
    { shiftId: 's', type: 'expense', paymentMethod: 'cash', amount: 100 },
    { shiftId: 's', type: 'expense', paymentMethod: 'qr', amount: 120 },
  ]
  const summary = calculateCashShiftSummary(300, orders, 's', movements)
  assert.deepEqual(summary, { cashSales: 1200, qrSales: 600, cardSales: 200, totalSales: 2000, cashIncome: 0, cashOutflow: 350, totalExpenses: 470, expectedCash: 1150 })
  assert.equal(closingDifference(summary.expectedCash, 1150), 0)
  assert.equal(closingDifference(summary.expectedCash, 1140), -10)
  assert.equal(closingDifference(summary.expectedCash, 1170), 20)
})

test('movimientos anulados (active: false) son excluidos del arqueo y cálculo de caja', () => {
  const orders = [
    { shiftId: 's', paymentStatus: 'paid', payments: [{ method: 'cash', amount: 500 }] },
  ]
  const movements = [
    { shiftId: 's', type: 'expense', paymentMethod: 'cash', amount: 50, active: true },
    { shiftId: 's', type: 'expense', paymentMethod: 'cash', amount: 100, active: false }, // ANULADO
    { shiftId: 's', type: 'income', paymentMethod: 'cash', amount: 80, active: true },
    { shiftId: 's', type: 'income', paymentMethod: 'cash', amount: 200, active: false }, // ANULADO
  ]
  // float 100 + ventas cash 500 + income 80 - expense 50 = expected 630
  const summary = calculateCashShiftSummary(100, orders, 's', movements)
  assert.equal(summary.cashSales, 500)
  assert.equal(summary.cashIncome, 80)
  assert.equal(summary.cashOutflow, 50)
  assert.equal(summary.totalExpenses, 50)
  assert.equal(summary.expectedCash, 630)
})

test('movimientos de otro turno son estrictamente ignorados', () => {
  const orders = []
  const movements = [
    { shiftId: 'other_shift', type: 'expense', paymentMethod: 'cash', amount: 300, active: true },
    { shiftId: 'target_shift', type: 'income', paymentMethod: 'cash', amount: 150, active: true },
  ]
  const summary = calculateCashShiftSummary(200, orders, 'target_shift', movements)
  assert.equal(summary.cashIncome, 150)
  assert.equal(summary.cashOutflow, 0)
  assert.equal(summary.expectedCash, 350)
})
