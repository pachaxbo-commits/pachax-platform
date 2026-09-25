import type { Order, OrderItem, Product } from '../../../types'

export type InventoryMovementType = 'sale' | 'cancellation_return' | 'manual_adjustment' | 'migration_reconciliation' | 'purchase' | 'waste' | 'loss' | 'courtesy' | 'internal_consumption' | 'initial_stock' | 'command_consumption'
export type InventoryMovement = {
  id: string
  operationId: string
  productId: string
  productName?: string
  quantityBase: number
  previousStock?: number
  newStock?: number
  type: InventoryMovementType
  reason?: string
  createdAt: string
  createdBy?: string
  orderId?: string
  orderItemId?: string
  soldQuantity?: number
  tableId?: string
  shiftId?: string
  batchId?: string
}

export type InventoryCount = { physical: number; countedAt: string; countedBy: string; note?: string }
export type InventoryShiftSnapshot = Record<string, number>
const round = (value: number) => Math.round((value + Number.EPSILON) * 1000) / 1000

export function convertInventoryQuantity(quantity: number, unit: 'unit' | 'g' | 'kg' | 'ml' | 'l', baseUnit: Product['baseUnit']) {
  if (!Number.isFinite(quantity) || quantity < 0) throw new Error('Cantidad inválida.')
  if (baseUnit === 'g' && (unit === 'g' || unit === 'kg')) return round(quantity * (unit === 'kg' ? 1000 : 1))
  if (baseUnit === 'ml' && (unit === 'ml' || unit === 'l')) return round(quantity * (unit === 'l' ? 1000 : 1))
  if ((!baseUnit || baseUnit === 'unit') && unit === 'unit') return round(quantity)
  throw new Error('La unidad no corresponde al producto.')
}

export function inventoryRequirements(line: OrderItem, products: Product[]) {
  const sold = products.find(product => product.id === line.productId)
  if (!sold) throw new Error(`Producto no encontrado: ${line.name}.`)
  const quantity = line.quantity
  if (!Number.isFinite(quantity) || quantity <= 0) throw new Error('La cantidad debe ser mayor a cero.')
  const recipe = sold.recipe || []
  const components = recipe.length ? recipe.map(part => ({ productId: part.ingredientId, quantityBase: part.quantityBase * quantity }))
    : sold.stockBase !== undefined ? [{ productId: sold.id, quantityBase: quantity }] : []
  const merged = new Map<string, number>()
  for (const component of components) merged.set(component.productId, round((merged.get(component.productId) || 0) + component.quantityBase))
  return [...merged].map(([productId, quantityBase]) => {
    const component = { productId, quantityBase }
    if (!Number.isFinite(component.quantityBase) || component.quantityBase <= 0) throw new Error(`Receta inválida para ${sold.name}.`)
    const inventoryItem = products.find(product => product.id === component.productId)
    if (!inventoryItem || inventoryItem.stockBase === undefined) throw new Error(`Falta inventario para ${sold.name}.`)
    return { ...component, quantityBase: round(component.quantityBase), productName: inventoryItem.name }
  })
}

export function stockAwareProducts(products: Product[]) {
  return products.map(product => {
    if (product.restaurantType === 'ingredient' || product.availability !== 'available') return product
    try {
      const line = { id: 'preview', productId: product.id, name: product.name, quantity: 1 } as OrderItem
      canConfirmInventory([line], products, [], 'preview')
      return product
    } catch {
      return { ...product, availability: 'soldout' as const }
    }
  })
}

export function canConfirmInventory(lines: OrderItem[], products: Product[], movements: InventoryMovement[], orderId: string) {
  const requested = new Map<string, number>()
  const seen = new Set<string>()
  for (const line of lines) for (const component of inventoryRequirements(line, products)) {
    const key = `${line.id}:${component.productId}`
    if (seen.has(key)) continue
    seen.add(key)
    if (movements.some(movement => movement.operationId === `sale:${orderId}:${line.id}:${component.productId}`)) continue
    requested.set(component.productId, round((requested.get(component.productId) || 0) + component.quantityBase))
  }
  for (const [productId, quantity] of requested) {
    const item = products.find(product => product.id === productId)!
    const available = round(item.stockBase || 0)
    if (quantity > available) throw new Error(`Stock insuficiente. ${item.name}: disponible ${available} ${item.baseUnit || 'unidades'}, solicitado ${quantity} ${item.baseUnit || 'unidades'}.`)
  }
}

