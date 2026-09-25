import type { Order, Product, RestaurantPaymentEntry } from '../../../types'
import type { InventoryMovement } from './inventoryEngine'

export type PaymentDraft = { method: 'cash' | 'qr' | 'card'; amount: number; received?: number }

const money = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100

export function settlePayments(total: number, drafts: PaymentDraft[], actor: string, at: string) {
  const paid = money(drafts.reduce((sum, item) => sum + item.amount, 0))
  if (drafts.length === 0 || paid !== money(total)) throw new Error('Los pagos deben cubrir el total exacto.')
  const entries: RestaurantPaymentEntry[] = drafts.map((item) => {
    if (!Number.isFinite(item.amount) || item.amount <= 0) throw new Error('Cada pago debe ser mayor a cero.')
    const received = item.method === 'cash' ? money(item.received ?? item.amount) : undefined
    if (received !== undefined && received < item.amount) throw new Error('Monto insuficiente.')
    return { id: crypto.randomUUID(), method: item.method, amount: money(item.amount), received, change: received === undefined ? 0 : money(received - item.amount), createdAt: at, createdBy: actor }
  })
  return entries
}

export function recipeCost(product: Product, products: Product[]) {
  return money((product.recipe || []).reduce((sum, line) => {
    const ingredient = products.find((item) => item.id === line.ingredientId)
    return sum + (ingredient?.unitCost || 0) * line.quantityBase
  }, 0))
}

export type RestaurantStockMovement = InventoryMovement

export function consumePrintedBatch(order: Order, batchId: string, products: Product[], existing: RestaurantStockMovement[], at: string) {
  const batch = order.submittedBatches?.find((item) => item.id === batchId)
  if (!batch) return { products, movements: existing }
  const operationId = `command:${order.id}:${batch.id}`
  if (existing.some((item) => item.operationId === operationId)) return { products, movements: existing }
  const deltas = new Map<string, number>()
  for (const item of order.items.filter((line) => batch.itemIds.includes(line.id))) {
    const sold = products.find((product) => product.id === item.productId)
    if (!sold) continue
    if (sold.restaurantType === 'direct' || sold.restaurantType === 'beverage') deltas.set(sold.id, (deltas.get(sold.id) || 0) + item.quantity)
    for (const recipe of sold.recipe || []) deltas.set(recipe.ingredientId, (deltas.get(recipe.ingredientId) || 0) + recipe.quantityBase * item.quantity)
  }
  const movements = [...existing]
  for (const [productId, quantityBase] of deltas) movements.push({ id: crypto.randomUUID(), operationId, productId, quantityBase: -quantityBase, type: 'command_consumption', createdAt: at, orderId: order.id, batchId })
  return { products: products.map((product) => ({ ...product, stockBase: product.stockBase === undefined ? undefined : Math.max(0, product.stockBase - (deltas.get(product.id) || 0)) })), movements }
}
