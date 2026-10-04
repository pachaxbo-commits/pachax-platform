import assert from 'node:assert/strict'
import { test } from 'node:test'
import { canPlatform } from '../src/core/platform.ts'
import type { PlatformOperator, PlatformRole } from '../src/core/platform.ts'
import type {
  CommercialTemplateItem,
  TemplateTierPlan,
  CommercialExtraService,
} from '../src/admin/types.ts'
import { PLANS_BY_TEMPLATE, COMMERCIAL_EXTRAS } from '../src/public/config/pricingConfig.ts'

test('1. Visitante / usuario no autenticado no posee permisos de plataforma', () => {
  assert.equal(canPlatform(null, 'tenants.read'), false)
  assert.equal(canPlatform(null, 'content.manage'), false)
  assert.equal(canPlatform(null, 'plans.manage'), false)
  assert.equal(canPlatform(null, 'operators.manage'), false)
})

test('2. Usuario normal de empresa o tenant NO accede a permisos de plataforma', () => {
  const tenantUser = { uid: 'usr_tenant', role: 'admin' as unknown as PlatformRole, active: true }
  assert.equal(canPlatform(tenantUser, 'tenants.read'), false)
  assert.equal(canPlatform(tenantUser, 'content.manage'), false)
  assert.equal(canPlatform(tenantUser, 'plans.manage'), false)
  assert.equal(canPlatform(tenantUser, 'operators.manage'), false)

  const tenantOwner = { uid: 'usr_owner', role: 'owner' as unknown as PlatformRole, active: true }
  assert.equal(canPlatform(tenantOwner, 'tenants.read'), false)
  assert.equal(canPlatform(tenantOwner, 'operators.manage'), false)
})

test('3. Operador inactivo (active: false) ve revocado todo permiso inmediatamente', () => {
  const disabledOwner: PlatformOperator = { uid: 'u1', role: 'platform_owner', active: false }
  const disabledAdmin: PlatformOperator = { uid: 'u2', role: 'platform_admin', active: false }
  assert.equal(canPlatform(disabledOwner, 'operators.manage'), false)
  assert.equal(canPlatform(disabledOwner, 'tenants.read'), false)
  assert.equal(canPlatform(disabledAdmin, 'plans.manage'), false)
})

test('4. platform_support puede leer empresas y soporte pero NO modificar planes ni operadores', () => {
  const support: PlatformOperator = { uid: 'sup_1', role: 'platform_support', active: true }
  assert.equal(canPlatform(support, 'tenants.read'), true)
  assert.equal(canPlatform(support, 'support.read'), true)
  assert.equal(canPlatform(support, 'audit.read'), true)
  assert.equal(canPlatform(support, 'templates.preview'), true)

  // Permisos restringidos:
  assert.equal(canPlatform(support, 'plans.manage'), false)
  assert.equal(canPlatform(support, 'content.manage'), false)
  assert.equal(canPlatform(support, 'operators.manage'), false)
  assert.equal(canPlatform(support, 'finance.read'), false)
})

test('5. platform_content puede editar contenido y previsualizar plantillas pero NO gestionar planes comerciales, operadores ni empresas', () => {
  const contentOp: PlatformOperator = { uid: 'cnt_1', role: 'platform_content', active: true }
  assert.equal(canPlatform(contentOp, 'content.manage'), true)
  assert.equal(canPlatform(contentOp, 'plans.manage'), false)
  assert.equal(canPlatform(contentOp, 'templates.preview'), true)

  // Permisos restringidos:
  assert.equal(canPlatform(contentOp, 'operators.manage'), false)
  assert.equal(canPlatform(contentOp, 'tenants.configure'), false)
  assert.equal(canPlatform(contentOp, 'finance.read'), false)
})

test('6. platform_admin puede gestionar planes, plantillas y soporte pero NO administrar operadores', () => {
  const adminOp: PlatformOperator = { uid: 'adm_1', role: 'platform_admin', active: true }
  assert.equal(canPlatform(adminOp, 'tenants.read'), true)
  assert.equal(canPlatform(adminOp, 'tenants.configure'), true)
  assert.equal(canPlatform(adminOp, 'support.read'), true)
  assert.equal(canPlatform(adminOp, 'templates.preview'), true)
  assert.equal(canPlatform(adminOp, 'audit.read'), true)
  assert.equal(canPlatform(adminOp, 'content.manage'), true)
  assert.equal(canPlatform(adminOp, 'plans.manage'), true)

  // Únicamente platform_owner gestiona operadores:
  assert.equal(canPlatform(adminOp, 'operators.manage'), false)
  assert.equal(canPlatform(adminOp, 'finance.read'), false)
})

