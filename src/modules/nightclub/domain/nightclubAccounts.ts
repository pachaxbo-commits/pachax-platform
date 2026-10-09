import { synchronizeNightclubCommissions } from './nightclubCommissions.ts'
import type { NightclubPromoter, NightclubPromoterEvent, NightclubTicketControlPlan, NightclubTicketSale, NightclubLoungeSale, NightclubPromoterConsumption } from './nightclubPromoters'
export type NightclubTableStatus = 'available' | 'occupied' | 'reserved' | 'bill_requested'
export type NightclubAccountStatus = 'open' | 'bill_requested' | 'closed'
export type NightclubPaymentMethod = 'cash' | 'qr' | 'card' | 'mixed'
export type NightclubRoundStatus = 'pending' | 'preparing' | 'ready' | 'delivered' | 'cancelled'
export type NightclubRole = 'owner' | 'admin' | 'cashier' | 'waiter' | 'service' | 'bar' | 'inventory'
export type NightclubModuleId = 'dashboard' | 'floor' | 'pos' | 'accounts' | 'bar' | 'inventory' | 'products' | 'cash' | 'history' | 'customers' | 'promoters' | 'members' | 'users' | 'reports' | 'settings'
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
  commission?: { enabled: boolean; type: 'percentage' | 'fixed'; value: number }
}
export interface NightclubCommissionSnapshot { type: 'percentage' | 'fixed'; value: number }
export interface NightclubRoundItem { id: string; productId: string; name: string; category?: string; quantity: number; unitPrice: number; lineTotal: number; costAtSale?: number; commercialValue?: number; kind?: 'sale' | 'courtesy'; status?: 'active' | 'cancelled' | 'returned'; cancelledAt?: string; cancelledBy?: string; cancelReason?: string; stockUsage?: NightclubRecipeLine[]; preparationArea?: 'Barra' | 'Directo'; courtesyId?: string; memberName?: string; exchangeId?: string; exchangedForProductId?: string; exchangeSourceItemId?: string; commissionSnapshot?: NightclubCommissionSnapshot }
export interface NightclubRound { id: string; sequence: number; createdAt: string; status: NightclubRoundStatus; items: NightclubRoundItem[]; customerId?: string | null; customerNameSnapshot?: string; serviceStaffId?: string; serviceStaffName?: string; startedAt?: string; readyAt?: string; deliveredAt?: string; cancelledAt?: string; sentAt?: string; paidAt?: string; deliveredBy?: string; sentBy?: string; authorization?: 'payment' | 'account_charge' | 'courtesy'; paymentId?: string; courtesyId?: string; operationId?: string; cancelledBy?: string; cancellationReason?: string }
export interface NightclubPaymentAllocation { roundId: string; customerId: string | null; amount: number }
export interface NightclubPayment { id?: string; operationId?: string; roundId?: string; allocations?: NightclubPaymentAllocation[]; method: NightclubPaymentMethod; amount?: number; cashAmount: number; qrAmount: number; cardAmount: number; received: number; change: number; paidAt: string; paidBy: string; status?: 'confirmed' | 'refunded'; kind?: 'sale' | 'exchange_refund' | 'pending_electronic_refund'; refundedAt?: string; refundedBy?: string; refundReason?: string; exchangeId?: string }
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
export interface NightclubShift { id: string; status: 'open' | 'closed'; openedAt: string; openingFloat: number; openedBy: string; closedAt?: string; closedBy?: string; countedCash?: number; expectedCash?: number; difference?: number; reconciliationStatus?: 'balanced' | 'surplus'; totalSales?: number; incomeTotal?: number; expenseTotal?: number; cashIncome?: number; cashOutflow?: number }
export type NightclubCustomerStatus = 'green' | 'yellow' | 'red'
export interface NightclubCustomerIncident { id: string; customerId: string; date: string; severity: 'low' | 'medium' | 'high'; description: string; responsible?: string; responsibleName?: string; createdBy: string; createdAt: string; updatedBy?: string; updatedAt?: string }
export interface NightclubCustomer { id: string; name: string; phone: string; birthday?: string; notes?: string; active?: boolean; convivenciaStatus?: NightclubCustomerStatus; visits: number; totalSpent: number }
export interface NightclubStaff { id: string; name: string; role: 'admin' | 'cashier' | 'service' | 'bar' | 'inventory'; active: boolean }
export type NightclubCommissionStatus = 'pending' | 'earned' | 'void' | 'paid'
export interface NightclubCommission { id: string; accountId: string; roundId: string; itemId: string; productId: string; productName: string; staffId: string; staffName: string; quantity: number; saleAmount: number; type: 'percentage' | 'fixed'; value: number; amount: number; paidAmount: number; status: NightclubCommissionStatus; shiftId?: string; createdAt: string; earnedAt?: string; voidedAt?: string; voidReason?: string; paymentIds?: string[] }
export interface NightclubCommissionPayment { id: string; staffId: string; amount: number; method: 'cash' | 'qr' | 'card' | 'other'; at: string; actor: string; shiftId?: string; note?: string; commissionIds: string[] }
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
export interface NightclubInventoryMovement { id: string; operationId: string; inventoryId: string; quantity: number; previous: number; current: number; type: NightclubInventoryMovementType; reason?: string; at: string; actor: string; accountId?: string; roundId?: string; courtesyId?: string; memberId?: string; productId?: string; openBottleMlBefore?: number; openBottleMlAfter?: number; costAmount?: number; exchangeId?: string }
export interface NightclubCourtesyPolicy { anchorAt: string; windowDays: number; repeatDays: number }
export interface NightclubMember { id: string; name: string; active: boolean; quota: number; policy: NightclubCourtesyPolicy }
export interface NightclubCourtesy { id: string; memberId: string; productId: string; productName: string; quantity: number; beneficiary?: string; note?: string; accountId?: string; tableId?: string; roundId?: string; actor: string; at: string; periodStart: string; periodEnd: string; status: 'active' | 'cancelled'; cancelledAt?: string; cancelledBy?: string; cost?: number }
export type NightclubExpenseCategory = 'inventory_purchase' | 'payroll' | 'services' | 'rent' | 'maintenance' | 'transport' | 'advertising' | 'cleaning' | 'security' | 'administrative' | 'other'
export interface NightclubCashMovement { id: string; shiftId: string; type: 'income' | 'expense'; method: 'cash' | 'qr' | 'card'; amount: number; description: string; category?: NightclubExpenseCategory; notes?: string; at: string; actor: string; commissionPaymentId?: string }
export interface NightclubAuditEvent { id: string; type: string; at: string; actor: string; accountId?: string; details?: Record<string, string | number> }
export interface NightclubDataset { zones: NightclubZone[]; tables: NightclubTable[]; products: NightclubProduct[]; accounts: NightclubAccount[]; shift: NightclubShift | null; shiftHistory?: NightclubShift[]; customers: NightclubCustomer[]; customerIncidents?: NightclubCustomerIncident[]; promoters?: NightclubPromoter[]; promoterEvents?: NightclubPromoterEvent[]; promoterTicketControlPlans?: NightclubTicketControlPlan[]; promoterTicketSales?: NightclubTicketSale[]; promoterLoungeSales?: NightclubLoungeSale[]; promoterConsumptions?: NightclubPromoterConsumption[]; staff?: NightclubStaff[]; reservations: NightclubReservation[]; inventory: NightclubInventoryItem[]; inventoryMovements?: NightclubInventoryMovement[]; cashMovements?: NightclubCashMovement[]; audit?: NightclubAuditEvent[]; members?: NightclubMember[]; courtesies?: NightclubCourtesy[]; commissions?: NightclubCommission[]; commissionPayments?: NightclubCommissionPayment[]; branding?: NightclubBranding }
export interface NightclubRoundDraft { productId: string; quantity: number }
export interface NightclubCommissionPaymentDraft { staffId: string; amount: number; method: 'cash' | 'qr' | 'card' | 'other'; note?: string; commissionIds?: string[]; operationId?: string }
export interface NightclubCourtesyDraft { memberId: string; productId: string; quantity: number; accountId?: string; beneficiary?: string; note?: string }
export interface NightclubPaymentDraft { method: NightclubPaymentMethod; amount?: number; received?: number; cashAmount?: number; qrAmount?: number; cardAmount?: number; installments?: Array<{ method: 'cash' | 'qr' | 'card'; amount: number; received?: number }>; operationId?: string }
export interface NightclubProductExchangeDraft { operationId: string; accountId: string; roundId: string; itemId: string; quantity: number; replacementProductId: string; reason: string; preparedTreatment?: 'recoverable' | 'waste' | 'internal_consumption'; lowerSettlement?: 'cash_refund' | 'pending_electronic_refund'; additionalPayment?: NightclubPaymentDraft }

