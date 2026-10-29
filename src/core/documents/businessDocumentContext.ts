import { buildBusinessDocumentContext, normalizeBusinessIdentity, type BusinessDocumentContext, type BusinessIdentity } from '../businessIdentity.ts'

export interface DocumentBranchIdentity {
  name?: string
  tradeName?: string
  logoUrl?: string
  address?: string
  city?: string
  phone?: string
  taxId?: string
}

/** Resolves company branding with branch-level contact overrides for every document renderer. */
export function resolveBusinessDocumentContext(
  businessIdentity: Partial<BusinessIdentity> | undefined,
  branch?: DocumentBranchIdentity | null,
  overrides?: { companyName?: string; logoUrl?: string },
): BusinessDocumentContext {
  const identity = normalizeBusinessIdentity(businessIdentity)
  const companyName = overrides?.companyName || identity.tradeName
  return buildBusinessDocumentContext({
    ...identity,
    logoUrl: branch?.logoUrl || overrides?.logoUrl || identity.logoUrl,
    address: branch?.address || identity.address,
    city: branch?.city || identity.city,
    phone: branch?.phone || identity.phone,
    taxId: branch?.taxId || identity.taxId,
  }, { companyName, branchName: branch?.name || branch?.tradeName || 'Sucursal principal' })
}
