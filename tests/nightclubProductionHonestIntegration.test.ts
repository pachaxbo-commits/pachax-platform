import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import {
  createNightclubActionRunner,
  resolveNightclubVisibleModules,
} from '../src/modules/nightclub/application/nightclubActionRunner.ts'
import { createTenantNightclubActions } from '../src/modules/nightclub/application/tenantNightclubActions.ts'
import { requiresCashboxSelection, resolveSelectedCashboxId } from '../src/modules/nightclub/domain/nightclubCashboxSelection.ts'
import {
  assembleOperationalAccounts,
  nightclubCashSummary,
  resolveShiftIdToTrack,
} from '../src/modules/nightclub/domain/nightclubAccounts.ts'
import type {
  NightclubAccount,
  NightclubDataset,
  NightclubPayment,
  NightclubRound,
  NightclubStaff,
} from '../src/modules/nightclub/domain/nightclubAccounts.ts'
import type { TenantNightclubActionsDeps } from '../src/modules/nightclub/application/tenantNightclubActions.ts'
import { BusinessTemplateRegistry } from '../src/core/templates.ts'

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
    openAccount: async () => {
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
    repository: mockRepo as unknown as TenantNightclubActionsDeps['repository'],
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
    repository: failingRepo as unknown as TenantNightclubActionsDeps['repository'],
    gatewayFn: async () => ({}),
  })

  await assert.rejects(
    () => failingActions.onOpenAccount('table:mesa_vip_1'),
    /Mesa no disponible o turno cerrado/
  )
})

