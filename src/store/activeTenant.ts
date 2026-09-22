import type { BusinessTemplate, Membership, Permission, Tenant } from '../core/platform'
import { getTemplate } from '../core/templates.ts'

export interface ActiveTenantContext {
  tenantId: string
  tenant: Tenant
  membership: Membership & { displayName?: string; email?: string; warehouseId?: string }
  role: string
  permissions: readonly Permission[]
  template: BusinessTemplate
  businessType: Tenant['businessType']
  branding: Tenant['branding']
  branchId: string
  routeId: string | null
}
let active: ActiveTenantContext | null = null
let generation = 0
const resets = new Set<() => void>()
export function getActiveTenant() { return active }
export function getTenantGeneration() { return generation }
export function onTenantReset(reset: () => void) { resets.add(reset); return () => { resets.delete(reset) } }
export function clearActiveTenant() {
  generation++
  active = null
  resets.forEach(reset => reset())
}
export function activateTenant(tenant: Tenant, membership: ActiveTenantContext['membership']) {
  if (membership.status !== 'active' || membership.tenantId !== tenant.tenantId) throw new Error('Membresía no autorizada.')
  const template = getTemplate(tenant.businessType), role = template.roles.find(role => role.id === membership.roleId)
  if (!role || !membership.branchIds.length) throw new Error('Membresía incompleta.')
  clearActiveTenant()
  active = { tenantId: tenant.tenantId, tenant, membership, role: role.id, permissions: role.permissions,
    template, businessType: tenant.businessType, branding: tenant.branding,
    branchId: membership.branchIds[0], routeId: membership.routeIds[0] || null }
  return active
}
export const profileCacheKey = (uid: string, tenantId: string) => `pachax:v2:profile:${encodeURIComponent(uid)}:${encodeURIComponent(tenantId)}`
export const selectedTenantKey = (uid: string) => `pachax:v2:selected:${encodeURIComponent(uid)}`
