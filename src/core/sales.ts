/** Money is integer cents. Weight is integer grams. No automatic package/box conversions. */
export interface SaleProduct {
  id: string; name: string; soldBy: 'weight' | 'unit'; priceMinor: number
  trackStock: boolean; stockUnit: 'g' | 'unit'
}
export interface SaleLine {
  productId: string; productNameSnapshot: string; soldBy: 'weight' | 'unit'
  enteredQuantity: number; enteredUnit: 'g' | 'unit'; normalizedQuantity: number
  normalizedUnit: 'g' | 'unit'; unitPriceMinor: number; subtotalMinor: number
}
function integer(value: number, label: string, positive = false): number {
  if (!Number.isSafeInteger(value) || value < (positive ? 1 : 0)) throw new Error(`${label} debe ser un entero válido ${positive ? 'mayor que cero' : 'no negativo'}.`)
  return value
}
function safeNumber(value: bigint): number {
  if (value > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('El importe excede la precisión admitida.')
  return Number(value)
}
export function createSaleLine(product: SaleProduct, quantity: number): SaleLine {
  integer(quantity, 'Cantidad', true)
  integer(product.priceMinor, 'Precio')
  if (!product.id || !product.name || !['weight', 'unit'].includes(product.soldBy)) throw new Error('Producto inválido.')
  const unit = product.soldBy === 'weight' ? 'g' : 'unit'
  if (product.stockUnit !== unit) throw new Error('La unidad de stock no corresponde a la modalidad de venta.')
  const numerator = BigInt(quantity) * BigInt(product.priceMinor)
  // Half-up rounding once per line, using exact integer arithmetic.
  const subtotalMinor = safeNumber(product.soldBy === 'weight' ? (numerator + 500n) / 1000n : numerator)
  return { productId: product.id, productNameSnapshot: product.name, soldBy: product.soldBy,
    enteredQuantity: quantity, enteredUnit: unit, normalizedQuantity: quantity, normalizedUnit: unit,
    unitPriceMinor: product.priceMinor, subtotalMinor }
}
export function saleTotal(lines: readonly SaleLine[]): number {
  if (!lines.length) throw new Error('La venta debe contener productos.')
  return safeNumber(lines.reduce((total, line) => total + BigInt(integer(line.subtotalMinor, 'Subtotal')), 0n))
}
export function validatePayments(totalMinor: number, cashMinor: number, qrMinor: number): void {
  integer(totalMinor, 'Total'); integer(cashMinor, 'Efectivo'); integer(qrMinor, 'QR')
  if (BigInt(cashMinor) + BigInt(qrMinor) !== BigInt(totalMinor)) throw new Error('Los pagos no coinciden con el total.')
}
export function cashClosure(openingMinor: number, cashSalesMinor: number, expensesMinor: number, declaredMinor: number) {
  for (const amount of [openingMinor, cashSalesMinor, expensesMinor, declaredMinor]) integer(amount, 'Importe')
  const expected = BigInt(openingMinor) + BigInt(cashSalesMinor) - BigInt(expensesMinor)
  const difference = BigInt(declaredMinor) - expected
  if ([expected, difference].some(value => value > BigInt(Number.MAX_SAFE_INTEGER) || value < BigInt(Number.MIN_SAFE_INTEGER))) throw new Error('Importe fuera de rango.')
  return { expectedMinor: Number(expected), declaredMinor, differenceMinor: Number(difference) }
}
