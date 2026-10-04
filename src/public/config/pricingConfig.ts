/**
 * CONFIGURACIÓN CENTRALIZADA DE PLANES, PRECIOS Y EXTRAS COMERCIALES
 * 
 * ARQUITECTURA PREPARADA PARA EL FUTURO PANEL /admin:
 * - 3 Planes comerciales estándar por cada plantilla (12 planes en total + Desarrollo a medida)
 * - Separación estricta entre:
 *     1. FUNCTION ENTITLEMENTS (capacidades técnicas del motor de cada plantilla)
 *     2. COMMERCIAL EXTRAS (servicios de valor agregado: publicidad, branding, automatización)
 * - Estado 'published' | 'draft' por plan y extra
 * - Valores de precio son PLACEHOLDERS REFERENCIALES centralizados, no vinculantes.
 * - Toda la UI consume exclusivamente esta configuración sin hardcodear datos en JSX.
 */

export type TemplateKey = 'restaurant' | 'distribution' | 'nightclub' | 'retail'

export interface PlanFeatureItem {
  id: string
  label: string
  included: boolean
  highlight?: boolean
}

export interface TemplateTierPlan {
  id: string
  templateId: TemplateKey
  name: string
  tierLevel: 1 | 2 | 3
  /* DEMO_PLACEHOLDER: precio de referencia visual no oficial */
  monthlyPriceUSD: number
  annualPriceUSD: number
  currency: 'USD' | 'BOB'
  billingPeriod: 'monthly' | 'annual'
  badge?: string // Ej. 'Más popular' o 'Recomendado'
  isPopular?: boolean
  clientProfile: string // Para quién sirve / breve perfil de cliente
  limitsLabel?: string // Límites si existen (ej. '1 estación', 'Hasta 3 camiones', etc.)
  includedFeatures: string[]
  technicalEntitlements: string[]
  ctaLabel: string
  status: 'published' | 'draft'
  order: number
}

export interface CustomDevelopmentConfig {
  id: string
  title: string
  subtitle: string
  tagline: string
  description: string
  highlights: string[]
  whatsAppPhone: string
  whatsAppMessage: string
  whatsAppLink: string
  status: 'published' | 'draft'
}

export interface CommercialExtraService {
  id: string
  title: string
  category: 'custom' | 'marketing' | 'branding' | 'support' | 'automation' | 'consulting'
  shortDescription: string
  referencePriceLabel: string
  pricingType: 'recurring' | 'one_time' | 'custom_quote'
  iconKey: 'megaphone' | 'palette' | 'headset' | 'zap' | 'code'
  applicableTemplates: TemplateKey[] | 'all'
  status: 'published' | 'draft'
  order: number
}

/** Configuración de contacto oficial vía WhatsApp */
export const OFFICIAL_WHATSAPP = {
  phoneNumber: '59177987776',
  displayNumber: '+591 77987776',
  defaultHeroMessage: 'Hola, quiero información sobre un desarrollo a medida en PACHAX Platform.',
  defaultCustomDevMessage: 'Hola, quiero información sobre un desarrollo a medida en PACHAX Platform.',
  buildUrl(message: string): string {
    return `https://wa.me/${this.phoneNumber}?text=${encodeURIComponent(message)}`
  },
} as const

/**
 * 3 PLANES POR PLANTILLA
 * Configurados rigurosamente según las capabilities técnicas REALES de cada módulo.
 */
