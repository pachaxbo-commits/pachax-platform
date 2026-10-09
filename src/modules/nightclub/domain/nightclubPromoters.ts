import type { NightclubDataset } from './nightclubAccounts'
import { normalizeNightclubBirthday } from './nightclubCustomers.ts'

export interface NightclubPromoter {
  id: string
  name: string
  phone: string
  birthday?: string
  document?: string
  joinedAt: string
  active: boolean
  createdAt?: string
  updatedAt?: string
}
export type NightclubEventStatus = 'planned' | 'open' | 'closed'
export interface NightclubPromoterEvent {
  id: string
  name: string
  date: string
  status: NightclubEventStatus
  createdAt: string
  updatedAt?: string
}
/** Future allocation and settlement records require an approved operational procedure.
 * These fields are deliberately not used to reserve stock, create debt or post cash. */
export interface NightclubTicketControlPlan {
  eventId: string
  promoterId: string
  assignedQuantity?: number
  availableQuantity?: number
  reportedAmount?: number
}
export type NightclubTicketStatus = 'pending' | 'paid' | 'cancelled'
export interface NightclubTicketSale {
  id: string
  promoterId: string
  eventId?: string
  eventName?: string
  eventDate: string
  ticketType: string
  quantity: number
  unitPrice: number
  total: number
  status: NightclubTicketStatus
  operationId: string
  createdAt: string
  createdBy: string
  updatedAt?: string
  updatedBy?: string
  corrections?: Array<{ at: string; actor: string; reason: string; previous: { eventId?: string; eventName?: string; eventDate: string; ticketType: string; quantity: number; unitPrice: number; total: number; status: NightclubTicketStatus } }>
}
export type NightclubLoungeSaleStatus = 'reserved' | 'paid' | 'cancelled'
export interface NightclubLoungeSale {
  id: string
  promoterId: string
  eventId?: string
  eventName?: string
  eventDate: string
  reservationDate?: string
  loungeId: string
  loungeName: string
  customerId?: string
  customerName?: string
  agreedPrice: number
  status: NightclubLoungeSaleStatus
  operationId: string
  createdAt: string
  createdBy: string
  updatedAt?: string
  updatedBy?: string
  corrections?: Array<{ at: string; actor: string; reason: string; kind?: 'payment' | 'correction'; previous: { eventId?: string; eventDate: string; reservationDate?: string; loungeId: string; loungeName?: string; customerId?: string; customerName?: string; agreedPrice: number; status: NightclubLoungeSaleStatus } }>
}
export type NightclubLoungeSaleDraft = Pick<NightclubLoungeSale, 'id' | 'promoterId' | 'loungeId' | 'customerId' | 'agreedPrice' | 'status' | 'operationId'> & { reservationDate: string; eventId?: string; correctionReason?: string }
export type NightclubPromoterConsumptionKind = 'courtesy' | 'own_purchase'
export interface NightclubPromoterConsumption {
  id: string
  promoterId: string
  date: string
  concept: string
  amount: number
  kind: NightclubPromoterConsumptionKind
  notes?: string
  createdAt: string
  createdBy: string
}
export type NightclubSaleDraft = Pick<NightclubTicketSale, 'id' | 'promoterId' | 'eventId' | 'eventName' | 'eventDate' | 'ticketType' | 'quantity' | 'unitPrice' | 'status' | 'operationId'> & { correctionReason?: string }
export type NightclubConsumptionDraft = Pick<NightclubPromoterConsumption, 'id' | 'promoterId' | 'date' | 'concept' | 'amount' | 'kind' | 'notes'>
export type NightclubRankingFilter = { scope: 'weekend' | 'month' | 'all' | 'event'; date?: string; eventId?: string; eventName?: string; search?: string; sort?: 'tickets' | 'lounges' | 'totalValue' | 'revenue' | 'name' }

