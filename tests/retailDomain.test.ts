import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createSaleLine, saleTotal, validatePayments } from '../src/core/sales.ts'
import { isRetailProfile, RETAIL_PROFILES } from '../src/modules/retail/domain/retailProfiles.ts'

test('Retail accepts only the eight supported tenant profiles', () => {
  assert.equal(RETAIL_PROFILES.length, 8)
  for (const profile of RETAIL_PROFILES) assert.equal(isRetailProfile(profile.id), true)
  assert.equal(isRetailProfile('restaurant'), false)
  assert.equal(isRetailProfile(null), false)
})

test('weight sale uses integer grams and rounds one line once', () => {
  const line = createSaleLine({ id:'cheese', name:'Queso', soldBy:'weight', priceMinor:6000, trackStock:true, stockUnit:'g' }, 750)
  assert.equal(line.subtotalMinor, 4500)
  assert.equal(saleTotal([line]), 4500)
})

test('unit and mixed payment totals must equal the authoritative sale total', () => {
  const unit = createSaleLine({ id:'cookie', name:'Galleta', soldBy:'unit', priceMinor:1250, trackStock:true, stockUnit:'unit' }, 2)
  assert.equal(saleTotal([unit]), 2500)
  validatePayments(2500, 1000, 1500)
  assert.throws(() => validatePayments(2500, 1000, 1000), /pagos no coinciden/)
})
