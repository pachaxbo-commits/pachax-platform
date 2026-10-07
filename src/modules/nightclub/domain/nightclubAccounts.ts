export type NightclubTableStatus = 'available' | 'occupied' | 'reserved' | 'bill_requested'
export type NightclubAccountStatus = 'open' | 'bill_requested' | 'closed'
export type NightclubPaymentMethod = 'cash' | 'qr' | 'card' | 'mixed'
export type NightclubRoundStatus = 'pending' | 'preparing' | 'ready' | 'delivered' | 'cancelled'
export type NightclubRole = 'owner' | 'admin' | 'cashier' | 'waiter' | 'service' | 'bar' | 'inventory'
export type NightclubModuleId = 'dashboard' | 'floor' | 'pos' | 'accounts' | 'bar' | 'inventory' | 'products' | 'cash' | 'history' | 'customers' | 'members' | 'users' | 'reports' | 'settings'
export type NightclubServiceTarget =
  | { type: 'table'; tableId: string }
  | { type: 'customer'; customerId?: string; displayName: string }
  | { type: 'bar'; customerId?: string; displayName?: string }

export interface NightclubZone { id: string; name: string; sortOrder: number }
export interface NightclubTable { id: string; name: string; zoneId: string; capacity: number; status: NightclubTableStatus; activeAccountId?: string; reservationName?: string }
export interface NightclubRecipeLine { inventoryId: string; quantity: number; unit?: 'unit' | 'ml' | 'l' | 'g' | 'kg' }
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
  /** Presentación rápida vinculada a un artículo físico embotellado. */
  bottlePresentation?: { inventoryId: string; kind: 'bottle' | 'pour'; millilitres?: number }
}
export interface NightclubRoundItem { id: string; productId: string; name: string; category?: string; quantity: number; unitPrice: number; lineTotal: number; costAtSale?: number; commercialValue?: number; kind?: 'sale' | 'courtesy'; status?: 'active' | 'cancelled' | 'returned'; cancelledAt?: string; cancelledBy?: string; cancelReason?: string; stockUsage?: NightclubRecipeLine[]; preparationArea?: 'Barra' | 'Directo'; courtesyId?: string; memberName?: string }
export interface NightclubRound { id: string; sequence: number; createdAt: string; status: NightclubRoundStatus; items: NightclubRoundItem[]; startedAt?: string; readyAt?: string; deliveredAt?: string; cancelledAt?: string; sentAt?: string; paidAt?: string; deliveredBy?: string; sentBy?: string; authorization?: 'payment' | 'account_charge' | 'courtesy'; paymentId?: string; courtesyId?: string; operationId?: string; cancelledBy?: string; cancellationReason?: string }
export interface NightclubPayment { id?: string; operationId?: string; roundId?: string; method: NightclubPaymentMethod; amount?: number; cashAmount: number; qrAmount: number; cardAmount: number; received: number; change: number; paidAt: string; paidBy: string; status?: 'confirmed' | 'refunded'; refundedAt?: string; refundedBy?: string; refundReason?: string }
export interface NightclubAccount {
  id: string
  serviceTarget?: NightclubServiceTarget
  orderType?: 'TABLE' | 'BAR'
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
export interface NightclubBranding {
  businessName: string
  subtitle: string
  logoDataUrl?: string
  heroDataUrl?: string
  primaryColor: string
  accentColor: string
  surfaceColor: string
}
export interface NightclubInventoryItem { id: string; name: string; unit: 'unit' | 'ml' | 'g' | 'l' | 'kg'; displayUnit?: 'unit' | 'ml' | 'g' | 'l' | 'kg'; current: number; minimum: number; unitCost?: number; category?: string; bottleCapacityMl?: number; openBottleMl?: number; linkedProductIds?: string[] }
export type NightclubInventoryMovementType = 'sale' | 'reversal' | 'restock' | 'withdrawal' | 'adjustment' | 'waste' | 'courtesy' | 'internal_consumption' | 'bottle_opened' | 'pour' | 'member_courtesy' | 'courtesy_reversal'
export interface NightclubInventoryMovement { id: string; operationId: string; inventoryId: string; quantity: number; previous: number; current: number; type: NightclubInventoryMovementType; reason?: string; at: string; actor: string; accountId?: string; roundId?: string; courtesyId?: string; memberId?: string; productId?: string; openBottleMlBefore?: number; openBottleMlAfter?: number }
export interface NightclubCourtesyPolicy { anchorAt: string; windowDays: number; repeatDays: number }
export interface NightclubMember { id: string; name: string; active: boolean; quota: number; policy: NightclubCourtesyPolicy }
export interface NightclubCourtesy { id: string; memberId: string; productId: string; productName: string; quantity: number; beneficiary?: string; note?: string; accountId?: string; tableId?: string; roundId?: string; actor: string; at: string; periodStart: string; periodEnd: string; status: 'active' | 'cancelled'; cancelledAt?: string; cancelledBy?: string; cost?: number }
export type NightclubExpenseCategory = 'inventory_purchase' | 'payroll' | 'services' | 'rent' | 'maintenance' | 'transport' | 'advertising' | 'cleaning' | 'security' | 'administrative' | 'other'
export interface NightclubCashMovement { id: string; shiftId: string; type: 'income' | 'expense'; method: 'cash' | 'qr' | 'card'; amount: number; description: string; category?: NightclubExpenseCategory; notes?: string; at: string; actor: string }
export interface NightclubAuditEvent { id: string; type: string; at: string; actor: string; accountId?: string; details?: Record<string, string | number> }
export interface NightclubDataset { zones: NightclubZone[]; tables: NightclubTable[]; products: NightclubProduct[]; accounts: NightclubAccount[]; shift: NightclubShift | null; shiftHistory?: NightclubShift[]; customers: NightclubCustomer[]; staff?: NightclubStaff[]; reservations: NightclubReservation[]; inventory: NightclubInventoryItem[]; inventoryMovements?: NightclubInventoryMovement[]; cashMovements?: NightclubCashMovement[]; audit?: NightclubAuditEvent[]; members?: NightclubMember[]; courtesies?: NightclubCourtesy[]; branding?: NightclubBranding }
export interface NightclubRoundDraft { productId: string; quantity: number }
export interface NightclubCourtesyDraft { memberId: string; productId: string; quantity: number; accountId?: string; beneficiary?: string; note?: string }
export interface NightclubPaymentDraft { method: NightclubPaymentMethod; amount?: number; received?: number; cashAmount?: number; qrAmount?: number; cardAmount?: number; installments?: Array<{ method: 'cash' | 'qr' | 'card'; amount: number; received?: number }>; operationId?: string }

const roundMoney = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100
const cloneDataset = (dataset: NightclubDataset): NightclubDataset => structuredClone(dataset)
const audit = (next: NightclubDataset, type: string, actor: string, at: string, accountId?: string, details?: NightclubAuditEvent['details']) => {
  next.audit = [...(next.audit || []), { id: crypto.randomUUID(), type, actor, at, accountId, details }]
}
const accountPayments = (account: NightclubAccount) => (account.payments?.length ? account.payments : account.payment ? [account.payment] : []).filter(payment => payment.status !== 'refunded')
export const nightclubAccountTableId = (account: NightclubAccount) => account.serviceTarget?.type === 'table' ? account.serviceTarget.tableId : account.serviceTarget?.type === 'bar' || account.serviceTarget?.type === 'customer' || account.orderType === 'BAR' ? undefined : account.tableId
const accountTableId = nightclubAccountTableId
const paymentAmount = (payment: NightclubPayment) => roundMoney(payment.amount ?? payment.cashAmount + payment.qrAmount + payment.cardAmount)

export const NIGHTCLUB_ROLE_MODULES: Readonly<Record<NightclubRole, readonly NightclubModuleId[]>> = {
  owner: ['dashboard', 'floor', 'pos', 'accounts', 'bar', 'inventory', 'products', 'cash', 'history', 'customers', 'members', 'users', 'reports', 'settings'],
  admin: ['dashboard', 'floor', 'pos', 'accounts', 'bar', 'inventory', 'products', 'cash', 'history', 'customers', 'members', 'users', 'reports', 'settings'],
  cashier: ['dashboard', 'pos', 'accounts', 'cash', 'history', 'customers', 'members'],
  waiter: ['floor', 'pos', 'accounts', 'history', 'customers', 'members'],
  service: ['floor', 'pos', 'accounts', 'history', 'customers', 'members'],
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

export function nightclubAccountLabel(account: NightclubAccount, dataset: Pick<NightclubDataset, 'tables' | 'zones' | 'customers'>) {
  const tableId = accountTableId(account)
  if (tableId) {
    const table = dataset.tables.find(item => item.id === tableId)
    const zone = dataset.zones.find(item => item.id === table?.zoneId)
    const name = account.tableNameSnapshot || table?.name || 'Mesa'
    const zoneName = account.zoneNameSnapshot || zone?.name
    return `${name}${zoneName ? ` · ${zoneName}` : ''}`
  }
  const directTarget = account.serviceTarget?.type === 'bar' || account.serviceTarget?.type === 'customer' ? account.serviceTarget : undefined
  const customer = dataset.customers.find(item => item.id === (directTarget?.customerId || account.customerId))
  const reference = customer?.name || directTarget?.displayName || account.customerDisplayName
  return reference ? `Pedido en Barra – ${reference}` : 'Venta rápida – Barra'
}

export function nightclubProductAvailability(product: NightclubProduct, inventory: NightclubInventoryItem[]) {
  if (product.active === false) return 0
  if (product.inventoryMode === 'none') return Number.MAX_SAFE_INTEGER
  const presentation = product.bottlePresentation
  if (presentation) {
    const stock = inventory.find(item => item.id === presentation.inventoryId)
    if (!stock) return 0
    if (presentation.kind === 'bottle') return Math.max(0, Math.floor(stock.current))
    const capacity = stock.bottleCapacityMl || 0
    const available = (stock.openBottleMl || 0) + stock.current * capacity
    return presentation.millilitres ? Math.max(0, Math.floor(available / presentation.millilitres)) : 0
  }
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
  if (dataset.accounts.some(account => account.status !== 'closed' && account.shiftId === dataset.shift?.id)) throw new Error('Finaliza las ocupaciones del turno antes de cerrar Caja.')
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
  if (serviceTarget.type === 'customer' || serviceTarget.type === 'bar') {
    if ('tableId' in serviceTarget) throw new Error('Un pedido en barra no puede tener mesa.')
    const displayName = (serviceTarget.displayName || '').trim()
    const customer = serviceTarget.customerId ? next.customers.find(item => item.id === serviceTarget.customerId && item.active !== false) : undefined
    const accountId = crypto.randomUUID()
    next.accounts.push({ id: accountId, orderType: 'BAR', serviceTarget: { type: 'bar', ...(customer ? { customerId: customer.id } : {}), ...(customer?.name || displayName ? { displayName: customer?.name || displayName } : {}) }, customerId: customer?.id, customerDisplayName: customer?.name || displayName || undefined, shiftId: next.shift.id, openedAt: now, openedBy: actor, waiterName: actor, status: 'open', rounds: [], subtotal: 0, payments: [] })
    audit(next, 'account_opened', actor, now, accountId, { target: 'bar' })
    return next
  }
  const table = next.tables.find(item => item.id === serviceTarget.tableId)
  if (!table) throw new Error('Mesa no encontrada.')
  if (table.status === 'reserved') throw new Error('Confirma la llegada o libera la reserva antes de abrir la mesa.')
  if (table.status === 'occupied' || table.status === 'bill_requested' || table.activeAccountId) throw new Error('La mesa ya tiene una cuenta activa.')
  const accountId = crypto.randomUUID()
  next.accounts.push({ id: accountId, orderType: 'TABLE', serviceTarget, tableId: table.id, tableNameSnapshot: table.name, zoneNameSnapshot: next.zones.find(zone => zone.id === table.zoneId)?.name, shiftId: next.shift.id, openedAt: now, openedBy: actor, waiterName: actor, status: 'open', rounds: [], subtotal: 0, payments: [] })
  table.status = 'occupied'; table.activeAccountId = accountId
  audit(next, 'account_opened', actor, now, accountId, { target: 'table', tableId: table.id })
  return next
}

function addNightclubRound(dataset: NightclubDataset, accountId: string, drafts: NightclubRoundDraft[], actor = 'Equipo', now = new Date().toISOString(), operationId: string = crypto.randomUUID()): NightclubDataset {
  if (!drafts.length || drafts.some(item => !Number.isInteger(item.quantity) || item.quantity <= 0)) throw new Error('La ronda debe incluir cantidades válidas.')
  if ((dataset.inventoryMovements || []).some(item => item.operationId.startsWith(`round:${operationId}:`))) return dataset
  const next = cloneDataset(dataset)
  const account = next.accounts.find(item => item.id === accountId)
  if (next.shift?.status !== 'open' || !account || account.status !== 'open') throw new Error('La cuenta no acepta nuevas rondas.')
  const requirements = new Map<string, number>()
  const bottleDrafts: Array<{ inventoryId: string; millilitres: number; productId: string; productName: string; quantity: number; wholeBottle?: boolean }> = []
  const items = drafts.map(draft => {
    const product = next.products.find(item => item.id === draft.productId && item.active !== false)
    if (!product) throw new Error('Producto no encontrado o inactivo.')
    if (product.bottlePresentation) bottleDrafts.push({ inventoryId: product.bottlePresentation.inventoryId, millilitres: product.bottlePresentation.millilitres || 0, productId: product.id, productName: product.name, quantity: draft.quantity, wholeBottle: product.bottlePresentation.kind === 'bottle' })
    const mode = product.inventoryMode || (product.recipe?.length ? 'recipe' : 'unit')
    const recipe = product.bottlePresentation ? [] : mode === 'none' ? [] : product.recipe?.length ? product.recipe : product.inventoryId ? [{ inventoryId: product.inventoryId, quantity: 1 }] : [{ inventoryId: `inventory-${product.id}`, quantity: 1 }]
    for (const part of recipe) {
      const stock = next.inventory.find(item => item.id === part.inventoryId)
      if (stock?.bottleCapacityMl && (part.unit === 'ml' || part.unit === 'l')) bottleDrafts.push({ inventoryId: part.inventoryId, millilitres: part.quantity * (part.unit === 'l' ? 1000 : 1), productId: product.id, productName: product.name, quantity: draft.quantity })
      else requirements.set(part.inventoryId, (requirements.get(part.inventoryId) || 0) + part.quantity * (part.unit === 'l' || part.unit === 'kg' ? 1000 : 1) * draft.quantity)
    }
    const value = roundMoney(product.price * draft.quantity)
    const cost = product.bottlePresentation ? (() => { const stock = next.inventory.find(item => item.id === product.bottlePresentation?.inventoryId); return product.bottlePresentation?.kind === 'pour' ? (stock?.unitCost || 0) / (stock?.bottleCapacityMl || 1) * (product.bottlePresentation?.millilitres || 0) * draft.quantity : (stock?.unitCost || 0) * draft.quantity })() : recipe.reduce((sum, part) => { const stock = next.inventory.find(item => item.id === part.inventoryId); const amount = part.quantity * (part.unit === 'l' ? 1000 : part.unit === 'kg' ? 1000 : 1); const unitCost = stock?.bottleCapacityMl && (part.unit === 'ml' || part.unit === 'l') ? (stock.unitCost || 0) / stock.bottleCapacityMl : stock?.unitCost || 0; return sum + unitCost * amount * draft.quantity }, 0)
    return { id: crypto.randomUUID(), productId: product.id, name: product.name, category: product.category, quantity: draft.quantity, unitPrice: product.price, lineTotal: value, costAtSale: roundMoney(cost), commercialValue: value, kind: 'sale' as const, preparationArea: product.preparationArea }
  })
  for (const [inventoryId, quantity] of requirements) {
    const stock = next.inventory.find(item => item.id === inventoryId)
    if (!stock || !Number.isFinite(quantity) || quantity <= 0) throw new Error('Configura el control de inventario antes de vender.')
    if (stock.current < quantity) throw new Error(`Stock insuficiente para ${stock.name}.`)
  }
  for (const bottle of bottleDrafts) {
    const stock = next.inventory.find(item => item.id === bottle.inventoryId)
    if (!stock?.bottleCapacityMl) throw new Error('Configura el contenido de la botella antes de vender.')
    const needed = bottle.wholeBottle ? bottle.quantity : bottle.millilitres * bottle.quantity
    const available = bottle.wholeBottle ? stock.current : (stock.openBottleMl || 0) + stock.current * stock.bottleCapacityMl
    if (!Number.isFinite(needed) || needed <= 0 || available < needed) throw new Error(`Stock insuficiente para ${bottle.productName}.`)
  }
  const roundId = crypto.randomUUID()
  for (const [inventoryId, quantity] of requirements) {
    const stock = next.inventory.find(item => item.id === inventoryId)!
    const previous = stock.current; stock.current = roundMoney(previous - quantity)
    next.inventoryMovements = [...(next.inventoryMovements || []), { id: crypto.randomUUID(), operationId: `round:${operationId}:${inventoryId}`, inventoryId, quantity: -quantity, previous, current: stock.current, type: 'sale', reason: 'Ronda enviada', at: now, actor, accountId, roundId }]
  }
  for (const bottle of bottleDrafts) {
    const stock = next.inventory.find(item => item.id === bottle.inventoryId)!
    const capacity = stock.bottleCapacityMl!
    if (bottle.wholeBottle) {
      const previous = stock.current; stock.current = roundMoney(previous - bottle.quantity)
      next.inventoryMovements = [...(next.inventoryMovements || []), { id: crypto.randomUUID(), operationId: `round:${operationId}:${stock.id}:bottle`, inventoryId: stock.id, productId: bottle.productId, quantity: -bottle.quantity, previous, current: stock.current, type: 'sale', reason: 'Venta de botella', at: now, actor, accountId, roundId }]
      continue
    }
    let remaining = bottle.millilitres * bottle.quantity
    const beforeOpen = stock.openBottleMl || 0
    while (remaining > 0) {
      const open = stock.openBottleMl || 0
      if (open === 0) {
        const previous = stock.current; stock.current = roundMoney(previous - 1); stock.openBottleMl = capacity
        next.inventoryMovements = [...(next.inventoryMovements || []), { id: crypto.randomUUID(), operationId: `round:${operationId}:${stock.id}:open:${remaining}`, inventoryId: stock.id, productId: bottle.productId, quantity: -1, previous, current: stock.current, type: 'bottle_opened', reason: 'Apertura automática para venta por receta', at: now, actor, accountId, roundId, openBottleMlBefore: 0, openBottleMlAfter: capacity }]
      }
      const used = Math.min(remaining, stock.openBottleMl || 0); stock.openBottleMl = roundMoney((stock.openBottleMl || 0) - used); remaining = roundMoney(remaining - used)
    }
    next.inventoryMovements = [...(next.inventoryMovements || []), { id: crypto.randomUUID(), operationId: `round:${operationId}:${stock.id}:pour`, inventoryId: stock.id, productId: bottle.productId, quantity: -bottle.millilitres * bottle.quantity, previous: stock.current, current: stock.current, type: 'pour', reason: 'Consumo por receta', at: now, actor, accountId, roundId, openBottleMlBefore: beforeOpen, openBottleMlAfter: stock.openBottleMl || 0 }]
  }
  const requiresBar = items.some(item => item.preparationArea === 'Barra')
  account.rounds.push({ id: roundId, sequence: account.rounds.length + 1, createdAt: now, status: requiresBar ? 'pending' : 'ready', readyAt: requiresBar ? undefined : now, sentBy: actor, items })
  account.subtotal = roundMoney(account.rounds.filter(item => item.status !== 'cancelled').flatMap(item => item.items).reduce((sum, item) => sum + item.lineTotal, 0))
  for (const product of next.products) product.stockUnits = nightclubProductAvailability(product, next.inventory)
  audit(next, 'round_sent', actor, now, accountId, { roundId, operationId, total: roundMoney(items.reduce((sum, item) => sum + item.lineTotal, 0)) })
  return next
}

/** Confirmar una ronda carga la cuenta y consume inventario una sola vez; cobrar es otra operación. */
export function sendNightclubRound(dataset: NightclubDataset, accountId: string, drafts: NightclubRoundDraft[], actor: string, now = new Date().toISOString(), operationId: string = crypto.randomUUID()): NightclubDataset {
  if (!operationId.trim()) throw new Error('La operación necesita una clave idempotente.')
  if (dataset.accounts.some(account => account.rounds.some(round => round.operationId === operationId))) return dataset
  if (drafts.some(draft => { const product = dataset.products.find(item => item.id === draft.productId); return !product || !Number.isFinite(product.price) || product.price <= 0 })) throw new Error('Un producto sin precio positivo requiere una cortesía separada.')
  const next = addNightclubRound(dataset, accountId, drafts, actor, now, operationId)
  const round = next.accounts.find(account => account.id === accountId)!.rounds.at(-1)!
  round.authorization = 'account_charge'
  round.sentAt = now
  round.operationId = operationId
  return next
}

/** Compatibilidad con rondas antiguas ya pagadas; el POS nuevo utiliza sendNightclubRound. */
export function settleNightclubRound(dataset: NightclubDataset, accountId: string, drafts: NightclubRoundDraft[], paymentDraft: NightclubPaymentDraft, actor: string, now = new Date().toISOString(), operationId: string = crypto.randomUUID()): NightclubDataset {
  if (!operationId.trim()) throw new Error('La operación necesita una clave idempotente.')
  const existing = dataset.accounts.find(item => item.id === accountId)?.rounds.find(item => item.operationId === operationId)
  if (existing) return dataset
  const destination = dataset.accounts.find(item => item.id === accountId)
  if (!destination) throw new Error('Cuenta no encontrada.')
  if ((destination.serviceTarget?.type === 'bar' || destination.serviceTarget?.type === 'customer' || destination.orderType === 'BAR') && (destination.tableId || destination.orderType === 'TABLE')) throw new Error('Un pedido en barra no puede estar vinculado a una mesa.')
  if (destination.serviceTarget?.type === 'table' && destination.orderType === 'BAR') throw new Error('El tipo de pedido no coincide con la mesa.')
  if (!drafts.length || drafts.some(item => !Number.isInteger(item.quantity) || item.quantity <= 0)) throw new Error('El pedido debe tener cantidades válidas.')
  const total = roundMoney(drafts.reduce((sum, draft) => {
    const product = dataset.products.find(item => item.id === draft.productId && item.active !== false)
    if (!product || !Number.isFinite(product.price) || product.price <= 0) throw new Error('Un producto sin precio positivo requiere una autorización de cortesía separada.')
    return sum + product.price * draft.quantity
  }, 0))
  const installments = paymentDraft.installments
  if (installments?.length) {
    if (installments.some(item => !Number.isFinite(item.amount) || item.amount <= 0 || item.method === 'cash' && (!Number.isFinite(item.received) || (item.received || 0) < item.amount))) throw new Error('Los abonos deben tener montos válidos y efectivo recibido suficiente.')
    if (roundMoney(installments.reduce((sum, item) => sum + item.amount, 0)) !== total) throw new Error('Los abonos deben cubrir exactamente esta ronda.')
  }
  if (paymentDraft.amount !== undefined && roundMoney(paymentDraft.amount) !== total) throw new Error('El pago debe cubrir exactamente este pedido.')
  const cashAmount = roundMoney(installments?.length ? installments.filter(item => item.method === 'cash').reduce((sum, item) => sum + item.amount, 0) : paymentDraft.method === 'cash' ? total : paymentDraft.method === 'mixed' ? paymentDraft.cashAmount || 0 : 0)
  const qrAmount = roundMoney(installments?.length ? installments.filter(item => item.method === 'qr').reduce((sum, item) => sum + item.amount, 0) : paymentDraft.method === 'qr' ? total : paymentDraft.method === 'mixed' ? paymentDraft.qrAmount || 0 : 0)
  const cardAmount = roundMoney(installments?.length ? installments.filter(item => item.method === 'card').reduce((sum, item) => sum + item.amount, 0) : paymentDraft.method === 'card' ? total : paymentDraft.method === 'mixed' ? paymentDraft.cardAmount || 0 : 0)
  if (roundMoney(cashAmount + qrAmount + cardAmount) !== total || [cashAmount, qrAmount, cardAmount].some(value => !Number.isFinite(value) || value < 0)) throw new Error('Los métodos de pago deben cubrir el pedido exactamente.')
  const received = roundMoney(installments?.length ? installments.filter(item => item.method === 'cash').reduce((sum, item) => sum + (item.received || 0), 0) : paymentDraft.received ?? cashAmount)
  if (!Number.isFinite(received) || received < cashAmount) throw new Error('Monto recibido insuficiente.')
  const next = addNightclubRound(dataset, accountId, drafts, actor, now, operationId)
  const account = next.accounts.find(item => item.id === accountId)!
  const batch = account.rounds.at(-1)!
  const paymentId = crypto.randomUUID()
  batch.authorization = 'payment'; batch.paymentId = paymentId; batch.paidAt = now; batch.sentAt = now; batch.operationId = operationId
  const payments: NightclubPayment[] = installments?.length ? installments.map((item, index) => ({ id: index === 0 ? paymentId : crypto.randomUUID(), operationId, roundId: batch.id, method: item.method, amount: roundMoney(item.amount), cashAmount: item.method === 'cash' ? roundMoney(item.amount) : 0, qrAmount: item.method === 'qr' ? roundMoney(item.amount) : 0, cardAmount: item.method === 'card' ? roundMoney(item.amount) : 0, received: item.method === 'cash' ? roundMoney(item.received || 0) : 0, change: item.method === 'cash' ? roundMoney((item.received || 0) - item.amount) : 0, paidAt: now, paidBy: actor, status: 'confirmed' })) : [{ id: paymentId, operationId, roundId: batch.id, method: paymentDraft.method, amount: total, cashAmount, qrAmount, cardAmount, received, change: roundMoney(received - cashAmount), paidAt: now, paidBy: actor, status: 'confirmed' }]
  account.payments = [...(account.payments || (account.payment ? [account.payment] : [])), ...payments]
  account.payment = payments.at(-1)
  audit(next, 'round_paid_and_sent', actor, now, accountId, { roundId: batch.id, paymentId, total, method: paymentDraft.method })
  return next
}

export function advanceNightclubRound(dataset: NightclubDataset, accountId: string, roundId: string, actor: string, now = new Date().toISOString()): NightclubDataset {
  const next = cloneDataset(dataset); const account = next.accounts.find(item => item.id === accountId); const batch = account?.rounds.find(item => item.id === roundId)
  if (!account || !batch || !batch.authorization || batch.status !== 'pending' && batch.status !== 'preparing') throw new Error('Solo se preparan pedidos autorizados pendientes o en preparación.')
  if (batch.status === 'pending') { batch.status = 'preparing'; batch.startedAt = now }
  else { batch.status = 'ready'; batch.readyAt = now }
  audit(next, 'round_status_changed', actor, now, accountId, { roundId, status: batch.status })
  return next
}

export function deliverNightclubRound(dataset: NightclubDataset, accountId: string, roundId: string, actor: string, now = new Date().toISOString()): NightclubDataset {
  const next = cloneDataset(dataset); const account = next.accounts.find(item => item.id === accountId); const batch = account?.rounds.find(item => item.id === roundId)
  if (!account || !batch || !batch.authorization || batch.status !== 'ready') throw new Error('El pedido todavía no está listo para entregar.')
  batch.status = 'delivered'; batch.deliveredAt = now; batch.deliveredBy = actor
  audit(next, 'round_delivered', actor, now, accountId, { roundId })
  return next
}

export function finishNightclubOccupancy(dataset: NightclubDataset, accountId: string, actor: string, now = new Date().toISOString()): NightclubDataset {
  const next = cloneDataset(dataset); const account = next.accounts.find(item => item.id === accountId)
  if (!account || account.status === 'closed') throw new Error('La ocupación ya está cerrada.')
  if (nightclubBalance(account) > 0 || account.rounds.some(batch => batch.status !== 'cancelled' && (!batch.authorization || batch.status !== 'delivered'))) throw new Error('Resuelve los pedidos pendientes y entrega los pedidos de Barra antes de cerrar la mesa.')
  account.status = 'closed'; account.paidAt = now; account.closedBy = actor
  const tableId = accountTableId(account); const table = tableId ? next.tables.find(item => item.id === tableId) : undefined
  if (table) { table.status = 'available'; delete table.activeAccountId; delete table.reservationName }
  audit(next, 'occupancy_finished', actor, now, accountId)
  return next
}

export function refundNightclubRound(dataset: NightclubDataset, accountId: string, roundId: string, actor: string, reason: string, now = new Date().toISOString()): NightclubDataset {
  if (reason.trim().length < 4) throw new Error('Indica el motivo del reembolso.')
  const next = cloneDataset(dataset); const account = next.accounts.find(item => item.id === accountId); const batch = account?.rounds.find(item => item.id === roundId)
  if (!account || !batch || batch.authorization !== 'payment' || !batch.paymentId || batch.status === 'cancelled') throw new Error('El pedido pagado no está disponible para reembolso.')
  const payments = (account.payments || []).filter(item => item.roundId === roundId || item.id === batch.paymentId)
  if (!payments.length || payments.some(item => item.status === 'refunded')) throw new Error('El pago ya fue reembolsado o falta su registro.')
  if (batch.status === 'delivered') throw new Error('La devolución de un pedido entregado necesita revisión física y ajuste de stock por separado.')
  const sales = (next.inventoryMovements || []).filter(item => item.accountId === accountId && item.roundId === roundId && item.type === 'sale')
  for (const movement of sales) {
    const stock = next.inventory.find(item => item.id === movement.inventoryId)
    if (!stock) throw new Error('Falta un insumo original; el reembolso requiere revisión manual.')
    const previous = stock.current; stock.current = roundMoney(previous - movement.quantity)
    next.inventoryMovements!.push({ id: crypto.randomUUID(), operationId: `refund:${roundId}:${stock.id}`, inventoryId: stock.id, quantity: -movement.quantity, previous, current: stock.current, type: 'reversal', reason: reason.trim(), at: now, actor, accountId, roundId })
  }
  for (const payment of payments) { payment.status = 'refunded'; payment.refundedAt = now; payment.refundedBy = actor; payment.refundReason = reason.trim() }
  batch.status = 'cancelled'; batch.cancelledAt = now; batch.cancelledBy = actor; batch.cancellationReason = reason.trim()
  account.subtotal = roundMoney(account.rounds.filter(item => item.status !== 'cancelled').flatMap(item => item.items).reduce((sum, item) => sum + item.lineTotal, 0))
  for (const product of next.products) product.stockUnits = nightclubProductAvailability(product, next.inventory)
  audit(next, 'round_refunded', actor, now, accountId, { roundId, paymentId: batch.paymentId, amount: roundMoney(payments.reduce((sum, item) => sum + paymentAmount(item), 0)), method: payments.length > 1 ? 'mixed' : payments[0].method, reason: reason.trim() })
  return next
}

export function cancelNightclubRound(dataset: NightclubDataset, accountId: string, roundId: string, actor: string, reason: string, now = new Date().toISOString()): NightclubDataset {
  if (reason.trim().length < 4) throw new Error('Indica el motivo de la anulación.')
  const next = cloneDataset(dataset); const account = next.accounts.find(item => item.id === accountId); const batch = account?.rounds.find(item => item.id === roundId)
  if (!account || !batch) throw new Error('Ronda no disponible.')
  if (batch.status === 'cancelled') return dataset
  if (accountPayments(account).length) throw new Error('No se puede anular una ronda después de registrar pagos.')
  const sales = (next.inventoryMovements || []).filter(item => item.accountId === accountId && item.roundId === roundId && item.type === 'sale')
  for (const movement of sales) {
    const reversalId = `reversal:${movement.id}`
    if ((next.inventoryMovements || []).some(item => item.operationId === reversalId)) continue
    const stock = next.inventory.find(item => item.id === movement.inventoryId)
    if (!stock) continue
    const previous = stock.current; stock.current = roundMoney(previous - movement.quantity)
    next.inventoryMovements!.push({ id: crypto.randomUUID(), operationId: reversalId, inventoryId: stock.id, quantity: -movement.quantity, previous, current: stock.current, type: 'reversal', reason: reason.trim(), at: now, actor, accountId, roundId })
  }
  batch.status = 'cancelled'; batch.cancelledAt = now
  account.subtotal = roundMoney(account.rounds.filter(item => item.status !== 'cancelled').flatMap(item => item.items).reduce((sum, item) => sum + item.lineTotal, 0))
  for (const product of next.products) product.stockUnits = nightclubProductAvailability(product, next.inventory)
  audit(next, 'round_cancelled', actor, now, accountId, { roundId, reason: reason.trim() })
  return next
}

export function requestNightclubBill(dataset: NightclubDataset, accountId: string, actor = 'Equipo', now = new Date().toISOString()): NightclubDataset {
  const next = cloneDataset(dataset); const account = next.accounts.find(item => item.id === accountId)
  if (!account || account.status !== 'open' || account.rounds.every(item => item.status === 'cancelled') || nightclubBalance(account) <= 0) throw new Error('La cuenta no tiene saldo para cobrar.')
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
  if (paymentDraft.operationId && (account.payments || []).some(payment => payment.operationId === paymentDraft.operationId)) return dataset
  if (next.shift?.status !== 'open') throw new Error('Debes abrir el turno antes de cobrar.')
  const balance = nightclubBalance(account)
  const requested = roundMoney(paymentDraft.amount ?? balance)
  if (requested === balance && account.rounds.some(round => round.status !== 'cancelled' && round.status !== 'delivered')) throw new Error('Entrega los pedidos antes de completar el cobro y liberar la mesa.')
  const cashAmount = roundMoney(paymentDraft.method === 'cash' ? requested : paymentDraft.method === 'mixed' ? paymentDraft.cashAmount || 0 : 0)
  const qrAmount = roundMoney(paymentDraft.method === 'qr' ? requested : paymentDraft.method === 'mixed' ? paymentDraft.qrAmount || 0 : 0)
  const cardAmount = roundMoney(paymentDraft.method === 'card' ? requested : paymentDraft.method === 'mixed' ? paymentDraft.cardAmount || 0 : 0)
  const total = roundMoney(cashAmount + qrAmount + cardAmount)
  if (total <= 0 || total > balance || total !== requested || [cashAmount, qrAmount, cardAmount].some(value => value < 0)) throw new Error('El pago debe ser positivo y no superar el saldo.')
  const received = roundMoney(paymentDraft.received ?? cashAmount)
  if (!Number.isFinite(received) || received < cashAmount) throw new Error('Monto insuficiente.')
  const payment: NightclubPayment = { id: crypto.randomUUID(), operationId: paymentDraft.operationId, method: paymentDraft.method, amount: total, cashAmount, qrAmount, cardAmount, received, change: roundMoney(received - cashAmount), paidAt: now, paidBy: actor }
  account.payments = [...accountPayments(account), payment]; account.payment = payment; account.shiftId ||= next.shift.id
  const remaining = nightclubBalance(account)
  if (remaining === 0 && account.rounds.every(round => round.status === 'cancelled' || round.status === 'delivered')) {
    account.status = 'closed'; account.paidAt = now
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

export function nightclubProfitSummary(dataset: NightclubDataset, shiftId = dataset.shift?.id) {
  const cash = nightclubCashSummary(dataset, shiftId)
  const rounds = dataset.accounts.filter(account => account.shiftId === shiftId).flatMap(account => account.rounds.filter(round => round.status !== 'cancelled' && (round.authorization === 'account_charge' || round.authorization === 'payment')))
  const costOfSales = roundMoney(rounds.flatMap(round => round.items).reduce((sum, item) => sum + (item.costAtSale || 0), 0))
  const inventoryCost = (type: 'waste' | 'courtesy' | 'internal_consumption') => roundMoney((dataset.inventoryMovements || []).filter(movement => movement.type === type).reduce((sum, movement) => sum + Math.abs(movement.quantity) * (dataset.inventory.find(item => item.id === movement.inventoryId)?.unitCost || 0), 0))
  const waste = inventoryCost('waste'); const courtesies = inventoryCost('courtesy'); const internal = inventoryCost('internal_consumption')
  const expenses = roundMoney((dataset.cashMovements || []).filter(movement => movement.shiftId === shiftId && movement.type === 'expense' && movement.category !== 'inventory_purchase').reduce((sum, movement) => sum + movement.amount, 0))
  const grossProfit = roundMoney(cash.totalSales - costOfSales); const totalExpenses = roundMoney(expenses + waste + courtesies + internal); const netProfit = roundMoney(grossProfit - totalExpenses)
  return { ...cash, costOfSales, grossProfit, expenses, waste, courtesies, internal, totalExpenses, netProfit, grossMargin: cash.totalSales ? grossProfit / cash.totalSales * 100 : 0, netMargin: cash.totalSales ? netProfit / cash.totalSales * 100 : 0 }
}

export function openNightclubBottle(dataset: NightclubDataset, inventoryId: string, actor: string, now = new Date().toISOString()): NightclubDataset {
  const next = cloneDataset(dataset); const stock = next.inventory.find(item => item.id === inventoryId)
  if (!stock?.bottleCapacityMl || stock.current < 1) throw new Error('No hay botellas cerradas disponibles.')
  if ((stock.openBottleMl || 0) > 0) throw new Error('Ya existe una botella abierta; registra primero su salida o consumo.')
  const previous = stock.current; stock.current = roundMoney(previous - 1); stock.openBottleMl = stock.bottleCapacityMl
  next.inventoryMovements = [...(next.inventoryMovements || []), { id: crypto.randomUUID(), operationId: crypto.randomUUID(), inventoryId, quantity: -1, previous, current: stock.current, type: 'bottle_opened', reason: 'Apertura manual de botella', at: now, actor, openBottleMlBefore: 0, openBottleMlAfter: stock.openBottleMl }]
  for (const product of next.products) product.stockUnits = nightclubProductAvailability(product, next.inventory)
  audit(next, 'bottle_opened', actor, now, undefined, { inventoryId }); return next
}

export function recordNightclubOpenBottleExit(dataset: NightclubDataset, inventoryId: string, millilitres: number, type: 'waste' | 'courtesy' | 'internal_consumption', reason: string, actor: string, now = new Date().toISOString()): NightclubDataset {
  const next = cloneDataset(dataset); const stock = next.inventory.find(item => item.id === inventoryId)
  if (!stock?.bottleCapacityMl || !Number.isFinite(millilitres) || millilitres <= 0 || (stock.openBottleMl || 0) < millilitres) throw new Error('No hay contenido abierto suficiente para registrar la salida.')
  const before = stock.openBottleMl || 0; stock.openBottleMl = roundMoney(before - millilitres)
  next.inventoryMovements = [...(next.inventoryMovements || []), { id: crypto.randomUUID(), operationId: crypto.randomUUID(), inventoryId, quantity: -millilitres, previous: stock.current, current: stock.current, type, reason: reason.trim() || 'Salida de botella abierta', at: now, actor, openBottleMlBefore: before, openBottleMlAfter: stock.openBottleMl }]
  audit(next, 'bottle_exit', actor, now, undefined, { inventoryId, millilitres, type }); return next
}

export function adjustNightclubInventory(dataset: NightclubDataset, inventoryId: string, current: number, actor: string, now = new Date().toISOString()): NightclubDataset {
  const stock = dataset.inventory.find(item => item.id === inventoryId)
  if (!stock || !Number.isFinite(current) || current < 0) throw new Error('La cantidad debe ser válida.')
  if (stock.current === current) return dataset
  return recordNightclubInventoryMovement(dataset, inventoryId, roundMoney(current - stock.current), 'adjustment', 'Conteo físico', actor, now)
}
