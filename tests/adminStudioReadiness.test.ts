import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import { PUBLIC_TEMPLATES } from '../src/core/publicTemplates.ts'
import { getTemplate } from '../src/core/templates.ts'
import { mergeOfficialTemplates } from '../src/admin/store/templateDefaults.ts'
import { createFullNightclubDataset, createPristineNightclubDataset } from '../src/demo/datasets/nightclub/nightclubDatasets.ts'

test('Admin retains official templates when the remote collection is empty', () => {
  const templates = mergeOfficialTemplates([])
  assert.deepEqual(templates.map(item => item.id).sort(), ['custom', 'distribution', 'nightclub', 'restaurant', 'retail'])
  assert.ok(templates.every(item => item.status === 'published'))
})

test('Firestore overrides one template without erasing the others', () => {
  const [restaurant] = mergeOfficialTemplates([]).filter(item => item.id === 'restaurant')
  const merged = mergeOfficialTemplates([{ ...restaurant, commercialName: 'Restaurante actualizado', status: 'draft' }])
  assert.equal(merged.length, 5)
  assert.equal(merged.find(item => item.id === 'restaurant')?.commercialName, 'Restaurante actualizado')
  assert.equal(merged.find(item => item.id === 'restaurant')?.status, 'draft')
  assert.ok(merged.some(item => item.id === 'nightclub'))
})

test('Studio roles resolve through the canonical template registry', () => {
  assert.equal(PUBLIC_TEMPLATES.length, 4)
  for (const item of PUBLIC_TEMPLATES) {
    assert.ok(getTemplate(item.businessType).roles.some(role => role.id === 'admin'))
  }
  assert.deepEqual(getTemplate('nightclub_lounge').roles.map(role => role.id), ['owner', 'admin', 'cashier', 'waiter', 'bar', 'inventory'])
})

test('Nightclub Studio has full and genuinely empty sandbox datasets', () => {
  const full = createFullNightclubDataset()
  const empty = createPristineNightclubDataset()
  assert.ok(full.zones.length > 0 && full.tables.length > 0 && full.products.length > 0 && full.accounts.length > 0)
  assert.deepEqual([empty.zones, empty.tables, empty.products, empty.accounts, empty.customers, empty.reservations], [[], [], [], [], [], []])
  assert.equal(empty.shift, null)
  assert.equal(empty.inventoryMovements.length, 0)
})

test('Studio uses the admin operator guard and local Nightclub controller', () => {
  const entry = readFileSync(new URL('../src/studio/main.tsx', import.meta.url), 'utf8')
  const demo = readFileSync(new URL('../src/demo/nightclub/NightclubDemo.tsx', import.meta.url), 'utf8')
  assert.match(entry, /useAdminAuth/)
  assert.match(entry, /!import\.meta\.env\.DEV && !isAuthenticated/)
  assert.match(demo, /useNightclubController/)
  assert.match(demo, /pachax:nightclub-studio:operations:v3/)
  assert.doesNotMatch(demo, /tenantGateway|platformGateway|firestore/)
})
