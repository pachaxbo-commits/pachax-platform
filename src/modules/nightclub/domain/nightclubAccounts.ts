export type NightclubTableStatus = 'available' | 'occupied' | 'reserved' | 'bill_requested'
export type NightclubAccountStatus = 'open' | 'bill_requested' | 'closed'
export type NightclubPaymentMethod = 'cash' | 'qr' | 'card' | 'mixed'

export interface NightclubZone { id: string; name: string; sortOrder: number }
export interface NightclubTable { id: string; name: string; zoneId: string; capacity: number; status: NightclubTableStatus; activeAccountId?: string; reservationName?: string }
export interface NightclubRecipeLine { inventoryId: string; quantity: number }
export interface NightclubProduct { id: string; category: string; name: string; price: number; preparationArea: 'Barra' | 'Directo'; stockUnits: number; recipe?: NightclubRecipeLine[]; active?: boolean }
export interface NightclubRoundItem { id: string; productId: string; name: string; quantity: number; unitPrice: number; lineTotal: number }
export interface NightclubRound { id: string; sequence: number; createdAt: string; status: 'pending' | 'preparing' | 'ready'; items: NightclubRoundItem[]; startedAt?: string; readyAt?: string; sentBy?: string }
export interface NightclubPayment { method: NightclubPaymentMethod; cashAmount: number; qrAmount: number; cardAmount: number; received: number; change: number; paidAt: string; paidBy: string }
export interface NightclubAccount { id: string; tableId: string; customerId?: string; shiftId?: string; openedAt: string; openedBy: string; status: NightclubAccountStatus; rounds: NightclubRound[]; subtotal: number; paidAt?: string; payment?: NightclubPayment }
export interface NightclubShift { id: string; status: 'open' | 'closed'; openedAt: string; openingFloat: number; openedBy: string; closedAt?: string; closedBy?: string; countedCash?: number; expectedCash?: number; difference?: number }
export interface NightclubCustomer { id: string; name: string; phone: string; notes?: string; active?: boolean; visits: number; totalSpent: number }
export interface NightclubStaff { id: string; name: string; role: 'admin' | 'cashier' | 'service' | 'bar' | 'inventory'; active: boolean }
export interface NightclubReservation { id: string; tableId: string; customerName: string; time: string; guests: number; status: 'confirmed' | 'arrived' | 'cancelled' }
export interface NightclubInventoryItem { id: string; name: string; unit: 'unit' | 'ml' | 'g'; current: number; minimum: number }
export interface NightclubInventoryMovement { id: string; operationId: string; inventoryId: string; quantity: number; previous: number; current: number; type: 'sale' | 'adjustment'; at: string; actor: string; accountId?: string; roundId?: string }
export interface NightclubCashMovement { id: string; shiftId: string; type: 'income' | 'expense'; method: 'cash' | 'qr' | 'card'; amount: number; description: string; at: string; actor: string }
export interface NightclubAuditEvent { id: string; type: string; at: string; actor: string; accountId?: string; details?: Record<string, string | number> }
export interface NightclubDataset { zones: NightclubZone[]; tables: NightclubTable[]; products: NightclubProduct[]; accounts: NightclubAccount[]; shift: NightclubShift | null; shiftHistory?: NightclubShift[]; customers: NightclubCustomer[]; staff?: NightclubStaff[]; reservations: NightclubReservation[]; inventory: NightclubInventoryItem[]; inventoryMovements?: NightclubInventoryMovement[]; cashMovements?: NightclubCashMovement[]; audit?: NightclubAuditEvent[] }
export interface NightclubRoundDraft { productId: string; quantity: number }
export interface NightclubPaymentDraft { method: NightclubPaymentMethod; received?: number; cashAmount?: number; qrAmount?: number; cardAmount?: number }

const round = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100
const cloneDataset = (dataset: NightclubDataset): NightclubDataset => structuredClone(dataset)
const event = (next: NightclubDataset, type: string, actor: string, at: string, accountId?: string, details?: NightclubAuditEvent['details']) => { next.audit = [...(next.audit || []), { id: crypto.randomUUID(), type, actor, at, accountId, details }] }

