export type InventoryUnit = 'unit' | 'g' | 'kg' | 'ml' | 'l'

export const baseUnitFor = (unit: InventoryUnit): 'unit' | 'g' | 'ml' => unit === 'kg' ? 'g' : unit === 'l' ? 'ml' : unit
export const compatibleInventoryUnits = (unit: InventoryUnit | undefined): InventoryUnit[] => {
  const base = baseUnitFor(unit || 'unit')
  return base === 'g' ? ['g', 'kg'] : base === 'ml' ? ['ml', 'l'] : ['unit']
}
export const toBaseQuantity = (quantity: number, unit: InventoryUnit): number => quantity * ((unit === 'kg' || unit === 'l') ? 1000 : 1)
export const fromBaseQuantity = (quantity: number, unit: InventoryUnit | undefined): number => quantity / (((unit === 'kg' || unit === 'l') ? 1000 : 1))
export const unitLabel = (unit: InventoryUnit | undefined, fallback = 'unid.') => unit === 'l' ? 'L' : unit || fallback
export const formatInventoryQuantity = (quantity: number, unit: InventoryUnit | undefined, fallback?: string) => `${fromBaseQuantity(quantity, unit).toLocaleString('es-BO', { maximumFractionDigits: 3 })} ${unitLabel(unit, fallback)}`
