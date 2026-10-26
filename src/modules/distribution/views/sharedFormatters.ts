import { round2 } from '../domain/engine'
import type { UnitType } from '../types'

/** Formato monetario de la demo: Bs con dos decimales. */
export function formatBs(value: number): string {
  return `Bs ${round2(value).toFixed(2)}`
}

export function formatQty(value: number, unitType: UnitType): string {
  const amount = round2(value)
  if (unitType === 'kg') return `${amount} kg`
  if (unitType === 'package') return `${amount} paq`
  return `${amount} u`
}

export function unitLabel(unitType: UnitType): string {
  if (unitType === 'kg') return 'Granel (kg)'
  if (unitType === 'package') return 'Paquete'
  return 'Unidad'
}

/** 2026-08-14 -> 14/08/2026 */
export function formatDayKey(dayKey: string): string {
  const [year, month, day] = (dayKey || '').split('-')
  return year ? `${day}/${month}/${year}` : dayKey
}

export function describeRange(dayKeys: string[]): string {
  if (dayKeys.length === 0) return ''
  if (dayKeys.length === 1) return formatDayKey(dayKeys[0])
  return `${formatDayKey(dayKeys[0])} a ${formatDayKey(dayKeys[dayKeys.length - 1])}`
}
