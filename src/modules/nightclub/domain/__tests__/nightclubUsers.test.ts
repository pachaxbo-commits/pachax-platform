// @ts-expect-error Node test types are intentionally absent from the browser tsconfig.
import assert from 'node:assert/strict'
// @ts-expect-error Node test types are intentionally absent from the browser tsconfig.
import test from 'node:test'
import { createNightclubDataset } from '../../../../demo/datasets/nightclub/nightclubDatasets.ts'
import { deleteNightclubCustomRole, deleteNightclubUser, saveNightclubCustomRole, NIGHTCLUB_ROLE_DEFAULTS, NIGHTCLUB_USER_SECTIONS, nightclubUserPermissions, normalizeNightclubUserPermissions, saveNightclubRolePreset, saveNightclubUser } from '../nightclubUsers.ts'

test('matriz cubre secciones reales y rechaza permisos incoherentes', () => {
  assert.deepEqual(NIGHTCLUB_USER_SECTIONS.map(item => item.label), ['Inicio', 'Zonas', 'POS', 'Cuentas', 'Barra', 'Inventario', 'Productos', 'Caja', 'Historial', 'Clientes', 'Relacionadores', 'Socios', 'Usuarios', 'Reportes', 'Configuración'])
  assert.throws(() => normalizeNightclubUserPermissions(['pos.edit']), /Ver/)
  assert.throws(() => normalizeNightclubUserPermissions(['special.manageUsers']), /Usuarios/)
  assert.throws(() => normalizeNightclubUserPermissions(['cash.view', 'not-real.write']), /desconocidos/)
  assert(!NIGHTCLUB_ROLE_DEFAULTS.partner.some(item => item.endsWith('.create') || item.endsWith('.edit') || item.endsWith('.delete')))
  assert(NIGHTCLUB_ROLE_DEFAULTS.admin.includes('inventory.edit'))
})

test('crear, editar y filtrar por identidad conserva permisos y audita al responsable', () => {
  let data = createNightclubDataset('empty')
  const first = { id: 'uid-juan', name: 'Juan', email: 'juan@example.test', role: 'waiter' as const, active: true, permissions: ['floor.view', 'pos.view', 'pos.create'] }
  data = saveNightclubUser(data, first, 'uid-admin', 'admin', '2026-10-08T10:00:00Z')
  assert.equal(data.staff?.[0].id, first.id)
  assert.equal(data.staff?.[0].email, first.email)
  assert.equal(data.staff?.[0].createdBy, 'uid-admin')
  assert.deepEqual(nightclubUserPermissions(data, data.staff![0]), ['floor.view', 'pos.create', 'pos.view'])
  assert.throws(() => saveNightclubUser(data, { ...first, id: 'other' }, 'uid-bar', 'bar'), /Administración/)
  assert.throws(() => saveNightclubUser(data, { ...first, id: 'other' }, 'uid-admin', 'admin'), /correo/)
  data = saveNightclubUser(data, { ...first, name: 'Juan Pérez', active: false }, 'uid-admin', 'admin', '2026-10-08T11:00:00Z')
  assert.equal(data.staff?.[0].updatedBy, 'uid-admin')
  assert.equal(data.staff?.[0].active, false)
  assert.equal(data.audit?.filter(item => item.type.startsWith('nightclub_user_')).length, 2)
})

test('último administrador y usuarios con operaciones conservan su historial', () => {
  let data = createNightclubDataset('empty')
  data = saveNightclubUser(data, { id: 'admin-1', name: 'Admin', role: 'admin', active: true }, 'setup', 'admin')
  assert.throws(() => saveNightclubUser(data, { ...data.staff![0], active: false }, 'setup', 'admin'), /último administrador/)
  assert.throws(() => deleteNightclubUser(data, 'admin-1', 'setup', 'admin'), /último administrador/)
  data = saveNightclubUser(data, { id: 'waiter-1', name: 'Mesero', role: 'service', active: true }, 'admin-1', 'admin')
  data.accounts.push({ id: 'account-1', openedBy: 'Mesero', openedAt: '2026-10-08T10:00:00Z', status: 'open', subtotal: 0, rounds: [] } as typeof data.accounts[number])
  data = deleteNightclubUser(data, 'waiter-1', 'admin-1', 'admin')
  assert.equal(data.staff?.find(item => item.id === 'waiter-1')?.active, false)
  assert.equal(data.accounts[0].openedBy, 'Mesero')
  assert.equal(data.audit?.at(-1)?.type, 'nightclub_user_disabled_with_history')
  data = saveNightclubUser(data, { id: 'free', name: 'Sin operaciones', role: 'cashier', active: true }, 'admin-1', 'admin')
  data = deleteNightclubUser(data, 'free', 'admin-1', 'admin')
  assert.equal(data.staff?.some(item => item.id === 'free'), false)
})

