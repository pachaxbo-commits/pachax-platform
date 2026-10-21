import type { DistLot, DistStockMovement } from '../types.ts'
import { round2 } from './engine.ts'

export interface LotLocationSummary {
  productId: string
  productName: string
  locationId: string
  unitType: DistLot['unitType']
  quantity: number
  lotCount: number
  estimatedValue: number | null
}

export function summarizeLotsByProductLocation(lots: DistLot[]): LotLocationSummary[] {
  const summary = new Map<string, LotLocationSummary & { hasUnknownCost: boolean }>()
  for (const lot of lots) {
    for (const [locationId, rawQuantity] of Object.entries(lot.quantities)) {
      const quantity = Number(rawQuantity) || 0
      if (quantity <= 0) continue
      const key = `${lot.productId}\0${locationId}`
      const current = summary.get(key) || {
        productId: lot.productId, productName: lot.productName, locationId,
        unitType: lot.unitType, quantity: 0, lotCount: 0, estimatedValue: 0,
        hasUnknownCost: false,
      }
      current.quantity = round2(current.quantity + quantity)
      current.lotCount += 1
      if (typeof lot.productionCost === 'number') current.estimatedValue = round2((current.estimatedValue || 0) + quantity * lot.productionCost)
      else current.hasUnknownCost = true
      summary.set(key, current)
    }
  }
  return [...summary.values()]
    .map(({ hasUnknownCost, ...row }) => ({ ...row, estimatedValue: hasUnknownCost ? null : row.estimatedValue }))
    .sort((a, b) => a.productName.localeCompare(b.productName) || a.locationId.localeCompare(b.locationId))
}

export function originalLotQuantity(lot: DistLot, movements: DistStockMovement[]): number | null {
  const intake = movements.filter(row => row.type === 'intake' && row.lotId === lot.id)
  return intake.length ? round2(intake.reduce((sum, row) => sum + row.quantity, 0)) : null
}
