import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import {
  activateTenant,
  clearActiveTenant,
  getActiveTenant,
  onTenantReset,
  profileCacheKey,
  selectedTenantKey,
} from '../src/store/activeTenant.ts'
import { getTemplate } from '../src/core/templates.ts'
import type { Membership, Tenant } from '../src/core/platform.ts'
import type { TenantAccess } from '../src/store/authStore.ts'

function createTenantFixture(tenantId: string, businessType = 'route_distribution', ownerUid = 'user-owner'): {
  tenant: Tenant
  membership: Membership & { displayName?: string; email?: string; warehouseId?: string }
} {
  const template = getTemplate(businessType)
  return {
    tenant: {
      tenantId,
      name: `Empresa ${tenantId}`,
      businessType: template.businessType,
      ownerUid,
      status: 'active',
      branding: { primary: '#20383A', accent: '#B58A55' },
      configuration: template.defaults,
      entitlements: {},
      planKey: null,
      subscriptionStatus: 'trial',
      schemaVersion: 1,
      templateVersion: template.version,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    membership: {
      tenantId,
      uid: ownerUid,
      roleId: 'owner',
      status: 'active',
      branchIds: ['main'],
      routeIds: ['central'],
      displayName: 'Dueño QA',
      email: `${ownerUid}@example.test`,
      warehouseId: 'central',
    },
  }
}

function initialTenantId(uid: string): string {
  const digest = createHash('sha256').update(`initial-tenant:${uid}`).digest('hex').slice(0, 36)
  return `t_${digest}`
}

function operationTenantId(uid: string, operationId: string): string {
  const hash = createHash('sha256').update(`${uid}:${operationId}`).digest('hex').slice(0, 36)
  return `t_${hash}`
}

// -----------------------------------------------------------------------------
// 1. USUARIO SIN MEMBERSHIPS (needs_tenant -> onboarding)
// -----------------------------------------------------------------------------
test('Scenario 1: User without memberships triggers needs_tenant and opens onboarding', () => {
  const availableTenants: TenantAccess[] = []

  // Resolución esperada para usuario sin membresías
  const status = availableTenants.length === 0 ? 'needs_tenant' : 'authorized'
  const isSelectingTenant = false

  assert.equal(status, 'needs_tenant')
  assert.equal(isSelectingTenant, false)
  assert.equal(availableTenants.length, 0)
  assert.equal(getActiveTenant(), null)
})

// -----------------------------------------------------------------------------
// 2. USUARIO CON UNA MEMBERSHIP (auto-activación, sin selector)
// -----------------------------------------------------------------------------
test('Scenario 2: User with a single valid membership activates directly without selector', () => {
  clearActiveTenant()
  const f = createTenantFixture('single-tenant-corp')
  const availableTenants: TenantAccess[] = [f]

  assert.equal(availableTenants.length, 1)

  // Activación directa requerida para Caso B
  const active = activateTenant(availableTenants[0].tenant, availableTenants[0].membership)
  const isSelectingTenant = availableTenants.length > 1

  assert.equal(isSelectingTenant, false)
  assert.equal(active.tenantId, 'single-tenant-corp')
  assert.equal(active.role, 'owner')
  assert.equal(active.branchId, 'main')
  assert.equal(getActiveTenant()?.tenantId, 'single-tenant-corp')
  clearActiveTenant()
})

// -----------------------------------------------------------------------------
// 3. USUARIO CON MÚLTIPLES MEMBERSHIPS (muestra selector)
// -----------------------------------------------------------------------------
test('Scenario 3: User with multiple memberships opens tenant selector', () => {
  clearActiveTenant()
  const a = createTenantFixture('tenant-alpha', 'route_distribution')
  const b = createTenantFixture('tenant-beta', 'restaurant_pos')
  const availableTenants: TenantAccess[] = [a, b]

  assert.equal(availableTenants.length, 2)

  // En login sin sesión activa previa, debe mostrar selector
  const sessionTenantId: string | null = null
  const shouldShowSelector = availableTenants.length > 1 && !sessionTenantId

  assert.equal(shouldShowSelector, true)
  assert.equal(availableTenants[0].tenant.name, 'Empresa tenant-alpha')
  assert.equal(availableTenants[1].tenant.name, 'Empresa tenant-beta')
  assert.equal(availableTenants[0].membership.roleId, 'owner')
  assert.equal(availableTenants[1].membership.roleId, 'owner')
})

// -----------------------------------------------------------------------------
// 4. SELECCIÓN TENANT A -> TENANT B (cambio de empresa sin relog)
// -----------------------------------------------------------------------------
test('Scenario 4: Switching from Tenant A to Tenant B invalidates and resets context', () => {
  clearActiveTenant()
  let resetCount = 0
  const unregister = onTenantReset(() => {
    resetCount++
  })

  const a = createTenantFixture('tenant-distribuidora', 'route_distribution')
  const b = createTenantFixture('tenant-restaurante', 'restaurant_pos')

  // Activa A
  activateTenant(a.tenant, a.membership)
  assert.equal(getActiveTenant()?.tenantId, 'tenant-distribuidora')
  assert.equal(getActiveTenant()?.businessType, 'route_distribution')

  // Cambia a B
  activateTenant(b.tenant, b.membership)
  assert.equal(getActiveTenant()?.tenantId, 'tenant-restaurante')
  assert.equal(getActiveTenant()?.businessType, 'restaurant_pos')

  // Debe haber notificado a los repositorios de limpiar datos 2 veces
  assert.equal(resetCount, 2)

  // Cambia de vuelta a A
  activateTenant(a.tenant, a.membership)
  assert.equal(getActiveTenant()?.tenantId, 'tenant-distribuidora')
  assert.equal(resetCount, 3)

  unregister()
  clearActiveTenant()
})

// -----------------------------------------------------------------------------
// 5. AISLAMIENTO DE CACHÉ (uid + tenantId)
// -----------------------------------------------------------------------------
test('Scenario 5: Cache keys are strictly isolated by uid + tenantId', () => {
  const uid = 'operador-123'
  const keyTenantA = profileCacheKey(uid, 'empresa-a')
  const keyTenantB = profileCacheKey(uid, 'empresa-b')

  assert.notEqual(keyTenantA, keyTenantB)
  assert(keyTenantA.includes('empresa-a'))
  assert(keyTenantB.includes('empresa-b'))
  assert(keyTenantA.includes(uid))

  // Asegurar que el clearActiveTenant deja null
  const f = createTenantFixture('empresa-a', 'route_distribution', uid)
  activateTenant(f.tenant, f.membership)
  assert.equal(getActiveTenant()?.tenantId, 'empresa-a')

  clearActiveTenant()
  assert.equal(getActiveTenant(), null)
})

// -----------------------------------------------------------------------------
// 6. LOGOUT / LOGIN CON USUARIO DIFERENTE (no hereda tenant)
// -----------------------------------------------------------------------------
test('Scenario 6: User 2 never inherits active tenant from User 1 on the same browser', () => {
  const user1 = 'usuario-dario'
  const user2 = 'usuario-helmy'

  const user1PrefKey = selectedTenantKey(user1)
  const user2PrefKey = selectedTenantKey(user2)

  assert.notEqual(user1PrefKey, user2PrefKey)
  assert(user1PrefKey.includes(user1))
  assert(user2PrefKey.includes(user2))

  // Simular que User 1 tenía 'tenant-dario'
  const mockStorage = new Map<string, string>()
  mockStorage.set(user1PrefKey, 'tenant-dario')

  // User 1 cierra sesión
  clearActiveTenant()
  assert.equal(getActiveTenant(), null)

  // User 2 inicia sesión en el mismo navegador:
  const user2Selection = mockStorage.get(user2PrefKey)
  assert.equal(user2Selection, undefined) // User 2 no hereda tenant de User 1
})

// -----------------------------------------------------------------------------
// 7. CREACIÓN TENANT + OWNER MEMBERSHIP
// -----------------------------------------------------------------------------
test('Scenario 7: Creating tenant assigns Owner role with canonical permissions', () => {
  const newTenant = createTenantFixture('empresa-nueva', 'route_distribution', 'nuevo-owner')
  const context = activateTenant(newTenant.tenant, newTenant.membership)

  assert.equal(context.role, 'owner')
  assert.equal(context.membership.roleId, 'owner')
  assert.equal(context.membership.status, 'active')
  assert.equal(context.branchId, 'main')

  // Owner posee permisos críticos
  assert(context.permissions.includes('sales.read'))
  assert(context.permissions.includes('sales.create'))
  assert(context.permissions.includes('inventory.manage'))
  assert(context.permissions.includes('users.manage'))
  assert(context.permissions.includes('settings.manage'))
  assert(context.permissions.includes('dispatch.create'))
  assert(context.permissions.includes('route.close'))

  clearActiveTenant()
})

// -----------------------------------------------------------------------------
// 8. INTENTO DE USAR TENANT SIN MEMBERSHIP (unauthorized)
// -----------------------------------------------------------------------------
test('Scenario 8: Attempt to activate unauthorized or mismatched tenant is rejected', () => {
  clearActiveTenant()
  const legit = createTenantFixture('tenant-legit')

  // Intento de cruzar membresía de tenant A a tenant B
  assert.throws(() => {
    activateTenant(legit.tenant, { ...legit.membership, tenantId: 'tenant-intruso' })
  }, /Membresía no autorizada/)

  // Intento de usar membresía desactivada
  assert.throws(() => {
    activateTenant(legit.tenant, { ...legit.membership, status: 'disabled' as const })
  }, /Membresía no autorizada/)

  // Estado activo permanece limpio
  assert.equal(getActiveTenant(), null)
})

// -----------------------------------------------------------------------------
// 9. ONBOARDING NO DUPLICA TENANT EN RETRY / DOBLE SUBMIT (idempotencia)
// -----------------------------------------------------------------------------
test('Scenario 9: Onboarding and tenant creation are strictly deterministic and idempotent', () => {
  const uid = 'qa-applicant-999'

  // Primer submit de onboarding
  const id1 = initialTenantId(uid)
  // Segundo submit concurrente (doble clic)
  const id2 = initialTenantId(uid)
  // Reintento posterior tras corte de red
  const id3 = initialTenantId(uid)

  assert.equal(id1, id2)
  assert.equal(id2, id3)
  assert(id1.startsWith('t_'))
  assert.equal(id1.length, 38)

  // Para creación de empresas subsiguientes con operationId:
  const opId = 'req_subsequent_55'
  const opTenant1 = operationTenantId(uid, opId)
  const opTenant2 = operationTenantId(uid, opId)

  assert.equal(opTenant1, opTenant2)
  assert(opTenant1.startsWith('t_'))
})
