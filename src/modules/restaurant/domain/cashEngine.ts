import type { Order } from '../../../types'

export type CashMovementType = 'income' | 'expense'
export type CashPaymentMethod = 'cash' | 'qr' | 'card' | 'other'
export type CashMovementCategory = 'supply_purchase' | 'worker_payment' | 'supplier_payment' | 'transport' | 'maintenance' | 'services' | 'additional_cash' | 'change_replenishment' | 'other'
export interface CashMovement { id: string; shiftId: string; type: CashMovementType; category: CashMovementCategory; description: string; amount: number; paymentMethod: CashPaymentMethod; createdAt: string; createdBy: string; note?: string; supplier?: string; workerId?: string }
export interface CashShiftSummary { cashSales: number; qrSales: number; cardSales: number; totalSales: number; cashIncome: number; cashOutflow: number; totalExpenses: number; expectedCash: number }

const round = (amount: number) => Math.round((amount + Number.EPSILON) * 100) / 100

export function calculateCashShiftSummary(openingFloat: number, orders: Order[], shiftId: string, movements: CashMovement[]): CashShiftSummary {
  let cashSales = 0, qrSales = 0, cardSales = 0
  for (const order of orders.filter(item => item.shiftId === shiftId && item.paymentStatus === 'paid')) {
    if (order.payments?.length) for (const payment of order.payments) { if (payment.method === 'cash') cashSales += payment.amount; if (payment.method === 'qr') qrSales += payment.amount; if (payment.method === 'card') cardSales += payment.amount }
    else { cashSales += order.payment?.cashAmount || 0; qrSales += order.payment?.qrAmount || 0; cardSales += order.payment?.cardAmount || 0 }
  }
  const current = movements.filter(item => item.shiftId === shiftId)
  const cashIncome = current.filter(item => item.type === 'income' && item.paymentMethod === 'cash').reduce((sum, item) => sum + item.amount, 0)
  const cashOutflow = current.filter(item => item.type === 'expense' && item.paymentMethod === 'cash').reduce((sum, item) => sum + item.amount, 0)
  const totalExpenses = current.filter(item => item.type === 'expense').reduce((sum, item) => sum + item.amount, 0)
  return { cashSales: round(cashSales), qrSales: round(qrSales), cardSales: round(cardSales), totalSales: round(cashSales + qrSales + cardSales), cashIncome: round(cashIncome), cashOutflow: round(cashOutflow), totalExpenses: round(totalExpenses), expectedCash: round(openingFloat + cashSales + cashIncome - cashOutflow) }
}

export function closingDifference(expectedCash: number, countedCash: number) { return round(countedCash - expectedCash) }
