import { gateway } from './gateway'

export interface CommercialInterestRequest {
  requestId: string
  templateId: 'restaurant' | 'hamburger' | 'distribution' | 'nightclub' | 'retail'
  companyName: string
  contactPhone?: string
  needs?: string
  planId?: string
}

export interface CommercialInterestResponse {
  success: true
  intentId: string
  status: 'new'
  idempotent: boolean
}

export interface PublicCommercialInterestRequest {
  requestId: string
  contactName: string
  companyName: string
  email?: string
  contactPhone?: string
  templateId: 'restaurant' | 'hamburger' | 'distribution' | 'nightclub' | 'retail'
  businessType: string
  needs?: string
  branchCount?: number
  planId?: string
  consent: true
  website?: string
}

export interface PublicCommercialCatalog {
  templates: Array<Record<string, unknown> & { id: string; status: 'published' }>
  plans: Array<Record<string, unknown> & { id: string; templateId: string; status: 'published' }>
  extras: Array<Record<string, unknown> & { id: string; status: 'published' }>
  mediaAssets: Array<Record<string, unknown> & { id: string }>
  landingContent: Record<string, unknown>
  fetchedAt: string
}

export function getPublicCommercialCatalog() {
  return gateway<PublicCommercialCatalog>('publicCommercialGateway', { action: 'getCatalog' })
}

export function submitPublicCommercialInterest(input: PublicCommercialInterestRequest) {
  return gateway<{ success: true; status: 'accepted'; idempotent: boolean }>('publicCommercialGateway', {
    action: 'submitInterest',
    ...input,
  })
}

/** Records a non-binding commercial interest. It never provisions a tenant or grants entitlements. */
export function submitCommercialInterest(input: CommercialInterestRequest) {
  return gateway<CommercialInterestResponse>('tenantGateway', {
    action: 'submitCommercialInterest',
    ...input,
  })
}
