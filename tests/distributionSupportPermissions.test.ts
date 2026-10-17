import assert from 'node:assert/strict'
import test from 'node:test'
import { hasPermission, getRoleDefaultPermissions } from '../src/services/permissionService.ts'

test('distribution support settings permission boundaries', () => {
  // 1. Accountant must NOT inherit support.settings.manage
  assert.equal(hasPermission('accountant', 'support.settings.manage'), false, 'accountant must not have support.settings.manage')
  assert.equal(getRoleDefaultPermissions('accountant').includes('support.settings.manage'), false, 'accountant default permissions must not contain support.settings.manage')

  // 2. Admin, Owner, Superadmin MUST have support.settings.manage
  assert.equal(hasPermission('admin', 'support.settings.manage'), true, 'admin must have support.settings.manage')
  assert.equal(hasPermission('owner', 'support.settings.manage'), true, 'owner must have support.settings.manage')
  assert.equal(hasPermission('superadmin', 'support.settings.manage'), true, 'superadmin must have support.settings.manage')
  assert.equal(getRoleDefaultPermissions('admin').includes('support.settings.manage'), true, 'admin default permissions must contain support.settings.manage')

  // 3. Operational roles must NOT have support.settings.manage
  assert.equal(hasPermission('warehouse', 'support.settings.manage'), false, 'warehouse must not have support.settings.manage')
  assert.equal(hasPermission('distributor', 'support.settings.manage'), false, 'distributor must not have support.settings.manage')

  // 4. Support role has technical support.settings.manage
  assert.equal(hasPermission('support', 'support.settings.manage'), true, 'support must have support.settings.manage')
  assert.equal(getRoleDefaultPermissions('support').includes('support.settings.manage'), true, 'support default permissions must contain support.settings.manage')
})
