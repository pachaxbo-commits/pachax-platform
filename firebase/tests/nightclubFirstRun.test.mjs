import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { initializeTestEnvironment, assertFails } from '@firebase/rules-unit-testing'
import { doc, setDoc } from 'firebase/firestore'
import fs from 'node:fs'

const projectId = 'demo-pachax-platform'
if (process.env.GCLOUD_PROJECT && process.env.GCLOUD_PROJECT !== projectId) throw new Error('QA permitido solo en demo-pachax-platform.')
process.env.FIRESTORE_EMULATOR_HOST ||= '127.0.0.1:8185'
process.env.FIREBASE_AUTH_EMULATOR_HOST ||= '127.0.0.1:9195'
const require = createRequire(new URL('../../functions/package.json', import.meta.url))
const { initializeApp } = require('firebase-admin/app')
const { getFirestore } = require('firebase-admin/firestore')
const { getAuth } = require('firebase-admin/auth')
const { getTemplate } = require('./generated/templates.js')

const suffix = Date.now().toString(36)
const env = await initializeTestEnvironment({
  projectId,
  firestore: { host: '127.0.0.1', port: 8185, rules: fs.readFileSync('firebase/firestore.rules', 'utf8') },
})
const app = initializeApp({ projectId }, `nightclub-first-run-${suffix}`)
const db = getFirestore(app)
const auth = getAuth(app)
const users = new Map()
const tokens = new Map()
let checks = 0
const pass = message => { checks++; console.log('PASS', message) }

async function createUser(key) {
  const uid = `qa_${suffix}_${key}`
  const email = `${uid}@example.test`
  await auth.createUser({ uid, email, password: 'Emulator123!', displayName: `QA ${key}` })
  users.set(key, uid)
  const response = await fetch(`http://127.0.0.1:9195/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=emulator`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password: 'Emulator123!', returnSecureToken: true }),
  })
  assert(response.ok, `Auth emulator rechazó ${uid}`)
  tokens.set(key, (await response.json()).idToken)
  return uid
}

