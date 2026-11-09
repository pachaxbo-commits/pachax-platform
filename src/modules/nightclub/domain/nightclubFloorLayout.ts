import type { NightclubTable, NightclubZone } from './nightclubAccounts'

export interface NightclubFloorPosition {
  x: number
  y: number
}

export type NightclubFloorLayout = Record<string, NightclubFloorPosition>

export interface NightclubFloorGrid {
  columns: number
  rows: number
}

export interface NightclubFloorStageSize {
  width: number
  height: number
  columns: number
  rows: number
}

/** Visual coordinates are editable only in explicit isolated practice contexts. */
export function canEditNightclubFloorLayout(mode: 'tenant' | 'demo' | 'studio', permissionGranted: boolean): boolean {
  return mode !== 'tenant' && permissionGranted
}

export function getNightclubFloorGrid(tableCount: number): NightclubFloorGrid {
  if (tableCount <= 0) return { columns: 0, rows: 0 }
  if (tableCount <= 2) return { columns: tableCount, rows: 1 }
  const columns = Math.min(6, Math.max(2, Math.ceil(Math.sqrt(tableCount * 1.2))))
  return { columns, rows: Math.ceil(tableCount / columns) }
}

/** A compact stage for small zones and enough space for dense rows of tables. */
export function getNightclubFloorStageSize(tableCount: number, availableWidth: number): NightclubFloorStageSize {
  const { columns, rows } = getNightclubFloorGrid(tableCount)
  return {
    width: Math.ceil(Math.max(availableWidth || 360, columns * 120 + 80)),
    height: Math.max(240, rows * 140 + 100),
    columns,
    rows,
  }
}

const clamp = (value: number) => Math.max(8, Math.min(92, Math.round(value)))

const centeredAxis = (count: number, lower = 20, upper = 80) => {
  if (count <= 1) return [50]
  if (count === 2) return [30, 70]
  if (count === 3) return [20, 50, 80]
  return Array.from({ length: count }, (_, index) => lower + (upper - lower) * index / (count - 1))
}

/** Stable, compact positions for legacy tables without a persisted layout contract. */
export function createAutomaticNightclubLayout(zones: readonly NightclubZone[], tables: readonly NightclubTable[]): NightclubFloorLayout {
  const layout: NightclubFloorLayout = {}
  for (const zone of zones.slice().sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id))) {
    const zoneTables = tables.filter(table => table.zoneId === zone.id).slice().sort((a, b) => a.name.localeCompare(b.name, 'es'))
    const { columns, rows } = getNightclubFloorGrid(zoneTables.length)
    const xPositions = centeredAxis(columns, columns >= 6 ? 10 : columns >= 4 ? 12 : 20, columns >= 6 ? 90 : columns >= 4 ? 88 : 80)
    const yPositions = rows === 1 ? [50] : centeredAxis(rows, rows >= 5 ? 10 : rows >= 4 ? 12 : rows >= 3 ? 20 : 35, rows >= 5 ? 90 : rows >= 4 ? 88 : rows >= 3 ? 80 : 65)
    zoneTables.forEach((table, index) => {
      layout[table.id] = {
        x: clamp(xPositions[index % columns] ?? 50),
        y: clamp(yPositions[Math.floor(index / columns)] ?? 50),
      }
    })
  }
  return layout
}

export function normalizeNightclubLayout(value: unknown, tableIds: readonly string[]): NightclubFloorLayout {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  const source = value as Record<string, unknown>
  const result: NightclubFloorLayout = {}
  for (const id of tableIds) {
    const point = source[id]
    if (!point || typeof point !== 'object') continue
    const candidate = point as Record<string, unknown>
    if (typeof candidate.x !== 'number' || !Number.isFinite(candidate.x) || typeof candidate.y !== 'number' || !Number.isFinite(candidate.y)) continue
    result[id] = { x: clamp(candidate.x), y: clamp(candidate.y) }
  }
  return result
}

export function mergeNightclubLayout(automatic: NightclubFloorLayout, saved: NightclubFloorLayout): NightclubFloorLayout {
  return Object.fromEntries(Object.entries(automatic).map(([id, point]) => [id, saved[id] || point]))
}

