/* eslint-disable @typescript-eslint/ban-ts-comment -- Node runs these domain tests outside the browser configuration. */
// @ts-nocheck
import assert from 'node:assert/strict'
import test from 'node:test'
import { createDefaultNightclubLocations, createNightclubTransfer, dispatchNightclubTransfer, openNightclubCashboxShift, prepareLegacyNightclubLocations, receiveNightclubTransfer, selectNightclubCashbox, WAREHOUSE_LOCATION_ID } from '../nightclubLocations.ts'

test('crea almacén y cuatro cajas con IDs estables', () => {
  const setup = createDefaultNightclubLocations('main', '2026-10-09T00:00:00Z')
  assert.equal(setup.locations.length, 5)
  assert.equal(setup.cashboxes.length, 4)
  assert.deepEqual(setup.cashboxes.map(item => item.locationId), ['cashbox-1', 'cashbox-2', 'cashbox-3', 'cashbox-4'])
  assert.equal(setup.locations[0].id, WAREHOUSE_LOCATION_ID)
})

test('prepara una migración legacy sin inventar procedencia histórica', () => {
  const migrated = prepareLegacyNightclubLocations({ zones: [], tables: [], products: [], accounts: [], shift: null, customers: [], reservations: [], inventory: [{ id: 'ron', name: 'Ron', unit: 'unit', current: 10, minimum: 2, unitCost: 75 }], inventoryMovements: [{ id: 'old', operationId: 'old', inventoryId: 'ron', quantity: -1, previous: 10, current: 9, type: 'sale', at: '2026-01-01', actor: 'legacy' }] }, 'main', '2026-10-09T00:00:00Z')
  assert.equal(migrated.inventoryBalances[0].locationId, WAREHOUSE_LOCATION_ID)
  assert.equal(migrated.inventoryLots[0].sourceType, 'migration')
  assert.equal(migrated.inventoryMovements[0].locationId, 'unknown')
})

test('una transferencia exige lotes completos y ubicaciones distintas', () => {
  const line = { inventoryId: 'ron', quantity: 2, unit: 'unit', lotAllocations: [{ lotId: 'lot-1', quantity: 2, unitCost: 75 }] }
  const transfer = createNightclubTransfer({ branchId: 'main', sourceLocationId: WAREHOUSE_LOCATION_ID, destinationLocationId: 'cashbox-2', mode: 'pending_receipt', lines: [line], requestedBy: 'user' })
  assert.equal(transfer.status, 'requested')
  assert.throws(() => createNightclubTransfer({ branchId: 'main', sourceLocationId: 'cashbox-1', destinationLocationId: 'cashbox-1', mode: 'immediate', lines: [line] }))
})

test('mueve lotes FIFO sin dejar el tr�nsito disponible y permite recibirlo', () => {
  const base = prepareLegacyNightclubLocations({ zones: [], tables: [], products: [], accounts: [], shift: null, customers: [], reservations: [], inventory: [{ id: 'ron', name: 'Ron', unit: 'unit', current: 10, minimum: 2, unitCost: 75 }] }, 'main', '2026-10-09T00:00:00Z')
  const transfer = createNightclubTransfer({ branchId: 'main', sourceLocationId: WAREHOUSE_LOCATION_ID, destinationLocationId: 'cashbox-1', mode: 'pending_receipt', lines: [{ inventoryId: 'ron', quantity: 3, unit: 'unit', lotAllocations: [{ lotId: 'migration-lot:ron', quantity: 3, unitCost: 75 }] }] })
  let moved = dispatchNightclubTransfer({ ...base, transfers: [transfer] }, transfer.id, 'administracion', '2026-10-09T01:00:00Z')
  assert.equal(moved.inventoryBalances.find(item => item.id === 'warehouse-general:ron').availableQuantity, 7)
  assert.equal(moved.inventoryBalances.find(item => item.id === 'cashbox-1:ron').availableQuantity, 0)
  assert.equal(moved.inventoryBalances.find(item => item.id === 'cashbox-1:ron').inTransitQuantity, 3)
  moved = receiveNightclubTransfer(moved, transfer.id, 'caja 1', '2026-10-09T01:05:00Z')
  assert.equal(moved.inventoryBalances.find(item => item.id === 'cashbox-1:ron').availableQuantity, 3)
  assert.equal(moved.inventoryBalances.find(item => item.id === 'cashbox-1:ron').inTransitQuantity, 0)
})

test('selecciona caja y abre turnos independientes por caja', () => {
  const base = prepareLegacyNightclubLocations({ zones: [], tables: [], products: [], accounts: [], shift: null, customers: [], reservations: [], inventory: [] }, 'main', '2026-10-09T00:00:00Z')
  const selected = selectNightclubCashbox(base, { userId: 'u1', cashboxId: 'cashbox-2', actor: 'Dario', at: '2026-10-09T00:01:00Z' })
  const opened = openNightclubCashboxShift(selected, { userId: 'u1', cashboxId: 'cashbox-2', actor: 'Dario', openingFloat: 200, at: '2026-10-09T00:02:00Z' })
  assert.equal(opened.operatorContexts[0].cashboxId, 'cashbox-2')
  assert.equal(opened.cashboxShifts[0].cashboxId, 'cashbox-2')
  assert.equal(opened.cashboxShifts[0].status, 'open')
})
