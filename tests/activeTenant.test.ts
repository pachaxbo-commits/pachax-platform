import test from 'node:test'
import assert from 'node:assert/strict'
import { activateTenant, clearActiveTenant, getActiveTenant, onTenantReset, profileCacheKey, selectedTenantKey } from '../src/store/activeTenant.ts'
import { getTemplate } from '../src/core/templates.ts'
import type { Membership, Tenant } from '../src/core/platform.ts'

function fixture(tenantId: string, roleId = 'owner'): { tenant: Tenant; membership: Membership } {
  const template = getTemplate('route_distribution')
  return {
    tenant: { tenantId, name: tenantId, businessType: template.businessType, ownerUid: 'user', status: 'active',
      branding: { primary: '#20383A', accent: '#B58A55' }, configuration: template.defaults, entitlements: {}, planKey: null,
      subscriptionStatus: 'trial', schemaVersion: 1, templateVersion: template.version, createdAt: '', updatedAt: '' },
    membership: { tenantId, uid: 'user', roleId, status: 'active', branchIds: ['main'], routeIds: ['north'] },
  }
}

test('active tenant keeps tenant, membership, role, permissions, template and operational scope together', () => {
  const value = fixture('tenant-a')
  const context = activateTenant(value.tenant, value.membership)
  assert.equal(context.tenantId, 'tenant-a')
  assert.equal(context.role, 'owner')
  assert.equal(context.branchId, 'main')
  assert.equal(context.routeId, 'north')
  assert.equal(context.businessType, 'route_distribution')
  assert.equal(context.template.businessType, context.tenant.businessType)
  assert(context.permissions.includes('users.manage'))
})

test('switching tenants clears registered repositories before exposing the new context', () => {
  let resets = 0
  const stop = onTenantReset(() => { resets++ })
  const a = fixture('tenant-a'), b = fixture('tenant-b')
  activateTenant(a.tenant, a.membership)
  activateTenant(b.tenant, b.membership)
  assert.equal(getActiveTenant()?.tenantId, 'tenant-b')
  assert.equal(resets, 2)
  stop(); clearActiveTenant()
})

test('invalid or disabled memberships never become active', () => {
  const a = fixture('tenant-a')
  assert.throws(() => activateTenant(a.tenant, { ...a.membership, tenantId: 'tenant-b' }))
  assert.throws(() => activateTenant(a.tenant, { ...a.membership, status: 'disabled' }))
})

test('profile cache keys isolate user and tenant', () => {
  assert.notEqual(profileCacheKey('user', 'tenant-a'), profileCacheKey('user', 'tenant-b'))
  assert.notEqual(profileCacheKey('user-a', 'tenant-a'), profileCacheKey('user-b', 'tenant-a'))
  assert.notEqual(selectedTenantKey('user-a'), selectedTenantKey('user-b'))
})
