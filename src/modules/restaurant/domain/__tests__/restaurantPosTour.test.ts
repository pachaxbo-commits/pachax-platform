/* eslint-disable @typescript-eslint/ban-ts-comment -- Node test types are outside the browser TypeScript configuration. */
// @ts-nocheck
import assert from 'node:assert/strict'
import test from 'node:test'
import { restaurantPosTourPreferenceKey, restaurantPosTourSteps } from '../restaurantPosTour.ts'

test('el recorrido POS usa objetivos estables y no incluye acciones de venta', () => {
  assert.deepEqual(restaurantPosTourSteps.map((step) => step.id), ['open-pos', 'catalog', 'cart', 'fulfillment', 'confirm'])
  assert.equal(restaurantPosTourSteps[0].interaction, 'navigate')
  assert.ok(restaurantPosTourSteps.every((step) => step.target.includes('data-tour')))
  assert.ok(restaurantPosTourSteps.slice(1).every((step) => step.interaction === 'informative'))
})

test('la preferencia del tutorial POS se aísla por empresa y usuario', () => {
  assert.notEqual(restaurantPosTourPreferenceKey('restaurant-a', 'user-a'), restaurantPosTourPreferenceKey('restaurant-b', 'user-a'))
  assert.notEqual(restaurantPosTourPreferenceKey('restaurant-a', 'user-a'), restaurantPosTourPreferenceKey('restaurant-a', 'user-b'))
})
