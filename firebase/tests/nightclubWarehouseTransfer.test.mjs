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
const tenantId = `nightclub-transfer-${suffix}`
const adminUid = `transfer-admin-${suffix}`
const cashboxUid = `transfer-cashbox-${suffix}`
const wrongCashboxUid = `transfer-wrong-${suffix}`
const waiterUid = `transfer-waiter-${suffix}`
const app = initializeApp({ projectId }, `nightclub-transfer-${suffix}`)
const db = getFirestore(app)
const auth = getAuth(app)
const root = db.doc(`tenants/${tenantId}`)
const pass = message => console.log(`PASS ${message}`)

async function signIn(uid) {
  const response = await fetch('http://127.0.0.1:9195/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=emulator', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: `${uid}@example.test`, password: 'Emulator123!', returnSecureToken: true }),
  })
  assert.equal(response.ok, true)
  return (await response.json()).idToken
}

async function command(token, commandType, operationId, payload, context = {}) {
  const response = await fetch(`http://127.0.0.1:5101/${projectId}/southamerica-west1/tenantGateway`, {
    method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({ data: { action: 'nightclubCommand', tenantId: context.tenantId || tenantId, branchId: context.branchId || 'main', operationId, commandType, payload } }),
  })
  return { response, body: await response.json() }
}
const result = reply => reply.body.result?.data || reply.body.result
const balance = async locationId => (await root.collection('nightclubInventoryBalances').doc(`${locationId}:beer`).get()).data()

