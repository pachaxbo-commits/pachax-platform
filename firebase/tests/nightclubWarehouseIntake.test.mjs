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
const tenantId = `nightclub-warehouse-${suffix}`
const adminUid = `warehouse-admin-${suffix}`
const waiterUid = `warehouse-waiter-${suffix}`
const app = initializeApp({ projectId }, `nightclub-warehouse-${suffix}`)
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

async function command(token, operationId, receipt, context = {}) {
  const response = await fetch(`http://127.0.0.1:5101/${projectId}/southamerica-west1/tenantGateway`, {
    method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({ data: { action: 'nightclubCommand', tenantId: context.tenantId || tenantId, branchId: context.branchId || 'main', operationId, commandType: 'receiveWarehouseIntake', payload: { receipt } } }),
  })
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
  await root.collection('nightclubLocations').doc('warehouse-general').set({ id: 'warehouse-general', branchId: 'main', type: 'warehouse', active: true })
  for (const number of [1, 2, 3, 4]) await root.collection('nightclubLocations').doc(`cashbox-${number}`).set({ id: `cashbox-${number}`, branchId: 'main', type: 'cashbox', active: true })
  await root.collection('nightclubInventory').doc('beer').set({ id: 'beer', branchId: 'main', name: 'Cerveza', unit: 'unit' })
  await root.collection('nightclubInventory').doc('cola').set({ id: 'cola', branchId: 'main', name: 'Cola', unit: 'ml' })
  await root.collection('nightclubInventory').doc('meat').set({ id: 'meat', branchId: 'main', name: 'Carne', unit: 'g' })

  const adminToken = await signIn(adminUid)
  const waiterToken = await signIn(waiterUid)
  const firstReceipt = { supplier: 'Proveedor QA', reference: 'FAC-001', receivedDate: '2026-10-14', notes: 'Recepcion inicial', lines: [{ inventoryId: 'beer', quantity: 100, unit: 'unit', unitCost: 12, totalCost: 1200 }, { inventoryId: 'cola', quantity: 2, unit: 'l', unitCost: 15, totalCost: 30 }, { inventoryId: 'meat', quantity: 3, unit: 'kg', unitCost: 28, totalCost: 84 }] }
  const first = await command(adminToken, 'intake-001', firstReceipt)
  assert.equal(first.response.ok, true)
  assert.equal(result(first).locationId, 'warehouse-general')
  assert.equal(result(first).totalCost, 1314)
  const beerBalance = await root.collection('nightclubInventoryBalances').doc('warehouse-general:beer').get()
  const colaBalance = await root.collection('nightclubInventoryBalances').doc('warehouse-general:cola').get()
  const meatBalance = await root.collection('nightclubInventoryBalances').doc('warehouse-general:meat').get()
  assert.equal(beerBalance.data().availableQuantity, 100)
  assert.equal(colaBalance.data().availableQuantity, 2000)
  assert.equal(meatBalance.data().availableQuantity, 3000)
  assert.equal((await root.collection('nightclubInventoryLots').doc('receiptlot_intake-001_0').get()).data().unitCost, 12)
  assert.equal((await root.collection('nightclubInventoryLots').doc('receiptlot_intake-001_1').get()).data().unitCost, 0.015)
  assert.equal((await root.collection('nightclubInventoryLots').doc('receiptlot_intake-001_2').get()).data().unitCost, 0.028)
  assert.equal((await root.collection('nightclubInventoryMovements').doc('receipt_intake-001_0').get()).data().costAmount, 1200)
  pass('entrada HTTP crea saldos, lotes FIFO, movimientos y conversion L/kg en deposito')

  const second = await command(adminToken, 'intake-002', { reference: 'FAC-002', lines: [{ inventoryId: 'beer', quantity: 25, unit: 'unit', unitCost: 14, totalCost: 350 }] })
  assert.equal(second.response.ok, true)
  assert.equal((await root.collection('nightclubInventoryBalances').doc('warehouse-general:beer').get()).data().availableQuantity, 125)
  const beerLots = await root.collection('nightclubInventoryLots').where('inventoryId', '==', 'beer').get()
  assert.equal(beerLots.size, 2)
  assert.deepEqual(beerLots.docs.map(item => item.data().unitCost).sort((a, b) => a - b), [12, 14])
  pass('dos entradas conservan lotes separados con costos distintos')

  const retry = await command(adminToken, 'intake-002', { reference: 'FAC-002', lines: [{ inventoryId: 'beer', quantity: 25, unit: 'unit', unitCost: 14, totalCost: 350 }] })
  assert.equal(retry.response.ok, true)
  assert.equal((await root.collection('nightclubInventoryBalances').doc('warehouse-general:beer').get()).data().availableQuantity, 125)
  assert.equal((await root.collection('nightclubInventoryMovements').where('operationId', '==', 'intake-002').get()).size, 1)
  pass('operationId repetido no duplica inventario ni movimientos')

  const denied = await command(waiterToken, 'intake-denied', { lines: [{ inventoryId: 'beer', quantity: 1, unit: 'unit', unitCost: 12 }] })
  assert.equal(denied.response.ok, false)
  assert.equal(denied.body.error.status, 'PERMISSION_DENIED')
  const wrongTenant = await command(adminToken, 'intake-wrong-tenant', { lines: [{ inventoryId: 'beer', quantity: 1, unit: 'unit', unitCost: 12 }] }, { tenantId: `${tenantId}-other` })
  assert.equal(wrongTenant.response.ok, false)
  assert.equal(wrongTenant.body.error.status, 'PERMISSION_DENIED')
  const wrongBranch = await command(adminToken, 'intake-wrong-branch', { lines: [{ inventoryId: 'beer', quantity: 1, unit: 'unit', unitCost: 12 }] }, { branchId: 'other-branch' })
  assert.equal(wrongBranch.response.ok, false)
  assert.equal(wrongBranch.body.error.status, 'PERMISSION_DENIED')
  pass('gateway rechaza usuario, tenant y sucursal no autorizados')

  const beforeInvalid = (await root.collection('nightclubInventoryBalances').doc('warehouse-general:beer').get()).data().availableQuantity
  for (const [operationId, receipt] of [
    ['intake-zero', { lines: [{ inventoryId: 'beer', quantity: 0, unit: 'unit', unitCost: 12 }] }],
    ['intake-cost', { lines: [{ inventoryId: 'beer', quantity: 1, unit: 'unit', unitCost: 0 }] }],
    ['intake-unit', { lines: [{ inventoryId: 'beer', quantity: 1, unit: 'ml', unitCost: 1 }] }],
    ['intake-atomic', { lines: [{ inventoryId: 'beer', quantity: 1, unit: 'unit', unitCost: 12 }, { inventoryId: 'missing', quantity: 1, unit: 'unit', unitCost: 1 }] }],
  ]) {
    const invalid = await command(adminToken, operationId, receipt)
    assert.equal(invalid.response.ok, false)
  }
  assert.equal((await root.collection('nightclubInventoryBalances').doc('warehouse-general:beer').get()).data().availableQuantity, beforeInvalid)
  assert.equal((await root.collection('nightclubInventoryLots').where('sourceReferenceId', '==', 'intake-atomic').get()).empty, true)
  pass('cantidad, costo, unidad y error transaccional no dejan registros parciales')

  for (const number of [1, 2, 3, 4]) {
    assert.equal((await root.collection('nightclubInventoryBalances').doc(`cashbox-${number}:beer`).get()).exists, false)
    assert.equal((await root.collection('nightclubInventoryLots').where('locationId', '==', `cashbox-${number}`).where('inventoryId', '==', 'beer').get()).empty, true)
  }
  pass('las cuatro cajas no se modifican por una entrada al deposito')
} finally {
  await deleteApp(app)
}
