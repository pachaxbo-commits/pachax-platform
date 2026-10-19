/* eslint-disable @typescript-eslint/ban-ts-comment -- Node runs TypeScript outside the browser project. */
// @ts-nocheck
import assert from 'node:assert/strict'
import test from 'node:test'
import { restaurantStorage } from '../src/demo/restaurant/restaurantStorage.ts'

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

test('Claves de impresoras aisladas estrictamente entre Producción, Studio y Demo', async () => {
  const { getPrinterStorageKey } = await import('../src/services/printing/printerProfiles.ts')
  const prodKey = getPrinterStorageKey('tenant-real-abc', 'main')
  const studioKey = getPrinterStorageKey('studio-restaurant', 'main')
  const demoKey = getPrinterStorageKey('demo-restaurant', 'main')
  const studioCounterKey = getPrinterStorageKey('studio-hamburger', 'main')
  const demoCounterKey = getPrinterStorageKey('demo-hamburger', 'main')

  assert.equal(prodKey, 'pachax:printers:tenant-real-abc:main')
  assert.equal(studioKey, 'pachax:printers:studio-restaurant:main')
  assert.equal(demoKey, 'pachax:printers:demo-restaurant:main')
  assert.equal(studioCounterKey, 'pachax:printers:studio-hamburger:main')
  assert.equal(demoCounterKey, 'pachax:printers:demo-hamburger:main')

  const allKeys = new Set([prodKey, studioKey, demoKey, studioCounterKey, demoCounterKey])
  assert.equal(allKeys.size, 5, 'Cada entorno y perfil cuenta con clave de impresora única y aislada')
})
