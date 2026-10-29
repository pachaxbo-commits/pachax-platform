import type { TemplateTierPlan } from '../types'
import type { TemplateKey } from '../../public/config/pricingConfig'

export function defaultCapabilities(templateId: TemplateKey, planKind: 'free' | 'paid'): NonNullable<TemplateTierPlan['capabilitiesV1']> {
  const businessTypeByTemplate: Record<TemplateKey, string> = {
    restaurant: 'restaurant_pos',
    hamburger: 'hamburger_shop',
    distribution: 'route_distribution',
    nightclub: 'nightclub_lounge',
    retail: 'gelateria_weight_cafe',
  }
  return {
    version: 1,
    businessType: businessTypeByTemplate[templateId],
    limits: { activeUsers: 1, activeProducts: 10, activeBranches: 1 },
    features: {
      reports: { basic: true, detailed: false, export: false },
      receipts: { digital: templateId === 'nightclub' },
      // New plans do not advertise printing as an included benefit by default.
      // An authorized owner can enable a supported capability explicitly.
      printing: { manual: false, kitchenAutomatic: false },
      adsRequired: planKind === 'free',
    },
  }
}
