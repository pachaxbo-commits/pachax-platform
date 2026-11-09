// @ts-expect-error Node test types are intentionally absent from the browser tsconfig.
import test from 'node:test'
// @ts-expect-error Node test types are intentionally absent from the browser tsconfig.
import assert from 'node:assert/strict'
import { calculateNightclubFitZoom, canEditNightclubFloorLayout, createAutomaticNightclubLayout, createLegacyNightclubLayoutStorageKey, createNightclubLayoutStorageKey, findNightclubLayoutCollisions, findNightclubLayoutCollisionsByZone, getNightclubFloorGrid, getNightclubFloorStageSize, loadNightclubLayout, mergeNightclubLayout, normalizeNightclubLayout } from '../nightclubFloorLayout.ts'
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

test('centra una o dos mesas y agrupa casos medianos y densos sin colisiones', () => {
  const one = createAutomaticNightclubLayout(zones, [table('solo')])
  assert.deepEqual(one.solo, { x: 50, y: 50 })
  const two = createAutomaticNightclubLayout(zones, [table('a'), table('b')])
  assert.deepEqual([two.a.x, two.b.x], [30, 70])
  assert.equal((two.a.x + two.b.x) / 2, 50)

  for (const count of [2, 6, 10, 30]) {
    const many = Array.from({ length: count }, (_, index) => table(`table-${index + 1}`))
    const layout = createAutomaticNightclubLayout(zones, many)
    assert.equal(findNightclubLayoutCollisions(layout, many.map(item => item.id)).length, 0, `${count} mesas no se superponen`)
    const grid = getNightclubFloorGrid(count)
    assert.equal(grid.columns * grid.rows >= count, true)
    assert.ok(grid.columns <= 6)
  }
  assert.deepEqual(getNightclubFloorGrid(6), { columns: 3, rows: 2 })
  assert.deepEqual(getNightclubFloorGrid(10), { columns: 4, rows: 3 })
  assert.deepEqual(getNightclubFloorGrid(30), { columns: 6, rows: 5 })
  assert.deepEqual(getNightclubFloorStageSize(2, 288), { width: 320, height: 240, columns: 2, rows: 1 })
  assert.ok(getNightclubFloorStageSize(30, 288).height > getNightclubFloorStageSize(10, 288).height)
  assert.ok(getNightclubFloorStageSize(30, 288).width > getNightclubFloorStageSize(2, 288).width)
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

test('valida todas las zonas, pero no considera colisión entre coordenadas locales de zonas distintas', () => {
  const tables = [table('main-a', 'main'), table('main-b', 'main'), table('vip-a', 'vip'), table('vip-b', 'vip')]
  const layout = {
    'main-a': { x: 50, y: 50 }, 'main-b': { x: 50, y: 50 },
    'vip-a': { x: 50, y: 50 }, 'vip-b': { x: 80, y: 80 },
  }
  assert.deepEqual(findNightclubLayoutCollisionsByZone(layout, tables), [['main-a', 'main-b']])
  assert.deepEqual(findNightclubLayoutCollisionsByZone({ 'main-a': { x: 50, y: 50 }, 'vip-a': { x: 50, y: 50 } }, [tables[0], tables[2]]), [])
})

test('fit view respects content bounds and available dimensions', () => {
  assert.equal(calculateNightclubFitZoom(0, 0, 300, 200), 1)
  assert.equal(calculateNightclubFitZoom(200, 100, 500, 300), 1.5)
  assert.equal(calculateNightclubFitZoom(600, 500, 320, 240), 0.8)
})

test('separa almacenamiento local por entorno y tenant o sucursal', () => {
  const tables = [table('a')]
  const demoKey = createNightclubLayoutStorageKey('demo', zones, tables, 'tenant-1:branch-1')
  assert.notEqual(demoKey, createNightclubLayoutStorageKey('studio', zones, tables, 'tenant-1:branch-1'))
  assert.notEqual(demoKey, createNightclubLayoutStorageKey('demo', zones, tables, 'tenant-2:branch-1'))
  assert.notEqual(demoKey, createNightclubLayoutStorageKey('demo', zones, tables, 'tenant-1:branch-2'))
  assert.equal(demoKey, createNightclubLayoutStorageKey('demo', [...zones, { id: 'new-zone', name: 'Nueva', sortOrder: 4 }], [...tables, table('new-table')], 'tenant-1:branch-1'))
})

test('mantiene posiciones al añadir/eliminar mesas y migra la clave anterior con el mismo conjunto', () => {
  const entries = new Map<string, string>()
  const storage = { getItem: (key: string) => entries.get(key) ?? null, setItem: (key: string, value: string) => { entries.set(key, value) } }
  const legacyKey = createLegacyNightclubLayoutStorageKey('demo', zones, [table('a')], 'tenant-1:branch-1')
  entries.set(legacyKey, JSON.stringify({ a: { x: 32, y: 46 }, removed: { x: 8, y: 8 } }))
  const migrated = loadNightclubLayout(storage, 'demo', zones, [table('a')], 'tenant-1:branch-1')
  assert.deepEqual(migrated, { a: { x: 32, y: 46 } })

  const updatedTables = [table('a'), table('added')]
  const stableKey = createNightclubLayoutStorageKey('demo', zones, [table('a')], 'tenant-1:branch-1')
  const extended = mergeNightclubLayout(createAutomaticNightclubLayout(zones, updatedTables), normalizeNightclubLayout(JSON.parse(storage.getItem(stableKey)!), updatedTables.map(item => item.id)))
  assert.deepEqual(extended.a, { x: 32, y: 46 })
  assert.ok(extended.added)
  assert.equal('removed' in extended, false)
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