export function nightclubProductAvailability(product: NightclubProduct, inventory: NightclubInventoryItem[]) {
  if (product.active === false) return 0
  const recipe = product.recipe || []
  if (!recipe.length) return product.stockUnits
  return Math.max(0, Math.floor(Math.min(...recipe.map(line => {
    const stock = inventory.find(item => item.id === line.inventoryId)
    return stock && line.quantity > 0 ? stock.current / line.quantity : 0
  }))))
}

export function nightclubCashSummary(dataset: NightclubDataset, shiftId = dataset.shift?.id) {
  const payments = dataset.accounts.filter(account => account.shiftId === shiftId && account.status === 'closed').map(account => account.payment).filter((payment): payment is NightclubPayment => !!payment)
  const cashSales = round(payments.reduce((sum, payment) => sum + payment.cashAmount, 0))
  const qrSales = round(payments.reduce((sum, payment) => sum + payment.qrAmount, 0))
  const cardSales = round(payments.reduce((sum, payment) => sum + payment.cardAmount, 0))
  const movements = (dataset.cashMovements || []).filter(item => item.shiftId === shiftId)
  const cashIncome = round(movements.filter(item => item.method === 'cash' && item.type === 'income').reduce((sum, item) => sum + item.amount, 0))
  const cashOutflow = round(movements.filter(item => item.method === 'cash' && item.type === 'expense').reduce((sum, item) => sum + item.amount, 0))
  const float = dataset.shift && dataset.shift.id === shiftId ? dataset.shift.openingFloat : dataset.shiftHistory?.find(item => item.id === shiftId)?.openingFloat || 0
  return { cashSales, qrSales, cardSales, totalSales: round(cashSales + qrSales + cardSales), cashIncome, cashOutflow, expectedCash: round(float + cashSales + cashIncome - cashOutflow) }
}

export function openNightclubShift(dataset: NightclubDataset, actor: string, openingFloat: number, now = new Date().toISOString()): NightclubDataset {
  if (!Number.isFinite(openingFloat) || openingFloat < 0) throw new Error('El fondo inicial no es válido.')
  if (dataset.shift?.status === 'open') throw new Error('Ya existe un turno abierto.')
  const next = cloneDataset(dataset)
  if (next.shift?.status === 'closed') next.shiftHistory = [...(next.shiftHistory || []), next.shift]
  next.shift = { id: crypto.randomUUID(), status: 'open', openedAt: now, openingFloat, openedBy: actor }
  event(next, 'shift_opened', actor, now, undefined, { openingFloat })
  return next
}

export function closeNightclubShift(dataset: NightclubDataset, actor: string, countedCash: number, now = new Date().toISOString()): NightclubDataset {
  if (dataset.shift?.status !== 'open') throw new Error('No hay turno abierto.')
  if (dataset.accounts.some(account => account.status !== 'closed')) throw new Error('No puedes cerrar el turno mientras existan cuentas abiertas.')
  if (!Number.isFinite(countedCash) || countedCash < 0) throw new Error('Ingresa el efectivo contado.')
  const next = cloneDataset(dataset)
  const summary = nightclubCashSummary(next)
  next.shift = { ...next.shift!, status: 'closed', closedAt: now, closedBy: actor, countedCash, expectedCash: summary.expectedCash, difference: round(countedCash - summary.expectedCash) }
  event(next, 'shift_closed', actor, now, undefined, { countedCash, difference: next.shift.difference || 0 })
  return next
}

export function openNightclubAccount(dataset: NightclubDataset, tableId: string, actor: string, now = new Date().toISOString()): NightclubDataset {
  const next = cloneDataset(dataset)
  const table = next.tables.find(item => item.id === tableId)
  if (next.shift?.status !== 'open') throw new Error('Debes abrir el turno antes de abrir una cuenta.')
  if (!table) throw new Error('Mesa no encontrada.')
  if (table.status === 'reserved') throw new Error('Libera la reserva antes de abrir la mesa.')
  if (table.status === 'occupied' || table.status === 'bill_requested' || table.activeAccountId) throw new Error('La mesa ya tiene una cuenta activa.')
  const accountId = crypto.randomUUID()
  next.accounts.push({ id: accountId, tableId, shiftId: next.shift.id, openedAt: now, openedBy: actor, status: 'open', rounds: [], subtotal: 0 })
  table.status = 'occupied'; table.activeAccountId = accountId
  event(next, 'account_opened', actor, now, accountId)
  return next
}

