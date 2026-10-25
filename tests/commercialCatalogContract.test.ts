import assert from 'node:assert/strict'
import { filterPublicCommercialPlans } from '../src/admin/store/commercialCatalogContract.ts'

const valid = {
  id: 'qa-hamburger-plan', templateId: 'hamburger', name: 'Oferta QA', planKind: 'paid',
  monthlyPriceUSD: 12, annualPriceUSD: 120, currency: 'USD', includedFeatures: ['Caja'],
  technicalEntitlements: [], priceApproval: 'approved', status: 'published',
}

assert.equal(filterPublicCommercialPlans([valid]).length, 1)
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

console.log('PASS commercial catalog filters published, approved, complete plans without enabling technical entitlements')
