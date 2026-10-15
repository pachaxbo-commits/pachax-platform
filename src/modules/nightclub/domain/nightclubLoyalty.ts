import type { NightclubDataset } from './nightclubAccounts'
import { normalizeNightclubBirthday } from './nightclubCustomers.ts'

const cents = (value: number) => Math.round((value + Number.EPSILON) * 100)
export interface NightclubLoyaltyRow { customerId: string; monthSpent: number; totalSpent: number; monthVisits: number | null; visits: number | null; frequent: boolean }
/** Counts one visit per customer and shift, never one per round. Unknown shift means unknown visits. */
export function nightclubLoyaltyReport(dataset: NightclubDataset, year: number, month: number): NightclubLoyaltyRow[] {
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) throw new Error('Mes inválido.')
  const ids = new Set(dataset.customers.map(item => item.id))
  const rows = new Map<string, { total: number; month: number; visits: Set<string>; monthVisits: Set<string>; unknownVisit: boolean; unknownMonthVisit: boolean }>()
  const seen = new Set<string>()
  const period = `${year}-${String(month).padStart(2, '0')}`
  for (const account of dataset.accounts) {
    const payments = account.payments?.length ? account.payments : account.payment ? [account.payment] : []
    for (const payment of payments) {
      if (payment.status === 'refunded' || !payment.paidAt) continue
      const key = payment.id || payment.operationId
      if (key && seen.has(key)) continue
      if (key) seen.add(key)
      const amount = payment.amount ?? payment.cashAmount + payment.qrAmount + payment.cardAmount
      const legacyRound = payment.roundId ? account.rounds.find(item => item.id === payment.roundId) : undefined
      const allocations = payment.allocations || (legacyRound ? [{ roundId: legacyRound.id, customerId: legacyRound.customerId === undefined ? account.customerId || null : legacyRound.customerId, amount }] : account.rounds.every(item => item.customerId === undefined) && account.customerId ? [{ roundId: '', customerId: account.customerId, amount }] : [])
      for (const allocation of allocations) {
        if (!allocation.customerId || !ids.has(allocation.customerId)) continue
        const round = allocation.roundId ? account.rounds.find(item => item.id === allocation.roundId) : undefined
        if (allocation.roundId && (!round || round.status === 'cancelled' || round.authorization === 'courtesy')) continue
        const paid = (payment.kind === 'exchange_refund' ? -1 : 1) * cents(allocation.amount)
        if (!Number.isFinite(paid) || paid === 0) continue
        const row = rows.get(allocation.customerId) || { total: 0, month: 0, visits: new Set<string>(), monthVisits: new Set<string>(), unknownVisit: false, unknownMonthVisit: false }
        row.total += paid
        const current = payment.paidAt.slice(0, 7) === period
        if (current) row.month += paid
        if (account.shiftId) {
          row.visits.add(account.shiftId)
          if (current) row.monthVisits.add(account.shiftId)
        } else {
          row.unknownVisit = true
          if (current) row.unknownMonthVisit = true
        }
        rows.set(allocation.customerId, row)
      }
    }
  }
  return dataset.customers.map(customer => {
    const row = rows.get(customer.id)
    const visits = row?.unknownVisit ? null : row?.visits.size || 0
    return { customerId: customer.id, monthSpent: (row?.month || 0) / 100, totalSpent: (row?.total || 0) / 100, monthVisits: row?.unknownMonthVisit ? null : row?.monthVisits.size || 0, visits, frequent: visits !== null && visits >= 3 }
  }).sort((a, b) => b.monthSpent - a.monthSpent || a.customerId.localeCompare(b.customerId))
}

/** Uses explicit calendar parts; UTC is only used for day-count arithmetic. */
export function upcomingNightclubBirthday(birthday: string | undefined, today: string): number | null {
  const value = normalizeNightclubBirthday(birthday)
  const current = normalizeNightclubBirthday(today)
  if (!value || !current) return null
  const year = Number(current.slice(0, 4)), month = Number(value.slice(5, 7)), day = Number(value.slice(8, 10))
  const base = Date.UTC(year, Number(current.slice(5, 7)) - 1, Number(current.slice(8, 10)))
  for (let candidate = year; candidate <= year + 8; candidate++) {
    const next = Date.UTC(candidate, month - 1, day)
    if (new Date(next).getUTCMonth() !== month - 1 || new Date(next).getUTCDate() !== day || next < base) continue
    return Math.round((next - base) / 86400000)
  }
  return null
}