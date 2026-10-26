/* eslint-disable @typescript-eslint/ban-ts-comment -- Node test types are outside the browser TypeScript configuration. */
// @ts-nocheck
import assert from 'node:assert/strict'
import test from 'node:test'
import { buildRestaurantCounterServiceTourSteps, restaurantCounterServiceTourPreferenceKey } from '../restaurantCounterServiceTour.ts'

test('el recorrido de mostrador resalta los selectores reales y omite Mesas', () => {
  const { steps } = buildRestaurantCounterServiceTourSteps({ canViewKitchen: true, canViewOrders: true, canViewHistory: true })
  assert.deepEqual(steps.map((step) => step.id), [
    'counter-open-pos', 'counter-products', 'counter-customize', 'counter-fulfillment', 'counter-payment',
    'counter-send-kitchen', 'counter-open-kitchen', 'counter-kitchen-status', 'counter-open-orders',
    'counter-order-delivery', 'counter-open-more-history', 'counter-open-history', 'counter-history',
  ])
  assert.ok(steps.every((step) => step.target.includes('data-tour')))
  assert.equal(steps.some((step) => step.target.includes('tables')), false)
  assert.equal(steps[0].missingTarget.fallbackTarget, '[data-tour="restaurant-menu-toggle"]')
  assert.equal(steps.find((step) => step.id === 'counter-send-kitchen').interaction, 'informative')
  assert.equal(steps.find((step) => step.id === 'counter-order-delivery').interaction, 'informative')
})

test('el recorrido móvil abre el menú antes de navegar entre módulos', () => {
  const { mobileSteps } = buildRestaurantCounterServiceTourSteps({ canViewKitchen: true, canViewOrders: true, canViewHistory: true })
  for (const moduleId of ['pos', 'kitchen', 'orders', 'history']) {
    const navIndex = mobileSteps.findIndex((step) => step.id === `counter-open-${moduleId}-mobile` || (moduleId === 'pos' && step.id === 'counter-open-pos-mobile'))
    assert.ok(navIndex > 0, `navegación móvil para ${moduleId}`)
    assert.match(mobileSteps[navIndex - 1].id, /open-menu/)
    assert.equal(mobileSteps[navIndex].interaction, 'navigate')
    assert.equal(mobileSteps[navIndex].missingTarget.fallbackTarget, '[data-tour="restaurant-menu-toggle"]')
  }
  assert.equal(mobileSteps.some((step) => step.target.includes('restaurant-nav-more')), false)
  const customizeIndex = mobileSteps.findIndex((step) => step.id === 'counter-customize')
  assert.equal(mobileSteps[customizeIndex + 1].id, 'counter-open-cart-mobile')
  assert.equal(mobileSteps[customizeIndex + 1].target, '[data-tour="pos-mobile-cart"]')
  assert.equal(mobileSteps[customizeIndex + 1].interaction, 'navigate')
  assert.equal(mobileSteps[customizeIndex + 1].missingTarget.fallbackTarget, '[data-tour="pos-catalog"]')
  assert.equal(mobileSteps.find((step) => step.id === 'counter-open-pos-mobile').missingTarget.fallbackTarget, '[data-tour="restaurant-menu-toggle"]')
  const sendIndex = mobileSteps.findIndex((step) => step.id === 'counter-send-kitchen')
  assert.equal(mobileSteps[sendIndex + 1].id, 'counter-close-cart-mobile')
  assert.equal(mobileSteps[sendIndex + 1].target, '[data-tour="pos-cart-close"]')
  assert.equal(mobileSteps[sendIndex + 1].missingTarget.fallbackTarget, '[data-tour="pos-catalog"]')
})

test('el recorrido se adapta a módulos autorizados y maneja las listas vacías', () => {
  const { steps, mobileSteps } = buildRestaurantCounterServiceTourSteps({ canViewKitchen: false, canViewOrders: false, canViewHistory: false })
  assert.equal(steps.some((step) => step.module === 'kitchen' || step.module === 'orders' || step.module === 'history'), false)
  assert.ok(steps.find((step) => step.id === 'counter-customize').missingTarget)
  assert.ok(mobileSteps.some((step) => step.id === 'counter-open-menu'))
})

test('el progreso del POS rápido queda aislado por empresa y usuario', () => {
  const first = restaurantCounterServiceTourPreferenceKey('tenant-a', 'user-a')
  assert.notEqual(first, restaurantCounterServiceTourPreferenceKey('tenant-b', 'user-a'))
  assert.notEqual(first, restaurantCounterServiceTourPreferenceKey('tenant-a', 'user-b'))
  assert.notEqual(first, 'pachax:restaurant-pos-tour:tenant-a:user-a:v1')
})
