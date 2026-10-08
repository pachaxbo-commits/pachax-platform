import type { NightclubDataset, NightclubShift } from './nightclubAccounts'
import { nightclubCashSummary } from './nightclubAccounts.ts'

export type NightclubClosureStatus = 'balanced' | 'surplus' | 'legacy_shortage'
export interface NightclubClosureFilters { from: string; to: string; cashier: string; status: 'all' | NightclubClosureStatus }
export interface NightclubClosureRecord {
  shift: NightclubShift
  status: NightclubClosureStatus
  expectedCash: number
  countedCash: number
  difference: number
  totalSales: number
  incomeTotal: number
  expenseTotal: number
  cashIncome: number
  cashOutflow: number
}

const roundMoney = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100

export function selectNightclubShiftClosures(dataset: NightclubDataset, filters: NightclubClosureFilters): NightclubClosureRecord[] {
  const shifts = [...(dataset.shiftHistory || []), ...(dataset.shift ? [dataset.shift] : [])]
  return shifts.filter(shift => shift.status === 'closed' && !!shift.closedAt).map(shift => {
    const summary = nightclubCashSummary(dataset, shift.id)
    const movements = (dataset.cashMovements || []).filter(item => item.shiftId === shift.id)
    const expectedCash = shift.expectedCash ?? summary.expectedCash
    const countedCash = shift.countedCash ?? 0
    const difference = shift.difference ?? roundMoney(countedCash - expectedCash)
    const status: NightclubClosureStatus = difference < 0 ? 'legacy_shortage' : difference > 0 ? 'surplus' : 'balanced'
    return {
      shift, status, expectedCash, countedCash, difference,
      totalSales: shift.totalSales ?? summary.totalSales,
      incomeTotal: shift.incomeTotal ?? roundMoney(movements.filter(item => item.type === 'income').reduce((sum, item) => sum + item.amount, 0)),
      expenseTotal: shift.expenseTotal ?? roundMoney(movements.filter(item => item.type === 'expense').reduce((sum, item) => sum + item.amount, 0)),
      cashIncome: shift.cashIncome ?? summary.cashIncome,
      cashOutflow: shift.cashOutflow ?? summary.cashOutflow,
    }
  }).filter(row => {
    const closedDate = row.shift.closedAt!.slice(0, 10)
    return (!filters.from || closedDate >= filters.from) && (!filters.to || closedDate <= filters.to) && (!filters.cashier || row.shift.closedBy === filters.cashier) && (filters.status === 'all' || row.status === filters.status)
  }).sort((a, b) => Date.parse(b.shift.closedAt!) - Date.parse(a.shift.closedAt!))
}
