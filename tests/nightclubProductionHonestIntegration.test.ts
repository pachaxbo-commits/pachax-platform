import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import {
  createNightclubActionRunner,
  resolveNightclubVisibleModules,
} from '../src/modules/nightclub/application/nightclubActionRunner.ts'
import { createTenantNightclubActions } from '../src/modules/nightclub/application/tenantNightclubActions.ts'
import {
  assembleOperationalAccounts,
  nightclubCashSummary,
  resolveShiftIdToTrack,
} from '../src/modules/nightclub/domain/nightclubAccounts.ts'
import type {
  NightclubAccount,
  NightclubDataset,
  NightclubStaff,
} from '../src/modules/nightclub/domain/nightclubAccounts.ts'

// TEST 1
test('1. run rejects and surfaces error message without setting success notice when action throws', async () => {
  let notice = ''
  let isRunning = false
  const run = createNightclubActionRunner(
    () => isRunning,
    val => { isRunning = val },
    msg => { notice = msg }
  )

  const result = await run(async () => {
    throw new Error('Mesa ocupada por otra cuenta')
  }, 'Mesa abierta exitosamente.')

  assert.equal(result, false)
  assert.equal(notice, 'Mesa ocupada por otra cuenta')
  assert.equal(isRunning, false)
})

// TEST 2
test('2. run sets success notice only after successful async resolution', async () => {
  let notice = ''
  let isRunning = false
  let resolved = false
  const run = createNightclubActionRunner(
    () => isRunning,
    val => { isRunning = val },
    msg => { notice = msg }
  )

  const promise = run(async () => {
    await new Promise(resolve => setTimeout(resolve, 20))
    resolved = true
  }, 'Ronda enviada.')

  assert.equal(notice, '') // Notice is not set prematurely
  const ok = await promise
  assert.equal(ok, true)
  assert.equal(resolved, true)
  assert.equal(notice, 'Ronda enviada.')
  assert.equal(isRunning, false)
})

// TEST 3
test('3. run blocks concurrent second execution while first is in-flight', async () => {
  let isRunning = false
  let count = 0
  const run = createNightclubActionRunner(
    () => isRunning,
    val => { isRunning = val },
    () => {}
  )

  let unblock: () => void = () => {}
  const first = run(async () => {
    count++
    await new Promise<void>(resolve => { unblock = resolve })
  }, 'Primer proceso')

  assert.equal(isRunning, true)
  const second = await run(async () => {
    count++
  }, 'Segundo proceso')

  assert.equal(second, false, 'Concurrent call should be blocked')
  assert.equal(count, 1, 'Only first action ran')

  unblock()
  await first
  assert.equal(isRunning, false)
})

// TEST 4
test('4. useTenantNightclubController onOpenAccount awaits backend ACK and returns real result.accountId', async () => {
  let backendAck = false
  const mockRepo = {
    openAccount: async (payload: { operationId: string; target: any }) => {
      await new Promise(r => setTimeout(r, 10))
      backendAck = true
      return { accountId: 'acc_confirmed_uuid_789' }
    },
  }

  const actions = createTenantNightclubActions({
    tenantId: 'tenant-n1',
    uid: 'u1',
    userName: 'Bartender',
    role: 'bar',
    staff: [],
    reloadStaff: async () => {},
    reloadCustomers: async () => {},
    repository: mockRepo as any,
    gatewayFn: async () => ({}),
  })

  const accountId = await actions.onOpenAccount('table:mesa_vip_1')
  assert.equal(backendAck, true)
  assert.equal(accountId, 'acc_confirmed_uuid_789')

  // When backend rejects, promise rejects and never invents account_operationId
  const failingRepo = {
    openAccount: async () => {
      throw new Error('Mesa no disponible o turno cerrado')
    },
  }
  const failingActions = createTenantNightclubActions({
    tenantId: 'tenant-n1',
    uid: 'u1',
    userName: 'Bartender',
    role: 'bar',
    staff: [],
    reloadStaff: async () => {},
    reloadCustomers: async () => {},
    repository: failingRepo as any,
    gatewayFn: async () => ({}),
  })

  await assert.rejects(
    () => failingActions.onOpenAccount('table:mesa_vip_1'),
    /Mesa no disponible o turno cerrado/
  )
})

