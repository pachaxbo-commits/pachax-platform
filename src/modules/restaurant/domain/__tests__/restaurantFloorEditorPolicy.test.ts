/* eslint-disable @typescript-eslint/ban-ts-comment -- Node test executes outside browser TypeScript project. */
// @ts-nocheck Node executes this file outside the browser TypeScript project.
import assert from 'node:assert/strict'
import test from 'node:test'
import { canEditRestaurantFloorLayout, dispatchRestaurantFloorAction, type RestaurantFloorActionHandler } from '../restaurantFloorEditorPolicy.ts'

const layoutSave = {
  type: 'layout.save' as const,
  positions: [{ id: 'table-1', x: 100, y: 100, expectedSectorId: 'sector-1', expectedRevision: 0 }],
}

test('layout editor requires an administrative permission in demos and stays disabled for real tenants', () => {
  assert.equal(canEditRestaurantFloorLayout(true, true), true)
  assert.equal(canEditRestaurantFloorLayout(true, false), false)
  assert.equal(canEditRestaurantFloorLayout(false, true), false)
  assert.equal(canEditRestaurantFloorLayout(false, false), false)
})

test('real tenant layout.save is rejected before the gateway while salon administration stays available', async () => {
  let calls = 0
  const handler = () => { calls += 1; return { ok: true } }
  const canEditLayout = canEditRestaurantFloorLayout(false, true)

  const rejected = await dispatchRestaurantFloorAction(layoutSave, canEditLayout, handler)
  assert.equal(rejected.ok, false)
  assert.equal(calls, 0)

  const tableUpdate = { type: 'table.update' as const, id: 'table-1', name: 'Mesa 1', sectorId: 'sector-1', capacity: 4, shape: 'square' as const, active: true }
  const administered = await dispatchRestaurantFloorAction(tableUpdate, canEditLayout, handler)
  assert.equal(administered.ok, true)
  assert.equal(calls, 1)
})

test('authorized demo layout.save continues through its isolated floor adapter', async () => {
  let received: unknown
  const handler: RestaurantFloorActionHandler = action => { received = action; return { ok: true } }
  const result = await dispatchRestaurantFloorAction(layoutSave, canEditRestaurantFloorLayout(true, true), handler)
  assert.equal(result.ok, true)
  assert.equal(received, layoutSave)
})
