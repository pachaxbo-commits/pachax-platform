import type { BusinessType } from './platform.ts'

export type PublicTemplateStatus = 'available' | 'coming_soon'
export type PublicTemplateId = 'restaurant' | 'hamburger' | 'distribution' | 'retail' | 'nightclub'

export interface PublicDemoConfiguration {
  id: string
  demoEnabled?: boolean
  demoEnabledConfigured?: boolean
}

export interface PublicTemplateDefinition {
  id: PublicTemplateId
  businessType: BusinessType
  title: string
  shortDescription: string
  demoPath: `/demo/${PublicTemplateId}`
  studioTemplateId: PublicTemplateId
  status: PublicTemplateStatus
  provisioningStatus?: PublicTemplateStatus
  demoStatus?: PublicTemplateStatus
}

/** Temporary release gate: public visitors can browse demos but cannot provision tenants. */
export const PUBLIC_TENANT_SELF_SERVICE_CREATION_ENABLED = false
/** Closed until legal approval and an explicit release of commercial intake. */
export const PUBLIC_COMMERCIAL_INTEREST_ENABLED = false

let publicDemoOverrides: ReadonlyMap<string, boolean> | null = null

/** Snapshot Admin's explicit demo decisions from the published server catalog. */
export function setPublicDemoConfiguration(templates: readonly PublicDemoConfiguration[] | null): void {
  if (templates === null) {
    publicDemoOverrides = null
    return
  }
  // Only an explicit Admin choice overrides the technical default. An absent
  // commercial record must not disable an otherwise available demo.
  publicDemoOverrides = new Map(templates
    .filter(template => template.demoEnabledConfigured === true)
    .map(template => [template.id, template.demoEnabled === true]))
}

export const PUBLIC_TEMPLATES: readonly PublicTemplateDefinition[] = Object.freeze([
  {
    id: 'restaurant',
    businessType: 'restaurant_pos',
    title: 'Restaurante con salón',
    shortDescription: 'Mesas, meseros, cuentas abiertas y servicio completo.',
    demoPath: '/demo/restaurant',
    studioTemplateId: 'restaurant',
    status: 'coming_soon',
    provisioningStatus: 'available',
    // La ruta pública de Restaurante con salón está desplegada y carga la
    // experiencia interactiva; su disponibilidad comercial sigue separada.
    demoStatus: 'available',
  },
  {
    id: 'hamburger',
    businessType: 'hamburger_shop',
    title: 'Restaurante de servicio rápido',
    shortDescription: 'Pedidos ágiles de mostrador, mesa de entrega, para llevar o delivery, con cocina, caja e inventario.',
    demoPath: '/demo/hamburger',
    studioTemplateId: 'hamburger',
    status: 'coming_soon',
    // Hamburger Shop is now supported by the canonical Restaurant experience
    // and server operations; public self-service registration remains globally closed.
    provisioningStatus: 'available',
    demoStatus: 'available',
  },
  {
    id: 'distribution',
    businessType: 'route_distribution',
    title: 'Producción y distribución',
    shortDescription: 'Controla inventario, despachos, rutas, ventas, créditos y retornos.',
    demoPath: '/demo/distribution',
    studioTemplateId: 'distribution',
    status: 'available',
    provisioningStatus: 'available',
    demoStatus: 'available',
  },
  {
    id: 'retail',
    businessType: 'gelateria_weight_cafe',
    title: 'Comercio / Venta rápida',
    shortDescription: 'Vende por unidad o peso con caja ágil e inventario de mostrador.',
    demoPath: '/demo/retail',
    studioTemplateId: 'retail',
    status: 'coming_soon',
    // Retail has a dedicated tenant UI and server-authoritative operations.
    provisioningStatus: 'available',
    demoStatus: 'available',
  },
  {
    id: 'nightclub',
    businessType: 'nightclub_lounge',
    title: 'Club nocturno / Lounge',
    shortDescription: 'Controla mesas, rondas, barra, cuentas abiertas y caja durante toda la noche.',
    demoPath: '/demo/nightclub',
    studioTemplateId: 'nightclub',
    status: 'coming_soon',
    provisioningStatus: 'available',
    // The isolated public Nightclub demo is implemented at /demo/nightclub;
    // provisioning remains a separate commercial/tenant capability.
    demoStatus: 'available',
  },
])

export const OFFICIAL_COMMERCIAL_TEMPLATES = Object.freeze(['restaurant', 'distribution', 'nightclub', 'retail', 'custom'] as const)
export const PLAN_ELIGIBLE_TEMPLATE_IDS = Object.freeze(['restaurant', 'distribution', 'nightclub', 'retail'] as const)

/** Static public demos are independent of commercial and tenant provisioning state. */
const FREE_DEMO_TEMPLATE_IDS = Object.freeze(['hamburger', 'retail'] as const)
export type FreeDemoTemplateId = (typeof FREE_DEMO_TEMPLATE_IDS)[number]

/** A public route is usable only when implemented and not explicitly disabled by Admin. */
export function isPublicDemoEnabled(idOrBusinessType: string): boolean {
  const template = PUBLIC_TEMPLATES.find(item => item.id === idOrBusinessType || item.businessType === idOrBusinessType)
  if (!template || (template.demoStatus ?? template.status) !== 'available') return false
  return publicDemoOverrides?.get(template.id) ?? true
}

export function freeDemoPath(id: string, data: 'full' | 'empty' = 'full'): string | null {
  if (!FREE_DEMO_TEMPLATE_IDS.includes(id as FreeDemoTemplateId)) return null
  if (!isPublicDemoEnabled(id)) return null
  return `/demo/${id}?data=${data}`
}

export function getPublicTemplate(idOrBusinessType: string): PublicTemplateDefinition {
  const template = PUBLIC_TEMPLATES.find(item => item.id === idOrBusinessType || item.businessType === idOrBusinessType)
  if (!template) throw new Error('Plantilla pública no reconocida.')
  return template
}

export function isTechnicalDemoAvailable(idOrBusinessType: string): boolean {
  const template = PUBLIC_TEMPLATES.find(item => item.id === idOrBusinessType || item.businessType === idOrBusinessType)
  return (template?.demoStatus ?? template?.status) === 'available'
}

export function isTemplateProvisioningAvailable(idOrBusinessType: string): boolean {
  const template = PUBLIC_TEMPLATES.find(item => item.id === idOrBusinessType || item.businessType === idOrBusinessType)
  return (template?.provisioningStatus ?? template?.status) === 'available'
}

export function canLaunchCommercialDemo(template: {
  status?: string
  demoEnabled?: boolean
  demoEnabledConfigured?: boolean
  canonicalTemplateId?: string | null
  templateId?: string
  id?: string
}): boolean {
  const targetId = template.canonicalTemplateId || template.templateId || template.id || ''
  if (!isPublicDemoEnabled(targetId)) return false
  // Legacy seed values were not an explicit Admin decision. Only the marker
  // written by the current Admin control is allowed to override the route.
  return template.demoEnabledConfigured === true ? template.demoEnabled === true : true
}
