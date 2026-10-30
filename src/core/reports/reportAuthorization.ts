import { gateway } from '../../services/gateway'
import type { ReportCapability } from './reportCapabilities'

export type ReportAuthorizationCapability = ReportCapability | 'printing.manual'

/** Server authorization; UI capability checks are only a presentation aid. */
export function authorizeBusinessReportCapability(tenantId: string, branchId: string, feature: ReportAuthorizationCapability) {
  return gateway<{ authorized: true }>('tenantGateway', { action: 'authorizeReportCapability', tenantId, branchId, feature })
}
