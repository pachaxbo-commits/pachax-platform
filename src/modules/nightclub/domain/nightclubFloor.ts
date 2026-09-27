import { openNightclubAccount } from './nightclubAccounts.ts'
import type { NightclubBranding, NightclubDataset, NightclubReservation, NightclubTable, NightclubZone } from './nightclubAccounts'

export type ZoneDraft = Pick<NightclubZone, 'id' | 'name'>
export type TableDraft = Pick<NightclubTable, 'id' | 'name' | 'zoneId' | 'capacity' | 'status'>
export type ReservationDraft = Pick<NightclubReservation, 'id' | 'tableId' | 'customerName' | 'time' | 'guests'>

export function saveNightclubZone(dataset: NightclubDataset, draft: ZoneDraft, actor: string, now = new Date().toISOString()): NightclubDataset {
  const name = draft.name.trim()
  if (!name) throw new Error('Ingresa el nombre de la zona.')
  if (dataset.zones.some(zone => zone.id !== draft.id && zone.name.toLocaleLowerCase() === name.toLocaleLowerCase())) throw new Error('Ya existe una zona con ese nombre.')
  const next = structuredClone(dataset)
  const existing = next.zones.find(zone => zone.id === draft.id)
  if (existing) existing.name = name
  else next.zones.push({ id: draft.id || crypto.randomUUID(), name, sortOrder: Math.max(-1, ...next.zones.map(zone => zone.sortOrder)) + 1 })
  next.audit ||= []
  next.audit.push({ id: crypto.randomUUID(), type: existing ? 'zone_updated' : 'zone_created', actor, at: now, details: { zoneId: existing?.id || next.zones.at(-1)!.id, name } })
  return next
}

export function saveNightclubTable(dataset: NightclubDataset, draft: TableDraft, actor: string, now = new Date().toISOString()): NightclubDataset {
  const name = draft.name.trim()
  if (!name) throw new Error('Ingresa el nombre de la mesa.')
  if (!dataset.zones.some(zone => zone.id === draft.zoneId)) throw new Error('Selecciona una zona válida.')
  if (!Number.isInteger(draft.capacity) || draft.capacity < 1 || draft.capacity > 100) throw new Error('La capacidad debe estar entre 1 y 100 personas.')
  if (dataset.tables.some(table => table.id !== draft.id && table.zoneId === draft.zoneId && table.name.toLocaleLowerCase() === name.toLocaleLowerCase())) throw new Error('Ya existe una mesa con ese nombre en la zona.')
  const next = structuredClone(dataset)
  const existing = next.tables.find(table => table.id === draft.id)
  if (existing) {
    if (!existing.activeAccountId && draft.status !== 'available' && draft.status !== 'reserved') throw new Error('Una mesa sin cuenta solo puede estar libre o reservada.')
    if (existing.activeAccountId && draft.status !== existing.status) throw new Error('No puedes cambiar el estado de una mesa con cuenta activa.')
    if (!existing.activeAccountId && existing.status === 'reserved' && draft.status === 'available') {
      existing.reservationName = undefined
      next.reservations = next.reservations.map(reservation => reservation.tableId === existing.id && reservation.status === 'confirmed' ? { ...reservation, status: 'cancelled' as const } : reservation)
    }
    Object.assign(existing, { name, zoneId: draft.zoneId, capacity: draft.capacity, status: draft.status })
  } else {
    if (draft.status !== 'available') throw new Error('Una mesa nueva debe comenzar libre.')
    next.tables.push({ id: draft.id || crypto.randomUUID(), name, zoneId: draft.zoneId, capacity: draft.capacity, status: 'available' })
  }
  next.audit ||= []
  next.audit.push({ id: crypto.randomUUID(), type: existing ? 'table_updated' : 'table_created', actor, at: now, details: { tableId: existing?.id || next.tables.at(-1)!.id, name, zoneId: draft.zoneId } })
  return next
}

export function deleteNightclubZone(dataset: NightclubDataset, zoneId: string, actor: string, now = new Date().toISOString()): NightclubDataset {
  if (dataset.tables.some(table => table.zoneId === zoneId)) throw new Error('Mueve o elimina las mesas de esta zona antes de eliminarla.')
  const next = structuredClone(dataset)
  const zone = next.zones.find(item => item.id === zoneId)
  if (!zone) throw new Error('La zona ya no existe.')
  next.zones = next.zones.filter(item => item.id !== zoneId)
  next.audit ||= []
  next.audit.push({ id: crypto.randomUUID(), type: 'zone_deleted', actor, at: now, details: { zoneId, name: zone.name } })
  return next
}