try {
  const template = getTemplate('nightclub_lounge')
  await root.set({ tenantId, businessType: 'nightclub_lounge', configuration: template.defaults })
  for (const role of template.roles) await root.collection('roles').doc(role.id).set({ ...role, tenantId })
  for (const [uid, roleId] of [[adminUid, 'admin'], [cashboxUid, 'admin'], [wrongCashboxUid, 'admin'], [waiterUid, 'waiter']]) {
    await auth.createUser({ uid, email: `${uid}@example.test`, password: 'Emulator123!' })
    await root.collection('members').doc(uid).set({ uid, tenantId, roleId, status: 'active', branchIds: ['main'] })
  }
  await root.collection('nightclubLocations').doc('warehouse-general').set({ id: 'warehouse-general', branchId: 'main', type: 'warehouse', active: true })
  for (const number of [1, 2, 3, 4]) await root.collection('nightclubLocations').doc(`cashbox-${number}`).set({ id: `cashbox-${number}`, branchId: 'main', type: 'cashbox', active: true })
  await root.collection('nightclubInventory').doc('beer').set({ id: 'beer', branchId: 'main', name: 'Cerveza', unit: 'unit' })
  await root.collection('nightclubInventory').doc('cola').set({ id: 'cola', branchId: 'main', name: 'Cola', unit: 'ml' })
  await root.collection('nightclubInventoryBalances').doc('warehouse-general:beer').set({ id: 'warehouse-general:beer', branchId: 'main', locationId: 'warehouse-general', inventoryId: 'beer', availableQuantity: 100, reservedQuantity: 0, inTransitQuantity: 0, minimumQuantity: 0, unit: 'unit' })
  for (const number of [1, 2, 3, 4]) await root.collection('nightclubInventoryBalances').doc(`cashbox-${number}:beer`).set({ id: `cashbox-${number}:beer`, branchId: 'main', locationId: `cashbox-${number}`, inventoryId: 'beer', availableQuantity: 0, reservedQuantity: 0, inTransitQuantity: 0, minimumQuantity: 0, unit: 'unit' })
  await root.collection('nightclubInventoryLots').doc('beer-lot-old').set({ id: 'beer-lot-old', branchId: 'main', locationId: 'warehouse-general', inventoryId: 'beer', receivedQuantity: 60, remainingQuantity: 60, unitCost: 10, receivedAt: '2026-10-01T00:00:00.000Z', status: 'available' })
  await root.collection('nightclubInventoryLots').doc('beer-lot-new').set({ id: 'beer-lot-new', branchId: 'main', locationId: 'warehouse-general', inventoryId: 'beer', receivedQuantity: 40, remainingQuantity: 40, unitCost: 12, receivedAt: '2026-10-02T00:00:00.000Z', status: 'available' })
  await root.collection('nightclubInventoryBalances').doc('warehouse-general:cola').set({ id: 'warehouse-general:cola', branchId: 'main', locationId: 'warehouse-general', inventoryId: 'cola', availableQuantity: 1000, reservedQuantity: 0, inTransitQuantity: 0, minimumQuantity: 0, unit: 'ml' })
  await root.collection('nightclubInventoryLots').doc('cola-lot').set({ id: 'cola-lot', branchId: 'main', locationId: 'warehouse-general', inventoryId: 'cola', receivedQuantity: 1000, remainingQuantity: 1000, unitCost: 0.01, receivedAt: '2026-10-03T00:00:00.000Z', status: 'available' })
  await root.collection('nightclubOperatorContexts').doc(cashboxUid).set({ id: cashboxUid, tenantId, branchId: 'main', userId: cashboxUid, cashboxId: 'cashbox-2', locationId: 'cashbox-2', activeShiftId: null })
  await root.collection('nightclubOperatorContexts').doc(wrongCashboxUid).set({ id: wrongCashboxUid, tenantId, branchId: 'main', userId: wrongCashboxUid, cashboxId: 'cashbox-1', locationId: 'cashbox-1', activeShiftId: null })

  const adminToken = await signIn(adminUid)
  const cashboxToken = await signIn(cashboxUid)
  const wrongCashboxToken = await signIn(wrongCashboxUid)
  const waiterToken = await signIn(waiterUid)

  const requested = await command(cashboxToken, 'requestTransfer', 'transfer-request-20', { transfer: { mode: 'pending_receipt', destinationLocationId: 'cashbox-1', lines: [{ inventoryId: 'beer', quantity: 20, unit: 'unit' }] } })
  assert.equal(requested.response.ok, true)
  const transferId = result(requested).transferId
  const requestedDoc = (await root.collection('nightclubTransfers').doc(transferId).get()).data()
  assert.equal(requestedDoc.destinationLocationId, 'cashbox-2')
  assert.equal(requestedDoc.status, 'requested')
  assert.deepEqual(requestedDoc.lines[0].lotAllocations, [])
  pass('Caja 2 solicita 20; el servidor ignora destino cliente y conserva solicitud pendiente')

  const dispatched = await command(adminToken, 'dispatchTransfer', 'transfer-dispatch-20', { transferId })
  assert.equal(dispatched.response.ok, true)
  assert.equal((await balance('warehouse-general')).availableQuantity, 80)
  assert.equal((await balance('cashbox-2')).inTransitQuantity, 20)
  assert.equal((await balance('cashbox-2')).availableQuantity, 0)
  const dispatchedDoc = (await root.collection('nightclubTransfers').doc(transferId).get()).data()
  assert.equal(dispatchedDoc.status, 'in_transit')
  assert.deepEqual(dispatchedDoc.lines[0].lotAllocations, [{ lotId: 'beer-lot-old', quantity: 20, unitCost: 10 }])
  assert.equal((await root.collection('nightclubInventoryLots').doc('beer-lot-old').get()).data().remainingQuantity, 40)
  pass('Depósito despacha FIFO, conserva costo y registra 20 en tránsito')

  const dispatchRetry = await command(adminToken, 'dispatchTransfer', 'transfer-dispatch-20', { transferId })
  assert.equal(dispatchRetry.response.ok, true)
  assert.equal((await balance('warehouse-general')).availableQuantity, 80)
  assert.equal((await balance('cashbox-2')).inTransitQuantity, 20)
  pass('Reintento de despacho con mismo operationId no duplica movimientos')

  const wrongReceipt = await command(wrongCashboxToken, 'receiveTransfer', 'transfer-receive-wrong', { transferId })
  assert.equal(wrongReceipt.response.ok, false)
  assert.equal(wrongReceipt.body.error.status, 'PERMISSION_DENIED')
  assert.equal((await balance('cashbox-2')).inTransitQuantity, 20)
  pass('Caja equivocada no puede recibir una transferencia de Caja 2')

  const received = await command(cashboxToken, 'receiveTransfer', 'transfer-receive-20', { transferId })
  assert.equal(received.response.ok, true)
  assert.equal((await balance('warehouse-general')).availableQuantity, 80)
  assert.equal((await balance('cashbox-2')).availableQuantity, 20)
  assert.equal((await balance('cashbox-2')).inTransitQuantity, 0)
  for (const number of [1, 3, 4]) {
    assert.equal((await balance(`cashbox-${number}`)).availableQuantity, 0)
    assert.equal((await balance(`cashbox-${number}`)).inTransitQuantity, 0)
  }
  const destinationLot = (await root.collection('nightclubInventoryLots').where('sourceReferenceId', '==', transferId).get()).docs[0].data()
  assert.equal(destinationLot.status, 'available')
  assert.equal(destinationLot.unitCost, 10)
  assert.equal(destinationLot.remainingQuantity, 20)
  pass('Caja 2 recibe exactamente 20; Caja 1, 3 y 4 permanecen intactas')

  const receiveRetry = await command(cashboxToken, 'receiveTransfer', 'transfer-receive-20', { transferId })
  assert.equal(receiveRetry.response.ok, true)
  assert.equal((await balance('cashbox-2')).availableQuantity, 20)
  pass('Reintento de recepción con mismo operationId no duplica saldo')

  const multiRequested = await command(cashboxToken, 'requestTransfer', 'transfer-request-multi', { transfer: { mode: 'pending_receipt', lines: [{ inventoryId: 'beer', quantity: 5, unit: 'unit' }, { inventoryId: 'cola', quantity: 250, unit: 'ml' }] } })
  assert.equal(multiRequested.response.ok, true)
  const multiTransferId = result(multiRequested).transferId
  assert.equal((await command(adminToken, 'dispatchTransfer', 'transfer-dispatch-multi', { transferId: multiTransferId })).response.ok, true)
  assert.equal((await command(cashboxToken, 'receiveTransfer', 'transfer-receive-multi', { transferId: multiTransferId })).response.ok, true)
  assert.equal((await balance('warehouse-general')).availableQuantity, 75)
  assert.equal((await balance('cashbox-2')).availableQuantity, 25)
  assert.equal((await root.collection('nightclubInventoryBalances').doc('cashbox-2:cola').get()).data().availableQuantity, 250)
  pass('Una solicitud con varios productos se despacha y recibe de forma atómica')

  const insufficient = await command(cashboxToken, 'requestTransfer', 'transfer-request-oversize', { transfer: { mode: 'pending_receipt', lines: [{ inventoryId: 'beer', quantity: 200, unit: 'unit' }] } })
  assert.equal(insufficient.response.ok, true)
  const insufficientId = result(insufficient).transferId
  const blockedDispatch = await command(adminToken, 'dispatchTransfer', 'transfer-dispatch-oversize', { transferId: insufficientId })
  assert.equal(blockedDispatch.response.ok, false)
  assert.equal((await balance('warehouse-general')).availableQuantity, 75)
  assert.equal((await root.collection('nightclubTransfers').doc(insufficientId).get()).data().status, 'requested')
  pass('Stock insuficiente bloquea el despacho sin consumo parcial')

  const denied = await command(waiterToken, 'requestTransfer', 'transfer-denied', { transfer: { mode: 'pending_receipt', lines: [{ inventoryId: 'beer', quantity: 1, unit: 'unit' }] } })
  assert.equal(denied.response.ok, false)
  assert.equal(denied.body.error.status, 'PERMISSION_DENIED')
  const wrongTenant = await command(cashboxToken, 'requestTransfer', 'transfer-tenant', { transfer: { mode: 'pending_receipt', lines: [{ inventoryId: 'beer', quantity: 1, unit: 'unit' }] } }, { tenantId: `${tenantId}-other` })
  assert.equal(wrongTenant.response.ok, false)
  const wrongBranch = await command(cashboxToken, 'requestTransfer', 'transfer-branch', { transfer: { mode: 'pending_receipt', lines: [{ inventoryId: 'beer', quantity: 1, unit: 'unit' }] } }, { branchId: 'other' })
  assert.equal(wrongBranch.response.ok, false)
  pass('Gateway rechaza usuario sin permiso, tenant y sucursal incorrectos')

  const audit = await root.collection('nightclubAudit').where('resourceId', '==', transferId).get()
  assert.equal(audit.size >= 3, true)
  pass('Auditoría conserva la referencia de transferencia')
} finally {
  await deleteApp(app)
}
