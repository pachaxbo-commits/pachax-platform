import type { BusinessType } from './platform.ts'

export type PublicTemplateStatus = 'available' | 'coming_soon'
export type PublicTemplateId = 'restaurant' | 'distribution' | 'retail' | 'nightclub'

export interface PublicTemplateDefinition {
  id: PublicTemplateId
  businessType: BusinessType
  title: string
  shortDescription: string
  demoPath: `/demo/${PublicTemplateId}`
  studioTemplateId: PublicTemplateId
  status: PublicTemplateStatus
}

export const PUBLIC_TEMPLATES: readonly PublicTemplateDefinition[] = Object.freeze([
  {
    id: 'restaurant',
    businessType: 'restaurant_pos',
    title: 'Restaurante & Gastronomía',
    shortDescription: 'Organiza salón, pedidos, cocina, inventario y caja en un solo flujo.',
    demoPath: '/demo/restaurant',
    studioTemplateId: 'restaurant',
    status: 'available',
  },
  {
    id: 'distribution',
    businessType: 'route_distribution',
    title: 'Producción y distribución',
    shortDescription: 'Controla inventario, despachos, rutas, ventas, créditos y retornos.',
    demoPath: '/demo/distribution',
    studioTemplateId: 'distribution',
    status: 'available',
  },
  {
    id: 'retail',
    businessType: 'gelateria_weight_cafe',
    title: 'Comercio / Venta rápida',
    shortDescription: 'Vende por unidad o peso con caja ágil e inventario de mostrador.',
    demoPath: '/demo/retail',
    studioTemplateId: 'retail',
    status: 'available',
  },
  {
    id: 'nightclub',
    businessType: 'nightclub_lounge',
    title: 'Club nocturno / Lounge',
    shortDescription: 'Controla mesas, rondas, barra, cuentas abiertas y caja durante toda la noche.',
    demoPath: '/demo/nightclub',
    studioTemplateId: 'nightclub',
    status: 'available',
  },
])

export function getPublicTemplate(idOrBusinessType: string): PublicTemplateDefinition {
  const template = PUBLIC_TEMPLATES.find(item => item.id === idOrBusinessType || item.businessType === idOrBusinessType)
  if (!template) throw new Error('Plantilla pública no reconocida.')
  return template
}
