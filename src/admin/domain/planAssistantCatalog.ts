import type { TemplateKey } from '../../public/config/pricingConfig.ts'
import type { CommercialCapabilitiesV1, TemplateTierPlan } from '../types'

export interface TemplateGuidanceInfo {
  id: TemplateKey
  label: string
  businessType: string
  subtitle: string
  baseFeatures: readonly string[]
  supportsKitchenAutoPrint: boolean
  supportsScaleWeightNote?: string
}

export const TEMPLATE_GUIDANCE_BY_ID: Record<TemplateKey, TemplateGuidanceInfo> = {
  restaurant: {
    id: 'restaurant',
    label: 'Restaurante',
    businessType: 'restaurant_pos',
    subtitle: 'Salón de mesas, mozos, cocina KDS, caja ciega e inventario por recetas.',
    supportsKitchenAutoPrint: true,
    baseFeatures: [
      'Reportes operativos básicos por turno',
      'Mapa de mesas, mozos y pantalla KDS de cocina',
      'Cierre de caja ciego y recetas de cocina',
      'Aislamiento multiempresa (1 sucursal activa)',
    ],
  },
  hamburger: {
    id: 'hamburger',
    label: 'Restaurante Rápido',
    businessType: 'hamburger_shop',
    subtitle: 'Mostrador ágil, tickets para llevar/delivery y pantalla de cocina KDS.',
    supportsKitchenAutoPrint: true,
    baseFeatures: [
      'Reportes operativos básicos por turno',
      'POS de mostrador rápido para pedidos en local, llevar y delivery',
      'Pantalla KDS de cocina y cierre de caja',
      'Aislamiento multiempresa (1 sucursal activa)',
    ],
  },
  distribution: {
    id: 'distribution',
    label: 'Distribuidora',
    businessType: 'route_distribution',
    subtitle: 'Despacho de carga por kilos/lotes, ventas en ruta, créditos y liquidación ciega.',
    supportsKitchenAutoPrint: false,
    baseFeatures: [
      'Reportes operativos básicos de despacho y ruta',
      'Carga de camión, ventas, cartera de créditos y liquidación ciega',
      'Control de kilos, lotes y mermas en ruta',
      'Aislamiento multiempresa (1 sucursal activa)',
    ],
  },
  nightclub: {
    id: 'nightclub',
    label: 'Nightclub & Lounge',
    businessType: 'nightclub_lounge',
    subtitle: 'Barras rápidas, cuentas por mesa/pulsera #tag e inventario de botellas en ml.',
    supportsKitchenAutoPrint: true,
    baseFeatures: [
      'Reportes operativos básicos de turno nocturno',
      'Barras rápidas sincronizadas dentro del local',
      'Cuentas por pulsera #tag, zonas VIP e inventario en ml',
      'Aislamiento multiempresa (1 sucursal activa)',
    ],
  },
  retail: {
    id: 'retail',
    label: 'Ventas Express',
    businessType: 'gelateria_weight_cafe',
    subtitle: 'Mostrador táctil de venta rápida por peso (kg/g) o unidad y cierre diario.',
    supportsKitchenAutoPrint: false,
    baseFeatures: [
      'Reportes operativos básicos de caja diaria',
      'POS táctil de mostrador para venta por peso o unidad',
      'Turnos y arqueo ciego de caja',
      'Aislamiento multiempresa (1 sucursal activa)',
    ],
  },
}

export const COMMERCIAL_CAPABILITY_CATALOG = [
  {
    key: 'reports.detailed' as const,
    label: 'Reportes detallados',
    featureBullet: 'Reportes detallados por período y desglose operativo',
    description: 'Habilita vistas históricas por período y desglose completo dentro de la plantilla.',
    requiresKitchenTemplate: false,
  },
  {
    key: 'reports.export' as const,
    label: 'Exportar informes (PDF y Excel)',
    featureBullet: 'Exportación de informes descargables en PDF y Excel',
    description: 'Permite descargar reportes completos en PDF y Excel desde Reports Core.',
    requiresKitchenTemplate: false,
  },
  {
    key: 'receipts.digital' as const,
    label: 'Recibos digitales / PDF',
    featureBullet: 'Emisión de recibos digitales en PDF para el cliente',
    description: 'Genera comprobantes digitales descargables y compartibles.',
    requiresKitchenTemplate: false,
  },
  {
    key: 'printing.manual' as const,
    label: 'Impresión manual de tickets',
    featureBullet: 'Impresión manual de comprobantes y resúmenes (sujeta a validación en equipo)',
    description: 'Habilita la vista e impresión manual desde navegador; no promete impresión silenciosa universal.',
    requiresKitchenTemplate: false,
  },
  {
    key: 'printing.kitchenAutomatic' as const,
    label: 'Impresión automática en cocina o barra',
    featureBullet: 'Comandas de impresión en cocina o barra compatible',
    description: 'Solo disponible para Restaurante, Restaurante Rápido y Nightclub.',
    requiresKitchenTemplate: true,
  },
] as const

