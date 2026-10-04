import type { TemplateKey } from '../public/config/pricingConfig'

export interface CommercialTemplateItem {
  id: string
  templateId: TemplateKey
  canonicalTemplateId: TemplateKey
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
  detailAnchor: string
  badge?: string
  status: 'published' | 'draft'
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

export interface TemplateTierPlan {
  id: string
  templateId: TemplateKey
  name: string
  tierLevel: 1 | 2 | 3
  monthlyPriceUSD: number
  annualPriceUSD: number
  currency: 'USD' | 'BOB'
  billingPeriod: 'monthly' | 'annual'
  badge?: string
  isPopular?: boolean
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
