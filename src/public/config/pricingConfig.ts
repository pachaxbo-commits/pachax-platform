/**
 * CONFIGURACIÓN CENTRALIZADA DE PRECIOS, PLANES Y EXTRAS (MODELO COMERCIAL SAAS)
 * 
 * NOTA DE ARQUITECTURA:
 * Los precios y funciones aquí declarados son CONTENIDO VISUAL DE REFERENCIA
 * y NO constituyen precios comerciales oficiales ni definitivos de PACHAX.
 * 
 * ARQUITECTURA PREPARADA PARA FUTURA ADMINISTRACIÓN (ADMIN PANEL):
 * Este modelo desacoplado permite que un futuro panel administrativo gestione:
 * 1. Alta, baja y edición de planes (CRUD)
 * 2. Precios dinámicos (USD / BOB, mensual / anual)
 * 3. Selección y activación de funcionalidades por plantilla (features / entitlements)
 * 4. Asignación de plantillas compatibles ('restaurant' | 'distribution' | 'nightclub' | 'retail' | 'all')
 * 5. Marcador de "Más popular" (isPopular, badge)
 * 6. Orden visual de despliegue (order)
 * 7. Catálogo de Extras / Adicionales modulares (publicidad, branding, soporte, automatizaciones)
 * 8. Rutas a miniaturas y recursos gráficos configurables
 * 
 * Toda la UI pública debe consumir EXCLUSIVAMENTE esta fuente de datos centralizada.
 */

export type TemplateId = 'restaurant' | 'distribution' | 'retail' | 'nightclub' | 'custom'

export interface TemplateFeature {
  id: string
  templateId: TemplateId | 'all'
  label: string
  description: string
  category: 'core' | 'operations' | 'finance' | 'advanced'
}

export interface PlanEntitlement {
  featureId: string
  enabled: boolean
  limitLabel?: string
}

export interface CommercialPlan {
  id: string
  name: string
  tierKey: 'basic' | 'pro' | 'enterprise' | 'custom'
  /* DEMO_PLACEHOLDER: valor referencial no vinculante */
  startingPriceUSD: number
  priceAnnualUSD?: number
  currency: 'USD' | 'BOB'
  billingPeriod: 'monthly' | 'annual'
  badge?: string // Ej. 'Más popular'
  isPopular?: boolean
  isCustomQuote?: boolean
  active: boolean
  order: number
  targetAudience: string
  description: string
  includedFeatures: string[]
  templatePerks?: Partial<Record<TemplateId, string[]>>
  entitlements: PlanEntitlement[]
  ctaLabel: string
  ctaAction: 'register' | 'contact' | 'demo'
  maintenanceIncluded: boolean
}

export interface PlatformAddon {
  id: string
  name: string
  tagline: string
  description: string
  category: 'marketing' | 'branding' | 'support' | 'automation' | 'custom'
  /* DEMO_PLACEHOLDER: referencia visual de tarifa */
  referencePriceUSD?: number
  referencePriceLabel: string
  pricingType: 'recurring' | 'one_time' | 'custom_quote'
  iconKey: 'ads' | 'palette' | 'headset' | 'zap' | 'code'
  active: boolean
  badge?: string
}

export interface AdminCatalogConfig {
  version: string
  lastUpdated: string
  currencySymbol: string
  plans: readonly CommercialPlan[]
  addons: readonly PlatformAddon[]
}

/**
 * Catálogo maestro de funcionalidades configurables por plantilla.
 */
export const TEMPLATE_FEATURES: readonly TemplateFeature[] = Object.freeze([
  { id: 'pos_kiosk', templateId: 'restaurant', label: 'POS Kiosk y Salón', description: 'Comandas de mesas en vivo y cobro', category: 'operations' },
  { id: 'kds_kitchen', templateId: 'restaurant', label: 'Pantalla KDS Cocina', description: 'Tickets y tiempos de preparación de pedidos', category: 'operations' },
  { id: 'route_dispatch', templateId: 'distribution', label: 'Despacho y Rutas', description: 'Liquidación de camión y cobranzas en ruta', category: 'operations' },
  { id: 'warehouse_lots', templateId: 'distribution', label: 'Control de Lotes y Peso', description: 'Trazabilidad y control de mermas físicas', category: 'operations' },
  { id: 'nightclub_tabs', templateId: 'nightclub', label: 'Cuentas de Barra y VIP', description: 'Consumo por pulsera, mesa o sala lounge', category: 'operations' },
  { id: 'bottle_control', templateId: 'nightclub', label: 'Inventario de Botellas y ml', description: 'Control estricto de descorches y copas', category: 'operations' },
  { id: 'express_scale', templateId: 'retail', label: 'Venta por Unidad y Peso', description: 'Conexión a báscula y caja rápida de mostrador', category: 'operations' },
  { id: 'daily_cash_close', templateId: 'all', label: 'Cierre de Caja Ciego', description: 'Auditoría sin saldos previos para total transparencia', category: 'finance' },
  { id: 'cloud_sync', templateId: 'all', label: 'Sincronización Cloud', description: 'Operación continua y respaldo en la nube', category: 'core' },
  { id: 'multi_branch', templateId: 'all', label: 'Multisucursal y Permisos', description: 'Gestión centralizada de múltiples locales y almacenes', category: 'advanced' },
])

