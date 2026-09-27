import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'

test('Nightclub POS keeps the draft independent from destination selection', () => {
  const source = fs.readFileSync('src/modules/nightclub/views/NightclubPOS.tsx', 'utf8')
  assert.doesNotMatch(source, /onSelectAccount\([^)]*\)[\s\S]{0,120}onDraftChange\(\[\]\)/)
  assert.match(source, /Puedes preparar productos antes de elegir el destino/)
  assert.match(source, /disabled=\{available <= quantity\}/)
})

test('public Nightclub demo renders without the generic boxed wrapper', () => {
  const source = fs.readFileSync('src/demo/DemoRuntime.tsx', 'utf8')
  assert.match(source, /templateId === 'nightclub' \? 'max-w-none p-0'/)
})
