import assert from 'node:assert/strict'
import test from 'node:test'
import { normalizeNightclubCashMovement, signedNightclubCashMovementAmount } from '../src/modules/nightclub/domain/nightclubCashMovements.ts'

test('normalizes sales and income as positive inflows', () => {
  for (const type of ['sale', 'income']) {
    const movement = normalizeNightclubCashMovement(type, 'shift-1', { type, amount: 20, method: 'cash' })
    assert.equal(movement.type, type)
    assert.equal(movement.amount, 20)
    assert.equal(signedNightclubCashMovementAmount(movement), 20)
  }
})

test('normalizes expenses and refunds as outflows without rewriting historical amounts', () => {
  const expense = { type: 'expense', amount: 12, method: 'cash' }
  const refund = { type: 'refund', amount: -8, method: 'cash' }
  const normalizedExpense = normalizeNightclubCashMovement('out', 'shift-1', expense)
  const normalizedRefund = normalizeNightclubCashMovement('refund', 'shift-1', refund)
  assert.deepEqual([normalizedExpense.type, normalizedExpense.amount, signedNightclubCashMovementAmount(normalizedExpense)], ['expense', 12, -12])
  assert.deepEqual([normalizedRefund.type, normalizedRefund.amount, signedNightclubCashMovementAmount(normalizedRefund)], ['refund', -8, -8])
  assert.equal(refund.amount, -8)
})

test('historical correction movements keep their persisted sign', () => {
  const out = normalizeNightclubCashMovement('correction-out', 'shift-1', { type: 'correction', amount: -5 })
  const incoming = normalizeNightclubCashMovement('correction-in', 'shift-1', { type: 'correction', amount: 5 })
  assert.equal(signedNightclubCashMovementAmount(out), -5)
  assert.equal(signedNightclubCashMovementAmount(incoming), 5)
})
