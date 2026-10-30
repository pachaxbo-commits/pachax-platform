import type { Tenant } from '../platform.ts'
import { isDemoModeActive } from '../../demo/core/demoContext.ts'

export type ReportCapability = 'reports.basic' | 'reports.detailed' | 'reports.export'

const FEATURE_BY_CAPABILITY = {
  'reports.basic': 'basic',
  'reports.detailed': 'detailed',
  'reports.export': 'export',
} as const

/** Legacy tenants preserve access. Missing tenant context is allowed only by the isolated demo runtime. */
export function canUseReportCapability(tenant: Tenant | null | undefined, capability: ReportCapability): boolean {
  if (!tenant) return isDemoModeActive()
  if (tenant.billingEnforcement !== true) return true
  return tenant.commercialCapabilities?.version === 1
    && tenant.commercialCapabilities.businessType === tenant.businessType
    && tenant.commercialCapabilities.features.reports[FEATURE_BY_CAPABILITY[capability]] === true
}
