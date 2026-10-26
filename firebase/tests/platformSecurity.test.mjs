// Platform security integration tests. Emulators only; no remote project is initialized.
import fs from 'node:fs'
import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import { createRequire } from 'node:module'
import { initializeTestEnvironment, assertFails } from '@firebase/rules-unit-testing'
import { collection, doc, getDoc, getDocs, setDoc, query, where } from 'firebase/firestore'

const projectId = process.env.C1_PROJECT_ID || 'demo-pachax-platform'
if (process.env.GCLOUD_PROJECT && process.env.GCLOUD_PROJECT !== projectId) throw new Error('Proyecto no autorizado para QA Platform.')
process.env.FIRESTORE_EMULATOR_HOST ||= '127.0.0.1:8185'
process.env.FIREBASE_AUTH_EMULATOR_HOST ||= '127.0.0.1:9195'
const firestoreEndpoint = process.env.FIRESTORE_EMULATOR_HOST.split(':')
const authEndpoint = process.env.FIREBASE_AUTH_EMULATOR_HOST.split(':')
const functionsOrigin = process.env.C1_FUNCTIONS_ORIGIN || 'http://127.0.0.1:5101'
const require = createRequire(new URL('../../functions/package.json', import.meta.url))
const { initializeApp } = require('firebase-admin/app')
const { getFirestore, Timestamp } = require('firebase-admin/firestore')
const { getAuth } = require('firebase-admin/auth')
const { createTenant } = require('./tenants.cjs')
const { bootstrapFirstOwner } = require('./platformBootstrap.cjs')
const platform = require('./platform.cjs')
const commercialOnboarding = require('./commercialOnboarding.cjs')
const { PACHAX_FUNCTIONS_REGION } = require('./regions.cjs')

