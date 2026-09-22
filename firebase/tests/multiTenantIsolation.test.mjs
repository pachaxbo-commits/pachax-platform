// Runs only against demo-pachax-platform emulators. It never initializes a real project.
import fs from 'node:fs'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing'
import { doc, getDoc, getDocs, collection, setDoc } from 'firebase/firestore'

const projectId = 'demo-pachax-platform'
if (process.env.GCLOUD_PROJECT && process.env.GCLOUD_PROJECT !== projectId) throw new Error('Proyecto no autorizado para QA.')
process.env.FIRESTORE_EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8185'
process.env.FIREBASE_AUTH_EMULATOR_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST || '127.0.0.1:9195'
const require = createRequire(new URL('../../functions/package.json', import.meta.url))
const { initializeApp } = require('firebase-admin/app')
const { getFirestore } = require('firebase-admin/firestore')
const { getAuth } = require('firebase-admin/auth')
const { createTenant, updateSettings } = require('./tenants.cjs')
const { processCommand } = require('./operations.cjs')
const suffix = Date.now().toString(36)
const ids = {
  restaurant: '',
  distribution: '',
  gelateria: '',
  ownerA: `qa-owner-a-${suffix}`,
  ownerB: `qa-owner-b-${suffix}`,
  ownerC: `qa-owner-c-${suffix}`,
  sellerB: `qa-seller-b-${suffix}`,
  cashierA: `qa-cashier-a-${suffix}`,
  disabledA: `qa-disabled-a-${suffix}`,
}
const env = await initializeTestEnvironment({
  projectId,
  firestore: { host: '127.0.0.1', port: 8185, rules: fs.readFileSync('firebase/firestore.rules', 'utf8') },
})
const adminApp = initializeApp({ projectId }, `multi-tenant-${suffix}`)
const admin = getFirestore(adminApp)
const adminAuth = getAuth(adminApp)
let checks = 0
const pass = message => { checks++; console.log('PASS', message) }
const member = (uid, tenantId, roleId, status = 'active', routeIds = []) => ({ uid, tenantId, roleId, status, branchIds: ['main'], routeIds })
async function signIn(uid) {
  const response = await fetch('http://127.0.0.1:9195/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=emulator', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: `${uid}@example.test`, password: 'Emulator123!', returnSecureToken: true }),
  })
  assert(response.ok, `Auth emulator rechazó ${uid}`)
  return (await response.json()).idToken
}
async function tenantGateway(idToken, data) {
  const response = await fetch(`http://127.0.0.1:5101/${projectId}/us-central1/tenantGateway`, {
    method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${idToken}` }, body: JSON.stringify({ data }),
  })
  return { response, body: await response.json() }
}

try {
  for (const uid of [ids.ownerA, ids.ownerB, ids.ownerC]) await adminAuth.createUser({ uid, email: `${uid}@example.test`, password: 'Emulator123!' })
  ids.restaurant = (await createTenant(admin, adminAuth, { auth: { uid: ids.ownerA, token: {} }, data: { action: 'createTenant', operationId: `op-a-${suffix}`, name: 'Restaurante QA', businessType: 'restaurant_pos' } })).tenantId
  ids.distribution = (await createTenant(admin, adminAuth, { auth: { uid: ids.ownerB, token: {} }, data: { action: 'createTenant', operationId: `op-b-${suffix}`, name: 'Distribuidora QA', businessType: 'route_distribution' } })).tenantId
  ids.gelateria = (await createTenant(admin, adminAuth, { auth: { uid: ids.ownerC, token: {} }, data: { action: 'createTenant', operationId: `op-c-${suffix}`, name: 'Heladería QA', businessType: 'gelateria_weight_cafe' } })).tenantId
  pass('Functions crea tenants A/B/C con owner, roles y branch')
  await assert.rejects(() => updateSettings(admin, { auth: { uid: ids.ownerA, token: {} }, data: { tenantId: ids.distribution, name: 'Ataque cruzado' } }), error => error.code === 'permission-denied')
  pass('Function rechaza mutación cruzada A hacia B')
  await updateSettings(admin, { auth: { uid: ids.ownerA, token: {} }, data: { tenantId: ids.restaurant, name: 'Restaurante QA actualizado' } })
  pass('Function autoriza al owner dentro de su empresa')
  const tokenA = await signIn(ids.ownerA)
  const membershipsA = await tenantGateway(tokenA, { action: 'listMemberships' })
  assert(membershipsA.response.ok)
  const membershipRows = membershipsA.body.result?.data || membershipsA.body.result
  assert.deepEqual(membershipRows.map(item => item.tenant.tenantId), [ids.restaurant]); pass('callable real devuelve solo memberships del usuario autenticado')
  const crossCallable = await tenantGateway(tokenA, { action: 'updateSettings', tenantId: ids.distribution, name: 'Ataque callable' })
  assert(!crossCallable.response.ok && crossCallable.body.error.status === 'PERMISSION_DENIED'); pass('callable real rechaza mutación cruzada A hacia B')
  const createdCashier = await tenantGateway(tokenA, { action: 'createMember', tenantId: ids.restaurant, operationId: `cashier-${suffix}`, email: `cashier-${suffix}@example.test`, password: 'Cashier123!', displayName: 'Caja QA', roleId: 'cashier', branchIds: ['main'], routeIds: [] })
  assert(createdCashier.response.ok)
  ids.cashierA = (createdCashier.body.result?.data || createdCashier.body.result).uid
  assert.equal((await admin.doc(`tenants/${ids.restaurant}/members/${ids.cashierA}`).get()).data().roleId, 'cashier'); pass('owner crea usuario interno y membership solo mediante Function')
  const dist = admin.doc(`tenants/${ids.distribution}`)
  await dist.collection('members').doc(ids.sellerB).set(member(ids.sellerB, ids.distribution, 'distributor', 'active', ['north']))
  await admin.doc(`tenants/${ids.restaurant}/members/${ids.disabledA}`).set(member(ids.disabledA, ids.restaurant, 'owner', 'disabled'))
  await admin.doc(`tenants/${ids.distribution}/distProducts/product`).set({ id: 'product', tenantId: ids.distribution, name: 'Producto QA', unitType: 'unit', referencePrice: 10, active: true })
  await admin.doc(`tenants/${ids.distribution}/distSales/own`).set({ tenantId: ids.distribution, branchId: 'main', routeId: 'north', sellerUid: ids.sellerB })
  await admin.doc(`tenants/${ids.distribution}/distSales/foreign-route`).set({ tenantId: ids.distribution, branchId: 'main', routeId: 'south', sellerUid: 'other' })
  await admin.doc(`tenants/${ids.distribution}/distCustomers/customer`).set({ id: 'customer', tenantId: ids.distribution, name: 'Cliente QA' })

  const operationRef = admin.doc(`tenants/${ids.distribution}/distOperations/shared-operation-id`)
  await operationRef.set({ id: 'shared-operation-id', tenantId: ids.distribution, branchId: 'main', createdBy: ids.ownerB, createdAt: new Date().toISOString(), type: 'creditStatus', payload: { customerId: 'customer' }, status: 'queued' })
  await processCommand(admin, operationRef)
  assert.equal((await operationRef.get()).data().status, 'confirmed'); pass('operación tenant autorizada se confirma')
  assert.equal((await admin.doc(`tenants/${ids.distribution}/distCreditStatus/customer`).get()).data().tenantId, ids.distribution); pass('resultado y ledger conservan tenantId')
  const forgedOperation = admin.doc(`tenants/${ids.distribution}/distOperations/forged-${suffix}`)
  await forgedOperation.set({ id: `forged-${suffix}`, tenantId: ids.distribution, branchId: 'main', createdBy: ids.ownerA, createdAt: new Date().toISOString(), type: 'creditStatus', payload: { customerId: 'customer' }, status: 'queued' })
  await processCommand(admin, forgedOperation)
  assert.equal((await forgedOperation.get()).data().status, 'rejected'); pass('Function rechaza actor de otro tenant aunque el documento fue sembrado por Admin SDK')

  for (const [owner, own, foreign] of [[ids.ownerA, ids.restaurant, ids.distribution], [ids.ownerB, ids.distribution, ids.gelateria], [ids.ownerC, ids.gelateria, ids.restaurant]]) {
    const client = env.authenticatedContext(owner).firestore()
    await assertSucceeds(getDoc(doc(client, 'tenants', own))); pass(`${owner} lee su empresa`)
    await assertFails(getDoc(doc(client, 'tenants', foreign))); pass(`${owner} no lee otra empresa aunque conoce su ruta`)
  }

  const disabled = env.authenticatedContext(ids.disabledA).firestore()
  await assertFails(getDoc(doc(disabled, 'tenants', ids.restaurant))); pass('miembro desactivado no lee su tenant')

  const seller = env.authenticatedContext(ids.sellerB).firestore()
  await assertSucceeds(getDoc(doc(seller, 'tenants', ids.distribution, 'distSales', 'own'))); pass('distribuidor lee una venta de su ruta')
  await assertFails(getDoc(doc(seller, 'tenants', ids.distribution, 'distSales', 'foreign-route'))); pass('distribuidor no lee otra ruta')
  await assertFails(getDoc(doc(seller, 'tenants', ids.restaurant))); pass('distribuidor no cruza a otro tenant')

  const cashier = env.authenticatedContext(ids.cashierA).firestore()
  await assertFails(getDocs(collection(cashier, 'tenants', ids.restaurant, 'members'))); pass('caja no lista ni administra usuarios')
  await assertFails(setDoc(doc(cashier, 'tenants', ids.restaurant, 'members', 'forged'), member('forged', ids.restaurant, 'owner'))); pass('cliente no crea memberships')

  assert.equal(checks, 21)
  fs.mkdirSync('docs/qa-pachax', { recursive: true })
  fs.writeFileSync('docs/qa-pachax/multi-tenant-isolation-result.json', JSON.stringify({ passed: true, checks, projectId, at: new Date().toISOString() }, null, 2))
  console.log(`${checks} comprobaciones multiempresa aprobadas`)
} finally {
  await env.cleanup()
}