export function addNightclubRound(dataset: NightclubDataset, accountId: string, drafts: NightclubRoundDraft[], actor = 'Equipo', now = new Date().toISOString()): NightclubDataset {
  if (!drafts.length || drafts.some(item => !Number.isInteger(item.quantity) || item.quantity <= 0)) throw new Error('La ronda debe incluir cantidades válidas.')
  const next = cloneDataset(dataset)
  const account = next.accounts.find(item => item.id === accountId)
  if (next.shift?.status !== 'open' || !account || account.status !== 'open') throw new Error('La cuenta no acepta nuevas rondas.')
  const requirements = new Map<string, number>()
  const items = drafts.map((draft) => {
    const product = next.products.find(item => item.id === draft.productId && item.active !== false)
    if (!product) throw new Error('Producto no encontrado o inactivo.')
    const recipe = product.recipe?.length ? product.recipe : [{ inventoryId: `inventory-${product.id}`, quantity: 1 }]
    for (const part of recipe) requirements.set(part.inventoryId, (requirements.get(part.inventoryId) || 0) + part.quantity * draft.quantity)
    return { id: crypto.randomUUID(), productId: product.id, name: product.name, quantity: draft.quantity, unitPrice: product.price, lineTotal: round(product.price * draft.quantity) }
  })
  for (const [inventoryId, quantity] of requirements) {
    const stock = next.inventory.find(item => item.id === inventoryId)
    if (!stock || !Number.isFinite(quantity) || quantity <= 0) throw new Error('Configura la receta y sus insumos antes de vender.')
    if (stock.current < quantity) throw new Error(`Stock insuficiente para ${stock.name}.`)
  }
  const roundId = crypto.randomUUID()
  for (const [inventoryId, quantity] of requirements) {
    const stock = next.inventory.find(item => item.id === inventoryId)!
    const previous = stock.current; stock.current = round(previous - quantity)
    next.inventoryMovements = [...(next.inventoryMovements || []), { id: crypto.randomUUID(), operationId: `round:${roundId}:${inventoryId}`, inventoryId, quantity: -quantity, previous, current: stock.current, type: 'sale', at: now, actor, accountId, roundId }]
  }
  account.rounds.push({ id: roundId, sequence: account.rounds.length + 1, createdAt: now, status: 'pending', sentBy: actor, items })
  account.subtotal = round(account.rounds.flatMap(item => item.items).reduce((sum, item) => sum + item.lineTotal, 0))
  for (const product of next.products) product.stockUnits = nightclubProductAvailability(product, next.inventory)
  event(next, 'round_sent', actor, now, accountId, { roundId, total: round(items.reduce((sum, item) => sum + item.lineTotal, 0)) })
  return next
}

export function advanceNightclubRound(dataset: NightclubDataset, accountId: string, roundId: string, actor: string, now = new Date().toISOString()): NightclubDataset {
  const next = cloneDataset(dataset); const account = next.accounts.find(item => item.id === accountId); const batch = account?.rounds.find(item => item.id === roundId)
  if (!account || !batch || batch.status === 'ready') throw new Error('Ronda no disponible.')
  if (batch.status === 'pending') { batch.status = 'preparing'; batch.startedAt = now } else { batch.status = 'ready'; batch.readyAt = now }
  event(next, 'round_status_changed', actor, now, accountId, { roundId, status: batch.status })
  return next
}

export function requestNightclubBill(dataset: NightclubDataset, accountId: string, actor = 'Equipo', now = new Date().toISOString()): NightclubDataset {
  const next = cloneDataset(dataset); const account = next.accounts.find(item => item.id === accountId)
  if (!account || account.status !== 'open' || account.rounds.length === 0) throw new Error('La cuenta no puede solicitarse todavía.')
  account.status = 'bill_requested'; const table = next.tables.find(item => item.id === account.tableId); if (table) table.status = 'bill_requested'
  event(next, 'bill_requested', actor, now, accountId); return next
}