// TEST 5
test('5. onSaveStaff in tenant mode creates new user with 8-72 char password, calls createMember, reloads staff only on success', async () => {
  let gatewayCalls: Array<{ name: string; payload: any }> = []
  let reloaded = false
  const mockGateway = async (name: 'tenantGateway' | 'platformGateway', payload: Record<string, unknown>) => {
    gatewayCalls.push({ name, payload })
    return { ok: true }
  }

  const staff: NightclubStaff[] = [
    { id: 'owner-id', name: 'Dueño', role: 'owner', active: true, permissions: [] },
  ]

  const actions = createTenantNightclubActions({
    tenantId: 'tenant-n1',
    uid: 'owner-id',
    userName: 'Dueño',
    role: 'owner',
    staff,
    reloadStaff: async () => { reloaded = true },
    reloadCustomers: async () => {},
    repository: {} as any,
    gatewayFn: mockGateway,
  })

  // Rejects short password (< 8 chars)
  await assert.rejects(
    () => actions.onSaveStaff(
      { id: 'new-staff-1', name: 'Nuevo Mesero', role: 'waiter', email: 'mesero@club.bo', active: true, permissions: [] },
      'pass'
    ),
    /al menos 8 caracteres/
  )
  assert.equal(gatewayCalls.length, 0)
  assert.equal(reloaded, false)

  // Rejects missing email
  await assert.rejects(
    () => actions.onSaveStaff(
      { id: 'new-staff-1', name: 'Nuevo Mesero', role: 'waiter', active: true, permissions: [] },
      'securePassword123'
    ),
    /Correo y contraseña inicial/
  )
  assert.equal(gatewayCalls.length, 0)
  assert.equal(reloaded, false)

  // Succeeds with valid email and password (8-72 chars), passes password to gateway, reloads staff
  const success = await actions.onSaveStaff(
    { id: 'new-staff-1', name: 'Nuevo Mesero', role: 'waiter', email: 'mesero@club.bo', active: true, permissions: ['pos.view'] },
    'securePassword123'
  )
  assert.equal(success, true)
  assert.equal(gatewayCalls.length, 1)
  assert.equal(gatewayCalls[0].name, 'tenantGateway')
  assert.equal(gatewayCalls[0].payload.action, 'createMember')
  assert.equal(gatewayCalls[0].payload.email, 'mesero@club.bo')
  assert.equal(gatewayCalls[0].payload.password, 'securePassword123')
  assert.equal(gatewayCalls[0].payload.roleId, 'waiter')
  assert.equal(reloaded, true)
})

// TEST 6
test('6. onSaveStaff in tenant mode for existing user calls updateMember without password', async () => {
  let gatewayCalls: Array<{ name: string; payload: any }> = []
  let reloaded = false
  const mockGateway = async (name: 'tenantGateway' | 'platformGateway', payload: Record<string, unknown>) => {
    gatewayCalls.push({ name, payload })
    return { ok: true }
  }

  const staff: NightclubStaff[] = [
    { id: 'owner-id', name: 'Dueño', role: 'owner', active: true, permissions: [] },
    { id: 'staff-cashier', name: 'Cajera Ana', role: 'cashier', active: true, permissions: ['cash.view'] },
  ]

  const actions = createTenantNightclubActions({
    tenantId: 'tenant-n1',
    uid: 'owner-id',
    userName: 'Dueño',
    role: 'owner',
    staff,
    reloadStaff: async () => { reloaded = true },
    reloadCustomers: async () => {},
    repository: {} as any,
    gatewayFn: mockGateway,
  })

  // Prevent self modification
  await assert.rejects(
    () => actions.onSaveStaff({ id: 'owner-id', name: 'Dueño Editado', role: 'owner', active: true, permissions: [] }),
    /No puedes modificar tu propio acceso/
  )
  assert.equal(gatewayCalls.length, 0)

  // Edit existing staff member: calls updateMember and does NOT pass password
  const ok = await actions.onSaveStaff({
    id: 'staff-cashier',
    name: 'Cajera Ana M.',
    role: 'cashier',
    active: false,
    permissions: ['cash.view', 'pos.view'],
  })

  assert.equal(ok, true)
  assert.equal(gatewayCalls.length, 1)
  assert.equal(gatewayCalls[0].name, 'tenantGateway')
  assert.equal(gatewayCalls[0].payload.action, 'updateMember')
  assert.equal(gatewayCalls[0].payload.uid, 'staff-cashier')
  assert.equal(gatewayCalls[0].payload.displayName, 'Cajera Ana M.')
  assert.equal(gatewayCalls[0].payload.active, false)
  assert.equal('password' in gatewayCalls[0].payload, false)
  assert.equal(reloaded, true)
})

