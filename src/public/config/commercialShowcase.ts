/**
 * CATÁLOGO COMERCIAL DE PLANTILLAS DESTACADAS
 * 
 * ÚNICA FUENTE DE VERDAD para:
 * - Coverflow Desktop
 * - Coverflow Mobile
 * - Detalle de Plantilla Activa (ActiveTemplateDetail)
 * 
 * NOTA DE ARQUITECTURA:
 * 'Ventas Express' es un nombre comercial configurable mapeado internamente
 * a la plantilla canónica 'retail' y su ruta real '/demo/retail'.
 * Cambiar nombres o descripciones aquí no rompe el enrutamiento ni los contratos.
 */

export type CommercialTemplateId = 'restaurant' | 'distribution' | 'nightclub' | 'retail' | 'custom'

export interface CommercialTemplateItem {
  id: CommercialTemplateId
  /** ID de la plantilla canónica interna (null para solución a medida) */
  canonicalTemplateId: 'restaurant' | 'distribution' | 'nightclub' | 'retail' | null
  /** Nombre comercial visible en las tarjetas y detalles */
  commercialName: string
  /** Subtítulo corto que aparece en la tarjeta del Coverflow */
  cardSubtitle: string
  /** Bullets descriptivos de la operación (visible en versión mobile o expandida) */
  bullets: string[]
  /** Badge opcional (ej. '★ Más popular') */
  badge?: string
  /** Descripción completa para el bloque ActiveTemplateDetail */
  detailDescription: string
  /** Ruta canónica hacia donde dirige la acción */
  demoPath: string
  /** Texto del botón principal */
  primaryActionLabel: string
  /** Icono temático representativo */
  iconType: 'utensils' | 'truck' | 'glass' | 'shopping-bag' | 'settings'
  /** Estilos de atmósfera y color para la tarjeta 3D */
  visualSlot: {
    accentColor: string
    glowColor: string
    gradientClass: string
    borderHoverClass: string
    pillBgClass: string
  }
}

export const COMMERCIAL_TEMPLATES: readonly CommercialTemplateItem[] = Object.freeze([
  {
    id: 'restaurant',
    canonicalTemplateId: 'restaurant',
    commercialName: 'Restaurante',
    cardSubtitle: 'Gestión completa para tu restaurante',
    bullets: ['Reservas', 'Mesas', 'Pedidos', 'Cocina', 'Facturación'],
    badge: 'Más popular',
    detailDescription: 'Gestiona mesas, pedidos, cocina, reservas y facturación. Todo lo que tu restaurante necesita en una sola plataforma.',
    demoPath: '/demo/restaurant',
    primaryActionLabel: 'Usar esta plantilla',
    iconType: 'utensils',
    visualSlot: {
      accentColor: '#F59E0B',
      glowColor: 'rgba(245, 158, 11, 0.45)',
      gradientClass: 'from-[#1c1308] via-[#2a1d0f] to-[#0c0905]',
      borderHoverClass: 'hover:border-amber-500/80',
      pillBgClass: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
    },
  },
  {
    id: 'distribution',
    canonicalTemplateId: 'distribution',
    commercialName: 'Distribuidora',
    cardSubtitle: 'Control de inventario y ventas mayoristas',
    bullets: ['Inventario', 'Clientes', 'Ventas', 'Rutas'],
    detailDescription: 'Control de inventario en almacén central, despacho de camiones en ruta, liquidación ciega y clientes mayoristas.',
    demoPath: '/demo/distribution',
    primaryActionLabel: 'Usar esta plantilla',
    iconType: 'truck',
    visualSlot: {
      accentColor: '#3B82F6',
      glowColor: 'rgba(59, 130, 246, 0.45)',
      gradientClass: 'from-[#0b192e] via-[#10243e] to-[#060c18]',
      borderHoverClass: 'hover:border-blue-500/80',
      pillBgClass: 'bg-blue-500/15 text-blue-300 border-blue-500/30',
    },
  },
  {
    id: 'nightclub',
    canonicalTemplateId: 'nightclub',
    commercialName: 'Nightclub',
    cardSubtitle: 'Administración total de tu discoteca',
    bullets: ['Mesas', 'Reservas', 'Consumo', 'Eventos'],
    detailDescription: 'Control de barras de alta velocidad, comandas de tragos, inventario de botellas, zonas VIP y cuentas abiertas durante la noche.',
    demoPath: '/demo/nightclub',
    primaryActionLabel: 'Usar esta plantilla',
    iconType: 'glass',
    visualSlot: {
      accentColor: '#A855F7',
      glowColor: 'rgba(168, 85, 247, 0.55)',
      gradientClass: 'from-[#1e0e38] via-[#2d1252] to-[#0d0519]',
      borderHoverClass: 'hover:border-purple-500/80',
      pillBgClass: 'bg-purple-500/15 text-purple-300 border-purple-500/30',
    },
  },
  {
    id: 'retail',
    canonicalTemplateId: 'retail',
    commercialName: 'Ventas Express',
    cardSubtitle: 'Vende rápido, fácil y sin complicaciones',
    bullets: ['Ventas rápidas', 'Control simple', 'Caja ágil'],
    detailDescription: 'Punto de venta táctil para mostrador, ventas ágiles por unidad o peso con báscula, tickets al instante y control de caja.',
    demoPath: '/demo/retail',
    primaryActionLabel: 'Usar esta plantilla',
    iconType: 'shopping-bag',
    visualSlot: {
      accentColor: '#10B981',
      glowColor: 'rgba(16, 185, 129, 0.45)',
      gradientClass: 'from-[#09231b] via-[#0d3327] to-[#04120e]',
      borderHoverClass: 'hover:border-emerald-500/80',
      pillBgClass: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
    },
  },
  {
    id: 'custom',
    canonicalTemplateId: null,
    commercialName: 'Solución a medida',
    cardSubtitle: 'Quiero una especializada para mi negocio',
    bullets: ['Especializada para tu negocio', 'Desarrollo a medida', 'Mantenimiento'],
    detailDescription: 'Diseñamos e implementamos una plantilla exclusiva para tu operación con soporte continuo y mantenimiento mensual garantizado.',
    demoPath: '/register',
    primaryActionLabel: 'Solicitar propuesta',
    iconType: 'settings',
    visualSlot: {
      accentColor: '#0EA5E9',
      glowColor: 'rgba(14, 165, 233, 0.45)',
      gradientClass: 'from-[#0b2030] via-[#112d44] to-[#061019]',
      borderHoverClass: 'hover:border-sky-500/80',
      pillBgClass: 'bg-sky-500/15 text-sky-300 border-sky-500/30',
    },
  },
])

export function getCommercialTemplateById(id: string): CommercialTemplateItem {
  const found = COMMERCIAL_TEMPLATES.find((t) => t.id === id)
  return found || COMMERCIAL_TEMPLATES[0]
}
