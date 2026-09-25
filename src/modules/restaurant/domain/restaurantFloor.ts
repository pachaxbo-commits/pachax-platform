import type { RestaurantSector, RestaurantTable } from '../../../demo/mocks/restaurantMock'
import { INITIAL_SECTORS } from '../../../demo/mocks/restaurantMock.ts'

export type FloorAction =
  | { type: 'sector.create'; id: string; name: string; description?: string }
  | { type: 'sector.update'; id: string; name: string; description?: string }
  | { type: 'sector.archive'; id: string; transferToId?: string }
  | { type: 'sector.reorder'; id: string; direction: -1 | 1 }
  | { type: 'table.create'; id: string; name: string; sectorId: string; capacity: number; shape: RestaurantTable['shape']; active: boolean }
  | { type: 'table.update'; id: string; name: string; sectorId: string; capacity: number; shape: RestaurantTable['shape']; active: boolean }
  | { type: 'table.archive'; id: string }
  | { type: 'table.reorder'; id: string; direction: -1 | 1 }

const clean = (value: string) => value.trim().replace(/\s+/g, ' ')
const key = (value: string) => clean(value).toLocaleLowerCase('es-BO')
const operational = (table: RestaurantTable) => Boolean(table.activeOrderId || table.status === 'occupied' || table.status === 'bill_requested')
export const visibleTables = (tables: RestaurantTable[]) => tables.filter(table => !table.archivedAt && table.active !== false)

export function migrateRestaurantFloor(tables: RestaurantTable[], savedSectors?: RestaurantSector[]) {
  const sectors = savedSectors?.length || tables.length === 0 ? (savedSectors || INITIAL_SECTORS.map(sector => ({ ...sector }))) : INITIAL_SECTORS.map(sector => ({ ...sector }))
  const fallback = sectors.find(sector => sector.active)?.id || sectors[0]?.id
  const nextTables = tables.map((table, index) => ({
    ...table,
    sectorId: sectors.some(sector => sector.id === table.sectorId) ? table.sectorId :
      /terraza/i.test(table.name) && sectors.some(sector => sector.id === 'sector-terraza') ? 'sector-terraza' : /barra/i.test(table.name) && sectors.some(sector => sector.id === 'sector-barra') ? 'sector-barra' : fallback,
    sortOrder: table.sortOrder ?? index,
    active: table.active ?? true,
    shape: table.shape || 'square' as const,
    createdAt: table.createdAt || '2026-09-01T00:00:00Z',
    updatedAt: table.updatedAt || '2026-09-01T00:00:00Z',
  }))
  return { sectors, tables: nextTables }
}

