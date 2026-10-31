import type { BusinessType, Tenant } from '../../src/core/platform.ts'
import { activateTenant, clearActiveTenant } from '../../src/store/activeTenant.ts'

export function activateDocumentTestTenant(
  tenantId: string,
  businessType: BusinessType,
  branchId = 'branch-main',
  features: { digitalReceipts?: boolean; manualPrinting?: boolean } = {},
) {
  const tenant: Tenant = {
    tenantId,
    name: `QA ${businessType}`,
    businessType,
    ownerUid: `owner-${tenantId}`,
    status: 'active',
    branding: { primary: '#123456', accent: '#abcdef' },
    configuration: { currency: 'BOB', currencySymbol: 'Bs', timezone: 'America/La_Paz', features: {}, trackStock: true, allowNegativeStock: false, ticketWidth: 80, paymentMethods: ['cash', 'qr', 'mixed'] },
    entitlements: {},
    billingEnforcement: true,
    commercialCapabilities: {
      version: 1,
      businessType,
      limits: { activeUsers: 10, activeProducts: 100, activeBranches: 3 },
      features: {
        reports: { basic: true, detailed: true, export: true },
        receipts: { digital: features.digitalReceipts === true },
        printing: { manual: features.manualPrinting === true, kitchenAutomatic: false },
        adsRequired: false,
      },
    },
    planKey: 'qa-document-test',
    subscriptionStatus: 'active',
    schemaVersion: 1,
    templateVersion: 1,
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
  }
  activateTenant(tenant, { tenantId, uid: tenant.ownerUid, roleId: 'owner', status: 'active', branchIds: [branchId], routeIds: [] })
  return tenant
}

export function resetDocumentTestTenant() {
  clearActiveTenant()
}
