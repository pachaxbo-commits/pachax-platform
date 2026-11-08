import type { FloorAction } from './restaurantFloor.ts'

export type RestaurantFloorActionResult = { ok: boolean; error?: string }
export type RestaurantFloorActionHandler = (action: FloorAction) => RestaurantFloorActionResult | Promise<RestaurantFloorActionResult>

// Production remains closed until layout.save has been certified for an authorized QA tenant.
export const REAL_TENANT_FLOOR_LAYOUT_EDITING_ENABLED = false

export function canEditRestaurantFloorLayout(isDemo: boolean, canManageFloor: boolean): boolean {
  return canManageFloor && (isDemo || REAL_TENANT_FLOOR_LAYOUT_EDITING_ENABLED)
}

export function dispatchRestaurantFloorAction(
  action: FloorAction,
  canEditLayout: boolean,
  onFloorAction: RestaurantFloorActionHandler,
): RestaurantFloorActionResult | Promise<RestaurantFloorActionResult> {
  if (action.type === 'layout.save' && !canEditLayout) {
    return { ok: false, error: 'La edición de posiciones no está disponible para esta empresa.' }
  }
  return onFloorAction(action)
}
