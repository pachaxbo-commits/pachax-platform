import type { NightclubTable, NightclubZone } from './nightclubAccounts'

export interface NightclubFloorPosition {
  x: number
  y: number
}

export type NightclubFloorLayout = Record<string, NightclubFloorPosition>

/** Visual coordinates are editable only in explicit isolated practice contexts. */
export function canEditNightclubFloorLayout(mode: 'tenant' | 'demo' | 'studio', permissionGranted: boolean): boolean {
  return mode !== 'tenant' && permissionGranted
}

const clamp = (value: number) => Math.max(8, Math.min(92, Math.round(value)))

/** Stable, non-persistent positions for legacy tables without a layout contract. */
export function createAutomaticNightclubLayout(zones: readonly NightclubZone[], tables: readonly NightclubTable[]): NightclubFloorLayout {
  const layout: NightclubFloorLayout = {}
  for (const zone of zones.slice().sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id))) {
    const zoneTables = tables.filter(table => table.zoneId === zone.id).slice().sort((a, b) => a.name.localeCompare(b.name, 'es'))
    const columns = Math.max(1, Math.ceil(Math.sqrt(zoneTables.length)))
    const rows = Math.max(1, Math.ceil(zoneTables.length / columns))
    zoneTables.forEach((table, index) => {
      const column = index % columns
      const row = Math.floor(index / columns)
      layout[table.id] = {
        x: clamp(8 + (columns === 1 ? 42 : column * 84 / (columns - 1))),
        y: clamp(8 + (rows === 1 ? 42 : row * 84 / (rows - 1))),
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

export function createNightclubLayoutStorageKey(scope: 'demo' | 'studio', zones: readonly NightclubZone[], tables: readonly NightclubTable[], namespace = ''): string {
  const identity = `${namespace}::${zones.map(zone => zone.id).sort().join('|')}::${tables.map(table => table.id).sort().join('|')}`
  let hash = 2166136261
  for (let index = 0; index < identity.length; index += 1) hash = Math.imul(hash ^ identity.charCodeAt(index), 16777619)
  return `pachax:nightclub:floor-layout:v1:${scope}:${(hash >>> 0).toString(36)}`
}
