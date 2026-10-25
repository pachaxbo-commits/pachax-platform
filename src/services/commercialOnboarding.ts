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

/** Records a non-binding commercial interest. It never provisions a tenant or grants entitlements. */
export function submitCommercialInterest(input: CommercialInterestRequest) {
  return gateway<CommercialInterestResponse>('tenantGateway', {
    action: 'submitCommercialInterest',
    ...input,
  })
}