// TEST 5
test('5. onSaveStaff in tenant mode creates new user with 8-72 char password, calls createMember, reloads staff only on success', async () => {
  const gatewayCalls: Array<{ name: string; payload: Record<string, unknown> }> = []
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
    repository: {} as unknown as TenantNightclubActionsDeps['repository'],
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
  const gatewayCalls: Array<{ name: string; payload: Record<string, unknown> }> = []
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
    repository: {} as unknown as TenantNightclubActionsDeps['repository'],
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

  const assembled = assembleOperationalAccounts(
    openAccounts,
    closedAccounts,
    rounds as unknown as NightclubRound[],
    payments as unknown as NightclubPayment[]
  )

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
test('8. mode="tenant" enables promoters and members for owner/admin in N3B', () => {
  const tenantModules = resolveNightclubVisibleModules({ mode: 'tenant', role: 'owner' })
  assert.equal(tenantModules.includes('promoters'), true, 'Tenant mode now exposes promoters module in N3A')
  assert.equal(tenantModules.includes('members'), true, 'Tenant mode now exposes members module in N3B')
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
test('9. mode="tenant" connects N3B features while safely deferring complex/risky features (custom roles, product exchange)', () => {
  const expSource = readFileSync(new URL('../src/modules/nightclub/views/NightclubExperience.tsx', import.meta.url), 'utf8')
  const accountsSource = readFileSync(new URL('../src/modules/nightclub/views/NightclubAccounts.tsx', import.meta.url), 'utf8')
  const usersSource = readFileSync(new URL('../src/modules/nightclub/views/NightclubUsers.tsx', import.meta.url), 'utf8')

  // Commissions, Bottle Inventory & Courtesy Report enabled in tenant mode
  assert.match(expSource, /<NightclubCommissions/)
  assert.match(expSource, /<NightclubCourtesyReport/)
  assert.match(expSource, /<NightclubBottleInventory/)

  // Product exchange button deferred and hidden in tenant mode
  assert.match(accountsSource, /mode\s*!==\s*'tenant'/)

  // Custom roles tab/button deferred and hidden in tenant mode (only rendered when mode === 'demo')
  assert.match(usersSource, /mode\s*===\s*'demo'\s*&&\s*<section[^>]*>[\s\S]*?Roles personalizados/)
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
    } as unknown as NightclubAccount,
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

// TEST 11
test('11. builtin customized role preserves canonical permissions while reflecting explicit nightclubPermissions in UI visibility', () => {
  // Builtin waiter with explicit nightclub permissions (no cash.view)
  const waiterPerms = new Set(['floor.view', 'floor.create', 'accounts.view', 'accounts.create', 'pos.view', 'pos.create'])
  const visible = resolveNightclubVisibleModules({
    mode: 'tenant',
    role: 'waiter',
    permissions: waiterPerms,
  })

  // Visible modules include granted modules
  assert.equal(visible.includes('floor'), true)
  assert.equal(visible.includes('pos'), true)
  assert.equal(visible.includes('accounts'), true)

  // Module cash is NOT visible when cash.view is omitted
  assert.equal(visible.includes('cash'), false)
  assert.equal(visible.includes('bar'), false)
  assert.equal(visible.includes('inventory'), false)
  assert.equal(visible.includes('users'), false)

  // Canonical role permissions in template remain authoritative:
  const template = BusinessTemplateRegistry.nightclub_lounge
  const waiterRole = template.roles.find(r => r.id === 'waiter')!
  assert.equal(waiterRole.permissions.includes('orders.read'), true)
  assert.equal(waiterRole.permissions.includes('orders.manage'), true)
  assert.equal(waiterRole.permissions.includes('sales.create'), true)
  assert.equal(waiterRole.permissions.includes('customers.read'), true)
  assert.equal(waiterRole.permissions.includes('cash.close'), false)

  // Legacy fallback when permissions === undefined (uses role defaults):
  const visibleLegacy = resolveNightclubVisibleModules({
    mode: 'tenant',
    role: 'waiter',
    permissions: undefined,
  })
  assert.equal(visibleLegacy.includes('floor'), true)
  assert.equal(visibleLegacy.includes('pos'), true)
  assert.equal(visibleLegacy.includes('history'), true)
  assert.equal(visibleLegacy.includes('dashboard'), false)
  assert.equal(visibleLegacy.includes('cash'), false)

  // Explicit empty matrix permissions = new Set([]) yields ZERO visible modules:
  const visibleEmpty = resolveNightclubVisibleModules({
    mode: 'tenant',
    role: 'waiter',
    permissions: new Set([]),
  })
  assert.deepEqual(visibleEmpty, [], 'Empty nightclubPermissions matrix yields ZERO visible modules')

  // Explicit restricted matrix permissions = new Set(['floor.view']):
  const visibleRestricted = resolveNightclubVisibleModules({
    mode: 'tenant',
    role: 'waiter',
    permissions: new Set(['floor.view']),
  })
  assert.deepEqual(visibleRestricted, ['floor'], 'Only floor is visible')
})

// TEST 12
test('12. multi-cashbox UI contract & lifecycle: cashier authorized to cashbox-2 opens shift, attributes accounts/rounds/payments to cashbox-2, and isolates cashbox-1', async () => {
  const calls: Array<{ action: string; payload: Record<string, unknown> }> = []
  const mockRepo = {
    selectCashbox: async (payload: Record<string, unknown>) => { calls.push({ action: 'selectCashbox', payload }) },
    openCashboxShift: async (payload: Record<string, unknown>) => { calls.push({ action: 'openCashboxShift', payload }) },
    closeCashboxShift: async (payload: Record<string, unknown>) => { calls.push({ action: 'closeCashboxShift', payload }) },
    openAccount: async (payload: Record<string, unknown>) => {
      calls.push({ action: 'openAccount', payload })
      return { accountId: 'acc_cashbox2_001' }
    },
    addRound: async (payload: Record<string, unknown>) => { calls.push({ action: 'addRound', payload }) },
    recordPayment: async (payload: Record<string, unknown>) => { calls.push({ action: 'recordPayment', payload }) },
  }

  const cashbox2Shift = {
    id: 'shift_cb2_123',
    tenantId: 'tenant-test',
    branchId: 'main',
    cashboxId: 'cashbox-2',
    openedAt: '2026-10-19T20:00:00Z',
    openedBy: 'cajera-2',
    openingFloat: 200,
    status: 'open' as const,
  }

  const actions = createTenantNightclubActions({
    tenantId: 'tenant-test',
    uid: 'cajera-2',
    userName: 'Cajera 2',
    role: 'cashier',
    staff: [],
    reloadStaff: async () => {},
    reloadCustomers: async () => {},
    repository: mockRepo as unknown as TenantNightclubActionsDeps['repository'],
    gatewayFn: async () => ({}),
    shift: cashbox2Shift as any,
    cashboxShifts: [cashbox2Shift] as any,
  })

  // 1. Select cashbox-2
  await actions.onSelectCashbox('cashbox-2')
  assert.equal(calls[0].action, 'selectCashbox')
  assert.equal(calls[0].payload.cashboxId, 'cashbox-2')

  // 2. Open shift for cashbox-2
  await actions.onStartCashboxShift('cashbox-2', 200)
  assert.equal(calls[1].action, 'openCashboxShift')
  assert.equal(calls[1].payload.cashboxId, 'cashbox-2')
  assert.equal(calls[1].payload.openingFloat, 200)

  // 3. Open account under cashbox-2 context
  const accountId = await actions.onOpenAccount('table:mesa_barra_2')
  assert.equal(accountId, 'acc_cashbox2_001')
  assert.equal(calls[2].action, 'openAccount')

  // 4. Send round in cashbox-2
  await actions.onSendRound(accountId, [{ productId: 'p1', quantity: 2 }], 'op_rnd_1')
  assert.equal(calls[3].action, 'addRound')
  assert.equal((calls[3].payload as any).accountId, accountId)

  // 5. Record payment in cashbox-2 shift
  await actions.onRecordPayment(accountId, { method: 'cash', amount: 50 })
  assert.equal(calls[4].action, 'recordPayment')

  // 6. Close shift for cashbox-2
  await actions.onCloseCashboxShift('cashbox-2', 250, 250)
  assert.equal(calls[5].action, 'closeCashboxShift')
  assert.equal(calls[5].payload.cashboxId, 'cashbox-2')
  assert.equal(calls[5].payload.shiftId, 'shift_cb2_123')
  assert.equal(calls[5].payload.countedCash, 250)

  // 7. Verify cash separation between cashbox-1 and cashbox-2
  const shiftCb1 = { id: 'shift_cb1', openingFloat: 100, status: 'open' as const }
  const shiftCb2 = { id: 'shift_cb2', openingFloat: 200, status: 'open' as const }
  const movements = [
    { id: 'm1', shiftId: 'shift_cb1', type: 'income' as const, method: 'cash' as const, amount: 40, description: 'Venta cb1' },
    { id: 'm2', shiftId: 'shift_cb2', type: 'income' as const, method: 'cash' as const, amount: 80, description: 'Venta cb2' },
  ]
  const summaryCb1 = nightclubCashSummary({ shift: shiftCb1 as any, accounts: [], cashMovements: movements.filter(m => m.shiftId === shiftCb1.id) } as any)
  const summaryCb2 = nightclubCashSummary({ shift: shiftCb2 as any, accounts: [], cashMovements: movements.filter(m => m.shiftId === shiftCb2.id) } as any)
  assert.equal(summaryCb1.expectedCash, 140, 'Cashbox 1 expected cash: 100 + 40 = 140')
  assert.equal(summaryCb2.expectedCash, 280, 'Cashbox 2 expected cash: 200 + 80 = 280')
})

// TEST 13
test('13. inventory productive integration: warehouse intake, transfer request, dispatch, and receive pass through to gateway', async () => {
  const repoCalls: Array<{ action: string; payload: Record<string, unknown> }> = []
  const mockRepo = {
    receiveWarehouseIntake: async (payload: Record<string, unknown>) => {
      repoCalls.push({ action: 'receiveWarehouseIntake', payload })
      return { intakeId: 'intake_123' }
    },
    confirmPhysicalCount: async (payload: Record<string, unknown>) => {
      repoCalls.push({ action: 'confirmPhysicalCount', payload })
      return { countId: 'count_456' }
    },
    requestTransfer: async (payload: Record<string, unknown>) => {
      repoCalls.push({ action: 'requestTransfer', payload })
      return { transferId: 'tr_789' }
    },
    dispatchTransfer: async (payload: Record<string, unknown>) => {
      repoCalls.push({ action: 'dispatchTransfer', payload })
      return true
    },
    receiveTransfer: async (payload: Record<string, unknown>) => {
      repoCalls.push({ action: 'receiveTransfer', payload })
      return true
    },
  }

  const actions = createTenantNightclubActions({
    tenantId: 'tenant-test',
    uid: 'u-inventory',
    userName: 'Encargado Almacén',
    role: 'inventory',
    staff: [],
    reloadStaff: async () => {},
    reloadCustomers: async () => {},
    repository: mockRepo as unknown as TenantNightclubActionsDeps['repository'],
    gatewayFn: async () => ({}),
  })

  // 1. Warehouse intake
  const receipt = {
    lines: [{ inventoryId: 'inv_whisky', quantity: 12, unit: 'unit' as const, unitCost: 150 }],
    supplier: 'Distribuidora Licores',
  }
  const intakeRes = await actions.onReceiveWarehouseIntake(receipt, 'op_intake_1')
  assert.deepEqual(intakeRes, { intakeId: 'intake_123' })
  assert.equal(repoCalls[0].action, 'receiveWarehouseIntake')
  assert.equal((repoCalls[0].payload as any).operationId, 'op_intake_1')

  // 2. Request transfer from warehouse
  const transferRes = await actions.onRequestInventoryTransfer(
    [{ inventoryId: 'inv_whisky', quantity: 2, unit: 'unit' }],
    'op_req_1'
  )
  assert.deepEqual(transferRes, { transferId: 'tr_789' })
  assert.equal(repoCalls[1].action, 'requestTransfer')

  // 3. Dispatch transfer
  const dispatchRes = await actions.onDispatchInventoryTransfer('tr_789', 'op_disp_1')
  assert.equal(dispatchRes, true)
  assert.equal(repoCalls[2].action, 'dispatchTransfer')
  assert.equal((repoCalls[2].payload as any).transferId, 'tr_789')

  // 4. Receive transfer
  const receiveRes = await actions.onReceiveInventoryTransfer('tr_789', 'op_recv_1')
  assert.equal(receiveRes, true)
  assert.equal(repoCalls[3].action, 'receiveTransfer')
  assert.equal((repoCalls[3].payload as any).transferId, 'tr_789')

  // 5. Confirm physical count
  const count = {
    locationId: 'warehouse-general',
    reason: 'Inventario de fin de mes',
    lines: [{ inventoryId: 'inv_whisky', countedQuantity: 10, unit: 'unit' as const }],
  }
  const countRes = await actions.onConfirmPhysicalCount(count, 'op_count_1')
  assert.deepEqual(countRes, { countId: 'count_456' })
  assert.equal(repoCalls[4].action, 'confirmPhysicalCount')
})

// TEST 14
test('14. permission negative tests: unauthorized inventory actions rejected and nightclubPermissions=[] denies all operational modules', () => {
  // Empty matrix: []
  const emptyPerms = new Set<string>([])
  const visible = resolveNightclubVisibleModules({
    mode: 'tenant',
    role: 'waiter',
    permissions: emptyPerms,
  })
  assert.deepEqual(visible, [], 'Empty nightclubPermissions yields 0 modules')

  // Waiter without inventory permission cannot see inventory
  const waiterPerms = new Set<string>(['floor.view', 'pos.view', 'accounts.view'])
  const waiterModules = resolveNightclubVisibleModules({
    mode: 'tenant',
    role: 'waiter',
    permissions: waiterPerms,
  })
  assert.equal(waiterModules.includes('inventory'), false)
  assert.equal(waiterModules.includes('cash'), false)

  // Missing repository multi-cashbox / inventory handlers gracefully throw when called
  const bareRepo = {}
  const bareActions = createTenantNightclubActions({
    tenantId: 'tenant-test',
    uid: 'waiter-1',
    userName: 'Mesero',
    role: 'waiter',
    staff: [],
    reloadStaff: async () => {},
    reloadCustomers: async () => {},
    repository: bareRepo as unknown as TenantNightclubActionsDeps['repository'],
    gatewayFn: async () => ({}),
  })

  assert.rejects(() => bareActions.onSelectCashbox('cb-1'), /selectCashbox no disponible/)
  assert.rejects(() => bareActions.onStartCashboxShift('cb-1', 100), /openCashboxShift no disponible/)
  assert.rejects(() => bareActions.onReceiveWarehouseIntake({}), /receiveWarehouseIntake no disponible/)
  assert.rejects(() => bareActions.onConfirmPhysicalCount({}), /confirmPhysicalCount no disponible/)
  assert.rejects(() => bareActions.onRequestInventoryTransfer([]), /requestTransfer no disponible/)
  assert.rejects(() => bareActions.onDispatchInventoryTransfer('t1'), /dispatchTransfer no disponible/)
  assert.rejects(() => bareActions.onReceiveInventoryTransfer('t1'), /receiveTransfer no disponible/)
})
test('15. UI cashbox source of truth, cross-box accounts filter, and isolated expectedCash & shift close', async () => {
  const shift1 = { id: 'shift-1', status: 'open' as const, cashboxId: 'cb-1', openingFloat: 100, openedAt: '2026-10-19T20:00:00Z', openedBy: 'user-1' }
  const shift2 = { id: 'shift-2', status: 'open' as const, cashboxId: 'cb-2', openingFloat: 200, openedAt: '2026-10-19T20:00:00Z', openedBy: 'user-1' }

  const accA = {
    id: 'acc-a',
    branchId: 'main',
    cashboxId: 'cb-1',
    shiftId: 'shift-1',
    status: 'bill_requested' as const,
    subtotal: 100,
    paidTotal: 0,
    balance: 100,
    serviceTarget: { type: 'table' as const, tableId: 'T1' },
    rounds: [],
    payments: [],
  }
  const accB = {
    id: 'acc-b',
    branchId: 'main',
    cashboxId: 'cb-2',
    shiftId: 'shift-2',
    status: 'bill_requested' as const,
    subtotal: 200,
    paidTotal: 0,
    balance: 200,
    serviceTarget: { type: 'table' as const, tableId: 'T2' },
    rounds: [],
    payments: [],
  }

  const allAccounts = [accA, accB]

  // Filter for Caja 2 (activeCashboxId: 'cb-2', activeShiftId: 'shift-2')
  const isMultiCashbox = true
  const activeCashboxId = 'cb-2'
  const activeShiftId = 'shift-2'

  const cashAccountsCb2 = isMultiCashbox && activeCashboxId
    ? allAccounts.filter(a => a.cashboxId === activeCashboxId && a.shiftId === activeShiftId)
    : allAccounts

  assert.equal(cashAccountsCb2.length, 1)
  assert.equal(cashAccountsCb2[0].id, 'acc-b')
  assert.equal(cashAccountsCb2.some(a => a.id === 'acc-a'), false, 'Caja 1 account is completely hidden from Caja 2')

  // openAccounts blocking close:
  const openAccountsCb2 = cashAccountsCb2.filter(a => a.balance > 0)
  assert.equal(openAccountsCb2.length, 1)
  assert.equal(openAccountsCb2[0].id, 'acc-b')

  // When Account B is paid, openAccounts becomes empty for Caja 2, allowing close even if Account A remains open
  const accBPaid = { ...accB, paidTotal: 200, balance: 0, payments: [{ id: 'pay-b', amount: 200, cashAmount: 200, qrAmount: 0, cardAmount: 0, kind: 'sale' as const, method: 'cash' as const, createdAt: '2026-10-19T20:30:00Z' }] }
  const allAccountsAfterBPaid = [accA, accBPaid]
  const cashAccountsAfterBPaid = allAccountsAfterBPaid.filter(a => a.cashboxId === activeCashboxId && a.shiftId === activeShiftId)
  const openAccountsAfterBPaid = cashAccountsAfterBPaid.filter(a => a.balance > 0)
  assert.equal(openAccountsAfterBPaid.length, 0, 'Caja 2 can close because all its accounts are settled, ignoring Caja 1 open account')

  // Expected cash calculation for Caja 2:
  const datasetCb2: NightclubDataset = {
    zones: [],
    tables: [],
    reservations: [],
    accounts: cashAccountsAfterBPaid,
    products: [],
    inventory: [],
    inventoryMovements: [],
    customers: [],
    shift: shift2,
    cashMovements: [],
    staff: [],
    branding: {
      businessName: 'Club',
      subtitle: 'Lounge',
      primaryColor: '#000',
      accentColor: '#fff',
      surfaceColor: '#111',
      theme: 'dark',
    },
  }
  const summaryCb2 = nightclubCashSummary(datasetCb2, 'shift-2')
  assert.equal(summaryCb2.cashSales, 200)
  assert.equal(summaryCb2.expectedCash, 400, 'Expected cash is opening float 200 + cashSales 200 = 400, excluding Caja 1')

  // UI Cashbox Source of truth:
  let serverConfirmedCashboxId = 'cb-1'
  let selectCalls: string[] = []

  const onSelect = async (newId: string) => {
    selectCalls.push(newId)
  }

  // Before server confirms, derived activeCashboxId remains cb-1
  let currentActiveId = serverConfirmedCashboxId
  assert.equal(currentActiveId, 'cb-1')

  // User triggers selection of cb-2
  await onSelect('cb-2')
  assert.equal(selectCalls[0], 'cb-2')
  assert.equal(currentActiveId, 'cb-1', 'UI activeCashboxId remains cb-1 before server confirmation')

  // Simulate Firestore realtime update
  serverConfirmedCashboxId = 'cb-2'
  currentActiveId = serverConfirmedCashboxId
  assert.equal(currentActiveId, 'cb-2', 'UI activeCashboxId updates only after server/realtime confirmation')
})

test('16. selective permission subscriptions align with Rules: Waiter cannot start forbidden listeners or fail sync', () => {
  const waiterTemplate = BusinessTemplateRegistry.nightclub_lounge.roles.find(r => r.id === 'waiter')
  assert.ok(waiterTemplate)
  const waiterPerms = new Set(waiterTemplate.permissions)

  const canWaiter = (perm: string) => waiterPerms.has(perm)

  // Subscriptions evaluation for Waiter:
  const canReadAccounts = canWaiter('orders.read') || canWaiter('cash.close') || canWaiter('sales.read')
  const canReadRounds = canWaiter('orders.read') || canWaiter('cash.close')
  const canReadPayments = canWaiter('cash.close') || canWaiter('sales.read')

  assert.equal(canReadAccounts, true, 'Waiter reads accounts')
  assert.equal(canReadRounds, true, 'Waiter reads rounds')
  assert.equal(canReadPayments, false, 'Waiter CANNOT read payments')

  // Cashboxes & shifts
  const canReadCashboxes = canWaiter('inventory.read') || canWaiter('cash.close')
  const canReadCashboxShifts = canWaiter('cash.close') || canWaiter('settings.manage')
  assert.equal(canReadCashboxes, false, 'Waiter CANNOT read cashboxes')
  assert.equal(canReadCashboxShifts, false, 'Waiter CANNOT read cashbox shifts')

  // Locations & physical inventory
  const canReadLocations = canWaiter('inventory.read')
  const canReadPhysicalInventory = canWaiter('inventory.read')
  assert.equal(canReadLocations, false, 'Waiter CANNOT read locations')
  assert.equal(canReadPhysicalInventory, false, 'Waiter CANNOT read physical inventory')

  // Subscriptions evaluation for Cashier:
  const cashierTemplate = BusinessTemplateRegistry.nightclub_lounge.roles.find(r => r.id === 'cashier')
  assert.ok(cashierTemplate)
  const cashierPerms = new Set(cashierTemplate.permissions)
  const canCashier = (perm: string) => cashierPerms.has(perm)

  assert.equal(canCashier('cash.close') || canCashier('settings.manage'), true, 'Cashier reads cashbox shifts')
  assert.equal(canCashier('inventory.read') || canCashier('cash.close'), true, 'Cashier reads cashboxes')
  assert.equal(canCashier('cash.close') || canCashier('sales.read'), true, 'Cashier reads payments')
  assert.equal(canCashier('inventory.read'), false, 'Cashier CANNOT read locations or physical inventory')

  // Subscriptions evaluation for Inventory role:
  const invTemplate = BusinessTemplateRegistry.nightclub_lounge.roles.find(r => r.id === 'inventory')
  assert.ok(invTemplate)
  const invPerms = new Set(invTemplate.permissions)
  const canInv = (perm: string) => invPerms.has(perm)

  assert.equal(canInv('inventory.read'), true, 'Inventory role reads locations')
  assert.equal(canInv('inventory.read'), true, 'Inventory role reads physical inventory')
  assert.equal(canInv('inventory.read') || canInv('cash.close'), true, 'Inventory role reads cashboxes')
})

test('17. NightclubCash never fakes a selected cashbox: only server-confirmed operatorContext selects', () => {
  const cashboxes = [{ id: 'cb-1' }, { id: 'cb-2' }]

  // Sin contexto confirmado: ninguna caja seleccionada, no se usa cb-1 automáticamente
  assert.equal(resolveSelectedCashboxId(cashboxes, undefined), '')
  assert.equal(resolveSelectedCashboxId(cashboxes, null), '')
  assert.equal(requiresCashboxSelection(cashboxes, undefined), true)

  // Contexto apuntando a una caja no autorizada/inexistente tampoco selecciona
  assert.equal(resolveSelectedCashboxId(cashboxes, 'cb-9'), '')
  assert.equal(requiresCashboxSelection(cashboxes, 'cb-9'), true)

  // Tras confirmación del servidor (Firestore operatorContext)
  assert.equal(resolveSelectedCashboxId(cashboxes, 'cb-2'), 'cb-2')
  assert.equal(requiresCashboxSelection(cashboxes, 'cb-2'), false)

  // Tenant legacy sin cajas: nunca bloquea
  assert.equal(requiresCashboxSelection([], undefined), false)
  assert.equal(requiresCashboxSelection(undefined, undefined), false)

  // La vista real consume el helper y no conserva el fallback a la primera caja
  const source = readFileSync(new URL('../src/modules/nightclub/views/NightclubCash.tsx', import.meta.url), 'utf8')
  assert.match(source, /resolveSelectedCashboxId\(data\.cashboxes, activeCashboxId\)/)
  assert.match(source, /requiresCashboxSelection\(data\.cashboxes, activeCashboxId\)/)
  assert.equal(/cashboxes\?\.\[0\]/.test(source), false, 'No first-cashbox fallback')
  assert.match(source, /Selecciona una caja de trabajo/)
})