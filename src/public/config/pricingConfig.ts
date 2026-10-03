/**
 * CONFIGURACIÓN CENTRALIZADA DE PRECIOS Y PLANES (DEMO / PLACEHOLDER)
 * 
 * NOTA DE ARQUITECTURA:
 * Los precios y funciones aquí declarados son CONTENIDO VISUAL DE REFERENCIA
 * y NO constituyen precios comerciales oficiales ni definitivos de PACHAX.
 * 
 * Este modelo está diseñado para que en el futuro un usuario Administrador
 * pueda gestionar dinámicamente desde un panel:
 * - Nombre, periodicidad y precio de cada plan
 * - Asignación de funciones por plantilla (TemplateFeature)
 * - Activación de entitlements / capacidades (PlanEntitlement)
 * - Estado activo, destacados ('Más popular') y orden visual
 * 
 * Toda la UI pública debe consumir EXCLUSIVAMENTE esta fuente de datos.
 */

export type TemplateId = 'restaurant' | 'distribution' | 'retail' | 'nightclub' | 'custom'

export interface TemplateFeature {
  id: string
  templateId: TemplateId | 'all'
  label: string
  description: string
}

export interface PlanEntitlement {
  featureId: string
  enabled: boolean
  limitLabel?: string
}

export interface PlanTier {
  id: string
  name: string
  /* DEMO_PLACEHOLDER: valor referencial de maqueta, no vinculante comercialmente */
  priceMonthlyUSD: number
  priceAnnualUSD?: number
  currency: 'USD' | 'BOB'
  billingPeriod: 'monthly' | 'annual'
  badge?: string // Ej. 'Más popular'
  isPopular?: boolean
  isCustomQuote?: boolean
  active: boolean
  order: number
  description: string
  highlightedFeatures: string[]
  entitlements: PlanEntitlement[]
  templateId?: TemplateId | 'all'
  maintenanceIncluded: boolean
}

/**
 * Catálogo de funciones conceptuales por plantilla.
 * Preparado para cuando el administrador configure planes por rubro.
 */
export const TEMPLATE_FEATURES: readonly TemplateFeature[] = Object.freeze([
  { id: 'pos_kiosk', templateId: 'restaurant', label: 'POS Kiosk y Salón', description: 'Comandas, mesas en vivo y cobro' },
  { id: 'kds_kitchen', templateId: 'restaurant', label: 'Pantalla KDS Cocina', description: 'Tickets y tiempos de preparación' },
  { id: 'route_dispatch', templateId: 'distribution', label: 'Despacho y Rutas', description: 'Liquidación de camión y cobranzas' },
  { id: 'warehouse_lots', templateId: 'distribution', label: 'Control de Lotes', description: 'Trazabilidad y mermas físicas' },
  { id: 'nightclub_tabs', templateId: 'nightclub', label: 'Cuentas de Barra y VIP', description: 'Consumo por pulsera o mesa' },
  { id: 'bottle_control', templateId: 'nightclub', label: 'Inventario de Botellas', description: 'Control de descorches y tragos' },
  { id: 'express_scale', templateId: 'retail', label: 'Venta por Unidad y Peso', description: 'Conexión a báscula y caja rápida' },
  { id: 'daily_cash_close', templateId: 'all', label: 'Cierre de Caja Ciego', description: 'Auditoría sin saldos previos' },
  { id: 'cloud_sync', templateId: 'all', label: 'Sincronización Cloud', description: 'Operación continua y respaldo' },
])

/**
 * Tiers públicos de demostración.
 * Configuración centralizada para alimentar la tarjeta desktop y el selector mobile.
 */
export const PUBLIC_PRICING_TIERS: readonly PlanTier[] = Object.freeze([
  {
    id: 'basic',
    name: 'Básico',
    /* DEMO_PLACEHOLDER: precio de referencia visual en maqueta */
    priceMonthlyUSD: 29,
    currency: 'USD',
    billingPeriod: 'monthly',
    active: true,
    order: 1,
    description: 'Plantillas listas para usar con todas las funcionalidades esenciales.',
    highlightedFeatures: ['1 plantilla incluida', 'Hasta 2 usuarios concurrentes', 'Caja y reportes básicos'],
    entitlements: [
      { featureId: 'daily_cash_close', enabled: true },
      { featureId: 'cloud_sync', enabled: true },
    ],
    maintenanceIncluded: false,
  },
  {
    id: 'pro',
    name: 'Profesional',
    /* DEMO_PLACEHOLDER: precio de referencia visual en maqueta */
    priceMonthlyUSD: 59,
    currency: 'USD',
    billingPeriod: 'monthly',
    badge: 'Más popular',
    isPopular: true,
    active: true,
    order: 2,
    description: 'Control operativo completo con múltiples estaciones y soporte prioritario.',
    highlightedFeatures: ['Salón y KDS o Rutas en vivo', 'Usuarios y cajas ilimitadas', 'Auditoría ciega'],
    entitlements: [
      { featureId: 'pos_kiosk', enabled: true },
      { featureId: 'kds_kitchen', enabled: true },
      { featureId: 'daily_cash_close', enabled: true },
      { featureId: 'cloud_sync', enabled: true },
    ],
    maintenanceIncluded: true,
  },
  {
    id: 'enterprise',
    name: 'Empresarial',
    /* DEMO_PLACEHOLDER: precio de referencia visual en maqueta */
    priceMonthlyUSD: 99,
    currency: 'USD',
    billingPeriod: 'monthly',
    active: true,
    order: 3,
    description: 'Para operaciones multisucursal, franquicias o redes de distribución complejas.',
    highlightedFeatures: ['Multisucursal y almacén central', 'Roles avanzados y permisos', 'Soporte 24/7'],
    entitlements: [
      { featureId: 'route_dispatch', enabled: true },
      { featureId: 'warehouse_lots', enabled: true },
      { featureId: 'daily_cash_close', enabled: true },
      { featureId: 'cloud_sync', enabled: true },
    ],
    maintenanceIncluded: true,
  },
  {
    id: 'custom',
    name: 'Desarrollo a medida',
    priceMonthlyUSD: 0,
    currency: 'USD',
    billingPeriod: 'monthly',
    isCustomQuote: true,
    active: true,
    order: 4,
    description: 'Desarrollamos una plantilla especializada para tu negocio con mantenimiento mensual incluido.',
    highlightedFeatures: ['Arquitectura a medida', 'Flujos operacionales únicos', 'Acompañamiento directo'],
    entitlements: [],
    maintenanceIncluded: true,
  },
])

/**
 * Configuración de la presentación comercial teaser.
 * Cambiar estos valores modifica simultáneamente toda la web.
 */
export const PRICING_TEASER_CONFIG = {
  /* DEMO_PLACEHOLDER: Precio teaser que aparece en la tarjeta Desktop ($19) */
  startingPriceDesktop: {
    amount: 19,
    currencySymbol: '$',
    period: '/mes',
    label: 'Planes desde',
    note: 'Plantillas listas para usar con todas las funcionalidades esenciales.',
  },
  /* DEMO_PLACEHOLDER: Precio teaser que aparece en el selector Mobile ($29) */
  startingPriceMobile: {
    amount: 29,
    currencySymbol: 'USD $',
    period: '/mes',
    label: 'Planes desde',
    note: 'También contamos con desarrollo a medida para necesidades especiales.',
  },
  customOfferNote: {
    title: 'También ofrecemos desarrollo a medida',
    subtitle: 'Con mantenimiento mensual incluido.',
  },
} as const
