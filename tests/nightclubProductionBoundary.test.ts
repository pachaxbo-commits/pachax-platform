import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const source = readFileSync(new URL('../src/modules/nightclub/views/NightclubApp.tsx', import.meta.url), 'utf8')

test('production Nightclub uses canonical experience without demo fixtures or local controller', () => {
  assert.doesNotMatch(source, /createNightclubDataset|useNightclubController|localStorage/)
  assert.match(source, /NightclubExperience/)
  assert.match(source, /useTenantNightclubController/)
})
