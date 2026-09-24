import assert from 'node:assert/strict'
import test from 'node:test'
import { readableForeground } from '../src/lib/tenantTheme.ts'

test('marca oscura usa texto claro y marca clara usa texto oscuro', () => {
  assert.equal(readableForeground('#0f172a'), '#ffffff')
  assert.equal(readableForeground('#fff1a8'), '#0f172a')
  assert.equal(readableForeground('#bfeaff'), '#0f172a')
})
