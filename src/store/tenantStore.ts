import { useSyncExternalStore } from 'react'
import { TenantContextService } from '../services/tenantService'
import { getRoleDefaultPermissions, hasPermission } from '../services/permissionService'
import type { Branch, Permission, UserRole } from '../types'

interface TenantState {
  activeRestaurantId: string
  activeBranchId: string
  activeBranchName: string
  availableBranches: Branch[]
  userRole: UserRole | null
  userPermissions: Permission[]
}

const defaultPrimaryBranch: Branch = {
  id: 'main',
  restaurantId: 'principal',
  name: 'Sucursal Central',
  code: 'SUC-01',
  isActive: true,
  isMain: true,
  createdAt: new Date().toISOString(),
}

let state: TenantState = {
  activeRestaurantId: 'principal',
  activeBranchId: defaultPrimaryBranch.id,
  activeBranchName: defaultPrimaryBranch.name,
  availableBranches: [defaultPrimaryBranch],
  userRole: 'admin',
  userPermissions: getRoleDefaultPermissions('admin'),
}

const listeners = new Set<() => void>()

function emit() {
  listeners.forEach((listener) => listener())
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function getSnapshot() {
  return state
}

export function useTenantStore() {
  const current = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)

  return {
    ...current,
    setTenant(
      restaurantId: string,
      branchId?: string,
      userUid: string | null = null,
      userRole: UserRole = 'admin',
      branches?: Branch[],
      customPermissions?: Permission[]
    ) {
      const branchesList = branches && branches.length > 0 ? branches : [defaultPrimaryBranch]
      const activeBranch = branchId
        ? branchesList.find((b) => b.id === branchId) || branchesList[0]
        : TenantContextService.resolvePrimaryBranch(branchesList) || branchesList[0]

      TenantContextService.setContext(restaurantId, activeBranch.id, userUid, userRole)

      const permissions = customPermissions && customPermissions.length > 0
        ? customPermissions
        : getRoleDefaultPermissions(userRole)

      state = {
        activeRestaurantId: restaurantId,
        activeBranchId: activeBranch.id,
        activeBranchName: activeBranch.name,
        availableBranches: branchesList,
        userRole,
        userPermissions: permissions,
      }
      emit()
    },
    switchBranch(branchId: string) {
      const branch = state.availableBranches.find((b) => b.id === branchId)
      if (branch) {
        TenantContextService.setBranch(branch)
        state = {
          ...state,
          activeBranchId: branch.id,
          activeBranchName: branch.name,
        }
        emit()
      }
    },
    hasPermission(permission: Permission): boolean {
      return hasPermission(state.userRole, permission, state.userPermissions)
    },
  }
}