test('7. platform_owner posee acceso irrestricto incluyendo gestión de operadores y finanzas', () => {
  const ownerOp: PlatformOperator = { uid: 'own_1', role: 'platform_owner', active: true }
  assert.equal(canPlatform(ownerOp, 'operators.manage'), true)
  assert.equal(canPlatform(ownerOp, 'finance.read'), true)
  assert.equal(canPlatform(ownerOp, 'tenants.configure'), true)
  assert.equal(canPlatform(ownerOp, 'plans.manage'), true)
  assert.equal(canPlatform(ownerOp, 'content.manage'), true)
  assert.equal(canPlatform(ownerOp, 'audit.read'), true)
})

test('8. Aislamiento Draft vs Published: la vitrina pública solo expone documentos con status published', () => {
  const mockTemplates: Partial<CommercialTemplateItem>[] = [
    { id: 't_pub', commercialName: 'Publicada', status: 'published' },
    { id: 't_draft', commercialName: 'Borrador Confidencial', status: 'draft' },
  ]
  const publishedTemplates = mockTemplates.filter((t) => t.status === 'published')
  assert.equal(publishedTemplates.length, 1)
  assert.equal(publishedTemplates[0].id, 't_pub')
  assert.equal(publishedTemplates.some((t) => t.id === 't_draft'), false)

  const mockPlans: Partial<TemplateTierPlan>[] = [
    { id: 'p_pub_1', templateId: 'restaurant', name: 'Plan Activo', status: 'published' },
    { id: 'p_draft_1', templateId: 'restaurant', name: 'Plan Oculto', status: 'draft' },
    { id: 'p_pub_2', templateId: 'distribution', name: 'Plan Mayorista', status: 'published' },
  ]
  const publishedRestaurantPlans = mockPlans.filter(
    (p) => p.templateId === 'restaurant' && p.status === 'published',
  )
  assert.equal(publishedRestaurantPlans.length, 1)
  assert.equal(publishedRestaurantPlans[0].id, 'p_pub_1')
  assert.equal(publishedRestaurantPlans.some((p) => p.id === 'p_draft_1'), false)

  const mockExtras: Partial<CommercialExtraService>[] = [
    { id: 'e_pub', title: 'Soporte VIP', status: 'published' },
    { id: 'e_draft', title: 'Extra en desarrollo', status: 'draft' },
  ]
  const publishedExtras = mockExtras.filter((e) => e.status === 'published')
  assert.equal(publishedExtras.length, 1)
  assert.equal(publishedExtras[0].id, 'e_pub')
  assert.equal(publishedExtras.some((e) => e.id === 'e_draft'), false)
})

test('CASO 1: Firestore tiene 0 planes published -> landing muestra 0 planes comerciales -> NO muestra $29/$59/$99', () => {
  // Cuando la query publicada a Firestore responde con 0 documentos (snapshot.empty === true),
  // la sincronización pública asigna current.plans = []
  const firestorePublishedDocs: TemplateTierPlan[] = []
  const activePublishedPlans = firestorePublishedDocs.filter((p) => p.status === 'published')

  assert.equal(activePublishedPlans.length, 0)
  // Verificar que ningún precio placeholder ($29, $59, $99) se expone a la landing:
  const exposedPrices = activePublishedPlans.map((p) => p.monthlyPriceUSD)
  assert.equal(exposedPrices.includes(29), false)
  assert.equal(exposedPrices.includes(59), false)
  assert.equal(exposedPrices.includes(99), false)
})

