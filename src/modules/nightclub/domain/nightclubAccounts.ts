export type NightclubTableStatus = 'available' | 'occupied' | 'reserved' | 'bill_requested'
export type NightclubAccountStatus = 'open' | 'bill_requested' | 'closed'
export type NightclubPaymentMethod = 'cash' | 'qr' | 'card' | 'mixed'
export type NightclubRoundStatus = 'pending' | 'preparing' | 'ready' | 'delivered' | 'cancelled'
export type NightclubRole = 'owner' | 'admin' | 'cashier' | 'waiter' | 'service' | 'bar' | 'inventory'
export type NightclubModuleId = 'dashboard' | 'floor' | 'pos' | 'accounts' | 'bar' | 'inventory' | 'products' | 'cash' | 'history' | 'customers' | 'users' | 'reports' | 'settings'
export type NightclubServiceTarget =
  | { type: 'table'; tableId: string }
  | { type: 'customer'; customerId?: string; displayName: string }
  | { type: 'bar' }

export interface NightclubZone { id: string; name: string; sortOrder: number }
export interface NightclubTable { id: string; name: string; zoneId: string; capacity: number; status: NightclubTableStatus; activeAccountId?: string; reservationName?: string }
export interface NightclubRecipeLine { inventoryId: string; quantity: number }
export interface NightclubProduct {
  id: string
  category: string
  name: string
  price: number
  preparationArea: 'Barra' | 'Directo'
  stockUnits: number
  inventoryMode?: 'unit' | 'recipe' | 'none'
  inventoryId?: string
  imageUrl?: string
  recipe?: NightclubRecipeLine[]
  active?: boolean
}
export interface NightclubRoundItem {
  id: string; productId: string; name: string; category?: string; quantity: number; unitPrice: number; lineTotal: number
  commercialValue?: number; kind?: 'sale' | 'courtesy'; status?: 'active' | 'cancelled' | 'returned'
  preparationArea?: 'Barra' | 'Directo'; stockUsage?: NightclubRecipeLine[]
  authorizedBy?: string; reason?: string; cancelledAt?: string; cancelledBy?: string; cancelReason?: string
}
export interface NightclubRound { id: string; sequence: number; createdAt: string; status: NightclubRoundStatus; items: NightclubRoundItem[]; startedAt?: string; readyAt?: string; deliveredAt?: string; cancelledAt?: string; cancelledBy?: string; cancelReason?: string; sentBy?: string }
export interface NightclubPayment { id?: string; operationId?: string; method: NightclubPaymentMethod; amount?: number; cashAmount: number; qrAmount: number; cardAmount: number; received: number; change: number; paidAt: string; paidBy: string }
export interface NightclubDiscount { id: string; amount: number; reason: string; at: string; actor: string }
export interface NightclubAccount {
  id: string
  serviceTarget?: NightclubServiceTarget
  /** Compatibilidad de lectura con fixtures v2. Usar serviceTarget para nuevas cuentas. */
  tableId?: string
  customerId?: string
  customerDisplayName?: string
  tableNameSnapshot?: string
  zoneNameSnapshot?: string
  waiterName?: string
  guestCount?: number
  shiftId?: string
  openedAt: string
  openedBy: string
  status: NightclubAccountStatus
  rounds: NightclubRound[]
  subtotal: number
  discounts?: NightclubDiscount[]
  paidAt?: string
  closedBy?: string
  payments?: NightclubPayment[]
  /** Snapshot legacy del último pago. */
  payment?: NightclubPayment
}
export interface NightclubShift { id: string; status: 'open' | 'closed'; openedAt: string; openingFloat: number; openedBy: string; closedAt?: string; closedBy?: string; countedCash?: number; expectedCash?: number; difference?: number }
export interface NightclubCustomer { id: string; name: string; phone: string; notes?: string; active?: boolean; visits: number; totalSpent: number }
export interface NightclubStaff { id: string; name: string; role: 'admin' | 'cashier' | 'service' | 'bar' | 'inventory'; active: boolean }
export interface NightclubReservation { id: string; tableId: string; customerName: string; time: string; guests: number; status: 'confirmed' | 'arrived' | 'cancelled' }
export interface NightclubInventoryItem { id: string; name: string; unit: 'unit' | 'ml' | 'g'; current: number; minimum: number }
export type NightclubInventoryMovementType = 'sale' | 'reversal' | 'restock' | 'withdrawal' | 'adjustment' | 'waste'
export interface NightclubInventoryMovement { id: string; operationId: string; inventoryId: string; quantity: number; previous: number; current: number; type: NightclubInventoryMovementType; reason?: string; at: string; actor: string; accountId?: string; roundId?: string }
export interface NightclubCashMovement { id: string; shiftId: string; type: 'income' | 'expense'; method: 'cash' | 'qr' | 'card'; amount: number; description: string; at: string; actor: string }
export interface NightclubAuditEvent { id: string; type: string; at: string; actor: string; accountId?: string; details?: Record<string, string | number> }
export interface NightclubDataset { zones: NightclubZone[]; tables: NightclubTable[]; products: NightclubProduct[]; accounts: NightclubAccount[]; shift: NightclubShift | null; shiftHistory?: NightclubShift[]; customers: NightclubCustomer[]; staff?: NightclubStaff[]; reservations: NightclubReservation[]; inventory: NightclubInventoryItem[]; inventoryMovements?: NightclubInventoryMovement[]; cashMovements?: NightclubCashMovement[]; audit?: NightclubAuditEvent[] }
export interface NightclubRoundDraft { productId: string; quantity: number }
export interface NightclubPaymentDraft { method: NightclubPaymentMethod; amount?: number; received?: number; cashAmount?: number; qrAmount?: number; cardAmount?: number; operationId?: string }