/**
 * 3 Planes comerciales base por plantilla + Opción de Desarrollo a medida.
 */
export const COMMERCIAL_PLANS: readonly CommercialPlan[] = Object.freeze([
  {
    id: 'plan_basic',
    name: 'Básico',
    tierKey: 'basic',
    startingPriceUSD: 29,
    currency: 'USD',
    billingPeriod: 'monthly',
    active: true,
    order: 1,
    targetAudience: 'Para negocios que inician o locales con una sola estación.',
    description: 'Plantilla operativa completa con todas las herramientas esenciales para facturar y atender.',
    includedFeatures: [
      '1 plantilla a elección (Restaurante, Distribuidora, Nightclub o Express)',
      'Hasta 2 usuarios concurrentes con roles diferenciados',
      'Caja ciega y auditoría básica de turnos',
      'Emisión de tickets y recibos digitales',
      'Sincronización cloud y respaldo continuo',
    ],
    templatePerks: {
      restaurant: ['Gestión de salón y mesas', 'Comanda básica para mozos'],
      distribution: ['Carga de camión y liquidación básica'],
      nightclub: ['Control de entrada y barra principal'],
      retail: ['Punto de venta ágil de mostrador'],
    },
    entitlements: [
      { featureId: 'daily_cash_close', enabled: true },
      { featureId: 'cloud_sync', enabled: true },
    ],
    ctaLabel: 'Elegir Plan Básico',
    ctaAction: 'register',
    maintenanceIncluded: false,
  },
  {
    id: 'plan_pro',
    name: 'Profesional',
    tierKey: 'pro',
    startingPriceUSD: 59,
    currency: 'USD',
    billingPeriod: 'monthly',
    badge: 'Más popular',
    isPopular: true,
    active: true,
    order: 2,
    targetAudience: 'Para operaciones activas que requieren estaciones simultáneas y reportes avanzados.',
    description: 'Control operativo integral: múltiples pantallas sincronizadas, KDS o rutas y soporte prioritario.',
    includedFeatures: [
      'Plantilla completa sin límite de estaciones ni comandas',
      'Usuarios, mozos, cajeros o choferes ilimitados',
      'Pantalla KDS de cocina o App de reparto en tiempo real',
      'Auditoría ciega avanzada y control estricto de mermas',
      'Control de inventario por lotes, peso o volumen',
      'Soporte prioritario y actualizaciones continuas',
    ],
    templatePerks: {
      restaurant: ['KDS cocina en vivo + tiempos de preparación', 'Cuentas divididas y propinas'],
      distribution: ['Rutas con liquidación de faltantes/sobrantes', 'Control de cobranzas a crédito'],
      nightclub: ['Mesas VIP + pulseras y fichas', 'Control de botellas por mililitros'],
      retail: ['Conexión de balanza de precisión', 'Botonera rápida de categorías'],
    },
    entitlements: [
      { featureId: 'pos_kiosk', enabled: true },
      { featureId: 'kds_kitchen', enabled: true },
      { featureId: 'route_dispatch', enabled: true },
      { featureId: 'nightclub_tabs', enabled: true },
      { featureId: 'express_scale', enabled: true },
      { featureId: 'daily_cash_close', enabled: true },
      { featureId: 'cloud_sync', enabled: true },
    ],
    ctaLabel: 'Elegir Plan Profesional',
    ctaAction: 'register',
    maintenanceIncluded: true,
  },
  {
    id: 'plan_enterprise',
    name: 'Empresarial',
    tierKey: 'enterprise',
    startingPriceUSD: 99,
    currency: 'USD',
    billingPeriod: 'monthly',
    active: true,
    order: 3,
    targetAudience: 'Para cadenas multisucursal, franquicias o redes comerciales de alta escala.',
    description: 'Gestión unificada de múltiples sucursales con almacén central, reportes consolidados y SLA 99.9%.',
    includedFeatures: [
      'Multisucursal y gestión de almacén centralizado',
      'Transferencias de stock entre locales con guía de despacho',
      'Reportes financieros ejecutivos consolidados',
      'Roles, permisos granulares y auditoría forense',
      'Conexión API para integraciones contables o ERP',
      'Gerente de cuenta dedicado y SLA 99.9%',
    ],
    templatePerks: {
      restaurant: ['Múltiples sucursales y centro de producción', 'Recetas estándar y costeo'],
      distribution: ['Flota completa de camiones y depósitos', 'Precios diferenciados por cliente'],
      nightclub: ['Múltiples barras y sectores VIP interconectados'],
      retail: ['Red de tiendas y reposición automática'],
    },
    entitlements: [
      { featureId: 'multi_branch', enabled: true },
      { featureId: 'daily_cash_close', enabled: true },
      { featureId: 'cloud_sync', enabled: true },
    ],
    ctaLabel: 'Elegir Plan Empresarial',
    ctaAction: 'register',
    maintenanceIncluded: true,
  },
  {
    id: 'plan_custom',
    name: 'Desarrollo a medida',
    tierKey: 'custom',
    startingPriceUSD: 0,
    currency: 'USD',
    billingPeriod: 'monthly',
    isCustomQuote: true,
    active: true,
    order: 4,
    targetAudience: 'Para modelos de negocio no estándar que requieren software hecho a su medida exacta.',
    description: 'Diseñamos y programamos una plantilla personalizada para tu flujo operativo, con soporte y mantenimiento mensual incluido.',
    includedFeatures: [
      'Levantamiento de requerimientos y diseño de interfaz a medida',
      'Lógica y reglas de negocio exclusivas de tu empresa',
      'Integración con hardware propietario o ERPs existentes',
      'Mantenimiento mensual, seguridad y evolución continua',
      'Acompañamiento y capacitación a todo tu equipo',
    ],
    entitlements: [],
    ctaLabel: 'Solicitar propuesta a medida',
    ctaAction: 'contact',
    maintenanceIncluded: true,
  },
])