export function deleteNightclubTable(dataset: NightclubDataset, tableId: string, actor: string, now = new Date().toISOString()): NightclubDataset {
  const table = dataset.tables.find(item => item.id === tableId)
  if (!table) throw new Error('La mesa ya no existe.')
  if (table.activeAccountId) throw new Error('Finaliza la cuenta activa antes de eliminar la mesa.')
  if (dataset.reservations.some(item => item.tableId === tableId && item.status === 'confirmed')) throw new Error('Cancela la reserva antes de eliminar la mesa.')
  const next = structuredClone(dataset)
  next.tables = next.tables.filter(item => item.id !== tableId)
  next.audit ||= []
  next.audit.push({ id: crypto.randomUUID(), type: 'table_deleted', actor, at: now, details: { tableId, name: table.name } })
  return next
}

export function saveNightclubReservation(dataset: NightclubDataset, draft: ReservationDraft, actor: string, now = new Date().toISOString()): NightclubDataset {
  const customerName = draft.customerName.trim()
  const table = dataset.tables.find(item => item.id === draft.tableId)
  if (!table) throw new Error('Selecciona una mesa válida.')
  if (table.activeAccountId || table.status === 'occupied' || table.status === 'bill_requested') throw new Error('La mesa ya tiene una cuenta activa.')
  if (!customerName) throw new Error('Ingresa el nombre de la reserva.')
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(draft.time)) throw new Error('Ingresa una hora válida.')
  if (!Number.isInteger(draft.guests) || draft.guests < 1 || draft.guests > table.capacity) throw new Error(`La reserva admite entre 1 y ${table.capacity} personas.`)
  if (dataset.reservations.some(item => item.id !== draft.id && item.tableId === draft.tableId && item.status === 'confirmed')) throw new Error('La mesa ya tiene una reserva confirmada.')
  const next = structuredClone(dataset)
  const id = draft.id || crypto.randomUUID()
  const reservation: NightclubReservation = { id, tableId: draft.tableId, customerName, time: draft.time, guests: draft.guests, status: 'confirmed' }
  const index = next.reservations.findIndex(item => item.id === id)
  if (index >= 0) next.reservations[index] = reservation
  else next.reservations.push(reservation)
  const nextTable = next.tables.find(item => item.id === draft.tableId)!
  nextTable.status = 'reserved'
  nextTable.reservationName = customerName
  next.audit ||= []
  next.audit.push({ id: crypto.randomUUID(), type: index >= 0 ? 'reservation_updated' : 'reservation_created', actor, at: now, details: { reservationId: id, tableId: draft.tableId, customerName } })
  return next
}

export function cancelNightclubReservation(dataset: NightclubDataset, reservationId: string, actor: string, now = new Date().toISOString()): NightclubDataset {
  const next = structuredClone(dataset)
  const reservation = next.reservations.find(item => item.id === reservationId && item.status === 'confirmed')
  if (!reservation) throw new Error('La reserva ya no está activa.')
  reservation.status = 'cancelled'
  const table = next.tables.find(item => item.id === reservation.tableId)
  if (table && !table.activeAccountId) { table.status = 'available'; table.reservationName = undefined }
  next.audit ||= []
  next.audit.push({ id: crypto.randomUUID(), type: 'reservation_cancelled', actor, at: now, details: { reservationId, tableId: reservation.tableId } })
  return next
}

export function arriveNightclubReservation(dataset: NightclubDataset, reservationId: string, actor: string, now = new Date().toISOString()): NightclubDataset {
  const reservation = dataset.reservations.find(item => item.id === reservationId && item.status === 'confirmed')
  if (!reservation) throw new Error('La reserva ya no está activa.')
  const released = structuredClone(dataset)
  const releasedReservation = released.reservations.find(item => item.id === reservationId)!
  releasedReservation.status = 'arrived'
  const table = released.tables.find(item => item.id === reservation.tableId)
  if (!table) throw new Error('La mesa de la reserva ya no existe.')
  table.status = 'available'
  table.reservationName = undefined
  const opened = openNightclubAccount(released, { type: 'table', tableId: table.id }, actor, now)
  opened.audit ||= []
  opened.audit.push({ id: crypto.randomUUID(), type: 'reservation_arrived', actor, at: now, details: { reservationId, tableId: table.id } })
  return opened
}

export function saveNightclubBranding(dataset: NightclubDataset, branding: NightclubBranding, actor: string, now = new Date().toISOString()): NightclubDataset {
  const businessName = branding.businessName.trim()
  const subtitle = branding.subtitle.trim()
  if (!businessName || !subtitle) throw new Error('Completa el nombre y el tipo de negocio.')
  for (const color of [branding.primaryColor, branding.accentColor, branding.surfaceColor]) if (!/^#[0-9a-f]{6}$/i.test(color)) throw new Error('Selecciona colores válidos.')
  const next = structuredClone(dataset)
  next.branding = { ...branding, businessName, subtitle }
  next.audit ||= []
  next.audit.push({ id: crypto.randomUUID(), type: 'branding_updated', actor, at: now, details: { businessName } })
  return next
}
