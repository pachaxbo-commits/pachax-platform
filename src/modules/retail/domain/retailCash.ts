import type { RetailCashClosure, RetailCashMovement, RetailCashSession, RetailSale } from '../data/retailRepository'

export function expectedRetailCash(session: Pick<RetailCashSession,'openingFloatMinor'|'cashSalesMinor'|'manualInflowMinor'|'manualOutflowMinor'>) {
  const components=[session.openingFloatMinor,session.cashSalesMinor,session.manualInflowMinor,session.manualOutflowMinor]
  if(components.some(value=>!Number.isSafeInteger(value)||value<0)) throw new Error('El efectivo esperado no es válido.')
  const expected = session.openingFloatMinor + session.cashSalesMinor + session.manualInflowMinor - session.manualOutflowMinor
  if (!Number.isSafeInteger(expected) || expected < 0) throw new Error('El efectivo esperado no es válido.')
  return expected
}

export interface RetailCashCommandAttempt<T> { operationId:string; payload:T }
export function resolveRetailCashAttempt<T>(payload:T,previous:RetailCashCommandAttempt<T>|null,createId:()=>string=()=>crypto.randomUUID()):RetailCashCommandAttempt<T>{
  return previous??{operationId:createId(),payload:structuredClone(payload)}
}
export function isUncertainRetailCommandError(error:unknown):boolean{
  if(!error||typeof error!=='object')return true
  const code='code' in error&&typeof error.code==='string'?error.code.replace(/^functions\//,''):''
  if(!code)return true
  return ['unavailable','deadline-exceeded','unknown','cancelled','internal','aborted'].includes(code)
}

export function retailCashReconciliation(session: RetailCashSession, countedCashMinor: number) {
  if (!Number.isSafeInteger(countedCashMinor) || countedCashMinor < 0) throw new Error('El efectivo contado debe ser un importe válido.')
  const expectedCashMinor = expectedRetailCash(session)
  return { expectedCashMinor, countedCashMinor, differenceMinor: countedCashMinor - expectedCashMinor }
}

export interface RetailSalesReport {
  totalSalesMinor: number
  cashSalesMinor: number
  qrSalesMinor: number
  cashOnlySalesMinor: number
  qrOnlySalesMinor: number
  mixedCashMinor: number
  mixedQrMinor: number
  changeMinor: number
  salesCount: number
  cashCount: number
  qrCount: number
  mixedCount: number
  products: Array<{ productId: string; name: string; unit: 'g'|'unit'; quantity: number; subtotalMinor: number }>
  operators: Array<{ uid: string; salesCount: number; totalMinor: number }>
}

export function summarizeRetailSales(sales: RetailSale[]): RetailSalesReport {
  const products = new Map<string, RetailSalesReport['products'][number]>()
  const operators = new Map<string, RetailSalesReport['operators'][number]>()
  const report: RetailSalesReport = { totalSalesMinor: 0, cashSalesMinor: 0, qrSalesMinor: 0, cashOnlySalesMinor: 0, qrOnlySalesMinor: 0, mixedCashMinor: 0, mixedQrMinor: 0, changeMinor: 0, salesCount: sales.length, cashCount: 0, qrCount: 0, mixedCount: 0, products: [], operators: [] }
  for (const sale of sales) {
    report.totalSalesMinor += sale.totalMinor
    report.cashSalesMinor += sale.payment.cashMinor
    report.qrSalesMinor += sale.payment.qrMinor
    report.changeMinor += sale.payment.changeMinor
    if (sale.payment.method === 'cash') { report.cashCount += 1; report.cashOnlySalesMinor += sale.totalMinor }
    if (sale.payment.method === 'qr') { report.qrCount += 1; report.qrOnlySalesMinor += sale.totalMinor }
    if (sale.payment.method === 'mixed') { report.mixedCount += 1; report.mixedCashMinor += sale.payment.cashMinor; report.mixedQrMinor += sale.payment.qrMinor }
    if (sale.actorUid) {
      const row = operators.get(sale.actorUid) || { uid: sale.actorUid, salesCount: 0, totalMinor: 0 }
      row.salesCount += 1; row.totalMinor += sale.totalMinor; operators.set(sale.actorUid, row)
    }
    for (const line of sale.items) {
      const unit = line.unit === 'g' ? 'g' : 'unit', key = `${line.productId}:${unit}`
      const row = products.get(key) || { productId: line.productId, name: line.productNameSnapshot, unit, quantity: 0, subtotalMinor: 0 }
      row.quantity += line.quantity; row.subtotalMinor += line.subtotalMinor; products.set(key, row)
    }
  }
  if ([report.totalSalesMinor,report.cashSalesMinor,report.qrSalesMinor,report.cashOnlySalesMinor,report.qrOnlySalesMinor,report.mixedCashMinor,report.mixedQrMinor,report.changeMinor].some(value=>!Number.isSafeInteger(value))) throw new Error('Los totales del reporte exceden el rango permitido.')
  report.products = [...products.values()].sort((a,b)=>b.subtotalMinor-a.subtotalMinor)
  report.operators = [...operators.values()].sort((a,b)=>b.totalMinor-a.totalMinor)
  return report
}

export function summarizeRetailCashHistory(sessions: RetailCashSession[], closures: RetailCashClosure[], movements: RetailCashMovement[]) {
  const closedById = new Map(closures.map(closure=>[closure.shiftId,closure]))
  return sessions.map(session=>({session,closure:closedById.get(session.shiftId)||null,movements:movements.filter(movement=>movement.shiftId===session.shiftId)}))
}

export function retailQuantityLabel(quantity:number,unit:'g'|'unit') {
  return unit==='g'?`${(quantity/1000).toLocaleString('es-BO',{maximumFractionDigits:3})} kg`:`${quantity.toLocaleString('es-BO')} u.`
}
