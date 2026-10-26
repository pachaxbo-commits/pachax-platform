/* eslint-disable @typescript-eslint/ban-ts-comment -- Node test types are outside the browser TypeScript configuration. */
// @ts-nocheck
import assert from 'node:assert/strict'
import test from 'node:test'
import { restaurantCashTourSteps } from '../restaurantCashTour.ts'
import { restaurantKitchenTourSteps } from '../restaurantKitchenTour.ts'
import { restaurantTablesTourSteps } from '../restaurantTablesTour.ts'
import { resolveRestaurantTourStepIndex, resolveRestaurantTourTarget, RESTAURANT_TOUR_TARGET_WAIT_MS } from '../restaurantTourTarget.ts'

test('objetivo que aparece durante la carga prevalece sobre su alternativa', () => {
  const step = restaurantKitchenTourSteps.find((candidate) => candidate.id === 'ticket')!
  assert.deepEqual(resolveRestaurantTourTarget(step, { primaryFound: true, fallbackFound: true }), { status: 'primary' })
})

test('un objetivo ausente usa el contenedor y explicación declarados para el estado vacío', () => {
  const step = restaurantKitchenTourSteps.find((candidate) => candidate.id === 'prepare')!
  assert.deepEqual(resolveRestaurantTourTarget(step, { primaryFound: false, fallbackFound: true }), {
    status: 'fallback',
    selector: '[data-tour="kitchen-orders"]',
    description: step.missingTarget?.description,
  })
})

test('Cocina no trata la lista vacía como si hubiera comandas activas', () => {
  const step = restaurantKitchenTourSteps.find((candidate) => candidate.id === 'orders')!
  assert.equal(step.target, '[data-tour="kitchen-order-card"]')
  assert.deepEqual(step.missingTarget, {
    fallbackTarget: '[data-tour="kitchen-orders"]',
    description: 'No hay comandas activas ahora. Los pedidos pendientes aparecerán en esta lista con su número, productos, cantidades y observaciones.',
  })
})

test('Mesas distingue el filtro de sectores del estado sin sectores', () => {
  const step = restaurantTablesTourSteps.find((candidate) => candidate.id === 'sectors')!
  assert.equal(step.target, '[data-tour="tables-sector-option"]')
  assert.equal(step.missingTarget?.fallbackTarget, '[data-tour="tables-sectors"]')
  assert.match(step.missingTarget?.description || '', /no hay sectores configurados/i)
  const emptyTableFallback = restaurantTablesTourSteps.find((candidate) => candidate.id === 'available-table')!
  assert.equal(emptyTableFallback.missingTarget?.fallbackTarget, '[data-tour="tables-empty-state"], [data-tour="tables-grid"]')
})

test('un selector inválido no se confunde con un estado vacío legítimo', () => {
  const step = restaurantTablesTourSteps.find((candidate) => candidate.id === 'tables')!
  assert.deepEqual(resolveRestaurantTourTarget(step, { primaryFound: false, fallbackFound: true, selectorInvalid: true }), { status: 'invalid-selector' })
})

test('si falta también el respaldo, el paso queda como objetivo no encontrado', () => {
  const step = restaurantCashTourSteps.find((candidate) => candidate.id === 'sales')!
  assert.deepEqual(resolveRestaurantTourTarget(step, { primaryFound: false, fallbackFound: false }), { status: 'missing' })
})

test('Caja, Mesas y Cocina declaran alternativas para sus controles que dependen del estado', () => {
  for (const step of [
    ...restaurantCashTourSteps.filter(({ id }) => ['opening', 'sales', 'payment-methods', 'movements', 'charges', 'reconciliation', 'close'].includes(id)),
    ...restaurantTablesTourSteps.filter(({ id }) => ['sectors', 'available-table', 'tables', 'add-products', 'send-kitchen', 'request-bill', 'release-table'].includes(id)),
    ...restaurantKitchenTourSteps.filter(({ id }) => ['ticket', 'prepare', 'ready', 'delivery'].includes(id)),
  ]) {
    assert.ok(step.missingTarget?.fallbackTarget.includes('data-tour'), `${step.id} debe señalar un contenedor estable`)
    assert.ok(step.missingTarget.description.length > 20, `${step.id} debe explicar por qué no aparece el control`)
  }
})

test('la espera a que cargue el objetivo está acotada', () => {
  assert.ok(RESTAURANT_TOUR_TARGET_WAIT_MS > 0)
  assert.ok(RESTAURANT_TOUR_TARGET_WAIT_MS <= 1000)
})

test('preserves active step across mobile and desktop tour lists', () => {
  const mobileSteps = [{ id: 'open-menu' }, { id: 'open-kitchen' }, ...restaurantKitchenTourSteps.slice(1)]
  assert.equal(resolveRestaurantTourStepIndex(mobileSteps, 'prepare'), 4)
  assert.equal(resolveRestaurantTourStepIndex(restaurantKitchenTourSteps, 'prepare'), 3)
  assert.equal(resolveRestaurantTourStepIndex(mobileSteps, 'missing-step'), 0)
})
