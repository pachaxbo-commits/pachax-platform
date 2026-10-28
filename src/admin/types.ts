import type { TemplateKey } from '../public/config/pricingConfig'

export interface CommercialTemplateItem {
  id: string
  templateId: TemplateKey | 'custom'
  canonicalTemplateId: TemplateKey | null
  commercialName: string
  cardSubtitle: string
  thumbnailUrl: string
  thumbnailAlt: string
  thumbnailFocalPoint: string
  accent: string
  description: string
  detailDescription: string
  targetAudience: string
  problemSolved: string
  bullets: string[]
  features: string[]
  demoRoute: string
  demoPath: string
  demoEnabled?: boolean
  demoEnabledConfigured?: boolean
  detailAnchor: string
  badge?: string
  status: 'published' | 'draft'
  commercialAvailability?: 'available' | 'coming_soon'
  commercialMode?: 'specialized' | 'self_service'
  implementationBasePriceUSD?: number | null
  diagnosticTitle?: string
  diagnosticDescription?: string
  implementationTitle?: string
  implementationDescription?: string
  order: number
  primaryActionLabel: string
  iconType: 'utensils' | 'truck' | 'glass' | 'shopping-bag' | 'settings'
  visualSlot: {
    accentColor: string
    glowColor: string
    gradientClass: string
    pillBgClass: string
  }
}

export type PlanKind = 'free' | 'paid'

export interface TemplateTierPlan {
  id: string
  templateId: TemplateKey
  name: string
  planKind: PlanKind
  priceApproval?: 'pending' | 'approved'
  tierLevel?: 1 | 2 | 3
  monthlyPriceUSD: number
  annualPriceUSD: number
  currency: 'USD' | 'BOB'
  billingPeriod: 'monthly' | 'annual'
  badge?: string
  isPopular?: boolean
  adsRequired?: boolean
  clientProfile: string
  limitsLabel?: string
  includedFeatures: string[]
  technicalEntitlements: string[]
  ctaLabel: string
  status: 'published' | 'draft'
  order: number
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

export interface LandingContentConfig {
  heroTagline: string
  heroTitle: string
  heroSubtitle: string
  heroCtaPrimary: string
  heroCtaSecondary: string
  officialWhatsAppNumber: string
  officialWhatsAppDisplay: string
  defaultCustomDevMessage: string
  valueStripMetrics: {
    label: string
    value: string
    detail: string
  }[]
  sectionTitles: {
    catalog: string
    catalogSubtitle: string
    pricing: string
    pricingSubtitle: string
    onboarding: string
    onboardingSubtitle: string
    tutorials: string
    tutorialsSubtitle: string
    extras: string
    extrasSubtitle: string
  }
}

export interface MediaAssetItem {
  id: string
  name: string
  url: string
  category: 'showcase' | 'brand' | 'icon'
  recommendedTemplate?: TemplateKey
  focalPointDefault: string
}
