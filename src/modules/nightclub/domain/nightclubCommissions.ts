import type { NightclubCommissionPaymentDraft, NightclubDataset, NightclubRound, NightclubRoundItem } from './nightclubAccounts'

const round = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100
const itemActive = (item: NightclubRoundItem) => item.status !== 'cancelled' && item.status !== 'returned'
const commissionId = (roundId: string, itemId: string) => `commission:${roundId}:${itemId}`
const paidForRound = (account: NightclubDataset['accounts'][number], targetRound: NightclubRound) => round((account.payments || []).filter(payment => payment.status !== 'refunded' && payment.kind !== 'pending_electronic_refund').reduce((sum, payment) => sum + (payment.allocations?.filter(item => item.roundId === targetRound.id).reduce((inner, item) => inner + item.amount, 0) || (payment.roundId === targetRound.id ? payment.amount || 0 : 0)), 0))
const totalOf = (round: NightclubRound) => round.items.filter(itemActive).reduce((sum, item) => sum + item.lineTotal, 0)

/** Reconciles commission records from the canonical rounds. It never recalculates a saved snapshot. */
export function synchronizeNightclubCommissions(dataset: NightclubDataset, now = new Date().toISOString()) {
  dataset.commissions ||= []
  for (const account of dataset.accounts) for (const roundEntry of account.rounds) for (const item of roundEntry.items) {
    const id = commissionId(roundEntry.id, item.id)
    const existing = dataset.commissions.find(entry => entry.id === id)
    if (!item.commissionSnapshot || !roundEntry.serviceStaffId || item.kind === 'courtesy') continue
    if (!itemActive(item) || roundEntry.status === 'cancelled') {
      if (existing && existing.status !== 'void') { existing.status = 'void'; existing.voidedAt = now; existing.voidReason = item.cancelReason || roundEntry.cancellationReason || 'Venta anulada o cambiada' }
      continue
    }
    if (paidForRound(account, roundEntry) + 0.001 < totalOf(roundEntry)) continue
    const amount = round(item.commissionSnapshot.type === 'percentage' ? item.lineTotal * item.commissionSnapshot.value / 100 : item.commissionSnapshot.value * item.quantity)
    if (!existing) dataset.commissions.push({ id, accountId: account.id, roundId: roundEntry.id, itemId: item.id, productId: item.productId, productName: item.name, staffId: roundEntry.serviceStaffId, staffName: roundEntry.serviceStaffName || 'Servicio', quantity: item.quantity, saleAmount: item.lineTotal, type: item.commissionSnapshot.type, value: item.commissionSnapshot.value, amount, paidAmount: 0, status: roundEntry.status === 'delivered' ? 'earned' : 'pending', shiftId: account.shiftId || dataset.shift?.id, createdAt: now, ...(roundEntry.status === 'delivered' ? { earnedAt: now } : {}) })
    else if (existing.status === 'pending' && roundEntry.status === 'delivered') { existing.status = 'earned'; existing.earnedAt = now }
  }
  return dataset
}

export function nightclubCommissionSummary(dataset: NightclubDataset, staffId?: string) {
  const rows = (dataset.commissions || []).filter(entry => !staffId || entry.staffId === staffId)
  const generated = round(rows.filter(entry => ['pending','earned','paid'].includes(entry.status)).reduce((sum, entry) => sum + entry.amount, 0))
  const paid = round(rows.reduce((sum, entry) => sum + entry.paidAmount, 0))
  const pending = round(rows.filter(entry => entry.status !== 'void').reduce((sum, entry) => sum + Math.max(0, entry.amount - entry.paidAmount), 0))
  return { rows, generated, paid, pending }
}

export function payNightclubCommissions(dataset: NightclubDataset, draft: NightclubCommissionPaymentDraft, actor: string, now = new Date().toISOString()) {
  if (!['cash','qr','card','other'].includes(draft.method) || !Number.isFinite(draft.amount) || draft.amount <= 0) throw new Error('Ingresa un pago de comisi�n v�lido.')
  if (!dataset.staff?.some(person => person.id === draft.staffId && person.role === 'service')) throw new Error('Selecciona un trabajador de Servicio.')
  if (draft.operationId && dataset.commissionPayments?.some(payment => payment.id === draft.operationId)) return dataset
  const next = structuredClone(dataset); const candidates = (next.commissions || []).filter(entry => entry.staffId === draft.staffId && ['earned','paid'].includes(entry.status) && entry.paidAmount < entry.amount && (!draft.commissionIds?.length || draft.commissionIds.includes(entry.id)))
  let remaining = round(draft.amount); if (round(candidates.reduce((sum, entry) => sum + entry.amount - entry.paidAmount, 0)) + 0.001 < remaining) throw new Error('El pago supera el saldo pendiente de comisiones.')
  const paymentId = draft.operationId || crypto.randomUUID(); const settled: string[] = []
  for (const entry of candidates) { if (remaining <= 0) break; const applied = Math.min(remaining, round(entry.amount - entry.paidAmount)); entry.paidAmount = round(entry.paidAmount + applied); entry.status = entry.paidAmount >= entry.amount ? 'paid' : 'earned'; entry.paymentIds = [...(entry.paymentIds || []), paymentId]; remaining = round(remaining - applied); settled.push(entry.id) }
  next.commissionPayments = [...(next.commissionPayments || []), { id: paymentId, staffId: draft.staffId, amount: draft.amount, method: draft.method, at: now, actor, shiftId: next.shift?.id, note: draft.note?.trim() || undefined, commissionIds: settled }]
  if (next.shift?.status === 'open') next.cashMovements = [...(next.cashMovements || []), { id: `commission:${paymentId}`, shiftId: next.shift.id, type: 'expense', method: draft.method === 'other' ? 'qr' : draft.method, amount: draft.amount, description: 'Pago de comisiones de Servicio', category: 'other', notes: draft.note, at: now, actor, commissionPaymentId: paymentId }]
  return next
}