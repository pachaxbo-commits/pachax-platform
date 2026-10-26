/* eslint-disable @typescript-eslint/ban-ts-comment -- Node test types are outside the browser TypeScript configuration. */
// @ts-nocheck
import assert from 'node:assert/strict'
import test from 'node:test'
import { restaurantCashMobileTourSteps, restaurantCashTourPreferenceKey, restaurantCashTourSteps } from '../restaurantCashTour.ts'

test('el recorrido de Caja usa controles reales y no exige acciones financieras', () => {
  assert.deepEqual(restaurantCashTourSteps.map((step) => step.id), ['open-cash', 'shift-status', 'opening', 'sales', 'payment-methods', 'movements', 'charges', 'reconciliation', 'close'])
  assert.equal(restaurantCashTourSteps[0].interaction, 'navigate')
  assert.ok(restaurantCashTourSteps.slice(1).every((step) => step.interaction === 'informative'))
  assert.ok(restaurantCashTourSteps.every((step) => step.target.includes('data-tour')))
})

test('el recorrido móvil abre primero el menú y después Caja', () => {
  assert.deepEqual(restaurantCashMobileTourSteps.slice(0, 2).map((step) => step.id), ['open-menu', 'open-cash'])
  assert.equal(restaurantCashMobileTourSteps.at(-1)?.id, 'close')
})

test('el progreso de Caja se separa por empresa y usuario', () => {
  assert.notEqual(restaurantCashTourPreferenceKey('tenant-a', 'user-a'), restaurantCashTourPreferenceKey('tenant-b', 'user-a'))
  assert.notEqual(restaurantCashTourPreferenceKey('tenant-a', 'user-a'), restaurantCashTourPreferenceKey('tenant-a', 'user-b'))
})
