import test from 'node:test'
import assert from 'node:assert/strict'
import { compatibleInventoryUnits, fromBaseQuantity, toBaseQuantity } from '../src/modules/shared/domain/inventoryUnits.ts'

test('inventory display units preserve normalized stock', () => {
  assert.equal(toBaseQuantity(20, 'kg'), 20000)
  assert.equal(fromBaseQuantity(19800, 'kg'), 19.8)
  assert.equal(toBaseQuantity(10, 'l'), 10000)
  assert.equal(fromBaseQuantity(9750, 'l'), 9.75)
  assert.deepEqual(compatibleInventoryUnits('g'), ['g', 'kg'])
  assert.deepEqual(compatibleInventoryUnits('ml'), ['ml', 'l'])
})