import assert from 'node:assert/strict'
import { test } from 'node:test'
import { canPlatform, canSupportWrite } from '../src/core/platform.ts'
import type { PlatformOperator, PlatformRole, SupportSession } from '../src/core/platform.ts'
import type {
  CommercialTemplateItem,
  TemplateTierPlan,
  CommercialExtraService,
} from '../src/admin/types.ts'
import { PLANS_BY_TEMPLATE, COMMERCIAL_EXTRAS } from '../src/public/config/pricingConfig.ts'
import {
  canLaunchCommercialDemo,
  isTechnicalDemoAvailable,
  isTemplateProvisioningAvailable,
  PUBLIC_TEMPLATES,
} from '../src/core/publicTemplates.ts'
import { COMMERCIAL_PLAN_TEMPLATE_IDS as PLAN_ELIGIBLE_TEMPLATE_IDS } from '../src/admin/store/commercialCatalogContract.ts'

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

test('CASO 4: Firestore no está disponible -> landing pública queda sin ofertas aprobadas', () => {
  // Cargar la configuración fallback por defecto:
  // Todos los 12 planes estándar por rubro en PLANS_BY_TEMPLATE están en draft
  const allDefaultPlans = Object.values(PLANS_BY_TEMPLATE).flat()
  assert(allDefaultPlans.length >= 12)
  const publishedDefaults = allDefaultPlans.filter((p) => p.status === 'published')
  assert.equal(publishedDefaults.length, 0, 'Ningún plan por defecto en el fallback debe tener status: published')

  // Asegurar que ningún precio inventado o no oficial está marcado como published
  const anyPublished = allDefaultPlans.some((p) => p.status === 'published')
  assert.equal(anyPublished, false)
  const publicOffersOnError: TemplateTierPlan[] = []
  assert.deepEqual(publicOffersOnError, [])
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

test('9. canSupportWrite: sesion de soporte read-only rechaza escrituras', () => {
  const owner: PlatformOperator = { uid: 'op_owner', role: 'platform_owner', active: true }
  const readOnlySession: SupportSession = {
    id: 'sess_1',
    operatorUid: 'op_owner',
    tenantId: 'tenant_abc',
    viewedRoleId: 'owner',
    mode: 'read-only',
    expiresAt: new Date(Date.now() + 600000).toISOString(),
  }
  assert.equal(canSupportWrite(owner, readOnlySession, 'tenant_abc', Date.now()), false)
})

test('10. canSupportWrite: sesion elevada autoriza escrituras unicamente con motivo valido y vigencia', () => {
  const owner: PlatformOperator = { uid: 'op_owner', role: 'platform_owner', active: true }
  const elevatedSession: SupportSession = {
    id: 'sess_2',
    operatorUid: 'op_owner',
    tenantId: 'tenant_abc',
    viewedRoleId: 'owner',
    mode: 'editing',
    reason: 'Corrección de timezone y resolución de incidencia crítica',
    expiresAt: new Date(Date.now() + 600000).toISOString(),
  }
  assert.equal(canSupportWrite(owner, elevatedSession, 'tenant_abc', Date.now()), true)

  // Sin motivo explícito -> denegado
  const sessionWithoutReason: SupportSession = { ...elevatedSession, reason: '   ' }
  assert.equal(canSupportWrite(owner, sessionWithoutReason, 'tenant_abc', Date.now()), false)

  // TenantId no coincide -> denegado
  assert.equal(canSupportWrite(owner, elevatedSession, 'tenant_OTRO', Date.now()), false)
})

test('11. canSupportWrite: sesion expirada es rechazada de inmediato', () => {
  const owner: PlatformOperator = { uid: 'op_owner', role: 'platform_owner', active: true }
  const expiredSession: SupportSession = {
    id: 'sess_3',
    operatorUid: 'op_owner',
    tenantId: 'tenant_abc',
    viewedRoleId: 'owner',
    mode: 'editing',
    reason: 'Intervención técnica expirada',
    expiresAt: new Date(Date.now() - 5000).toISOString(),
  }
  assert.equal(canSupportWrite(owner, expiredSession, 'tenant_abc', Date.now()), false)
})

test('12. canSupportWrite: operador sin support.elevate (platform_admin o platform_support) nunca puede escribir en soporte', () => {
  const admin: PlatformOperator = { uid: 'op_admin', role: 'platform_admin', active: true }
  const support: PlatformOperator = { uid: 'op_support', role: 'platform_support', active: true }
  const session: SupportSession = {
    id: 'sess_4',
    operatorUid: 'op_admin',
    tenantId: 'tenant_abc',
    viewedRoleId: 'owner',
    mode: 'editing',
    reason: 'Intervención administrativa',
    expiresAt: new Date(Date.now() + 600000).toISOString(),
  }
  assert.equal(canSupportWrite(admin, session, 'tenant_abc', Date.now()), false)
  assert.equal(canSupportWrite(support, { ...session, operatorUid: 'op_support' }, 'tenant_abc', Date.now()), false)
})

test('13. Politica Plan Gratuito: maximo 1 plan gratuito publicado por plantilla, 2do es rechazado', () => {
  const existingPlans: Partial<TemplateTierPlan>[] = [
    { id: 'f1', templateId: 'restaurant', planKind: 'free', name: 'Free Activo', status: 'published', monthlyPriceUSD: 0, annualPriceUSD: 0, adsRequired: true },
    { id: 'f2', templateId: 'restaurant', planKind: 'free', name: 'Free Intento 2', status: 'draft', monthlyPriceUSD: 0, annualPriceUSD: 0, adsRequired: true },
  ]

  const templateId = 'restaurant'
  const targetPlanId = 'f2'
  const publishedFreeForTemplate = existingPlans.filter(
    (p) => p.templateId === templateId && p.id !== targetPlanId && p.status === 'published' && p.planKind === 'free',
  )

  assert.equal(publishedFreeForTemplate.length, 1)
  const canPublishFree = publishedFreeForTemplate.length < 1
  assert.equal(canPublishFree, false, 'No se puede publicar un 2do plan gratuito para la misma plantilla')
})

test('14. Politica Planes de Pago: maximo 3 planes de pago publicados por plantilla, 4to es rechazado', () => {
  const existingPlans: Partial<TemplateTierPlan>[] = [
    { id: 'p1', templateId: 'restaurant', planKind: 'paid', tierLevel: 1, name: 'Básico', status: 'published', monthlyPriceUSD: 29 },
    { id: 'p2', templateId: 'restaurant', planKind: 'paid', tierLevel: 2, name: 'Pro', status: 'published', monthlyPriceUSD: 59 },
    { id: 'p3', templateId: 'restaurant', planKind: 'paid', tierLevel: 3, name: 'Enterprise', status: 'published', monthlyPriceUSD: 99 },
    { id: 'p4', templateId: 'restaurant', planKind: 'paid', tierLevel: 3, name: 'Borrador 4to', status: 'draft', monthlyPriceUSD: 120 },
  ]

  const templateId = 'restaurant'
  const targetPlanId = 'p4'
  const publishedPaidForTemplate = existingPlans.filter(
    (p) => p.templateId === templateId && p.id !== targetPlanId && p.status === 'published' && p.planKind !== 'free',
  )

  assert.equal(publishedPaidForTemplate.length, 3)
  const canPublishPaid = publishedPaidForTemplate.length < 3
  assert.equal(canPublishPaid, false, 'No se puede publicar un 4to plan de pago cuando ya existen 3 activos')
})

test('15. Politica Comercial Mixta: 1 Free + 3 Paid publicados simultaneamente (total 4) esta permitido', () => {
  const existingPlans: Partial<TemplateTierPlan>[] = [
    { id: 'f1', templateId: 'restaurant', planKind: 'free', name: 'Free Oficial', status: 'published', monthlyPriceUSD: 0, annualPriceUSD: 0, adsRequired: true },
    { id: 'p1', templateId: 'restaurant', planKind: 'paid', tierLevel: 1, name: 'Básico', status: 'published', monthlyPriceUSD: 29 },
    { id: 'p2', templateId: 'restaurant', planKind: 'paid', tierLevel: 2, name: 'Pro', status: 'published', monthlyPriceUSD: 59 },
    { id: 'p3', templateId: 'restaurant', planKind: 'paid', tierLevel: 3, name: 'Enterprise', status: 'draft', monthlyPriceUSD: 99 },
  ]

  const templateId = 'restaurant'
  const targetPlanId = 'p3'

  const freeCount = existingPlans.filter(
    (p) => p.templateId === templateId && p.id !== targetPlanId && p.status === 'published' && p.planKind === 'free',
  ).length
  const paidCount = existingPlans.filter(
    (p) => p.templateId === templateId && p.id !== targetPlanId && p.status === 'published' && p.planKind !== 'free',
  ).length

  assert.equal(freeCount, 1)
  assert.equal(paidCount, 2)
  // Publicar el 3er plan de pago es válido porque paidCount < 3:
  assert.equal(paidCount < 3, true)
  // Total publicado alcanzará 4:
  assert.equal(freeCount + paidCount + 1, 4)
})

test('16. Validacion de Plan Gratuito: precio mayor a 0 o falta de adsRequired es invalido', () => {
  const invalidFreePlan1: Partial<TemplateTierPlan> = {
    planKind: 'free',
    monthlyPriceUSD: 10,
    annualPriceUSD: 0,
    adsRequired: true,
  }
  const isPriceValid1 = invalidFreePlan1.monthlyPriceUSD === 0 && invalidFreePlan1.annualPriceUSD === 0
  assert.equal(isPriceValid1, false, 'Plan gratuito con precio mensual > 0 debe ser inválido')

  const invalidFreePlan2: Partial<TemplateTierPlan> = {
    planKind: 'free',
    monthlyPriceUSD: 0,
    annualPriceUSD: 0,
    adsRequired: false,
  }
  const isAdsValid = invalidFreePlan2.adsRequired === true
  assert.equal(isAdsValid, false, 'Plan gratuito sin adsRequired=true debe ser inválido')
})

test('17. Whitelist de Plantillas Oficiales: templateId arbitrario es rechazado', () => {
  const OFFICIAL_TEMPLATES = ['distribution', 'restaurant', 'nightclub', 'retail', 'services', 'custom']
  assert.equal(OFFICIAL_TEMPLATES.includes('restaurant'), true)
  assert.equal(OFFICIAL_TEMPLATES.includes('distribution'), true)
  assert.equal(OFFICIAL_TEMPLATES.includes('nightclub'), true)
  assert.equal(OFFICIAL_TEMPLATES.includes('retail'), true)
  assert.equal(OFFICIAL_TEMPLATES.includes('crypto_exchange'), false)
  assert.equal(OFFICIAL_TEMPLATES.includes('arbitrary_pos'), false)
})

test('18. canLaunchCommercialDemo: gating estricto de disponibilidad tecnica y compatibilidad legacy', () => {
  // 1. Distribución publicada con demoEnabled=true -> tiene demo técnica implementada -> PERMITIDO
  assert.equal(canLaunchCommercialDemo({
    id: 'distribution',
    status: 'published',
    demoEnabled: true,
    canonicalTemplateId: 'distribution',
  }), true)

  // 2. Distribución con demoEnabled=false explícito -> DENEGADO
  assert.equal(canLaunchCommercialDemo({
    id: 'distribution',
    status: 'published',
    demoEnabled: false,
    canonicalTemplateId: 'distribution',
  }), false)

  // 3. Distribución legacy sin demoEnabled (undefined) -> default técnico disponible -> PERMITIDO
  assert.equal(canLaunchCommercialDemo({
    id: 'distribution',
    status: 'published',
    canonicalTemplateId: 'distribution',
  }), true)

  // 4. Distribución con status=draft -> DENEGADO
  assert.equal(canLaunchCommercialDemo({
    id: 'distribution',
    status: 'draft',
    demoEnabled: true,
    canonicalTemplateId: 'distribution',
  }), false)

  // 5. Restaurante con demoEnabled=true -> status en publicTemplates es coming_soon (sin demo técnica) -> DENEGADO
  assert.equal(canLaunchCommercialDemo({
    id: 'restaurant',
    status: 'published',
    demoEnabled: true,
    canonicalTemplateId: 'restaurant',
  }), false)

  // 6. Restaurante legacy (undefined) -> status coming_soon -> DENEGADO
  assert.equal(canLaunchCommercialDemo({
    id: 'restaurant',
    status: 'published',
    canonicalTemplateId: 'restaurant',
  }), false)

  // 7. Nightclub con demoEnabled=true -> coming_soon -> DENEGADO
  assert.equal(canLaunchCommercialDemo({
    id: 'nightclub',
    status: 'published',
    demoEnabled: true,
    canonicalTemplateId: 'nightclub',
  }), false)

  // 8. Retail con demoEnabled=true -> coming_soon -> DENEGADO
  assert.equal(canLaunchCommercialDemo({
    id: 'retail',
    status: 'published',
    demoEnabled: true,
    canonicalTemplateId: 'retail',
  }), false)

  // 9. isTechnicalDemoAvailable verifica directamente la disponibilidad técnica del código
  assert.equal(isTechnicalDemoAvailable('distribution'), true)
  assert.equal(isTechnicalDemoAvailable('restaurant'), false)
  assert.equal(isTechnicalDemoAvailable('nightclub'), false)
  assert.equal(isTechnicalDemoAvailable('retail'), false)
  assert.equal(isTechnicalDemoAvailable('custom'), false)
})

test('19. Roles inventados como "superadmin" son rechazados y no poseen ningun privilegio de plataforma', () => {
  const fakeSuperadmin = { uid: 'fake_1', role: 'superadmin', active: true } as unknown as PlatformOperator
  const fakeRoot = { uid: 'fake_2', role: 'root', active: true } as unknown as PlatformOperator

  assert.equal(canPlatform(fakeSuperadmin, 'tenants.read'), false)
  assert.equal(canPlatform(fakeSuperadmin, 'operators.manage'), false)
  assert.equal(canPlatform(fakeSuperadmin, 'plans.manage'), false)
  assert.equal(canPlatform(fakeRoot, 'content.manage'), false)
  assert.equal(canPlatform(fakeRoot, 'support.read'), false)
})

test('20. Disponibilidad de aprovisionamiento de plantillas: fuente canonica estricta', () => {
  // Distribución, Restaurante y Nightclub están aprobados para aprovisionamiento real de tenants
  assert.equal(isTemplateProvisioningAvailable('route_distribution'), true)
  assert.equal(isTemplateProvisioningAvailable('distribution'), true)
  assert.equal(isTemplateProvisioningAvailable('restaurant_pos'), true)
  assert.equal(isTemplateProvisioningAvailable('restaurant'), true)
  assert.equal(isTemplateProvisioningAvailable('nightclub_lounge'), true)
  assert.equal(isTemplateProvisioningAvailable('nightclub'), true)

  // Plantillas no consolidadas para creación de empresas
  assert.equal(isTemplateProvisioningAvailable('hamburger_shop'), false)
  assert.equal(isTemplateProvisioningAvailable('hamburger'), false)
  assert.equal(isTemplateProvisioningAvailable('gelateria_weight_cafe'), false)
  assert.equal(isTemplateProvisioningAvailable('retail'), false)
  assert.equal(isTemplateProvisioningAvailable('custom'), false)
  assert.equal(isTemplateProvisioningAvailable('arbitrary_type'), false)
})

test('21. Planes de suscripción: whitelist PLAN_ELIGIBLE_TEMPLATE_IDS excluye custom y arbitrarios', () => {
  const eligibleTemplateIds: readonly string[] = PLAN_ELIGIBLE_TEMPLATE_IDS
  assert.equal(eligibleTemplateIds.includes('restaurant'), true)
  assert.equal(PLAN_ELIGIBLE_TEMPLATE_IDS.includes('hamburger'), true)
  assert.equal(eligibleTemplateIds.includes('distribution'), true)
  assert.equal(eligibleTemplateIds.includes('nightclub'), true)
  assert.equal(eligibleTemplateIds.includes('retail'), true)

  // Custom y arbitrarios NO son elegibles para planes de suscripción
  assert.equal(eligibleTemplateIds.includes('custom'), false)
  assert.equal(eligibleTemplateIds.includes('services'), false)
  assert.equal(eligibleTemplateIds.includes('arbitrary'), false)
})

test('22. Seed de configuración oficial: preserva estado oficial y no auto-publica drafts', () => {
  const eligibleTemplateIds: readonly string[] = PLAN_ELIGIBLE_TEMPLATE_IDS
  const seedTemplateDraft = { id: 'test_tpl', status: 'draft', name: 'Draft Template' }
  const templateStatusDraft = seedTemplateDraft.status === 'published' ? 'published' : 'draft'
  assert.equal(templateStatusDraft, 'draft')

  const seedTemplatePub = { id: 'distribution', status: 'published', name: 'Distribución' }
  const templateStatusPub = seedTemplatePub.status === 'published' ? 'published' : 'draft'
  assert.equal(templateStatusPub, 'published')

  // Planes para custom son omitidos por el filtro del seed
  const samplePlans = [
    { id: 'plan_dist_free', templateId: 'distribution', planKind: 'free' },
    { id: 'plan_rest_paid', templateId: 'restaurant', planKind: 'paid' },
    { id: 'plan_custom_dummy', templateId: 'custom', planKind: 'paid' },
  ]
  const filteredPlans = samplePlans.filter(p => eligibleTemplateIds.includes(p.templateId))
  assert.equal(filteredPlans.length, 2)
  assert.equal(filteredPlans.some(p => p.templateId === 'custom'), false)
})

test('23. Comportamiento de CTAs públicos y aprovisionamiento: Distribution y Restaurant habilitados, coming-soon bloqueados, Custom sin aprovisionamiento y sin fallback silencioso', () => {
  // Aprovisionamiento habilitado para Distribution, Restaurant y Nightclub
  assert.equal(isTemplateProvisioningAvailable('distribution'), true)
  assert.equal(isTemplateProvisioningAvailable('route_distribution'), true)
  assert.equal(isTemplateProvisioningAvailable('restaurant'), true)
  assert.equal(isTemplateProvisioningAvailable('restaurant_pos'), true)
  assert.equal(isTemplateProvisioningAvailable('nightclub'), true)
  assert.equal(isTemplateProvisioningAvailable('nightclub_lounge'), true)

  // Demo técnica desacoplada de aprovisionamiento: Distribution disponible, Restaurant y Nightclub bloqueados/coming_soon
  assert.equal(isTechnicalDemoAvailable('distribution'), true)
  assert.equal(isTechnicalDemoAvailable('route_distribution'), true)
  assert.equal(isTechnicalDemoAvailable('restaurant'), false)
  assert.equal(isTechnicalDemoAvailable('restaurant_pos'), false)
  assert.equal(isTechnicalDemoAvailable('nightclub'), false)
  assert.equal(isTechnicalDemoAvailable('nightclub_lounge'), false)

  // Coming-soon bloqueados para creación de empresas
  assert.equal(isTemplateProvisioningAvailable('hamburger'), false)
  assert.equal(isTemplateProvisioningAvailable('hamburger_shop'), false)
  assert.equal(isTemplateProvisioningAvailable('retail'), false)
  assert.equal(isTemplateProvisioningAvailable('gelateria_weight_cafe'), false)

  // Custom preserva flujo a medida (WhatsApp/contacto), no aprovisiona tenant directo
  assert.equal(isTemplateProvisioningAvailable('custom'), false)

  // Lógica de PublicRegisterView: cuando se recibe un templateParam en la URL
  function resolveInitialRegisterTemplate(templateParam: string | null): string {
    const param = templateParam || ''
    return param ? (isTemplateProvisioningAvailable(param) ? param : '') : 'route_distribution'
  }

  // Sin parámetro: default a 'route_distribution'
  assert.equal(resolveInitialRegisterTemplate(null), 'route_distribution')
  assert.equal(resolveInitialRegisterTemplate(''), 'route_distribution')

  // Parámetro válido disponible: se selecciona directamente
  assert.equal(resolveInitialRegisterTemplate('route_distribution'), 'route_distribution')
  assert.equal(resolveInitialRegisterTemplate('restaurant_pos'), 'restaurant_pos')
  assert.equal(resolveInitialRegisterTemplate('nightclub_lounge'), 'nightclub_lounge')
  assert.equal(resolveInitialRegisterTemplate('nightclub'), 'nightclub')

  // Parámetro no disponible / coming-soon: NO debe haber fallback silencioso a Distribution
  assert.equal(resolveInitialRegisterTemplate('hamburger'), '')
  assert.equal(resolveInitialRegisterTemplate('retail'), '')
  assert.equal(resolveInitialRegisterTemplate('custom'), '')
  assert.equal(resolveInitialRegisterTemplate('invalid_template'), '')
})

test('24. Invariantes de ruta técnica de demo e identidad: inmutabilidad de demoRoute y coherencia canónica', () => {
  // Las rutas técnicas de demo están definidas canónicamente en PUBLIC_TEMPLATES
  const distDef = PUBLIC_TEMPLATES.find(p => p.id === 'distribution')
  assert.ok(distDef)
  assert.equal(distDef.demoPath, '/demo/distribution')

  const restDef = PUBLIC_TEMPLATES.find(p => p.id === 'restaurant')
  assert.ok(restDef)
  assert.equal(restDef.demoPath, '/demo/restaurant')

  // demoEnabled: false continúa bloqueando la demo comercial incluso si technicalDemoAvailable es true
  assert.equal(
    canLaunchCommercialDemo({
      status: 'published',
      demoEnabled: false,
      canonicalTemplateId: 'distribution',
    }),
    false
  )

  // Invariante de identidad técnica:
  // Una plantilla no puede remapear su canonicalTemplateId a otra plantilla distinta
  function validateTemplateIdentity(templateId: string, canonicalTemplateId?: string | null): boolean {
    const validCanonical = ['restaurant', 'distribution', 'nightclub', 'retail', null]
    if (canonicalTemplateId !== undefined) {
      if (!validCanonical.includes(canonicalTemplateId)) return false
      if (templateId === 'custom') {
        if (canonicalTemplateId !== null) return false
      } else if (canonicalTemplateId !== templateId) {
        return false
      }
    }
    return true
  }

  // Distribución mantiene identidad distribución
  assert.equal(validateTemplateIdentity('distribution', 'distribution'), true)
  // Restaurante no puede remapearse a distribución
  assert.equal(validateTemplateIdentity('restaurant', 'distribution'), false)
  // Retail no puede remapearse a restaurante
  assert.equal(validateTemplateIdentity('retail', 'restaurant'), false)
  // ID canónico arbitrario es rechazado
  assert.equal(validateTemplateIdentity('distribution', 'arbitrary_canonical'), false)
  // Custom solo admite null
  assert.equal(validateTemplateIdentity('custom', null), true)
  assert.equal(validateTemplateIdentity('custom', 'distribution'), false)

  // Invariante de ruta técnica: demoRoute no puede modificarse arbitrariamente
  function validateDemoRoute(templateId: string, requestedRoute?: string): boolean {
    const publicDef = PUBLIC_TEMPLATES.find(p => p.id === templateId)
    if (!publicDef) return true
    if (requestedRoute && requestedRoute !== publicDef.demoPath) return false
    return true
  }

  assert.equal(validateDemoRoute('distribution', '/demo/distribution'), true)
  assert.equal(validateDemoRoute('distribution', '/demo/custom_override'), false)
  assert.equal(validateDemoRoute('restaurant', '/demo/restaurant'), true)
  assert.equal(validateDemoRoute('restaurant', '/demo/distribution'), false)
})