export function confirmInventoryLines(order: Order, lines: OrderItem[], products: Product[], movements: InventoryMovement[], at: string, actor: string) {
  canConfirmInventory(lines, products, movements, order.id)
  const stock = new Map(products.filter(product => product.stockBase !== undefined).map(product => [product.id, product.stockBase!]))
  const appended: InventoryMovement[] = []
  const seen = new Set<string>()
  for (const line of lines) for (const component of inventoryRequirements(line, products)) {
    const operationId = `sale:${order.id}:${line.id}:${component.productId}`
    if (seen.has(operationId) || movements.some(movement => movement.operationId === operationId)) continue
    seen.add(operationId)
    const previousStock = round(stock.get(component.productId)!)
    const newStock = round(previousStock - component.quantityBase)
    stock.set(component.productId, newStock)
    appended.push({ id: crypto.randomUUID(), operationId, productId: component.productId, productName: component.productName, quantityBase: -component.quantityBase, soldQuantity: line.quantity, previousStock, newStock, type: 'sale', reason: 'Pedido confirmado', createdAt: at, createdBy: actor, orderId: order.id, orderItemId: line.id, tableId: order.tableId, shiftId: order.shiftId })
  }
  return { products: products.map(product => stock.has(product.id) ? { ...product, stockBase: stock.get(product.id) } : product), movements: [...movements, ...appended], appended }
}

export function returnInventoryLine(order: Order, line: OrderItem, quantity: number, products: Product[], movements: InventoryMovement[], at: string, actor: string, cancellationId: string) {
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > line.quantity) throw new Error('Cantidad de cancelación inválida.')
  const stock = new Map(products.filter(product => product.stockBase !== undefined).map(product => [product.id, product.stockBase!]))
  const appended: InventoryMovement[] = []
  const saleMovements = movements.filter(movement => movement.type === 'sale' && movement.orderId === order.id && movement.orderItemId === line.id)
  const components = saleMovements.length ? saleMovements.map(movement => ({ productId: movement.productId, productName: movement.productName, quantityBase: round(-movement.quantityBase * quantity / (movement.soldQuantity || line.quantity)) })) : inventoryRequirements({ ...line, quantity }, products)
  for (const component of components) {
    const soldMovement = movements.find(movement => movement.operationId === `sale:${order.id}:${line.id}:${component.productId}`)
    const legacyBatch = order.submittedBatches?.find(batch => batch.itemIds.includes(line.id) && movements.some(movement => movement.operationId === `command:${order.id}:${batch.id}` && movement.productId === component.productId))
    if (!soldMovement && !legacyBatch) continue
    const operationId = `return:${order.id}:${line.id}:${cancellationId}:${component.productId}`
    if (movements.some(movement => movement.operationId === operationId)) continue
    const previousStock = stock.get(component.productId)
    if (previousStock === undefined) throw new Error(`Inventario histórico no encontrado: ${component.productName || component.productId}.`)
    const newStock = round(previousStock + component.quantityBase)
    stock.set(component.productId, newStock)
    appended.push({ id: crypto.randomUUID(), operationId, productId: component.productId, productName: component.productName, quantityBase: component.quantityBase, previousStock, newStock, type: 'cancellation_return', reason: 'Cancelación de producto', createdAt: at, createdBy: actor, orderId: order.id, orderItemId: line.id, tableId: order.tableId, shiftId: order.shiftId })
  }
  return { products: products.map(product => stock.has(product.id) ? { ...product, stockBase: stock.get(product.id) } : product), movements: [...movements, ...appended], appended }
}

