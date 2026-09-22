// Secure initial tenant onboarding. Emulator-only by design.
import fs from 'node:fs'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing'
import { doc, getDoc, setDoc } from 'firebase/firestore'

const projectId = 'demo-pachax-platform'
if (process.env.GCLOUD_PROJECT && process.env.GCLOUD_PROJECT !== projectId) throw new Error('Proyecto no autorizado para QA onboarding.')
process.env.FIRESTORE_EMULATOR_HOST ||= '127.0.0.1:8185'
process.env.FIREBASE_AUTH_EMULATOR_HOST ||= '127.0.0.1:9195'
const require = createRequire(new URL('../../functions/package.json', import.meta.url))
const { initializeApp } = require('firebase-admin/app')
const { getFirestore } = require('firebase-admin/firestore')
const { getAuth } = require('firebase-admin/auth')
const { initialTenantId } = require('./onboarding.cjs')

const suffix = Date.now().toString(36)
const ids = {
  ownerA: `onboarding-a-${suffix}`,
  ownerB: `onboarding-b-${suffix}`,
  partial: `onboarding-partial-${suffix}`,
  platform: `onboarding-platform-${suffix}`,
}
const env = await initializeTestEnvironment({
  projectId,
  firestore: { host: '127.0.0.1', port: 8185, rules: fs.readFileSync('firebase/firestore.rules', 'utf8') },
})
const app = initializeApp({ projectId }, `tenant-onboarding-${suffix}`)
const db = getFirestore(app)
const auth = getAuth(app)
let checks = 0
const pass = message => { checks++; console.log('PASS', message) }

async function signIn(uid) {
  const response = await fetch('http://127.0.0.1:9195/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=emulator', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: `${uid}@example.test`, password: 'Emulator123!', returnSecureToken: true }),
  })
  assert(response.ok, `Auth emulator rechazó ${uid}`)
  return (await response.json()).idToken
}

async function callOnboarding(token, data) {
  const response = await fetch(`http://127.0.0.1:5101/${projectId}/southamerica-west1/tenantGateway`, {
    method: 'POST', headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify({ data: { action: 'completeOnboarding', ...data } }),
  })
  const body = await response.json()
  return { response, body, result: body.result?.data || body.result }
}

