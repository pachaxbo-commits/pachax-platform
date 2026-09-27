/* eslint-disable @typescript-eslint/ban-ts-comment -- Node runs this domain suite outside the browser TypeScript project. */
// @ts-nocheck
import assert from 'node:assert/strict'
import test from 'node:test'
import { createNightclubDataset } from '../../../../demo/datasets/nightclub/nightclubDatasets.ts'
import { advanceNightclubRound, deliverNightclubRound, finishNightclubOccupancy, nightclubCashSummary, openNightclubAccount } from '../nightclubAccounts.ts'
import { cancelNightclubCourtesy, courtesyBalance, registerNightclubCourtesy, saveNightclubMember } from '../nightclubCourtesies.ts'

const at = '2026-09-25T22:00:00Z'
const member = { id: 'member-carlos', name: 'Carlos', active: true, quota: 4, policy: { anchorAt: '2026-09-25T00:00:00Z', windowDays: 7, repeatDays: 7 } }
function setup() {
  const data = createNightclubDataset('empty')
  data.shift = { id: 'shift', status: 'open', openedAt: at, openingFloat: 100, openedBy: 'Caja' }
  data.inventory = [{ id: 'ron-unit', name: 'Ron', unit: 'unit', current: 12, minimum: 2, unitCost: 45 }]
  data.products = [{ id: 'ron', name: 'Ron', category: 'Botellas', price: 200, preparationArea: 'Barra', stockUnits: 12, recipe: [{ inventoryId: 'ron-unit', quantity: 1 }] }]
  return saveNightclubMember(data, member, 'Admin', at)
}
const draft = { memberId: member.id, productId: 'ron', quantity: 1 }

test('one courtesy consumes quota and stock, records cost, never changes catalog price or cash', () => {
  const data = registerNightclubCourtesy(setup(), draft, 'Pedro', at)
  assert.equal(courtesyBalance(data, member, at).available, 3)
  assert.equal(data.inventory[0].current, 11)
  assert.equal(data.products[0].price, 200)
  assert.equal(data.courtesies[0].cost, 45)
  assert.equal(data.inventoryMovements[0].type, 'member_courtesy')
  assert.equal(nightclubCashSummary(data).totalSales, 0)
  assert.equal(nightclubCashSummary(data).expectedCash, 100)
})

test('insufficient and zero quota are rejected without stock movement', () => {
  let data = setup()
  data.members[0].quota = 1
  assert.throws(() => registerNightclubCourtesy(data, { ...draft, quantity: 2 }, 'Pedro', at), /Cupo insuficiente/)
  data = registerNightclubCourtesy(data, draft, 'Pedro', at)
  assert.throws(() => registerNightclubCourtesy(data, draft, 'Pedro', at), /0 botella/)
  assert.equal(data.inventory[0].current, 11)
  assert.equal(data.courtesies.length, 1)
})

test('courtesy from a table appears in the account at zero and does not inflate payment', () => {
  let data = openNightclubAccount(setup(), 'night-table-general-1', 'Pedro', at)
  const accountId = data.accounts[0].id
  data = registerNightclubCourtesy(data, { ...draft, accountId, beneficiary: 'Juan' }, 'Pedro', at)
  assert.equal(data.accounts[0].rounds[0].items[0].lineTotal, 0)
  assert.equal(data.accounts[0].rounds[0].items[0].courtesyId, data.courtesies[0].id)
  assert.equal(data.accounts[0].subtotal, 0)
  const roundId = data.accounts[0].rounds[0].id
  data = advanceNightclubRound(data, accountId, roundId, 'Barra', at)
  data = advanceNightclubRound(data, accountId, roundId, 'Barra', at)
  data = deliverNightclubRound(data, accountId, roundId, 'Pedro', at)
  data = finishNightclubOccupancy(data, accountId, 'Pedro', at)
  assert.equal(data.accounts[0].payments?.length || 0, 0)
  assert.equal(nightclubCashSummary(data).totalSales, 0)
})

test('cancellation restores both balances and retains the original audit', () => {
  let data = registerNightclubCourtesy(setup(), draft, 'Pedro', at)
  data = cancelNightclubCourtesy(data, data.courtesies[0].id, 'Admin', at)
  assert.equal(courtesyBalance(data, member, at).available, 4)
  assert.equal(data.inventory[0].current, 12)
  assert.equal(data.courtesies[0].status, 'cancelled')
  assert.equal(data.courtesies[0].cancelledBy, 'Admin')
  assert.deepEqual(data.inventoryMovements.map(item => item.type), ['member_courtesy', 'courtesy_reversal'])
  assert.throws(() => cancelNightclubCourtesy(data, data.courtesies[0].id, 'Admin', at), /ya fue anulada/)
})

test('a new period restores availability while preserving the old record', () => {
  const data = registerNightclubCourtesy(setup(), draft, 'Pedro', at)
  assert.equal(courtesyBalance(data, member, '2026-10-02T22:00:00Z').available, 4)
  assert.equal(data.courtesies.length, 1)
})

test('a weekend window refuses delivery outside the configured days', () => {
  const data = setup()
  data.members[0].policy = { anchorAt: '2026-09-25T18:00:00Z', windowDays: 3, repeatDays: 7 }
  assert.throws(() => registerNightclubCourtesy(data, draft, 'Pedro', '2026-09-29T22:00:00Z'), /no está activo/)
})

test('stock shortage blocks the entire operation', () => {
  const data = setup()
  data.inventory[0].current = 0
  assert.throws(() => registerNightclubCourtesy(data, draft, 'Pedro', at), /Stock insuficiente/)
  assert.equal(data.courtesies.length, 0)
  assert.equal(data.inventoryMovements.length, 0)
})

test('a used policy cannot silently reset its period', () => {
  const data = registerNightclubCourtesy(setup(), draft, 'Pedro', at)
  assert.throws(() => saveNightclubMember(data, { ...member, policy: { ...member.policy, anchorAt: '2026-09-26T00:00:00Z' } }, 'Admin', at), /política/)
})
