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
