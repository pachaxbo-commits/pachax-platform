export type WhatsAppBusinessType =
  | 'restaurant'
  | 'hamburger'
  | 'distribution'
  | 'nightclub'
  | 'retail'
  | 'other'

export interface BusinessTypeOption {
  id: WhatsAppBusinessType
  label: string
  hint: string
}

export const BUSINESS_TYPE_OPTIONS: readonly BusinessTypeOption[] = [
  {
    id: 'restaurant',
    label: 'Restaurante con salón',
    hint: 'Mesas, comandas, cocina y cobro en caja.',
  },
  {
    id: 'hamburger',
    label: 'Restaurante Rápido',
    hint: 'Mostrador, pedidos ágiles y entrega.',
  },
  {
    id: 'distribution',
    label: 'Producción y Distribución',
    hint: 'Inventario, despachos, rutas y liquidación.',
  },
  {
    id: 'nightclub',
    label: 'Nightclub & Lounge',
    hint: 'Mesas, consumos, rondas, barra y cuentas.',
  },
  {
    id: 'retail',
    label: 'Comercio / Venta rápida',
    hint: 'Ventas, inventario y control de caja.',
  },
  {
    id: 'other',
    label: 'Otro tipo de negocio',
    hint: 'Describe brevemente tu negocio o sistema.',
  },
] as const

export function mapTemplateIdToBusinessType(templateId?: string | null): WhatsAppBusinessType | null {
  switch (templateId) {
    case 'restaurant':
    case 'hamburger':
    case 'distribution':
    case 'nightclub':
    case 'retail':
      return templateId
    case 'custom':
      return 'other'
    default:
      return null
  }
}

export function normalizeWhatsAppPhone(rawNumber: string): string {
  return rawNumber.replace(/\D/g, '')
}

export function isValidWhatsAppPhone(rawNumber: string): boolean {
  const normalized = normalizeWhatsAppPhone(rawNumber)
  return normalized.length >= 8 && normalized.length <= 15
}

export function buildWhatsAppBusinessMessage(
  businessType: WhatsAppBusinessType,
  otherDescription = '',
): string {
  switch (businessType) {
    case 'restaurant':
      return 'Hola, equipo PACHAX. Tengo un restaurante con salón y estoy interesado en implementar su sistema. Quisiera conocer los planes disponibles, precios, costo de implementación y requisitos para comenzar. ¿Podrían brindarme más información?'
    case 'hamburger':
      return 'Hola, equipo PACHAX. Tengo un negocio de servicio rápido y estoy interesado en implementar su sistema. Quisiera conocer las alternativas disponibles, planes, precios y requisitos para comenzar. ¿Podrían brindarme más información?'
    case 'distribution':
      return 'Hola, equipo PACHAX. Busco gestionar producción, inventario, distribución y operaciones según las necesidades de mi negocio. Quisiera conocer los planes disponibles, precios y proceso de implementación. ¿Podrían brindarme más información?'
    case 'nightclub':
      return 'Hola, equipo PACHAX. Tengo un nightclub o lounge y necesito gestionar mesas, consumos, rondas, barra y cuentas. Quisiera conocer los planes disponibles, precios y proceso de implementación. ¿Podrían brindarme más información?'
    case 'retail':
      return 'Hola, equipo PACHAX. Tengo un comercio y necesito un sistema para ventas, inventario y control de caja. Quisiera conocer los planes disponibles, precios y proceso de implementación. ¿Podrían brindarme más información?'
    case 'other': {
      const cleaned = otherDescription.trim().replace(/\s+/g, ' ')
      return `Hola, equipo PACHAX. Tengo otro tipo de negocio: ${cleaned}. Quisiera recibir información sobre una solución adaptada, planes disponibles y proceso de implementación.`
    }
  }
}

export function buildWhatsAppBusinessUrl(
  rawNumber: string,
  businessType: WhatsAppBusinessType,
  otherDescription = '',
): string | null {
  const normalized = normalizeWhatsAppPhone(rawNumber)
  if (!isValidWhatsAppPhone(normalized)) return null
  const message = buildWhatsAppBusinessMessage(businessType, otherDescription)
  return `https://wa.me/${normalized}?text=${encodeURIComponent(message)}`
}