const roundMoney = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100
const moneyCents = (value: number) => Math.round((value + Number.EPSILON) * 100)

export function nightclubCashReconciliation(expectedCash: number, countedInput: number | string) {
  const entered = typeof countedInput === 'string' ? countedInput.trim() !== '' : true
  const countedCash = entered ? Number(countedInput) : NaN
  if (!Number.isFinite(countedCash) || countedCash < 0 || !Number.isFinite(expectedCash)) return { valid: false, countedCash: null, difference: null, canClose: false }
  const difference = (moneyCents(countedCash) - moneyCents(expectedCash)) / 100
  return { valid: true, countedCash: roundMoney(countedCash), difference, canClose: difference >= 0 }
}
const cloneDataset = (dataset: NightclubDataset): NightclubDataset => structuredClone(dataset)
const audit = (next: NightclubDataset, type: string, actor: string, at: string, accountId?: string, details?: NightclubAuditEvent['details']) => {
  next.audit = [...(next.audit || []), { id: crypto.randomUUID(), type, actor, at, accountId, details }]
}
const allAccountPayments = (account: NightclubAccount) => account.payments?.length ? account.payments : account.payment ? [account.payment] : []
const accountPayments = (account: NightclubAccount) => allAccountPayments(account).filter(payment => payment.status !== 'refunded' && payment.kind !== 'pending_electronic_refund')
export const nightclubAccountTableId = (account: NightclubAccount) => account.serviceTarget?.type === 'table' ? account.serviceTarget.tableId : account.serviceTarget?.type === 'bar' || account.serviceTarget?.type === 'customer' || account.orderType === 'BAR' ? undefined : account.tableId
const accountTableId = nightclubAccountTableId
const paymentAmount = (payment: NightclubPayment) => roundMoney(payment.amount ?? payment.cashAmount + payment.qrAmount + payment.cardAmount)