const roundMoney = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100
const cloneDataset = (dataset: NightclubDataset): NightclubDataset => structuredClone(dataset)
const audit = (next: NightclubDataset, type: string, actor: string, at: string, accountId?: string, details?: NightclubAuditEvent['details']) => {
  next.audit = [...(next.audit || []), { id: crypto.randomUUID(), type, actor, at, accountId, details }]
}
const accountPayments = (account: NightclubAccount) => account.payments?.length ? account.payments : account.payment ? [account.payment] : []
const accountTableId = (account: NightclubAccount) => account.serviceTarget?.type === 'table' ? account.serviceTarget.tableId : account.tableId
const paymentAmount = (payment: NightclubPayment) => roundMoney(payment.amount ?? payment.cashAmount + payment.qrAmount + payment.cardAmount)

export const NIGHTCLUB_ROLE_MODULES: Readonly<Record<NightclubRole, readonly NightclubModuleId[]>> = {
  owner: ['dashboard', 'floor', 'pos', 'accounts', 'bar', 'inventory', 'products', 'cash', 'history', 'customers', 'users', 'reports', 'settings'],
  admin: ['dashboard', 'floor', 'pos', 'accounts', 'bar', 'inventory', 'products', 'cash', 'history', 'customers', 'users', 'reports', 'settings'],
  cashier: ['dashboard', 'pos', 'accounts', 'cash', 'history', 'customers'],
  waiter: ['floor', 'pos', 'accounts', 'history', 'customers'],
  service: ['floor', 'pos', 'accounts', 'history', 'customers'],
  bar: ['bar', 'history'],
  inventory: ['inventory', 'products', 'history'],
}

export function normalizeNightclubRole(role: string): NightclubRole {
  return role === 'waiter' || role === 'service' || role === 'cashier' || role === 'bar' || role === 'inventory' || role === 'owner' ? role : 'admin'
}

export function nightclubCan(role: string, module: NightclubModuleId) {
  return NIGHTCLUB_ROLE_MODULES[normalizeNightclubRole(role)].includes(module)
}

export function nightclubPaidTotal(account: NightclubAccount) {
  return roundMoney(accountPayments(account).reduce((sum, payment) => sum + paymentAmount(payment), 0))
}

export function nightclubBalance(account: NightclubAccount) {
  return Math.max(0, roundMoney(account.subtotal - nightclubPaidTotal(account)))
}

export function nightclubConsumptionTotal(account: NightclubAccount) {
  const gross = account.rounds.filter(batch => batch.status !== 'cancelled').flatMap(batch => batch.items).filter(item => item.status !== 'cancelled' && item.status !== 'returned').reduce((sum, item) => sum + item.lineTotal, 0)
  return Math.max(0, roundMoney(gross - (account.discounts || []).reduce((sum, discount) => sum + discount.amount, 0)))
}

