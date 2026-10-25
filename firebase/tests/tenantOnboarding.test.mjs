// Secure initial tenant onboarding. Emulator-only by design.
import fs from 'node:fs'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing'
import { doc, getDoc, setDoc } from 'firebase/firestore'
import { BRAND_PALETTES } from '../../src/core/brandPalettes.ts'

const projectId = process.env.C1_PROJECT_ID || 'demo-pachax-platform'
if (process.env.GCLOUD_PROJECT && process.env.GCLOUD_PROJECT !== projectId) throw new Error('Proyecto no autorizado para QA onboarding.')
process.env.FIRESTORE_EMULATOR_HOST ||= '127.0.0.1:8185'
process.env.FIREBASE_AUTH_EMULATOR_HOST ||= '127.0.0.1:9195'
const firestoreEndpoint = process.env.FIRESTORE_EMULATOR_HOST.split(':')
const authOrigin = `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}`
const functionsOrigin = process.env.C1_FUNCTIONS_ORIGIN || 'http://127.0.0.1:5101'
const require = createRequire(new URL('../../functions/package.json', import.meta.url))
const { initializeApp } = require('firebase-admin/app')
const { getFirestore } = require('firebase-admin/firestore')
const { getAuth } = require('firebase-admin/auth')
const { initialTenantId } = require('./onboarding.cjs')

const suffix = Date.now().toString(36)
const ids = {
  ownerA: `onboarding-a-${suffix}`,
  ownerB: `onboarding-b-${suffix}`,
  ownerDistribution: `onboarding-distribution-${suffix}`,
  ownerInvalid: `onboarding-invalid-${suffix}`,
  ownerNightclub: `onboarding-nightclub-${suffix}`,
  ownerPaletteRecovery: `onboarding-palette-recovery-${suffix}`,
  partial: `onboarding-partial-${suffix}`,
  platform: `onboarding-platform-${suffix}`,
}
const paletteOwners = Object.fromEntries(BRAND_PALETTES.map(palette => [palette.id, `onboarding-palette-${palette.id}-${suffix}`]))
const env = await initializeTestEnvironment({
  projectId,
  firestore: { host: firestoreEndpoint[0], port: Number(firestoreEndpoint[1]), rules: fs.readFileSync('firebase/firestore.rules', 'utf8') },
})
const app = initializeApp({ projectId }, `tenant-onboarding-${suffix}`)
const db = getFirestore(app)
const auth = getAuth(app)
let checks = 0
const pass = message => { checks++; console.log('PASS', message) }

async function signIn(uid) {
  const response = await fetch(`${authOrigin}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=emulator`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: `${uid}@example.test`, password: 'Emulator123!', returnSecureToken: true }),
  })
  assert(response.ok, `Auth emulator rechazó ${uid}`)
  return (await response.json()).idToken
}

async function callOnboarding(token, data) {
  const response = await fetch(`${functionsOrigin}/${projectId}/southamerica-west1/tenantGateway`, {
    method: 'POST', headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify({ data: { action: 'completeOnboarding', ...data } }),
  })
  const body = await response.json()
  return { response, body, result: body.result?.data || body.result }
}

