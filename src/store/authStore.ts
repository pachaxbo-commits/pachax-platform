import { useSyncExternalStore } from 'react'
import { doc, onSnapshot } from 'firebase/firestore'
import { isFirebaseConfigured, signInWithEmail, signOutUser, subscribeToAuthChanges, getFirebaseContext } from '../lib/firebase'
import { gateway } from '../services/gateway'
import { activateTenant, clearActiveTenant, getActiveTenant, profileCacheKey, selectedTenantKey } from './activeTenant'
import { resetCatalogRepository } from './catalogRepositoryFactory'
import { resetOrdersRepository } from './repositoryFactory'
import type { Membership, Tenant } from '../core/platform'
import type { BusinessType as LegacyBusinessType, RestaurantAccount, RestaurantMember, UserRole } from '../types'

type AuthStatus = 'loading' | 'signed_out' | 'authorized' | 'unauthorized' | 'needs_tenant' | 'authenticating'
interface TenantMembership extends Membership { displayName?: string; email?: string; warehouseId?: string }
interface TenantAccess { tenant: Tenant; membership: TenantMembership }
interface AuthState {
  mode: 'firebase' | 'local'; status: AuthStatus; userEmail: string | null; userDisplayName: string | null
  role: UserRole | null; member: RestaurantMember | null; error: string | null
  tenantId: string | null; restaurantId: string | null; businessType: LegacyBusinessType
  account: RestaurantAccount | null; availableTenants: TenantAccess[]
}
const listeners = new Set<() => void>()
let initialized = false
let stopWatches: (() => void)[] = []
const configured = isFirebaseConfigured()
let state: AuthState = { mode: configured ? 'firebase' : 'local', status: configured ? 'loading' : 'unauthorized',
  userEmail: null, userDisplayName: null, role: null, member: null, error: configured ? null : 'Firebase no está configurado.',
  tenantId: null, restaurantId: null, businessType: 'mobile_distribution', account: null, availableTenants: [] }