export function applyNightclubDiscount(dataset: NightclubDataset, accountId: string, amount: number, reason: string, actor: string, role: string, now = new Date().toISOString()): NightclubDataset {
  if (!['admin', 'owner'].includes(normalizeNightclubRole(role))) throw new Error('Solo administración puede autorizar descuentos.')
  if (!Number.isFinite(amount) || amount <= 0 || reason.trim().length < 4) throw new Error('Indica un descuento positivo y su motivo.')
  const next = cloneDataset(dataset)
  const account = next.accounts.find(entry => entry.id === accountId)
  if (!account || account.status === 'closed') throw new Error('La cuenta está cerrada.')
  if (roundMoney(amount) > nightclubBalance(account)) throw new Error('El descuento supera el saldo pendiente.')
  const discount: NightclubDiscount = { id: crypto.randomUUID(), amount: roundMoney(amount), reason: reason.trim(), at: now, actor }
  account.discounts = [...(account.discounts || []), discount]
  account.subtotal = nightclubConsumptionTotal(account)
  if (nightclubBalance(account) === 0) {
    account.status = 'closed'; account.paidAt = now; account.closedBy = actor
    const tableId = accountTableId(account)
    const table = tableId ? next.tables.find(entry => entry.id === tableId) : undefined
    if (table) { table.status = 'available'; delete table.activeAccountId }
  }
  audit(next, 'discount_applied', actor, now, accountId, { amount: discount.amount, reason: discount.reason })
  return next
}

export function nightclubAccountLabel(account: NightclubAccount, dataset: Pick<NightclubDataset, 'tables' | 'zones' | 'customers'>) {
  if (account.serviceTarget?.type === 'bar') return 'Venta directa en barra'
  const tableId = accountTableId(account)
  if (tableId) {
    const table = dataset.tables.find(item => item.id === tableId)
    const zone = dataset.zones.find(item => item.id === table?.zoneId)
    const name = account.tableNameSnapshot || table?.name || 'Mesa'
    const zoneName = account.zoneNameSnapshot || zone?.name
    return `${name}${zoneName ? ` · ${zoneName}` : ''}`
  }
  const customer = dataset.customers.find(item => item.id === (account.serviceTarget?.type === 'customer' ? account.serviceTarget.customerId : account.customerId))
  return customer?.name || (account.serviceTarget?.type === 'customer' ? account.serviceTarget.displayName : account.customerDisplayName) || 'Cuenta personal'
}

export function nightclubProductAvailability(product: NightclubProduct, inventory: NightclubInventoryItem[]) {
  if (product.active === false) return 0
  if (product.inventoryMode === 'none') return Number.MAX_SAFE_INTEGER
  const recipe = product.recipe || []
  if (!recipe.length) return product.stockUnits
  return Math.max(0, Math.floor(Math.min(...recipe.map(line => {
    const stock = inventory.find(item => item.id === line.inventoryId)
    return stock && line.quantity > 0 ? stock.current / line.quantity : 0
  }))))
}

export function nightclubCashSummary(dataset: NightclubDataset, shiftId = dataset.shift?.id) {
  const payments = dataset.accounts.filter(account => account.shiftId === shiftId).flatMap(accountPayments)
  const cashSales = roundMoney(payments.reduce((sum, payment) => sum + payment.cashAmount, 0))
  const qrSales = roundMoney(payments.reduce((sum, payment) => sum + payment.qrAmount, 0))
  const cardSales = roundMoney(payments.reduce((sum, payment) => sum + payment.cardAmount, 0))
  const movements = (dataset.cashMovements || []).filter(item => item.shiftId === shiftId)
  const cashIncome = roundMoney(movements.filter(item => item.method === 'cash' && item.type === 'income').reduce((sum, item) => sum + item.amount, 0))
  const cashOutflow = roundMoney(movements.filter(item => item.method === 'cash' && item.type === 'expense').reduce((sum, item) => sum + item.amount, 0))
  const float = dataset.shift && dataset.shift.id === shiftId ? dataset.shift.openingFloat : dataset.shiftHistory?.find(item => item.id === shiftId)?.openingFloat || 0
  return { cashSales, qrSales, cardSales, totalSales: roundMoney(cashSales + qrSales + cardSales), cashIncome, cashOutflow, expectedCash: roundMoney(float + cashSales + cashIncome - cashOutflow) }
}

