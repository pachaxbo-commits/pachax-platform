export type NightclubTableStatus = 'available' | 'occupied' | 'reserved' | 'bill_requested'
export type NightclubAccountStatus = 'open' | 'bill_requested' | 'closed'

export interface NightclubZone { id: string; name: string; sortOrder: number }
export interface NightclubTable {
  id: string; name: string; zoneId: string; capacity: number; status: NightclubTableStatus
  activeAccountId?: string; reservationName?: string
}
export interface NightclubProduct {
  id: string; category: string; name: string; price: number; preparationArea: 'Barra' | 'Directo'
  stockUnits: number
}
export interface NightclubRoundItem { id: string; productId: string; name: string; quantity: number; unitPrice: number; lineTotal: number }
export interface NightclubRound { id: string; sequence: number; createdAt: string; status: 'pending' | 'preparing' | 'ready'; items: NightclubRoundItem[] }
export interface NightclubAccount {
  id: string; tableId: string; customerId?: string; openedAt: string; openedBy: string
  status: NightclubAccountStatus; rounds: NightclubRound[]; subtotal: number; paidAt?: string
}
export interface NightclubShift { id: string; status: 'open' | 'closed'; openedAt: string; openingFloat: number; openedBy: string }
export interface NightclubCustomer { id: string; name: string; phone: string; visits: number; totalSpent: number }
export interface NightclubReservation { id: string; tableId: string; customerName: string; time: string; guests: number; status: 'confirmed' | 'arrived' }
export interface NightclubInventoryItem { id: string; name: string; unit: 'unit' | 'ml'; current: number; minimum: number }
export interface NightclubDataset {
  zones: NightclubZone[]
  tables: NightclubTable[]
  products: NightclubProduct[]
  accounts: NightclubAccount[]
  shift: NightclubShift | null
  customers: NightclubCustomer[]
  reservations: NightclubReservation[]
  inventory: NightclubInventoryItem[]
}

export interface NightclubRoundDraft { productId: string; quantity: number }

function cloneDataset(dataset: NightclubDataset): NightclubDataset {
  return structuredClone(dataset)
}

export function openNightclubShift(dataset: NightclubDataset, actor: string, openingFloat: number, now = new Date().toISOString()): NightclubDataset {
  if (!Number.isFinite(openingFloat) || openingFloat < 0) throw new Error('El fondo inicial no es válido.')
  if (dataset.shift?.status === 'open') throw new Error('Ya existe un turno abierto.')
  const next = cloneDataset(dataset)
  next.shift = { id: `night-shift-${Date.parse(now) || Date.now()}`, status: 'open', openedAt: now, openingFloat, openedBy: actor }
  return next
}

export function openNightclubAccount(dataset: NightclubDataset, tableId: string, actor: string, now = new Date().toISOString()): NightclubDataset {
  const next = cloneDataset(dataset)
  const table = next.tables.find(item => item.id === tableId)
  if (!next.shift || next.shift.status !== 'open') throw new Error('Debes abrir el turno antes de abrir una cuenta.')
  if (!table) throw new Error('Mesa no encontrada.')
  if (table.status === 'occupied' || table.status === 'bill_requested' || table.activeAccountId) throw new Error('La mesa ya tiene una cuenta activa.')
  const accountId = `account-${table.id}-${Date.parse(now) || Date.now()}`
  next.accounts.push({ id: accountId, tableId, openedAt: now, openedBy: actor, status: 'open', rounds: [], subtotal: 0 })
  table.status = 'occupied'
  table.activeAccountId = accountId
  return next
}

export function addNightclubRound(dataset: NightclubDataset, accountId: string, drafts: NightclubRoundDraft[], now = new Date().toISOString()): NightclubDataset {
  if (!drafts.length || drafts.some(item => !Number.isInteger(item.quantity) || item.quantity <= 0)) throw new Error('La ronda debe incluir cantidades válidas.')
  const next = cloneDataset(dataset)
  const account = next.accounts.find(item => item.id === accountId)
  if (!account || account.status !== 'open') throw new Error('La cuenta no acepta nuevas rondas.')
  const items = drafts.map((draft, index) => {
    const product = next.products.find(item => item.id === draft.productId)
    if (!product) throw new Error('Producto no encontrado.')
    if (product.stockUnits < draft.quantity) throw new Error(`Stock insuficiente para ${product.name}.`)
    product.stockUnits -= draft.quantity
    return { id: `${accountId}-r${account.rounds.length + 1}-${index + 1}`, productId: product.id, name: product.name, quantity: draft.quantity, unitPrice: product.price, lineTotal: product.price * draft.quantity }
  })
  account.rounds.push({ id: `${accountId}-round-${account.rounds.length + 1}`, sequence: account.rounds.length + 1, createdAt: now, status: 'pending', items })
  account.subtotal = account.rounds.flatMap(round => round.items).reduce((sum, item) => sum + item.lineTotal, 0)
  return next
}

export function requestNightclubBill(dataset: NightclubDataset, accountId: string): NightclubDataset {
  const next = cloneDataset(dataset)
  const account = next.accounts.find(item => item.id === accountId)
  if (!account || account.status !== 'open' || account.rounds.length === 0) throw new Error('La cuenta no puede solicitarse todavía.')
  account.status = 'bill_requested'
  const table = next.tables.find(item => item.id === account.tableId)
  if (table) table.status = 'bill_requested'
  return next
}

export function closeNightclubAccount(dataset: NightclubDataset, accountId: string, now = new Date().toISOString()): NightclubDataset {
  const next = cloneDataset(dataset)
  const account = next.accounts.find(item => item.id === accountId)
  if (!account || account.status !== 'bill_requested') throw new Error('Primero debe solicitarse la cuenta.')
  account.status = 'closed'
  account.paidAt = now
  const table = next.tables.find(item => item.id === account.tableId)
  if (table) { table.status = 'available'; delete table.activeAccountId; delete table.reservationName }
  return next
}
