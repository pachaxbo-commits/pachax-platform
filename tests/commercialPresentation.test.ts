import assert from 'node:assert/strict'
import type { CommercialTemplateItem as AdminTemplate } from '../src/admin/types.ts'
import { SELF_SERVICE_SHOWCASE_TEMPLATES, SPECIALIZED_SHOWCASE_TEMPLATES } from '../src/public/config/commercialShowcase.ts'
import { buildPublishedShowcaseGroup } from '../src/public/landing/commercialPresentation.ts'

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