const admin = (role: string) => { if (!['owner', 'admin'].includes(role)) throw new Error('Solo Administración puede gestionar relacionadores.') }
const seller = (role: string) => { if (!['owner', 'admin', 'cashier'].includes(role)) throw new Error('No tienes permiso para registrar ventas de relacionadores.') }
const cents = (value: number) => Math.round((value + Number.EPSILON) * 100)
const money = (value: number) => cents(value) / 100
const hasCentPrecision = (value: number) => Math.abs(value * 100 - Math.round(value * 100)) < 0.000001
const date = (value: string) => {
  try { if (!normalizeNightclubBirthday(value)) throw new Error() } catch { throw new Error('Ingresa una fecha válida.') }
  return value
}
const audit = (next: NightclubDataset, type: string, actor: string, at: string, promoterId: string, recordId?: string) => {
  next.audit = [...(next.audit || []), { id: crypto.randomUUID(), type, actor, at, details: { promoterId, ...(recordId ? { recordId } : {}) } }]
}
const assertPromoter = (next: NightclubDataset, id: string) => {
  const person = (next.promoters || []).find(item => item.id === id)
  if (!person) throw new Error('Relacionador no encontrado.')
  return person
}

export function saveNightclubPromoterEvent(dataset: NightclubDataset, input: Pick<NightclubPromoterEvent, 'id' | 'name' | 'date' | 'status'>, actor: string, role: string, at = new Date().toISOString()): NightclubDataset {
  admin(role)
  const name = input.name.trim()
  const day = date(input.date)
  if (!input.id || !name || name.length > 120 || !['planned', 'open', 'closed'].includes(input.status)) throw new Error('Revisa nombre, fecha y estado de la jornada.')
  const next = structuredClone(dataset)
  next.promoterEvents ||= []
  const previous = next.promoterEvents.find(item => item.id === input.id)
  if (next.promoterEvents.some(item => item.id !== input.id && item.date === day && item.name.toLocaleLowerCase() === name.toLocaleLowerCase())) throw new Error('Ya existe una jornada con ese nombre y fecha.')
  const saved: NightclubPromoterEvent = { id: input.id, name, date: day, status: input.status, createdAt: previous?.createdAt || at, ...(previous ? { updatedAt: at } : {}) }
  next.promoterEvents = previous ? next.promoterEvents.map(item => item.id === input.id ? saved : item) : [...next.promoterEvents, saved]
  // A renamed jornada keeps its stable ID. Historical sales without an ID remain unassigned.
  next.promoterTicketSales = (next.promoterTicketSales || []).map(sale => sale.eventId === input.id ? { ...sale, eventName: name, eventDate: day } : sale)
  audit(next, previous ? 'promoter_event_updated' : 'promoter_event_created', actor, at, input.id)
  return next
}

export function saveNightclubPromoter(dataset: NightclubDataset, input: NightclubPromoter, actor: string, role: string, at = new Date().toISOString()): NightclubDataset {
  admin(role)
  const name = input.name.trim()
  if (!input.id || !name || name.length > 120) throw new Error('Ingresa un nombre válido.')
  const phone = input.phone.trim()
  if (phone.length > 40 || (input.document || '').trim().length > 60) throw new Error('Revisa teléfono y documento.')
  const joinedAt = date(input.joinedAt)
  const birthday = normalizeNightclubBirthday(input.birthday)
  const next = structuredClone(dataset)
  next.promoters ||= []
  const previous = next.promoters.find(item => item.id === input.id)
  const duplicate = next.promoters.some(item => item.id !== input.id && item.name.toLocaleLowerCase() === name.toLocaleLowerCase() && !!phone && item.phone === phone)
  if (duplicate) throw new Error('Ya existe un relacionador con ese nombre y teléfono.')
  const saved: NightclubPromoter = { id: input.id, name, phone, ...(birthday ? { birthday } : {}), ...(input.document?.trim() ? { document: input.document.trim() } : {}), joinedAt, active: input.active, createdAt: previous?.createdAt || at, updatedAt: at }
  next.promoters = previous ? next.promoters.map(item => item.id === input.id ? saved : item) : [...next.promoters, saved]
  audit(next, previous ? 'promoter_updated' : 'promoter_created', actor, at, input.id)
  return next
}

