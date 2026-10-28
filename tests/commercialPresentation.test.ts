import assert from 'node:assert/strict'
import type { CommercialTemplateItem as AdminTemplate } from '../src/admin/types.ts'
import { SELF_SERVICE_SHOWCASE_TEMPLATES, SPECIALIZED_SHOWCASE_TEMPLATES } from '../src/public/config/commercialShowcase.ts'
import { buildPublishedShowcaseGroup } from '../src/public/landing/commercialPresentation.ts'
import { resolvePublicTemplatePresentation } from '../src/admin/store/publicTemplateCatalog.ts'
import { filterPublicCommercialPlans } from '../src/admin/store/commercialCatalogContract.ts'
import { getQuickServiceEditorialData, getQuickServicePricingState } from '../src/public/landing/quickServicePresentation.ts'
import { freeDemoPath, setPublicDemoConfiguration } from '../src/core/publicTemplates.ts'

const distributionVisual = SPECIALIZED_SHOWCASE_TEMPLATES.find((item) => item.id === 'distribution')!
const restaurantVisual = SPECIALIZED_SHOWCASE_TEMPLATES.find((item) => item.id === 'restaurant')!
const hamburgerVisual = SELF_SERVICE_SHOWCASE_TEMPLATES.find((item) => item.id === 'hamburger')!
const adminRecord = (visual: typeof distributionVisual, overrides: Partial<AdminTemplate>) => ({
  ...visual,
  status: 'published',
  commercialMode: visual.id === 'hamburger' || visual.id === 'retail' ? 'self_service' : 'specialized',
  order: 10,
  ...overrides,
}) as unknown as AdminTemplate

const specialized = buildPublishedShowcaseGroup([
  adminRecord(distributionVisual, { commercialName: 'Contenido de Admin', order: 2 }),
  adminRecord(restaurantVisual, { commercialName: 'Borrador', status: 'draft', order: 1 }),
  adminRecord(distributionVisual, { id: 'custom', commercialMode: 'specialized', order: 1 }),
], 'specialized')

assert.equal(specialized.length, 1, 'only published official entries may populate the showcase')
assert.equal(specialized[0].commercialName, 'Contenido de Admin')
assert.equal(specialized[0].demoRoute, distributionVisual.demoRoute, 'technical route remains canonical')
assert.equal(specialized[0].primaryActionLabel, distributionVisual.primaryActionLabel, 'security CTA remains canonical')
assert.equal(specialized[0].accent, distributionVisual.accent, 'Admin content cannot inject visual tokens')
assert.deepEqual(buildPublishedShowcaseGroup([], 'specialized'), [], 'a valid empty catalog remains empty')

const quick = buildPublishedShowcaseGroup([
  adminRecord(hamburgerVisual, { commercialName: 'Hamburger publicado', order: 4 }),
  adminRecord(hamburgerVisual, { id: 'retail', commercialMode: 'self_service', order: 1 }),
], 'self_service')
assert.deepEqual(quick.map((item) => item.id), ['retail', 'hamburger'], 'published order is applied within the mode')

console.log('PASS landing adapter uses only published Admin editorial content while preserving canonical identity and routes')

const loadingFallback = resolvePublicTemplatePresentation('loading', false, [])
assert.equal(loadingFallback.source, 'editorial-reference')
assert.equal(loadingFallback.confirmedEmpty, false)
assert.deepEqual(loadingFallback.templates.map((template) => template.id).sort(), [
  'custom', 'distribution', 'hamburger', 'nightclub', 'restaurant', 'retail',
])
assert.equal(buildPublishedShowcaseGroup(loadingFallback.templates, 'specialized').length, 3)
assert.equal(buildPublishedShowcaseGroup(loadingFallback.templates, 'self_service').length, 2)

const failedFallback = resolvePublicTemplatePresentation('error', false, [])
assert.equal(failedFallback.source, 'editorial-reference')
assert.equal(failedFallback.templates.length, 6)

const confirmedEmpty = resolvePublicTemplatePresentation('ready', true, [])
assert.equal(confirmedEmpty.source, 'server-confirmed')
assert.equal(confirmedEmpty.confirmedEmpty, true)
assert.deepEqual(confirmedEmpty.templates, [], 'valid server empty must never seed the editorial fallback')

const staleConfirmedEmpty = resolvePublicTemplatePresentation('error', true, [])
assert.equal(staleConfirmedEmpty.source, 'server-confirmed')
assert.equal(staleConfirmedEmpty.confirmedEmpty, false)
assert.deepEqual(staleConfirmedEmpty.templates, [], 'a later gateway error must not invent offers after a confirmed empty catalog')

const hamburgerEditorial = getQuickServiceEditorialData('hamburger')
assert.match(hamburgerEditorial.description, /mostrador|rápido/i)
assert(hamburgerEditorial.capabilities.includes('Pedidos de mostrador y para llevar'))
assert(hamburgerEditorial.capabilities.includes('Gestión de cocina y preparación'))
assert(!hamburgerEditorial.capabilities.some((item) => /multisucursal|delivery completo|integraciones api/i.test(item)))

const retailEditorial = getQuickServiceEditorialData('retail')
assert.match(retailEditorial.description, /peso y unidad/i)
assert(retailEditorial.capabilities.includes('Venta por peso'))
assert(retailEditorial.capabilities.includes('Venta por unidad'))

assert.equal(getQuickServicePricingState('ready', true, false), 'editorial')
assert.equal(getQuickServicePricingState('loading', true, false), 'loading')
assert.equal(getQuickServicePricingState('error', true, false), 'unverified')
assert.equal(getQuickServicePricingState('ready', false, false), 'unavailable', 'A valid empty catalog must not publish disabled templates')
const approvedQuickPlan = filterPublicCommercialPlans([{
  id: 'qa-hamburger-plan', templateId: 'hamburger', name: 'Plan aprobado QA', status: 'published',
  planKind: 'paid', monthlyPriceUSD: 25, annualPriceUSD: 250, currency: 'USD', priceApproval: 'approved',
  includedFeatures: ['Caja y ventas'], technicalEntitlements: [],
}])
assert.equal(approvedQuickPlan.length, 1, 'A complete approved plan must be accepted by the public catalog contract')
assert.equal(getQuickServicePricingState('ready', true, approvedQuickPlan.length > 0), 'published', 'An approved plan switches back to the published-plan UI')
assert.equal(freeDemoPath('hamburger'), '/demo/hamburger?data=full')
assert.equal(freeDemoPath('retail'), '/demo/retail?data=full')
setPublicDemoConfiguration([{ id: 'hamburger', demoEnabledConfigured: true, demoEnabled: false }])
assert.equal(freeDemoPath('hamburger'), null, 'An explicit Admin demo disable must suppress the fallback demo CTA')
assert.equal(freeDemoPath('retail'), '/demo/retail?data=full', 'A demo disable for another template must not leak')
setPublicDemoConfiguration(null)

console.log('PASS catalog states, self-service editorial cards, demo paths, and published-offer transition')
