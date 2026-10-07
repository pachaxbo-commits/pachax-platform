import type { NightclubAccount, NightclubDataset, NightclubPayment, NightclubRoundItem, NightclubShift } from './nightclubAccounts'
import { nightclubAccountLabel, nightclubAccountTableId, nightclubBalance, nightclubPaidTotal, normalizeNightclubRole } from './nightclubAccounts.ts'

export interface NightclubHistoryFilters {
  shiftId: string
  from: string
  to: string
  query: string
  table: string
  waiter: string
  product: string
  category: string
  paymentMethod: string
  status: string
  user: string
}
export interface NightclubHistoryEntry {
  id: string; at: string; type: 'opened' | 'sale' | 'courtesy' | 'cancelled' | 'returned' | 'payment' | 'refund' | 'closed' | 'bill' | 'reopened' | 'preparation' | 'delivery'
  text: string; actor: string; waiter: string; productId?: string; productName?: string; category?: string
  quantity?: number; unitPrice?: number; amount?: number; commercialValue?: number; reason?: string; payment?: NightclubPayment; preparationArea?: 'Barra' | 'Directo'
}
export interface NightclubHistoryAccount { account: NightclubAccount; label: string; shift?: NightclubShift; entries: NightclubHistoryEntry[] }
const round = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100
const dateKey = (value: string) => { const date = new Date(value); return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}` }
const accountPayments = (account: NightclubAccount) => account.payments?.length ? account.payments : account.payment ? [account.payment] : []
const activeItem = (item: NightclubRoundItem, roundStatus: string) => roundStatus !== 'cancelled' && item.status !== 'cancelled' && item.status !== 'returned'

export function nightclubBusinessShifts(dataset: NightclubDataset): NightclubShift[] {
  return [...(dataset.shiftHistory || []), ...(dataset.shift ? [dataset.shift] : [])].sort((a, b) => b.openedAt.localeCompare(a.openedAt))
}

export function nightclubAccountShift(account: NightclubAccount, shifts: NightclubShift[]): NightclubShift | undefined {
  return shifts.find(shift => shift.id === account.shiftId) || shifts.find(shift => account.openedAt >= shift.openedAt && (!shift.closedAt || account.openedAt <= shift.closedAt))
}

export function nightclubAccountTimeline(account: NightclubAccount, dataset: NightclubDataset): NightclubHistoryEntry[] {
  const waiter = account.waiterName || account.openedBy
  const entries: NightclubHistoryEntry[] = [{ id: `open:${account.id}`, at: account.openedAt, type: 'opened', text: 'Cuenta abierta', actor: account.openedBy, waiter }]
  for (const batch of account.rounds) {
    if (batch.status === 'delivered' && batch.deliveredAt) entries.push({ id: `delivery:${batch.id}`, at: batch.deliveredAt, type: 'delivery', text: `Ronda #${batch.sequence} entregada`, actor: batch.deliveredBy || 'Barra', waiter })
    for (const item of batch.items) {
      const courtesy = item.kind === 'courtesy' || batch.authorization === 'courtesy' || !!item.courtesyId
      entries.push({ id: `item:${item.id}`, at: batch.createdAt, type: courtesy ? 'courtesy' : 'sale', text: courtesy ? 'Cortesía autorizada' : 'Producto pagado', actor: batch.sentBy || account.openedBy, waiter, productId: item.productId, productName: item.name, category: item.category, quantity: item.quantity, unitPrice: item.unitPrice, amount: item.lineTotal, commercialValue: item.commercialValue ?? item.unitPrice * item.quantity, preparationArea: item.preparationArea })
      const reversedAt = item.cancelledAt || (batch.status === 'cancelled' ? batch.cancelledAt : undefined)
      if (reversedAt) entries.push({ id: `reverse:${item.id}`, at: reversedAt, type: item.status === 'returned' ? 'returned' : 'cancelled', text: item.status === 'returned' ? 'Devolución' : 'Anulación / reembolso', actor: item.cancelledBy || batch.cancelledBy || dataset.audit?.find(event => ['round_cancelled', 'round_refunded'].includes(event.type) && event.details?.roundId === batch.id)?.actor || 'Equipo', waiter, productId: item.productId, productName: item.name, category: item.category, quantity: item.quantity, unitPrice: item.unitPrice, amount: item.lineTotal, commercialValue: item.commercialValue ?? item.unitPrice * item.quantity, reason: item.cancelReason || batch.cancellationReason || dataset.audit?.find(event => ['round_cancelled', 'round_refunded'].includes(event.type) && event.details?.roundId === batch.id)?.details?.reason?.toString(), preparationArea: item.preparationArea })
    }
  }
  for (const payment of accountPayments(account)) {
    entries.push({ id: `payment:${payment.id || payment.paidAt}`, at: payment.paidAt, type: 'payment', text: 'Pago registrado', actor: payment.paidBy, waiter, amount: payment.amount ?? payment.cashAmount + payment.qrAmount + payment.cardAmount, payment })
    if (payment.status === 'refunded' && payment.refundedAt) entries.push({ id: `refund:${payment.id || payment.paidAt}`, at: payment.refundedAt, type: 'refund', text: 'Pago reembolsado', actor: payment.refundedBy || 'Administración', waiter, amount: payment.amount, reason: payment.refundReason })
  }
  for (const event of dataset.audit || []) {
    if (event.accountId !== account.id) continue
    const type = event.type === 'bill_requested' ? 'bill' : event.type === 'bill_reopened' ? 'reopened' : event.type === 'round_status_changed' ? 'preparation' : undefined
    if (type) entries.push({ id: `audit:${event.id}`, at: event.at, type, text: event.type === 'bill_requested' ? 'Cuenta solicitada' : event.type === 'bill_reopened' ? 'Cuenta reabierta' : `Ronda ${event.details?.status || ''}`, actor: event.actor, waiter })
  }
  if (account.paidAt) entries.push({ id: `closed:${account.id}`, at: account.paidAt, type: 'closed', text: 'Cuenta cerrada', actor: account.closedBy || account.payment?.paidBy || 'Caja', waiter })
  const order = (entry: NightclubHistoryEntry) => entry.type === 'opened' ? 0 : entry.type === 'payment' ? 1 : entry.type === 'closed' ? 2 : 1
  return entries.sort((a, b) => a.at.localeCompare(b.at) || order(a) - order(b) || a.id.localeCompare(b.id))
}