export function openNightclubShift(dataset: NightclubDataset, actor: string, openingFloat: number, now = new Date().toISOString()): NightclubDataset {
  if (!Number.isFinite(openingFloat) || openingFloat < 0) throw new Error('El fondo inicial no es válido.')
  if (dataset.shift?.status === 'open') throw new Error('Ya existe un turno abierto.')
  const next = cloneDataset(dataset)
  if (next.shift?.status === 'closed') next.shiftHistory = [...(next.shiftHistory || []), next.shift]
  next.shift = { id: crypto.randomUUID(), status: 'open', openedAt: now, openingFloat, openedBy: actor }
  audit(next, 'shift_opened', actor, now, undefined, { openingFloat })
  return next
}

export function closeNightclubShift(dataset: NightclubDataset, actor: string, countedCash: number, now = new Date().toISOString()): NightclubDataset {
  if (dataset.shift?.status !== 'open') throw new Error('No hay turno abierto.')
  if (dataset.accounts.some(account => nightclubBalance(account) > 0)) throw new Error('No puedes cerrar el turno mientras existan cuentas con saldo.')
  if (!Number.isFinite(countedCash) || countedCash < 0) throw new Error('Ingresa el efectivo contado.')
  const next = cloneDataset(dataset)
  const summary = nightclubCashSummary(next)
  next.shift = { ...next.shift!, status: 'closed', closedAt: now, closedBy: actor, countedCash, expectedCash: summary.expectedCash, difference: roundMoney(countedCash - summary.expectedCash) }
  audit(next, 'shift_closed', actor, now, undefined, { countedCash, difference: next.shift.difference || 0 })
  return next
}

export function openNightclubAccount(dataset: NightclubDataset, target: string | NightclubServiceTarget, actor: string, now = new Date().toISOString()): NightclubDataset {
  const next = cloneDataset(dataset)
  if (next.shift?.status !== 'open') throw new Error('Debes abrir el turno antes de abrir una cuenta.')
  const serviceTarget: NightclubServiceTarget = typeof target === 'string' ? { type: 'table', tableId: target } : target
  if (serviceTarget.type === 'bar') {
    const accountId = crypto.randomUUID()
    next.accounts.push({ id: accountId, serviceTarget, shiftId: next.shift.id, openedAt: now, openedBy: actor, waiterName: actor, status: 'open', rounds: [], subtotal: 0, payments: [] })
    audit(next, 'account_opened', actor, now, accountId, { target: 'bar' })
    return next
  }
  if (serviceTarget.type === 'customer') {
    const displayName = serviceTarget.displayName.trim()
    const customer = serviceTarget.customerId ? next.customers.find(item => item.id === serviceTarget.customerId && item.active !== false) : undefined
    if (!displayName && !customer) throw new Error('La cuenta sin mesa necesita un cliente identificable.')
    if (next.accounts.some(account => account.status !== 'closed' && account.serviceTarget?.type === 'customer' && account.serviceTarget.customerId && account.serviceTarget.customerId === serviceTarget.customerId)) throw new Error('Ese cliente ya tiene una cuenta personal abierta.')
    const accountId = crypto.randomUUID()
    next.accounts.push({ id: accountId, serviceTarget: { ...serviceTarget, displayName: customer?.name || displayName }, customerId: customer?.id, customerDisplayName: customer?.name || displayName, shiftId: next.shift.id, openedAt: now, openedBy: actor, waiterName: actor, status: 'open', rounds: [], subtotal: 0, payments: [] })
    audit(next, 'account_opened', actor, now, accountId, { target: 'customer' })
    return next
  }
  const table = next.tables.find(item => item.id === serviceTarget.tableId)
  if (!table) throw new Error('Mesa no encontrada.')
  if (table.status === 'reserved') throw new Error('Confirma la llegada o libera la reserva antes de abrir la mesa.')
  if (table.status === 'occupied' || table.status === 'bill_requested' || table.activeAccountId) throw new Error('La mesa ya tiene una cuenta activa.')
  const accountId = crypto.randomUUID()
  next.accounts.push({ id: accountId, serviceTarget, tableId: table.id, tableNameSnapshot: table.name, zoneNameSnapshot: next.zones.find(zone => zone.id === table.zoneId)?.name, shiftId: next.shift.id, openedAt: now, openedBy: actor, waiterName: actor, status: 'open', rounds: [], subtotal: 0, payments: [] })
  table.status = 'occupied'; table.activeAccountId = accountId
  audit(next, 'account_opened', actor, now, accountId, { target: 'table', tableId: table.id })
  return next
}

