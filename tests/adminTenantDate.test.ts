import assert from 'node:assert/strict'
import test from 'node:test'
import { formatTenantDate } from '../src/admin/tenantDate.ts'

test('formats ISO dates without shifting their displayed calendar day', () => {
  assert.equal(formatTenantDate('2026-10-30T02:15:00.000Z'), '2026-10-30')
})

test('formats Firestore timestamp shapes returned across callable boundaries', () => {
  const date = new Date('2026-10-30T12:00:00.000Z')
  assert.equal(formatTenantDate(date), '2026-10-30')
  assert.equal(formatTenantDate({ seconds: date.getTime() / 1000 }), '2026-10-30')
  assert.equal(formatTenantDate({ _seconds: date.getTime() / 1000 }), '2026-10-30')
  assert.equal(formatTenantDate({ toDate: () => date }), '2026-10-30')
  assert.equal(formatTenantDate({ toMillis: () => date.getTime() }), '2026-10-30')
})

test('renders absent and malformed tenant dates safely', () => {
  assert.equal(formatTenantDate(null), 'No disponible')
  assert.equal(formatTenantDate('not-a-date'), 'No disponible')
  assert.equal(formatTenantDate({ seconds: Number.NaN }), 'No disponible')
  assert.equal(formatTenantDate({ toDate: () => { throw new Error('bad timestamp') } }), 'No disponible')
})
