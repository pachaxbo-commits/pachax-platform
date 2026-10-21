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
  unallocatedAmount?: number
  warning?: string
}

export interface CustomerStatementAnalysis {
  movements: CustomerStatementMovement[]
  currentBalance: number
  ledgerBalance: number
  reconciled: boolean
  warnings: string[]
}

/** Rebuilds a customer's ledger from the full authorized records, not a UI date range. */
export function buildCustomerStatement(
  receivables: DistReceivable[],
  collections: DistCollection[],
  claims: DistClaim[],
  sales: DistSale[] = [],
): CustomerStatementMovement[] {
  return analyzeCustomerStatement(receivables, collections, claims, sales).movements
}

export function analyzeCustomerStatement(
  receivables: DistReceivable[],
  collections: DistCollection[],
  claims: DistClaim[],
  sales: DistSale[] = [],
): CustomerStatementAnalysis {
  const debtBySale = new Map(receivables.map(row => [row.saleId || row.id, row]))
  const debtById = new Map(receivables.map(row => [row.id, row]))
  const saleById = new Map(sales.map(row => [row.id, row]))
  const events: Omit<CustomerStatementMovement, 'balance'>[] = []
  const warnings: string[] = []
  const eventDate = (createdAt: string | undefined, day: string | undefined, id: string) => {
    if (createdAt) return createdAt
    warnings.push(`El movimiento ${id} no tiene hora histórica; se ordenó por su día registrado.`)
    return day ? `${day}T00:00:00.000Z` : '1970-01-01T00:00:00.000Z'
  }
  for (const debt of receivables) {
    events.push({
      id: `credit:${debt.id}`, at: eventDate(debt.createdAt, debt.dayKey, debt.id), kind: 'credit', reference: debt.saleId || debt.id,
      route: saleById.get(debt.saleId)?.routeName || debt.routeId || 'Sin ruta',
      detail: (saleById.get(debt.saleId)?.lines || debt.saleLines || []).map(line => `${line.quantity} ${line.unitType} ${line.productNameSnapshot}`).join('; ') || 'Venta a crédito',
      debit: round2(debt.originalAmount), credit: 0, method: '', note: debt.note || '',
    })
  }
  for (const collection of collections.filter(row => !row.pendingConfirmation)) {
    const allocations = collection.allocations?.length
      ? collection.allocations
      : [{ receivableId: collection.receivableId || '', appliedAmount: collection.amount }]
    let allocatedTotal = 0
    for (const [index, allocation] of allocations.entries()) {
      const debt = debtById.get(allocation.receivableId)
      const appliedAmount = round2(Math.max(0, Number(allocation.appliedAmount) || 0))
      allocatedTotal = round2(allocatedTotal + appliedAmount)
      const paymentMethod = collection.method === 'mixed'
        ? `Mixto · efectivo Bs ${round2(collection.cashAmount || 0)} + QR Bs ${round2(collection.qrAmount || 0)}`
        : collection.method === 'qr' ? 'QR' : 'Efectivo'
      events.push({
        id: `payment:${collection.id}:${index}`, at: eventDate(collection.createdAt, collection.dayKey, collection.id), kind: 'payment',
        reference: collection.id, route: allocation.originRouteId || collection.originRouteId || collection.routeId || debt?.routeId || 'Sin ruta',
        detail: `Cobro de ${collection.collectedByName || 'Administración'}${allocations.length > 1 ? ` · ${index + 1}/${allocations.length}` : ''}${debt ? '' : ' · ASIGNACIÓN SIN DEUDA ASOCIADA'}`,
        debit: 0, credit: appliedAmount, method: paymentMethod, note: collection.note || '',
        ...(!debt ? { unallocatedAmount: appliedAmount, warning: `No se encontró la deuda ${allocation.receivableId || '(sin identificador)'}.` } : {}),
      })
      if (!debt) warnings.push(`El cobro ${collection.id} tiene un abono no asociado a una deuda cargada.`)
    }
    const collectionTotal = round2(Math.max(0, Number(collection.amount) || 0))
    if (collectionTotal > allocatedTotal + 0.009) {
      const unallocated = round2(collectionTotal - allocatedTotal)
      events.push({
        id: `payment:${collection.id}:unallocated`, at: eventDate(collection.createdAt, collection.dayKey, collection.id), kind: 'payment',
        reference: collection.id, route: collection.routeId || 'Sin ruta', detail: 'Cobro con saldo sin asignación registrada',
        debit: 0, credit: unallocated, method: collection.method || 'Sin método', note: collection.note || '',
        unallocatedAmount: unallocated, warning: 'El importe no coincide con las asignaciones guardadas.',
      })
      warnings.push(`El cobro ${collection.id} tiene ${unallocated.toFixed(2)} Bs sin asignación registrada.`)
    } else if (allocatedTotal > collectionTotal + 0.009) {
      warnings.push(`Las asignaciones del cobro ${collection.id} superan el importe cobrado.`)
    }
  }
  for (const claim of claims) {
    const debt = debtBySale.get(claim.saleId)
    const amount = round2(Math.max(0, claim.debtReduction || 0))
    if (!debt && amount > 0) warnings.push(`El ajuste ${claim.id} no se pudo asociar a la deuda de la venta ${claim.saleId}.`)
    if (amount <= 0 && !(claim.cashIn || claim.cashOut || claim.qrIn || claim.qrOut)) continue
    events.push({
      id: `adjustment:${claim.id}`, at: eventDate(claim.createdAt, claim.dayKey, claim.id), kind: 'adjustment', reference: claim.id,
      route: claim.routeId || debt?.routeId || 'Sin ruta',
      detail: `${claim.kind === 'exchange' ? 'Cambio' : 'Devolución'} · ${claim.productName}${!debt ? ' · AJUSTE SIN DEUDA ASOCIADA' : ''}${claim.cashOut ? ` · devolución efectivo Bs ${round2(claim.cashOut)}` : ''}${claim.qrOut ? ` · devolución QR Bs ${round2(claim.qrOut)}` : ''}${claim.cashIn ? ` · cobro efectivo Bs ${round2(claim.cashIn)}` : ''}${claim.qrIn ? ` · cobro QR Bs ${round2(claim.qrIn)}` : ''}`,
      debit: 0, credit: amount, method: claim.method || 'Ajuste autorizado', note: claim.reason || '',
      ...(!debt && amount > 0 ? { unallocatedAmount: amount, warning: `No se encontró la deuda de la venta ${claim.saleId}.` } : {}),
    })
  }
  events.sort((a, b) => a.at.localeCompare(b.at) || (a.kind === 'credit' ? -1 : b.kind === 'credit' ? 1 : a.id.localeCompare(b.id)))
  let balance = 0
  const movements = events.map(event => {
    balance = round2(balance + event.debit - event.credit)
    return { ...event, balance }
  })
  const currentBalance = round2(receivables.reduce((sum, row) => sum + (Number(row.balance) || 0), 0))
  const ledgerBalance = movements.at(-1)?.balance || 0
  const reconciled = Math.abs(ledgerBalance - currentBalance) < 0.01 && warnings.length === 0
  if (Math.abs(ledgerBalance - currentBalance) >= 0.01) warnings.push(`El saldo progresivo (${ledgerBalance.toFixed(2)} Bs) no coincide con la cartera actual (${currentBalance.toFixed(2)} Bs).`)
  return { movements, currentBalance, ledgerBalance, reconciled, warnings }
}