export function deleteNightclubPromoter(dataset: NightclubDataset, id: string, actor: string, role: string, at = new Date().toISOString()): NightclubDataset {
  admin(role)
  if (!(dataset.promoters || []).some(item => item.id === id)) throw new Error('Relacionador no encontrado.')
  if ((dataset.promoterTicketSales || []).some(item => item.promoterId === id) || (dataset.promoterLoungeSales || []).some(item => item.promoterId === id) || (dataset.promoterConsumptions || []).some(item => item.promoterId === id)) throw new Error('Tiene movimientos. Desactívalo para conservar la trazabilidad.')
  const next = structuredClone(dataset)
  next.promoters = (next.promoters || []).filter(item => item.id !== id)
  audit(next, 'promoter_deleted', actor, at, id)
  return next
}

export function saveNightclubTicketSale(dataset: NightclubDataset, input: NightclubSaleDraft, actor: string, role: string, at = new Date().toISOString()): NightclubDataset {
  seller(role)
  if (!input.id || !input.operationId) throw new Error('La venta necesita identificadores.')
  const next = structuredClone(dataset)
  const promoter = assertPromoter(next, input.promoterId)
  next.promoterTicketSales ||= []
  const previous = next.promoterTicketSales.find(item => item.id === input.id)
  const sameOperation = next.promoterTicketSales.find(item => item.operationId === input.operationId)
  if (sameOperation) {
    if (previous && sameOperation.id === previous.id && previous.eventDate === input.eventDate && previous.ticketType === input.ticketType.trim() && previous.quantity === input.quantity && previous.unitPrice === input.unitPrice && previous.status === input.status && (previous.eventId || '') === (input.eventId || '') && (previous.eventName || '') === (input.eventName?.trim() || '')) return dataset
    throw new Error('La operación ya se registró.')
  }
  if (!previous && !promoter.active) throw new Error('El relacionador está inactivo.')
  const linkedEvent = input.eventId ? (next.promoterEvents || []).find(item => item.id === input.eventId) : undefined
  if (input.eventId && !linkedEvent) throw new Error('La jornada seleccionada no existe.')
  if (linkedEvent && !previous && linkedEvent.status === 'closed') throw new Error('La jornada está cerrada.')
  const eventDate = linkedEvent?.date || date(input.eventDate)
  const eventName = linkedEvent?.name || input.eventName?.trim() || undefined
  const ticketType = input.ticketType.trim()
  const quantity = Number(input.quantity)
  const unitPrice = Number(input.unitPrice)
  if (!ticketType || !Number.isInteger(quantity) || quantity <= 0 || quantity > 10000 || !Number.isFinite(unitPrice) || unitPrice < 0 || !hasCentPrecision(unitPrice)) throw new Error('Revisa tipo, cantidad y precio de entradas.')
  if (!['pending', 'paid', 'cancelled'].includes(input.status)) throw new Error('Estado de venta inválido.')
  const total = money(quantity * unitPrice)
  if (!Number.isSafeInteger(cents(total))) throw new Error('Total fuera de rango.')
  if (!previous && next.promoterTicketSales.some(item => item.promoterId === input.promoterId && item.eventDate === eventDate && (item.eventId || '') === (input.eventId || '') && item.ticketType.toLocaleLowerCase() === ticketType.toLocaleLowerCase() && item.quantity === quantity && item.unitPrice === unitPrice && item.status !== 'cancelled')) throw new Error('Posible venta duplicada. Edita el registro existente.')
  const correctionReason = input.correctionReason?.trim() || ''
  if (previous && correctionReason.length < 4) throw new Error('Indica el motivo de la corrección.')
  const snapshot = previous ? { eventId: previous.eventId, eventName: previous.eventName, eventDate: previous.eventDate, ticketType: previous.ticketType, quantity: previous.quantity, unitPrice: previous.unitPrice, total: previous.total, status: previous.status } : undefined
  const saved: NightclubTicketSale = {
    id: input.id, promoterId: input.promoterId, ...(linkedEvent ? { eventId: linkedEvent.id } : {}), ...(eventName ? { eventName } : {}), eventDate, ticketType, quantity, unitPrice, total, status: input.status, operationId: input.operationId,
    createdAt: previous?.createdAt || at, createdBy: previous?.createdBy || actor,
    ...(previous ? { updatedAt: at, updatedBy: actor, corrections: [...(previous.corrections || []), { at, actor, reason: correctionReason, previous: snapshot! }] } : {}),
  }
  next.promoterTicketSales = previous ? next.promoterTicketSales.map(item => item.id === input.id ? saved : item) : [...next.promoterTicketSales, saved]
  audit(next, previous ? 'promoter_ticket_sale_corrected' : 'promoter_ticket_sale_created', actor, at, input.promoterId, input.id)
  return next
}