export const PLANS_BY_TEMPLATE: Record<TemplateKey, readonly TemplateTierPlan[]> = {
  restaurant: Object.freeze([
    {
      id: 'rest_plan_1',
      templateId: 'restaurant',
      name: 'Salón Básico',
      tierLevel: 1,
      monthlyPriceUSD: 29,
      annualPriceUSD: 24,
      currency: 'USD',
      billingPeriod: 'monthly',
      clientProfile: 'Bistrós, cafeterías o locales con 1 estación de cobro y atención ágil.',
      limitsLabel: '1 caja · hasta 15 mesas',
      includedFeatures: [
        'Mapa interactivo de mesas y salón',
        'Comandas y apertura de cuentas',
        'Cobro con efectivo, QR simple y tarjetas',
        'Cierre de caja ciego por turno',
        'Catálogo de platos y bebidas',
      ],
      technicalEntitlements: ['restaurant_pos', 'cash_close_blind'],
      ctaLabel: 'Elegir Salón Básico',
      status: 'draft',
      order: 1,
    },
    {
      id: 'rest_plan_2',
      templateId: 'restaurant',
      name: 'Restaurante Pro',
      tierLevel: 2,
      monthlyPriceUSD: 59,
      annualPriceUSD: 49,
      currency: 'USD',
      billingPeriod: 'monthly',
      badge: 'Más popular',
      isPopular: true,
      clientProfile: 'Restaurantes con salón activo, cocina en marcha y mozos en sala.',
      limitsLabel: 'Estaciones y mesas ilimitadas',
      includedFeatures: [
        'Todas las funciones de Salón Básico',
        'Monitor KDS en cocina con tiempos de preparación',
        'Comandas móviles para mozos en mesa',
        'Cuentas divididas y control de propinas',
        'Inventario por recetas (gramos y botellas)',
        'Soporte técnico prioritario',
      ],
      technicalEntitlements: ['restaurant_pos', 'kitchen_kds', 'waiter_orders', 'recipe_inventory', 'cash_close_blind'],
      ctaLabel: 'Elegir Restaurante Pro',
      status: 'draft',
      order: 2,
    },
    {
      id: 'rest_plan_3',
      templateId: 'restaurant',
      name: 'Gastronomía Multi',
      tierLevel: 3,
      monthlyPriceUSD: 99,
      annualPriceUSD: 84,
      currency: 'USD',
      billingPeriod: 'monthly',
      clientProfile: 'Cadenas gastronómicas, franquicias o múltiples locales interconectados.',
      limitsLabel: 'Multisucursal · Centro de producción',
      includedFeatures: [
        'Todas las funciones de Restaurante Pro',
        'Multisucursal con almacén centralizado',
        'Transferencias de insumos entre locales',
        'Roles avanzados y permisos por área',
        'Reportes ejecutivos consolidados en la nube',
        'SLA garantizado y asesor de cuenta',
      ],
      technicalEntitlements: ['restaurant_pos', 'kitchen_kds', 'multi_branch', 'central_warehouse', 'advanced_roles'],
      ctaLabel: 'Elegir Gastronomía Multi',
      status: 'draft',
      order: 3,
    },
  ]),

  distribution: Object.freeze([
    {
      id: 'dist_plan_1',
      templateId: 'distribution',
      name: 'Ruta Inicial',
      tierLevel: 1,
      monthlyPriceUSD: 39,
      annualPriceUSD: 33,
      currency: 'USD',
      billingPeriod: 'monthly',
      clientProfile: 'Pequeñas distribuidoras o productores con hasta 2 camiones de reparto.',
      limitsLabel: 'Hasta 2 rutas de reparto',
      includedFeatures: [
        'Carga inicial de camión con control de kilos',
        'Registro de ventas en ruta y clientes',
        'Liquidación ciega contra retorno físico',
        'Cobro en efectivo y reporte de chofer',
        'Control básico de stock en almacén',
      ],
      technicalEntitlements: ['truck_dispatch', 'route_sales', 'blind_settlement'],
      ctaLabel: 'Elegir Ruta Inicial',
      status: 'draft',
      order: 1,
    },
    {
      id: 'dist_plan_2',
      templateId: 'distribution',
      name: 'Distribución Integral',
      tierLevel: 2,
      monthlyPriceUSD: 69,
      annualPriceUSD: 58,
      currency: 'USD',
      billingPeriod: 'monthly',
      badge: 'Más popular',
      isPopular: true,
      clientProfile: 'Empresas distribuidoras con flota activa, cobranzas a crédito y preventistas.',
      limitsLabel: 'Flota activa · Rutas ilimitadas',
      includedFeatures: [
        'Todas las funciones de Ruta Inicial',
        'Control de aumentos y mermas en ruta',
        'Gestión de cartera de crédito y cobranzas',
        'Liquidación con cálculo exacto de sobrantes/faltantes',
        'Trazabilidad de lotes y fechas de vencimiento',
        'Reporte comercial comparativo por vendedor',
      ],
      technicalEntitlements: ['truck_dispatch', 'credit_portfolio', 'batch_tracking', 'route_settlement_variance'],
      ctaLabel: 'Elegir Distribución Integral',
      status: 'draft',
      order: 2,
    },
    {
      id: 'dist_plan_3',
      templateId: 'distribution',
      name: 'Logística Mayorista',
      tierLevel: 3,
      monthlyPriceUSD: 119,
      annualPriceUSD: 99,
      currency: 'USD',
      billingPeriod: 'monthly',
      clientProfile: 'Fábricas y centros de distribución con almacenes regionales y gran volumen.',
      limitsLabel: 'Depósitos múltiples · Flota mayorista',
      includedFeatures: [
        'Todas las funciones de Distribución Integral',
        'Almacenes regionales y transferencias de carga',
        'Precios diferenciados por categoría de cliente',
        'Conexión API con sistemas contables / ERP',
        'Auditoría forense de despachos y liquidaciones',
        'Gerente de cuenta técnico y soporte VIP',
      ],
      technicalEntitlements: ['regional_depots', 'price_tiers', 'api_integration', 'audit_forensics'],
      ctaLabel: 'Elegir Logística Mayorista',
      status: 'draft',
      order: 3,
    },
  ]),

  nightclub: Object.freeze([
    {
      id: 'night_plan_1',
      templateId: 'nightclub',
      name: 'Bar & Lounge',
      tierLevel: 1,
      monthlyPriceUSD: 35,
      annualPriceUSD: 29,
      currency: 'USD',
      billingPeriod: 'monthly',
      clientProfile: 'Bares nocturnos, pubs o terrazas lounge con 1 barra principal.',
      limitsLabel: '1 barra · Cuentas rápidas',
      includedFeatures: [
        'Comandero rápido para barra en menos de 15s',
        'Cuentas abiertas de clientes y mesas',
        'Cobro con efectivo, QR y tarjeta',
        'Cierre de caja ciego por barman',
        'Catálogo de cócteles y cervezas',
      ],
      technicalEntitlements: ['fast_bar_pos', 'tab_management', 'blind_shift_close'],
      ctaLabel: 'Elegir Bar & Lounge',
      status: 'draft',
      order: 1,
    },
    {
      id: 'night_plan_2',
      templateId: 'nightclub',
      name: 'Club & Zonas VIP',
      tierLevel: 2,
      monthlyPriceUSD: 69,
      annualPriceUSD: 58,
      currency: 'USD',
      billingPeriod: 'monthly',
      badge: 'Más popular',
      isPopular: true,
      clientProfile: 'Discotecas y clubes de alta concurrencia con múltiples barras y salas VIP.',
      limitsLabel: 'Barras ilimitadas · Mesas VIP',
      includedFeatures: [
        'Todas las funciones de Bar & Lounge',
        'Cuentas por pulsera #tag o consumo de mesa',
        'Control estricto de botellas por mililitros (ml)',
        'Múltiples barras sincronizadas en tiempo real',
        'Control de descorches y cortesías autorizadas',
        'Auditoría ciega contra stock físico de licores',
      ],
      technicalEntitlements: ['multi_bar_sync', 'bottle_ml_tracking', 'wristband_tabs', 'vip_sectors'],
      ctaLabel: 'Elegir Club & VIP',
      status: 'draft',
      order: 2,
    },
    {
      id: 'night_plan_3',
      templateId: 'nightclub',
      name: 'Mega Club & Eventos',
      tierLevel: 3,
      monthlyPriceUSD: 119,
      annualPriceUSD: 99,
      currency: 'USD',
      billingPeriod: 'monthly',
      clientProfile: 'Grandes discotecas, recintos de conciertos y festivales con boletería y barras masivas.',
      limitsLabel: 'Operación masiva · Terminales libres',
      includedFeatures: [
        'Todas las funciones de Club & VIP',
        'Terminales de barra ilimitadas sin latencia',
        'Control de accesos y consumo prepago',
        'Reportes de rendimiento por bartender y barra',
        'Respaldo local offline para contingencias de red',
        'Acompañamiento técnico directo en eventos pico',
      ],
      technicalEntitlements: ['high_throughput', 'offline_local_failover', 'bartender_analytics'],
      ctaLabel: 'Elegir Mega Club',
      status: 'draft',
      order: 3,
    },
  ]),

  retail: Object.freeze([
    {
      id: 'retail_plan_1',
      templateId: 'retail',
      name: 'Mostrador Ágil',
      tierLevel: 1,
      monthlyPriceUSD: 25,
      annualPriceUSD: 20,
      currency: 'USD',
      billingPeriod: 'monthly',
      clientProfile: 'Heladerías, panaderías o tiendas de conveniencia de cobro rápido.',
      limitsLabel: '1 caja de mostrador',
      includedFeatures: [
        'Punto de venta táctil con categorías visuales',
        'Venta rápida en 1 click por unidad o gramo',
        'Cobro con efectivo y QR inmediato',
        'Emisión de ticket térmico o recibo digital',
        'Cierre de caja diario con arqueo',
      ],
      technicalEntitlements: ['touch_pos', 'fast_receipts', 'daily_cash_close'],
      ctaLabel: 'Elegir Mostrador Ágil',
      status: 'draft',
      order: 1,
    },
    {
      id: 'retail_plan_2',
      templateId: 'retail',
      name: 'Comercio Balanza',
      tierLevel: 2,
      monthlyPriceUSD: 49,
      annualPriceUSD: 40,
      currency: 'USD',
      billingPeriod: 'monthly',
      badge: 'Más popular',
      isPopular: true,
      clientProfile: 'Fiambrerías boutique, carnicerías o locales con venta intensiva por peso.',
      limitsLabel: 'Básculas conectadas · Estaciones libres',
      includedFeatures: [
        'Todas las funciones de Mostrador Ágil',
        'Conexión directa con báscula/balanza digital RS232/USB',
        'Cálculo automático de precio por peso exacto',
        'Control de stock por kilogramos y unidades',
        'Alertas de inventario mínimo y reposición',
        'Múltiples cajas de atención simultáneas',
      ],
      technicalEntitlements: ['scale_integration', 'weight_inventory', 'multi_register'],
      ctaLabel: 'Elegir Comercio Balanza',
      status: 'draft',
      order: 2,
    },
    {
      id: 'retail_plan_3',
      templateId: 'retail',
      name: 'Cadena Retail',
      tierLevel: 3,
      monthlyPriceUSD: 89,
      annualPriceUSD: 74,
      currency: 'USD',
      billingPeriod: 'monthly',
      clientProfile: 'Redes de tiendas, franquicias de heladería o minimarkets con sucursales.',
      limitsLabel: 'Multisucursal · Almacén central',
      includedFeatures: [
        'Todas las funciones de Comercio Balanza',
        'Gestión centralizada de precios y catálogos',
        'Transferencias de mercadería entre tiendas',
        'Reportes de venta y rentabilidad por local',
        'Control de usuarios y permisos por sucursal',
        'Soporte prioritario y canal técnico directo',
      ],
      technicalEntitlements: ['retail_multibranch', 'central_catalog', 'stock_transfers'],
      ctaLabel: 'Elegir Cadena Retail',
      status: 'draft',
      order: 3,
    },
  ]),
}

