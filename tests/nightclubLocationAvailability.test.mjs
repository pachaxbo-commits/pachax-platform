import assert from 'node:assert/strict'
import test from 'node:test'
import { nightclubLocationProductAvailability } from '../src/modules/nightclub/domain/nightclubLocationAvailability.ts'

const inventory = [{ id: 'beer', name: 'Cerveza', unit: 'unit', current: 99 }]
const balances = [
  { id: 'box-a:beer', locationId: 'box-a', inventoryId: 'beer', availableQuantity: 6 },
  { id: 'box-b:beer', locationId: 'box-b', inventoryId: 'beer', availableQuantity: 20 },
]
const product = { id: 'beer-product', name: 'Cerveza', price: 30, stockUnits: 1000, inventoryMode: 'unit', inventoryId: 'beer', recipe: [] }

test('tenant availability uses only the selected physical location, never stockUnits or another box', () => {
  assert.equal(nightclubLocationProductAvailability(product, inventory, balances, [], 'box-a'), 6)
  assert.equal(nightclubLocationProductAvailability(product, inventory, balances, [], 'box-b'), 20)
  assert.equal(nightclubLocationProductAvailability(product, inventory, balances, [], null), 0)
})

test('inventoryMode none remains sellable without physical stock', () => {
  assert.equal(nightclubLocationProductAvailability({ ...product, inventoryMode: 'none', inventoryId: undefined }, inventory, [], [], 'box-a'), Number.MAX_SAFE_INTEGER)
})