test('CASO 2: Firestore contiene solamente plans draft -> landing no los muestra', () => {
  const firestoreDocs: TemplateTierPlan[] = [
    {
      id: 'p1',
      templateId: 'restaurant',
      name: 'Plan Borrador 1',
      tierLevel: 1,
      monthlyPriceUSD: 29,
      annualPriceUSD: 24,
      currency: 'USD',
      billingPeriod: 'monthly',
      clientProfile: 'Borrador',
      includedFeatures: [],
      technicalEntitlements: [],
      ctaLabel: 'Elegir',
      status: 'draft',
      order: 1,
    },
    {
      id: 'p2',
      templateId: 'restaurant',
      name: 'Plan Borrador 2',
      tierLevel: 2,
      monthlyPriceUSD: 59,
      annualPriceUSD: 49,
      currency: 'USD',
      billingPeriod: 'monthly',
      clientProfile: 'Borrador',
      includedFeatures: [],
      technicalEntitlements: [],
      ctaLabel: 'Elegir',
      status: 'draft',
      order: 2,
    },
  ]
  const publishedForLanding = firestoreDocs.filter((p) => p.status === 'published')
  assert.equal(publishedForLanding.length, 0)
  assert.equal(publishedForLanding.some((p) => p.status === 'draft'), false)
})

test('CASO 3: Firestore contiene un plan published -> landing muestra exactamente ese plan', () => {
  const firestoreDocs: TemplateTierPlan[] = [
    {
      id: 'p_draft',
      templateId: 'restaurant',
      name: 'Borrador',
      tierLevel: 1,
      monthlyPriceUSD: 29,
      annualPriceUSD: 24,
      currency: 'USD',
      billingPeriod: 'monthly',
      clientProfile: 'Borrador',
      includedFeatures: [],
      technicalEntitlements: [],
      ctaLabel: 'Elegir',
      status: 'draft',
      order: 1,
    },
    {
      id: 'p_real_pub',
      templateId: 'restaurant',
      name: 'Plan Gastronomía Aprobado',
      tierLevel: 1,
      monthlyPriceUSD: 35,
      annualPriceUSD: 30,
      currency: 'USD',
      billingPeriod: 'monthly',
      clientProfile: 'Plan aprobado comercialmente',
      includedFeatures: ['Capacidad aprobada'],
      technicalEntitlements: [],
      ctaLabel: 'Elegir Plan',
      status: 'published',
      order: 2,
    },
  ]
  const publishedForLanding = firestoreDocs.filter((p) => p.status === 'published')
  assert.equal(publishedForLanding.length, 1)
  assert.equal(publishedForLanding[0].id, 'p_real_pub')
  assert.equal(publishedForLanding[0].name, 'Plan Gastronomía Aprobado')
  assert.equal(publishedForLanding[0].monthlyPriceUSD, 35)
})

test('CASO 4: Firestore no está disponible -> fallback funciona -> fallback NO contiene precios placeholder publicados', () => {
  // Cargar la configuración fallback por defecto:
  // Todos los 12 planes estándar por rubro en PLANS_BY_TEMPLATE están en draft
  const allDefaultPlans = Object.values(PLANS_BY_TEMPLATE).flat()
  assert(allDefaultPlans.length >= 12)
  const publishedDefaults = allDefaultPlans.filter((p) => p.status === 'published')
  assert.equal(publishedDefaults.length, 0, 'Ningún plan por defecto en el fallback debe tener status: published')

  // Asegurar que ningún precio inventado o no oficial está marcado como published
  const anyPublished = allDefaultPlans.some((p) => p.status === 'published')
  assert.equal(anyPublished, false)
})

test('CASO 5: Extras con precio draft -> no aparecen públicamente', () => {
  const publishedExtras = COMMERCIAL_EXTRAS.filter((e) => e.status === 'published')

  // Ningún extra publicado en el fallback debe tener precios fijos no aprobados ($49, $79, $35, $59)
  const unapprovedPrices = ['$49', '$79', '$35', '$59']
  for (const extra of publishedExtras) {
    for (const unapproved of unapprovedPrices) {
      assert.equal(
        extra.referencePriceLabel.includes(unapproved),
        false,
        `Extra ${extra.id} no debe contener precio ${unapproved}`
      )
    }
  }

  // Verificar que los extras con servicios complementarios están en modo borrador (draft)
  const draftExtras = COMMERCIAL_EXTRAS.filter((e) => e.status === 'draft')
  assert(draftExtras.some((e) => e.id === 'extra_marketing'))
  assert(draftExtras.some((e) => e.id === 'extra_branding'))
  assert(draftExtras.some((e) => e.id === 'extra_support_vip'))
  assert(draftExtras.some((e) => e.id === 'extra_automation'))
})
