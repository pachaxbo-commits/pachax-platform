import type { NightclubInventoryBalance, NightclubInventoryItem, NightclubOpenBottle, NightclubProduct } from './nightclubAccounts'

/** Availability for tenant POS: only stock physically held at the selling location counts. */
export function nightclubLocationProductAvailability(
  product: NightclubProduct,
  inventory: NightclubInventoryItem[],
  balances: NightclubInventoryBalance[],
  openBottles: NightclubOpenBottle[],
  locationId?: string | null,
) {
  if (product.active === false) return 0
  if (product.inventoryMode === 'none') return Number.MAX_SAFE_INTEGER
  if (!locationId) return 0

  const requirementLines = product.bottlePresentation
    ? [{ inventoryId: product.bottlePresentation.inventoryId, quantity: product.bottlePresentation.kind === 'pour' ? Number(product.bottlePresentation.millilitres || 0) : 1, unit: product.bottlePresentation.kind === 'pour' ? 'ml' : 'unit', presentation: product.bottlePresentation.kind }]
    : product.recipe?.length
      ? product.recipe
      : product.inventoryId
        ? [{ inventoryId: product.inventoryId, quantity: 1, unit: 'unit' }]
        : []
  if (!requirementLines.length || requirementLines.some(line => !line.inventoryId || !Number.isFinite(Number(line.quantity)) || Number(line.quantity) <= 0)) return 0

  const availability = requirementLines.map(line => {
    const item = inventory.find(value => value.id === line.inventoryId)
    const balance = balances.find(value => value.locationId === locationId && value.inventoryId === line.inventoryId)
    if (!item || !balance || Number(balance.availableQuantity) < 0) return 0
    const scale = line.unit === 'l' || line.unit === 'kg' ? 1000 : 1
    let available = Number(balance.availableQuantity)
    if (item.bottleCapacityMl && (line.unit === 'ml' || line.unit === 'l')) {
      const openMl = openBottles.filter(bottle => bottle.locationId === locationId && bottle.inventoryId === line.inventoryId && bottle.status === 'open').reduce((sum, bottle) => sum + Number(bottle.remainingMl || 0), 0)
      available = openMl + available * item.bottleCapacityMl
    }
    return Math.max(0, available / (Number(line.quantity) * scale))
  })
  return Math.max(0, Math.floor(Math.min(...availability)))
}