/**
 * SECCIÓN 3: Catálogo de Extras / Adicionales Modulares.
 * Permite complementar el plan base con servicios de valor agregado.
 */
export const PLATFORM_ADDONS: readonly PlatformAddon[] = Object.freeze([
  {
    id: 'addon_ads',
    name: 'Publicidad y Marketing Digital',
    tagline: 'Atrae clientes recurrentes a tu local o ruta comercial',
    description: 'Campañas geolocalizadas en redes sociales, cupones de fidelización por WhatsApp y promociones automatizadas para horas bajas.',
    category: 'marketing',
    referencePriceUSD: 49,
    referencePriceLabel: 'Desde $49 / mes',
    pricingType: 'recurring',
    iconKey: 'ads',
    active: true,
  },
  {
    id: 'addon_branding',
    name: 'Branding e Identidad de Marca',
    tagline: 'Tu marca en cada punto de contacto con el cliente',
    description: 'Personalización gráfica de comandas, menú digital interactivo con tu paleta y tipografía, y diseño de tickets y recibos premium.',
    category: 'branding',
    referencePriceUSD: 79,
    referencePriceLabel: 'Pago único desde $79',
    pricingType: 'one_time',
    iconKey: 'palette',
    active: true,
  },
  {
    id: 'addon_support',
    name: 'Soporte Prioritario VIP',
    tagline: 'Asistencia inmediata cuando tu negocio más lo necesita',
    description: 'Canal directo de WhatsApp con tu equipo de soporte asignado, tiempo de respuesta garantizado menor a 15 minutos en turno operativo.',
    category: 'support',
    referencePriceUSD: 35,
    referencePriceLabel: '$35 / mes',
    pricingType: 'recurring',
    iconKey: 'headset',
    active: true,
  },
  {
    id: 'addon_automation',
    name: 'Automatizaciones y Conectores API',
    tagline: 'Conecta tu sistema con tu contabilidad y bancos',
    description: 'Sincronización automática de cobros QR, pasarelas de pago, facturación electrónica y exportación programada a hojas de cálculo o ERP.',
    category: 'automation',
    referencePriceUSD: 59,
    referencePriceLabel: 'Desde $59 / mes',
    pricingType: 'recurring',
    iconKey: 'zap',
    active: true,
  },
  {
    id: 'addon_custom_flow',
    name: 'Personalizaciones y Flujos Especiales',
    tagline: 'Módulos o reportes adicionales según tu necesidad',
    description: 'Desarrollo de reportes especializados, reglas de comisión para vendedores o validaciones de inventario exclusivas de tu operativa.',
    category: 'custom',
    referencePriceLabel: 'Cotización personalizada',
    pricingType: 'custom_quote',
    iconKey: 'code',
    active: true,
    badge: 'A medida',
  },
])

/**
 * Configuración de precios teaser para Hero y Cards.
 * Modificar aquí impacta coherentemente en toda la plataforma.
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

// Retrocompatibilidad con importaciones existentes
export const PUBLIC_PRICING_TIERS = COMMERCIAL_PLANS.map((p) => ({
  id: p.tierKey,
  name: p.name,
  priceMonthlyUSD: p.startingPriceUSD,
  currency: p.currency,
  billingPeriod: p.billingPeriod,
  badge: p.badge,
  isPopular: p.isPopular,
  isCustomQuote: p.isCustomQuote,
  active: p.active,
  order: p.order,
  description: p.description,
  highlightedFeatures: p.includedFeatures.slice(0, 3),
  entitlements: p.entitlements,
  maintenanceIncluded: p.maintenanceIncluded,
}))