/** Distribuye cada abono entre rondas en orden sin alterar saldo, ventas ni caja. */
export function nightclubPaymentAllocations(account: NightclubAccount, amount: number): NightclubPaymentAllocation[] {
  const before = moneyCents(nightclubPaidTotal(account))
  const after = before + moneyCents(amount)
  let cursor = 0
  const allocations: NightclubPaymentAllocation[] = []
  for (const round of account.rounds) {
    if (round.status === 'cancelled' || round.authorization === 'courtesy') continue
    const start = cursor
    cursor += moneyCents(round.items.filter(item => item.status !== 'cancelled' && item.status !== 'returned').reduce((sum, item) => sum + item.lineTotal, 0))
    const allocated = Math.max(0, Math.min(after, cursor) - Math.max(before, start))
    if (allocated) allocations.push({ roundId: round.id, customerId: round.customerId === undefined ? account.customerId || null : round.customerId, amount: allocated / 100 })
  }
  if (allocations.reduce((sum, item) => sum + moneyCents(item.amount), 0) !== moneyCents(amount)) throw new Error('No se pudo asignar el pago a los pedidos de la cuenta.')
  return allocations
}

/** Solo pagos confirmados y vigentes cuentan como consumo del cliente. */
export function nightclubCustomerPaidSummary(dataset: NightclubDataset, customerId: string) {
  const accounts = new Set<string>()
  let spentCents = 0
  for (const account of dataset.accounts) for (const payment of accountPayments(account)) {
    const legacyRound = payment.roundId ? account.rounds.find(round => round.id === payment.roundId && round.status !== 'cancelled') : undefined
    const allocations = payment.allocations || (legacyRound ? [{ roundId: legacyRound.id, customerId: legacyRound.customerId === undefined ? account.customerId || null : legacyRound.customerId, amount: paymentAmount(payment) }] : [])
    const paid = allocations.length ? allocations.filter(item => item.customerId === customerId).reduce((sum, item) => sum + moneyCents(item.amount), 0) : account.customerId === customerId && account.rounds.every(round => round.customerId === undefined) ? moneyCents(paymentAmount(payment)) : 0
    if (paid > 0) { spentCents += payment.kind === 'exchange_refund' ? -paid : paid; accounts.add(account.id) }
  }
  return { visits: accounts.size, spent: spentCents / 100 }
}

