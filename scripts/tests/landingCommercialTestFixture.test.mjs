import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import test from 'node:test'
import {
  EMPTY_PUBLIC_CATALOG_FIXTURE,
  LANDING_TEST_CONTACT,
  SYNTHETIC_PUBLIC_CATALOG_FIXTURE,
  createLandingCatalogAdapterScript,
} from '../landingCommercialTestFixture.mjs'

const root = resolve('.')
const officialTemplateIds = ['restaurant', 'distribution', 'nightclub', 'hamburger', 'retail', 'custom']

test('empty catalog uses the public response shape and contains no commercial data', () => {
  assert.deepEqual(EMPTY_PUBLIC_CATALOG_FIXTURE.templates, [])
  assert.deepEqual(EMPTY_PUBLIC_CATALOG_FIXTURE.plans, [])
  assert.deepEqual(EMPTY_PUBLIC_CATALOG_FIXTURE.extras, [])
  assert.equal(EMPTY_PUBLIC_CATALOG_FIXTURE.landingContent.officialWhatsAppNumber, '')
  assert.deepEqual(EMPTY_PUBLIC_CATALOG_FIXTURE.mediaAssets, [])
  assert(Array.isArray(EMPTY_PUBLIC_CATALOG_FIXTURE.demoConfiguration))
})

test('synthetic catalog conforms to the public projection without offers, prices, or activation claims', () => {
  assert.deepEqual(SYNTHETIC_PUBLIC_CATALOG_FIXTURE.templates.map(template => template.id), officialTemplateIds)
  for (const template of SYNTHETIC_PUBLIC_CATALOG_FIXTURE.templates) {
    assert.ok(readFileSync(join(root, 'public', template.thumbnailUrl), { flag: 'r' }), `Fixture image exists: ${template.thumbnailUrl}`)
  }
  assert.deepEqual(SYNTHETIC_PUBLIC_CATALOG_FIXTURE.plans, [])
  assert.deepEqual(SYNTHETIC_PUBLIC_CATALOG_FIXTURE.extras, [])
  assert(SYNTHETIC_PUBLIC_CATALOG_FIXTURE.templates.every(template => template.status === 'published'))
  assert(SYNTHETIC_PUBLIC_CATALOG_FIXTURE.templates.every(template => template.commercialAvailability === 'coming_soon'))
  assert(SYNTHETIC_PUBLIC_CATALOG_FIXTURE.templates.every(template => template.implementationBasePriceUSD === null))
  assert(SYNTHETIC_PUBLIC_CATALOG_FIXTURE.templates.every(template => template.demoEnabledConfigured === false))
  assert(SYNTHETIC_PUBLIC_CATALOG_FIXTURE.templates.every(template => !('monthlyPriceUSD' in template) && !('annualPriceUSD' in template)))
  assert.match(SYNTHETIC_PUBLIC_CATALOG_FIXTURE.templates[0].badge, /SOLO QA/)
  assert.equal(LANDING_TEST_CONTACT.number, '12025550100', 'The contact is a reserved test number, never a real PACHAX destination')
})

test('adapter only intercepts the local read-only public catalog and blocks all other endpoints', () => {
  const script = createLandingCatalogAdapterScript({ scenario: 'synthetic', fixture: SYNTHETIC_PUBLIC_CATALOG_FIXTURE })
  assert.match(script, /127\.0\.0\.1/)
  assert.match(script, /localhost/)
  assert.match(script, /getCatalog/)
  assert.match(script, /Only getCatalog is permitted/)
  assert.match(script, /Blocked by local landing test adapter/)
  assert.match(script, /demo-pachax-platform\/southamerica-west1\/publicCommercialGateway/)
})

test('no production source imports or activates the test catalog fixture', () => {
  const sourceRoot = join(root, 'src')
  const files = []
  const walk = directory => {
    for (const name of readdirSync(directory)) {
      const path = join(directory, name)
      if (statSync(path).isDirectory()) walk(path)
      else if (/\.(?:ts|tsx|js|jsx)$/.test(name)) files.push(path)
    }
  }
  walk(sourceRoot)
  for (const path of files) {
    const source = readFileSync(path, 'utf8')
    assert.doesNotMatch(source, /landingCommercialTestFixture|LANDING_TEST_CATALOG_SCENARIO|__PACHAX_LANDING_TEST_CATALOG__/,
      `Production source must not reference test fixture: ${path}`)
  }
})
