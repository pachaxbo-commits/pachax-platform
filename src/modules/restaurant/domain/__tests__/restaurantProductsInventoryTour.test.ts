/* eslint-disable @typescript-eslint/ban-ts-comment -- Node test types are outside the browser TypeScript configuration. */
// @ts-nocheck
import assert from 'node:assert/strict'
import test from 'node:test'
import { restaurantInventoryMobileTourSteps, restaurantInventoryTourPreferenceKey, restaurantInventoryTourSteps } from '../restaurantInventoryTour.ts'
import { restaurantProductsMobileTourSteps, restaurantProductsTourPreferenceKey, restaurantProductsTourSteps } from '../restaurantProductsTour.ts'

test('el tutorial de Productos conserva pasos y destinos reales', () => {
  assert.equal(restaurantProductsTourSteps.length, 8)
  assert.equal(restaurantProductsTourSteps[0]?.advanceWhen, '[data-tour="products-board"]')
  assert.ok(restaurantProductsTourSteps.some((step) => step.target.includes('products-recipe-fields')))
  assert.ok(restaurantProductsTourSteps.every((step) => step.interaction === 'informative' || step.interaction === 'navigate'))
})

test('el tutorial de Inventario explica existencias y movimientos sin ejecutar acciones', () => {
  assert.equal(restaurantInventoryTourSteps.length, 8)
  assert.equal(restaurantInventoryTourSteps[0]?.advanceWhen, '[data-tour="inventory-board"]')
  assert.ok(restaurantInventoryTourSteps.some((step) => step.target.includes('inventory-history-tab')))
  assert.ok(restaurantInventoryTourSteps.every((step) => step.interaction === 'informative' || step.interaction === 'navigate'))
})

test('las versiones móviles abren el menú antes del módulo y el progreso queda aislado', () => {
  assert.equal(restaurantProductsMobileTourSteps[0]?.id, 'open-menu')
  assert.equal(restaurantInventoryMobileTourSteps[0]?.id, 'open-menu')
  assert.notEqual(restaurantProductsTourPreferenceKey('tenant-a', 'user-a'), restaurantInventoryTourPreferenceKey('tenant-a', 'user-a'))
  assert.notEqual(restaurantProductsTourPreferenceKey('tenant-a', 'user-a'), restaurantProductsTourPreferenceKey('tenant-b', 'user-a'))
})