export function selectNightclubHistory(dataset: NightclubDataset, filters: NightclubHistoryFilters, viewer?: { role: string; actor: string }) {
  const shifts = nightclubBusinessShifts(dataset)
  const lower = (value: string) => value.trim().toLocaleLowerCase()
  const accounts = dataset.accounts.flatMap(account => {
    const shift = nightclubAccountShift(account, shifts)
    if (filters.shiftId && filters.shiftId !== 'all' && shift?.id !== filters.shiftId) return []
    const businessDate = dateKey(shift?.openedAt || account.openedAt)
    if (filters.from && businessDate < filters.from || filters.to && businessDate > filters.to) return []
    if (viewer && ['waiter', 'service'].includes(normalizeNightclubRole(viewer.role)) && lower(account.waiterName || account.openedBy) !== lower(viewer.actor)) return []
    if (viewer && normalizeNightclubRole(viewer.role) === 'bar' && !account.rounds.some(batch => batch.items.some(item => item.preparationArea === 'Barra'))) return []
    const label = nightclubAccountLabel(account, dataset)
    const entries = nightclubAccountTimeline(account, dataset)
    const payments = accountPayments(account)
    if (filters.table && !lower(label).includes(lower(filters.table))) return []
    if (filters.waiter && !lower(account.waiterName || account.openedBy).includes(lower(filters.waiter))) return []
    if (filters.product && !entries.some(entry => entry.productId === filters.product)) return []
    if (filters.category && !entries.some(entry => lower(entry.category || '') === lower(filters.category))) return []
    if (filters.paymentMethod && !payments.some(payment => payment.method === filters.paymentMethod || filters.paymentMethod === 'cash' && payment.cashAmount > 0 || filters.paymentMethod === 'qr' && payment.qrAmount > 0 || filters.paymentMethod === 'card' && payment.cardAmount > 0)) return []
    if (filters.status && filters.status !== 'all' && (filters.status === 'courtesy' ? !entries.some(entry => entry.type === 'courtesy') : filters.status === 'cancelled' ? !entries.some(entry => entry.type === 'cancelled') : filters.status === 'returned' ? !entries.some(entry => entry.type === 'returned') : account.status !== filters.status)) return []
    if (filters.user && !entries.some(entry => lower(entry.actor).includes(lower(filters.user)))) return []
    if (filters.query && !lower(`${label} ${account.openedBy} ${account.waiterName || ''} ${entries.map(entry => `${entry.productName || ''} ${entry.actor} ${entry.text}`).join(' ')}`).includes(lower(filters.query))) return []
    return [{ account, label, shift, entries }]
  }).sort((a, b) => b.account.openedAt.localeCompare(a.account.openedAt))
  const tableAccounts = accounts.filter(row => !!nightclubAccountTableId(row.account))
  const lines = accounts.flatMap(row => row.account.rounds.flatMap(batch => batch.items.map(item => ({ row, batch, item }))))
  const sold = lines.filter(({ item, batch }) => item.kind !== 'courtesy' && batch.authorization !== 'courtesy' && activeItem(item, batch.status))
  const courtesy = lines.filter(({ item, batch }) => (item.kind === 'courtesy' || batch.authorization === 'courtesy' || !!item.courtesyId) && activeItem(item, batch.status))
  const cancelled = lines.filter(({ item, batch }) => !activeItem(item, batch.status) && item.status !== 'returned')
  const summary = {
    salesTotal: round(accounts.reduce((sum, row) => sum + nightclubPaidTotal(row.account), 0)),
    tablesServed: new Set(tableAccounts.map(row => nightclubAccountTableId(row.account))).size,
    openTables: tableAccounts.filter(row => row.account.status !== 'closed').length,
    productsSold: sold.reduce((sum, line) => sum + line.item.quantity, 0),
    courtesyValue: round(courtesy.reduce((sum, line) => sum + (line.item.commercialValue ?? line.item.unitPrice * line.item.quantity), 0)),
    cancelledValue: round(cancelled.reduce((sum, line) => sum + (line.item.commercialValue ?? line.item.lineTotal), 0)),
    averageTicket: tableAccounts.filter(row => row.account.status === 'closed').length ? round(tableAccounts.filter(row => row.account.status === 'closed').reduce((sum, row) => sum + nightclubPaidTotal(row.account), 0) / tableAccounts.filter(row => row.account.status === 'closed').length) : 0,
    pendingTotal: round(accounts.reduce((sum, row) => sum + nightclubBalance(row.account), 0)),
  }
  const productLocations = new Map<string, { productId: string; name: string; quantity: number; places: Map<string, number> }>()
  for (const { row, item } of sold) {
    const current = productLocations.get(item.productId) || { productId: item.productId, name: item.name, quantity: 0, places: new Map<string, number>() }
    current.quantity += item.quantity
    current.places.set(row.label, (current.places.get(row.label) || 0) + item.quantity)
    productLocations.set(item.productId, current)
  }
  return { accounts, summary, productLocations: [...productLocations.values()].map(item => ({ ...item, places: [...item.places].map(([label, quantity]) => ({ label, quantity })) })).sort((a, b) => b.quantity - a.quantity) }
}