// TEST 7
test('7. TenantNightclubRepository.subscribeOperationalAccounts includes closed accounts with rounds and payments', () => {
  const openAccounts = [
    { id: 'acc_open_1', tableId: 't1', status: 'open', subtotal: 100, openedAt: '2026-10-16T20:00:00Z' },
  ]
  const closedAccounts = [
    { id: 'acc_closed_2', tableId: 't2', status: 'closed', subtotal: 62, openedAt: '2026-10-16T19:00:00Z', paidAt: '2026-10-16T19:45:00Z' },
  ]
  const rounds = [
    { id: 'r1', accountId: 'acc_open_1', sequence: 1, items: [{ productId: 'p1', name: 'Cerveza', quantity: 2, unitPrice: 25, total: 50 }], status: 'preparing' },
    { id: 'r2', accountId: 'acc_closed_2', sequence: 1, items: [{ productId: 'p2', name: 'Agua', quantity: 1, unitPrice: 12, total: 12 }], status: 'delivered' },
    { id: 'r3', accountId: 'acc_closed_2', sequence: 2, items: [{ productId: 'p1', name: 'Cerveza', quantity: 2, unitPrice: 25, total: 50 }], status: 'delivered' },
  ]
  const payments = [
    { id: 'pay1', accountId: 'acc_closed_2', amount: 40, cashAmount: 40, qrAmount: 0, cardAmount: 0, method: 'cash', paidAt: '2026-10-16T19:40:00Z' },
    { id: 'pay2', accountId: 'acc_closed_2', amount: 22, cashAmount: 0, qrAmount: 22, cardAmount: 0, method: 'qr', paidAt: '2026-10-16T19:45:00Z' },
  ]

  const assembled = assembleOperationalAccounts(openAccounts, closedAccounts, rounds as any, payments as any)

  assert.equal(assembled.length, 2)
  const open = assembled.find(a => a.id === 'acc_open_1')!
  const closed = assembled.find(a => a.id === 'acc_closed_2')!

  assert.equal(open.status, 'open')
  assert.equal(open.rounds.length, 1)

  assert.equal(closed.status, 'closed')
  assert.equal(closed.rounds.length, 2)
  assert.equal(closed.payments?.length, 2)
  assert.equal(closed.payment?.amount, 22)
  assert.equal(closed.payment?.method, 'qr')
})

// TEST 8
test('8. mode="tenant" filters out promoters and members from visible modules in NightclubExperience', () => {
  const tenantModules = resolveNightclubVisibleModules({ mode: 'tenant', role: 'owner' })
  assert.equal(tenantModules.includes('promoters'), false, 'Tenant mode must not expose promoters module')
  assert.equal(tenantModules.includes('members'), false, 'Tenant mode must not expose members module')
  assert.equal(tenantModules.includes('dashboard'), true)
  assert.equal(tenantModules.includes('floor'), true)
  assert.equal(tenantModules.includes('pos'), true)
  assert.equal(tenantModules.includes('accounts'), true)
  assert.equal(tenantModules.includes('cash'), true)
  assert.equal(tenantModules.includes('history'), true)

  const demoModules = resolveNightclubVisibleModules({ mode: 'demo', role: 'owner' })
  assert.equal(demoModules.includes('promoters'), true, 'Demo mode retains promoters')
  assert.equal(demoModules.includes('members'), true, 'Demo mode retains members')

  const studioModules = resolveNightclubVisibleModules({ mode: 'studio', role: 'owner' })
  assert.equal(studioModules.includes('promoters'), true, 'Studio retains promoters')
  assert.equal(studioModules.includes('members'), true, 'Studio retains members')
})

