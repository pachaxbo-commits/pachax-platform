/* eslint-disable @typescript-eslint/ban-ts-comment -- Node test types are outside the browser TypeScript configuration. */
// @ts-nocheck
import assert from 'node:assert/strict'
import test from 'node:test'
import { applyRestaurantFloorAction, migrateRestaurantFloor, visibleTables } from '../restaurantFloor.ts'
import { placeRestaurantOrder } from '../restaurantOperations.ts'

const at = '2026-09-24T12:00:00Z'
const sector = { id: 's1', name: 'Principal', sortOrder: 0, active: true, createdAt: at, updatedAt: at }
const sector2 = { ...sector, id: 's2', name: 'Terraza', sortOrder: 1 }
const table = { id: 't1', name: 'Mesa nueva', sectorId: 's1', capacity: 4, status: 'available', active: true, sortOrder: 0 }

test('configura sectores y mesas con IDs estables y orden persistente', () => {
  const createdSector = applyRestaurantFloorAction([], [], { type: 'sector.create', id: 's1', name: '  Principal ' }, at)
  assert.equal(createdSector.sectors[0].name, 'Principal')
  const createdTable = applyRestaurantFloorAction([], createdSector.sectors, { type: 'table.create', id: 't1', name: 'Mesa nueva', sectorId: 's1', capacity: 4, shape: 'round', active: true }, at)
  assert.equal(createdTable.tables[0].sectorId, 's1')
  assert.equal(createdTable.tables[0].shape, 'round')
  const moved = applyRestaurantFloorAction(createdTable.tables, [sector, sector2], { type: 'table.update', id: 't1', name: 'Mesa 10', sectorId: 's2', capacity: 6, shape: 'square', active: true }, at)
  assert.equal(moved.tables[0].id, 't1')
  assert.equal(moved.tables[0].sectorId, 's2')
  const archivedSector = applyRestaurantFloorAction(moved.tables, moved.sectors, { type: 'sector.archive', id: 's2', transferToId: 's1' }, at)
  assert.equal(archivedSector.tables[0].sectorId, 's1')
  assert.equal(archivedSector.sectors.find(item => item.id === 's2')?.active, false)
})

test('impide borrar o desactivar mesas con cuentas abiertas y conserva historial al archivar', () => {
  const occupied = { ...table, status: 'occupied', activeOrderId: 'o1' }
  assert.throws(() => applyRestaurantFloorAction([occupied], [sector], { type: 'table.archive', id: 't1' }, at), /operación activa/)
  assert.throws(() => applyRestaurantFloorAction([occupied], [sector], { type: 'table.update', id: 't1', name: table.name, sectorId: 's1', capacity: 4, shape: 'square', active: false }, at), /operación activa/)
  const archived = applyRestaurantFloorAction([table], [sector], { type: 'table.archive', id: 't1' }, at)
  assert.equal(archived.tables[0].id, 't1')
  assert.equal(visibleTables(archived.tables).length, 0)
})

test('mesa creada desde configuración aparece en operación POS por tableId', () => {
  const configured = applyRestaurantFloorAction([], [sector], { type: 'table.create', id: 't1', name: 'Mesa nueva', sectorId: 's1', capacity: 4, shape: 'square', active: true }, at)
  const order = { id: 'o1', fulfillmentType: 'table', tableId: 't1', tableInfo: 'Mesa nueva', createdAt: at, status: 'pending', paymentStatus: 'pending', total: 0, items: [] }
  const placed = placeRestaurantOrder([], configured.tables, order)
  assert.equal(placed.tables[0].activeOrderId, 'o1')
  assert.equal(placed.tables[0].status, 'occupied')
  assert.throws(() => placeRestaurantOrder([], [{ ...configured.tables[0], active: false }], order), /desactivada/)
})

test('migra mesas legacy por nombre solo una vez y mantiene sectorId existente', () => {
  const legacy = migrateRestaurantFloor([{ ...table, sectorId: undefined, name: 'Mesa 11 (Terraza)' }])
  assert.equal(legacy.tables[0].sectorId, 'sector-terraza')
  const migrated = migrateRestaurantFloor([{ ...table, sectorId: 's1' }], [sector])
  assert.equal(migrated.tables[0].sectorId, 's1')
})

test('reordena mesas y sectores sin cambiar identidades ni cuentas', () => {
  const tables = [table, { ...table, id: 't2', name: 'VIP 1', sortOrder: 1 }]
  const reordered = applyRestaurantFloorAction(tables, [sector, sector2], { type: 'table.reorder', id: 't2', direction: -1 }, at)
  assert.equal(reordered.tables.find(item => item.id === 't2')?.sortOrder, 0)
  assert.equal(reordered.tables.find(item => item.id === 't1')?.sortOrder, 1)
  const sectors = applyRestaurantFloorAction(reordered.tables, [sector, sector2], { type: 'sector.reorder', id: 's2', direction: -1 }, at)
  assert.equal(sectors.sectors.find(item => item.id === 's2')?.sortOrder, 0)
  assert.deepEqual(sectors.tables.map(item => item.id), ['t1', 't2'])
})

test('mesa desactivada sale de operación y puede reactivarse', () => {
  const disabled = applyRestaurantFloorAction([table], [sector], { type: 'table.update', id: 't1', name: table.name, sectorId: 's1', capacity: 4, shape: 'square', active: false }, at)
  assert.equal(visibleTables(disabled.tables).length, 0)
  const enabled = applyRestaurantFloorAction(disabled.tables, [sector], { type: 'table.update', id: 't1', name: table.name, sectorId: 's1', capacity: 4, shape: 'square', active: true }, at)
  assert.equal(visibleTables(enabled.tables).length, 1)
})
