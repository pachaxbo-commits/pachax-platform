/* eslint-disable @typescript-eslint/ban-ts-comment -- Node test types are outside the browser TypeScript configuration. */
// @ts-nocheck
import assert from 'node:assert/strict'
import test from 'node:test'
import { restaurantKitchenMobileTourSteps, restaurantKitchenTourPreferenceKey, restaurantKitchenTourSteps } from '../restaurantKitchenTour.ts'

test('el recorrido de Cocina apunta a controles reales y no ejecuta cambios de estado', () => {
  assert.deepEqual(restaurantKitchenTourSteps.map((step) => step.id), ['open-kitchen', 'orders', 'ticket', 'prepare', 'ready', 'delivery'])
  assert.equal(restaurantKitchenTourSteps[0].interaction, 'navigate')
  assert.ok(restaurantKitchenTourSteps.slice(1).every((step) => step.interaction === 'informative'))
  assert.ok(restaurantKitchenTourSteps.every((step) => step.target.includes('data-tour')))
})

test('el recorrido m\u00f3vil abre primero el men\u00fa de navegaci\u00f3n', () => {
  assert.deepEqual(restaurantKitchenMobileTourSteps.slice(0, 2).map((step) => step.id), ['open-menu', 'open-kitchen'])
  assert.equal(restaurantKitchenMobileTourSteps.at(-1)?.id, 'delivery')
})

test('el progreso de Cocina se a\u00edsla por empresa y usuario', () => {
  assert.notEqual(restaurantKitchenTourPreferenceKey('tenant-a', 'user-a'), restaurantKitchenTourPreferenceKey('tenant-b', 'user-a'))
  assert.notEqual(restaurantKitchenTourPreferenceKey('tenant-a', 'user-a'), restaurantKitchenTourPreferenceKey('tenant-a', 'user-b'))
})
