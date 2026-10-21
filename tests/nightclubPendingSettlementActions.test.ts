import assert from 'node:assert/strict'
import test from 'node:test'
import { createTenantNightclubActions } from '../src/modules/nightclub/application/tenantNightclubActions.ts'

test('settling a pending round forwards the stable payment attempt through the tenant repository', async () => {
  const calls: unknown[] = []
  const actions = createTenantNightclubActions({
    tenantId: 'tenant-1',
    branchId: 'main',
    uid: 'cashier-1',
    userName: 'Caja',
    role: 'cashier',
    staff: [],
    reloadStaff: async () => {},
    reloadCustomers: async () => {},
    repository: {
      settlePendingRound: async (input: unknown) => { calls.push(input); return { paymentId: 'payment-attempt-1' } },
    },
    gatewayFn: async () => ({}),
  } as never)

  const result = await actions.onSettlePendingRound('account-1', 'round-1', {
    operationId: 'attempt-stable-1',
    method: 'cash',
    amount: 62,
    received: 70,
  })

  assert.equal(result, true)
  assert.deepEqual(calls, [{
    operationId: 'attempt-stable-1',
    accountId: 'account-1',
    roundId: 'round-1',
    payment: { operationId: 'attempt-stable-1', method: 'cash', amount: 62, received: 70 },
  }])
})

test('settlement stays unavailable when the production repository lacks the operation', async () => {
  const actions = createTenantNightclubActions({
    tenantId: 'tenant-1', uid: 'cashier-1', userName: 'Caja', role: 'cashier', staff: [],
    reloadStaff: async () => {}, reloadCustomers: async () => {}, repository: {}, gatewayFn: async () => ({}),
  } as never)

  await assert.rejects(() => actions.onSettlePendingRound('account-1', 'round-1', { method: 'cash', amount: 62, received: 62 }), /no está disponible/i)
})