/** Configuración de la oferta de Desarrollo a Medida */
export const CUSTOM_DEVELOPMENT_CONFIG: CustomDevelopmentConfig = Object.freeze({
  id: 'custom_development',
  title: 'Desarrollo a medida',
  subtitle: 'Software exclusivo para la operativa exacta de tu negocio',
  tagline: 'Con mantenimiento mensual incluido y evolución garantizada',
  description: 'Si tu modelo operativo supera las plantillas estándar, diseñamos y programamos una solución tecnológica exclusiva. Tu empresa obtiene arquitectura dedicada, reglas de negocio propietarias y soporte técnico directo continuo.',
  highlights: [
    'Levantamiento de requerimientos y diseño de interfaz a medida',
    'Lógica de negocio y reglas operacionales exclusivas de tu empresa',
    'Integración con hardware propietario, básculas o ERPs existentes',
    'Mantenimiento mensual, seguridad, respaldos y evolución técnica incluida',
    'Capacitación presencial o virtual a tu equipo y asesor de cuenta asignado',
  ],
  whatsAppPhone: OFFICIAL_WHATSAPP.phoneNumber,
  whatsAppMessage: OFFICIAL_WHATSAPP.defaultCustomDevMessage,
  whatsAppLink: OFFICIAL_WHATSAPP.buildUrl(OFFICIAL_WHATSAPP.defaultCustomDevMessage),
  status: 'published',
})

