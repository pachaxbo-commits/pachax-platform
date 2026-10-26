// @ts-nocheck
import assert from 'node:assert/strict'
import test from 'node:test'
import {
  restaurantHistoryMobileTourSteps,
  restaurantHistoryTourPreferenceKey,
  restaurantHistoryTourSteps,
} from '../restaurantHistoryTour.ts'
import {
  restaurantUsersMobileTourSteps,
  restaurantUsersTourPreferenceKey,
  restaurantUsersTourSteps,
} from '../restaurantUsersTour.ts'
import {
  restaurantSettingsMobileTourSteps,
  restaurantSettingsTourPreferenceKey,
  restaurantSettingsTourSteps,
} from '../restaurantSettingsTour.ts'
import {
  restaurantPrintersMobileTourSteps,
  restaurantPrintersTourPreferenceKey,
  restaurantPrintersTourSteps,
} from '../domain/../restaurantPrintersTour.ts'
import {
  buildRestaurantLearningTutorials,
  restaurantLearningProgress,
  restaurantLearningTutorialIdsForProfile,
  type RestaurantTutorialId,
} from '../restaurantLearningCenter.ts'

test('recorridos complementarios tienen identificadores y selectores estables', () => {
  assert.ok(restaurantHistoryTourSteps.length >= 2)
  assert.ok(restaurantUsersTourSteps.length >= 2)
  assert.ok(restaurantSettingsTourSteps.length >= 2)
  assert.ok(restaurantPrintersTourSteps.length >= 2)

  // Selectores de navegación
  assert.equal(restaurantHistoryTourSteps[0].target, '[data-tour="restaurant-nav-history"]')
  assert.equal(restaurantUsersTourSteps[0].target, '[data-tour="restaurant-nav-users"]')
  assert.equal(restaurantSettingsTourSteps[0].target, '[data-tour="restaurant-nav-settings"]')
  assert.equal(restaurantPrintersTourSteps[0].target, '[data-tour="restaurant-nav-printers"]')

  // Pasos móviles abren menú primero
  assert.equal(restaurantHistoryMobileTourSteps[0].target, '[data-tour="restaurant-menu-toggle"]')
  assert.equal(restaurantUsersMobileTourSteps[0].target, '[data-tour="restaurant-menu-toggle"]')
  assert.equal(restaurantSettingsMobileTourSteps[0].target, '[data-tour="restaurant-menu-toggle"]')
  assert.equal(restaurantPrintersMobileTourSteps[0].target, '[data-tour="restaurant-menu-toggle"]')
})

test('claves de preferencia se aíslan por tenant y usuario para cada módulo complementario', () => {
  const keyH = restaurantHistoryTourPreferenceKey('tenant-1', 'user-a')
  const keyU = restaurantUsersTourPreferenceKey('tenant-1', 'user-a')
  const keyS = restaurantSettingsTourPreferenceKey('tenant-1', 'user-a')
  const keyP = restaurantPrintersTourPreferenceKey('tenant-1', 'user-a')

  assert.equal(keyH, 'pachax:restaurant-history-tour:tenant-1:user-a:v1')
  assert.equal(keyU, 'pachax:restaurant-users-tour:tenant-1:user-a:v1')
  assert.equal(keyS, 'pachax:restaurant-settings-tour:tenant-1:user-a:v1')
  assert.equal(keyP, 'pachax:restaurant-printers-tour:tenant-1:user-a:v1')

  // Aislamiento tenant B
  assert.notEqual(keyH, restaurantHistoryTourPreferenceKey('tenant-2', 'user-a'))
  assert.notEqual(keyU, restaurantUsersTourPreferenceKey('tenant-1', 'user-b'))
})

test('centro de aprendizaje integra los 11 recorridos de salón y los de mostrador', () => {
  const allIds: RestaurantTutorialId[] = [
    'pos',
    'tables',
    'kitchen',
    'cash',
    'products',
    'inventory',
    'customers',
    'history',
    'users',
    'settings',
    'printers',
  ]

  // En salón tradicional
  const salonIds = restaurantLearningTutorialIdsForProfile(allIds, 'restaurant')
  assert.equal(salonIds.length, 11)
  assert.ok(salonIds.includes('history'))
  assert.ok(salonIds.includes('users'))
  assert.ok(salonIds.includes('settings'))
  assert.ok(salonIds.includes('printers'))
  assert.equal(salonIds.includes('counter_pos'), false)

  // En fastfood
  const counterIds = restaurantLearningTutorialIdsForProfile(allIds, 'counter_service')
  assert.equal(counterIds.includes('tables'), false)
  assert.equal(counterIds.includes('pos'), false)
  assert.ok(counterIds.includes('counter_pos'))
  assert.ok(counterIds.includes('history'))

  // Progreso
  const tutorials = buildRestaurantLearningTutorials(salonIds, {
    pos: 'completed',
    history: 'completed',
  })
  const progress = restaurantLearningProgress(tutorials)
  assert.equal(progress.completed, 2)
  assert.equal(progress.total, 11)
  assert.equal(progress.percent, 18)
})
