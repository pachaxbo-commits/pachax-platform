import assert from 'node:assert/strict'
import test from 'node:test'
import { hasPermission, getRoleDefaultPermissions } from '../src/services/permissionService.ts'
import { getTemplate } from '../src/core/templates.ts'

test('distribution support settings permission boundaries', () => {
  // 1. Support role must NOT have settings.manage
  assert.equal(hasPermission('support', 'settings.manage'), false, 'support must not have settings.manage')
  assert.equal(getRoleDefaultPermissions('support').includes('settings.manage'), false, 'support default permissions must not contain settings.manage')
  assert.equal(hasPermission('support', 'support.reset.prepare'), true, 'support must have support.reset.prepare')
  assert.equal(hasPermission('support', 'support.settings.manage'), true, 'support must have support.settings.manage')

  // 2. Accountant must NOT inherit support permissions or commercial settings
  assert.equal(hasPermission('accountant', 'settings.manage'), false, 'accountant must not have settings.manage')
  assert.equal(hasPermission('accountant', 'support.reset.prepare'), false, 'accountant must not have support.reset.prepare')
  assert.equal(hasPermission('accountant', 'support.settings.manage'), false, 'accountant must not have support.settings.manage')
  assert.equal(getRoleDefaultPermissions('accountant').includes('settings.manage'), false)
  assert.equal(getRoleDefaultPermissions('accountant').includes('support.reset.prepare'), false)
  assert.equal(getRoleDefaultPermissions('accountant').includes('support.settings.manage'), false)

  // 3. Admin, Owner, Superadmin MUST have settings.manage, support.reset.prepare, support.settings.manage
  for (const role of ['admin', 'owner', 'superadmin'] as const) {
    assert.equal(hasPermission(role, 'settings.manage'), true, `${role} must have settings.manage`)
    assert.equal(hasPermission(role, 'support.reset.prepare'), true, `${role} must have support.reset.prepare`)
    assert.equal(hasPermission(role, 'support.settings.manage'), true, `${role} must have support.settings.manage`)
  }
  assert.equal(getRoleDefaultPermissions('admin').includes('settings.manage'), true)
  assert.equal(getRoleDefaultPermissions('admin').includes('support.reset.prepare'), true)
  assert.equal(getRoleDefaultPermissions('admin').includes('support.settings.manage'), true)

  // 4. Operational roles must NOT have settings.manage or support permissions
  for (const role of ['warehouse', 'distributor'] as const) {
    assert.equal(hasPermission(role, 'settings.manage'), false, `${role} must not have settings.manage`)
    assert.equal(hasPermission(role, 'support.reset.prepare'), false, `${role} must not have support.reset.prepare`)
    assert.equal(hasPermission(role, 'support.settings.manage'), false, `${role} must not have support.settings.manage`)
  }

  // 5. Canonical template roles verification
  const distTemplate = getTemplate('route_distribution')
  const supportPreset = distTemplate.roles.find(r => r.id === 'support')
  assert.ok(supportPreset, 'support role preset must exist in route_distribution template')
  assert.equal(supportPreset.permissions.includes('settings.manage'), false, 'support preset must not have settings.manage')
  assert.equal(supportPreset.permissions.includes('support.reset.prepare'), true, 'support preset must have support.reset.prepare')

  const adminPreset = distTemplate.roles.find(r => r.id === 'admin')
  assert.ok(adminPreset, 'admin preset must exist')
  assert.equal(adminPreset.permissions.includes('settings.manage'), true, 'admin preset must have settings.manage')
  assert.equal(adminPreset.permissions.includes('support.reset.prepare'), true, 'admin preset must have support.reset.prepare')

  const ownerPreset = distTemplate.roles.find(r => r.id === 'owner')
  assert.ok(ownerPreset, 'owner preset must exist')
  assert.equal(ownerPreset.permissions.includes('settings.manage'), true, 'owner preset must have settings.manage')
  assert.equal(ownerPreset.permissions.includes('support.reset.prepare'), true, 'owner preset must have support.reset.prepare')
})
