// Focal emulator integration for route lifecycle, assignment, dispatch and closure.
import fs from 'node:fs'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing'
import { deleteDoc, doc, getDoc, setDoc } from 'firebase/firestore'

const projectId = 'demo-pachax-platform'
if (process.env.GCLOUD_PROJECT && process.env.GCLOUD_PROJECT !== projectId) throw new Error('Proyecto no autorizado para QA Distribution.')
process.env.FIRESTORE_EMULATOR_HOST ||= '127.0.0.1:8185'
process.env.FIREBASE_AUTH_EMULATOR_HOST ||= '127.0.0.1:9195'
const require = createRequire(new URL('../../functions/package.json', import.meta.url))
const { initializeApp } = require('firebase-admin/app')
const { getFirestore } = require('firebase-admin/firestore')
const { getAuth } = require('firebase-admin/auth')
const suffix = Date.now().toString(36)
const app = initializeApp({ projectId }, `distribution-routes-${suffix}`)
const db = getFirestore(app)
const auth = getAuth(app)
const env = await initializeTestEnvironment({ projectId, firestore: { host: '127.0.0.1', port: 8185, rules: fs.readFileSync('firebase/firestore.rules', 'utf8') } })
const tenants = [], users = []
let checks = 0
const pass = message => { checks += 1; console.log(`PASS ${message}`) }

async function tokenFor(uid, password, email = `${uid}@example.test`) {
  const response = await fetch('http://127.0.0.1:9195/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=emulator', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password, returnSecureToken: true }),
  })
  const body = await response.json()
  assert(response.ok, `No inició sesión ${uid}: ${body.error?.message || JSON.stringify(body)}`)
  return body.idToken
}

async function gateway(token, data, expectSuccess = true) {
  const response = await fetch(`http://127.0.0.1:5101/${projectId}/southamerica-west1/tenantGateway`, {
    method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({ data }),
  })
  const body = await response.json()
  if (expectSuccess) assert(response.ok && !body.error, `${data.action} falló: ${JSON.stringify(body.error || body)}`)
  else assert(!response.ok || body.error, `${data.action} debió ser rechazado`)
  return body.result?.data || body.result || body
}

async function createTenant(uid, companyName) {
  const password = 'Route-QA-Strong-2026!'
  await auth.createUser({ uid, email: `${uid}@example.test`, password })
  users.push(uid)
  const token = await tokenFor(uid, password)
  const result = await gateway(token, { action: 'completeOnboarding', requestId: `${suffix}-${uid}-onboard`, companyName, businessType: 'route_distribution', industryProfile: 'beverages' })
  tenants.push(result.tenantId)
  return { token, tenantId: result.tenantId, client: env.authenticatedContext(uid).firestore() }
}

async function createMember(ownerToken, tenantId, roleId, label, routeId, passwordSuffix) {
  const operationId = `${suffix}-${roleId}-${passwordSuffix}`
  const result = await gateway(ownerToken, {
    action: 'createMember', tenantId, operationId, email: `${operationId}@example.test`, password: `Route-Member-${passwordSuffix}-2026!`, displayName: label, roleId, routeId,
    warehouseId: 'central',
  })
  users.push(result.uid)
  return { uid: result.uid, token: await tokenFor(result.uid, `Route-Member-${passwordSuffix}-2026!`, `${operationId}@example.test`) }
}

async function enqueue(client, tenantId, actorUid, type, payload, id, expectedStatus = 'confirmed') {
  const operationId = `${suffix}-${id}`
  const ref = doc(client, 'tenants', tenantId, 'distOperations', operationId)
  await setDoc(ref, { id: operationId, tenantId, branchId: 'main', createdBy: actorUid, createdAt: new Date().toISOString(), type, payload, status: 'queued' })
  const deadline = Date.now() + 30000
  while (Date.now() < deadline) {
    const result = (await getDoc(ref)).data()
    if (result?.status !== 'queued') {
      assert.equal(result?.status, expectedStatus, `${type} terminó ${result?.status}: ${result?.error || 'sin detalle'}`)
      return result
    }
    await new Promise(resolve => setTimeout(resolve, 100))
  }
  throw new Error(`Timeout procesando ${type} ${operationId}`)
}

