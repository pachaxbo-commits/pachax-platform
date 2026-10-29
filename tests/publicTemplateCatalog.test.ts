import assert from 'node:assert/strict'
import test from 'node:test'
import { COMMERCIAL_TEMPLATES } from '../src/public/config/commercialShowcase.ts'
import { mergeOfficialTemplates } from '../src/admin/store/templateDefaults.ts'
import { resolvePublicTemplateCatalog } from '../src/admin/store/publicTemplateCatalog.ts'

test('an unavailable catalog uses only approved public editorial cards, never plans or drafts', () => {
  const cards = resolvePublicTemplateCatalog({ kind: 'unavailable' })

  assert.deepEqual(cards.map(({ id }) => id), mergeOfficialTemplates([]).map(({ id }) => id))
  assert.ok(cards.every(({ status }) => status === 'published'))
  assert.ok(cards.every(({ thumbnailUrl, detailDescription, bullets }) => thumbnailUrl && detailDescription && bullets.length > 0))
  assert.ok(cards.every((card) => !('monthlyPriceUSD' in card) && !('annualPriceUSD' in card)))
})

test('a valid empty Admin publication remains empty and does not trigger the fallback', () => {
  assert.deepEqual(resolvePublicTemplateCatalog({ kind: 'available', templates: [] }), [])
})

test('a valid Admin publication controls visible cards and drafts stay hidden', () => {
  const [published] = COMMERCIAL_TEMPLATES
  const cards = resolvePublicTemplateCatalog({
    kind: 'available',
    templates: [published, { ...published, id: 'draft-card', status: 'draft' }],
  })

  assert.deepEqual(cards.map(({ id }) => id), [published.id])
  assert.notEqual(cards[0].bullets, published.bullets)
})