export function nightclubLoungeSpaces(dataset: NightclubDataset) {
  const loungeZoneIds = new Set(dataset.zones.filter(zone => /lounge/i.test(zone.name)).map(zone => zone.id))
  return dataset.tables.filter(table => loungeZoneIds.has(table.zoneId))
}

export function nightclubLoungeReservationDate(sale: Pick<NightclubLoungeSale, 'reservationDate' | 'eventDate'>): string {
  return sale.reservationDate || sale.eventDate
}

const localDay = () => {
  const now = new Date()
  return [now.getFullYear(), String(now.getMonth() + 1).padStart(2, '0'), String(now.getDate()).padStart(2, '0')].join('-')
}

export function nightclubReservableTables(dataset: NightclubDataset, reservationDate: string, currentSaleId?: string, today = localDay()) {
  try { date(reservationDate) } catch { return [] }
  const validZoneIds = new Set(dataset.zones.map(zone => zone.id))
  const currentSale = (dataset.promoterLoungeSales || []).find(sale => sale.id === currentSaleId && sale.status !== 'cancelled')
  return dataset.tables.filter(table => {
    if (!validZoneIds.has(table.zoneId)) return false
    if (currentSale && nightclubLoungeReservationDate(currentSale) === reservationDate && currentSale.loungeId === table.id) return true
    if (reservationDate === today) {
      if (table.status !== 'available' || table.activeAccountId) return false
      if (dataset.reservations.some(reservation => reservation.tableId === table.id && reservation.status === 'confirmed')) return false
    }
    return !(dataset.promoterLoungeSales || []).some(sale => sale.id !== currentSaleId && nightclubLoungeReservationDate(sale) === reservationDate && sale.loungeId === table.id && sale.status !== 'cancelled')
  })
}

