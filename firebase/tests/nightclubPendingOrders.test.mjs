import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

const projectId = 'demo-pachax-platform'
process.env.FIRESTORE_EMULATOR_HOST ||= '127.0.0.1:8185'
process.env.FIREBASE_AUTH_EMULATOR_HOST ||= '127.0.0.1:9195'
const require = createRequire(new URL('../../functions/package.json', import.meta.url))
const { initializeApp, deleteApp } = require('firebase-admin/app')
const { getAuth } = require('firebase-admin/auth')
const { getFirestore } = require('firebase-admin/firestore')
const { getTemplate } = require('./generated/templates.js')
const suffix = Date.now().toString(36)
const tenantId = `nightclub-pending-${suffix}`
const cashier = `cashier-${suffix}`
const denied = `denied-${suffix}`
const closed = `closed-${suffix}`
const app = initializeApp({ projectId }, `nightclub-pending-${suffix}`)
const admin = getFirestore(app)
const auth = getAuth(app)
const root = admin.doc(`tenants/${tenantId}`)
const pass = label => console.log(`PASS ${label}`)

async function token(uid) {
  await auth.createUser({ uid, email: `${uid}@example.test`, password: 'Emulator123!' })
  const response = await fetch('http://127.0.0.1:9195/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=emulator', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: `${uid}@example.test`, password: 'Emulator123!', returnSecureToken: true }) })
  assert.equal(response.ok, true)
  return (await response.json()).idToken
}
async function command(idToken, commandType, operationId, branchId, payload) {
  const response = await fetch(`http://127.0.0.1:5101/${projectId}/southamerica-west1/tenantGateway`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${idToken}` }, body: JSON.stringify({ data: { action: 'nightclubCommand', tenantId, branchId, commandType, operationId, payload } }) })
  return { response, body: await response.json() }
}

try {
  const template = getTemplate('nightclub_lounge')
  await root.set({ tenantId, businessType: 'nightclub_lounge', configuration: template.defaults })
  for (const role of template.roles) await root.collection('roles').doc(role.id).set({ ...role, tenantId })
  await root.collection('members').doc(cashier).set({ uid: cashier, tenantId, roleId: 'cashier', status: 'active', branchIds: ['main'], cashboxIds: ['cashbox-2'] })
  await root.collection('members').doc(denied).set({ uid: denied, tenantId, roleId: 'restricted', status: 'active', branchIds: ['main'], cashboxIds: ['cashbox-2'] })
  await root.collection('members').doc(closed).set({ uid: closed, tenantId, roleId: 'cashier', status: 'active', branchIds: ['main'], cashboxIds: ['cashbox-3'] })
  for (const number of [1, 2, 3, 4]) await root.collection('nightclubCashboxes').doc(`cashbox-${number}`).set({ id: `cashbox-${number}`, tenantId, branchId: 'main', locationId: `cashbox-${number}`, active: true })
  await root.collection('nightclubShifts').doc('shift-2').set({ id: 'shift-2', tenantId, branchId: 'main', cashboxId: 'cashbox-2', locationId: 'cashbox-2', status: 'open' })
  await root.collection('nightclubShifts').doc('shift-3').set({ id: 'shift-3', tenantId, branchId: 'main', cashboxId: 'cashbox-3', locationId: 'cashbox-3', status: 'closed' })
  await root.collection('nightclubOperatorContexts').doc(cashier).set({ id: cashier, tenantId, userId: cashier, branchId: 'main', cashboxId: 'cashbox-2', locationId: 'cashbox-2', activeShiftId: 'shift-2' })
  await root.collection('nightclubOperatorContexts').doc(denied).set({ id: denied, tenantId, userId: denied, branchId: 'main', cashboxId: 'cashbox-2', locationId: 'cashbox-2', activeShiftId: 'shift-2' })
  await root.collection('nightclubOperatorContexts').doc(closed).set({ id: closed, tenantId, userId: closed, branchId: 'main', cashboxId: 'cashbox-3', locationId: 'cashbox-3', activeShiftId: 'shift-3' })
  await root.collection('nightclubProducts').doc('beer').set({ id: 'beer', tenantId, branchId: 'main', name: 'Cerveza', price: 100, active: true, preparationArea: 'Barra', recipe: [{ inventoryId: 'beer-stock', quantity: 1 }] })
  await root.collection('nightclubInventory').doc('beer-stock').set({ id: 'beer-stock', tenantId, branchId: 'main', name: 'Cerveza', current: 50 })
  await root.collection('nightclubInventoryBalances').doc('cashbox-2_beer-stock').set({ id: 'cashbox-2_beer-stock', tenantId, branchId: 'main', locationId: 'cashbox-2', inventoryId: 'beer-stock', quantity: 50 })

  const cashierToken = await token(cashier)
  const open = await command(cashierToken, 'openAccount', 'open-bar-1', 'main', { target: { type: 'bar', displayName: 'Carlos', tableId: undefined } })
  assert.equal(open.response.ok, true)
  const accountId = open.body.result.accountId
  const account = (await root.collection('nightclubAccounts').doc(accountId).get()).data()
  assert.deepEqual({ cashboxId: account.cashboxId, locationId: account.locationId, shiftId: account.shiftId, orderType: account.orderType, target: account.serviceTarget.type }, { cashboxId: 'cashbox-2', locationId: 'cashbox-2', shiftId: 'shift-2', orderType: 'BAR', target: 'bar' })
  assert.equal('tableId' in account.serviceTarget, false)
  pass('Caja 2 abre un pedido en barra sin mesa')

  const pending = await command(cashierToken, 'createPendingRound', 'pending-round-1', 'main', { accountId, items: [{ productId: 'beer', quantity: 3 }] })
  assert.equal(pending.response.ok, true)
  const roundId = pending.body.result.roundId
  const round = (await root.collection('nightclubRounds').doc(roundId).get()).data()
  assert.equal(round.status, 'pending'); assert.equal(round.total, 300); assert.equal(round.items[0].quantity, 3); assert.equal(round.cashboxId, 'cashbox-2'); assert.equal(round.locationId, 'cashbox-2'); assert.equal(round.inventoryConsumptionStatus, 'not_consumed')
  const inventory = (await root.collection('nightclubInventory').doc('beer-stock').get()).data()
  const balance = (await root.collection('nightclubInventoryBalances').doc('cashbox-2_beer-stock').get()).data()
  const payments = await root.collection('nightclubPayments').get()
  assert.equal(inventory.current, 50); assert.equal(balance.quantity, 50); assert.equal(payments.empty, true)
  pass('Ronda pendiente conserva productos y no crea pago ni consumo FIFO')

  const retry = await command(cashierToken, 'createPendingRound', 'pending-round-1', 'main', { accountId, items: [{ productId: 'beer', quantity: 3 }] })
  assert.equal(retry.response.ok, true); assert.equal(retry.body.result.roundId, roundId)
  assert.equal((await root.collection('nightclubRounds').get()).size, 1)
  pass('Reintento con operationId no duplica la ronda')

  const deniedToken = await token(denied)
  assert.equal((await command(deniedToken, 'openAccount', 'denied-open', 'main', { target: { type: 'bar' } })).response.ok, false)
  assert.equal((await command(cashierToken, 'openAccount', 'wrong-branch', 'other', { target: { type: 'bar' } })).response.ok, false)
  const closedToken = await token(closed)
  assert.equal((await command(closedToken, 'openAccount', 'closed-open', 'main', { target: { type: 'bar' } })).response.ok, false)
  pass('Permiso, sucursal ajena y turno cerrado se rechazan')

  await root.collection('nightclubOperatorContexts').doc(cashier).update({ cashboxId: 'cashbox-1', locationId: 'cashbox-1', activeShiftId: null })
  const stale = await command(cashierToken, 'createPendingRound', 'stale-context', 'main', { accountId, items: [{ productId: 'beer', quantity: 1 }] })
  assert.equal(stale.response.ok, false)
  assert.equal((await root.collection('nightclubRounds').get()).size, 1)
  pass('Cambio de caja invalida el contexto anterior sin crear una ronda')
} finally { await deleteApp(app) }
