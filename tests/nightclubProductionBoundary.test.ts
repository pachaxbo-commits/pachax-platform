import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const source = readFileSync(new URL('../src/modules/nightclub/views/NightclubApp.tsx', import.meta.url), 'utf8')

test('production Nightclub fails closed without demo fixtures or local controller', () => {
  assert.doesNotMatch(source, /createNightclubDataset|useNightclubController|localStorage/)
  assert.match(source, /Servicio operacional todavía no conectado/)
  assert.match(source, /No se cargarán datos ficticios/)
})