export const UNAVAILABLE_OR_EXTRA_ITEMS: readonly { label: string; category: string }[] = [
  { label: 'Multi-sucursal o franquicias (>1 sucursal)', category: 'A medida / No certificado en V1' },
  { label: 'Facturación electrónica fiscal (SIN)', category: 'Desarrollo a medida / Extra cotizable' },
  { label: 'Pasarela automática de cobros o conciliación bancaria automática', category: 'Extra / Integración futura' },
  { label: 'WhatsApp API automatizado o bots de pedidos', category: 'Extra de automatización / A medida' },
  { label: 'Conexión API con ERP externo o hardware no validado', category: 'Desarrollo a medida' },
]

const UNSUPPORTED_PATTERNS: readonly { pattern: RegExp; reason: string }[] = [
  {
    pattern: /multi[\s-]?sucursal|franquicia|varias sucursales|múltiples locales|almacén centralizado|transferencias entre (locales|tiendas|sucursales)/i,
    reason: 'Promesa multi-sucursal no soportada (el límite técnico certificado actual es 1 sucursal por empresa).',
  },
  {
    pattern: /kios[ck]o|erp|conexión api|api contable|facturación electrónica|\bfactura\s+sin\b/i,
    reason: 'Menciona kioscos, ERP, API contable o facturación electrónica SIN, que no forman parte de un plan estándar.',
  },
  {
    pattern: /(usuarios|productos|sucursales|cajas|pantallas|rutas|terminales)\s+ilimitad/i,
    reason: 'Promete recursos ilimitados cuando el motor certifica cupos concretos (máx. 100 usuarios, 200 productos y 1 sucursal).',
  },
]

export function detectUnsupportedPlanClaims(plan: Pick<TemplateTierPlan, 'name' | 'clientProfile' | 'limitsLabel' | 'includedFeatures' | 'technicalEntitlements' | 'capabilitiesV1' | 'templateId'>): string[] {
  const errors: string[] = []
  if ((plan.technicalEntitlements || []).length > 0) {
    errors.push('Quita las etiquetas de "technicalEntitlements": Billing Core valida únicamente el contrato capabilitiesV1.')
  }
  const caps = plan.capabilitiesV1
  if (caps) {
    if (caps.limits.activeBranches > 1) {
      errors.push('Las sucursales activas deben ser exactamente 1 (multi-sucursal aún no está certificado).')
    }
    if (caps.limits.activeUsers < 1 || caps.limits.activeUsers > 100) {
      errors.push('Usuarios activos debe estar entre 1 y 100.')
    }
    if (caps.limits.activeProducts < 1 || caps.limits.activeProducts > 200) {
      errors.push('Productos activos debe estar entre 1 y 200.')
    }
    if (caps.features.printing.kitchenAutomatic && !TEMPLATE_GUIDANCE_BY_ID[plan.templateId].supportsKitchenAutoPrint) {
      errors.push(`La plantilla ${TEMPLATE_GUIDANCE_BY_ID[plan.templateId].label} no soporta impresión automática de cocina/barra.`)
    }
  }
  const fieldsToScan = [
    { label: 'Nombre del plan', text: plan.name || '' },
    { label: 'Perfil de cliente', text: plan.clientProfile || '' },
    { label: 'Resumen de límites', text: plan.limitsLabel || '' },
    ...(plan.includedFeatures || []).map((f, idx) => ({ label: `Beneficio #${idx + 1}`, text: f })),
  ]
  for (const item of fieldsToScan) {
    for (const rule of UNSUPPORTED_PATTERNS) {
      if (rule.pattern.test(item.text)) {
        errors.push(`${item.label} ("${item.text}"): ${rule.reason}`)
      }
    }
  }
  return errors
}

export function generatePlanLimitsLabel(caps?: CommercialCapabilitiesV1): string {
  const users = caps?.limits.activeUsers ?? 1
  const products = caps?.limits.activeProducts ?? 10
  return `1 sucursal · hasta ${users} ${users === 1 ? 'usuario' : 'usuarios'} · hasta ${products} productos`
}

export function buildVerifiedFeatureBullets(templateId: TemplateKey, caps: CommercialCapabilitiesV1): string[] {
  const info = TEMPLATE_GUIDANCE_BY_ID[templateId]
  const bullets = [...info.baseFeatures]
  if (caps.features.reports.detailed) {
    bullets.push('Reportes detallados por período y desglose operativo')
  }
  if (caps.features.reports.export) {
    bullets.push('Exportación de informes descargables en PDF y Excel')
  }
  if (caps.features.receipts.digital) {
    bullets.push('Emisión de recibos digitales en PDF para el cliente')
  }
  if (caps.features.printing.manual) {
    bullets.push('Impresión manual de tickets y resúmenes (sujeta a validación en equipo)')
  }
  if (caps.features.printing.kitchenAutomatic && info.supportsKitchenAutoPrint) {
    bullets.push('Impresión automática de cocina/barra compatible')
  }
  return bullets
}
