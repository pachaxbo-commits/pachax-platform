import type { StudioBranding } from '../studio/branding/brandingTypes'

export type DemoTemplateId = 'restaurant' | 'distribution' | 'retail'

export type DemoMode = 'team' | 'simulated_role'

export interface DemoConfig {
  templateId: DemoTemplateId
  title: string
  subtitle: string
  companyName: string
  isPublicDemo?: boolean
  initialRole?: string
  branding?: StudioBranding
}