function emit() { listeners.forEach(listener => listener()) }
function setState(patch: Partial<AuthState>) { state = { ...state, ...patch }; emit() }
function resetData() { clearActiveTenant(); resetOrdersRepository(); resetCatalogRepository() }
function legacyRole(roleId: string): UserRole {
  return ({ cashier: 'caja', kitchen: 'cocina', waiter: 'pedidos', sales: 'caja', inventory: 'warehouse' }[roleId] || roleId) as UserRole
}
function toView(access: TenantAccess) {
  const { tenant, membership } = access, role = legacyRole(membership.roleId)
  const member: RestaurantMember = { uid: membership.uid, email: membership.email || '', displayName: membership.displayName || 'Usuario',
    role, active: membership.status === 'active', routeId: membership.routeIds[0], warehouseId: membership.warehouseId || 'central' }
  const account: RestaurantAccount = { id: tenant.tenantId, name: tenant.name, slug: tenant.tenantId, ownerUid: tenant.ownerUid,
    createdAt: tenant.createdAt, plan: tenant.planKey === 'enterprise' ? 'enterprise' : tenant.planKey === 'basic' ? 'basic' : 'pro', businessType: tenant.businessType === 'route_distribution' ? 'mobile_distribution' : 'restaurant',
    currencyCode: tenant.configuration.currency, currencySymbol: tenant.configuration.currencySymbol,
    branding: { name: tenant.name, primaryColor: tenant.branding.primary, accentColor: tenant.branding.accent, logoUrl: tenant.branding.logoUrl, tablesCount: 0 } }
  return { role, member, account, businessType: account.businessType }
}
function cacheAccess(uid: string, access: TenantAccess) {
  localStorage.setItem(profileCacheKey(uid, access.tenant.tenantId), JSON.stringify(access))
  localStorage.setItem(selectedTenantKey(uid), access.tenant.tenantId)
}
function cachedAccess(uid: string): TenantAccess | null {
  try {
    const tenantId = localStorage.getItem(selectedTenantKey(uid)); if (!tenantId) return null
    const parsed = JSON.parse(localStorage.getItem(profileCacheKey(uid, tenantId)) || 'null') as TenantAccess | null
    return parsed?.tenant.tenantId === tenantId && parsed.membership.uid === uid && parsed.membership.status === 'active' ? parsed : null
  } catch { return null }
}
function invalidate(message: string) {
  stopWatches.forEach(stop => stop()); stopWatches = []; resetData()
  setState({ status: 'unauthorized', tenantId: null, restaurantId: null, role: null, member: null, account: null, error: message })
}
async function activate(access: TenantAccess, uid: string, persistSelection: boolean) {
  stopWatches.forEach(stop => stop()); stopWatches = []; resetData(); activateTenant(access.tenant, access.membership); cacheAccess(uid, access)
  if (persistSelection) await gateway('tenantGateway', { action: 'selectTenant', tenantId: access.tenant.tenantId })
  const view = toView(access)
  setState({ status: 'authorized', tenantId: access.tenant.tenantId, restaurantId: access.tenant.tenantId, ...view, error: null })
  const context = await getFirebaseContext(); if (!context) return
  const tenantRef = doc(context.db, 'tenants', access.tenant.tenantId), memberRef = doc(context.db, 'tenants', access.tenant.tenantId, 'members', uid)
  stopWatches = [
    onSnapshot(tenantRef, snap => {
      if (!snap.exists()) return invalidate('La empresa ya no está disponible.')
      const current = getActiveTenant(); if (!current) return
      const updated = { tenant: { ...current.tenant, ...snap.data() } as Tenant, membership: current.membership }
      activateTenant(updated.tenant, updated.membership); cacheAccess(uid, updated); setState({ ...toView(updated) })
    }, () => undefined),
    onSnapshot(memberRef, snap => {
      if (!snap.exists() || snap.data().status !== 'active') return invalidate('Tu acceso a esta empresa fue desactivado.')
      const current = getActiveTenant(); if (!current) return
      const updated = { tenant: current.tenant, membership: snap.data() as TenantMembership }
      activateTenant(updated.tenant, updated.membership); cacheAccess(uid, updated); setState({ ...toView(updated) })
    }, () => undefined),
  ]
}
async function resolveUser(uid: string) {
  try {
    const availableTenants = await gateway<TenantAccess[]>('tenantGateway', { action: 'listMemberships' })
    setState({ availableTenants })
    if (!availableTenants.length) {
      return setState({ status: 'needs_tenant', error: null })
    }
    const preferred = localStorage.getItem(selectedTenantKey(uid))
    const selected = availableTenants.find(item => item.tenant.tenantId === preferred) || availableTenants[0]
    await activate(selected, uid, preferred !== selected.tenant.tenantId)
  } catch (error) {
    const cached = cachedAccess(uid)
    if (cached) return activate(cached, uid, false)
    throw error
  }
}
async function initialize() {
  if (initialized || !configured) return
  initialized = true
  await subscribeToAuthChanges(user => {
    stopWatches.forEach(stop => stop()); stopWatches = []; resetData()
    if (!user) return setState({ status: 'signed_out', userEmail: null, userDisplayName: null, role: null, member: null, account: null, tenantId: null, restaurantId: null, availableTenants: [], error: null })
    setState({ status: 'loading', userEmail: user.email, userDisplayName: user.displayName || user.email, error: null })
    void resolveUser(user.uid).catch(error => setState({ status: 'unauthorized', error: error instanceof Error ? error.message : 'No se pudo resolver tu acceso.' }))
  })
}
void initialize()
function subscribe(listener: () => void) { listeners.add(listener); return () => listeners.delete(listener) }
function getSnapshot() { return state }
export function getAuthMode() { return state.mode }
export function useAuthStore() {
  const authState = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
  return { ...authState,
    async signIn(email: string, password: string) { setState({ status: 'authenticating', error: null }); try { await signInWithEmail(email, password) } catch (error) { setState({ status: 'signed_out', error: error instanceof Error ? error.message : 'No se pudo iniciar sesión.' }) } },
    async signOut() { await signOutUser() },
    async switchTenant(tenantId: string) {
      const context = await getFirebaseContext(), access = state.availableTenants.find(item => item.tenant.tenantId === tenantId)
      if (!context?.auth.currentUser || !access) throw new Error('Empresa no autorizada.')
      setState({ status: 'loading' }); await activate(access, context.auth.currentUser.uid, true)
    },
  }
}
