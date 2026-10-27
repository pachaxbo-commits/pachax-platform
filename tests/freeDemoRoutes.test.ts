import test from 'node:test'
import assert from 'node:assert/strict'
import { freeDemoPath, isTemplateProvisioningAvailable, isTechnicalDemoAvailable } from '../src/core/publicTemplates.ts'

test('Hamburger and Retail demos are free without opening commercial provisioning', () => {
  assert.equal(freeDemoPath('hamburger'), '/demo/hamburger?data=full')
  assert.equal(freeDemoPath('hamburger', 'empty'), '/demo/hamburger?data=empty')
  assert.equal(freeDemoPath('retail'), '/demo/retail?data=full')
  assert.equal(freeDemoPath('retail', 'empty'), '/demo/retail?data=empty')
  assert.equal(freeDemoPath('restaurant'), null)
  assert.equal(isTechnicalDemoAvailable('restaurant'), false)
  assert.equal(isTemplateProvisioningAvailable('hamburger'), false)
  assert.equal(isTemplateProvisioningAvailable('retail'), false)
  assert.equal(isTechnicalDemoAvailable('hamburger'), false)
  assert.equal(isTechnicalDemoAvailable('retail'), false)
})
