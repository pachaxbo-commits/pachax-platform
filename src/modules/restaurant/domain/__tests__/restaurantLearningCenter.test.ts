/* eslint-disable @typescript-eslint/ban-ts-comment -- Node test types are outside the browser TypeScript configuration. */
// @ts-nocheck
import assert from 'node:assert/strict'
import test from 'node:test'
import { buildRestaurantLearningTutorials, restaurantLearningProgress, restaurantTutorialActionLabel, restaurantTutorialStatusFromStorage, restaurantTutorialStatusLabel } from '../restaurantLearningCenter.ts'

test('el catálogo solo muestra los tutoriales autorizados y conserva los estados', () => {
  const tutorials = buildRestaurantLearningTutorials(['kitchen', 'pos'], { kitchen: 'completed', pos: 'in-progress', inventory: 'skipped' })
  assert.deepEqual(tutorials.map(({ id, status }) => [id, status]), [['kitchen', 'completed'], ['pos', 'in-progress']])
})

test('omitido no cuenta como completado en el progreso general', () => {
  const tutorials = buildRestaurantLearningTutorials(['pos', 'tables', 'kitchen'], { pos: 'completed', tables: 'skipped', kitchen: 'in-progress' })
  assert.deepEqual(restaurantLearningProgress(tutorials), { completed: 1, total: 3, percent: 33 })
})

test('los estados de persistencia se convierten sin confundir iniciado y omitido', () => {
  assert.equal(restaurantTutorialStatusFromStorage('started'), 'in-progress')
  assert.equal(restaurantTutorialStatusFromStorage('completed'), 'completed')
  assert.equal(restaurantTutorialStatusFromStorage('skipped'), 'skipped')
  assert.equal(restaurantTutorialStatusFromStorage(null), 'not-started')
  assert.equal(restaurantTutorialStatusLabel('skipped'), 'Omitido')
})

test('recorridos interrumpidos se ofrecen desde el inicio porque no hay cursor de paso persistido', () => {
  assert.equal(restaurantTutorialActionLabel('in-progress'), 'Volver a empezar')
  assert.equal(restaurantTutorialActionLabel('completed'), 'Repetir')
  assert.equal(restaurantTutorialActionLabel('skipped'), 'Iniciar')
})

test('el progreso se limita a la lista visible y queda vacío si no hay módulos autorizados', () => {
  assert.deepEqual(restaurantLearningProgress(buildRestaurantLearningTutorials([])), { completed: 0, total: 0, percent: 0 })
})
