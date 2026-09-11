import type { TenantScopedEntity } from '../types'

export type CashSessionStatus = 'open' | 'closing' | 'closed' | 'cancelled'

export type CashMovementType =
  | 'opening'
  | 'sale'
  | 'income'
  | 'expense'
  | 'withdrawal'
  | 'cashIn'
  | 'refund'
  | 'tip'
  | 'adjustment'
  | 'closingDifference'

export interface CashRegister extends Partial<TenantScopedEntity> {
  id: string
  restaurantId: string
  branchId: string
  name: string
  code: string
  assignedTerminalIds: string[]
  isActive: boolean
  createdAt: string
  updatedAt?: string
  schemaVersion: number
}

export interface DenominationDetail {
  denominationValue: number // e.g. 200, 100, 50, 20, 10, 5, 2, 1, 0.5
  count: number
  subtotal: number
}

export interface CashSession extends Partial<TenantScopedEntity> {
  id: string
  restaurantId: string
  branchId: string
  cashRegisterId: string
  terminalId: string
  openedByUid: string
  openedAtIso: string
  openingAmount: number
  status: CashSessionStatus
  closedByUid?: string
  closedAtIso?: string
  expectedCash?: number
  countedCash?: number
  difference?: number
  differenceReason?: string
  isBlindClosure?: boolean
  approvedByUid?: string
  notes?: string
  denominations?: DenominationDetail[]
  snapshotData?: Record<string, any>
  schemaVersion: number
}

export interface CashMovement extends Partial<TenantScopedEntity> {
  id: string
  restaurantId: string
  branchId: string
  cashRegisterId: string
  cashSessionId: string
  type: CashMovementType
  amount: number
  paymentMethod: 'cash' | 'qr' | 'card' | 'transfer' | 'other'
  category: string
  description: string
  orderId?: string
  paymentId?: string
  createdByUid: string
  createdAtIso: string
  approvedByUid?: string
  status: 'active' | 'voided'
}

export interface CashShiftSummary {
  openingAmount: number
  totalSalesCash: number
  totalSalesQr: number
  totalSalesCard: number
  totalSalesOther: number
  totalSalesGrand: number
  totalIncomeCash: number
  totalExpenseCash: number
  totalWithdrawalsCash: number
  totalRefundsCash: number
  totalTipsCash: number
  expectedCash: number
  countedCash?: number
  difference?: number
  differenceType?: 'exact' | 'sobrante' | 'faltante'
  isWithinTolerance?: boolean
}
