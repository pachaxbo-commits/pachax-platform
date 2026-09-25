import type { StudioBranding } from '../studio/branding/brandingTypes'
import type { PublicTemplateId } from '../core/publicTemplates'

export type DemoTemplateId = PublicTemplateId

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
