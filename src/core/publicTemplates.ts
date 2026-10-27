import type { BusinessType } from './platform.ts'

export type PublicTemplateStatus = 'available' | 'coming_soon'
export type PublicTemplateId = 'restaurant' | 'hamburger' | 'distribution' | 'retail' | 'nightclub'

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
    provisioningStatus: 'coming_soon',
    demoStatus: 'coming_soon',
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
    provisioningStatus: 'coming_soon',
    demoStatus: 'coming_soon',
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
    demoStatus: 'coming_soon',
  },
])

export const OFFICIAL_COMMERCIAL_TEMPLATES = Object.freeze(['restaurant', 'distribution', 'nightclub', 'retail', 'custom'] as const)
export const PLAN_ELIGIBLE_TEMPLATE_IDS = Object.freeze(['restaurant', 'distribution', 'nightclub', 'retail'] as const)

/** Static public demos are independent of commercial and tenant provisioning state. */
const FREE_DEMO_TEMPLATE_IDS = Object.freeze(['hamburger', 'retail'] as const)
export type FreeDemoTemplateId = (typeof FREE_DEMO_TEMPLATE_IDS)[number]

export function freeDemoPath(id: string, data: 'full' | 'empty' = 'full'): string | null {
  if (!FREE_DEMO_TEMPLATE_IDS.includes(id as FreeDemoTemplateId)) return null
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
  status: string
  demoEnabled?: boolean
  canonicalTemplateId?: string | null
  templateId?: string
  id?: string
}): boolean {
  if (template.status !== 'published') return false
  const targetId = template.canonicalTemplateId || template.templateId || template.id || ''
  // La disponibilidad técnica central es la fuente de verdad de las demos.
  // demoEnabled era un booleano comercial estático y podía ocultar una ruta
  // pública funcional aunque la contratación/provisión siguiera bloqueada.
  if (!isTechnicalDemoAvailable(targetId)) return false
  return true
}
