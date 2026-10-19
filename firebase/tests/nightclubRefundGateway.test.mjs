import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

const projectId = 'demo-pachax-platform'
process.env.FIRESTORE_EMULATOR_HOST ||= '127.0.0.1:8185'
process.env.FIREBASE_AUTH_EMULATOR_HOST ||= '127.0.0.1:9195'
const require = createRequire(new URL('../../functions/package.json', import.meta.url))
const { initializeApp, deleteApp } = require('firebase-admin/app')
const { getFirestore } = require('firebase-admin/firestore')
const { getAuth } = require('firebase-admin/auth')
const { getTemplate } = require('./generated/templates.js')
const suffix = Date.now().toString(36)
const tenantId = `nightclub-refund-gateway-${suffix}`
const adminUid = `admin-${suffix}`, waiterUid = `waiter-${suffix}`
const app = initializeApp({ projectId }, `nightclub-refund-gateway-${suffix}`)
const db = getFirestore(app), auth = getAuth(app), root = db.doc(`tenants/${tenantId}`)
const signIn = async uid => {
  const response = await fetch('http://127.0.0.1:9195/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=emulator', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: `${uid}@example.test`, password: 'Emulator123!', returnSecureToken: true }) })
  assert.equal(response.ok, true)
  return (await response.json()).idToken
}
const command = async (token, operationId, commandType, payload, context = {}) => {
  const response = await fetch(`http://127.0.0.1:5101/${projectId}/southamerica-west1/tenantGateway`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }, body: JSON.stringify({ data: { action: 'nightclubCommand', tenantId: context.tenantId || tenantId, branchId: context.branchId || 'main', operationId, commandType, payload } }) })
  return { response, body: await response.json() }
}
const result = reply => reply.body.result?.data || reply.body.result
try {
  const template = getTemplate('nightclub_lounge')
  await root.set({ tenantId, businessType: 'nightclub_lounge', configuration: template.defaults })
  for (const role of template.roles) await root.collection('roles').doc(role.id).set({ ...role, tenantId })
  for (const [uid, roleId] of [[adminUid, 'admin'], [waiterUid, 'waiter']]) {
    await auth.createUser({ uid, email: `${uid}@example.test`, password: 'Emulator123!' })
    await root.collection('members').doc(uid).set({ uid, tenantId, roleId, status: 'active', branchIds: ['main'] })
  }
  await root.collection('nightclubShifts').doc('shift-2').set({ id: 'shift-2', branchId: 'main', cashboxId: 'cashbox-2', locationId: 'cashbox-2', status: 'open' })
  await root.collection('nightclubLocations').doc('cashbox-2').set({ id: 'cashbox-2', branchId: 'main', type: 'cashbox', active: true })
  await root.collection('nightclubInventory').doc('beer').set({ branchId: 'main' })
  await root.collection('nightclubInventoryBalances').doc('cashbox-2:beer').set({ locationId: 'cashbox-2', inventoryId: 'beer', availableQuantity: 3 })
  await root.collection('nightclubInventoryLots').doc('beer-lot').set({ locationId: 'cashbox-2', inventoryId: 'beer', remainingQuantity: 3, status: 'available', unitCost: 10, receivedAt: '2026-01-01T00:00:00.000Z' })
  await root.collection('nightclubProducts').doc('beer').set({ branchId: 'main', name: 'Cerveza', active: true, price: 100, preparationArea: 'Directo', recipe: [{ inventoryId: 'beer', quantity: 1, unit: 'unit' }] })
  await root.collection('nightclubAccounts').doc('account-2').set({ id: 'account-2', branchId: 'main', cashboxId: 'cashbox-2', locationId: 'cashbox-2', shiftId: 'shift-2', status: 'open', serviceTarget: { type: 'bar' }, orderType: 'BAR', subtotal: 0, paidTotal: 0, balance: 0, roundCount: 0 })
  const adminToken = await signIn(adminUid), waiterToken = await signIn(waiterUid)
  const sale = await command(waiterToken, 'sale-1', 'settleRound', { accountId: 'account-2', items: [{ productId: 'beer', quantity: 3 }], payment: { method: 'qr', amount: 300 } })
  assert.equal(sale.response.ok, true)
  const saleResult = result(sale)
  const round = (await root.collection('nightclubRounds').doc(saleResult.roundId).get()).data()
  const itemId = round.items[0].id
  const refund = await command(adminToken, 'refund-1', 'refundRound', { accountId: 'account-2', roundId: saleResult.roundId, reason: 'Una cerveza cerrada', returnToStock: true, items: [{ itemId, quantity: 1, returnToStock: true }] })
  assert.equal(refund.response.ok, true)
  assert.equal(result(refund).amount, 100)
  assert.equal((await root.collection('nightclubRounds').doc(saleResult.roundId).get()).data().items[0].refundedQuantity, 1)
  assert.equal((await root.collection('nightclubInventoryBalances').doc('cashbox-2:beer').get()).data().availableQuantity, 1)
  assert.equal((await root.collection('nightclubRefunds').where('roundId', '==', saleResult.roundId).get()).size, 1)
  console.log('PASS gateway real confirma devolución parcial y retorno FIFO en Caja 2')
  const retry = await command(adminToken, 'refund-1', 'refundRound', { accountId: 'account-2', roundId: saleResult.roundId, reason: 'Una cerveza cerrada', returnToStock: true, items: [{ itemId, quantity: 1, returnToStock: true }] })
  assert.equal(retry.response.ok, true)
  assert.equal((await root.collection('nightclubRefunds').where('roundId', '==', saleResult.roundId).get()).size, 1)
  console.log('PASS operationId repetido no duplica la devolución')
  const denied = await command(waiterToken, 'refund-denied', 'refundRound', { accountId: 'account-2', roundId: saleResult.roundId, reason: 'Sin permiso', items: [{ itemId, quantity: 1, returnToStock: false }] })
  assert.equal(denied.response.ok, false)
  assert.equal(denied.body.error.status, 'PERMISSION_DENIED')
  console.log('PASS callable real rechaza devolución sin permiso')
  const wrongTenant = await command(adminToken, 'refund-wrong-tenant', 'refundRound', { accountId: 'account-2', roundId: saleResult.roundId, reason: 'Tenant ajeno', items: [{ itemId, quantity: 1, returnToStock: false }] }, { tenantId: `${tenantId}-other` })
  assert.equal(wrongTenant.response.ok, false)
  assert.equal(wrongTenant.body.error.status, 'PERMISSION_DENIED')
  const wrongBranch = await command(adminToken, 'refund-wrong-branch', 'refundRound', { accountId: 'account-2', roundId: saleResult.roundId, reason: 'Sucursal ajena', items: [{ itemId, quantity: 1, returnToStock: false }] }, { branchId: 'branch-other' })
  assert.equal(wrongBranch.response.ok, false)
  assert.equal(wrongBranch.body.error.status, 'PERMISSION_DENIED')
  console.log('PASS callable real rechaza tenant y sucursal no autorizados')
} finally { await deleteApp(app) }