type LoungeSnapshot = NonNullable<NightclubLoungeSale['corrections']> extends Array<infer Change> ? Change extends { previous: infer Snapshot } ? Snapshot : never : never
const loungeSaleSnapshot = (sale: NightclubLoungeSale): LoungeSnapshot => ({
  eventId: sale.eventId, eventDate: sale.eventDate, reservationDate: sale.reservationDate,
  loungeId: sale.loungeId, loungeName: sale.loungeName, customerId: sale.customerId, customerName: sale.customerName,
  agreedPrice: sale.agreedPrice, status: sale.status,
})
export function markNightclubLoungeSalePaid(dataset: NightclubDataset, saleId: string, actor: string, role: string, at = new Date().toISOString()): NightclubDataset {
  seller(role)
  const sale = (dataset.promoterLoungeSales || []).find(item => item.id === saleId)
  if (!sale) throw new Error('La reserva no existe.')
  if (sale.status === 'paid') return dataset
  if (sale.status !== 'reserved') throw new Error('Solo una reserva pendiente puede marcarse como pagada.')
  if ((dataset.promoterLoungeSales || []).some(item => item.id !== saleId && item.loungeId === sale.loungeId && nightclubLoungeReservationDate(item) === nightclubLoungeReservationDate(sale) && item.status !== 'cancelled')) throw new Error('Esta mesa ya tiene otra reserva para la fecha.')
  if (!actor.trim()) throw new Error('No se identificó al usuario responsable.')
  const next = structuredClone(dataset)
  const current = next.promoterLoungeSales!.find(item => item.id === saleId)!
  const previous = loungeSaleSnapshot(current)
  current.status = 'paid'
  current.updatedAt = at
  current.updatedBy = actor
  current.operationId = crypto.randomUUID()
  current.corrections = [...(current.corrections || []), { at, actor, reason: '', kind: 'payment', previous }]
  audit(next, 'promoter_lounge_sale_paid', actor, at, current.promoterId, current.id)
  return next
}
export type NightclubLoungeHistoryEntry = { at: string; actor: string; from: NightclubLoungeSaleStatus | null; to: NightclubLoungeSaleStatus; fields: string[]; reason?: string }
export function nightclubLoungeChangeHistory(sale: NightclubLoungeSale): NightclubLoungeHistoryEntry[] {
  const changes = sale.corrections || []
  const current = loungeSaleSnapshot(sale)
  const entries: NightclubLoungeHistoryEntry[] = [{ at: sale.createdAt, actor: sale.createdBy, from: null, to: changes[0]?.previous.status || sale.status, fields: ['Registro inicial'] }]
  changes.forEach((change, index) => {
    const before = change.previous
    const after = changes[index + 1]?.previous || current
    const fields: string[] = []
    if ((before.reservationDate || before.eventDate) !== (after.reservationDate || after.eventDate)) fields.push('Fecha de reserva: ' + (before.reservationDate || before.eventDate) + ' → ' + (after.reservationDate || after.eventDate))
    if (before.loungeId !== after.loungeId) fields.push('Mesa: ' + (before.loungeName || before.loungeId) + ' → ' + (after.loungeName || after.loungeId))
    if ((before.customerId || '') !== (after.customerId || '')) fields.push('Cliente: ' + (before.customerName || 'Sin cliente') + ' → ' + (after.customerName || 'Sin cliente'))
    if (before.agreedPrice !== after.agreedPrice) fields.push('Precio: Bs ' + before.agreedPrice.toFixed(2) + ' → Bs ' + after.agreedPrice.toFixed(2))
    if (before.status !== after.status) fields.push('Estado: ' + ({ reserved: 'Reservado', paid: 'Pagado', cancelled: 'Cancelado' }[before.status]) + ' → ' + ({ reserved: 'Reservado', paid: 'Pagado', cancelled: 'Cancelado' }[after.status]))
    entries.push({ at: change.at, actor: change.actor, from: before.status, to: after.status, fields, ...(change.reason ? { reason: change.reason } : {}) })
  })
  return entries
}

