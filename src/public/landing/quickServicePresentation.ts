import { getTemplate } from '../../core/templates.ts'
import type { Capability } from '../../core/platform.ts'

export type PublicCatalogStatus = 'loading' | 'ready' | 'error'
export type QuickServiceId = 'hamburger' | 'retail'
export type QuickServicePricingState = 'published' | 'editorial' | 'loading' | 'unverified' | 'unavailable'

const capabilityLabels: Partial<Record<Capability, string>> = {
  orders: 'Pedidos de mostrador y para llevar',
  kitchen: 'Gestión de cocina y preparación',
  cash: 'Caja y control de efectivo',
  inventory: 'Productos e inventario',
  sales: 'Registro de ventas',
  unitSales: 'Venta por unidad',
  weightSales: 'Venta por peso',
  reports: 'Reportes de ventas y caja',
}

const capabilityOrder: Record<QuickServiceId, Capability[]> = {
  hamburger: ['orders', 'kitchen', 'cash', 'inventory', 'unitSales', 'sales', 'reports'],
  retail: ['weightSales', 'unitSales', 'cash', 'inventory', 'sales', 'reports'],
}

/** Public editorial content is derived from the canonical business templates. */
export function getQuickServiceEditorialData(id: QuickServiceId) {
  const template = getTemplate(id === 'hamburger' ? 'hamburger_shop' : 'gelateria_weight_cafe')
  const capabilities = capabilityOrder[id]
    .filter((capability) => template.capabilities.includes(capability))
    .map((capability) => capabilityLabels[capability])
    .filter((label): label is string => Boolean(label))

  return {
    description: template.description,
    capabilities,
  }
}

/**
 * Classifies the public pricing panel without treating missing data as a valid
 * empty offer response. The editorial card is only used when a template exists
 * in the effective public catalog.
 */
export function getQuickServicePricingState(
  catalogStatus: PublicCatalogStatus,
  hasPublishedTemplate: boolean,
  hasApprovedOffers: boolean,
): QuickServicePricingState {
  if (!hasPublishedTemplate) {
    if (catalogStatus === 'ready') return 'unavailable'
    return catalogStatus === 'loading' ? 'loading' : 'unverified'
  }
  if (hasApprovedOffers) return 'published'
  if (catalogStatus === 'ready') return 'editorial'
  return catalogStatus === 'loading' ? 'loading' : 'unverified'
}
