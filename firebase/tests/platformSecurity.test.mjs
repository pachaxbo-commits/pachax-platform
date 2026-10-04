// Platform security integration tests. Emulators only; no remote project is initialized.
import fs from 'node:fs'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { initializeTestEnvironment, assertFails } from '@firebase/rules-unit-testing'
import { collection, doc, getDoc, getDocs, setDoc, query, where } from 'firebase/firestore'

const projectId = 'demo-pachax-platform'
if (process.env.GCLOUD_PROJECT && process.env.GCLOUD_PROJECT !== projectId) throw new Error('Proyecto no autorizado para QA Platform.')
process.env.FIRESTORE_EMULATOR_HOST ||= '127.0.0.1:8185'
process.env.FIREBASE_AUTH_EMULATOR_HOST ||= '127.0.0.1:9195'
const require = createRequire(new URL('../../functions/package.json', import.meta.url))
const { initializeApp } = require('firebase-admin/app')
const { getFirestore, Timestamp } = require('firebase-admin/firestore')
const { getAuth } = require('firebase-admin/auth')
const { createTenant } = require('./tenants.cjs')
const { bootstrapFirstOwner } = require('./platformBootstrap.cjs')
const platform = require('./platform.cjs')
const { PACHAX_FUNCTIONS_REGION } = require('./regions.cjs')

const suffix = Date.now().toString(36)
const ids = {
  tenant: `platform-tenant-${suffix}`,
  foreign: `platform-foreign-${suffix}`,
  owner: `platform-owner-${suffix}`,
  owner2: `platform-owner2-${suffix}`,
  support: `platform-support-${suffix}`,
  disabled: `platform-disabled-${suffix}`,
}
const env = await initializeTestEnvironment({
  projectId,
  firestore: { host: '127.0.0.1', port: 8185, rules: fs.readFileSync('firebase/firestore.rules', 'utf8') },
})
const app = initializeApp({ projectId }, `platform-security-${suffix}`)
const db = getFirestore(app)
const auth = getAuth(app)
let checks = 0
const pass = message => { checks++; console.log('PASS', message) }
const request = (uid, data, platformClaim = true) => ({ auth: { uid, token: { platform: platformClaim } }, data })
async function signIn(uid) {
  const response = await fetch('http://127.0.0.1:9195/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=emulator', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: `${uid}@example.test`, password: 'Emulator123!', returnSecureToken: true }),
  })
  assert(response.ok)
  return (await response.json()).idToken
}
async function callPlatform(uid, data) {
  const token = await signIn(uid)
  const response = await fetch(`http://127.0.0.1:5101/${projectId}/southamerica-west1/platformGateway`, {
    method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({ data }),
  })
  return { response, body: await response.json() }
}

