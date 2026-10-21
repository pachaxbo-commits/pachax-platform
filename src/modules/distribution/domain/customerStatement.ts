import { round2 } from './engine.ts'
import type { DistClaim, DistCollection, DistReceivable, DistSale } from '../types.ts'

export interface CustomerStatementMovement {
  id: string
  at: string
  kind: 'credit' | 'payment' | 'adjustment'
  reference: string
  route: string
  detail: string
  debit: number
  credit: number
  method: string
  note: string
  balance: number
}

/** Rebuilds a customer's ledger from the full authorized records, not a UI date range. */
export function buildCustomerStatement(
  receivables: DistReceivable[],
  collections: DistCollection[],
  claims: DistClaim[],
  sales: DistSale[] = [],
): CustomerStatementMovement[] {
  const debtBySale = new Map(receivables.map(row => [row.saleId || row.id, row]))
  const saleById = new Map(sales.map(row => [row.id, row]))
  const events: Omit<CustomerStatementMovement, 'balance'>[] = []
  for (const debt of receivables) {
    events.push({
      id: `credit:${debt.id}`, at: debt.createdAt, kind: 'credit', reference: debt.saleId || debt.id,
      route: saleById.get(debt.saleId)?.routeName || debt.routeId || 'Sin ruta',
      detail: (saleById.get(debt.saleId)?.lines || debt.saleLines || []).map(line => `${line.quantity} ${line.unitType} ${line.productNameSnapshot}`).join('; ') || 'Venta a crédito',
      debit: round2(debt.originalAmount), credit: 0, method: '', note: debt.note || '',
    })
  }
  for (const collection of collections.filter(row => !row.pendingConfirmation)) {
    const allocations = collection.allocations?.length
      ? collection.allocations
      : [{ receivableId: collection.receivableId || '', appliedAmount: collection.amount }]
    for (const [index, allocation] of allocations.entries()) {
      const debt = receivables.find(row => row.id === allocation.receivableId)
      if (!debt) continue
      const paymentMethod = collection.method === 'mixed'
        ? `Mixto · efectivo Bs ${round2(collection.cashAmount || 0)} + QR Bs ${round2(collection.qrAmount || 0)}`
        : collection.method === 'qr' ? 'QR' : 'Efectivo'
      events.push({
        id: `payment:${collection.id}:${index}`, at: collection.createdAt, kind: 'payment',
        reference: collection.id, route: allocation.originRouteId || collection.originRouteId || collection.routeId || debt.routeId || 'Sin ruta',
        detail: `Cobro de ${collection.collectedByName || 'Administración'}${allocations.length > 1 ? ` · ${index + 1}/${allocations.length}` : ''}`,
        debit: 0, credit: round2(allocation.appliedAmount), method: paymentMethod, note: collection.note || '',
      })
    }
  }
  for (const claim of claims) {
    const debt = debtBySale.get(claim.saleId)
    const amount = round2(Math.max(0, claim.debtReduction || 0))
    if (!debt || amount <= 0) continue
    events.push({
      id: `adjustment:${claim.id}`, at: claim.createdAt, kind: 'adjustment', reference: claim.id,
      route: claim.routeId || debt.routeId || 'Sin ruta',
      detail: `${claim.kind === 'exchange' ? 'Cambio' : 'Devolución'} · ${claim.productName}`,
      debit: 0, credit: amount, method: 'Ajuste autorizado', note: claim.reason || '',
    })
  }
  events.sort((a, b) => a.at.localeCompare(b.at) || (a.kind === 'credit' ? -1 : b.kind === 'credit' ? 1 : a.id.localeCompare(b.id)))
  let balance = 0
  return events.map(event => {
    balance = round2(balance + event.debit - event.credit)
    return { ...event, balance }
  })
}

