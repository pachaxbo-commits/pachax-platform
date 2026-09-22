/** Canonical contracts for the new platform. Legacy Restaurant* adapters are separate. */
export type BusinessType = 'restaurant_pos' | 'route_distribution' | 'gelateria_weight_cafe'
export type Unit = 'kg' | 'g' | 'unit' | 'package' | 'box' | 'liter'
export type Permission =
  | 'sales.read' | 'sales.create' | 'orders.read' | 'orders.manage'
  | 'inventory.read' | 'inventory.manage' | 'products.manage'
  | 'customers.read' | 'customers.manage' | 'credits.read' | 'credits.collect'
  | 'reports.read' | 'users.manage' | 'settings.manage'
  | 'dispatch.create' | 'route.close' | 'cash.close'
export type Capability = 'sales' | 'orders' | 'inventory' | 'customers' | 'credits'
  | 'reports' | 'users' | 'settings' | 'dispatch' | 'routes' | 'cash'
  | 'kitchen' | 'tables' | 'weightSales' | 'unitSales' | 'aiAssistant'
export interface RolePreset { id: string; name: string; permissions: readonly Permission[] }
export interface ModuleDefinition { id: string; name: string; capability: Capability; permission: Permission }
export interface BusinessTemplate {
  businessType: BusinessType
  name: string
  description: string
  icon: 'restaurant' | 'truck' | 'ice-cream'
  version: number
  capabilities: readonly Capability[]
  modules: readonly ModuleDefinition[]
  roles: readonly RolePreset[]
  units: readonly Unit[]
  defaults: {
    currency: string; currencySymbol: string; timezone: string
    features: Partial<Record<Capability, boolean>>
    trackStock: boolean; allowNegativeStock: boolean
    ticketWidth: 58 | 80; paymentMethods: readonly ('cash' | 'qr' | 'mixed')[]
  }
  pos: 'orders' | 'route' | 'mixed-weight'
  inventory: 'commercial' | 'lots-and-routes'
  offlineOperations: readonly string[]
  reports: readonly string[]
}
export interface Tenant {
  tenantId: string
  name: string
  businessType: BusinessType
  ownerUid: string
  status: 'active' | 'trial' | 'suspended' | 'cancelled' | 'archived'
  branding: { logoUrl?: string; primary: string; accent: string }
  configuration: BusinessTemplate['defaults']
  entitlements: Partial<Record<Capability, boolean>>
  planKey: string | null
  subscriptionStatus: 'trial' | 'active' | 'past_due' | 'suspended' | 'cancelled'
  schemaVersion: number
  templateVersion: number
  createdAt: string
  updatedAt: string
}
export interface Membership {
  tenantId: string; uid: string; roleId: string; status: 'active' | 'disabled'
  branchIds: readonly string[]; routeIds: readonly string[]
}
export type PlatformRole = 'platform_owner' | 'platform_admin' | 'platform_support' | 'platform_finance'
export type PlatformPermission = 'tenants.read' | 'tenants.configure' | 'support.read'
  | 'support.elevate' | 'templates.preview' | 'audit.read' | 'finance.read'
export interface PlatformOperator { uid: string; role: PlatformRole; active: boolean }
export interface SupportSession {
  id: string; operatorUid: string; tenantId: string; viewedRoleId: string
  mode: 'read-only' | 'editing'; reason?: string; expiresAt: string
}
export const platformFlags = Object.freeze({ billingEnforcement: false, aiAssistant: false })

const platformPermissions: Record<PlatformRole, readonly PlatformPermission[]> = {
  platform_owner: ['tenants.read', 'tenants.configure', 'support.read', 'support.elevate', 'templates.preview', 'audit.read', 'finance.read'],
  platform_admin: ['tenants.read', 'tenants.configure', 'support.read', 'templates.preview', 'audit.read'],
  platform_support: ['tenants.read', 'support.read', 'templates.preview', 'audit.read'],
  platform_finance: ['tenants.read', 'finance.read'],
}

/** UI decision only. The server and rules must resolve the protected operator independently. */
export function canPlatform(operator: PlatformOperator | null, permission: PlatformPermission): boolean {
  return operator?.active === true && (platformPermissions[operator.role]?.includes(permission) ?? false)
}

/** Previewed roles never replace the authenticated operator identity or grant write access. */
export function canSupportWrite(operator: PlatformOperator | null, session: SupportSession | null, tenantId: string, now: number): boolean {
  return canPlatform(operator, 'support.elevate') && session?.operatorUid === operator?.uid
    && session?.tenantId === tenantId && session?.mode === 'editing'
    && Boolean(session.reason?.trim()) && Date.parse(session.expiresAt) > now
}

export function canUseModule(template: BusinessTemplate, tenant: Tenant, membership: Membership | null, module: ModuleDefinition): boolean {
  if (template.businessType !== tenant.businessType || membership?.tenantId !== tenant.tenantId || membership?.status !== 'active') return false
  if (!template.modules.some(item => item.id === module.id && item.capability === module.capability && item.permission === module.permission)) return false
  if (!template.capabilities.includes(module.capability) || tenant.configuration.features[module.capability] !== true) return false
  if (module.capability === 'aiAssistant' && !platformFlags.aiAssistant) return false
  // Commercial restrictions are deliberately disabled during development.
  if (platformFlags.billingEnforcement && tenant.entitlements[module.capability] !== true) return false
  return template.roles.find(role => role.id === membership.roleId)?.permissions.includes(module.permission) ?? false
}
