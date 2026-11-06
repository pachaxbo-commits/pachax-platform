import assert from 'node:assert/strict'
import { filterPublicCommercialPlans } from '../src/admin/store/commercialCatalogContract.ts'

const valid = {
  id: 'qa-hamburger-plan', templateId: 'hamburger', name: 'Oferta QA', planKind: 'paid',
  monthlyPriceUSD: 12, annualPriceUSD: 120, currency: 'USD', includedFeatures: ['Caja'],
  technicalEntitlements: [], priceApproval: 'approved', status: 'published',
}

assert.equal(filterPublicCommercialPlans([valid]).length, 1)
const legacyMonthlyOnly = filterPublicCommercialPlans([valid])[0]
assert.equal(legacyMonthlyOnly.annualPriceUSD, 0, 'ambiguous legacy annual amount is not exposed as an offer')
assert.equal(legacyMonthlyOnly.annualPriceUnit, null)
const confirmedUsd = filterPublicCommercialPlans([{ ...valid, annualPriceUnit: 'annual_total_12_months' }])[0]
assert.equal(confirmedUsd.annualPriceUSD, 120, 'confirmed annual total remains unchanged')
assert.equal(confirmedUsd.annualPriceUnit, 'annual_total_12_months')
const confirmedBob = filterPublicCommercialPlans([{
  ...valid, currency: 'BOB', monthlyPriceUSD: 240, annualPriceUSD: 2400,
  annualPriceUnit: 'annual_total_12_months',
}])[0]
assert.equal(confirmedBob.annualPriceUSD, 2400, 'BOB amount is not implicitly converted or multiplied')
assert.equal(filterPublicCommercialPlans([]).length, 0, 'an empty remote catalog stays empty')
assert.equal(filterPublicCommercialPlans([{ ...valid, status: 'draft' }]).length, 0)
assert.equal(filterPublicCommercialPlans([{ ...valid, priceApproval: 'pending' }]).length, 0)
assert.equal(filterPublicCommercialPlans([{ ...valid, templateId: 'unknown' }]).length, 0)
assert.equal(filterPublicCommercialPlans([{ ...valid, technicalEntitlements: ['multi_branch'] }]).length, 0)
assert.equal(filterPublicCommercialPlans([{ ...valid, monthlyPriceUSD: 0 }]).length, 0)
assert.equal(filterPublicCommercialPlans([{ ...valid, includedFeatures: [] }]).length, 0)
assert.equal(filterPublicCommercialPlans([{
  ...valid, planKind: 'free', monthlyPriceUSD: 0, annualPriceUSD: 0, adsRequired: true,
}]).length, 1)
assert.equal(filterPublicCommercialPlans([{
  ...valid, planKind: 'free', monthlyPriceUSD: 0, annualPriceUSD: 0, adsRequired: false,
}]).length, 0)

console.log('PASS commercial catalog filters published plans and redacts ambiguous annual units without converting currency or price')