export function applyRestaurantFloorAction(tables: RestaurantTable[], sectors: RestaurantSector[], action: FloorAction, at: string) {
  const fail = (message: string): never => { throw new Error(message) }
  const targetSector = (id: string) => sectors.find(sector => sector.id === id && sector.active) || fail('Selecciona un sector activo.')
  const tableById = (id: string) => tables.find(table => table.id === id && !table.archivedAt) || fail('La mesa ya no está disponible.')
  const validateName = (name: string, exceptId?: string) => {
    const normalized = clean(name)
    if (!normalized) fail('El nombre de la mesa es obligatorio.')
    if (tables.some(table => !table.archivedAt && table.id !== exceptId && key(table.name) === key(normalized))) fail('Ya existe una mesa con ese nombre.')
    return normalized
  }
  const validateCapacity = (capacity: number) => {
    if (!Number.isInteger(capacity) || capacity < 1 || capacity > 100) fail('La capacidad debe ser de 1 a 100 personas.')
    return capacity
  }
  const validateSectorName = (name: string, exceptId?: string) => {
    const normalized = clean(name)
    if (!normalized) fail('El nombre del sector es obligatorio.')
    if (sectors.some(sector => sector.active && sector.id !== exceptId && key(sector.name) === key(normalized))) fail('Ya existe un sector con ese nombre.')
    return normalized
  }
  if (action.type === 'sector.create') {
    if (sectors.some(sector => sector.id === action.id)) fail('ID de sector duplicado.')
    return { tables, sectors: [...sectors, { id: action.id, name: validateSectorName(action.name), description: clean(action.description || ''), sortOrder: Math.max(-1, ...sectors.map(sector => sector.sortOrder)) + 1, active: true, createdAt: at, updatedAt: at }] }
  }
  if (action.type === 'sector.update') {
    targetSector(action.id)
    const name = validateSectorName(action.name, action.id)
    return { tables, sectors: sectors.map(sector => sector.id === action.id ? { ...sector, name, description: clean(action.description || ''), updatedAt: at } : sector) }
  }
  if (action.type === 'sector.archive') {
    targetSector(action.id)
    const members = tables.filter(table => table.sectorId === action.id && !table.archivedAt)
    if (members.length && !action.transferToId) fail(`Este sector contiene ${members.length} mesas. Selecciona otro sector para moverlas.`)
    if (members.length && action.transferToId === action.id) fail('Selecciona otro sector.')
    if (members.length) targetSector(action.transferToId!)
    return {
      tables: members.length ? tables.map(table => table.sectorId === action.id && !table.archivedAt ? { ...table, sectorId: action.transferToId, updatedAt: at } : table) : tables,
      sectors: sectors.map(sector => sector.id === action.id ? { ...sector, active: false, updatedAt: at } : sector),
    }
  }
  if (action.type === 'table.create') {
    if (tables.some(table => table.id === action.id)) fail('ID de mesa duplicado.')
    targetSector(action.sectorId)
    const name = validateName(action.name)
    const capacity = validateCapacity(action.capacity)
    const next: RestaurantTable = { id: action.id, name, capacity, sectorId: action.sectorId, shape: action.shape || 'square', active: action.active, status: 'available', sortOrder: Math.max(-1, ...tables.filter(table => table.sectorId === action.sectorId).map(table => table.sortOrder || 0)) + 1, createdAt: at, updatedAt: at }
    return { tables: [...tables, next], sectors }
  }
  if (action.type === 'table.update') {
    const current = tableById(action.id)
    targetSector(action.sectorId)
    if (!action.active && operational(current)) fail('No puedes desactivar esta mesa porque tiene una operación activa.')
    const name = validateName(action.name, action.id)
    const capacity = validateCapacity(action.capacity)
    const nextOrder = current.sectorId === action.sectorId ? current.sortOrder : Math.max(-1, ...tables.filter(table => table.sectorId === action.sectorId).map(table => table.sortOrder || 0)) + 1
    return { tables: tables.map(table => table.id === action.id ? { ...table, name, sectorId: action.sectorId, capacity, shape: action.shape || 'square', active: action.active, sortOrder: nextOrder, updatedAt: at } : table), sectors }
  }
  if (action.type === 'table.archive') {
    const current = tableById(action.id)
    if (operational(current)) fail('No puedes eliminar esta mesa porque tiene una operación activa.')
    return { tables: tables.map(table => table.id === action.id ? { ...table, active: false, archivedAt: at, updatedAt: at } : table), sectors }
  }
  const isSector = action.type === 'sector.reorder'
  const current = isSector ? targetSector(action.id) : tableById(action.id)
  const siblings = isSector
    ? sectors.filter(sector => sector.active).sort((a, b) => a.sortOrder - b.sortOrder)
    : tables.filter(table => !table.archivedAt && table.sectorId === (current as RestaurantTable).sectorId).sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0))
  const position = siblings.findIndex(item => item.id === action.id)
  const swap = siblings[position + action.direction]
  if (!swap) return { tables, sectors }
  const positions = new Map(siblings.map((item, index) => [item.id, index]))
  positions.set(action.id, position + action.direction)
  positions.set(swap.id, position)
  return isSector
    ? { tables, sectors: sectors.map(sector => positions.has(sector.id) ? { ...sector, sortOrder: positions.get(sector.id)!, updatedAt: at } : sector) }
    : { tables: tables.map(table => positions.has(table.id) ? { ...table, sortOrder: positions.get(table.id)!, updatedAt: at } : table), sectors }
}
