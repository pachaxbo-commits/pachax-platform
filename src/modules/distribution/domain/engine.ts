import type {
  DistClosureProductRow,
  DistCollection,
  DistDispatch,
  DistExpense,
  DistPhysicalReturnBreakdown,
  DistSale,
  DistSaleLine,
  PaymentKind,
  UnitType,
} from '../types'

/** Redondeo monetario/cantidad a 2 decimales para evitar ruido de punto flotante */
export function round2(value: number): number {
  const r = Math.round((Number(value) || 0) * 100) / 100
  return r === 0 ? 0 : r
}

export function toDayKey(value: string | number | Date = new Date()): string {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function centralBalanceId(productId: string): string {
  return `central__${productId}`
}

export function routeBalanceId(routeId: string, productId: string): string {
  return `route__${routeId}__${productId}`
}

export function formatQuantity(quantity: number, unitType: UnitType): string {
  const value = round2(quantity)
  if (unitType === 'kg') return `${value} kg`
  if (unitType === 'package') return `${value} paq`
  return `${value} u`
}

export type VarianceKind = 'FALTANTE' | 'SOBRANTE' | 'CUADRADO'

export interface VarianceLabel {
  kind: VarianceKind
  /** Magnitud absoluta, siempre positiva: nunca mostramos signos ambiguos */
  amount: number
}

export function describeVariance(variance: number): VarianceLabel {
  const value = round2(variance)
  if (value < 0) return { kind: 'FALTANTE', amount: Math.abs(value) }
  if (value > 0) return { kind: 'SOBRANTE', amount: value }
  return { kind: 'CUADRADO', amount: 0 }
}

export interface LoadedTotals {
  initialDispatch: number
  additions: number
  totalLoaded: number
  productName: string
  unitType: UnitType
  initialNormalDispatch?: number
  initialDispatchMerma?: number
  initialPhysicalDispatch?: number
  additionsNormal?: number
  additionsMerma?: number
  additionsPhysical?: number
  totalLoadedPhysical?: number
}

/** totalLoaded = carga inicial + aumentos, por producto */
export function computeLoadedByProduct(dispatch: DistDispatch | null): Map<string, LoadedTotals> {
  const result = new Map<string, LoadedTotals>()
  if (!dispatch) return result

  for (const line of dispatch.lines || []) {
    const normal = line.normalQuantity ?? line.quantity
    const merma = line.dispatchMerma ?? 0
    const physical = line.physicalQuantity ?? round2(normal + merma)
    const current = result.get(line.productId)
    result.set(line.productId, {
      productName: line.productName,
      unitType: line.unitType,
      initialDispatch: round2((current?.initialDispatch ?? 0) + physical),
      initialNormalDispatch: round2((current?.initialNormalDispatch ?? 0) + normal),
      initialDispatchMerma: round2((current?.initialDispatchMerma ?? 0) + merma),
      initialPhysicalDispatch: round2((current?.initialPhysicalDispatch ?? 0) + physical),
      additions: current?.additions ?? 0,
      additionsNormal: current?.additionsNormal ?? 0,
      additionsMerma: current?.additionsMerma ?? 0,
      additionsPhysical: current?.additionsPhysical ?? 0,
      totalLoaded: round2((current?.totalLoaded ?? 0) + physical),
      totalLoadedPhysical: round2((current?.totalLoadedPhysical ?? 0) + physical),
    })
  }

  for (const addition of dispatch.additions || []) {
    for (const line of addition.quantityByProduct || []) {
      const normal = line.normalQuantity ?? line.quantity
      const merma = line.dispatchMerma ?? 0
      const physical = line.physicalQuantity ?? round2(normal + merma)
      const current = result.get(line.productId)
      result.set(line.productId, {
        productName: line.productName,
        unitType: line.unitType,
        initialDispatch: current?.initialDispatch ?? 0,
        initialNormalDispatch: current?.initialNormalDispatch ?? 0,
        initialDispatchMerma: current?.initialDispatchMerma ?? 0,
        initialPhysicalDispatch: current?.initialPhysicalDispatch ?? 0,
        additions: round2((current?.additions ?? 0) + physical),
        additionsNormal: round2((current?.additionsNormal ?? 0) + normal),
        additionsMerma: round2((current?.additionsMerma ?? 0) + merma),
        additionsPhysical: round2((current?.additionsPhysical ?? 0) + physical),
        totalLoaded: round2((current?.totalLoaded ?? 0) + physical),
        totalLoadedPhysical: round2((current?.totalLoadedPhysical ?? 0) + physical),
      })
    }
  }

  return result
}

export interface SoldTotals {
  productName: string
  unitType: UnitType
  quantity: number
  amount: number
}

export function computeSoldByProduct(sales: DistSale[]): Map<string, SoldTotals> {
  const result = new Map<string, SoldTotals>()
  for (const sale of sales) {
    for (const line of sale.lines || []) {
      const current = result.get(line.productId)
      result.set(line.productId, {
        productName: line.productNameSnapshot,
        unitType: line.unitType,
        quantity: round2((current?.quantity ?? 0) + line.quantity),
        amount: round2((current?.amount ?? 0) + line.subtotal),
      })
    }
  }
  return result
}

/**
 * Conciliacion fisica por producto.
 * expectedReturn = totalLoaded - sold ; variance = actualReturn - expectedReturn
 */
export function buildReconciliation(
  dispatch: DistDispatch | null,
  sales: DistSale[],
  actualReturns: Record<string, number | DistPhysicalReturnBreakdown> = {},
): DistClosureProductRow[] {
  const loaded = computeLoadedByProduct(dispatch)
  const sold = computeSoldByProduct(sales)

  const productIds = new Set<string>([...loaded.keys(), ...sold.keys()])

  return Array.from(productIds)
    .map((productId) => {
      const load = loaded.get(productId)
      const sale = sold.get(productId)
      const totalLoaded = load?.totalLoaded ?? 0
      const soldQty = sale?.quantity ?? 0
      const expectedReturn = round2(totalLoaded - soldQty)
      const rawReturn = actualReturns[productId]

      let actualReturn = 0
      let returnMerma = 0
      let returnWaste = 0
      let returnWasteReason = ''
      let totalPhysicalReturn = 0
      let hasBreakdown = false

      if (rawReturn !== undefined && rawReturn !== null) {
        if (typeof rawReturn === 'number') {
          actualReturn = round2(rawReturn)
          totalPhysicalReturn = actualReturn
        } else if (typeof rawReturn === 'object') {
          hasBreakdown = true
          actualReturn = round2(rawReturn.normalReturn || 0)
          returnMerma = round2(rawReturn.recoverableMerma || 0)
          returnWaste = round2(rawReturn.nonSellableReturn || 0)
          returnWasteReason = rawReturn.nonSellableReason || ''
          totalPhysicalReturn = round2(actualReturn + returnMerma + returnWaste)
        }
      }

      const variance = round2(totalPhysicalReturn - expectedReturn)
      const shortage = round2(Math.max(0, expectedReturn - totalPhysicalReturn))
      const overage = round2(Math.max(0, totalPhysicalReturn - expectedReturn))

      return {
        productId,
        productName: load?.productName ?? sale?.productName ?? productId,
        unitType: load?.unitType ?? sale?.unitType ?? ('unit' as UnitType),
        initialDispatch: load?.initialDispatch ?? 0,
        additions: load?.additions ?? 0,
        totalLoaded,
        sold: soldQty,
        expectedReturn,
        actualReturn: hasBreakdown ? round2(actualReturn + returnMerma) : actualReturn,
        variance,
        initialNormalDispatch: load?.initialNormalDispatch ?? load?.initialDispatch ?? 0,
        initialDispatchMerma: load?.initialDispatchMerma ?? 0,
        initialPhysicalDispatch: load?.initialPhysicalDispatch ?? load?.initialDispatch ?? 0,
        additionsNormal: load?.additionsNormal ?? load?.additions ?? 0,
        additionsMerma: load?.additionsMerma ?? 0,
        additionsPhysical: load?.additionsPhysical ?? load?.additions ?? 0,
        totalLoadedPhysical: load?.totalLoadedPhysical ?? load?.totalLoaded ?? 0,
        returnMerma: returnMerma > 0 ? returnMerma : undefined,
        returnWaste: returnWaste > 0 ? returnWaste : undefined,
        returnWasteReason: returnWasteReason || undefined,
        shortage,
        overage,
        warehouse: hasBreakdown
          ? {
              normal: actualReturn,
              recoverableMerma: returnMerma,
              nonSellable: returnWaste,
              nonSellableReason: returnWasteReason,
              totalPhysical: totalPhysicalReturn,
            }
          : undefined,
      }
    })
    .sort((a, b) => a.productName.localeCompare(b.productName))
}

export interface MoneySummary {
  salesTotal: number
  cashSales: number
  qrSales: number
  creditGenerated: number
  cashCollections: number
  qrCollections: number
  collectionsTotal: number
  cashExpenses: number
  expectedCash: number
}

/**
 * Dinero del arqueo.
 * expectedCash = ventas en efectivo + cobros en efectivo - gastos en efectivo.
 * QR y credito NO entran al efectivo fisico. Los cobros NO suman a salesTotal.
 */
export function computeMoneySummary(
  sales: DistSale[],
  collections: DistCollection[],
  expenses: DistExpense[],
): MoneySummary {
  let cashSales = 0
  let qrSales = 0
  let creditGenerated = 0
  let salesTotal = 0

  for (const sale of sales) {
    cashSales += Number(sale.cashAmount) || 0
    qrSales += Number(sale.qrAmount) || 0
    creditGenerated += Number(sale.creditAmount) || 0
    salesTotal += Number(sale.total) || 0
  }

  let cashCollections = 0
  let qrCollections = 0
  for (const collection of collections) {
    if (collection.method === 'mixed') {
      cashCollections += Number(collection.cashAmount) || 0
      qrCollections += Number(collection.qrAmount) || 0
    } else if (collection.method === 'qr') {
      qrCollections += Number(collection.amount) || 0
    } else {
      cashCollections += Number(collection.amount) || 0
    }
  }

  const cashExpenses = expenses.reduce((sum, expense) => sum + (Number(expense.amount) || 0), 0)

  return {
    salesTotal: round2(salesTotal),
    cashSales: round2(cashSales),
    qrSales: round2(qrSales),
    creditGenerated: round2(creditGenerated),
    cashCollections: round2(cashCollections),
    qrCollections: round2(qrCollections),
    collectionsTotal: round2(cashCollections + qrCollections),
    cashExpenses: round2(cashExpenses),
    expectedCash: round2(cashSales + cashCollections - cashExpenses),
  }
}

export interface SalePaymentSplit {
  cashAmount: number
  qrAmount: number
  creditAmount: number
}

export function computeSaleTotal(lines: DistSaleLine[]): number {
  return round2(lines.reduce((sum, line) => sum + (Number(line.subtotal) || 0), 0))
}

/** Reparte el total segun la forma de pago. Para 'mixed' respeta los montos dados. */
export function splitPayment(
  total: number,
  paymentKind: PaymentKind,
  mixed?: { cashAmount?: number; qrAmount?: number; creditAmount?: number },
): SalePaymentSplit {
  const amount = round2(total)
  if (paymentKind === 'cash') return { cashAmount: amount, qrAmount: 0, creditAmount: 0 }
  if (paymentKind === 'qr') return { cashAmount: 0, qrAmount: amount, creditAmount: 0 }
  if (paymentKind === 'credit') return { cashAmount: 0, qrAmount: 0, creditAmount: amount }

  const cashAmount = round2(mixed?.cashAmount ?? 0)
  const qrAmount = round2(mixed?.qrAmount ?? 0)
  const creditAmount = round2(mixed?.creditAmount ?? round2(amount - cashAmount - qrAmount))
  return { cashAmount, qrAmount, creditAmount }
}

export function validateSalePayment(total: number, split: SalePaymentSplit): string | null {
  const sum = round2(split.cashAmount + split.qrAmount + split.creditAmount)
  if (sum !== round2(total)) {
    return `El desglose de pago (${sum}) no coincide con el total (${round2(total)}).`
  }
  if (split.cashAmount < 0 || split.qrAmount < 0 || split.creditAmount < 0) {
    return 'Los montos de pago no pueden ser negativos.'
  }
  return null
}

export interface StockCheckLine {
  productId: string
  productName: string
  quantity: number
  unitType: UnitType
}

/** Impide dejar stock negativo. Devuelve el mensaje de error o null. */
export function validateStockAvailability(
  lines: StockCheckLine[],
  available: Map<string, number>,
): string | null {
  const requested = new Map<string, { name: string; qty: number; unitType: UnitType }>()
  for (const line of lines) {
    const current = requested.get(line.productId)
    requested.set(line.productId, {
      name: line.productName,
      qty: round2((current?.qty ?? 0) + line.quantity),
      unitType: line.unitType,
    })
  }

  for (const [productId, entry] of requested) {
    const stock = round2(available.get(productId) ?? 0)
    if (entry.qty > stock) {
      return `Stock insuficiente de ${entry.name}: disponible ${formatQuantity(stock, entry.unitType)}, solicitado ${formatQuantity(entry.qty, entry.unitType)}.`
    }
  }
  return null
}

export function validateCollection(amount: number, outstandingBalance: number): string | null {
  const value = round2(amount)
  if (value <= 0) return 'El monto del cobro debe ser mayor a cero.'
  if (value > round2(outstandingBalance)) {
    return `No se puede cobrar mas que el saldo pendiente (${round2(outstandingBalance)}).`
  }
  return null
}

export function nextReceivableStatus(originalAmount: number, paidAmount: number): 'OPEN' | 'PARTIAL' | 'PAID' {
  const paid = round2(paidAmount)
  if (paid <= 0) return 'OPEN'
  if (paid >= round2(originalAmount)) return 'PAID'
  return 'PARTIAL'
}

/** Kg vendidos: solo suma lineas con unitType 'kg'. Nunca convierte sachets a kilos. */
export function computeSoldKilograms(sales: DistSale[]): number {
  let total = 0
  for (const sale of sales) {
    for (const line of sale.lines || []) {
      if (line.unitType === 'kg') total += Number(line.quantity) || 0
    }
  }
  return round2(total)
}

export function computeSoldPackages(sales: DistSale[]): number {
  let total = 0
  for (const sale of sales) {
    for (const line of sale.lines || []) {
      if (line.unitType !== 'kg') total += Number(line.quantity) || 0
    }
  }
  return round2(total)
}

export interface SellerBreakdown {
  sellerUid: string
  sellerName: string
  routeNames: string[]
  salesCount: number
  salesTotal: number
  cashSales: number
  qrSales: number
  creditGenerated: number
  collected: number
  expenses: number
  kilograms: number
  packages: number
  /** Efectivo que deberia entregar: ventas efectivo + cobros efectivo - gastos */
  expectedCash: number
}

/**
 * Resumen por persona: cuanto vendio cada quien, como cobro y que gasto.
 * Las cobranzas y los gastos se atribuyen a quien los registro, no a la ruta,
 * porque es esa persona la que rinde el dinero.
 */
export function computeSellerBreakdown(
  sales: DistSale[],
  collections: DistCollection[],
  expenses: DistExpense[],
): SellerBreakdown[] {
  const map = new Map<string, SellerBreakdown>()

  const ensure = (uid: string, name: string): SellerBreakdown => {
    const key = uid || name || 'sin-asignar'
    const current = map.get(key)
    if (current) return current
    const created: SellerBreakdown = {
      sellerUid: key,
      sellerName: name || 'Sin asignar',
      routeNames: [],
      salesCount: 0,
      salesTotal: 0,
      cashSales: 0,
      qrSales: 0,
      creditGenerated: 0,
      collected: 0,
      expenses: 0,
      kilograms: 0,
      packages: 0,
      expectedCash: 0,
    }
    map.set(key, created)
    return created
  }

  for (const sale of sales) {
    const entry = ensure(sale.sellerUid, sale.sellerName)
    entry.salesCount += 1
    entry.salesTotal = round2(entry.salesTotal + (Number(sale.total) || 0))
    entry.cashSales = round2(entry.cashSales + (Number(sale.cashAmount) || 0))
    entry.qrSales = round2(entry.qrSales + (Number(sale.qrAmount) || 0))
    entry.creditGenerated = round2(entry.creditGenerated + (Number(sale.creditAmount) || 0))
    entry.kilograms = round2(entry.kilograms + computeSoldKilograms([sale]))
    entry.packages = round2(entry.packages + computeSoldPackages([sale]))
    if (sale.routeName && !entry.routeNames.includes(sale.routeName)) entry.routeNames.push(sale.routeName)
  }

  for (const collection of collections) {
    const entry = ensure(collection.collectedByUid, collection.collectedByName)
    entry.collected = round2(entry.collected + (Number(collection.amount) || 0))
  }

  for (const expense of expenses) {
    const entry = ensure(expense.registeredByUid, expense.registeredByName)
    entry.expenses = round2(entry.expenses + (Number(expense.amount) || 0))
    if (expense.routeName && !entry.routeNames.includes(expense.routeName)) entry.routeNames.push(expense.routeName)
  }

  for (const collection of collections) {
    const entry = ensure(collection.collectedByUid, collection.collectedByName)
    const cashPortion = collection.method === 'mixed'
      ? (Number(collection.cashAmount) || 0)
      : collection.method === 'qr'
        ? 0
        : (Number(collection.amount) || 0)
    entry.expectedCash = round2(entry.expectedCash + cashPortion)
  }

  for (const entry of map.values()) {
    entry.expectedCash = round2(entry.expectedCash + entry.cashSales - entry.expenses)
  }

  return [...map.values()].sort((a, b) => b.salesTotal - a.salesTotal)
}