/**
 * COMMERCIAL EXTRAS (SERVICIOS COMPLEMENTARIOS)
 * Servicios de valor agregado separados de las capacidades técnicas del sistema.
 */
export const COMMERCIAL_EXTRAS: readonly CommercialExtraService[] = Object.freeze([
  {
    id: 'extra_custom_dev',
    title: 'Desarrollo y Adaptación a Medida',
    category: 'custom',
    shortDescription: 'Construcción de módulos exclusivos, reglas de comisión específicas o reportes contables personalizados para tu flujo.',
    referencePriceLabel: 'Cotización personalizada',
    pricingType: 'custom_quote',
    iconKey: 'code',
    applicableTemplates: 'all',
    status: 'published',
    order: 1,
  },
  {
    id: 'extra_marketing',
    title: 'Publicidad y Marketing Digital',
    category: 'marketing',
    shortDescription: 'Campañas geolocalizadas en redes sociales, cupones de fidelización por WhatsApp y promociones automatizadas para días de baja venta.',
    referencePriceLabel: 'Cotización personalizada',
    pricingType: 'recurring',
    iconKey: 'megaphone',
    applicableTemplates: 'all',
    status: 'draft',
    order: 2,
  },
  {
    id: 'extra_branding',
    title: 'Branding e Identidad de Marca',
    category: 'branding',
    shortDescription: 'Diseño y personalización de menú digital interactivo, comandas con logotipo, colores corporativos y formato de tickets térmicos.',
    referencePriceLabel: 'Cotización personalizada',
    pricingType: 'one_time',
    iconKey: 'palette',
    applicableTemplates: 'all',
    status: 'draft',
    order: 3,
  },
  {
    id: 'extra_support_vip',
    title: 'Soporte Prioritario VIP 24/7',
    category: 'support',
    shortDescription: 'Canal directo de WhatsApp con ingenieros asignados y tiempo de respuesta garantizado menor a 15 minutos en turno de alta demanda.',
    referencePriceLabel: 'Cotización personalizada',
    pricingType: 'recurring',
    iconKey: 'headset',
    applicableTemplates: 'all',
    status: 'draft',
    order: 4,
  },
  {
    id: 'extra_automation',
    title: 'Automatizaciones y Conexión API',
    category: 'automation',
    shortDescription: 'Conexión automatizada con facturación electrónica local, conciliación bancaria por QR y exportación programada a hojas de cálculo o ERP.',
    referencePriceLabel: 'Cotización personalizada',
    pricingType: 'recurring',
    iconKey: 'zap',
    applicableTemplates: 'all',
    status: 'draft',
    order: 5,
  },
])