function appendNightclubRound(dataset: NightclubDataset, accountId: string, drafts: NightclubRoundDraft[], actor: string, now: string, operationId: string, courtesy?: { authorizedBy: string; reason?: string }): NightclubDataset {
  if (!drafts.length || drafts.some(item => !Number.isInteger(item.quantity) || item.quantity <= 0)) throw new Error('La ronda debe incluir cantidades válidas.')
  if ((dataset.audit || []).some(item => item.accountId === accountId && item.details?.operationId === operationId)) return dataset
  const next = cloneDataset(dataset)
  const account = next.accounts.find(item => item.id === accountId)
  if (next.shift?.status !== 'open' || !account || account.status !== 'open') throw new Error('La cuenta no acepta nuevas rondas.')
  const requirements = new Map<string, number>()
  const items = drafts.map(draft => {
    const product = next.products.find(item => item.id === draft.productId && item.active !== false)
    if (!product) throw new Error('Producto no encontrado o inactivo.')
    const mode = product.inventoryMode || (product.recipe?.length ? 'recipe' : 'unit')
    const recipe = mode === 'none' ? [] : product.recipe?.length ? product.recipe : product.inventoryId ? [{ inventoryId: product.inventoryId, quantity: 1 }] : [{ inventoryId: `inventory-${product.id}`, quantity: 1 }]
    for (const part of recipe) requirements.set(part.inventoryId, (requirements.get(part.inventoryId) || 0) + part.quantity * draft.quantity)
    const commercialValue = roundMoney(product.price * draft.quantity)
    return { id: crypto.randomUUID(), productId: product.id, name: product.name, category: product.category, quantity: draft.quantity, unitPrice: product.price, lineTotal: courtesy ? 0 : commercialValue, commercialValue, kind: courtesy ? 'courtesy' as const : 'sale' as const, status: 'active' as const, stockUsage: recipe.map(part => ({ ...part })), authorizedBy: courtesy?.authorizedBy, reason: courtesy?.reason, preparationArea: product.preparationArea }
  })
  for (const [inventoryId, quantity] of requirements) {
    const stock = next.inventory.find(item => item.id === inventoryId)
    if (!stock || !Number.isFinite(quantity) || quantity <= 0) throw new Error('Configura el control de inventario antes de vender.')
    if (stock.current < quantity) throw new Error(`Stock insuficiente para ${stock.name}.`)
  }
  const roundId = crypto.randomUUID()
  for (const [inventoryId, quantity] of requirements) {
    const stock = next.inventory.find(item => item.id === inventoryId)!
    const previous = stock.current; stock.current = roundMoney(previous - quantity)
    next.inventoryMovements = [...(next.inventoryMovements || []), { id: crypto.randomUUID(), operationId: `round:${operationId}:${inventoryId}`, inventoryId, quantity: -quantity, previous, current: stock.current, type: 'sale', reason: courtesy ? 'Cortesía autorizada' : 'Ronda enviada', at: now, actor, accountId, roundId }]
  }
  const requiresBar = items.some(item => item.preparationArea === 'Barra')
  account.rounds.push({ id: roundId, sequence: account.rounds.length + 1, createdAt: now, status: requiresBar ? 'pending' : 'ready', readyAt: requiresBar ? undefined : now, sentBy: actor, items })
  account.subtotal = nightclubConsumptionTotal(account)
  for (const product of next.products) product.stockUnits = nightclubProductAvailability(product, next.inventory)
  audit(next, courtesy ? 'courtesy_granted' : 'round_sent', actor, now, accountId, { roundId, operationId, total: roundMoney(items.reduce((sum, item) => sum + item.lineTotal, 0)), ...(courtesy ? { authorizedBy: courtesy.authorizedBy, reason: courtesy.reason || '' } : {}) })
  return next
}

export function addNightclubRound(dataset: NightclubDataset, accountId: string, drafts: NightclubRoundDraft[], actor = 'Equipo', now = new Date().toISOString(), operationId = crypto.randomUUID()): NightclubDataset {
  return appendNightclubRound(dataset, accountId, drafts, actor, now, operationId)
}

