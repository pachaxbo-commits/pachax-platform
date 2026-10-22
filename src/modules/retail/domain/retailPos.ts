export type RetailPaymentMethod = 'cash' | 'qr' | 'mixed'

export interface RetailPaymentAmounts {
  cashMinor: number
  qrMinor: number
  receivedMinor: number
  changeMinor: number
}

export function parseRetailMoney(value: string): number | null {
  const normalized = value.trim().replace(',', '.')
  if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) return null
  const amount = Number(normalized)
  if (!Number.isFinite(amount) || amount > 1_000_000) return null
  return Math.round(amount * 100)
}

export function calculateRetailPayment(
  totalMinor: number,
  method: RetailPaymentMethod,
  cashValue: string,
  receivedValue: string,
): { amounts: RetailPaymentAmounts } | { error: string } {
  if (!Number.isSafeInteger(totalMinor) || totalMinor <= 0) return { error: 'Agrega productos para calcular el total.' }

  const cashMinor = method === 'cash'
    ? totalMinor
    : method === 'qr'
      ? 0
      : parseRetailMoney(cashValue)

  if (cashMinor === null) return { error: 'Ingresa el monto en efectivo con hasta dos decimales.' }
  if (method === 'mixed' && (cashMinor <= 0 || cashMinor >= totalMinor)) {
    return { error: 'En un pago mixto, el efectivo debe ser mayor que cero y menor que el total.' }
  }

  const receivedMinor = method === 'qr' ? 0 : parseRetailMoney(receivedValue)
  if (receivedMinor === null) return { error: 'Ingresa cuánto efectivo recibiste.' }
  if (receivedMinor < cashMinor) return { error: 'El efectivo recibido no cubre el importe en efectivo.' }

  return {
    amounts: {
      cashMinor,
      qrMinor: totalMinor - cashMinor,
      receivedMinor,
      changeMinor: receivedMinor - cashMinor,
    },
  }
}

export function addScannedProduct<T extends Record<string, number>>(
  cart: T,
  productId: string,
  quantityIncrement: number,
): T {
  return { ...cart, [productId]: (cart[productId] || 0) + quantityIncrement }
}

export interface RetailSaleAttempt {
  signature: string
  operationId: string
}

export interface RetailSaleRecovery {
  attempt: RetailSaleAttempt
  payload: {
    items: Array<{ productId: string; quantity: number }>
    payment: { method: RetailPaymentMethod; cashMinor: number; qrMinor: number; receivedMinor: number }
  }
  receiptItems: Array<{ productId: string; productNameSnapshot: string; soldBy: 'unit' | 'weight'; quantity: number; unit: string; unitPriceMinor: number; subtotalMinor: number }>
  totalMinor: number
  changeMinor: number
  createdAt: string
}

export function retailReceiptQuantity(quantity: number, unit: string): { quantity: number; unitLabel: string } {
  return unit === 'g'
    ? { quantity: quantity / 1000, unitLabel: 'kg' }
    : { quantity, unitLabel: 'unidad' }
}

export function resolveRetailSaleAttempt(
  payload: unknown,
  previous: RetailSaleAttempt | null,
  createId: () => string = () => crypto.randomUUID(),
): RetailSaleAttempt {
  const signature = JSON.stringify(payload)
  return previous?.signature === signature
    ? previous
    : { signature, operationId: createId() }
}

export function isUncertainRetailSaleError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const code = 'code' in error && typeof error.code === 'string'
    ? error.code.replace(/^functions\//, '')
    : ''
  return ['unavailable', 'deadline-exceeded', 'unknown', 'cancelled', 'internal'].includes(code)
}
