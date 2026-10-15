// @ts-expect-error Node test types are intentionally absent from the browser tsconfig.
import assert from 'node:assert/strict'
// @ts-expect-error Node test types are intentionally absent from the browser tsconfig.
import test from 'node:test'
import { createNightclubDataset } from '../../../../demo/datasets/nightclub/nightclubDatasets.ts'
import { demoCan, demoPermissionSet, guardNightclubDemoController } from '../../../../demo/nightclub/nightclubDemoAccess.ts'
import { NIGHTCLUB_ROLE_DEFAULTS } from '../nightclubUsers.ts'
import { openNightclubAccount, sendNightclubRound } from '../nightclubAccounts.ts'

test('administrador y perfiles activos usan sus permisos individuales; inactivo no accede', () => {
  const data = createNightclubDataset('empty')
  const user = { id: 'juan', name: 'Juan', role: 'waiter' as const, active: true, permissions: ['pos.view', 'pos.create'] }
  assert.equal(demoCan(null, 'inventory', 'delete'), true)
  assert.equal(demoCan(demoPermissionSet(data, user, user.id), 'pos', 'create'), true)
  assert.equal(demoCan(demoPermissionSet(data, user, user.id), 'cash', 'view'), false)
  assert.equal(demoCan(demoPermissionSet(data, { ...user, active: false }, user.id), 'pos'), false)
  assert(NIGHTCLUB_ROLE_DEFAULTS.partner.every(permission => permission.endsWith('.view')))
})

test('los comandos rechazan acceso directo y distinguen crear de editar', () => {
  const data = createNightclubDataset('empty')
  data.customers = [{ id: 'known', name: 'Cliente existente', phone: '' }] as typeof data.customers
  const calls: string[] = []
  const controller = { data, onSaveCustomer: (customer: { id: string }) => { calls.push(customer.id) }, onRecordPayment: () => { calls.push('payment') } }
  const partner = guardNightclubDemoController(controller, new Set(['customers.view']), { id: 'socio', name: 'Socio', role: 'partner', active: true })
  assert.throws(() => partner.onSaveCustomer({ id: 'new' }), /permiso/)
  assert.throws(() => partner.onRecordPayment(), /permiso/)
  const creator = guardNightclubDemoController(controller, new Set(['customers.view', 'customers.create']), { id: 'juan', name: 'Juan', role: 'waiter', active: true })
  creator.onSaveCustomer({ id: 'new' })
  assert.throws(() => creator.onSaveCustomer({ id: 'known' }), /permiso/)
  assert.deepEqual(calls, ['new'])
})

test('mesero queda asignado a su ronda y no opera pedidos de otro responsable', () => {
  const data = createNightclubDataset('empty')
  data.accounts = [{ id: 'other', openedBy: 'Otro', openedAt: '', status: 'open', subtotal: 0, rounds: [{ id: 'round', serviceStaffId: 'otro' }] }] as typeof data.accounts
  let assigned = ''
  const controller = { data, onSendRound: (...args: unknown[]) => { assigned = String(args[4]) }, onDeliverRound: (accountId: string, roundId: string) => { assert.equal(accountId, 'mine'); assert.equal(roundId, 'round') } }
  const waiter = guardNightclubDemoController(controller, new Set(['pos.view', 'pos.create', 'accounts.view', 'accounts.edit']), { id: 'juan', name: 'Juan', role: 'waiter', active: true })
  waiter.onSendRound('mine', [], 'op', null, undefined)
  assert.equal(assigned, 'juan')
  assert.throws(() => waiter.onDeliverRound('other', 'round'), /otro responsable/)
})

test('caja requiere permiso especial de cierre y Barra no adquiere entregas', () => {
  const data = createNightclubDataset('empty')
  let closed = false
  const controller = { data, onCloseShift: () => { closed = true }, onAdvanceRound: () => true, onDeliverRound: () => true }
  const cashier = guardNightclubDemoController(controller, new Set(['cash.view', 'cash.edit']), { id: 'caja', name: 'Caja', role: 'cashier', active: true })
  assert.throws(() => cashier.onCloseShift(), /permiso/)
  assert.equal(closed, false)
  const authorized = guardNightclubDemoController(controller, new Set(['cash.view', 'cash.edit', 'special.closeCash']), { id: 'caja', name: 'Caja', role: 'cashier', active: true })
  authorized.onCloseShift()
  assert.equal(closed, true)
  const bar = guardNightclubDemoController(controller, new Set(['bar.view', 'bar.edit']), { id: 'bar', name: 'Bar', role: 'bar', active: true })
  assert.equal(bar.onAdvanceRound(), true)
  assert.throws(() => bar.onDeliverRound(), /permiso/)
})
test('ronda real de Mesero conserva responsable, pasa por Barra y no cobra al enviarla', () => {
  let data = createNightclubDataset('empty')
  data.shift = { id: 'shift', status: 'open', openedAt: '2026-10-08T20:00:00Z', openedBy: 'Caja', openingFloat: 0 }
  data.staff = [{ id: 'waiter-qa', name: 'Mesero QA', role: 'waiter', active: true }]
  data.products = [{ id: 'beer', name: 'Cerveza', category: 'Bebidas', price: 25, preparationArea: 'Barra', stockUnits: 5, inventoryMode: 'unit', recipe: [{ inventoryId: 'beer-stock', quantity: 1 }] }]
  data.inventory = [{ id: 'beer-stock', name: 'Cerveza', unit: 'unit', current: 5, minimum: 0 }]
  data = openNightclubAccount(data, 'night-table-general-1', 'Mesero QA', '2026-10-08T20:01:00Z')
  data = sendNightclubRound(data, data.accounts[0].id, [{ productId: 'beer', quantity: 1 }], 'Mesero QA', '2026-10-08T20:02:00Z', 'waiter-order', null, 'waiter-qa')
  assert.equal(data.accounts[0].rounds[0].serviceStaffId, 'waiter-qa')
  assert.equal(data.accounts[0].rounds[0].status, 'pending')
  assert.equal(data.accounts[0].payments?.length || 0, 0)
  assert.equal(data.inventory[0].current, 4)
})

test('mesero no puede pagar comisiones aunque reciba permisos especiales y conserva su identidad vendedora', () => {
  const data = createNightclubDataset('empty')
  let seller = ''
  let paid = false
  const controller = { data, onSettleRound: (...args: unknown[]) => { seller = String(args[4]) }, onPayCommissions: () => { paid = true } }
  const waiter = guardNightclubDemoController(controller, new Set(['pos.view', 'pos.create', 'cash.create', 'users.view', 'users.edit', 'special.approveOperations']), { id: 'waiter-1', name: 'Marco', role: 'waiter', active: true })
  waiter.onSettleRound('account', [], {}, 'op', 'other-user')
  assert.equal(seller, 'waiter-1')
  assert.throws(() => waiter.onPayCommissions(), /Solo Administración/)
  assert.equal(paid, false)
})