test('plantilla editable aplica a nuevos usuarios sin reescribir permisos individuales', () => {
  let data = createNightclubDataset('empty')
  data = saveNightclubUser(data, { id: 'before', name: 'Antes', role: 'bar', active: true, permissions: ['bar.view'] }, 'admin', 'admin')
  data = saveNightclubRolePreset(data, 'bar', ['bar.view', 'bar.create'], 'admin', 'admin')
  data = saveNightclubUser(data, { id: 'after', name: 'Después', role: 'bar', active: true }, 'admin', 'admin')
  assert.deepEqual(data.staff?.find(item => item.id === 'before')?.permissions, ['bar.view'])
  assert.equal(data.staff?.find(item => item.id === 'after')?.permissionsInherited, true)
  assert.deepEqual(nightclubUserPermissions(data, data.staff!.find(item => item.id === 'after')!), ['bar.create', 'bar.view'])
  assert.throws(() => saveNightclubRolePreset(data, 'bar', ['bar.delete'], 'bar', 'bar'), /Administración/)
})


test('roles personalizados: crear, renombrar, asignar, bloquear borrado y conservar permisos individuales', () => {
  let data = createNightclubDataset('empty')
  data = saveNightclubCustomRole(data, { label: 'Anfitrión', permissions: ['dashboard.view', 'floor.view'] }, 'admin', 'admin')
  const custom = data.customRoles![0]
  assert.match(custom.id, /^custom:/)
  assert.throws(() => saveNightclubCustomRole(data, { label: 'Otro', permissions: ['pos.edit'] }, 'bar', 'bar'), /Administración/)
  data = saveNightclubUser(data, { id: 'staff-1', name: 'Ana', role: custom.id, active: true }, 'admin', 'admin')
  assert.deepEqual(nightclubUserPermissions(data, data.staff![0]), ['dashboard.view', 'floor.view'])
  assert.throws(() => deleteNightclubCustomRole(data, custom.id, 'admin', 'admin'), /Reasigna/)
  data = saveNightclubCustomRole(data, { id: custom.id, label: 'Anfitriona', permissions: ['dashboard.view'] }, 'admin', 'admin')
  assert.equal(data.customRoles![0].label, 'Anfitriona')
  assert.deepEqual(nightclubUserPermissions(data, data.staff![0]), ['dashboard.view'])
  data = saveNightclubUser(data, { ...data.staff![0], permissions: ['floor.view'], permissionsInherited: false }, 'admin', 'admin')
  data = saveNightclubCustomRole(data, { id: custom.id, label: 'Recepción', permissions: ['dashboard.view', 'pos.view'] }, 'admin', 'admin')
  assert.deepEqual(nightclubUserPermissions(data, data.staff![0]), ['floor.view'])
  data = saveNightclubUser(data, { ...data.staff![0], role: 'waiter' }, 'admin', 'admin')
  data = deleteNightclubCustomRole(data, custom.id, 'admin', 'admin')
  assert.equal(data.customRoles?.length, 0)
  assert.throws(() => deleteNightclubCustomRole(data, 'waiter', 'admin', 'admin'), /predeterminado/)
})

test('Administrador conserva acceso total y Socio queda en lectura de todas las secciones', () => {
  let data = createNightclubDataset('empty')
  data = saveNightclubUser(data, { id: 'a', name: 'Administración', role: 'admin', active: true, permissions: ['users.view', 'special.manageUsers'] }, 'setup', 'admin')
  data = saveNightclubUser(data, { id: 'p', name: 'Socio', role: 'partner', active: true, permissions: ['dashboard.view'] }, 'a', 'admin')
  assert.deepEqual(nightclubUserPermissions(data, data.staff![0]), normalizeNightclubUserPermissions(NIGHTCLUB_ROLE_DEFAULTS.admin))
  const partner = nightclubUserPermissions(data, data.staff![1])
  assert.equal(partner.length, NIGHTCLUB_USER_SECTIONS.length)
  assert(partner.every(permission => permission.endsWith('.view')))
  assert.throws(() => saveNightclubRolePreset(data, 'partner', ['dashboard.view'], 'a', 'admin'), /solo lectura/)
})
