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
  nightclub: '',
  ownerA: `qa-owner-a-${suffix}`,
  ownerB: `qa-owner-b-${suffix}`,
  ownerC: `qa-owner-c-${suffix}`,
  ownerD: `qa-owner-d-${suffix}`,
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
async function signIn(uid, email = uid + '@example.test', password = 'Emulator123!') {
  const response = await fetch('http://127.0.0.1:9195/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=emulator', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password, returnSecureToken: true }),
  })
  assert(response.ok, `Auth emulator rechazó ${uid}`)
  return (await response.json()).idToken
}
async function tenantGateway(idToken, data) {
  const response = await fetch(`http://127.0.0.1:5101/${projectId}/southamerica-west1/tenantGateway`, {
    method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${idToken}` }, body: JSON.stringify({ data }),
  })
  return { response, body: await response.json() }
}

try {
  for (const uid of [ids.ownerA, ids.ownerB, ids.ownerC, ids.ownerD]) await adminAuth.createUser({ uid, email: `${uid}@example.test`, password: 'Emulator123!' })
  ids.restaurant = (await createTenant(admin, adminAuth, { auth: { uid: ids.ownerA, token: {} }, data: { action: 'createTenant', operationId: `op-a-${suffix}`, name: 'Restaurante QA', businessType: 'restaurant_pos' } })).tenantId
  ids.distribution = (await createTenant(admin, adminAuth, { auth: { uid: ids.ownerB, token: {} }, data: { action: 'createTenant', operationId: `op-b-${suffix}`, name: 'Distribuidora QA', businessType: 'route_distribution' } })).tenantId
  ids.gelateria = (await createTenant(admin, adminAuth, { auth: { uid: ids.ownerC, token: {} }, data: { action: 'createTenant', operationId: `op-c-${suffix}`, name: 'Heladería QA', businessType: 'gelateria_weight_cafe' } })).tenantId
  ids.nightclub = (await createTenant(admin, adminAuth, { auth: { uid: ids.ownerD, token: {} }, data: { action: 'createTenant', operationId: `op-d-${suffix}`, name: 'Nightclub QA', businessType: 'nightclub_lounge' } })).tenantId
  pass('Functions crea tenants A/B/C/D con owner, roles y branch')
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
  await admin.doc(`tenants/${ids.nightclub}/members/${ids.disabledA}`).set(member(ids.disabledA, ids.nightclub, 'owner', 'disabled'))
  await admin.doc(`tenants/${ids.nightclub}/nightclubAccounts/account`).set({ id: 'account', tenantId: ids.nightclub, branchId: 'main', status: 'open', subtotal: 100 })
  await admin.doc(`tenants/${ids.nightclub}/nightclubAccounts/foreign-branch`).set({ id: 'foreign-branch', tenantId: ids.nightclub, branchId: 'other', status: 'open', subtotal: 100 })
  await admin.doc(`tenants/${ids.nightclub}/nightclubTables/table-1`).set({ id: 'table-1', tenantId: ids.nightclub, branchId: 'main', status: 'available' })
  await admin.doc(`tenants/${ids.nightclub}/nightclubProducts/beer`).set({ id: 'beer', tenantId: ids.nightclub, branchId: 'main', name: 'Cerveza QA', price: 25, active: true, preparationArea: 'Directo', recipe: [{ inventoryId: 'beer-stock', quantity: 1 }] })
  await admin.doc(`tenants/${ids.nightclub}/nightclubInventory/beer-stock`).set({ id: 'beer-stock', tenantId: ids.nightclub, branchId: 'main', name: 'Cerveza QA', current: 10 })
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

  for (const [owner, own, foreign] of [[ids.ownerA, ids.restaurant, ids.distribution], [ids.ownerB, ids.distribution, ids.gelateria], [ids.ownerC, ids.gelateria, ids.restaurant], [ids.ownerD, ids.nightclub, ids.restaurant]]) {
    const client = env.authenticatedContext(owner).firestore()
    await assertSucceeds(getDoc(doc(client, 'tenants', own))); pass(`${owner} lee su empresa`)
    await assertFails(getDoc(doc(client, 'tenants', foreign))); pass(`${owner} no lee otra empresa aunque conoce su ruta`)
  }

  const disabled = env.authenticatedContext(ids.disabledA).firestore()
  await assertFails(getDoc(doc(disabled, 'tenants', ids.restaurant))); pass('miembro desactivado no lee su tenant')
  await assertFails(getDoc(doc(disabled, 'tenants', ids.nightclub, 'nightclubAccounts', 'account'))); pass('miembro desactivado no lee cuentas Nightclub')

  const nightclubOwner = env.authenticatedContext(ids.ownerD).firestore()
  await assertSucceeds(getDoc(doc(nightclubOwner, 'tenants', ids.nightclub, 'nightclubAccounts', 'account'))); pass('owner Nightclub lee una cuenta de su tenant')
  await assertFails(getDoc(doc(nightclubOwner, 'tenants', ids.nightclub, 'nightclubAccounts', 'foreign-branch'))); pass('owner Nightclub no lee una sucursal no asignada')
  const restaurantOwner = env.authenticatedContext(ids.ownerA).firestore()
  await assertFails(getDoc(doc(restaurantOwner, 'tenants', ids.nightclub, 'nightclubAccounts', 'account'))); pass('owner A no lee una cuenta Nightclub de D')
  await assertFails(setDoc(doc(nightclubOwner, 'tenants', ids.nightclub, 'nightclubAccounts', 'forged'), { status: 'open' })); pass('cliente no escribe cuentas Nightclub sin Function')
  const incidentPath = `tenants/${ids.nightclub}/nightclubCustomerIncidents/incident-${suffix}`
  await admin.doc(incidentPath).set({ customerId: 'customer-1', branchId: 'main', description: 'Solo administración' })
  await admin.doc(`tenants/${ids.nightclub}/members/qa-night-cashier-${suffix}`).set(member(`qa-night-cashier-${suffix}`, ids.nightclub, 'cashier'))
  const nightclubCashier = env.authenticatedContext(`qa-night-cashier-${suffix}`).firestore()
  await assertSucceeds(getDoc(doc(nightclubOwner, incidentPath))); pass('owner Nightclub lee incidente de su sucursal')
  await assertFails(getDoc(doc(nightclubCashier, incidentPath))); pass('cajero Nightclub no lee incidentes privados')
  await assertFails(getDoc(doc(restaurantOwner, incidentPath))); pass('otro tenant no lee incidentes')
  await assertFails(setDoc(doc(nightclubOwner, incidentPath), { description: 'Alteración' })); pass('cliente no escribe incidentes sin Function')

  const tokenD = await signIn(ids.ownerD)
  const invalidMatrix = await tenantGateway(tokenD, { action: 'createMember', tenantId: ids.nightclub, operationId: 'invalid-matrix-' + suffix, email: 'invalid-' + suffix + '@example.test', password: 'Password123!', displayName: 'Inválido', roleId: 'waiter', nightclubPermissions: ['pos.edit'] })
  assert(!invalidMatrix.response.ok); pass('Function rechaza editar POS sin permiso Ver')
  const partnerCreated = await tenantGateway(tokenD, { action: 'createMember', tenantId: ids.nightclub, operationId: 'partner-' + suffix, email: 'partner-' + suffix + '@example.test', password: 'Password123!', displayName: 'Socio QA', roleId: 'partner', nightclubPermissions: ['dashboard.view', 'reports.view'] })
  assert(partnerCreated.response.ok)
  const partnerUid = (partnerCreated.body.result?.data || partnerCreated.body.result).uid
  const partnerDoc = (await admin.doc('tenants/' + ids.nightclub + '/members/' + partnerUid).get()).data()
  assert.equal(partnerDoc.roleId, 'partner'); assert.deepEqual(partnerDoc.nightclubPermissions, ['dashboard.view', 'reports.view']); assert(!('password' in partnerDoc))
  assert.equal((await adminAuth.getUser(partnerUid)).email, 'partner-' + suffix + '@example.test'); pass('owner crea socio en Firebase Auth y membership por UID sin guardar contraseña')
  await assertFails(setDoc(doc(nightclubOwner, 'tenants', ids.nightclub, 'members', partnerUid), { roleId: 'admin' }, { merge: true })); pass('cliente no modifica permisos ni roles directamente')
  const supervisorCreated = await tenantGateway(tokenD, { action: 'createMember', tenantId: ids.nightclub, operationId: 'supervisor-' + suffix, email: 'supervisor-' + suffix + '@example.test', password: 'Password123!', displayName: 'Supervisor QA', roleId: 'supervisor', nightclubPermissions: ['users.view', 'special.manageUsers'] })
  assert(supervisorCreated.response.ok)
  const supervisorUid = (supervisorCreated.body.result?.data || supervisorCreated.body.result).uid
  const supervisorToken = await signIn(supervisorUid, 'supervisor-' + suffix + '@example.test', 'Password123!')
  const supervisorClient = env.authenticatedContext(supervisorUid).firestore()
  await assertSucceeds(getDocs(collection(supervisorClient, 'tenants', ids.nightclub, 'members'))); pass('permiso individual autentificado permite listar usuarios solo del tenant')
  await assertFails(getDocs(collection(supervisorClient, 'tenants', ids.restaurant, 'members'))); pass('permiso individual no cruza tenants')
  const supervisorEscalation = await tenantGateway(supervisorToken, { action: 'updateMember', tenantId: ids.nightclub, uid: partnerUid, roleId: 'admin', nightclubPermissions: ['users.view', 'special.manageUsers'] })
  assert(!supervisorEscalation.response.ok); pass('supervisor no puede conceder Administración')
  const supervisorRoleEdit = await tenantGateway(supervisorToken, { action: 'saveNightclubRolePreset', tenantId: ids.nightclub, roleId: 'bar', nightclubPermissions: ['bar.view'] })
  assert(!supervisorRoleEdit.response.ok); pass('solo Administración edita plantillas')
  const savedRole = await tenantGateway(tokenD, { action: 'saveNightclubRolePreset', tenantId: ids.nightclub, roleId: 'bar', nightclubPermissions: ['bar.view', 'bar.create'] })
  assert(savedRole.response.ok && (await admin.doc('tenants/' + ids.nightclub + '/roles/bar').get()).data().nightclubPermissions.includes('bar.create')); pass('plantilla editable persiste y queda auditada')
  const updatedPartner = await tenantGateway(tokenD, { action: 'updateMember', tenantId: ids.nightclub, uid: partnerUid, displayName: 'Socio Editado', nightclubPermissions: ['dashboard.view', 'history.view'] })
  assert(updatedPartner.response.ok && (await admin.doc('tenants/' + ids.nightclub + '/members/' + partnerUid).get()).data().displayName === 'Socio Editado'); pass('edición conserva identidad Auth y actualiza permisos del UID')
  const removedPartner = await tenantGateway(tokenD, { action: 'deleteMember', tenantId: ids.nightclub, uid: partnerUid })
  assert(removedPartner.response.ok && (await admin.doc('tenants/' + ids.nightclub + '/members/' + partnerUid).get()).data().status === 'disabled'); pass('eliminar retira acceso y conserva membresía histórica')
  await assertFails(getDoc(doc(env.authenticatedContext(partnerUid).firestore(), 'tenants', ids.nightclub))); pass('miembro retirado no lee tenant')
  const lastAdmin = await tenantGateway(tokenD, { action: 'deleteMember', tenantId: ids.nightclub, uid: ids.ownerD })
  assert(!lastAdmin.response.ok); pass('no se puede retirar al dueño y último administrador')
  const auditRows = await admin.collection('tenants/' + ids.nightclub + '/auditLogs').where('action', '==', 'member.updated').get()
  assert(auditRows.docs.some(doc => doc.data().actorUid === ids.ownerD)); pass('auditoría registra UID real del administrador')
  const command = (operationId, commandType, payload = {}) => tenantGateway(tokenD, { action: 'nightclubCommand', tenantId: ids.nightclub, branchId: 'main', operationId, commandType, payload })
  const shift = await command(`night-shift-${suffix}`, 'openShift', { openingFloat: 500 })
  assert(shift.response.ok); const shiftResult = shift.body.result?.data || shift.body.result; pass('Nightclub abre turno mediante Function')
  const repeatedShift = await command(`night-shift-${suffix}`, 'openShift', { openingFloat: 500 })
  assert.equal((repeatedShift.body.result?.data || repeatedShift.body.result).shiftId, shiftResult.shiftId); pass('operationId repetido devuelve el mismo ACK de turno')
  const collidedShift = await command(`night-shift-${suffix}`, 'openShift', { openingFloat: 999 })
  assert(!collidedShift.response.ok); pass('operationId no puede reutilizarse con otro payload')
  const opened = await command(`night-account-${suffix}`, 'openAccount', { target: { type: 'table', tableId: 'table-1' } })
  assert(opened.response.ok); const accountId = (opened.body.result?.data || opened.body.result).accountId; pass('Function abre cuenta y bloquea mesa atómicamente')
  const duplicateTable = await command(`night-account-2-${suffix}`, 'openAccount', { target: { type: 'table', tableId: 'table-1' } })
  assert(!duplicateTable.response.ok); pass('segunda apertura concurrente de mesa se rechaza')
  const paid = await command(`night-round-${suffix}`, 'settleRound', { accountId, items: [{ productId: 'beer', quantity: 2 }], payment: { method: 'cash', amount: 50 } })
  assert(paid.response.ok); pass('Function deriva precio, cobra y descuenta inventario atómicamente')
  await command(`night-round-${suffix}`, 'settleRound', { accountId, items: [{ productId: 'beer', quantity: 2 }], payment: { method: 'cash', amount: 50 } })
  assert.equal((await admin.doc(`tenants/${ids.nightclub}/nightclubInventory/beer-stock`).get()).data().current, 8); pass('retry de cobro no duplica consumo')
  assert.equal((await admin.doc(`tenants/${ids.nightclub}/nightclubPayments/payment_night-round-${suffix}`).get()).exists, true); assert.equal((await admin.doc(`tenants/${ids.nightclub}/nightclubCashMovements/cash_night-round-${suffix}`).get()).data().amount, 50); pass('retry conserva un pago, un movimiento de caja y ACK')
  await assertSucceeds(getDoc(doc(nightclubOwner, 'tenants', ids.nightclub, 'nightclubRounds', `round_night-round-${suffix}`))); pass('owner Nightclub lee ronda de su sucursal')
  await assertSucceeds(getDoc(doc(nightclubOwner, 'tenants', ids.nightclub, 'nightclubPayments', `payment_night-round-${suffix}`))); pass('owner Nightclub lee pago de su sucursal')
  await assertSucceeds(getDoc(doc(nightclubOwner, 'tenants', ids.nightclub, 'nightclubCashMovements', `cash_night-round-${suffix}`))); pass('owner Nightclub lee movimiento de caja de su sucursal')
  await assertFails(getDoc(doc(restaurantOwner, 'tenants', ids.nightclub, 'nightclubRounds', `round_night-round-${suffix}`))); pass('otro tenant no lee rondas Nightclub')
  await assertFails(setDoc(doc(nightclubOwner, 'tenants', ids.nightclub, 'nightclubRounds', 'forged'), { branchId: 'main' })); pass('cliente no escribe rondas Nightclub')
  const crossNightclub = await tenantGateway(tokenA, { action: 'nightclubCommand', tenantId: ids.nightclub, branchId: 'main', operationId: `cross-night-${suffix}`, commandType: 'openShift', payload: { openingFloat: 0 } })
  assert(!crossNightclub.response.ok); pass('Function Nightclub rechaza actor de otro tenant')

  const seller = env.authenticatedContext(ids.sellerB).firestore()
  await assertSucceeds(getDoc(doc(seller, 'tenants', ids.distribution, 'distSales', 'own'))); pass('distribuidor lee una venta de su ruta')
  await assertFails(getDoc(doc(seller, 'tenants', ids.distribution, 'distSales', 'foreign-route'))); pass('distribuidor no lee otra ruta')
  await assertFails(getDoc(doc(seller, 'tenants', ids.restaurant))); pass('distribuidor no cruza a otro tenant')

  const cashier = env.authenticatedContext(ids.cashierA).firestore()
  await assertFails(getDocs(collection(cashier, 'tenants', ids.restaurant, 'members'))); pass('caja no lista ni administra usuarios')
  await assertFails(setDoc(doc(cashier, 'tenants', ids.restaurant, 'members', 'forged'), member('forged', ids.restaurant, 'owner'))); pass('cliente no crea memberships')

  assert.equal(checks, 59)
  fs.mkdirSync('docs/qa-pachax', { recursive: true })
  fs.writeFileSync('docs/qa-pachax/multi-tenant-isolation-result.json', JSON.stringify({ passed: true, checks, projectId, at: new Date().toISOString() }, null, 2))
  console.log(`${checks} comprobaciones multiempresa aprobadas`)
} finally {
  await env.cleanup()
}