export function addNightclubCourtesy(dataset: NightclubDataset, accountId: string, drafts: NightclubRoundDraft[], actor: string, role: string, reason = '', now = new Date().toISOString(), operationId = crypto.randomUUID()): NightclubDataset {
  if (normalizeNightclubRole(role) !== 'admin' && normalizeNightclubRole(role) !== 'owner') throw new Error('Solo administración puede autorizar cortesías.')
  return appendNightclubRound(dataset, accountId, drafts, actor, now, operationId, { authorizedBy: actor, reason: reason.trim() })
}

export function advanceNightclubRound(dataset: NightclubDataset, accountId: string, roundId: string, actor: string, now = new Date().toISOString()): NightclubDataset {
  const next = cloneDataset(dataset); const account = next.accounts.find(item => item.id === accountId); const batch = account?.rounds.find(item => item.id === roundId)
  if (!account || !batch || batch.status === 'delivered' || batch.status === 'cancelled') throw new Error('Ronda no disponible.')
  if (batch.status === 'pending') { batch.status = 'preparing'; batch.startedAt = now }
  else if (batch.status === 'preparing') { batch.status = 'ready'; batch.readyAt = now }
  else { batch.status = 'delivered'; batch.deliveredAt = now }
  audit(next, 'round_status_changed', actor, now, accountId, { roundId, status: batch.status })
  return next
}

function reverseNightclubItemStock(next: NightclubDataset, accountId: string, roundId: string, item: NightclubRoundItem, actor: string, reason: string, now: string) {
  if (!item.stockUsage) throw new Error('Esta línea antigua solo puede anularse junto con su ronda completa.')
  for (const part of item.stockUsage) {
    const operationId = `reversal:item:${item.id}:${part.inventoryId}`
    if ((next.inventoryMovements || []).some(movement => movement.operationId === operationId)) continue
    const stock = next.inventory.find(entry => entry.id === part.inventoryId)
    if (!stock) throw new Error('Falta un insumo de la venta original.')
    const previous = stock.current
    stock.current = roundMoney(previous + part.quantity * item.quantity)
    next.inventoryMovements = [...(next.inventoryMovements || []), { id: crypto.randomUUID(), operationId, inventoryId: stock.id, quantity: roundMoney(part.quantity * item.quantity), previous, current: stock.current, type: 'reversal', reason, at: now, actor, accountId, roundId }]
  }
}

export function reverseNightclubItem(dataset: NightclubDataset, accountId: string, roundId: string, itemId: string, actor: string, reason: string, kind: 'cancelled' | 'returned' = 'cancelled', now = new Date().toISOString()): NightclubDataset {
  if (reason.trim().length < 4) throw new Error('Indica el motivo de la anulación o devolución.')
  const next = cloneDataset(dataset)
  const account = next.accounts.find(entry => entry.id === accountId)
  const batch = account?.rounds.find(entry => entry.id === roundId)
  const item = batch?.items.find(entry => entry.id === itemId)
  if (!account || !batch || !item || batch.status === 'cancelled') throw new Error('Producto no disponible.')
  if (item.status === 'cancelled' || item.status === 'returned') return dataset
  if (accountPayments(account).length) throw new Error('No se puede modificar consumo después de registrar pagos.')
  reverseNightclubItemStock(next, accountId, roundId, item, actor, reason.trim(), now)
  item.status = kind; item.cancelledAt = now; item.cancelledBy = actor; item.cancelReason = reason.trim()
  account.subtotal = nightclubConsumptionTotal(account)
  for (const product of next.products) product.stockUnits = nightclubProductAvailability(product, next.inventory)
  audit(next, kind === 'returned' ? 'item_returned' : 'item_cancelled', actor, now, accountId, { roundId, itemId, productId: item.productId, reason: reason.trim(), value: item.commercialValue ?? item.lineTotal })
  return next
}

