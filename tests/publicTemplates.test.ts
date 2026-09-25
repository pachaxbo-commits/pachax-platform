import assert from 'node:assert/strict'
import test from 'node:test'
import { PUBLIC_TEMPLATES } from '../src/core/publicTemplates.ts'
import { getTemplate } from '../src/core/templates.ts'
import { buildDemoUrl } from '../src/public/routing/demoNavigation.ts'
import { resolveDemoRoute } from '../src/demo/resolveDemoRoute.ts'

test('public templates use one canonical business, demo and Studio mapping', () => {
  assert.deepEqual(PUBLIC_TEMPLATES.map(item => item.id), ['restaurant', 'distribution', 'retail', 'nightclub'])
  for (const item of PUBLIC_TEMPLATES) {
    assert.equal(getTemplate(item.businessType).businessType, item.businessType)
    assert.equal(item.demoPath, `/demo/${item.id}`)
    assert.equal(item.studioTemplateId, item.id)
  }
})

test('public demo targets cross to demo entrypoint with explicit datasets', () => {
  for (const item of PUBLIC_TEMPLATES) {
    assert.equal(buildDemoUrl(item, 'empty'), `${item.demoPath}?data=empty`)
    assert.equal(buildDemoUrl(item, 'full'), `${item.demoPath}?data=full`)
  }
})

test('nightclub direct routes resolve DemoRuntime inputs', () => {
  assert.deepEqual(resolveDemoRoute('/demo/nightclub', '?data=empty'), { isGallery: false, templateId: 'nightclub', isStudioEmbed: false, initialRole: undefined, initialDatasetMode: 'empty' })
  assert.deepEqual(resolveDemoRoute('/demo/nightclub', '?data=full&embed=studio&role=bar'), { isGallery: false, templateId: 'nightclub', isStudioEmbed: true, initialRole: 'bar', initialDatasetMode: 'full' })
})
