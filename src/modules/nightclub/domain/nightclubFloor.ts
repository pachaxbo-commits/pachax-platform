import type { NightclubDataset, NightclubTable, NightclubZone } from './nightclubAccounts'

export type ZoneDraft = Pick<NightclubZone, 'id' | 'name'>
export type TableDraft = Pick<NightclubTable, 'id' | 'name' | 'zoneId' | 'capacity' | 'status'>

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
