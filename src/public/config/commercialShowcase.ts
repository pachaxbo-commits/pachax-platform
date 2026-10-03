/**
 * CATÁLOGO COMERCIAL DE PLANTILLAS DESTACADAS
 * 
 * ÚNICA FUENTE DE VERDAD para:
 * - Coverflow Desktop y Mobile
 * - Detalle de Plantilla Activa
 * - Catálogo detallado de plantillas
 * - Mapeo de precios por plantilla
 */

export type CommercialTemplateId = 'restaurant' | 'distribution' | 'nightclub' | 'retail' | 'custom'

export interface CommercialTemplateItem {
  id: CommercialTemplateId
  canonicalTemplateId: 'restaurant' | 'distribution' | 'nightclub' | 'retail' | null
  commercialName: string
  cardSubtitle: string
  bullets: string[]
  badge?: string // Texto sobrio sin emojis
  detailDescription: string
  demoPath: string
  primaryActionLabel: string
  imageSrc: string
  iconType: 'utensils' | 'truck' | 'glass' | 'shopping-bag' | 'settings'
  visualSlot: {
    accentColor: string
    glowColor: string
    gradientClass: string
    pillBgClass: string
  }
}

export const COMMERCIAL_TEMPLATES: readonly CommercialTemplateItem[] = Object.freeze([
  {
    id: 'restaurant',
    canonicalTemplateId: 'restaurant',
    commercialName: 'Restaurante',
    cardSubtitle: 'Gestión completa para tu restaurante',
    bullets: ['POS y salón', 'Cocina KDS', 'Mesas en vivo', 'Pedidos', 'Clientes', 'Reportes'],
    badge: 'Más popular',
    detailDescription: 'Gestiona mesas, pedidos, cocina en tiempo real, reservas y facturación. Todo lo que tu restaurante necesita en una sola plataforma operativa.',
    demoPath: '/demo/restaurant',
    primaryActionLabel: 'Usar esta plantilla',
    imageSrc: '/brand/showcase/restaurant-showcase.svg',
    iconType: 'utensils',
    visualSlot: {
      accentColor: '#0066FF',
      glowColor: 'rgba(0, 102, 255, 0.45)',
      gradientClass: 'from-[#071322] via-[#0d2038] to-[#040b15]',
      pillBgClass: 'bg-blue-500/15 text-blue-300 border-blue-500/30',
    },
  },
  {
    id: 'distribution',
    canonicalTemplateId: 'distribution',
    commercialName: 'Distribuidora',
    cardSubtitle: 'Control de inventario y ventas mayoristas',
    bullets: ['Ventas por ruta', 'Stock y lotes', 'Cobranzas', 'Repartidores', 'Clientes', 'Liquidación ciega'],
    detailDescription: 'Control de inventario en almacén central, despacho de camiones en ruta, liquidación ciega contra retorno físico y cobranza mayorista.',
    demoPath: '/demo/distribution',
    primaryActionLabel: 'Usar esta plantilla',
    imageSrc: '/brand/showcase/distribution-showcase.svg',
    iconType: 'truck',
    visualSlot: {
      accentColor: '#0284C7',
      glowColor: 'rgba(2, 132, 199, 0.45)',
      gradientClass: 'from-[#061424] via-[#0b223d] to-[#030c17]',
      pillBgClass: 'bg-sky-500/15 text-sky-300 border-sky-500/30',
    },
  },
  {
    id: 'nightclub',
    canonicalTemplateId: 'nightclub',
    commercialName: 'Nightclub',
    cardSubtitle: 'Administración total de tu discoteca',
    bullets: ['Mesas VIP', 'Reservas', 'Consumo en barra', 'Caja en turno', 'Inventario botellas', 'Control operativo'],
    detailDescription: 'Control de barras de alta velocidad, comandas rápidas, inventario de botellas por mililitro, zonas VIP y cuentas abiertas durante la noche.',
    demoPath: '/demo/nightclub',
    primaryActionLabel: 'Usar esta plantilla',
    imageSrc: '/brand/showcase/nightclub-showcase.svg',
    iconType: 'glass',
    visualSlot: {
      accentColor: '#6366F1',
      glowColor: 'rgba(99, 102, 241, 0.45)',
      gradientClass: 'from-[#0a0f24] via-[#12163b] to-[#050814]',
      pillBgClass: 'bg-indigo-500/15 text-indigo-300 border-indigo-500/30',
    },
  },
  {
    id: 'retail',
    canonicalTemplateId: 'retail',
    commercialName: 'Ventas Express',
    cardSubtitle: 'Vende rápido, fácil y sin complicaciones',
    bullets: ['Cobro rápido', 'Catálogo simple', 'Tickets y báscula', 'Caja ágil', 'Clientes', 'Reportes'],
    detailDescription: 'Punto de venta táctil para mostrador, ventas ágiles por unidad o peso conectadas a báscula, tickets al instante y control de caja.',
    demoPath: '/demo/retail',
    primaryActionLabel: 'Usar esta plantilla',
    imageSrc: '/brand/showcase/retail-showcase.svg',
    iconType: 'shopping-bag',
    visualSlot: {
      accentColor: '#0D9488',
      glowColor: 'rgba(13, 148, 136, 0.45)',
      gradientClass: 'from-[#05171e] via-[#0a2533] to-[#030d12]',
      pillBgClass: 'bg-teal-500/15 text-teal-300 border-teal-500/30',
    },
  },
  {
    id: 'custom',
    canonicalTemplateId: null,
    commercialName: 'Solución a medida',
    cardSubtitle: 'Quiero una especializada para mi negocio',
    bullets: ['Desarrollo especializado', 'Funciones según negocio', 'Mantenimiento mensual', 'Acompañamiento técnico'],
    detailDescription: 'Diseñamos e implementamos una plantilla exclusiva para tu operación diaria con arquitectura dedicada, soporte continuo y evolución mensual garantizada.',
    demoPath: '/register?intent=custom',
    primaryActionLabel: 'Solicitar propuesta',
    imageSrc: '/brand/showcase/custom-showcase.svg',
    iconType: 'settings',
    visualSlot: {
      accentColor: '#0066FF',
      glowColor: 'rgba(0, 102, 255, 0.45)',
      gradientClass: 'from-[#071322] via-[#0d223c] to-[#040b15]',
      pillBgClass: 'bg-blue-500/15 text-blue-300 border-blue-500/30',
    },
  },
])

export function getCommercialTemplateById(id: string): CommercialTemplateItem {
  const found = COMMERCIAL_TEMPLATES.find((t) => t.id === id)
  return found || COMMERCIAL_TEMPLATES[0]
}