try {
  for (const uid of Object.values(ids)) {
    await auth.createUser({ uid, email: `${uid}@example.test`, password: 'Emulator123!', displayName: `QA ${uid}` })
  }

  const unauthenticated = await callOnboarding(null, { requestId: 'unauth', companyName: 'Sin sesión', businessType: 'restaurant_pos' })
  assert.equal(unauthenticated.body.error.status, 'UNAUTHENTICATED')
  pass('onboarding exige Firebase Auth')

  const tokenA = await signIn(ids.ownerA)
  const payload = { companyName: '  Empresa   A  ', businessType: 'restaurant_pos', branding: { primary: '#20383A', accent: '#B58A55' } }
  const [first, duplicate] = await Promise.all([
    callOnboarding(tokenA, { ...payload, requestId: `click-a-${suffix}` }),
    callOnboarding(tokenA, { ...payload, requestId: `click-b-${suffix}` }),
  ])
  assert(first.response.ok && duplicate.response.ok)
  assert.equal(first.result.tenantId, duplicate.result.tenantId)
  assert.equal(first.result.tenantId, initialTenantId(ids.ownerA))
  pass('doble llamada concurrente converge en un tenant determinístico')

  const tenantA = first.result.tenantId
  const [tenant, member, profile, link, branch, marker, audit] = await Promise.all([
    db.doc(`tenants/${tenantA}`).get(), db.doc(`tenants/${tenantA}/members/${ids.ownerA}`).get(),
    db.doc(`users/${ids.ownerA}`).get(), db.doc(`users/${ids.ownerA}/tenantLinks/${tenantA}`).get(),
    db.doc(`tenants/${tenantA}/branches/main`).get(), db.doc(`users/${ids.ownerA}/onboarding/initialTenant`).get(),
    db.collection(`tenants/${tenantA}/auditLogs`).where('action', '==', 'onboarding.completed').get(),
  ])
  assert(tenant.exists && member.exists && profile.exists && link.exists && branch.exists && marker.exists)
  assert.equal(tenant.data().ownerUid, ids.ownerA)
  assert.equal(member.data().roleId, 'owner')
  assert.equal(link.data().roleId, 'owner')
  assert.equal(audit.size, 1)
  assert.equal(typeof tenant.data().createdAt.toDate, 'function')
  pass('transacción crea perfil, tenant, owner, link, branch, marcador y auditoría')

  assert.equal(tenant.data().name, 'Empresa A')
  assert.deepEqual(tenant.data().branding, { primary: '#20383a', accent: '#b58a55' })
  assert.equal((await db.collection(`tenants/${tenantA}/roles`).get()).size, 6)
  pass('nombre, branding y roles provienen de validación y template canónico')

  const retry = await callOnboarding(tokenA, { ...payload, requestId: `retry-${suffix}` })
  assert(retry.response.ok)
  assert.deepEqual(retry.result, first.result)
  assert.equal((await db.collection('tenants').where('ownerUid', '==', ids.ownerA).get()).size, 1)
  assert.equal((await db.collection(`tenants/${tenantA}/auditLogs`).where('action', '==', 'onboarding.completed').get()).size, 1)
  pass('reintento posterior devuelve el mismo contrato sin duplicar documentos ni auditoría')

  assert.deepEqual(Object.keys(first.result).sort(), ['membership', 'onboarding', 'template', 'tenantId'])
  assert.equal(first.result.membership.roleId, 'owner')
  assert.equal(first.result.template.businessType, 'restaurant_pos')
  assert.equal(first.result.onboarding.status, 'complete')
  assert(!JSON.stringify(first.result).includes('@example.test'))
  pass('respuesta mínima no expone correo, credenciales ni datos administrativos')

  const forgedOwner = await callOnboarding(tokenA, { ...payload, requestId: `forged-owner-${suffix}`, ownerUid: ids.ownerB })
  assert.equal(forgedOwner.body.error.status, 'INVALID_ARGUMENT')
  pass('usuario A no puede enviar ownerUid de usuario B')
  const forgedRole = await callOnboarding(tokenA, { ...payload, requestId: `forged-role-${suffix}`, roleId: 'platform_owner' })
  assert.equal(forgedRole.body.error.status, 'INVALID_ARGUMENT')
  pass('payload no puede asignar roles tenant ni Platform')

  const tokenB = await signIn(ids.ownerB)
  const invalidTemplate = await callOnboarding(tokenB, { requestId: `invalid-template-${suffix}`, companyName: 'Empresa B', businessType: 'platform_owner' })
  assert.equal(invalidTemplate.body.error.status, 'INVALID_ARGUMENT')
  assert(!(await db.doc(`users/${ids.ownerB}/onboarding/initialTenant`).get()).exists)
  pass('template inválido no deja onboarding parcial')

  const forgedPlatform = await callOnboarding(tokenB, { requestId: `forged-platform-${suffix}`, companyName: 'Empresa B', businessType: 'gelateria_weight_cafe', platformRole: 'platform_owner' })
  assert.equal(forgedPlatform.body.error.status, 'INVALID_ARGUMENT')
  assert(!(await db.doc(`platformOperators/${ids.ownerB}`).get()).exists)
  pass('onboarding nunca crea privilegios Platform')

  const clientB = env.authenticatedContext(ids.ownerB).firestore()
  await assertFails(setDoc(doc(clientB, 'tenants', initialTenantId(ids.ownerB)), { ownerUid: ids.ownerB }))
  await assertFails(setDoc(doc(clientB, 'platformOperators', ids.ownerB), { role: 'platform_owner', active: true }))
  await assertFails(setDoc(doc(clientB, 'users', ids.ownerB, 'onboarding', 'initialTenant'), { status: 'complete' }))
  pass('Rules bloquea tenant, Platform y marcador escritos directamente por cliente')

  const completedB = await callOnboarding(tokenB, {
    requestId: `valid-b-${suffix}`, companyName: 'Empresa B', businessType: 'gelateria_weight_cafe',
  })
  assert(completedB.response.ok)
  const tenantB = completedB.result.tenantId
  pass('segundo usuario completa onboarding con el businessType canónico visible como Comercio')

  const clientA = env.authenticatedContext(ids.ownerA).firestore()
  await assertSucceeds(getDoc(doc(clientA, 'tenants', tenantA)))
  await assertFails(getDoc(doc(clientA, 'tenants', tenantB)))
  await assertSucceeds(getDoc(doc(clientB, 'tenants', tenantB)))
  await assertFails(getDoc(doc(clientB, 'tenants', tenantA)))
  pass('aislamiento A/B permanece vigente después del onboarding')

  const partialTenantId = initialTenantId(ids.partial)
  await db.doc(`tenants/${partialTenantId}`).set({ tenantId: partialTenantId, ownerUid: ids.partial, name: 'Residuo QA' })
  const partial = await callOnboarding(await signIn(ids.partial), {
    requestId: `partial-${suffix}`, companyName: 'No completar', businessType: 'route_distribution',
  })
  assert.equal(partial.body.error.status, 'FAILED_PRECONDITION')
  assert(!(await db.doc(`tenants/${partialTenantId}/members/${ids.partial}`).get()).exists)
  assert(!(await db.doc(`users/${ids.partial}`).get()).exists)
  assert(!(await db.doc(`users/${ids.partial}/onboarding/initialTenant`).get()).exists)
  pass('estado parcial previo se detiene sin completar documentos restantes')

  await db.doc(`platformOperators/${ids.platform}`).set({ uid: ids.platform, role: 'platform_support', active: true })
  const platformAttempt = await callOnboarding(await signIn(ids.platform), {
    requestId: `platform-${suffix}`, companyName: 'Tenant indebido', businessType: 'restaurant_pos',
  })
  assert.equal(platformAttempt.body.error.status, 'PERMISSION_DENIED')
  assert(!(await db.doc(`tenants/${initialTenantId(ids.platform)}`).get()).exists)
  pass('operador Platform activo no usa onboarding tenant como acceso lateral')

  assert.equal(checks, 15)
  console.log(`${checks} comprobaciones de onboarding seguro aprobadas`)
} finally {
  await env.cleanup()
}
