import test from 'node:test'
import assert from 'node:assert/strict'
import { canLaunchCommercialDemo, freeDemoPath, isTemplateProvisioningAvailable, isTechnicalDemoAvailable } from '../src/core/publicTemplates.ts'
import { COMMERCIAL_TEMPLATES } from '../src/public/config/commercialShowcase.ts'

test('Public demo availability stays independent from commercial provisioning', () => {
  assert.equal(freeDemoPath('hamburger'), '/demo/hamburger?data=full')
  assert.equal(freeDemoPath('hamburger', 'empty'), '/demo/hamburger?data=empty')
  assert.equal(freeDemoPath('retail'), '/demo/retail?data=full')
  assert.equal(freeDemoPath('retail', 'empty'), '/demo/retail?data=empty')
  assert.equal(freeDemoPath('restaurant'), null)
  assert.equal(isTechnicalDemoAvailable('restaurant'), true)
  assert.equal(isTemplateProvisioningAvailable('restaurant'), true)
  assert.equal(canLaunchCommercialDemo(COMMERCIAL_TEMPLATES.find(template => template.id === 'restaurant')!), true)
  assert.equal(canLaunchCommercialDemo({
    id: 'restaurant',
    status: 'draft',
    demoEnabled: true,
    canonicalTemplateId: 'restaurant',
  }), false)
  assert.equal(isTemplateProvisioningAvailable('hamburger'), false)
  assert.equal(isTemplateProvisioningAvailable('retail'), false)
  assert.equal(isTechnicalDemoAvailable('hamburger'), false)
  assert.equal(isTechnicalDemoAvailable('retail'), false)
  assert.equal(canLaunchCommercialDemo({
    id: 'nightclub',
    status: 'published',
    demoEnabled: true,
    canonicalTemplateId: 'nightclub',
  }), false)
})