export function reopenNightclubBill(dataset: NightclubDataset, accountId: string, actor: string, now = new Date().toISOString()): NightclubDataset {
  const next = cloneDataset(dataset); const account = next.accounts.find(item => item.id === accountId)
  if (!account || account.status !== 'bill_requested') throw new Error('La cuenta no está por cobrarse.')
  account.status = 'open'; const table = next.tables.find(item => item.id === account.tableId); if (table) table.status = 'occupied'
  event(next, 'bill_reopened', actor, now, accountId); return next
}

export function closeNightclubAccount(dataset: NightclubDataset, accountId: string, paymentDraft: NightclubPaymentDraft = { method: 'cash' }, actor = 'Caja', now = new Date().toISOString()): NightclubDataset {
  const next = cloneDataset(dataset); const account = next.accounts.find(item => item.id === accountId)
  if (!account || account.status !== 'bill_requested') throw new Error('Primero debe solicitarse la cuenta.')
  if (next.shift?.status !== 'open') throw new Error('Debes abrir el turno antes de cobrar.')
  const total = round(account.subtotal)
  const cashAmount = round(paymentDraft.method === 'cash' ? total : paymentDraft.method === 'mixed' ? paymentDraft.cashAmount || 0 : 0)
  const qrAmount = round(paymentDraft.method === 'qr' ? total : paymentDraft.method === 'mixed' ? paymentDraft.qrAmount || 0 : 0)
  const cardAmount = round(paymentDraft.method === 'card' ? total : paymentDraft.method === 'mixed' ? paymentDraft.cardAmount || 0 : 0)
  if (round(cashAmount + qrAmount + cardAmount) !== total || [cashAmount, qrAmount, cardAmount].some(value => value < 0)) throw new Error('Los métodos de pago deben cubrir el total exacto.')
  const received = round(paymentDraft.received ?? cashAmount); if (received < cashAmount) throw new Error('Monto insuficiente.')
  account.status = 'closed'; account.paidAt = now; account.payment = { method: paymentDraft.method, cashAmount, qrAmount, cardAmount, received, change: round(received - cashAmount), paidAt: now, paidBy: actor }; account.shiftId ||= next.shift.id
  const table = next.tables.find(item => item.id === account.tableId); if (table) { table.status = 'available'; delete table.activeAccountId; delete table.reservationName }
  event(next, 'payment_confirmed', actor, now, accountId, { total, cashAmount, qrAmount, cardAmount, change: account.payment.change }); return next
}

export function recordNightclubCashMovement(dataset: NightclubDataset, draft: Omit<NightclubCashMovement, 'id' | 'shiftId' | 'at' | 'actor'>, actor: string, now = new Date().toISOString()): NightclubDataset {
  if (dataset.shift?.status !== 'open') throw new Error('Abre un turno para registrar movimientos.')
  if (!Number.isFinite(draft.amount) || draft.amount <= 0 || !draft.description.trim()) throw new Error('Ingresa monto y concepto válidos.')
  const next = cloneDataset(dataset); next.cashMovements = [...(next.cashMovements || []), { ...draft, id: crypto.randomUUID(), shiftId: next.shift!.id, at: now, actor }]
  event(next, 'cash_movement', actor, now, undefined, { amount: draft.amount, type: draft.type }); return next
}

export function adjustNightclubInventory(dataset: NightclubDataset, inventoryId: string, current: number, actor: string, now = new Date().toISOString()): NightclubDataset {
  if (!Number.isFinite(current) || current < 0) throw new Error('La cantidad debe ser válida.')
  const next = cloneDataset(dataset); const stock = next.inventory.find(item => item.id === inventoryId); if (!stock) throw new Error('Insumo no encontrado.')
  const previous = stock.current; stock.current = round(current)
  if (previous !== stock.current) next.inventoryMovements = [...(next.inventoryMovements || []), { id: crypto.randomUUID(), operationId: crypto.randomUUID(), inventoryId, quantity: round(current - previous), previous, current: stock.current, type: 'adjustment', at: now, actor }]
  for (const product of next.products) product.stockUnits = nightclubProductAvailability(product, next.inventory)
  event(next, 'inventory_adjusted', actor, now, undefined, { inventoryId, previous, current: stock.current }); return next
}