export const NIGHTCLUB_ROLE_MODULES: Readonly<Record<NightclubRole, readonly NightclubModuleId[]>> = {
  owner: ['dashboard', 'floor', 'pos', 'accounts', 'bar', 'inventory', 'products', 'cash', 'history', 'customers', 'promoters', 'members', 'users', 'reports', 'settings'],
  admin: ['dashboard', 'floor', 'pos', 'accounts', 'bar', 'inventory', 'products', 'cash', 'history', 'customers', 'promoters', 'members', 'users', 'reports', 'settings'],
  cashier: ['dashboard', 'pos', 'accounts', 'cash', 'history', 'customers', 'promoters', 'members'],
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
  return roundMoney(accountPayments(account).reduce((sum, payment) => sum + (payment.kind === 'exchange_refund' ? -paymentAmount(payment) : paymentAmount(payment)), 0))
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
  const signed = (payment: NightclubPayment, value: number) => payment.kind === 'exchange_refund' ? -value : value
  const cashSales = roundMoney(payments.reduce((sum, payment) => sum + signed(payment, payment.cashAmount), 0))
  const qrSales = roundMoney(payments.reduce((sum, payment) => sum + signed(payment, payment.qrAmount), 0))
  const cardSales = roundMoney(payments.reduce((sum, payment) => sum + signed(payment, payment.cardAmount), 0))
  const movements = (dataset.cashMovements || []).filter(item => item.shiftId === shiftId)
  const cashIncome = roundMoney(movements.filter(item => item.method === 'cash' && item.type === 'income').reduce((sum, item) => sum + item.amount, 0))
  const cashOutflow = roundMoney(movements.filter(item => item.method === 'cash' && item.type === 'expense').reduce((sum, item) => sum + item.amount, 0))
  const float = dataset.shift && dataset.shift.id === shiftId ? dataset.shift.openingFloat : dataset.shiftHistory?.find(item => item.id === shiftId)?.openingFloat || 0
  const pendingElectronicRefunds = roundMoney(dataset.accounts.filter(account => account.shiftId === shiftId).flatMap(allAccountPayments).filter(payment => payment.kind === 'pending_electronic_refund').reduce((sum, payment) => sum + paymentAmount(payment), 0))
  return { cashSales, qrSales, cardSales, totalSales: roundMoney(cashSales + qrSales + cardSales), cashIncome, cashOutflow, expectedCash: roundMoney(float + cashSales + cashIncome - cashOutflow), pendingElectronicRefunds }
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
  const summary = nightclubCashSummary(dataset)
  const expectedCash = summary.expectedCash
  const reconciliation = nightclubCashReconciliation(expectedCash, countedCash)
  if (!reconciliation.valid) throw new Error('Ingresa un efectivo contado válido.')
  if (!reconciliation.canClose) throw new Error(`La caja tiene un faltante de Bs ${Math.abs(reconciliation.difference!).toFixed(2)}. Corrige el arqueo antes de cerrar.`)
  const next = cloneDataset(dataset)
  const movements = (dataset.cashMovements || []).filter(item => item.shiftId === dataset.shift!.id)
  const incomeTotal = roundMoney(movements.filter(item => item.type === 'income').reduce((sum, item) => sum + item.amount, 0))
  const expenseTotal = roundMoney(movements.filter(item => item.type === 'expense').reduce((sum, item) => sum + item.amount, 0))
  next.shift = { ...next.shift!, status: 'closed', closedAt: now, closedBy: actor, countedCash: reconciliation.countedCash!, expectedCash, difference: reconciliation.difference!, reconciliationStatus: reconciliation.difference === 0 ? 'balanced' : 'surplus', totalSales: summary.totalSales, incomeTotal, expenseTotal, cashIncome: summary.cashIncome, cashOutflow: summary.cashOutflow }
  audit(next, 'shift_closed', actor, now, undefined, { countedCash: reconciliation.countedCash!, difference: reconciliation.difference! })
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
  const items: NightclubRoundItem[] = drafts.map(draft => {
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
    return { id: crypto.randomUUID(), productId: product.id, name: product.name, category: product.category, quantity: draft.quantity, unitPrice: product.price, lineTotal: value, costAtSale: roundMoney(cost), commercialValue: value, kind: 'sale' as const, preparationArea: product.preparationArea, ...(product.commission?.enabled && product.commission.value > 0 ? { commissionSnapshot: { type: product.commission.type, value: product.commission.value } } : {}) }
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
  for (const item of items) {
    const product = next.products.find(candidate => candidate.id === item.productId)!
    const mode = product.inventoryMode || (product.recipe?.length ? 'recipe' : 'unit')
    item.stockUsage = product.bottlePresentation ? [{ inventoryId: product.bottlePresentation.inventoryId, quantity: product.bottlePresentation.kind === 'pour' ? (product.bottlePresentation.millilitres || 0) : 1, unit: product.bottlePresentation.kind === 'pour' ? 'ml' : 'unit' }] : mode === 'none' ? [] : (product.recipe?.length ? product.recipe : product.inventoryId ? [{ inventoryId: product.inventoryId, quantity: 1 }] : [{ inventoryId: `inventory-${product.id}`, quantity: 1 }])
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
  account.subtotal = roundMoney(account.rounds.filter(item => item.status !== 'cancelled').flatMap(item => item.items).filter(item => item.status !== 'cancelled' && item.status !== 'returned').reduce((sum, item) => sum + item.lineTotal, 0))
  for (const product of next.products) product.stockUnits = nightclubProductAvailability(product, next.inventory)
  audit(next, 'round_sent', actor, now, accountId, { roundId, operationId, total: roundMoney(items.reduce((sum, item) => sum + item.lineTotal, 0)) })
  return next
}

/** Confirmar una ronda carga la cuenta y consume inventario una sola vez; cobrar es otra operación. */
export function sendNightclubRound(dataset: NightclubDataset, accountId: string, drafts: NightclubRoundDraft[], actor: string, now = new Date().toISOString(), operationId: string = crypto.randomUUID(), customerId: string | null = null, serviceStaffId?: string): NightclubDataset {
  if (!operationId.trim()) throw new Error('La operación necesita una clave idempotente.')
  const previous = dataset.accounts.flatMap(account => account.rounds.map(round => ({ accountId: account.id, round }))).find(item => item.round.operationId === operationId)
  if (previous) {
    if (previous.accountId !== accountId || previous.round.customerId !== customerId) throw new Error('La operación ya existe con otro destino o cliente.')
    return dataset
  }
  const customer = customerId ? dataset.customers.find(item => item.id === customerId && item.active !== false) : undefined
  if (customerId && !customer) throw new Error('Selecciona un cliente registrado y activo.')
  if (drafts.some(draft => { const product = dataset.products.find(item => item.id === draft.productId); return !product || !Number.isFinite(product.price) || product.price <= 0 })) throw new Error('Un producto sin precio positivo requiere una cortesía separada.')
  const next = addNightclubRound(dataset, accountId, drafts, actor, now, operationId)
  const round = next.accounts.find(account => account.id === accountId)!.rounds.at(-1)!
  round.authorization = 'account_charge'
  const staff = serviceStaffId ? next.staff?.find(person => person.id === serviceStaffId && person.role === 'service' && person.active) : next.staff?.find(person => person.role === 'service' && person.active && person.name === actor)
  if (serviceStaffId && !staff) throw new Error('Selecciona un trabajador de Servicio activo.')
  if (staff) { round.serviceStaffId = staff.id; round.serviceStaffName = staff.name }
  round.customerId = customer?.id || null
  round.customerNameSnapshot = customer?.name
  round.sentAt = now
  round.operationId = operationId
  synchronizeNightclubCommissions(next, now)
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
  const staff = (next.staff || []).find(person => person.active && person.role === 'service' && person.name.trim().toLocaleLowerCase() === actor.trim().toLocaleLowerCase())
  if (staff) { batch.serviceStaffId = staff.id; batch.serviceStaffName = staff.name }
  synchronizeNightclubCommissions(next, now)
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
  if (batch?.status === 'delivered') return dataset
  if (!account || !batch || !batch.authorization || batch.status !== 'ready') throw new Error('El pedido todavía no está listo para entregar.')
  batch.status = 'delivered'; batch.deliveredAt = now; batch.deliveredBy = actor
  synchronizeNightclubCommissions(next, now)
  audit(next, 'round_delivered', actor, now, accountId, { roundId })
  return next
}

export function nightclubBarQueue(dataset: NightclubDataset) {
  return dataset.accounts.filter(account => account.status !== 'closed').flatMap(account => account.rounds.filter(round => !!round.authorization && ['pending', 'preparing', 'ready'].includes(round.status) && round.items.some(item => item.preparationArea !== 'Directo')).map(round => ({ account, round })))
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

function exchangePayments(draft: NightclubPaymentDraft, total: number, actor: string, now: string, operationId: string, roundId: string, exchangeId: string): NightclubPayment[] {
  const installments = draft.installments
  const rows = installments?.length ? installments : [{ method: draft.method, amount: total, received: draft.received, cashAmount: draft.cashAmount, qrAmount: draft.qrAmount, cardAmount: draft.cardAmount }]
  const payments = rows.map((row, index) => {
    const amount = roundMoney(Number(row.amount || 0)); const method = row.method
    const cashAmount = method === 'cash' ? amount : method === 'mixed' ? roundMoney(Number((row as NightclubPaymentDraft).cashAmount || 0)) : 0
    const qrAmount = method === 'qr' ? amount : method === 'mixed' ? roundMoney(Number((row as NightclubPaymentDraft).qrAmount || 0)) : 0
    const cardAmount = method === 'card' ? amount : method === 'mixed' ? roundMoney(Number((row as NightclubPaymentDraft).cardAmount || 0)) : 0
    const received = roundMoney(Number(row.received ?? cashAmount))
    if (!Number.isFinite(amount) || amount <= 0 || !['cash', 'qr', 'card', 'mixed'].includes(method) || roundMoney(cashAmount + qrAmount + cardAmount) !== amount || received < cashAmount) throw new Error('El cobro de la diferencia no es v?lido.')
    return { id: index === 0 ? crypto.randomUUID() : crypto.randomUUID(), operationId, roundId, method, amount, cashAmount, qrAmount, cardAmount, received, change: roundMoney(received - cashAmount), paidAt: now, paidBy: actor, status: 'confirmed' as const, exchangeId }
  })
  if (roundMoney(payments.reduce((sum, payment) => sum + paymentAmount(payment), 0)) !== total) throw new Error('Los pagos deben cubrir exactamente la diferencia.')
  return payments
}

function reverseExchangeItemInventory(next: NightclubDataset, accountId: string, roundId: string, item: NightclubRoundItem, quantity: number, actor: string, now: string, exchangeId: string, treatment: 'recoverable' | 'waste' | 'internal_consumption') {
  const usages = item.stockUsage || []
  const scale = quantity
  const reason = treatment === 'recoverable' ? 'Cambio de producto: consumo revertido' : treatment === 'waste' ? 'Cambio de producto: merma autorizada' : 'Cambio de producto: consumo interno autorizado'
  for (const usage of usages) {
    const stock = next.inventory.find(candidate => candidate.id === usage.inventoryId)
    if (!stock) throw new Error('Falta el insumo original; revisa el inventario antes de cambiar.')
    const units = roundMoney(usage.quantity * scale * (usage.unit === 'l' || usage.unit === 'kg' ? 1000 : 1))
    if (treatment === 'recoverable') {
      if (usage.unit === 'ml' && stock.bottleCapacityMl) {
        const beforeOpen = stock.openBottleMl || 0; stock.openBottleMl = roundMoney(beforeOpen + units)
        next.inventoryMovements!.push({ id: crypto.randomUUID(), operationId: `exchange:${exchangeId}:${stock.id}`, inventoryId: stock.id, quantity: units, previous: stock.current, current: stock.current, type: 'reversal', reason, at: now, actor, accountId, roundId, productId: item.productId, openBottleMlBefore: beforeOpen, openBottleMlAfter: stock.openBottleMl, exchangeId })
      } else {
        const previous = stock.current; stock.current = roundMoney(previous + units)
        next.inventoryMovements!.push({ id: crypto.randomUUID(), operationId: `exchange:${exchangeId}:${stock.id}`, inventoryId: stock.id, quantity: units, previous, current: stock.current, type: 'reversal', reason, at: now, actor, accountId, roundId, productId: item.productId, exchangeId })
      }
    } else {
      const cost = roundMoney((usage.unit === 'ml' && stock.bottleCapacityMl ? (stock.unitCost || 0) / stock.bottleCapacityMl : stock.unitCost || 0) * units)
      next.inventoryMovements!.push({ id: crypto.randomUUID(), operationId: `exchange:${exchangeId}:${stock.id}:${treatment}`, inventoryId: stock.id, quantity: 0, previous: stock.current, current: stock.current, type: treatment, reason, at: now, actor, accountId, roundId, productId: item.productId, costAmount: cost, exchangeId })
    }
  }
}

/** Sustituye una l?nea pagada a?n no entregada, conserva evidencia y ajusta solo la diferencia. */
export function exchangeNightclubPaidProduct(dataset: NightclubDataset, draft: NightclubProductExchangeDraft, actor: string, now = new Date().toISOString(), role = actor): NightclubDataset {
  if (!draft.operationId.trim()) throw new Error('El cambio necesita una clave idempotente.')
  if ((dataset.audit || []).some(event => event.type === 'product_exchange' && event.details?.operationId === draft.operationId)) return dataset
  if (!['owner', 'admin'].includes(normalizeNightclubRole(role.toLocaleLowerCase()))) throw new Error('Solo Administraci?n puede autorizar cambios de productos pagados.')
  if (!draft.reason.trim() || !Number.isInteger(draft.quantity) || draft.quantity <= 0) throw new Error('Indica cantidad y motivo v?lidos.')
  const next = cloneDataset(dataset); const account = next.accounts.find(value => value.id === draft.accountId); const round = account?.rounds.find(value => value.id === draft.roundId)
  const source = round?.items.find(value => value.id === draft.itemId && value.status !== 'returned' && value.status !== 'cancelled')
  const replacement = next.products.find(value => value.id === draft.replacementProductId && value.active !== false)
  if (!account || !round || !source || !replacement || round.authorization !== 'payment' || round.status === 'cancelled') throw new Error('El producto pagado ya no est? disponible para cambio.')
  if (round.status === 'delivered') throw new Error('Este producto ya fue entregado. Solicita una devoluci?n o ajuste especial.')
  if (source.quantity < draft.quantity) throw new Error('La cantidad solicitada supera la l?nea original.')
  if (source.productId === replacement.id) throw new Error('Selecciona un producto diferente.')
  const treatment = round.status === 'pending' ? 'recoverable' : draft.preparedTreatment
  if (!treatment) throw new Error('El producto ya fue preparado. Elige si es recuperable, merma o consumo interno.')
  const exchangeId = crypto.randomUUID(); const originalValue = roundMoney(source.unitPrice * draft.quantity); const newValue = roundMoney(replacement.price * draft.quantity); const difference = roundMoney(newValue - originalValue)
  if (difference > 0 && !draft.additionalPayment) throw new Error('Primero registra el cobro de la diferencia.')
  if (difference < 0 && !draft.lowerSettlement) throw new Error('Elige c?mo se registrar? el saldo a devolver.')
  reverseExchangeItemInventory(next, account.id, round.id, source, draft.quantity, actor, now, exchangeId, treatment)
  const returned: NightclubRoundItem = { ...source, id: crypto.randomUUID(), quantity: draft.quantity, lineTotal: originalValue, costAtSale: roundMoney((source.costAtSale || 0) / source.quantity * draft.quantity), commercialValue: originalValue, status: 'returned', cancelledAt: now, cancelledBy: actor, cancelReason: draft.reason.trim(), exchangeId, exchangedForProductId: replacement.id }
  source.quantity -= draft.quantity; source.lineTotal = roundMoney(source.unitPrice * source.quantity); source.costAtSale = roundMoney((source.costAtSale || 0) - (returned.costAtSale || 0)); source.commercialValue = source.lineTotal
  if (source.quantity === 0) source.status = 'returned'
  round.items.push(returned)
  account.subtotal = roundMoney(account.rounds.filter(value => value.status !== 'cancelled').flatMap(value => value.items).filter(value => value.status !== 'returned' && value.status !== 'cancelled').reduce((sum, value) => sum + value.lineTotal, 0))
  const added = addNightclubRound(next, account.id, [{ productId: replacement.id, quantity: draft.quantity }], actor, now, `exchange:${draft.operationId}`)
  const addedAccount = added.accounts.find(value => value.id === account.id)!; const replacementRound = addedAccount.rounds.at(-1)!; replacementRound.authorization = 'payment'; replacementRound.paidAt = now; replacementRound.operationId = draft.operationId; replacementRound.serviceStaffId = round.serviceStaffId; replacementRound.serviceStaffName = round.serviceStaffName; replacementRound.customerId = round.customerId === undefined ? account.customerId || null : round.customerId; replacementRound.customerNameSnapshot = round.customerNameSnapshot
  const replacementItem = replacementRound.items[0]; replacementItem.exchangeId = exchangeId; replacementItem.exchangeSourceItemId = returned.id
  const payments = addedAccount.payments || []
  if (difference > 0) {
    const extra = exchangePayments(draft.additionalPayment!, difference, actor, now, draft.operationId, replacementRound.id, exchangeId)
    addedAccount.payments = [...payments, ...extra]; addedAccount.payment = extra.at(-1)
  } else if (difference < 0) {
    const originalPayment = payments.find(payment => payment.roundId === round.id) || payments[0]
    if (draft.lowerSettlement === 'cash_refund' && (!originalPayment || originalPayment.cashAmount < Math.abs(difference))) throw new Error('Solo puedes devolver efectivo que realmente ingres? en efectivo; registra devoluci?n electr?nica pendiente.')
    const method = draft.lowerSettlement === 'cash_refund' ? 'cash' : originalPayment?.method === 'card' ? 'card' : 'qr'
    const cashAmount = draft.lowerSettlement === 'cash_refund' ? Math.abs(difference) : 0
    const qrAmount = draft.lowerSettlement === 'pending_electronic_refund' && method === 'qr' ? Math.abs(difference) : 0
    const cardAmount = draft.lowerSettlement === 'pending_electronic_refund' && method === 'card' ? Math.abs(difference) : 0
    const refund: NightclubPayment = { id: crypto.randomUUID(), operationId: draft.operationId, roundId: replacementRound.id, method, amount: Math.abs(difference), cashAmount, qrAmount, cardAmount, received: 0, change: 0, paidAt: now, paidBy: actor, status: 'confirmed', kind: draft.lowerSettlement === 'cash_refund' ? 'exchange_refund' : 'pending_electronic_refund', exchangeId }
    addedAccount.payments = [...payments, refund]; addedAccount.payment = refund
  }
  for (const product of added.products) product.stockUnits = nightclubProductAvailability(product, added.inventory)
  synchronizeNightclubCommissions(added, now)
  audit(added, 'product_exchange', actor, now, addedAccount.id, { operationId: draft.operationId, exchangeId, roundId: round.id, replacementRoundId: replacementRound.id, originalProduct: source.name, replacementProduct: replacement.name, quantity: draft.quantity, originalValue, newValue, difference, treatment, settlement: draft.lowerSettlement || 'additional_payment', reason: draft.reason.trim() })
  return added
}

export function refundNightclubRound(dataset: NightclubDataset, accountId: string, roundId: string, actor: string, reason: string, now = new Date().toISOString()): NightclubDataset {
  if (reason.trim().length < 4) throw new Error('Indica el motivo del reembolso.')
  const next = cloneDataset(dataset); const account = next.accounts.find(item => item.id === accountId); const batch = account?.rounds.find(item => item.id === roundId)
  if (!account || !batch || batch.authorization !== 'payment' || !batch.paymentId || batch.status === 'cancelled') throw new Error('El pedido pagado no está disponible para reembolso.')
  const payments = (account.payments || []).filter(item => item.roundId === roundId || item.id === batch.paymentId)
  if (!payments.length || payments.some(item => item.status === 'refunded')) throw new Error('El pago ya fue reembolsado o falta su registro.')
  if (batch.status === 'delivered') throw new Error('La devolución de un pedido entregado necesita revisión física y ajuste de stock por separado.')
  synchronizeNightclubCommissions(next, now)
  const sales = (next.inventoryMovements || []).filter(item => item.accountId === accountId && item.roundId === roundId && item.type === 'sale')
  for (const movement of sales) {
    const stock = next.inventory.find(item => item.id === movement.inventoryId)
    if (!stock) throw new Error('Falta un insumo original; el reembolso requiere revisión manual.')
    const previous = stock.current; stock.current = roundMoney(previous - movement.quantity)
    next.inventoryMovements!.push({ id: crypto.randomUUID(), operationId: `refund:${roundId}:${stock.id}`, inventoryId: stock.id, quantity: -movement.quantity, previous, current: stock.current, type: 'reversal', reason: reason.trim(), at: now, actor, accountId, roundId })
  }
  for (const payment of payments) { payment.status = 'refunded'; payment.refundedAt = now; payment.refundedBy = actor; payment.refundReason = reason.trim() }
  batch.status = 'cancelled'; batch.cancelledAt = now; batch.cancelledBy = actor; batch.cancellationReason = reason.trim()
  account.subtotal = roundMoney(account.rounds.filter(item => item.status !== 'cancelled').flatMap(item => item.items).filter(item => item.status !== 'cancelled' && item.status !== 'returned').reduce((sum, item) => sum + item.lineTotal, 0))
  for (const product of next.products) product.stockUnits = nightclubProductAvailability(product, next.inventory)
  synchronizeNightclubCommissions(next, now)
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
  account.subtotal = roundMoney(account.rounds.filter(item => item.status !== 'cancelled').flatMap(item => item.items).filter(item => item.status !== 'cancelled' && item.status !== 'returned').reduce((sum, item) => sum + item.lineTotal, 0))
  for (const product of next.products) product.stockUnits = nightclubProductAvailability(product, next.inventory)
  synchronizeNightclubCommissions(next, now)
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
  const payment: NightclubPayment = { id: crypto.randomUUID(), operationId: paymentDraft.operationId, allocations: nightclubPaymentAllocations(account, total), method: paymentDraft.method, amount: total, cashAmount, qrAmount, cardAmount, received, change: roundMoney(received - cashAmount), paidAt: now, paidBy: actor }
  account.payments = [...accountPayments(account), payment]; account.payment = payment; account.shiftId ||= next.shift.id
  const remaining = nightclubBalance(account)
  if (remaining === 0 && account.rounds.every(round => round.status === 'cancelled' || round.status === 'delivered')) {
    account.status = 'closed'; account.paidAt = now
    const tableId = accountTableId(account); const table = tableId ? next.tables.find(item => item.id === tableId) : undefined
    if (table) { table.status = 'available'; delete table.activeAccountId; delete table.reservationName }
  }
  synchronizeNightclubCommissions(next, now)
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
  const inventoryCost = (type: 'waste' | 'courtesy' | 'internal_consumption') => roundMoney((dataset.inventoryMovements || []).filter(movement => movement.type === type).reduce((sum, movement) => sum + (movement.costAmount ?? Math.abs(movement.quantity) * (dataset.inventory.find(item => item.id === movement.inventoryId)?.unitCost || 0)), 0))
  const waste = inventoryCost('waste'); const courtesies = inventoryCost('courtesy'); const internal = inventoryCost('internal_consumption')
  const expenses = roundMoney((dataset.cashMovements || []).filter(movement => movement.shiftId === shiftId && movement.type === 'expense' && movement.category !== 'inventory_purchase' && !movement.commissionPaymentId).reduce((sum, movement) => sum + movement.amount, 0))
  const commissions = roundMoney((dataset.commissions || []).filter(entry => entry.shiftId === shiftId && ['earned', 'paid'].includes(entry.status)).reduce((sum, entry) => sum + entry.amount, 0))
  const grossProfit = roundMoney(cash.totalSales - costOfSales); const totalExpenses = roundMoney(expenses + commissions + waste + courtesies + internal); const netProfit = roundMoney(grossProfit - totalExpenses)
  return { ...cash, costOfSales, grossProfit, expenses, commissions, waste, courtesies, internal, totalExpenses, netProfit, grossMargin: cash.totalSales ? grossProfit / cash.totalSales * 100 : 0, netMargin: cash.totalSales ? netProfit / cash.totalSales * 100 : 0 }
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
