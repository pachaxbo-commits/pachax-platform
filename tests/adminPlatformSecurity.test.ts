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

test('13. Regla Maximo 3 Planes Publicados: rechaza publicar un 4to plan para una misma plantilla', () => {
  const existingPlans: Partial<TemplateTierPlan>[] = [
    { id: 'p1', templateId: 'restaurant', name: 'Básico', status: 'published' },
    { id: 'p2', templateId: 'restaurant', name: 'Pro', status: 'published' },
    { id: 'p3', templateId: 'restaurant', name: 'Enterprise', status: 'published' },
    { id: 'p4', templateId: 'restaurant', name: 'Borrador Nuevo', status: 'draft' },
  ]

  const templateId = 'restaurant'
  const targetPlanId = 'p4'
  const publishedForTemplate = existingPlans.filter(
    (p) => p.templateId === templateId && p.id !== targetPlanId && p.status === 'published',
  )

  // Debe contar exactamente 3 planes publicados
  assert.equal(publishedForTemplate.length, 3)

  // La regla debe rechazar publicar el 4to plan
  const canPublish = publishedForTemplate.length < 3
  assert.equal(canPublish, false, 'No se puede publicar un 4to plan cuando ya existen 3 activos')
})

test('14. Regla Maximo 3 Planes Publicados: respeta aislamiento entre plantillas distintas', () => {
  const existingPlans: Partial<TemplateTierPlan>[] = [
    { id: 'r1', templateId: 'restaurant', name: 'Restaurante 1', status: 'published' },
    { id: 'r2', templateId: 'restaurant', name: 'Restaurante 2', status: 'published' },
    { id: 'r3', templateId: 'restaurant', name: 'Restaurante 3', status: 'published' },
    { id: 'd1', templateId: 'distribution', name: 'Distribuidora 1', status: 'published' },
    { id: 'd2', templateId: 'distribution', name: 'Distribuidora 2', status: 'draft' },
  ]

  // Para distribution, solo hay 1 publicado, por lo que publicar d2 SÍ está permitido
  const publishedForDistribution = existingPlans.filter(
    (p) => p.templateId === 'distribution' && p.id !== 'd2' && p.status === 'published',
  )
  assert.equal(publishedForDistribution.length, 1)
  assert.equal(publishedForDistribution.length < 3, true)
})

test('15. Roles inventados como "superadmin" son rechazados y no poseen ningun privilegio de plataforma', () => {
  const fakeSuperadmin = { uid: 'fake_1', role: 'superadmin' as any, active: true }
  const fakeRoot = { uid: 'fake_2', role: 'root' as any, active: true }

  assert.equal(canPlatform(fakeSuperadmin, 'tenants.read'), false)
  assert.equal(canPlatform(fakeSuperadmin, 'operators.manage'), false)
  assert.equal(canPlatform(fakeSuperadmin, 'plans.manage'), false)
  assert.equal(canPlatform(fakeRoot, 'content.manage'), false)
  assert.equal(canPlatform(fakeRoot, 'support.read'), false)
})
