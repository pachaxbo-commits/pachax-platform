import type { Permission } from '../../../types.ts'

type PermissionCheck = (permission: Permission) => boolean

export function getInventoryCapabilities(
  can: PermissionCheck,
  role: string,
  selectedWarehouse: string,
  assignedWarehouse?: string,
) {
  const canManageInventory = can('dist.inventory.adjust')
  const canSelectWarehouse = can('dist.users.manage')
  const warehouseId = canSelectWarehouse ? selectedWarehouse : assignedWarehouse || 'central'

  return {
    warehouseId,
    canSelectWarehouse,
    canIntake: canManageInventory && warehouseId === 'central',
    canAdjust: canManageInventory,
    isDistributor: role === 'distributor',
  }
}