export function cancelNightclubRound(dataset: NightclubDataset, accountId: string, roundId: string, actor: string, reason: string, now = new Date().toISOString()): NightclubDataset {
  if (reason.trim().length < 4) throw new Error('Indica el motivo de la anulación.')
  const next = cloneDataset(dataset); const account = next.accounts.find(item => item.id === accountId); const batch = account?.rounds.find(item => item.id === roundId)
  if (!account || !batch) throw new Error('Ronda no disponible.')
  if (batch.status === 'cancelled') return dataset
  if (accountPayments(account).length) throw new Error('No se puede anular una ronda después de registrar pagos.')
  if (batch.items.every(item => !!item.stockUsage)) {
    for (const item of batch.items.filter(item => item.status !== 'cancelled' && item.status !== 'returned')) reverseNightclubItemStock(next, accountId, roundId, item, actor, reason.trim(), now)
  } else {
    const sales = (next.inventoryMovements || []).filter(item => item.accountId === accountId && item.roundId === roundId && item.type === 'sale')
    for (const movement of sales) {
      const reversalId = `reversal:${movement.id}`
      if ((next.inventoryMovements || []).some(item => item.operationId === reversalId)) continue
      const stock = next.inventory.find(item => item.id === movement.inventoryId)
      if (!stock) continue
      const previous = stock.current; stock.current = roundMoney(previous - movement.quantity)
      next.inventoryMovements!.push({ id: crypto.randomUUID(), operationId: reversalId, inventoryId: stock.id, quantity: -movement.quantity, previous, current: stock.current, type: 'reversal', reason: reason.trim(), at: now, actor, accountId, roundId })
    }
  }
  batch.status = 'cancelled'; batch.cancelledAt = now; batch.cancelledBy = actor; batch.cancelReason = reason.trim()
  for (const item of batch.items) if (item.status !== 'cancelled' && item.status !== 'returned') { item.status = 'cancelled'; item.cancelledAt = now; item.cancelledBy = actor; item.cancelReason = reason.trim() }
  account.subtotal = nightclubConsumptionTotal(account)
  for (const product of next.products) product.stockUnits = nightclubProductAvailability(product, next.inventory)
  audit(next, 'round_cancelled', actor, now, accountId, { roundId, reason: reason.trim() })
  return next
}

export function requestNightclubBill(dataset: NightclubDataset, accountId: string, actor = 'Equipo', now = new Date().toISOString()): NightclubDataset {
  const next = cloneDataset(dataset); const account = next.accounts.find(item => item.id === accountId)
  if (!account || account.status !== 'open' || account.rounds.every(item => item.status === 'cancelled')) throw new Error('La cuenta no puede enviarse a cobro todavía.')
  account.status = 'bill_requested'
  const tableId = accountTableId(account); const table = tableId ? next.tables.find(item => item.id === tableId) : undefined
  if (table) table.status = 'bill_requested'
  audit(next, 'bill_requested', actor, now, accountId); return next
}

export function reopenNightclubBill(dataset: NightclubDataset, accountId: string, actor: string, now = new Date().toISOString()): NightclubDataset {
  const next = cloneDataset(dataset); const account = next.accounts.find(item => item.id === accountId)
  if (!account || account.status !== 'bill_requested') throw new Error('La cuenta no está por cobrarse.')
  account.status = 'open'
  const tableId = accountTableId(account); const table = tableId ? next.tables.find(item => item.id === tableId) : undefined
  if (table) table.status = 'occupied'
  audit(next, 'bill_reopened', actor, now, accountId); return next
}

export function recordNightclubPayment(dataset: NightclubDataset, accountId: string, paymentDraft: NightclubPaymentDraft, actor = 'Caja', now = new Date().toISOString()): NightclubDataset {
  const next = cloneDataset(dataset); const account = next.accounts.find(item => item.id === accountId)
  if (!account || account.status !== 'bill_requested') throw new Error('La cuenta debe estar por cobrar.')
  if (paymentDraft.operationId && accountPayments(account).some(payment => payment.operationId === paymentDraft.operationId)) return dataset
  if (next.shift?.status !== 'open') throw new Error('Debes abrir el turno antes de cobrar.')
  const balance = nightclubBalance(account)
  const requested = roundMoney(paymentDraft.amount ?? balance)
  const cashAmount = roundMoney(paymentDraft.method === 'cash' ? requested : paymentDraft.method === 'mixed' ? paymentDraft.cashAmount || 0 : 0)
  const qrAmount = roundMoney(paymentDraft.method === 'qr' ? requested : paymentDraft.method === 'mixed' ? paymentDraft.qrAmount || 0 : 0)
  const cardAmount = roundMoney(paymentDraft.method === 'card' ? requested : paymentDraft.method === 'mixed' ? paymentDraft.cardAmount || 0 : 0)
  const total = roundMoney(cashAmount + qrAmount + cardAmount)
  if (total <= 0 || total > balance || total !== requested || [cashAmount, qrAmount, cardAmount].some(value => value < 0)) throw new Error('El pago debe ser positivo y no superar el saldo.')
  const received = roundMoney(paymentDraft.received ?? cashAmount)
  if (received < cashAmount) throw new Error('Monto insuficiente.')
  const payment: NightclubPayment = { id: crypto.randomUUID(), operationId: paymentDraft.operationId, method: paymentDraft.method, amount: total, cashAmount, qrAmount, cardAmount, received, change: roundMoney(received - cashAmount), paidAt: now, paidBy: actor }
  account.payments = [...accountPayments(account), payment]; account.payment = payment; account.shiftId ||= next.shift.id
  const remaining = nightclubBalance(account)
  if (remaining === 0) {
    account.status = 'closed'; account.paidAt = now; account.closedBy = actor
    const tableId = accountTableId(account); const table = tableId ? next.tables.find(item => item.id === tableId) : undefined
    if (table) { table.status = 'available'; delete table.activeAccountId; delete table.reservationName }
  }
  audit(next, 'payment_recorded', actor, now, accountId, { amount: total, balance: remaining, cashAmount, qrAmount, cardAmount, change: payment.change })
  return next
}