// TEST 9
test('9. mode="tenant" suppresses non-connected sections (reservations, courtesies, private customer incidents, bottle inventory, commissions, custom roles)', () => {
  const expSource = readFileSync(new URL('../src/modules/nightclub/views/NightclubExperience.tsx', import.meta.url), 'utf8')
  const zonesSource = readFileSync(new URL('../src/modules/nightclub/views/NightclubZones.tsx', import.meta.url), 'utf8')
  const posSource = readFileSync(new URL('../src/modules/nightclub/views/NightclubPOS.tsx', import.meta.url), 'utf8')
  const accountsSource = readFileSync(new URL('../src/modules/nightclub/views/NightclubAccounts.tsx', import.meta.url), 'utf8')
  const customersSource = readFileSync(new URL('../src/modules/nightclub/views/NightclubCustomers.tsx', import.meta.url), 'utf8')
  const usersSource = readFileSync(new URL('../src/modules/nightclub/views/NightclubUsers.tsx', import.meta.url), 'utf8')
  const inventorySource = readFileSync(new URL('../src/modules/nightclub/views/NightclubInventory.tsx', import.meta.url), 'utf8')

  // Commissions & Courtesy Report hidden in tenant mode
  assert.match(expSource, /props\.mode\s*!==\s*'tenant'\s*&&\s*<NightclubCommissions/)
  assert.match(expSource, /props\.mode\s*!==\s*'tenant'\s*&&\s*<NightclubCourtesyReport/)

  // Reservations hidden in tenant mode in NightclubZones
  assert.match(zonesSource, /mode\s*!==\s*'tenant'/)

  // Courtesy order button hidden in tenant mode in NightclubPOS
  assert.match(posSource, /mode\s*!==\s*'tenant'/)

  // Product exchange button hidden in tenant mode in NightclubAccounts
  assert.match(accountsSource, /mode\s*!==\s*'tenant'/)

  // Private incidents and convivencia hidden in tenant mode in NightclubCustomers
  assert.match(customersSource, /mode\s*!==\s*'tenant'/)

  // Custom roles tab/button hidden in tenant mode in NightclubUsers (only rendered when mode === 'demo')
  assert.match(usersSource, /mode\s*===\s*'demo'\s*&&\s*<section[^>]*>[\s\S]*?Roles personalizados/)

  // Bottle inventory suppressed in tenant mode in NightclubExperience
  assert.match(expSource, /props\.mode\s*!==\s*'tenant'\s*&&\s*<NightclubBottleInventory/)
})

// TEST 10
test('10. subscribeActiveShift retains lastClosedShiftId so closing shift keeps total sales and cash reconciliation', () => {
  // When active shift exists:
  const openState = { activeShiftId: 'shift_active_001', lastClosedShiftId: 'shift_prev_999' }
  assert.equal(resolveShiftIdToTrack(openState), 'shift_active_001')

  // When shift is closed in Firestore, activeShiftId is null but lastClosedShiftId is set:
  const closedState = { activeShiftId: null, lastClosedShiftId: 'shift_active_001' }
  assert.equal(resolveShiftIdToTrack(closedState), 'shift_active_001')

  // When no shift was ever opened:
  const emptyState = { activeShiftId: null, lastClosedShiftId: null }
  assert.equal(resolveShiftIdToTrack(emptyState), null)

  // Verify nightclubCashSummary calculation retains sales and expected cash with the retained closed shift:
  const closedShift = {
    id: 'shift_active_001',
    openedAt: '2026-10-16T18:00:00Z',
    closedAt: '2026-10-17T04:00:00Z',
    openingFloat: 200,
    countedCash: 262,
    status: 'closed' as const,
  }

  const closedAccounts: NightclubAccount[] = [
    {
      id: 'acc_vip_1',
      shiftId: 'shift_active_001',
      status: 'closed',
      openedAt: '2026-10-16T21:00:00Z',
      paidAt: '2026-10-16T23:00:00Z',
      subtotal: 62,
      rounds: [],
      payments: [
        { id: 'pay1', accountId: 'acc_vip_1', amount: 40, cashAmount: 40, qrAmount: 0, cardAmount: 0, method: 'cash', paidAt: '2026-10-16T23:00:00Z' },
        { id: 'pay2', accountId: 'acc_vip_1', amount: 22, cashAmount: 0, qrAmount: 22, cardAmount: 0, method: 'qr', paidAt: '2026-10-16T23:00:00Z' },
      ],
    } as any,
  ]

  const summary = nightclubCashSummary({
    shift: closedShift,
    accounts: closedAccounts,
    cashMovements: [],
  } as unknown as NightclubDataset)

  assert.equal(summary.totalSales, 62, 'Total sales should be 62, not 0')
  assert.equal(summary.cashSales, 40, 'Cash sales should be 40')
  assert.equal(summary.qrSales, 22, 'QR sales should be 22')
  assert.equal(summary.expectedCash, 240, 'Opening float 200 + cash sales 40 = 240 expected cash')
  const diff = closedShift.countedCash - summary.expectedCash
  assert.equal(diff, 22, 'Counted 262 - Expected 240 = +22 cash diff')
})
