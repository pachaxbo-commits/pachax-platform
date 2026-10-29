import test from 'node:test'
import assert from 'node:assert/strict'
import { canLaunchCommercialDemo, freeDemoPath, getPublicTemplate, isPublicDemoEnabled, isTemplateProvisioningAvailable, isTechnicalDemoAvailable, setPublicDemoConfiguration } from '../src/core/publicTemplates.ts'
import { COMMERCIAL_TEMPLATES } from '../src/public/config/commercialShowcase.ts'
import { getTemplateContactUrl, getTemplateSecondaryAction } from '../src/public/landing/templateActionPolicy.ts'

test('Public demo availability stays independent from commercial provisioning', () => {
  assert.equal(freeDemoPath('hamburger'), '/demo/hamburger?data=full')
  assert.equal(freeDemoPath('hamburger', 'empty'), '/demo/hamburger?data=empty')
  assert.equal(freeDemoPath('retail'), '/demo/retail?data=full')
  assert.equal(freeDemoPath('retail', 'empty'), '/demo/retail?data=empty')
  assert.equal(freeDemoPath('parcel'), '/demo/parcel?data=full')
  assert.equal(freeDemoPath('parcel', 'empty'), '/demo/parcel?data=empty')
  assert.equal(freeDemoPath('restaurant'), null)
  assert.equal(isTechnicalDemoAvailable('restaurant'), true)
  assert.equal(isPublicDemoEnabled('restaurant'), true)
  assert.equal(isTemplateProvisioningAvailable('restaurant'), true)
  assert.equal(isTemplateProvisioningAvailable('distribution'), true)
  assert.equal(isTemplateProvisioningAvailable('nightclub'), true)
  assert.equal(isTechnicalDemoAvailable('nightclub'), true)
  assert.equal(isPublicDemoEnabled('nightclub'), true)
  assert.equal(getPublicTemplate('nightclub').demoPath, '/demo/nightclub')
  assert.equal(canLaunchCommercialDemo(COMMERCIAL_TEMPLATES.find(template => template.id === 'nightclub')!), true)
  assert.equal(getPublicTemplate('parcel').demoPath, '/demo/parcel')
  assert.equal(isTechnicalDemoAvailable('parcel'), true)
  assert.equal(isPublicDemoEnabled('parcel'), true)
  assert.equal(isTemplateProvisioningAvailable('hamburger'), true)
  assert.equal(isTemplateProvisioningAvailable('retail'), true)
  assert.equal(canLaunchCommercialDemo(COMMERCIAL_TEMPLATES.find(template => template.id === 'restaurant')!), true)
  assert.equal(canLaunchCommercialDemo({
    id: 'restaurant',
    status: 'draft',
    demoEnabled: true,
    canonicalTemplateId: 'restaurant',
  }), true)
  assert.equal(isTemplateProvisioningAvailable('hamburger'), true)
  assert.equal(isTemplateProvisioningAvailable('retail'), true)
  assert.equal(isTechnicalDemoAvailable('hamburger'), true)
  assert.equal(isTechnicalDemoAvailable('retail'), true)
  assert.equal(canLaunchCommercialDemo({
    id: 'nightclub',
    status: 'published',
    demoEnabled: true,
    canonicalTemplateId: 'nightclub',
  }), true)
  setPublicDemoConfiguration([{ id: 'nightclub', demoEnabledConfigured: true, demoEnabled: false }])
  assert.equal(isTechnicalDemoAvailable('nightclub'), true)
  assert.equal(isPublicDemoEnabled('nightclub'), false)
  assert.equal(canLaunchCommercialDemo({ id: 'nightclub', canonicalTemplateId: 'nightclub' }), false)
  setPublicDemoConfiguration(null)
  setPublicDemoConfiguration([{ id: 'restaurant', demoEnabledConfigured: true, demoEnabled: false }])
  assert.equal(isTechnicalDemoAvailable('restaurant'), true)
  assert.equal(isPublicDemoEnabled('restaurant'), false)
  assert.equal(canLaunchCommercialDemo({ id: 'restaurant', status: 'published', canonicalTemplateId: 'restaurant' }), false)
  assert.equal(freeDemoPath('hamburger'), '/demo/hamburger?data=full')
  setPublicDemoConfiguration([{ id: 'hamburger', demoEnabledConfigured: true, demoEnabled: false }])
  assert.equal(isTechnicalDemoAvailable('hamburger'), true)
  assert.equal(isPublicDemoEnabled('hamburger'), false)
  assert.equal(freeDemoPath('hamburger'), null)
  setPublicDemoConfiguration(null)
})

test('catalog CTAs contact PACHAX instead of promising blocked self-service', () => {
  assert.deepEqual(getTemplateSecondaryAction('nightclub'), {
    kind: 'contact', label: 'Solicitar implementación',
  })
  assert.deepEqual(getTemplateSecondaryAction('retail'), {
    kind: 'view-plans', label: 'Ver planes', templateId: 'retail',
  })
  assert.deepEqual(getTemplateSecondaryAction('distribution'), {
    kind: 'contact', label: 'Solicitar implementación',
  })
  assert.deepEqual(getTemplateSecondaryAction('restaurant'), {
    kind: 'contact', label: 'Solicitar implementación',
  })
  assert.deepEqual(getTemplateSecondaryAction('hamburger'), {
    kind: 'view-plans', label: 'Ver planes', templateId: 'hamburger',
  })
  assert.deepEqual(getTemplateSecondaryAction('retail'), {
    kind: 'view-plans', label: 'Ver planes', templateId: 'retail',
  })
  assert.deepEqual(getTemplateSecondaryAction('custom'), {
    kind: 'quote', label: 'Cotizar a medida',
  })
  const implementationUrl = new URL(getTemplateContactUrl('Nightclub & Lounge', getTemplateSecondaryAction('nightclub')))
  assert.equal(implementationUrl.origin + implementationUrl.pathname, 'https://wa.me/59177987776')
  assert.match(implementationUrl.searchParams.get('text') || '', /implementación de Nightclub & Lounge/)
  for (const templateName of ['Restaurante con salón', 'Producción y Distribución', 'Nightclub & Lounge']) {
    const action = getTemplateSecondaryAction(
      templateName === 'Restaurante con salón' ? 'restaurant' : templateName === 'Producción y Distribución' ? 'distribution' : 'nightclub',
    )
    assert.equal(action.kind, 'contact')
    if (action.kind === 'contact') {
      assert.equal(action.label, 'Solicitar implementación')
      const url = new URL(getTemplateContactUrl(templateName, action))
      assert.match(url.searchParams.get('text') || '', new RegExp(templateName))
      assert.match(url.searchParams.get('text') || '', /solicitar una implementación/)
    }
  }
  const quoteUrl = new URL(getTemplateContactUrl('Solución a medida', getTemplateSecondaryAction('custom')))
  assert.equal(quoteUrl.origin + quoteUrl.pathname, 'https://wa.me/59177987776')
  assert.match(quoteUrl.searchParams.get('text') || '', /desarrollo a medida/)
})
