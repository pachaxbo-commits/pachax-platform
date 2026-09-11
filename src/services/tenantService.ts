import type { Branch, TenantScopedEntity } from '../types'

export interface TenantContext {
  restaurantId: string
  branchId: string
  userUid: string | null
  userRole?: string | null
}

const CURRENT_SCHEMA_VERSION = 1
const COMPATIBILITY_FALLBACK_BRANCH = 'main'

let currentContext: TenantContext = {
  restaurantId: 'principal',
  branchId: COMPATIBILITY_FALLBACK_BRANCH,
  userUid: null,
}

export const TenantContextService = {
  setContext(restaurantId: string, branchId: string = COMPATIBILITY_FALLBACK_BRANCH, userUid: string | null = null, userRole?: string | null): void {
    if (!restaurantId || !restaurantId.trim()) {
      throw new Error('[TenantContextService] restaurantId inválido')
    }

    currentContext = {
      restaurantId: restaurantId.trim(),
      branchId: (branchId && branchId.trim()) || COMPATIBILITY_FALLBACK_BRANCH,
      userUid: userUid ? userUid.trim() : null,
      userRole: userRole || null,
    }
  },

  setBranch(branch: Branch): void {
    if (!branch || !branch.id) {
      throw new Error('[TenantContextService] Objeto sucursal inválido')
    }
    this.setContext(branch.restaurantId, branch.id, currentContext.userUid, currentContext.userRole)
  },

  /** Resolves primary/main branch from a list of branches dynamically by isMain / isPrimary flag */
  resolvePrimaryBranch(branches: Branch[]): Branch | null {
    if (!branches || branches.length === 0) return null
    const primary = branches.find((b) => b.isMain && b.isActive) || branches.find((b) => b.isMain) || branches[0]
    return primary
  },

  getContext(): TenantContext {
    return { ...currentContext }
  },

  requireValidContext(): TenantContext {
    if (!currentContext.restaurantId || !currentContext.restaurantId.trim()) {
      throw new Error('[TenantContextService] Operación denegada: Falta contexto de restaurante activo (restaurantId)')
    }
    return { ...currentContext }
  },

  /** Attaches tenant scoping, schema versioning, and timestamp metadata to newly created entities */
  createScopedEntityData<T extends Record<string, unknown>>(data: T, createdByUid?: string): T & TenantScopedEntity {
    const ctx = this.requireValidContext()
    const now = new Date().toISOString()

    return {
      ...data,
      schemaVersion: CURRENT_SCHEMA_VERSION,
      restaurantId: ctx.restaurantId,
      branchId: ctx.branchId,
      createdAt: (data.createdAt as string) || now,
      updatedAt: now,
      createdBy: createdByUid || ctx.userUid || 'system',
      isDeleted: false,
    }
  },

  /** Stamps soft delete metadata onto entity updates */
  createSoftDeleteData(deletedByUid?: string) {
    const ctx = this.requireValidContext()
    const now = new Date().toISOString()

    return {
      isDeleted: true,
      deletedAt: now,
      deletedBy: deletedByUid || ctx.userUid || 'system',
      updatedAt: now,
    }
  },
}
