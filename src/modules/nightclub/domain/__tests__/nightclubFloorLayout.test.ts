// @ts-expect-error Node test types are intentionally absent from the browser tsconfig.
import test from 'node:test'
// @ts-expect-error Node test types are intentionally absent from the browser tsconfig.
import assert from 'node:assert/strict'
import { canEditNightclubFloorLayout, createAutomaticNightclubLayout, createNightclubLayoutStorageKey, findNightclubLayoutCollisions, mergeNightclubLayout, normalizeNightclubLayout } from '../nightclubFloorLayout.ts'
import type { NightclubTable, NightclubZone } from '../nightclubAccounts.ts'

const zones: NightclubZone[] = [
  { id: 'main', name: 'Salón', sortOrder: 0 },
  { id: 'vip', name: 'Zona VIP', sortOrder: 1 },
]
const table = (id: string, zoneId = 'main'): NightclubTable => ({ id, zoneId, name: `Mesa ${id}`, capacity: 4, status: 'available' })

test('genera posiciones estables por zona para mesas antiguas sin contrato visual', () => {
  const tables = [table('b'), table('a'), table('vip-1', 'vip')]
  const first = createAutomaticNightclubLayout(zones, tables)
  assert.deepEqual(first, createAutomaticNightclubLayout(zones, tables))
  assert.notDeepEqual(first.a, first.b)
  assert.ok(first['vip-1'])
  assert.deepEqual(findNightclubLayoutCollisions(first, ['a', 'b']), [])
  assert.deepEqual(findNightclubLayoutCollisions(first, ['vip-1']), [])
})

test('un negocio sin zonas ni mesas conserva el plano vacío sin crear espacios ficticios', () => {
  assert.deepEqual(createAutomaticNightclubLayout([], []), {})
})

test('normaliza solo coordenadas finitas y limita el plano al área permitida', () => {
  assert.deepEqual(normalizeNightclubLayout({ a: { x: -100, y: 101 }, b: { x: NaN, y: 2 }, extra: { x: 40, y: 40 } }, ['a', 'b']), { a: { x: 8, y: 92 } })
})

test('combina posiciones guardadas con automáticas sin descartar mesas nuevas', () => {
  const automatic = createAutomaticNightclubLayout(zones, [table('a'), table('b')])
  const merged = mergeNightclubLayout(automatic, { a: { x: 30, y: 40 }, removed: { x: 50, y: 50 } })
  assert.deepEqual(merged.a, { x: 30, y: 40 })
  assert.deepEqual(merged.b, automatic.b)
  assert.equal('removed' in merged, false)
})

test('detecta colisiones y permite comparar dentro de un sector', () => {
  const layout = { a: { x: 20, y: 20 }, b: { x: 22, y: 22 }, c: { x: 23, y: 21 } }
  assert.equal(findNightclubLayoutCollisions(layout, ['a', 'b', 'c']).length, 3)
  assert.deepEqual(findNightclubLayoutCollisions(layout, ['a', 'c'], 5), [['a', 'c']])
})

test('separa almacenamiento local por entorno y tenant o sucursal', () => {
  const tables = [table('a')]
  const demoKey = createNightclubLayoutStorageKey('demo', zones, tables, 'tenant-1:branch-1')
  assert.notEqual(demoKey, createNightclubLayoutStorageKey('studio', zones, tables, 'tenant-1:branch-1'))
  assert.notEqual(demoKey, createNightclubLayoutStorageKey('demo', zones, tables, 'tenant-2:branch-1'))
})

test('el editor nunca se habilita en un tenant aunque el permiso general sea verdadero', () => {
  assert.equal(canEditNightclubFloorLayout('tenant', true), false)
  assert.equal(canEditNightclubFloorLayout('demo', true), true)
  assert.equal(canEditNightclubFloorLayout('studio', true), true)
  assert.equal(canEditNightclubFloorLayout('demo', false), false)
})

test('distribuye 30 mesas sin auto-colisiones', () => {
  const many = Array.from({ length: 30 }, (_, index) => table(String(index + 1)))
  const automatic = createAutomaticNightclubLayout(zones, many)
  assert.equal(findNightclubLayoutCollisions(automatic, many.map(item => item.id)).length, 0)
})