try {
  const ownerUid = `route-owner-${suffix}`
  const otherOwnerUid = `route-other-owner-${suffix}`
  const owner = await createTenant(ownerUid, `QA Rutas ${suffix}`)
  const other = await createTenant(otherOwnerUid, `QA Rutas Otro Tenant ${suffix}`)
  const routeId = `route-${suffix}`
  const alternateRouteId = `route-alt-${suffix}`
  const now = new Date().toISOString()
  const routeData = (id, name, active = true) => ({ id, tenantId: owner.tenantId, name, kind: 'route', active, createdAt: now })

  const roleClients = {}
  for (const roleId of ['admin', 'accountant', 'superadmin']) {
    const uid = `route-${roleId}-${suffix}`
    await db.doc(`tenants/${owner.tenantId}/members/${uid}`).set({ uid, tenantId: owner.tenantId, roleId, status: 'active', branchIds: ['main'] })
    roleClients[roleId] = env.authenticatedContext(uid).firestore()
  }

  // Matches the saveRoute Firestore write; rules authenticate tenant ownership.
  await assertSucceeds(setDoc(doc(owner.client, 'tenants', owner.tenantId, 'distRoutes', routeId), routeData(routeId, 'Zona Norte')))
  await assertSucceeds(setDoc(doc(owner.client, 'tenants', owner.tenantId, 'distRoutes', alternateRouteId), routeData(alternateRouteId, 'Zona Sur')))
  await assertSucceeds(setDoc(doc(roleClients.admin, 'tenants', owner.tenantId, 'distRoutes', `route-admin-${suffix}`), routeData(`route-admin-${suffix}`, 'Ruta Admin')))
  await assertSucceeds(setDoc(doc(roleClients.superadmin, 'tenants', owner.tenantId, 'distRoutes', `route-superadmin-${suffix}`), routeData(`route-superadmin-${suffix}`, 'Ruta Superadmin')))
  await assertSucceeds(setDoc(doc(roleClients.admin, 'tenants', owner.tenantId, 'distRoutes', alternateRouteId), { name: 'Zona Sur Renombrada', active: false }, { merge: true }))
  await assertSucceeds(setDoc(doc(roleClients.superadmin, 'tenants', owner.tenantId, 'distRoutes', alternateRouteId), { active: true }, { merge: true }))
  pass('owner/admin/superadmin activo crean rutas; reglas de tenant autentican el rol')

  for (const action of ['create', 'rename', 'deactivate', 'delete']) {
    const target = `tenants/${owner.tenantId}/distRoutes/${routeId}`
    const request = action === 'create'
      ? setDoc(doc(roleClients.accountant, 'tenants', owner.tenantId, 'distRoutes', `accountant-route-${suffix}`), routeData(`accountant-route-${suffix}`, 'No permitida'))
      : action === 'rename'
        ? setDoc(doc(roleClients.accountant, target), { name: 'Renombre no permitido' }, { merge: true })
        : action === 'deactivate'
          ? setDoc(doc(roleClients.accountant, target), { active: false }, { merge: true })
          : deleteDoc(doc(roleClients.accountant, target))
    await assertFails(request)
  }
  pass('accountant no crea, renombra, desactiva ni elimina rutas')

  await assertSucceeds(setDoc(doc(owner.client, 'tenants', owner.tenantId, 'distRoutes', routeId), { ...routeData(routeId, 'Zona Norte Renombrada'), updatedAt: new Date().toISOString() }, { merge: true }))
  const renamed = (await getDoc(doc(owner.client, 'tenants', owner.tenantId, 'distRoutes', routeId))).data()
  assert.equal(renamed.name, 'Zona Norte Renombrada')
  assert.equal(renamed.id, routeId)
  pass('edición conserva identificador estable')

  const seller = await createMember(owner.token, owner.tenantId, 'distributor', 'Distribuidor QA', routeId, 'seller')
  const sellerMemberRef = doc(owner.client, 'tenants', owner.tenantId, 'members', seller.uid)
  assert.deepEqual((await getDoc(sellerMemberRef)).data().routeIds, [routeId])
  await assertFails(setDoc(doc(env.authenticatedContext(seller.uid).firestore(), 'tenants', owner.tenantId, 'distRoutes', `seller-route-${suffix}`), routeData(`seller-route-${suffix}`, 'No autorizada')))
  await gateway(seller.token, { action: 'updateMember', tenantId: owner.tenantId, uid: seller.uid, routeId: alternateRouteId }, false)
  assert.deepEqual((await getDoc(sellerMemberRef)).data().routeIds, [routeId])
  await gateway(owner.token, { action: 'updateMember', tenantId: owner.tenantId, uid: seller.uid, routeId: alternateRouteId })
  assert.deepEqual((await getDoc(sellerMemberRef)).data().routeIds, [alternateRouteId])
  await gateway(owner.token, { action: 'updateMember', tenantId: owner.tenantId, uid: seller.uid, routeId })
  assert.deepEqual((await getDoc(sellerMemberRef)).data().routeIds, [routeId])
  pass('distribuidor no administra rutas; owner crea la asignación y puede cambiarla por gateway')

  const warehouse = await createMember(owner.token, owner.tenantId, 'warehouse', 'Almacén QA', undefined, 'warehouse')
  const productId = `sku-route-${suffix}`
  await assertSucceeds(setDoc(doc(owner.client, 'tenants', owner.tenantId, 'distProducts', productId), {
    id: productId, tenantId: owner.tenantId, name: 'Producto QA rutas', category: 'Bebidas', unitType: 'unit',
    referencePrice: 10, productionCost: 4, minimumStock: 0, active: true,
  }))
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/La_Paz', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
  const expires = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10)
  await enqueue(owner.client, owner.tenantId, ownerUid, 'intake', { lines: [{ productId, quantity: 10, lotCode: `LOT-${suffix}`, manufacturedOn: today, expiresOn: expires }], note: 'Ingreso QA rutas' }, 'intake')
  const dispatch = await enqueue(env.authenticatedContext(warehouse.uid).firestore(), owner.tenantId, warehouse.uid, 'dispatch', {
    warehouseId: 'central', routeId, routeName: 'Zona Norte Renombrada', distributorUid: seller.uid, distributorName: 'Distribuidor QA', lines: [{ productId, quantity: 5 }],
  }, 'dispatch')
  assert.equal(dispatch.result.routeId, routeId)
  assert.equal((await getDoc(doc(owner.client, 'tenants', owner.tenantId, 'distBalances', `route__${routeId}__${productId}`))).data().quantity, 5)
  pass('almacén registra inventario y crea despacho para la ruta nueva')

  await enqueue(env.authenticatedContext(seller.uid).firestore(), owner.tenantId, seller.uid, 'sale', {
    sourceLocation: 'route', routeId, routeName: 'Zona Norte Renombrada', dispatchId: dispatch.result.id,
    lines: [{ productId, quantity: 3, actualUnitPrice: 10 }], cashAmount: 30, qrAmount: 0, creditAmount: 0, paymentKind: 'cash',
  }, 'sale')
  await enqueue(env.authenticatedContext(seller.uid).firestore(), owner.tenantId, seller.uid, 'closure', {
    mode: 'declaration', dispatchId: dispatch.result.id, declaredReturns: { [productId]: 2 }, declaredReturnMermas: { [productId]: 0 }, declaredReturnNonSellables: { [productId]: 0 },
  }, 'declare-return')
  await enqueue(env.authenticatedContext(warehouse.uid).firestore(), owner.tenantId, warehouse.uid, 'closure', {
    closure: { dispatchId: dispatch.result.id, products: [{ productId, actualReturn: 2 }] }, mode: 'warehouse',
  }, 'warehouse-return')
  const close = await enqueue(env.authenticatedContext(seller.uid).firestore(), owner.tenantId, seller.uid, 'closure', {
    closure: { dispatchId: dispatch.result.id, products: [{ productId, actualReturn: 2 }], physicalCashDeclared: 30 }, mode: 'money',
  }, 'route-close')
  assert.equal(close.result.status, 'closed')
  assert.equal(close.result.expectedCash, 30)
  const closureRef = doc(owner.client, 'tenants', owner.tenantId, 'distClosures', `closure_${dispatch.result.id}`)
  assert.equal((await getDoc(closureRef)).data().status, 'closed')
  assert.equal((await getDoc(doc(owner.client, 'tenants', owner.tenantId, 'distBalances', `route__${routeId}__${productId}`))).data().quantity, 0)
  assert.equal((await getDoc(doc(owner.client, 'tenants', owner.tenantId, 'distBalances', `central__${productId}`))).data().quantity, 7)
  assert.equal((await getDoc(doc(owner.client, 'tenants', owner.tenantId, 'distSales', `${suffix}-sale`))).data().total, 30)
  await assertFails(deleteDoc(doc(owner.client, 'tenants', owner.tenantId, 'distRoutes', routeId)))
  await assertFails(deleteDoc(doc(roleClients.admin, 'tenants', owner.tenantId, 'distRoutes', routeId)))
  assert.equal((await getDoc(doc(owner.client, 'tenants', owner.tenantId, 'distRoutes', routeId))).exists(), true)
  assert.equal((await getDoc(closureRef)).data().status, 'closed')
  pass('venta, retorno y cierre concilian caja y existencias')

  await assertFails(getDoc(doc(other.client, 'tenants', owner.tenantId, 'distRoutes', routeId)))
  pass('un owner de otro tenant no puede leer la ruta')

  await assertSucceeds(setDoc(doc(owner.client, 'tenants', owner.tenantId, 'distRoutes', routeId), { ...routeData(routeId, 'Zona Norte Renombrada', false), updatedAt: new Date().toISOString() }, { merge: true }))
  await assertFails(setDoc(doc(roleClients.accountant, 'tenants', owner.tenantId, 'distRoutes', routeId), { active: true }, { merge: true }))
  await gateway(owner.token, { action: 'createMember', tenantId: owner.tenantId, operationId: `${suffix}-inactive-route-member`, email: `${suffix}-inactive@example.test`, password: 'Inactive-Route-QA-2026!', displayName: 'Ruta inactiva QA', roleId: 'distributor', routeId }, false)
  const deniedDispatch = await enqueue(env.authenticatedContext(warehouse.uid).firestore(), owner.tenantId, warehouse.uid, 'dispatch', {
    warehouseId: 'central', routeId, routeName: 'Zona Norte Renombrada', distributorUid: seller.uid, distributorName: 'Distribuidor QA', lines: [{ productId, quantity: 1 }],
  }, 'inactive-route-dispatch', 'rejected')
  assert.match(deniedDispatch.error || '', /inactiva|ruta/i)
  pass('desactivar ruta preserva histórico e impide nuevas asignaciones y despachos')
  console.log(`${checks} comprobaciones focales de rutas aprobadas`)
} finally {
  for (const tenantId of tenants) await db.recursiveDelete(db.doc(`tenants/${tenantId}`)).catch(() => {})
  for (const uid of users) {
    await db.recursiveDelete(db.doc(`users/${uid}`)).catch(() => {})
    await auth.deleteUser(uid).catch(() => {})
  }
  await env.cleanup()
  await app.delete()
}
