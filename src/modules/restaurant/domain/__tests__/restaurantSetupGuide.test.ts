/* eslint-disable @typescript-eslint/ban-ts-comment -- Node test types are outside the browser TypeScript configuration. */
// @ts-nocheck
import assert from 'node:assert/strict'
import test from 'node:test'
import { getRestaurantSetupSteps, mayManageRestaurantSetup, restaurantSetupGuidePreferenceKey } from '../restaurantSetupGuide.ts'

const base = () => ({
  hasBusinessIdentity: false,
  sectors: [],
  tables: [],
  products: [],
  members: [],
  shift: null,
  shiftHistory: [],
})

test('la guía deriva los cinco pasos de la configuración real', () => {
  const steps = getRestaurantSetupSteps({
    ...base(),
    hasBusinessIdentity: true,
    sectors: [{ id: 'salon', name: 'Salón', active: true, sortOrder: 0 }],
    tables: [{ id: 'mesa-1', name: 'Mesa 1', number: 1, sectorId: 'salon', capacity: 4, active: true, status: 'available', sortOrder: 0 }],
    products: [{ id: 'p-1', name: 'Milanesa', price: 42, isActive: true, availability: 'available', image: '', isVisible: true, sortOrder: 0, categoryId: 'main', categoryName: 'Platos', preparationArea: 'Cocina' }],
    members: [{ active: true, role: 'cashier' }],
    shiftHistory: [{ id: 'shift-1', openedAt: '2026-10-21T12:00:00.000Z', openedBy: 'admin', openingFloat: 200 }],
  })

  assert.deepEqual(steps.map((step) => step.complete), [true, true, true, true, true])
})

test('una visita al módulo no completa pasos sin datos persistidos', () => {
  const steps = getRestaurantSetupSteps(base())
  assert.equal(steps.filter((step) => step.complete).length, 0)
  assert.equal(steps.find((step) => step.id === 'floor')?.module, 'tables')
  assert.equal(steps.find((step) => step.id === 'shift')?.module, 'cash')
})

test('el salón requiere una mesa activa vinculada a un sector activo', () => {
  const facts = base()
  facts.sectors = [{ id: 'archivado', name: 'Salón viejo', active: false, sortOrder: 0 }]
  facts.tables = [{ id: 'mesa-1', name: 'Mesa 1', number: 1, sectorId: 'archivado', capacity: 4, active: true, status: 'available', sortOrder: 0 }]

  assert.equal(getRestaurantSetupSteps(facts).find((step) => step.id === 'floor')?.complete, false)
})

test('only administrators receive the guide and each tenant has its own preference', () => {
  assert.equal(mayManageRestaurantSetup('cashier', false), false)
  assert.equal(mayManageRestaurantSetup('cashier', true), false)
  assert.equal(mayManageRestaurantSetup('admin'), true)
  assert.notEqual(
    restaurantSetupGuidePreferenceKey('restaurant-a', 'user-1'),
    restaurantSetupGuidePreferenceKey('restaurant-b', 'user-1'),
  )
})