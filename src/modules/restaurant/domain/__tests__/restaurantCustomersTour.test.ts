/* eslint-disable @typescript-eslint/ban-ts-comment -- Node test types are outside the browser TypeScript configuration. */
// @ts-nocheck
import assert from 'node:assert/strict'
import test from 'node:test'
import { buildRestaurantCustomersTourSteps, restaurantCustomersMobileTourSteps, restaurantCustomersTourPreferenceKey } from '../restaurantCustomersTour.ts'

test('el tutorial autorizado conecta navegación, búsqueda, ficha e historial de consulta', () => {
  const steps = buildRestaurantCustomersTourSteps({ canManage: true, canViewHistory: true, canCreate: true, hasCustomers: true, hasWhatsAppContact: true })

  assert.equal(steps.length, 8)
  assert.equal(steps[0]?.target, '[data-tour="restaurant-nav-customers"]')
  assert.equal(steps[0]?.advanceWhen, '[data-tour="customers-board"]')
  assert.ok(steps.some((step) => step.target.includes('customers-search')))
  assert.ok(steps.some((step) => step.id === 'open-customer-form' && step.advanceWhen === '[data-tour="customers-form-fields"]'))
  assert.ok(steps.some((step) => step.id === 'customer-fields' && step.target === '[data-tour="customers-form-fields"]'))
  assert.ok(steps.some((step) => step.id === 'open-customer-profile' && step.advanceWhen === '[data-tour="customers-history"]'))
  assert.ok(steps.some((step) => step.target.includes('customers-profile-actions')))
  assert.ok(steps.every((step) => step.interaction === 'navigate' || step.interaction === 'informative'))
})

test('lista vacía y usuario de solo lectura no esperan una ficha ni muestran controles de edición', () => {
  const steps = buildRestaurantCustomersTourSteps({ canManage: false, canViewHistory: false, canCreate: false, hasCustomers: false, hasWhatsAppContact: false })

  assert.equal(steps.length, 5)
  assert.ok(steps.every((step) => step.id !== 'open-customer-profile'))
  assert.ok(steps.some((step) => step.id === 'customer-history' && step.target === '[data-tour="customers-list"]'))
  assert.ok(steps.at(-1)?.target === '[data-tour="customers-list"]')
  assert.ok(steps.every((step) => step.interaction === 'informative' || step.interaction === 'navigate'))
})

test('no muestra pasos de registro cuando el adaptador existe pero falta sales.create', () => {
  const steps = buildRestaurantCustomersTourSteps({ canManage: true, canViewHistory: true, canCreate: false, hasCustomers: true, hasWhatsAppContact: false })

  assert.ok(steps.every((step) => step.id !== 'open-customer-form' && step.id !== 'customer-fields'))
  assert.ok(steps.some((step) => step.id === 'open-customer-profile'))
})

test('usuario sin acceso al historial recibe el objetivo real de WhatsApp sin abrirlo', () => {
  const steps = buildRestaurantCustomersTourSteps({ canManage: false, canViewHistory: false, canCreate: false, hasCustomers: true, hasWhatsAppContact: true })

  assert.equal(steps.at(-1)?.target, '[data-tour="customers-whatsapp"]')
  assert.equal(steps.at(-1)?.interaction, 'informative')
})

test('el recorrido móvil abre menú y luego Clientes antes de los pasos de consulta', () => {
  const steps = buildRestaurantCustomersTourSteps({ canManage: false, canViewHistory: false, canCreate: true, hasCustomers: true, hasWhatsAppContact: false })
  const mobileSteps = restaurantCustomersMobileTourSteps(steps)

  assert.equal(mobileSteps[0]?.id, 'open-menu')
  assert.equal(mobileSteps[1]?.id, 'open-customers')
  assert.equal(mobileSteps[1]?.advanceWhen, '[data-tour="customers-board"]')
  assert.equal(mobileSteps.length, steps.length + 1)
})

test('el avance queda separado por tutorial, usuario y empresa', () => {
  assert.notEqual(restaurantCustomersTourPreferenceKey('tenant-a', 'user-a'), restaurantCustomersTourPreferenceKey('tenant-b', 'user-a'))
  assert.notEqual(restaurantCustomersTourPreferenceKey('tenant-a', 'user-a'), restaurantCustomersTourPreferenceKey('tenant-a', 'user-b'))
  assert.notEqual(restaurantCustomersTourPreferenceKey('tenant-a', 'user-a'), 'pachax:restaurant-products-tour:tenant-a:user-a:v1')
})
