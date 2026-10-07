/* eslint-disable @typescript-eslint/ban-ts-comment -- Node runs TypeScript outside the browser project. */
// @ts-nocheck
import assert from 'node:assert/strict'
import test from 'node:test'
import { restaurantStorage } from '../../../../demo/restaurant/restaurantStorage.ts'

test('Restaurant Studio y demo pública usan claves distintas y reset solo toca Studio', () => {
  const previousWindow = globalThis.window
  const previousStorage = globalThis.localStorage
  const storage = Object.create(null)
  Object.defineProperties(storage, {
    getItem: { value: key => storage[key] ?? null },
    setItem: { value: (key, value) => { storage[key] = value } },
    removeItem: { value: key => { delete storage[key] } },
  })
  try {
    globalThis.localStorage = storage
    globalThis.window = { location: { search: '' } }
    restaurantStorage.setItem('pachax:restaurant-demo:operations:v2:orders', 'public-order')
    globalThis.window.location.search = '?embed=studio'
    restaurantStorage.setItem('pachax:restaurant-demo:operations:v2:orders', 'studio-order')
    assert.equal(restaurantStorage.getItem('pachax:restaurant-demo:operations:v2:orders'), 'studio-order')
    assert.equal(storage['pachax:restaurant-demo:operations:v2:orders'], 'public-order')
    assert.equal(storage['pachax:restaurant-studio:operations:v2:orders'], 'studio-order')
    for (const key of restaurantStorage.keys()) restaurantStorage.removeItem(key)
    assert.equal(storage['pachax:restaurant-studio:operations:v2:orders'], undefined)
    assert.equal(storage['pachax:restaurant-demo:operations:v2:orders'], 'public-order')
    globalThis.window.location.search = ''
    assert.equal(restaurantStorage.getItem('pachax:restaurant-demo:operations:v2:orders'), 'public-order')
  } finally {
    globalThis.window = previousWindow
    globalThis.localStorage = previousStorage
  }
})