async function call(key, data) {
  const response = await fetch(`http://127.0.0.1:5101/${projectId}/southamerica-west1/tenantGateway`, {
    method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${tokens.get(key)}` },
    body: JSON.stringify({ data }),
  })
  const body = await response.json()
  return { response, body, result: body.result?.data || body.result, status: body.error?.status }
}

async function createFixtureTenant({ key, businessType = 'nightclub_lounge', branchActive = true, member = {}, withPartialInfrastructure = false }) {
  const uid = users.get(key) || await createUser(key)
  const tenantId = `qa_${suffix}_${key}`
  const root = db.doc(`tenants/${tenantId}`)
  const template = getTemplate(businessType)
  await root.set({ tenantId, businessType, ownerUid: uid, status: 'active', configuration: template.defaults })
  await root.collection('branches').doc('main').set({ tenantId, id: 'main', name: 'Sucursal principal', active: branchActive })
  await root.collection('members').doc(uid).set({ uid, tenantId, roleId: 'owner', status: 'active', branchIds: ['main'], ...member })
  for (const role of template.roles) await root.collection('roles').doc(role.id).set({ ...role, tenantId })
  if (withPartialInfrastructure) {
    await root.collection('nightclubLocations').doc('warehouse-general').set({ id: 'warehouse-general', tenantId, branchId: 'main', type: 'warehouse', name: 'Almacén personalizado', active: true, createdAt: 'old', updatedAt: 'old' })
  }
  return { tenantId, uid, root }
}

async function command(key, tenantId, branchId, commandType, operationId, payload = {}) {
  return call(key, { action: 'nightclubCommand', tenantId, branchId, commandType, operationId, payload })
}

try {
  const ownerUid = await createUser('onboard')
  const onboarding = await call('onboard', { action: 'completeOnboarding', requestId: `onboard-${suffix}`, companyName: 'QA Nightclub Fresh', businessType: 'nightclub_lounge' })
  assert(onboarding.response.ok, JSON.stringify(onboarding.body))
  const freshTenantId = onboarding.result.tenantId
  const freshRoot = db.doc(`tenants/${freshTenantId}`)
  const [tenant, owner, branch, warehouse, baseLocation, baseCashbox, shifts, inventory, roles] = await Promise.all([
    freshRoot.get(), freshRoot.collection('members').doc(ownerUid).get(), freshRoot.collection('branches').doc('main').get(),
    freshRoot.collection('nightclubLocations').doc('warehouse-general').get(), freshRoot.collection('nightclubLocations').doc('cashbox-1').get(),
    freshRoot.collection('nightclubCashboxes').doc('cashbox-1').get(), freshRoot.collection('nightclubShifts').get(),
    freshRoot.collection('nightclubInventory').get(), freshRoot.collection('roles').get(),
  ])
  assert.equal(tenant.data().businessType, 'nightclub_lounge')
  assert.equal(owner.data().roleId, 'owner')
  assert.equal(owner.data().status, 'active')
  assert.equal(branch.data().active, true)
  assert.equal(warehouse.data().type, 'warehouse')
  assert.equal(warehouse.data().name, 'Almacén general')
  assert.equal(baseLocation.data().type, 'cashbox')
  assert.equal(baseLocation.data().linkedCashboxId, 'cashbox-1')
  assert.equal(baseCashbox.data().locationId, 'cashbox-1')
  assert.equal(baseCashbox.data().name, 'Caja principal')
  assert.equal(shifts.size, 0)
  assert.equal(inventory.size, 0)
  assert.equal(roles.size, getTemplate('nightclub_lounge').roles.length)
  for (const role of getTemplate('nightclub_lounge').roles) assert((await freshRoot.collection('roles').doc(role.id).get()).exists)
  const onboardRetry = await call('onboard', { action: 'completeOnboarding', requestId: `onboard-${suffix}`, companyName: 'QA Nightclub Fresh', businessType: 'nightclub_lounge' })
  assert(onboardRetry.response.ok)
  assert.equal(onboardRetry.result.tenantId, freshTenantId)
  assert.equal((await freshRoot.collection('nightclubLocations').get()).size, 2)
  assert.equal((await freshRoot.collection('nightclubCashboxes').get()).size, 1)
  pass('onboarding crea warehouse-general, Caja principal, owner, branch y roles atómicamente; no crea turnos ni inventario y el retry no duplica')

  await createUser('create-tenant')
  const tenantCreatePayload = { action: 'createTenant', operationId: `create-${suffix}`, name: 'QA Nightclub createTenant', businessType: 'nightclub_lounge' }
  const createdTenant = await call('create-tenant', tenantCreatePayload)
  assert(createdTenant.response.ok, JSON.stringify(createdTenant.body))
  const createTenantId = createdTenant.result.tenantId
  const createTenantRetry = await call('create-tenant', tenantCreatePayload)
  assert(createTenantRetry.response.ok)
  assert.equal((await db.doc(`tenants/${createTenantId}/nightclubCashboxes/cashbox-1`).get()).exists, true)
  assert.equal((await db.collection(`tenants/${createTenantId}/nightclubLocations`).get()).size, 2)
  assert.equal((await db.collection(`tenants/${createTenantId}/nightclubShifts`).get()).size, 0)
  pass('createTenant provisiona la infraestructura inicial y su retry conserva una sola copia')

  const legacy = await createFixtureTenant({ key: 'legacy' })
  const initialized = await command('legacy', legacy.tenantId, 'main', 'initializeNightclubInfrastructure', `initialize-${suffix}`)
  assert(initialized.response.ok, JSON.stringify(initialized.body))
  assert.equal(initialized.result.status, 'initialized')
  const warehouseBefore = (await legacy.root.collection('nightclubLocations').doc('warehouse-general').get()).data()
  await legacy.root.collection('nightclubLocations').doc('warehouse-general').update({ name: 'Almacén de prueba renombrado' })
  const initializeAgain = await command('legacy', legacy.tenantId, 'main', 'initializeNightclubInfrastructure', `initialize-retry-${suffix}`)
  assert(initializeAgain.response.ok)
  assert.equal(initializeAgain.result.status, 'already_initialized')
  assert.equal((await legacy.root.collection('nightclubLocations').doc('warehouse-general').get()).data().name, 'Almacén de prueba renombrado')
  assert.equal((await legacy.root.collection('nightclubShifts').get()).size, 0)
  assert.equal((await legacy.root.collection('nightclubInventory').get()).size, 0)
  assert(warehouseBefore.createdAt)
  pass('tenant antiguo se inicializa; la repetición no sobrescribe nombres ni crea turnos/stock')

  const extra = await command('legacy', legacy.tenantId, 'main', 'createNightclubCashbox', `cashbox-2-${suffix}`, { name: 'Caja 2' })
  assert(extra.response.ok, JSON.stringify(extra.body))
  const extraRetry = await command('legacy', legacy.tenantId, 'main', 'createNightclubCashbox', `cashbox-2-${suffix}`, { name: 'Caja 2' })
  assert(extraRetry.response.ok)
  assert.deepEqual(extraRetry.result, extra.result)
  const extraCashbox = await legacy.root.collection('nightclubCashboxes').doc(extra.result.cashboxId).get()
  const extraLocation = await legacy.root.collection('nightclubLocations').doc(extra.result.locationId).get()
  assert.equal(extraCashbox.data().locationId, extraLocation.id)
  assert.equal(extraLocation.data().linkedCashboxId, extraCashbox.id)
  assert.equal(extraCashbox.data().branchId, 'main')
  assert.equal((await legacy.root.collection('nightclubCashboxes').get()).size, 2)
  assert.equal((await legacy.root.collection('nightclubLocations').get()).size, 3)
  const duplicateName = await command('legacy', legacy.tenantId, 'main', 'createNightclubCashbox', `duplicate-name-${suffix}`, { name: '  Caja   2  ' })
  assert.equal(duplicateName.status, 'ALREADY_EXISTS')
  pass('Caja 2 y ubicación se crean vinculadas en una transacción; mismo operationId devuelve el mismo resultado y nombres duplicados se rechazan')

  const selected = await command('legacy', legacy.tenantId, 'main', 'selectCashbox', `select-box2-${suffix}`, { cashboxId: extra.result.cashboxId })
  assert(selected.response.ok, JSON.stringify(selected.body))
  assert.equal(selected.result.locationId, extra.result.locationId)
  const opened = await command('legacy', legacy.tenantId, 'main', 'openCashboxShift', `open-box2-${suffix}`, { cashboxId: extra.result.cashboxId, openingFloat: 200 })
  assert(opened.response.ok, JSON.stringify(opened.body))
  const [context, shift] = await Promise.all([
    legacy.root.collection('nightclubOperatorContexts').doc(legacy.uid).get(),
    legacy.root.collection('nightclubShifts').doc(opened.result.shiftId).get(),
  ])
  assert.equal(context.data().cashboxId, extra.result.cashboxId)
  assert.equal(context.data().locationId, extra.result.locationId)
  assert.equal(context.data().activeShiftId, opened.result.shiftId)
  assert.equal(shift.data().cashboxId, extra.result.cashboxId)
  assert.equal(shift.data().locationId, extra.result.locationId)
  assert.equal(shift.data().openingFloat, 200)
  pass('owner selecciona Caja 2 y abre un turno independiente; operatorContext, locationId y shiftId quedan autoritativos en servidor')

  const admin = await createFixtureTenant({ key: 'admin', member: { roleId: 'admin', nightclubPermissions: ['settings.view', 'settings.edit'] } })
  const adminInit = await command('admin', admin.tenantId, 'main', 'initializeNightclubInfrastructure', `admin-init-${suffix}`)
  assert(adminInit.response.ok, JSON.stringify(adminInit.body))
  const adminCashbox = await command('admin', admin.tenantId, 'main', 'createNightclubCashbox', `admin-box-${suffix}`, { name: 'Caja Administración' })
  assert(adminCashbox.response.ok, JSON.stringify(adminCashbox.body))
  pass('administrador con settings.manage canónico y settings.edit Nightclub puede crear una caja')

  const restrictedAdmin = await createFixtureTenant({ key: 'restricted-admin', member: { roleId: 'admin', nightclubPermissions: [] } })
  const restricted = await command('restricted-admin', restrictedAdmin.tenantId, 'main', 'initializeNightclubInfrastructure', `restricted-${suffix}`)
  assert.equal(restricted.status, 'PERMISSION_DENIED')
  assert.equal((await restrictedAdmin.root.collection('nightclubLocations').get()).size, 0)
  pass('nightclubPermissions vacías mantienen al administrador bloqueado de infraestructura')

  for (const role of ['waiter', 'cashier']) {
    const fixture = await createFixtureTenant({ key: role, member: { roleId: role } })
    const denied = await command(role, fixture.tenantId, 'main', 'createNightclubCashbox', `denied-${role}-${suffix}`, { name: 'No autorizada' })
    assert.equal(denied.status, 'PERMISSION_DENIED')
    assert.equal((await fixture.root.collection('nightclubCashboxes').get()).size, 0)
  }
  pass('waiter y cashier no pueden crear infraestructura')

  const crossTenantUser = await createFixtureTenant({ key: 'outsider' })
  const crossTenant = await command('outsider', legacy.tenantId, 'main', 'createNightclubCashbox', `cross-${suffix}`, { name: 'Intrusa' })
  assert.equal(crossTenant.status, 'PERMISSION_DENIED')
  assert.equal((await legacy.root.collection('nightclubCashboxes').get()).size, 2)
  assert(crossTenantUser.tenantId !== legacy.tenantId)
  pass('usuario de otro tenant no puede crear caja ni cambiar datos del tenant objetivo')

  const inactive = await createFixtureTenant({ key: 'inactive', member: { status: 'disabled' } })
  const inactiveResult = await command('inactive', inactive.tenantId, 'main', 'initializeNightclubInfrastructure', `inactive-${suffix}`)
  assert.equal(inactiveResult.status, 'PERMISSION_DENIED')
  const unauthorizedBranch = await command('legacy', legacy.tenantId, 'other-branch', 'createNightclubCashbox', `branch-denied-${suffix}`, { name: 'Sucursal ajena' })
  assert.equal(unauthorizedBranch.status, 'PERMISSION_DENIED')
  const inactiveBranch = await createFixtureTenant({ key: 'inactive-branch', branchActive: false })
  const branchResult = await command('inactive-branch', inactiveBranch.tenantId, 'main', 'initializeNightclubInfrastructure', `branch-inactive-${suffix}`)
  assert.equal(branchResult.status, 'FAILED_PRECONDITION')
  pass('miembro inactivo, branch no autorizada y branch inactiva son rechazados')

  const partial = await createFixtureTenant({ key: 'partial', withPartialInfrastructure: true })
  const beforePartial = (await partial.root.collection('nightclubLocations').doc('warehouse-general').get()).data()
  const partialResult = await command('partial', partial.tenantId, 'main', 'initializeNightclubInfrastructure', `partial-${suffix}`)
  assert.equal(partialResult.status, 'FAILED_PRECONDITION')
  assert.deepEqual((await partial.root.collection('nightclubLocations').doc('warehouse-general').get()).data(), beforePartial)
  assert.equal((await partial.root.collection('nightclubCashboxes').get()).size, 0)
  pass('configuración parcial se rechaza sin completar ni sobrescribir documentos')

  const restaurant = await createFixtureTenant({ key: 'restaurant', businessType: 'restaurant_pos' })
  const wrongTemplate = await command('restaurant', restaurant.tenantId, 'main', 'initializeNightclubInfrastructure', `wrong-template-${suffix}`)
  assert.equal(wrongTemplate.status, 'FAILED_PRECONDITION')
  pass('tenant Restaurant no puede ejecutar comandos de infraestructura Nightclub')

  const noSelection = await createFixtureTenant({ key: 'no-selection-pos' })
  await noSelection.root.collection('nightclubLocations').doc('cashbox-1').set({ id: 'cashbox-1', tenantId: noSelection.tenantId, branchId: 'main', type: 'cashbox', name: 'Caja principal', linkedCashboxId: 'cashbox-1', active: true })
  await noSelection.root.collection('nightclubCashboxes').doc('cashbox-1').set({ id: 'cashbox-1', tenantId: noSelection.tenantId, branchId: 'main', locationId: 'cashbox-1', name: 'Caja principal', active: true })
  const noCashboxShift = await command('no-selection-pos', noSelection.tenantId, 'main', 'openShift', `legacy-shift-${suffix}`, { openingFloat: 50 })
  assert(noCashboxShift.response.ok)
  const noContextAccount = await command('no-selection-pos', noSelection.tenantId, 'main', 'openAccount', `no-context-${suffix}`, { target: { type: 'bar' } })
  assert.equal(noContextAccount.status, 'FAILED_PRECONDITION')
  assert.equal((await noSelection.root.collection('nightclubAccounts').get()).size, 0)
  pass('tener cajas configuradas pero no seleccionarlas impide usar POS aunque exista un turno global')

  const ownerClient = env.authenticatedContext(ownerUid).firestore()
  for (const [collection, id] of [
    ['nightclubLocations', 'client-location'], ['nightclubCashboxes', 'client-cashbox'],
    ['nightclubOperatorContexts', ownerUid], ['nightclubShifts', 'client-shift'],
  ]) {
    await assertFails(setDoc(doc(ownerClient, 'tenants', freshTenantId, collection, id), { tenantId: freshTenantId, branchId: 'main', active: true }))
  }
  pass('Rules siguen bloqueando escrituras cliente a locations, cashboxes, operatorContexts y shifts')

  assert.equal(checks, 14)
  console.log(`${checks} comprobaciones de first-run Nightclub aprobadas`)
} finally {
  for (const uid of users.values()) {
    try { await auth.deleteUser(uid) } catch { /* emulator teardown also clears Auth */ }
  }
  await env.cleanup()
}
