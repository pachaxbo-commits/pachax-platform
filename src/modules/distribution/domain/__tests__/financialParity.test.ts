import { analyzeCustomerStatement, buildCustomerStatement } from '../customerStatement.ts'
import { assertCompleteStatementHistory, fetchCompleteStatementPages } from '../../data/statementPaging.ts'
import { originalLotQuantity, summarizeLotsByProductLocation } from '../lotSummary.ts'
import type { DistCollection, DistLot, DistReceivable, DistStockMovement } from '../../types.ts'

const assert = (condition: unknown, message: string) => { if (!condition) throw new Error(message) }

const debt = (id: string, at: string, amount: number): DistReceivable => ({
  id, tenantId: 'tenant', branchId: 'main', createdBy: 'admin', schemaVersion: 2, saleId: id, customerId: 'customer', customerName: 'Cliente', routeId: 'central',
  distributorUid: 'seller', distributorName: 'Vendedor', originalAmount: amount, paidAmount: 0,
  balance: amount, status: 'OPEN', createdAt: at, dayKey: at.slice(0, 10), saleLines: [],
})
const debts = [debt('old-sale', '2024-01-01T10:00:00Z', 50), debt('new-sale', '2025-01-01T10:00:00Z', 25)]
const payments: DistCollection[] = [
  { id: 'cash-1', tenantId: 'tenant', branchId: 'main', createdBy: 'admin', dayKey: '2024-02-01', schemaVersion: 2, operationId: 'cash-1', customerId: 'customer', customerName: 'Cliente', routeId: 'central', collectedByUid: 'admin', collectedByName: 'Admin', amount: 20, cashAmount: 20, qrAmount: 0, method: 'cash', createdAt: '2024-02-01T10:00:00Z', allocations: [{ receivableId: 'old-sale', appliedAmount: 20 }] },
  { id: 'qr-1', tenantId: 'tenant', branchId: 'main', createdBy: 'admin', dayKey: '2025-02-01', schemaVersion: 2, operationId: 'qr-1', customerId: 'customer', customerName: 'Cliente', routeId: 'central', collectedByUid: 'admin', collectedByName: 'Admin', amount: 50, cashAmount: 0, qrAmount: 50, method: 'qr', createdAt: '2025-02-01T10:00:00Z', allocations: [{ receivableId: 'old-sale', appliedAmount: 25 }, { receivableId: 'new-sale', appliedAmount: 25 }] },
]
const claims = [{ id: 'claim', kind: 'return' as const, saleId: 'old-sale', customerId: 'customer', customerName: 'Cliente', productId: 'p', productName: 'Producto', quantity: 1, unitType: 'unit' as const, reason: 'Devolución parcial', routeId: 'central', createdAt: '2024-03-01T10:00:00Z', dayKey: '2024-03-01', revenueDelta: -5, additionalCost: 0, debtReduction: 5, cashIn: 0, cashOut: 0, qrIn: 0, qrOut: 0, replacement: null }]
const statement = buildCustomerStatement(debts, payments, claims)
assert(JSON.stringify(statement.map(row => row.balance)) === JSON.stringify([50, 30, 25, 50, 25, 0]), 'balance progresses across old sales, cash/QR payments and an adjustment')
assert(statement.at(-1)?.method === 'QR', 'second payment method appears')
assert(statement.at(-1)?.balance === 0, 'current chronological balance is correct')
assert(statement.length === 6, 'history contains both old and current credit sales, collections and adjustment')
const unassigned = analyzeCustomerStatement(debts, [...payments, { ...payments[0], id: 'legacy-no-debt', receivableId: 'missing-debt', allocations: undefined, amount: 7, createdAt: '2025-03-01T10:00:00Z' }], claims)
assert(unassigned.warnings.some(warning => warning.includes('legacy-no-debt')), 'legacy payment without a matching debt remains visible as a reconciliation warning')
assert(unassigned.movements.some(row => row.reference === 'legacy-no-debt' && row.unallocatedAmount === 7), 'unassigned legacy payment amount is not silently discarded')

const paged = await fetchCompleteStatementPages(async (cursor: number | undefined, pageSize) => {
  const offset = cursor || 0
  const rows = Array.from({ length: Math.min(pageSize, 251 - offset) }, (_, index) => offset + index)
  return { rows, nextCursor: offset + rows.length, hasMore: offset + rows.length < 251 }
})
assert(paged.length === 251 && paged[250] === 250, 'history pagination returns every row beyond the 250-document page limit')
let offlineFailed = false
try { await fetchCompleteStatementPages(async () => { throw Object.assign(new Error('offline'), { code: 'unavailable' }) }) }
catch { offlineFailed = true }
assert(offlineFailed, 'offline history read rejects instead of returning a cached partial statement')
let partialExportFailed = false
try { assertCompleteStatementHistory({ complete: false }) }
catch (error) { partialExportFailed = (error as Error).message.includes('historial') }
assert(partialExportFailed, 'statement export refuses history not explicitly marked complete')

const lots: DistLot[] = [
  { id: 'lot-a', tenantId: 'tenant', productId: 'p', productName: 'Producto', unitType: 'unit', lotCode: 'A', manufacturedOn: '', expiresOn: '', productionCost: 2, quantities: { central: 4, warehouse__w1: 3 }, createdAt: '', createdBy: '' },
  { id: 'lot-b', tenantId: 'tenant', productId: 'p', productName: 'Producto', unitType: 'unit', lotCode: 'B', manufacturedOn: '', expiresOn: '', productionCost: null, quantities: { central: 1 }, createdAt: '', createdBy: '' },
]
const copy = structuredClone(lots)
const summary = summarizeLotsByProductLocation(lots)
assert(summary.find(row => row.locationId === 'central')?.quantity === 5, 'lots are consolidated by product and location')
assert(summary.find(row => row.locationId === 'central')?.estimatedValue === null, 'unknown costs are not estimated')
assert(summary.find(row => row.locationId === 'warehouse__w1')?.estimatedValue === 6, 'known lot cost values available stock')
const intake: DistStockMovement = { id: 'intake', tenantId: 'tenant', branchId: 'main', createdBy: 'admin', dayKey: '2025-01-01', schemaVersion: 2, createdAt: '', type: 'intake', productId: 'p', productName: 'Producto', unitType: 'unit', quantity: 10, centralDelta: 10, routeDelta: 0, lotId: 'lot-a' }
assert(originalLotQuantity(lots[0], [intake]) === 10, 'original intake is read from the lot ledger')
assert(originalLotQuantity(lots[1], [intake]) === null, 'missing historical intake stays unknown')
assert(JSON.stringify(lots) === JSON.stringify(copy), 'summary and report inputs remain unchanged')
console.log('PASS distribution financial parity (customer statement history + non-mutating lot summaries)')
