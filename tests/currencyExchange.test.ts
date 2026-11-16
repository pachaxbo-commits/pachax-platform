import test from 'node:test'
import assert from 'node:assert/strict'
import {
  DEFAULT_EXCHANGE_RATE_CONFIG,
  calculateUsdReferenceFromBob,
  formatPrimaryCommercialAmount,
  formatUsdReferenceText,
  isExchangeRateUsable,
  normalizeExchangeRateConfig,
} from '../src/core/currencyExchange.ts'

test('exchange rate defaults and non-valid statuses hide USD reference cleanly', () => {
  assert.equal(isExchangeRateUsable(DEFAULT_EXCHANGE_RATE_CONFIG), false)
  assert.equal(calculateUsdReferenceFromBob(340, DEFAULT_EXCHANGE_RATE_CONFIG), null)
  assert.equal(formatUsdReferenceText(340, DEFAULT_EXCHANGE_RATE_CONFIG), null)

  const outdated = normalizeExchangeRateConfig({
    rateBsPerUsd: 6.96,
    source: 'BCB referencial',
    effectiveAt: '2026-11-14T12:00:00.000Z',
    status: 'outdated',
  })
  assert.equal(isExchangeRateUsable(outdated), false)
  assert.equal(calculateUsdReferenceFromBob(340, outdated), null)
  assert.equal(formatUsdReferenceText(340, outdated), null)
})

test('calculateUsdReferenceFromBob uses 2 decimals and formats informative label', () => {
  const valid = normalizeExchangeRateConfig({
    rateBsPerUsd: 6.96,
    source: 'BCB referencial',
    effectiveAt: '2026-11-14T14:30:00.000Z',
    status: 'valid',
  })
  assert.equal(isExchangeRateUsable(valid), true)
  assert.equal(calculateUsdReferenceFromBob(340, valid), 48.85)
  assert.equal(calculateUsdReferenceFromBob(3400, valid), 488.51)

  const label = formatUsdReferenceText(340, valid)
  assert.ok(label && label.includes('≈ USD 48.85') && label.includes('BCB referencial'))
  assert.equal(formatPrimaryCommercialAmount(340, 'BOB'), 'Bs 340')
  assert.equal(formatPrimaryCommercialAmount(49, 'USD'), 'USD 49')
})
