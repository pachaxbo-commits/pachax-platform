import type { BusinessDocumentContext } from '../businessIdentity.ts'
import type { CanonicalReceiptData } from '../receiptService.ts'

export type BusinessDocumentKind = 'customer_receipt' | 'kitchen_ticket' | 'prebill' | 'payment_voucher' | 'digital_report'
const DOCUMENT_KINDS = new Set<BusinessDocumentKind>(['customer_receipt', 'kitchen_ticket', 'prebill', 'payment_voucher', 'digital_report'])

/** Shared document envelope. Template adapters keep their domain calculations and map only presentation data. */
export interface BusinessDocument<TPayload = CanonicalReceiptData> {
  schemaVersion: 1
  kind: BusinessDocumentKind
  tenantId: string
  branchId: string
  sourceId: string
  createdAt: string
  identity: BusinessDocumentContext
  payload: TPayload
}

export function makeBusinessDocument<TPayload>(input: Omit<BusinessDocument<TPayload>, 'schemaVersion'>): BusinessDocument<TPayload> {
  if (!input.tenantId.trim() || !input.branchId.trim() || !input.sourceId.trim()) {
    throw new Error('El documento requiere empresa, sucursal y una referencia de origen.')
  }
  if (!DOCUMENT_KINDS.has(input.kind)) throw new Error('El tipo de documento no es válido.')
  if (!input.identity?.companyName?.trim() || !input.identity?.branchName?.trim()) {
    throw new Error('El documento requiere la identidad de la empresa y sucursal.')
  }
  if (!Number.isFinite(Date.parse(input.createdAt))) throw new Error('La fecha del documento no es válida.')
  return { ...input, schemaVersion: 1 }
}