try {
  for (const uid of Object.values(ids)) await auth.createUser({ uid, email: `${uid}@example.test`, password: 'Emulator123!' })
  const tenantId = (await createTenant(db, auth, request(ids.tenant, { operationId: `tenant-${suffix}`, name: 'Tenant Platform QA', businessType: 'restaurant_pos' }, false))).tenantId
  const foreignTenantId = (await createTenant(db, auth, request(ids.foreign, { operationId: `foreign-${suffix}`, name: 'Tenant Ajeno QA', businessType: 'route_distribution' }, false))).tenantId

  await bootstrapFirstOwner(db, auth, ids.owner)
  assert.equal((await db.doc(`platformOperators/${ids.owner}`).get()).data().role, 'platform_owner')
  pass('bootstrap crea el primer owner con documento protegido')
  await assert.rejects(() => bootstrapFirstOwner(db, auth, ids.owner2), error => error.code === 'already-exists')
  pass('bootstrap de uso único rechaza un segundo owner arbitrario')

  await auth.setCustomUserClaims(ids.support, { platform: true })
  await auth.setCustomUserClaims(ids.disabled, { platform: true })
  await db.doc(`platformOperators/${ids.support}`).set({ uid: ids.support, role: 'platform_support', active: true })
  await db.doc(`platformOperators/${ids.disabled}`).set({ uid: ids.disabled, role: 'platform_admin', active: false })

  const tenantClient = env.authenticatedContext(ids.tenant).firestore()
  await assertFails(getDoc(doc(tenantClient, 'platformOperators', ids.owner)))
  pass('usuario tenant no lee operadores Platform')
  await assertFails(getDocs(collection(tenantClient, 'tenants')))
  pass('usuario tenant no enumera tenants')
  await assertFails(setDoc(doc(tenantClient, 'platformOperators', ids.tenant), { uid: ids.tenant, role: 'platform_owner', active: true }))
  pass('usuario tenant no se otorga rol Platform')
  await assertFails(setDoc(doc(tenantClient, 'platformBootstrap', 'firstOwner'), { uid: ids.tenant, status: 'complete' }))
  pass('usuario tenant no altera el marcador bootstrap')

  await assert.rejects(() => platform.validateOperator(db, request(ids.tenant, { action: 'validateOperator' }, false)), error => error.code === 'permission-denied')
  pass('endpoint Platform exige claim y operador protegido')
  const deniedCallable = await callPlatform(ids.tenant, { action: 'listTenants' })
  assert.equal(deniedCallable.body.error.status, 'PERMISSION_DENIED')
  pass('callable real impide enumeración Platform al usuario tenant')
  const ownerCallable = await callPlatform(ids.owner, { action: 'validateOperator' })
  assert(ownerCallable.response.ok)
  assert.equal((ownerCallable.body.result?.data || ownerCallable.body.result).role, 'platform_owner')
  pass('callable real valida claim y documento del owner')
  await assert.rejects(() => platform.validateOperator(db, request(ids.disabled, { action: 'validateOperator' })), error => error.code === 'permission-denied')
  pass('operador desactivado no accede')

  const directory = await platform.listTenants(db, request(ids.support, { action: 'listTenants', limit: 1 }))
  assert.equal(directory.tenants.length, 1)
  assert(directory.nextCursor)
  pass('directorio Platform está paginado server-side')
  const secondPage = await platform.listTenants(db, request(ids.support, { action: 'listTenants', limit: 1, cursor: directory.nextCursor }))
  assert.equal(secondPage.tenants.length, 1)
  pass('cursor Platform obtiene la página siguiente sin descargar todos los tenants')

  const readOnly = await platform.beginSupport(db, request(ids.support, { action: 'beginSupport', tenantId, viewedRoleId: 'admin' }))
  assert.equal(readOnly.mode, 'read-only')
  await assert.rejects(() => platform.supportUpdateSettings(db, request(ids.support, { action: 'supportUpdateSettings', sessionId: readOnly.id, changes: { name: 'Ataque soporte' } })), error => error.code === 'permission-denied')
  pass('platform_support sin elevación no escribe')
  await assert.rejects(() => platform.elevateSupport(db, request(ids.support, { action: 'elevateSupport', sessionId: readOnly.id, confirmed: true, reason: 'Necesidad de soporte QA' })), error => error.code === 'permission-denied')
  pass('platform_support no puede elevarse a sí mismo')

  const ownerSession = await platform.beginSupport(db, request(ids.owner, { action: 'beginSupport', tenantId, viewedRoleId: 'admin' }))
  await platform.elevateSupport(db, request(ids.owner, { action: 'elevateSupport', sessionId: ownerSession.id, confirmed: true, reason: 'Corrección autorizada durante QA' }))
  await platform.supportUpdateSettings(db, request(ids.owner, { action: 'supportUpdateSettings', sessionId: ownerSession.id, changes: { name: 'Tenant Platform QA actualizado' } }))
  assert.equal((await db.doc(`tenants/${tenantId}`).get()).data().name, 'Tenant Platform QA actualizado')
  const audit = await db.collection('platformAuditLogs').where('action', '==', 'support.tenantSettings.updated').get()
  assert(audit.docs.some(row => row.data().operatorUid === ids.owner && row.data().tenantId === tenantId && row.data().reason))
  pass('owner elevado escribe con motivo y auditoría server-side')

  await db.doc(`supportSessions/${ids.owner}`).update({ expiresAt: Timestamp.fromMillis(Date.now() - 1000) })
  await assert.rejects(() => platform.supportUpdateSettings(db, request(ids.owner, { action: 'supportUpdateSettings', sessionId: ownerSession.id, changes: { name: 'Sesión expirada' } })), error => error.code === 'permission-denied')
  pass('sesión elevada expirada no escribe')

  const context = await platform.supportContext(db, request(ids.support, { action: 'supportContext', sessionId: readOnly.id }))
  assert.equal(context.operatorUid, ids.support)
  assert.equal(context.tenant.tenantId, tenantId)
  assert.notEqual(context.tenant.tenantId, foreignTenantId)
  pass('Support View conserva identidad Platform y un único tenant')

  const platformClient = env.authenticatedContext(ids.owner, { platform: true }).firestore()
  await assertFails(getDoc(doc(platformClient, 'tenants', tenantId)))
  await assertFails(setDoc(doc(platformClient, 'tenants', tenantId), { name: 'Bypass directo' }, { merge: true }))
  pass('operador Platform no obtiene bypass lateral por Firestore Rules')

  assert.equal(PACHAX_FUNCTIONS_REGION, 'southamerica-west1')
  const frontendRegion = fs.readFileSync('src/config/functions.ts', 'utf8').match(/PACHAX_FUNCTIONS_REGION = '([^']+)'/)?.[1]
  assert.equal(frontendRegion, PACHAX_FUNCTIONS_REGION)
  pass('cliente y Functions nuevas apuntan ambos a southamerica-west1')

  await assert.rejects(() => platform.manageOperator(db, request(ids.support, { action: 'manageOperator', targetUid: ids.disabled, role: 'platform_admin', active: true })), error => error.code === 'permission-denied')
  pass('platform_support no puede gestionar operadores')

  const manageRes = await platform.manageOperator(db, request(ids.owner, { action: 'manageOperator', targetUid: ids.disabled, role: 'platform_admin', active: true }))
  assert.equal(manageRes.active, true)
  assert.equal((await db.doc(`platformOperators/${ids.disabled}`).get()).data().active, true)
  pass('platform_owner gestiona y reactiva operadores server-side')

  const unauthenticatedClient = env.unauthenticatedContext().firestore()
  await db.doc('platformTemplates/t_pub').set({ status: 'published', name: 'Plantilla Pública' })
  await db.doc('platformTemplates/t_draft').set({ status: 'draft', name: 'Plantilla Borrador' })
  assert.equal((await getDoc(doc(unauthenticatedClient, 'platformTemplates', 't_pub'))).data().name, 'Plantilla Pública')
  pass('cliente público puede leer plantillas publicadas')
  await assertFails(getDoc(doc(unauthenticatedClient, 'platformTemplates', 't_draft')))
  pass('cliente público NO puede leer plantillas en borrador (draft)')
  await assertFails(setDoc(doc(unauthenticatedClient, 'platformTemplates', 't_pub'), { name: 'Hack' }))
  pass('cliente público NO puede escribir configuraciones de plataforma')
  await assertFails(setDoc(doc(tenantClient, 'platformPlans', 'p_test'), { name: 'Hack' }))
  pass('cliente tenant NO puede escribir planes de plataforma')

  // Pruebas específicas de queries segregadas (public vs admin):
  await db.doc('platformPlans/p_pub_query').set({ status: 'published', name: 'Plan Público QA' })
  await db.doc('platformPlans/p_draft_query').set({ status: 'draft', name: 'Plan Borrador QA' })

  // 1. Query pública con where('status', '==', 'published') es permitida:
  const pubQuery = query(collection(unauthenticatedClient, 'platformPlans'), where('status', '==', 'published'))
  const pubDocs = await getDocs(pubQuery)
  assert(pubDocs.docs.some(d => d.id === 'p_pub_query'))
  assert(!pubDocs.docs.some(d => d.id === 'p_draft_query'))
  pass('query pública con where(status == published) se evalúa y resuelve exitosamente')

  // 2. Query pública abierta / sin filtro a la colección entera falla con permission-denied:
  await assertFails(getDocs(collection(unauthenticatedClient, 'platformPlans')))
  pass('query pública sin filtro a colección completa falla con permission-denied')

  // 3. Lectura directa de documento borrador por cliente no autenticado falla:
  await assertFails(getDoc(doc(unauthenticatedClient, 'platformPlans', 'p_draft_query')))
  pass('lectura directa de plan borrador falla con permission-denied')

  // 4. Operador de plataforma autenticado sí puede consultar la colección entera:
  const operatorClient = env.authenticatedContext(ids.owner, { platform: true }).firestore()
  const allOperatorPlans = await getDocs(collection(operatorClient, 'platformPlans'))
  assert(allOperatorPlans.docs.length >= 2)
  pass('operador Platform consulta la colección completa de planes (draft + published)')

  // 5. platform_content NO tiene permiso de escritura en platformPlans:
  await auth.createUser({ uid: 'cnt_writer', email: 'cnt_writer@example.test', password: 'Emulator123!' })
  await auth.setCustomUserClaims('cnt_writer', { platform: true, platformRole: 'platform_content' })
  await db.doc('platformOperators/cnt_writer').set({ uid: 'cnt_writer', role: 'platform_content', active: true })
  const contentClient = env.authenticatedContext('cnt_writer', { platform: true, platformRole: 'platform_content' }).firestore()
  await assertFails(setDoc(doc(contentClient, 'platformPlans', 'p_content_write'), { status: 'published', name: 'Hack Content' }))
  pass('platform_content no tiene permiso de escritura en platformPlans')

  assert.equal(checks, 30)
  console.log(`${checks} comprobaciones de seguridad Platform aprobadas`)
} finally {
  await env.cleanup()
}
