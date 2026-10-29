import type { Tenant } from '../platform.ts'
import { isDemoModeActive } from '../../demo/core/demoContext.ts'

export type DocumentCapability = 'receipts.digital' | 'printing.manual' | 'printing.kitchenAutomatic'

export function requiredPrintCapability(targetType: string, executionMode?: 'manual' | 'automatic'): DocumentCapability {
  return executionMode === 'automatic' && (targetType === 'kitchen_ticket' || targetType === 'bar_ticket')
    ? 'printing.kitchenAutomatic'
    : 'printing.manual'
}

/** Legacy tenants retain their existing document workflows. Enforced tenants use the server-issued snapshot. */
export function canUseDocumentCapability(
  tenant: Tenant | null | undefined,
  capability: DocumentCapability,
): boolean {
  // Missing tenant context is not evidence of an unrestricted tenant. The only
  // null-context exception is the isolated, in-memory demo entrypoint.
  if (!tenant) return isDemoModeActive()
  if (tenant.billingEnforcement !== true) return true
  const features = tenant.commercialCapabilities?.features
  if (!features) return false
  if (capability === 'receipts.digital') return features.receipts?.digital === true
  if (capability === 'printing.manual') return features.printing?.manual === true
  return features.printing?.kitchenAutomatic === true
}

export function assertDocumentCapability(
  tenant: Tenant | null | undefined,
  capability: DocumentCapability,
): void {
  if (!canUseDocumentCapability(tenant, capability)) {
    throw new Error('Esta función de documentos no está incluida en las capacidades activas de la empresa.')
  }
}