export function saveNightclubLoungeSale(dataset: NightclubDataset, input: NightclubLoungeSaleDraft, actor: string, role: string, at = new Date().toISOString()): NightclubDataset {
  seller(role)
  if (!input.id || !input.operationId) throw new Error('La operación de lounge necesita identificadores.')
  const next = structuredClone(dataset)
  const promoter = assertPromoter(next, input.promoterId)
  next.promoterLoungeSales ||= []
  const previous = next.promoterLoungeSales.find(item => item.id === input.id)
  const sameOperation = next.promoterLoungeSales.find(item => item.operationId === input.operationId)
  if (sameOperation) {
    if (previous && sameOperation.id === previous.id && nightclubLoungeReservationDate(previous) === input.reservationDate && previous.loungeId === input.loungeId && (previous.customerId || '') === (input.customerId || '') && previous.agreedPrice === input.agreedPrice && previous.status === input.status) return dataset
    throw new Error('La operación ya se registró.')
  }
  if (previous && previous.promoterId !== input.promoterId) throw new Error('No puedes cambiar el relacionador de una venta registrada.')
  if (!previous && !promoter.active) throw new Error('El relacionador está inactivo.')
  const reservationDate = date(input.reservationDate)
  const legacyEventId = input.eventId || previous?.eventId
  const legacyEvent = legacyEventId ? (next.promoterEvents || []).find(item => item.id === legacyEventId) : undefined
  if (input.eventId && !legacyEvent) throw new Error('La jornada histórica no existe.')
  const lounge = next.tables.find(item => item.id === input.loungeId && next.zones.some(zone => zone.id === item.zoneId)) || (previous && input.status === 'cancelled' && previous.loungeId === input.loungeId ? { id: previous.loungeId, name: previous.loungeName } : undefined)
  if (!lounge) throw new Error('Selecciona una mesa existente en Zonas.')
  const customer = input.customerId ? next.customers.find(item => item.id === input.customerId) : undefined
  if (input.customerId && !customer) throw new Error('El cliente seleccionado no existe.')
  const price = Number(input.agreedPrice)
  if (!Number.isFinite(price) || price < 0 || !hasCentPrecision(price) || !Number.isSafeInteger(cents(price))) throw new Error('Ingresa un precio acordado válido.')
  if (!['reserved', 'paid', 'cancelled'].includes(input.status)) throw new Error('Estado de lounge inválido.')
  if (input.status !== 'cancelled' && next.promoterLoungeSales.some(item => item.id !== input.id && nightclubLoungeReservationDate(item) === reservationDate && item.loungeId === lounge.id && item.status !== 'cancelled')) throw new Error('Esta mesa ya está reservada o vendida para la fecha.')
  if (input.status !== 'cancelled' && !nightclubReservableTables(next, reservationDate, input.id).some(item => item.id === input.loungeId)) throw new Error('La mesa no está disponible para esta fecha.')
  const reason = input.correctionReason?.trim() || ''
  if (previous && reason.length < 4) throw new Error('Indica el motivo de la corrección.')
  const snapshot = previous ? loungeSaleSnapshot(previous) : undefined
  const saved: NightclubLoungeSale = {
    id: input.id, promoterId: input.promoterId, ...(legacyEventId ? { eventId: legacyEventId, eventName: previous?.eventName || legacyEvent?.name } : {}),
    eventDate: reservationDate, reservationDate,
    loungeId: lounge.id, loungeName: lounge.name, ...(customer ? { customerId: customer.id, customerName: customer.name } : {}),
    agreedPrice: money(price), status: input.status, operationId: input.operationId,
    createdAt: previous?.createdAt || at, createdBy: previous?.createdBy || actor,
    ...(previous ? { updatedAt: at, updatedBy: actor, corrections: [...(previous.corrections || []), { at, actor, reason, kind: 'correction' as const, previous: snapshot! }] } : {}),
  }
  next.promoterLoungeSales = previous ? next.promoterLoungeSales.map(item => item.id === input.id ? saved : item) : [...next.promoterLoungeSales, saved]
  audit(next, previous ? 'promoter_lounge_sale_corrected' : 'promoter_lounge_sale_created', actor, at, input.promoterId, input.id)
  return next
}

export function saveNightclubPromoterConsumption(dataset: NightclubDataset, input: NightclubConsumptionDraft, actor: string, role: string, at = new Date().toISOString()): NightclubDataset {
  admin(role)
  if (!input.id) throw new Error('Falta identificador del consumo.')
  const next = structuredClone(dataset)
  const promoter = assertPromoter(next, input.promoterId)
  if (!promoter.active) throw new Error('El relacionador está inactivo.')
  const day = date(input.date)
  const concept = input.concept.trim()
  const amount = Number(input.amount)
  if (!concept || !Number.isFinite(amount) || amount < 0 || !hasCentPrecision(amount)) throw new Error('Revisa concepto y monto.')
  if (!['courtesy', 'own_purchase'].includes(input.kind)) throw new Error('Tipo de consumo inválido.')
  next.promoterConsumptions ||= []
  if (next.promoterConsumptions.some(item => item.id === input.id)) throw new Error('El consumo ya existe.')
  next.promoterConsumptions.push({ id: input.id, promoterId: input.promoterId, date: day, concept, amount: money(amount), kind: input.kind, ...(input.notes?.trim() ? { notes: input.notes.trim() } : {}), createdAt: at, createdBy: actor })
  audit(next, 'promoter_consumption_recorded', actor, at, input.promoterId, input.id)
  return next
}