export function changeInventoryStock(product: Product, nextStock: number, movements: InventoryMovement[], type: Exclude<InventoryMovementType, 'sale' | 'cancellation_return' | 'command_consumption' | 'migration_reconciliation'>, reason: string, at: string, actor: string, shiftId?: string) {
  if (!Number.isFinite(nextStock) || nextStock < 0) throw new Error('El stock no puede ser negativo.')
  const previousStock = round(product.stockBase || 0)
  const finalStock = round(nextStock)
  if (previousStock === finalStock) return { product, movements, movement: null }
  const delta = round(finalStock - previousStock)
  if ((type === 'purchase' || type === 'initial_stock') && delta < 0) throw new Error('La entrada debe aumentar stock.')
  if (['waste', 'loss', 'courtesy', 'internal_consumption'].includes(type) && delta > 0) throw new Error('La salida debe reducir stock.')
  const movement: InventoryMovement = { id: crypto.randomUUID(), operationId: `manual:${crypto.randomUUID()}`, productId: product.id, productName: product.name, quantityBase: delta, previousStock, newStock: finalStock, type, reason: reason.trim() || 'Movimiento manual', createdAt: at, createdBy: actor, shiftId }
  return { product: { ...product, stockBase: finalStock }, movements: [...movements, movement], movement }
}

export function inventoryShiftRows(products: Product[], opening: InventoryShiftSnapshot, movements: InventoryMovement[], shiftId: string, counts: Record<string, InventoryCount> = {}) {
  const ids = new Set([...Object.keys(opening), ...movements.filter(movement => movement.shiftId === shiftId).map(movement => movement.productId)])
  return [...ids].map(id => {
    const product = products.find(item => item.id === id)
    const entries = movements.filter(movement => movement.shiftId === shiftId && movement.productId === id)
    const sum = (types: InventoryMovementType[]) => round(entries.filter(entry => types.includes(entry.type)).reduce((total, entry) => total + entry.quantityBase, 0))
    const initial = opening[id] ?? 0
    const sales = sum(['sale', 'command_consumption'])
    const returns = sum(['cancellation_return'])
    const incoming = sum(['purchase', 'initial_stock'])
    const waste = sum(['waste', 'loss'])
    const adjustments = sum(['manual_adjustment', 'migration_reconciliation', 'courtesy', 'internal_consumption'])
    const theoretical = round(initial + sales + returns + incoming + waste + adjustments)
    const count = counts[id]
    return { productId: id, name: product?.name || entries[0]?.productName || id, unit: product?.stockUnitLabel || product?.baseUnit || 'unit', unitCost: product?.unitCost || 0, initial, sales, returns, incoming, waste, adjustments, theoretical, physical: count?.physical, difference: count ? round(count.physical - theoretical) : undefined, count }
  }).sort((a, b) => a.name.localeCompare(b.name, 'es'))
}

export type InventoryShiftRow = ReturnType<typeof inventoryShiftRows>[number]

export function openingInventorySnapshot(products: Product[]): InventoryShiftSnapshot {
  return Object.fromEntries(products.filter(product => product.stockBase !== undefined).map(product => [product.id, round(product.stockBase!)]))
}

export function reconcileInventoryLedger(products: Product[], opening: InventoryShiftSnapshot, movements: InventoryMovement[], shiftId: string, at: string) {
  const appended: InventoryMovement[] = []
  for (const row of inventoryShiftRows(products, opening, movements, shiftId)) {
    const current = products.find(product => product.id === row.productId)?.stockBase
    if (current === undefined || Math.abs(current - row.theoretical) < 0.001) continue
    const operationId = `reconcile:${shiftId}:${row.productId}:${movements.length}`
    appended.push({ id: crypto.randomUUID(), operationId, productId: row.productId, productName: row.name, quantityBase: round(current - row.theoretical), previousStock: row.theoretical, newStock: current, type: 'migration_reconciliation', reason: 'Diferencia entre stock y movimientos locales detectada al cargar; revisar arqueo', createdAt: at, createdBy: 'Sistema', shiftId })
  }
  return [...movements, ...appended]
}