const suffix = Date.now().toString(36)
const ids = {
  tenant: `platform-tenant-${suffix}`,
  foreign: `platform-foreign-${suffix}`,
  owner: `platform-owner-${suffix}`,
  owner2: `platform-owner2-${suffix}`,
  admin: `platform-admin-${suffix}`,
  content: `platform-content-${suffix}`,
  support: `platform-support-${suffix}`,
  disabled: `platform-disabled-${suffix}`,
}
const env = await initializeTestEnvironment({
  projectId,
  firestore: { host: firestoreEndpoint[0], port: Number(firestoreEndpoint[1]), rules: fs.readFileSync('firebase/firestore.rules', 'utf8') },
})
const app = initializeApp({ projectId }, `platform-security-${suffix}`)
const db = getFirestore(app)
const auth = getAuth(app)
let checks = 0
const pass = message => { checks++; console.log('PASS', message) }
const request = (uid, data, platformClaim = true) => ({ auth: { uid, token: { platform: platformClaim } }, data })
async function signIn(uid) {
  const response = await fetch(`http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=emulator`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: `${uid}@example.test`, password: 'Emulator123!', returnSecureToken: true }),
  })
  assert(response.ok)
  return (await response.json()).idToken
}
async function callPlatform(uid, data) {
  const token = await signIn(uid)
  const response = await fetch(`${functionsOrigin}/${projectId}/southamerica-west1/platformGateway`, {
    method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({ data }),
  })
  return { response, body: await response.json() }
}
async function callTenantGateway(uid, data) {
  const token = await signIn(uid)
  const response = await fetch(`${functionsOrigin}/${projectId}/southamerica-west1/tenantGateway`, {
    method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({ data }),
  })
  return { response, body: await response.json() }
}
async function callPublicCommercialGateway(data) {
  const response = await fetch(`${functionsOrigin}/${projectId}/southamerica-west1/publicCommercialGateway`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ data }),
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
  await auth.setCustomUserClaims(ids.admin, { platform: true })
  await auth.setCustomUserClaims(ids.content, { platform: true })
  await auth.setCustomUserClaims(ids.disabled, { platform: true })
  await db.doc(`platformOperators/${ids.support}`).set({ uid: ids.support, role: 'platform_support', active: true })
  await db.doc(`platformOperators/${ids.admin}`).set({ uid: ids.admin, role: 'platform_admin', active: true })
  await db.doc(`platformOperators/${ids.content}`).set({ uid: ids.content, role: 'platform_content', active: true })
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
  await assertFails(getDoc(doc(unauthenticatedClient, 'platformTemplates', 't_pub')))
  pass('cliente público no lee documentos de plantillas directamente; usa proyección server-side')
  await assertFails(getDoc(doc(unauthenticatedClient, 'platformTemplates', 't_draft')))
  pass('cliente público NO puede leer plantillas en borrador (draft)')
  await assertFails(setDoc(doc(unauthenticatedClient, 'platformTemplates', 't_pub'), { name: 'Hack' }))
  pass('cliente público NO puede escribir configuraciones de plataforma')
  await assertFails(setDoc(doc(tenantClient, 'platformPlans', 'p_test'), { name: 'Hack' }))
  pass('cliente tenant NO puede escribir planes de plataforma')

  // Pruebas específicas de queries segregadas (public vs admin):
  await db.doc('platformPlans/p_pub_query').set({ status: 'published', name: 'Plan Público QA' })
  await db.doc('platformPlans/p_draft_query').set({ status: 'draft', name: 'Plan Borrador QA' })

  // 1. La query pública directa se rechaza: Rules no hacen field redaction.
  const pubQuery = query(collection(unauthenticatedClient, 'platformPlans'), where('status', '==', 'published'))
  await assertFails(getDocs(pubQuery))
  pass('query pública directa falla incluso filtrada por published')

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

  // 6. Operador de plataforma (incluyendo owner) NO puede escribir directamente en colecciones platform por cliente (servidor autoritativo):
  await assertFails(setDoc(doc(operatorClient, 'platformPlans', 'p_owner_direct'), { status: 'published', name: 'Direct Owner Write' }))
  pass('operador Platform NO escribe directamente a platformPlans (servidor autoritativo estricto)')
  await assertFails(setDoc(doc(operatorClient, 'platformAuditLogs', 'audit_client_write'), { action: 'audit.hack' }))
  pass('operador Platform NO escribe directamente a platformAuditLogs')
  await assertFails(setDoc(doc(operatorClient, 'platformTemplates', 't_owner_direct'), { status: 'published', name: 'Direct Template Write' }))
  pass('operador Platform NO escribe directamente a platformTemplates')
  await assertFails(setDoc(doc(operatorClient, 'platformConfig', 'publicLanding'), { status: 'published', title: 'Direct Config Write' }))
  pass('operador Platform NO escribe directamente a platformConfig')

  const hamburgerTemplate = {
    id: 'hamburger', canonicalTemplateId: 'hamburger', commercialName: 'Restaurante Rápido',
    templateId: 'hamburger', cardSubtitle: 'Mostrador ágil', description: 'Venta rápida de mostrador.',
    detailDescription: 'Operación de mostrador y despacho.', targetAudience: 'Locales de comida rápida.',
    problemSolved: 'Reduce las filas de atención.', bullets: ['POS', 'Caja'], features: ['Ventas y caja'],
    status: 'published', commercialAvailability: 'coming_soon', commercialMode: 'self_service',
    demoRoute: '/demo/hamburger', demoPath: '/demo/hamburger', order: 4,
  }
  await assert.rejects(() => platform.saveTemplate(db, request(ids.owner, {
    action: 'saveTemplate', template: { ...hamburgerTemplate, commercialName: '' },
  })), error => error.code === 'failed-precondition')
  pass('backend no publica plantillas sin contenido comercial administrado completo')
  const savedHamburger = await platform.saveTemplate(db, request(ids.owner, { action: 'saveTemplate', template: hamburgerTemplate }))
  assert.equal(savedHamburger.templateId, 'hamburger')
  assert.equal((await db.doc('platformTemplates/hamburger').get()).data().canonicalTemplateId, 'hamburger')
  assert((await db.doc('platformTemplates/hamburger').get()).exists)
  pass('Admin guarda Restaurante Rápido con identidad técnica hamburger independiente')
  await assert.rejects(() => platform.saveTemplate(db, request(ids.content, {
    action: 'saveTemplate', template: { ...hamburgerTemplate, implementationBasePriceUSD: 999 },
  })), error => error.code === 'permission-denied')
  pass('platform_content puede editar contenido, pero no disponibilidad ni importes comerciales')
  await assert.rejects(() => platform.saveTemplate(db, request(ids.owner, {
    action: 'saveTemplate', template: { ...hamburgerTemplate, commercialAvailability: 'available' },
  })), error => error.code === 'failed-precondition')
  pass('backend impide abrir comercialmente Hamburger mientras su provisioning técnico siga bloqueado')
  await assert.rejects(() => platform.saveTemplate(db, request(ids.owner, {
    action: 'saveTemplate', template: { ...hamburgerTemplate, commercialMode: 'specialized' },
  })), error => error.code === 'failed-precondition')
  pass('backend conserva Hamburger como autoservicio y evita mezclarlo con Restaurante con salón')

  const hamburgerPlan = {
    id: `hamb_plan_${suffix}`, templateId: 'hamburger', name: 'Plan QA', planKind: 'paid',
    monthlyPriceUSD: 50, annualPriceUSD: 500, currency: 'USD', status: 'draft',
    priceApproval: 'pending', includedFeatures: ['Ventas'], technicalEntitlements: [],
  }
  await platform.savePlan(db, request(ids.owner, { action: 'savePlan', plan: hamburgerPlan }))
  assert.equal((await db.doc(`platformPlans/${hamburgerPlan.id}`).get()).data().templateId, 'hamburger')
  await assert.rejects(() => platform.publishPlan(db, request(ids.owner, { action: 'publishPlan', planId: hamburgerPlan.id, status: 'published' })), error => error.code === 'failed-precondition')
  pass('Admin guarda planes borrador para Hamburger y el servidor bloquea publicación sin aprobación explícita')
  await assert.rejects(() => platform.savePlan(db, request(ids.owner, {
    action: 'savePlan', plan: { ...hamburgerPlan, technicalEntitlements: 'multi_branch' },
  })), error => error.code === 'invalid-argument')
  pass('el servidor rechaza entitlements técnicos malformados')
  await assert.rejects(() => platform.savePlan(db, request(ids.owner, {
    action: 'savePlan', plan: { ...hamburgerPlan, entitlements: { inventory: true }, subscriptionStatus: 'active' },
  })), error => error.code === 'invalid-argument')
  pass('el plan comercial rechaza campos que intentarían activar suscripción o entitlements')
  await assert.rejects(() => platform.savePlan(db, request(ids.owner, {
    action: 'savePlan', plan: { ...hamburgerPlan, priceApproval: 'approved', technicalEntitlements: ['sales'], status: 'published' },
  })), error => error.code === 'failed-precondition')
  pass('el servidor rechaza publicar entitlements pagados no conectados a Billing Core')

  const publishedAdminPlan = {
    ...hamburgerPlan, id: `hamb_public_${suffix}`, name: 'Hamburger aprobado QA',
    status: 'published', priceApproval: 'approved', monthlyPriceUSD: 35, annualPriceUSD: 30,
    includedFeatures: ['Ventas y caja verificadas'], technicalEntitlements: [],
  }
  await platform.savePlan(db, request(ids.owner, { action: 'savePlan', plan: publishedAdminPlan }))
  await assert.rejects(() => platform.savePlan(db, request(ids.admin, {
    action: 'savePlan', plan: { ...publishedAdminPlan, id: `admin_approved_${suffix}` },
  })), error => error.code === 'permission-denied')
  const qaExtra = {
    id: `qa-extra-${suffix}`, title: 'Implementación QA', shortDescription: 'Servicio ficticio de prueba.',
    category: 'consulting', referencePriceLabel: 'Cotización QA', pricingType: 'custom_quote',
    iconKey: 'code', applicableTemplates: ['hamburger'], status: 'draft', order: 1,
  }
  await assert.rejects(() => platform.saveExtra(db, request(ids.content, { action: 'saveExtra', extra: qaExtra })), error => error.code === 'permission-denied')
  await platform.saveExtra(db, request(ids.owner, { action: 'saveExtra', extra: qaExtra }))
  assert.equal((await db.doc(`platformExtras/${qaExtra.id}`).get()).data().status, 'draft')
  pass('precio y publicación de extras requieren permiso comercial, y el Owner puede guardar borrador')
  await db.doc(`platformPlans/${publishedAdminPlan.id}`).set({ privateAdminNotes: 'NO EXPONER', internalApproverUid: ids.owner }, { merge: true })
  const publicCatalogResult = await callPublicCommercialGateway({ action: 'getCatalog' })
  assert.equal(publicCatalogResult.response.status, 200)
  const publicCatalog = publicCatalogResult.body.result?.data || publicCatalogResult.body.result
  const projectedTemplate = publicCatalog.templates.find(item => item.id === 'hamburger')
  const projectedPlan = publicCatalog.plans.find(item => item.id === publishedAdminPlan.id)
  assert.equal(projectedTemplate.commercialName, 'Restaurante Rápido')
  assert.equal(projectedPlan.monthlyPriceUSD, 35)
  assert.equal(projectedPlan.includedFeatures[0], 'Ventas y caja verificadas')
  assert.equal('privateAdminNotes' in projectedPlan, false)
  assert.deepEqual(projectedPlan.technicalEntitlements, [])
  assert.equal(projectedPlan.priceApproval, 'approved')
  assert.equal('internalApproverUid' in projectedPlan, false)
  assert(!publicCatalog.plans.some(item => item.id === hamburgerPlan.id))
  const publicCatalogMeta = (await db.doc('platformConfig/publicCommercialCatalogMeta').get()).data()
  const publicCatalogSnapshot = (await db.doc('platformConfig/publicCommercialCatalog').get()).data()
  assert.equal(publicCatalogSnapshot.revision, publicCatalogMeta.revision)
  assert(publicCatalogSnapshot.catalog.plans.some(item => item.id === publishedAdminPlan.id))
  const sourceCollectionNames = new Set(['platformTemplates', 'platformPlans', 'platformExtras', 'platformMedia'])
  const guardedDb = new Proxy(db, {
    get(target, property) {
      if (property === 'collection') return name => {
        if (sourceCollectionNames.has(name)) throw new Error(`Snapshot path queried source collection ${name}`)
        return target.collection(name)
      }
      const value = Reflect.get(target, property, target)
      return typeof value === 'function' ? value.bind(target) : value
    },
  })
  const snapshotOnlyCatalog = await commercialOnboarding.getPublicCommercialCatalog(guardedDb, {
    rawRequest: { ip: `198.51.100.${parseInt(suffix.slice(-1), 36) % 200 + 1}` },
  }, 'emulator-only-snapshot-secret-32-bytes-minimum', { emulator: true })
  assert.equal(snapshotOnlyCatalog.plans.some(item => item.id === publishedAdminPlan.id), true)
  pass('snapshot publicado reduce la lectura estable a cuota + dos documentos; no consulta colecciones fuente')
  const oldRevision = Number(publicCatalogMeta.revision)
  await db.doc('platformConfig/publicCommercialCatalogMeta').set({ revision: oldRevision + 1 }, { merge: true })
  await assert.rejects(() => commercialOnboarding.getPublicCommercialCatalog(db, {
    rawRequest: { ip: `198.51.100.${parseInt(suffix.slice(-4), 36) % 200 + 1}` },
  }, 'emulator-only-snapshot-secret-32-bytes-minimum', { emulator: true }), error => error.code === 'unavailable')
  await commercialOnboarding.refreshPublicCommercialCatalogSnapshot(db)
  const refreshedCatalog = await commercialOnboarding.getPublicCommercialCatalog(db, {
    rawRequest: { ip: `198.51.100.${parseInt(suffix.slice(-5), 36) % 200 + 1}` },
  }, 'emulator-only-snapshot-secret-32-bytes-minimum', { emulator: true })
  assert.equal(refreshedCatalog.plans.some(item => item.id === publishedAdminPlan.id), true)
  pass('desfase entre revisión y snapshot falla cerrado y vuelve a servir solo tras reconstrucción')
  pass('callable público entrega solo campos aprobados del catálogo Admin')

  const publicInterestInput = {
    action: 'submitInterest', requestId: `public-interest-${suffix}`, contactName: 'Ana QA',
    companyName: 'Café Ficticio QA', email: 'ana@example.test', templateId: 'hamburger',
    businessType: 'Cafetería', needs: 'Caja rápida', branchCount: 2, planId: publishedAdminPlan.id, consent: true,
  }
  const publicInterestResult = await callPublicCommercialGateway(publicInterestInput)
  assert.equal(publicInterestResult.response.status, 200)
  const publicInterest = publicInterestResult.body.result?.data || publicInterestResult.body.result
  assert.equal(publicInterest.status, 'accepted')
  assert.equal(publicInterest.idempotent, false)
  const publicIntentQuery = await db.collection('platformCommercialIntents').where('companyName', '==', 'Café Ficticio QA').get()
  assert.equal(publicIntentQuery.size, 1)
  const publicIntent = publicIntentQuery.docs[0].data()
  assert.equal(publicIntent.email, 'ana@example.test')
  assert.equal(publicIntent.businessType, 'Cafetería')
  assert.equal(publicIntent.planSnapshot.planId, publishedAdminPlan.id)
  assert.equal(publicIntent.consentVersion, 'public-commercial-2026-10-v3')
  assert.equal(publicIntent.tenantId, null)
  assert.equal(publicIntent.subscriptionStatus, null)
  assert.equal(publicIntent.entitlements, null)
  const publicRetry = await callPublicCommercialGateway(publicInterestInput)
  const publicRetryData = publicRetry.body.result?.data || publicRetry.body.result
  assert.equal(publicRetryData.idempotent, true)
  pass('visitante sin sesión crea intención privada validada; reintento estable no duplica')
  const invalidPublicInterest = await callPublicCommercialGateway({ ...publicInterestInput, requestId: `bad-${suffix}`, consent: false })
  assert.equal(invalidPublicInterest.body.error?.status, 'INVALID_ARGUMENT')
  const forgedPublicInterest = await callPublicCommercialGateway({ ...publicInterestInput, requestId: `bad-field-${suffix}`, tenantId })
  assert.equal(forgedPublicInterest.body.error?.status, 'INVALID_ARGUMENT')
  pass('servidor rechaza consentimiento faltante y campos privados/forjados')
  await assertFails(setDoc(doc(unauthenticatedClient, 'platformCommercialIntents', 'direct-write'), { companyName: 'Hack' }))
  await assertFails(getDocs(collection(unauthenticatedClient, 'platformCommercialRateLimits')))
  await assertFails(getDoc(doc(unauthenticatedClient, 'platformConfig', 'publicCommercialCatalog')))
  await assertFails(getDoc(doc(unauthenticatedClient, 'platformConfig', 'publicCommercialCatalogMeta')))
  pass('cliente no puede escribir solicitudes ni leer rate limits o snapshots internos directamente')
  const rateSecret = 'emulator-only-c1-3-rate-secret-32-bytes-minimum'
  for (let index = 0; index < 8; index++) {
    await commercialOnboarding.submitPublicCommercialInterest(db, {
      data: { ...publicInterestInput, requestId: `rate-limit-${suffix}-${index}`, companyName: `QA rate ${index}`, planId: undefined },
      rawRequest: { ip: '198.51.100.44' },
    }, rateSecret, { emulator: true })
  }
  await assert.rejects(() => commercialOnboarding.submitPublicCommercialInterest(db, {
    data: { ...publicInterestInput, requestId: `rate-over-limit-${suffix}`, companyName: 'QA rate over', planId: undefined },
    rawRequest: { ip: '198.51.100.44' },
  }, rateSecret, { emulator: true }), error => error.code === 'resource-exhausted')
  pass('rate limit HMAC limita envíos repetidos por IP sin guardar la IP en claro')

  const catalogQuotaSecret = 'emulator-only-c1-4-catalog-secret-32chars-minimum'
  const catalogIp = `198.51.100.${parseInt(suffix.slice(-2), 36) % 200 + 1}`
  const catalogQuotaCalls = await Promise.allSettled(Array.from({ length: 24 }, () =>
    commercialOnboarding.consumePublicCatalogQuota(db, { rawRequest: { ip: catalogIp } }, catalogQuotaSecret, { emulator: true })))
  const catalogAccepted = catalogQuotaCalls.filter(result => result.status === 'fulfilled')
  const catalogDenied = catalogQuotaCalls.filter(result => result.status === 'rejected')
  assert.equal(catalogAccepted.length, 20)
  assert.equal(catalogDenied.length, 4)
  assert(catalogDenied.every(result => result.reason.code === 'resource-exhausted'))
  const catalogQuotaKey = createHmac('sha256', catalogQuotaSecret).update(`ip:${catalogIp}`).digest('hex')
  const catalogQuotaDocument = (await db.doc(`platformCommercialRateLimits/${catalogQuotaKey}`).get()).data()
  assert.equal(catalogQuotaDocument.catalogMinuteCount, 20)
  assert.equal(catalogQuotaDocument.catalogCount, 20)
  assert(!JSON.stringify(catalogQuotaDocument).includes(catalogIp))
  pass('límite de catálogo transaccional resiste 24 solicitudes concurrentes entre instancias')

  const catalogCapIds = Array.from({ length: 51 }, (_, index) => `commercial-cap-${suffix}-${index}`)
  try {
    await db.doc('platformConfig/publicCommercialCatalog').delete()
    await db.doc('platformConfig/publicCommercialCatalogMeta').delete()
    await Promise.all(catalogCapIds.map((idValue, index) => db.doc(`platformPlans/${idValue}`).set({
      status: 'published', name: `Plan límite ${index}`, templateId: 'hamburger',
    })))
    await assert.rejects(() => commercialOnboarding.getPublicCommercialCatalog(db, {
      rawRequest: { ip: `198.51.100.${parseInt(suffix.slice(-3), 36) % 200 + 1}` },
    }, catalogQuotaSecret, { emulator: true }), error => error.code === 'resource-exhausted')
    pass('proyección pública limita queries y rechaza catálogos sobredimensionados')
  } finally {
    await Promise.all(catalogCapIds.map(idValue => db.doc(`platformPlans/${idValue}`).delete()))
  }

  const interestUid = `commercial_interest_${suffix}`
  await auth.createUser({ uid: interestUid, email: `${interestUid}@example.test`, password: 'Emulator123!' })
  const interestInput = {
    action: 'submitCommercialInterest', requestId: `interest-${suffix}`, templateId: 'hamburger',
    companyName: 'Cafetería Ficticia QA', contactPhone: '+591 70000000', needs: 'Punto de venta para mostrador.',
    planId: publishedAdminPlan.id,
  }
  const interestResult = await callTenantGateway(interestUid, interestInput)
  assert.equal(interestResult.response.status, 200)
  const interest = interestResult.body.result?.data || interestResult.body.result
  assert.equal(interest.success, true)
  assert.equal(interest.idempotent, false)
  const intentRef = db.doc(`platformCommercialIntents/${interest.intentId}`)
  const intent = (await intentRef.get()).data()
  assert.equal(intent.templateId, 'hamburger')
  assert.equal(intent.businessType, 'hamburger_shop')
  assert.equal(intent.planSnapshot.planId, publishedAdminPlan.id)
  assert.equal(intent.planSnapshot.monthlyPrice, 35)
  assert.equal(intent.tenantId, null)
  assert.equal(intent.subscriptionStatus, null)
  assert.equal(intent.entitlements, null)
  pass('selección comercial guarda intención y snapshot de tarifa sin crear empresa ni activar entitlements')
  const repeatedInterest = await callTenantGateway(interestUid, interestInput)
  const repeatedBody = repeatedInterest.body.result?.data || repeatedInterest.body.result
  assert.equal(repeatedBody.intentId, interest.intentId)
  assert.equal(repeatedBody.idempotent, true)
  pass('reintento con requestId estable es idempotente')
  const changedRetry = await callTenantGateway(interestUid, { ...interestInput, companyName: 'Otro negocio' })
  assert.equal(changedRetry.body.error?.status, 'ALREADY_EXISTS')
  pass('reutilizar requestId con contenido distinto se rechaza')
  const forgedInterest = await callTenantGateway(interestUid, { ...interestInput, requestId: `forged-${suffix}`, uid: ids.owner, tenantId: 'tenant-ajeno' })
  assert.equal(forgedInterest.body.error?.status, 'INVALID_ARGUMENT')
  pass('el cliente no puede fijar UID ni tenant en una solicitud comercial')
  const foreignPlan = await callTenantGateway(interestUid, { ...interestInput, requestId: `wrong-plan-${suffix}`, templateId: 'retail' })
  assert.equal(foreignPlan.body.error?.status, 'FAILED_PRECONDITION')
  pass('el servidor rechaza un plan publicado seleccionado para otra plantilla')
  const interestClient = env.authenticatedContext(interestUid).firestore()
  await assertFails(getDoc(doc(interestClient, 'platformCommercialIntents', interest.intentId)))
  pass('cliente no puede leer directamente las solicitudes comerciales')
  const listedIntents = await callPlatform(ids.owner, { action: 'listCommercialIntents', limit: 50 })
  assert.equal(listedIntents.response.status, 200)
  const listed = listedIntents.body.result?.data || listedIntents.body.result
  assert(listed.intents.some(row => row.companyName === 'Café Ficticio QA'))
  const proposalRequest = {
    action: 'prepareCommercialProposal', intentId: interest.intentId,
    requestId: `proposal-${suffix}`, implementationOneTime: 450, monthlyPrice: 35, annualPrice: 350,
    currency: 'USD', extraIds: [],
  }
  const proposal = await callPlatform(ids.owner, proposalRequest)
  assert.equal(proposal.response.status, 200)
  const proposalBody = proposal.body.result?.data || proposal.body.result
  assert.equal(proposalBody.status, 'draft')
  assert.equal((await intentRef.get()).data().proposal.implementationOneTime, 450)
  const proposalRetry = await callPlatform(ids.owner, proposalRequest)
  const proposalRetryBody = proposalRetry.body.result?.data || proposalRetry.body.result
  assert.equal(proposalRetryBody.commercialVersion, proposalBody.commercialVersion)
  assert.equal(proposalRetryBody.idempotent, true)
  pass('Owner prepara propuesta versionada e idempotente separando implementación de mensualidad')
  const statusResult = await callPlatform(ids.owner, {
    action: 'updateCommercialIntentStatus', intentId: publicIntentQuery.docs[0].id, status: 'contacted', requestId: `status-${suffix}`,
  })
  assert.equal(statusResult.response.status, 200)
  assert.equal((await publicIntentQuery.docs[0].ref.get()).data().status, 'contacted')
  const repeatedStatus = await callPlatform(ids.owner, {
    action: 'updateCommercialIntentStatus', intentId: publicIntentQuery.docs[0].id, status: 'contacted', requestId: `status-${suffix}`,
  })
  const repeatedStatusData = repeatedStatus.body.result?.data || repeatedStatus.body.result
  assert.equal(repeatedStatusData.idempotent, true)
  const supportStatus = await callPlatform(ids.support, {
    action: 'updateCommercialIntentStatus', intentId: publicIntentQuery.docs[0].id, status: 'closed', requestId: `support-status-${suffix}`,
  })
  assert.equal(supportStatus.body.error?.status, 'PERMISSION_DENIED')
  pass('Owner cambia estado de seguimiento con auditoría e idempotencia; Support es rechazado')
  const publicProposal = await callPlatform(ids.owner, {
    action: 'prepareCommercialProposal', intentId: publicIntentQuery.docs[0].id,
    requestId: `public-proposal-${suffix}`, implementationOneTime: 300, monthlyPrice: 30, annualPrice: 300,
    currency: 'USD', extraIds: [],
  })
  assert.equal(publicProposal.response.status, 200)
  assert.equal((await publicIntentQuery.docs[0].ref.get()).data().proposal.status, 'draft')
  pass('Admin recibe la solicitud anónima y prepara una propuesta separada en borrador')
  const supportIntents = await callPlatform(ids.support, { action: 'listCommercialIntents', limit: 5 })
  assert.equal(supportIntents.body.error?.status, 'PERMISSION_DENIED')
  pass('Support sin plans.manage no puede leer prospectos ni preparar propuestas')
  const platformLead = await callTenantGateway(ids.owner, { ...interestInput, requestId: `platform-interest-${suffix}` })
  assert.equal(platformLead.body.error?.status, 'PERMISSION_DENIED')
  pass('operador Platform no usa el flujo de prospectos para eludir onboarding tenant')

  await platform.publishPlan(db, request(ids.owner, { action: 'publishPlan', planId: publishedAdminPlan.id, status: 'draft' }))
  const afterUnpublish = await callPublicCommercialGateway({ action: 'getCatalog' })
  const catalogAfterUnpublish = afterUnpublish.body.result?.data || afterUnpublish.body.result
  assert(!catalogAfterUnpublish.plans.some(item => item.id === publishedAdminPlan.id))
  pass('despublicar una oferta la retira de la proyección pública inmediatamente')

  // === PROVISIONING GATE EN TENANTGATEWAY (SERVER-AUTHORITATIVE) ===
  const ordinaryUid = `user_prov_${suffix}`
  await auth.createUser({ uid: ordinaryUid, email: `${ordinaryUid}@example.test`, password: 'Emulator123!', displayName: 'Usuario Ordinario' })

  // 1. completeOnboarding con hamburger_shop -> DENIED / failed-precondition
  const onbHamb = await callTenantGateway(ordinaryUid, {
    action: 'completeOnboarding',
    requestId: `onb_hamb_${suffix}`,
    companyName: 'Hamburguesas Bypass',
    businessType: 'hamburger_shop',
  })
  assert.equal(onbHamb.body.error?.status, 'FAILED_PRECONDITION')
  assert(onbHamb.body.error?.message?.includes('todavía no está disponible para crear empresas'))
  pass('tenantGateway completeOnboarding con hamburger_shop es DENEGADO (failed-precondition)')

  // 2. completeOnboarding con gelateria_weight_cafe -> DENIED / failed-precondition
  const onbGel = await callTenantGateway(ordinaryUid, {
    action: 'completeOnboarding',
    requestId: `onb_gel_${suffix}`,
    companyName: 'Retail Bypass',
    businessType: 'gelateria_weight_cafe',
  })
  assert.equal(onbGel.body.error?.status, 'FAILED_PRECONDITION')
  assert(onbGel.body.error?.message?.includes('todavía no está disponible para crear empresas'))
  pass('tenantGateway completeOnboarding con gelateria_weight_cafe es DENEGADO (failed-precondition)')

  // 3. createTenant con coming-soon BusinessType -> DENIED / failed-precondition
  const createComingSoon = await callTenantGateway(ordinaryUid, {
    action: 'createTenant',
    operationId: `create_hamb_${suffix}`,
    name: 'Hamburguesas Create Bypass',
    businessType: 'hamburger_shop',
  })
  assert.equal(createComingSoon.body.error?.status, 'FAILED_PRECONDITION')
  assert(createComingSoon.body.error?.message?.includes('todavía no está disponible para crear empresas'))
  pass('createTenant vía tenantGateway con coming-soon BusinessType es DENEGADO')

  // 4. completeOnboarding con route_distribution -> PASS
  const onbDist = await callTenantGateway(ordinaryUid, {
    action: 'completeOnboarding',
    requestId: `onb_dist_${suffix}`,
    companyName: 'Distribuidora Autorizada',
    businessType: 'route_distribution',
  })
  assert.equal(onbDist.response.status, 200)
  assert.equal(onbDist.body.result?.template?.businessType, 'route_distribution')
  assert(onbDist.body.result?.tenantId)
  const tenantWithoutBilling = (await db.doc(`tenants/${onbDist.body.result.tenantId}`).get()).data()
  assert.equal(tenantWithoutBilling.planKey, null)
  assert.deepEqual(tenantWithoutBilling.entitlements, {})
  pass('tenantGateway completeOnboarding con route_distribution es PERMITIDO y converge')
  const attemptedPaidActivation = await callTenantGateway(ordinaryUid, {
    action: 'completeOnboarding', requestId: `onb_paid_attempt_${suffix}`,
    companyName: 'Distribuidora Autorizada', businessType: 'route_distribution',
    planKey: `hamb_plan_${suffix}`, entitlements: { sales: true, inventory: true },
  })
  assert.equal(attemptedPaidActivation.response.status, 400)
  assert.equal(attemptedPaidActivation.body.error?.status, 'INVALID_ARGUMENT')
  const tenantAfterAttempt = (await db.doc(`tenants/${onbDist.body.result.tenantId}`).get()).data()
  assert.equal(tenantAfterAttempt.planKey, null)
  assert.deepEqual(tenantAfterAttempt.entitlements, {})
  pass('onboarding rechaza plan/entitlements enviados por cliente y no activa beneficios')

  // 5. completeOnboarding con restaurant_pos -> PASS
  const restUserUid = `user_rest_${suffix}`
  await auth.createUser({ uid: restUserUid, email: `${restUserUid}@example.test`, password: 'Emulator123!', displayName: 'Usuario Restaurante' })
  const onbRest = await callTenantGateway(restUserUid, {
    action: 'completeOnboarding',
    requestId: `onb_rest_${suffix}`,
    companyName: 'Restaurante Autorizado',
    businessType: 'restaurant_pos',
  })
  assert.equal(onbRest.response.status, 200)
  assert.equal(onbRest.body.result?.template?.businessType, 'restaurant_pos')
  assert(onbRest.body.result?.tenantId)
  pass('tenantGateway completeOnboarding con restaurant_pos es PERMITIDO y converge')

  // 6. completeOnboarding con nightclub_lounge -> PASS
  const nightUserUid = `user_night_${suffix}`
  await auth.createUser({ uid: nightUserUid, email: `${nightUserUid}@example.test`, password: 'Emulator123!', displayName: 'Usuario Nightclub' })
  const onbNight = await callTenantGateway(nightUserUid, {
    action: 'completeOnboarding',
    requestId: `onb_night_${suffix}`,
    companyName: 'Nightclub Autorizado',
    businessType: 'nightclub_lounge',
  })
  assert.equal(onbNight.response.status, 200)
  assert.equal(onbNight.body.result?.template?.businessType, 'nightclub_lounge')
  assert(onbNight.body.result?.tenantId)
  pass('tenantGateway completeOnboarding con nightclub_lounge es PERMITIDO y converge')

    assert.equal(checks, 72)
  console.log(`${checks} comprobaciones de seguridad Platform aprobadas`)
} finally {
  await env.cleanup()
}