export function nightclubWeekendStart(day: string): string {
  const valid = date(day)
  const utc = new Date(valid + 'T12:00:00Z')
  const weekday = utc.getUTCDay()
  utc.setUTCDate(utc.getUTCDate() - ((weekday + 2) % 7))
  return utc.toISOString().slice(0, 10)
}
export function nightclubPeriodMatches(day: string, filter: NightclubRankingFilter): boolean {
  if (filter.scope === 'all' || filter.scope === 'event') return true
  const selected = date(filter.date || '')
  return filter.scope === 'month' ? day.slice(0, 7) === selected.slice(0, 7) : nightclubWeekendStart(day) === nightclubWeekendStart(selected)
}
export function nightclubPromoterRanking(dataset: NightclubDataset, filter: NightclubRankingFilter) {
  const search = (filter.search || '').trim().toLocaleLowerCase()
  const seenTicketOperations = new Set<string>()
  const ticketSales = (dataset.promoterTicketSales || []).filter(item => {
    if (item.status !== 'paid' || !nightclubPeriodMatches(item.eventDate, filter) || (filter.scope === 'event' && !(filter.eventId === '__legacy__' ? !item.eventId : !!filter.eventId && item.eventId === filter.eventId))) return false
    const operation = item.operationId || item.id
    if (seenTicketOperations.has(operation)) return false
    seenTicketOperations.add(operation)
    return true
  })
  const seenLoungeSlots = new Set<string>()
  const seenLoungeOperations = new Set<string>()
  const loungeSales = (dataset.promoterLoungeSales || []).filter(item => {
    if (item.status !== 'paid' || !nightclubPeriodMatches(item.eventDate, filter) || (filter.scope === 'event' && item.eventId !== filter.eventId)) return false
    const slot = nightclubLoungeReservationDate(item) + ':' + item.loungeId
    const operation = item.operationId || item.id
    if (seenLoungeSlots.has(slot) || seenLoungeOperations.has(operation)) return false
    seenLoungeSlots.add(slot)
    seenLoungeOperations.add(operation)
    return true
  })
  const rows = (dataset.promoters || []).filter(person => !search || person.name.toLocaleLowerCase().includes(search) || person.phone.includes(search) || (person.document || '').toLocaleLowerCase().includes(search)).map(person => {
    const sales = ticketSales.filter(item => item.promoterId === person.id)
    const lounges = loungeSales.filter(item => item.promoterId === person.id)
    const tickets = sales.reduce((sum, item) => sum + item.quantity, 0)
    const entryValue = money(sales.reduce((sum, item) => sum + item.total, 0))
    const loungeValue = money(lounges.reduce((sum, item) => sum + item.agreedPrice, 0))
    return { promoter: person, tickets, lounges: lounges.length, entryValue, loungeValue, totalValue: money(entryValue + loungeValue), revenue: entryValue, sales: sales.length }
  })
  rows.sort((a, b) => {
    const metric = filter.sort === 'lounges' ? b.lounges - a.lounges || b.totalValue - a.totalValue
      : filter.sort === 'totalValue' ? b.totalValue - a.totalValue || b.tickets - a.tickets
      : filter.sort === 'revenue' ? b.entryValue - a.entryValue || b.tickets - a.tickets
      : filter.sort === 'name' ? a.promoter.name.localeCompare(b.promoter.name)
      : b.tickets - a.tickets || b.totalValue - a.totalValue
    return metric || a.promoter.name.localeCompare(b.promoter.name)
  })
  return rows
}
export function nightclubPromoterConsumptionTotals(dataset: NightclubDataset, promoterId: string, filter: NightclubRankingFilter) {
  const records = (dataset.promoterConsumptions || []).filter(item => item.promoterId === promoterId && nightclubPeriodMatches(item.date, filter))
  return { courtesy: money(records.filter(item => item.kind === 'courtesy').reduce((sum, item) => sum + item.amount, 0)), ownPurchase: money(records.filter(item => item.kind === 'own_purchase').reduce((sum, item) => sum + item.amount, 0)) }
}