export function findNightclubLayoutCollisions(layout: NightclubFloorLayout, tableIds: readonly string[], minimumDistance = 15): string[][] {
  const collisions: string[][] = []
  for (let i = 0; i < tableIds.length; i += 1) {
    const firstId = tableIds[i]
    const first = layout[firstId]
    if (!first) continue
    for (let j = i + 1; j < tableIds.length; j += 1) {
      const secondId = tableIds[j]
      const second = layout[secondId]
      if (!second) continue
      if (Math.hypot(first.x - second.x, first.y - second.y) < minimumDistance) collisions.push([firstId, secondId])
    }
  }
  return collisions
}

/** Local coordinates are compared only with tables in the same sector, across every sector. */
export function findNightclubLayoutCollisionsByZone(layout: NightclubFloorLayout, tables: readonly NightclubTable[], minimumDistance = 15): string[][] {
  const tableIdsByZone = new Map<string, string[]>()
  for (const table of tables) {
    const ids = tableIdsByZone.get(table.zoneId) || []
    ids.push(table.id)
    tableIdsByZone.set(table.zoneId, ids)
  }
  return [...tableIdsByZone.values()].flatMap(ids => findNightclubLayoutCollisions(layout, ids, minimumDistance))
}

export function calculateNightclubFitZoom(contentWidth: number, contentHeight: number, viewportWidth: number, viewportHeight: number, minimum = 0.8, maximum = 1.5): number {
  if (contentWidth <= 0 || contentHeight <= 0 || viewportWidth <= 0 || viewportHeight <= 0) return 1
  const widthScale = Math.max(1, viewportWidth - 32) / contentWidth
  const heightScale = Math.max(1, viewportHeight - 32) / contentHeight
  const fit = Math.min(maximum, widthScale, heightScale)
  return Number(Math.max(minimum, fit).toFixed(2))
}

function hash(value: string): string {
  let result = 2166136261
  for (let index = 0; index < value.length; index += 1) result = Math.imul(result ^ value.charCodeAt(index), 16777619)
  return (result >>> 0).toString(36)
}

/** Stable per-scope identity key. Adding/removing a zone or table will not change it. */
export function createNightclubLayoutStorageKey(scope: 'demo' | 'studio', zones: readonly NightclubZone[] = [], tables: readonly NightclubTable[] = [], namespace = ''): string {
  void zones
  void tables
  return `pachax:nightclub:floor-layout:v2:${scope}:${hash(namespace.trim() || 'local')}`
}

/** Previous key format, retained only to migrate the matching pre-v2 dataset once. */
export function createLegacyNightclubLayoutStorageKey(scope: 'demo' | 'studio', zones: readonly NightclubZone[], tables: readonly NightclubTable[], namespace = ''): string {
  const identity = `${namespace}::${zones.map(zone => zone.id).sort().join('|')}::${tables.map(table => table.id).sort().join('|')}`
  return `pachax:nightclub:floor-layout:v1:${scope}:${hash(identity)}`
}

export interface NightclubLayoutStorage {
  getItem: (key: string) => string | null
  setItem: (key: string, value: string) => void
}

/** Loads the stable key, or imports an exact-set legacy key without overwriting existing data. */
export function loadNightclubLayout(storage: NightclubLayoutStorage, scope: 'demo' | 'studio', zones: readonly NightclubZone[], tables: readonly NightclubTable[], namespace = ''): NightclubFloorLayout {
  const ids = tables.map(table => table.id)
  const currentKey = createNightclubLayoutStorageKey(scope, zones, tables, namespace)
  const existing = storage.getItem(currentKey)
  if (existing !== null) return normalizeNightclubLayout(JSON.parse(existing), ids)

  const legacyKey = createLegacyNightclubLayoutStorageKey(scope, zones, tables, namespace)
  const legacyValue = storage.getItem(legacyKey)
  if (legacyValue === null) return {}
  const migrated = normalizeNightclubLayout(JSON.parse(legacyValue), ids)
  storage.setItem(currentKey, JSON.stringify(migrated))
  return migrated
}