try {
  for (const uid of [...Object.values(ids), ...Object.values(paletteOwners)]) {
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

  const invalidIndustry = await callOnboarding(await signIn(ids.ownerInvalid), {
    requestId: `invalid-industry-${suffix}`, companyName: 'Rubro inválido', businessType: 'route_distribution', industryProfile: 'autos',
  })
  assert.equal(invalidIndustry.body.error.status, 'INVALID_ARGUMENT')
  assert(!(await db.doc(`tenants/${initialTenantId(ids.ownerInvalid)}`).get()).exists)
  pass('onboarding rechaza rubros desconocidos antes de escribir documentos')

  const wrongTemplateProfile = await callOnboarding(await signIn(ids.ownerInvalid), {
    requestId: `wrong-template-profile-${suffix}`, companyName: 'Perfil fuera de plantilla', businessType: 'restaurant_pos', industryProfile: 'food',
  })
  assert.equal(wrongTemplateProfile.body.error.status, 'INVALID_ARGUMENT')
  assert(!(await db.doc(`tenants/${initialTenantId(ids.ownerInvalid)}`).get()).exists)
  pass('onboarding rechaza industryProfile en plantillas distintas de Distribución')

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
    requestId: `valid-b-${suffix}`, companyName: 'Empresa B', businessType: 'restaurant_pos',
  })
  assert(completedB.response.ok)
  const tenantB = completedB.result.tenantId
  pass('segundo usuario completa onboarding con un businessType canónico habilitado')

  const nightclubResult = await callOnboarding(await signIn(ids.ownerNightclub), {
    requestId: `nightclub-${suffix}`, companyName: 'Club QA', businessType: 'nightclub_lounge',
  })
  assert(nightclubResult.response.ok)
  assert.equal(nightclubResult.result.template.businessType, 'nightclub_lounge')
  const nightclubTenant = nightclubResult.result.tenantId
  assert.equal((await db.collection(`tenants/${nightclubTenant}/roles`).get()).size, 9)
  assert.equal((await db.doc(`tenants/${nightclubTenant}`).get()).data().businessType, 'nightclub_lounge')
  pass('Nightclub completa onboarding con tenant, owner y roles del template canónico')

  const distributionRequestId = `distribution-${suffix}`
  const distributionResult = await callOnboarding(await signIn(ids.ownerDistribution), {
    requestId: distributionRequestId, companyName: 'Bebidas QA', businessType: 'route_distribution', industryProfile: 'beverages',
  })
  assert(distributionResult.response.ok, JSON.stringify(distributionResult.body))
  const distributionTenant = distributionResult.result.tenantId
  const catalogRef = db.doc(`tenants/${distributionTenant}/distSettings/catalog`)
  const initialCatalog = await catalogRef.get()
  assert.equal(initialCatalog.data()?.industryProfile, 'beverages')
  assert.deepEqual(initialCatalog.data()?.categories.map(category => category.name), ['Agua', 'Gaseosas', 'Jugos', 'Otros'])
  assert.equal((await db.collection(`tenants/${distributionTenant}/distProducts`).get()).size, 0)
  const distributionRetry = await callOnboarding(await signIn(ids.ownerDistribution), {
    requestId: distributionRequestId, companyName: 'Bebidas QA', businessType: 'route_distribution', industryProfile: 'beverages',
  })
  assert(distributionRetry.response.ok)
  assert.equal((await catalogRef.get()).data()?.categories.length, 4)
  pass('onboarding Distribution persiste perfil/categorías dentro del alta sin sembrar productos y reintenta sin duplicar')

  const paletteRecoveryRequestId = `palette-recovery-${suffix}`
  const rejectedPalette = await callOnboarding(await signIn(ids.ownerPaletteRecovery), {
    requestId: paletteRecoveryRequestId, companyName: 'Recuperación paleta QA', businessType: 'route_distribution',
    industryProfile: 'beverages', branding: { primary: '#0D9488', accent: '#F59E0B' },
  })
  assert.equal(rejectedPalette.body.error.status, 'INVALID_ARGUMENT')
  assert(!(await db.doc(`tenants/${initialTenantId(ids.ownerPaletteRecovery)}`).get()).exists)
  const recoveredPalette = await callOnboarding(await signIn(ids.ownerPaletteRecovery), {
    requestId: paletteRecoveryRequestId, companyName: 'Recuperación paleta QA', businessType: 'route_distribution',
    industryProfile: 'beverages', branding: { primary: '#0F766E', accent: '#F59E0B' },
  })
  assert(recoveredPalette.response.ok, JSON.stringify(recoveredPalette.body))
  const recoveredRetry = await callOnboarding(await signIn(ids.ownerPaletteRecovery), {
    requestId: paletteRecoveryRequestId, companyName: 'Recuperación paleta QA', businessType: 'route_distribution',
    industryProfile: 'beverages', branding: { primary: '#0F766E', accent: '#F59E0B' },
  })
  assert(recoveredRetry.response.ok)
  assert.equal(recoveredRetry.result.tenantId, recoveredPalette.result.tenantId)
  assert.equal((await db.collection('tenants').where('ownerUid', '==', ids.ownerPaletteRecovery).get()).size, 1)
  pass('cuenta Auth conserva requestId: rechazo de paleta no crea tenant y el reintento corregido es idempotente')

  for (const palette of BRAND_PALETTES) {
    const result = await callOnboarding(await signIn(paletteOwners[palette.id]), {
      requestId: `palette-${palette.id}-${suffix}`, companyName: `Paleta ${palette.id} QA`,
      businessType: 'route_distribution', industryProfile: 'beverages',
      branding: { primary: palette.primary, accent: palette.accent },
    })
    assert(result.response.ok, `${palette.name}: ${JSON.stringify(result.body)}`)
    const paletteTenant = await db.doc(`tenants/${result.result.tenantId}`).get()
    assert.equal(paletteTenant.data()?.branding.primary, palette.primary.toLowerCase())
    assert.equal(paletteTenant.data()?.branding.accent, palette.accent.toLowerCase())
  }
  pass('primera empresa acepta las cuatro paletas ofrecidas en el registro')

  const createTenantResponse = await callOnboarding(await signIn(ids.ownerA), {
    action: 'createTenant', operationId: `create-distribution-${suffix}`, name: 'Mascotas QA', businessType: 'route_distribution', industryProfile: 'pets',
  })
  assert(createTenantResponse.response.ok, JSON.stringify(createTenantResponse.body))
  const extraTenant = createTenantResponse.result.tenantId
  const extraCatalogRef = db.doc(`tenants/${extraTenant}/distSettings/catalog`)
  const extraCatalog = await extraCatalogRef.get()
  assert.equal(extraCatalog.data()?.industryProfile, 'pets')
  assert.deepEqual(extraCatalog.data()?.categories.map(category => category.name), ['Alimento', 'Higiene', 'Accesorios', 'Otros'])
  const createTenantRetry = await callOnboarding(await signIn(ids.ownerA), {
    action: 'createTenant', operationId: `create-distribution-${suffix}`, name: 'Mascotas QA', businessType: 'route_distribution', industryProfile: 'pets',
  })
  assert(createTenantRetry.response.ok)
  assert.equal(createTenantRetry.result.tenantId, extraTenant)
  assert.equal((await db.collection(`tenants/${extraTenant}/distSettings`).get()).size, 1)
  pass('createTenant Distribution persiste el rubro y reintenta idempotentemente')

  for (const palette of BRAND_PALETTES) {
    const operationId = `extra-palette-${palette.id}-${suffix}`
    const result = await callOnboarding(await signIn(ids.ownerA), {
      action: 'createTenant', operationId, name: `Paleta extra ${palette.id}`,
      businessType: 'route_distribution', industryProfile: 'beverages',
      branding: { primary: palette.primary, accent: palette.accent },
      businessIdentity: { tradeName: `Paleta extra ${palette.id}` },
    })
    assert(result.response.ok, `${palette.name}: ${JSON.stringify(result.body)}`)
    const extraPaletteTenant = await db.doc(`tenants/${result.result.tenantId}`).get()
    assert.equal(extraPaletteTenant.data()?.branding.primary?.toLowerCase(), palette.primary.toLowerCase())
    assert.equal(extraPaletteTenant.data()?.branding.accent?.toLowerCase(), palette.accent.toLowerCase())
  }
  pass('empresa adicional desde Platform acepta las cuatro paletas ofrecidas')

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

  assert.equal(checks, 23)
  console.log(`${checks} comprobaciones de onboarding seguro aprobadas`)
} finally {
  await env.cleanup()
}
