/* eslint-disable @typescript-eslint/ban-ts-comment -- Node test types are outside the browser TypeScript configuration. */
// @ts-nocheck
import assert from 'node:assert/strict'
import test from 'node:test'
import { restaurantTablesMobileTourSteps, restaurantTablesTourPreferenceKey, restaurantTablesTourSteps } from '../restaurantTablesTour.ts'

test('el recorrido de Mesas usa controles reales y separa pasos seguros de informativos', () => {
  assert.deepEqual(restaurantTablesTourSteps.map((step) => step.id), ['open-tables', 'sectors', 'statuses', 'available-table', 'tables', 'add-products', 'send-kitchen', 'request-bill', 'release-table'])
  assert.equal(restaurantTablesTourSteps[0].interaction, 'navigate')
  assert.equal(restaurantTablesTourSteps.find((step) => step.id === 'tables')?.interaction, 'navigate')
  assert.ok(restaurantTablesTourSteps.every((step) => step.target.includes('data-tour')))
  assert.ok(restaurantTablesTourSteps.filter((step) => !['open-tables', 'tables'].includes(step.id)).every((step) => step.interaction === 'informative'))
})

test('el recorrido móvil abre primero el menú y conserva los pasos del salón', () => {
  assert.deepEqual(restaurantTablesMobileTourSteps.slice(0, 2).map((step) => step.id), ['open-menu', 'open-tables'])
  assert.equal(restaurantTablesMobileTourSteps.at(-1)?.id, 'release-table')
})

test('el progreso de Mesas se separa por empresa y usuario', () => {
  assert.notEqual(restaurantTablesTourPreferenceKey('tenant-a', 'user-a'), restaurantTablesTourPreferenceKey('tenant-b', 'user-a'))
  assert.notEqual(restaurantTablesTourPreferenceKey('tenant-a', 'user-a'), restaurantTablesTourPreferenceKey('tenant-a', 'user-b'))
})