export function closeNightclubAccount(dataset: NightclubDataset, accountId: string, paymentDraft: NightclubPaymentDraft = { method: 'cash' }, actor = 'Caja', now = new Date().toISOString()): NightclubDataset {
  return recordNightclubPayment(dataset, accountId, paymentDraft, actor, now)
}

export function recordNightclubCashMovement(dataset: NightclubDataset, draft: Omit<NightclubCashMovement, 'id' | 'shiftId' | 'at' | 'actor'>, actor: string, now = new Date().toISOString()): NightclubDataset {
  if (dataset.shift?.status !== 'open') throw new Error('Abre un turno para registrar movimientos.')
  if (!Number.isFinite(draft.amount) || draft.amount <= 0 || !draft.description.trim()) throw new Error('Ingresa monto y concepto válidos.')
  const next = cloneDataset(dataset); next.cashMovements = [...(next.cashMovements || []), { ...draft, id: crypto.randomUUID(), shiftId: next.shift!.id, at: now, actor }]
  audit(next, 'cash_movement', actor, now, undefined, { amount: draft.amount, type: draft.type }); return next
}

export function recordNightclubInventoryMovement(dataset: NightclubDataset, inventoryId: string, quantity: number, type: Exclude<NightclubInventoryMovementType, 'sale' | 'reversal'>, reason: string, actor: string, now = new Date().toISOString()): NightclubDataset {
  if (!Number.isFinite(quantity) || quantity === 0) throw new Error('Ingresa una cantidad distinta de cero.')
  if (reason.trim().length < 3) throw new Error('Indica el motivo del movimiento.')
  const next = cloneDataset(dataset); const stock = next.inventory.find(item => item.id === inventoryId)
  if (!stock) throw new Error('Artículo de inventario no encontrado.')
  const delta = type === 'restock' ? Math.abs(quantity) : type === 'withdrawal' || type === 'waste' ? -Math.abs(quantity) : quantity
  if (stock.current + delta < 0) throw new Error('El movimiento dejaría stock negativo.')
  const previous = stock.current; stock.current = roundMoney(previous + delta)
  next.inventoryMovements = [...(next.inventoryMovements || []), { id: crypto.randomUUID(), operationId: crypto.randomUUID(), inventoryId, quantity: delta, previous, current: stock.current, type, reason: reason.trim(), at: now, actor }]
  for (const product of next.products) product.stockUnits = nightclubProductAvailability(product, next.inventory)
  audit(next, 'inventory_movement', actor, now, undefined, { inventoryId, quantity: delta, type, reason: reason.trim() })
  return next
}

export function adjustNightclubInventory(dataset: NightclubDataset, inventoryId: string, current: number, actor: string, now = new Date().toISOString()): NightclubDataset {
  const stock = dataset.inventory.find(item => item.id === inventoryId)
  if (!stock || !Number.isFinite(current) || current < 0) throw new Error('La cantidad debe ser válida.')
  if (stock.current === current) return dataset
  return recordNightclubInventoryMovement(dataset, inventoryId, roundMoney(current - stock.current), 'adjustment', 'Conteo físico', actor, now)
}
