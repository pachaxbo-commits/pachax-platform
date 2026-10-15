import type { NightclubDataset, NightclubModuleId, NightclubStaff } from './nightclubAccounts'
import catalog from '../../../../functions/nightclubPermissions.json' with { type: 'json' }

export const NIGHTCLUB_USER_SECTIONS = catalog.sections as ReadonlyArray<{ id: NightclubModuleId; label: string }>
export const NIGHTCLUB_USER_ACTIONS = ['view', 'create', 'edit', 'delete'] as const
export const NIGHTCLUB_SPECIAL_PERMISSIONS = catalog.special as ReadonlyArray<{ id: string; label: string }>
export type NightclubBuiltinRole = 'admin' | 'partner' | 'waiter' | 'cashier' | 'bar' | 'promoter' | 'supervisor' | 'inventory' | 'service'
export type NightclubUserRole = NightclubBuiltinRole | `custom:${string}`
export const NIGHTCLUB_USER_ROLES: ReadonlyArray<{ id: NightclubBuiltinRole; label: string }> = [
  { id: 'admin', label: 'Administrador' }, { id: 'partner', label: 'Socio / Dueño' },
  { id: 'waiter', label: 'Mesero' }, { id: 'cashier', label: 'Cajero' },
  { id: 'bar', label: 'Barra' }, { id: 'promoter', label: 'Relacionador' },
  { id: 'supervisor', label: 'Supervisor' }, { id: 'inventory', label: 'Encargado de inventario' },
  { id: 'service', label: 'Servicio' },
]
export type NightclubUserPermission = string
const all = NIGHTCLUB_USER_SECTIONS.flatMap(section => NIGHTCLUB_USER_ACTIONS.map(action => (section.id + '.' + action) as NightclubUserPermission))
const view = (...sections: NightclubModuleId[]) => sections.map(section => (section + '.view') as NightclubUserPermission)
const work = (...sections: NightclubModuleId[]) => sections.flatMap(section => [(section + '.view'), (section + '.create'), (section + '.edit')] as NightclubUserPermission[])
export const NIGHTCLUB_ROLE_DEFAULTS: Readonly<Record<NightclubBuiltinRole, readonly NightclubUserPermission[]>> = {
  admin: [...all, ...NIGHTCLUB_SPECIAL_PERMISSIONS.map(item => ('special.' + item.id) as NightclubUserPermission)],
  partner: view(...NIGHTCLUB_USER_SECTIONS.map(section => section.id)),
  waiter: [...work('pos', 'accounts'), ...view('floor', 'dashboard')],
  cashier: [...work('cash', 'accounts'), ...view('dashboard', 'history', 'customers'), 'special.closeCash'],
  bar: [...work('bar'), ...view('dashboard', 'history')],
  promoter: [...work('promoters'), ...view('dashboard')],
  supervisor: [...view('dashboard', 'floor', 'pos', 'accounts', 'bar', 'inventory', 'cash', 'history', 'customers', 'promoters', 'members', 'reports'), 'special.approveOperations', 'special.viewOtherEmployees'],
  inventory: [...work('inventory', 'products'), ...view('dashboard', 'history')],
  service: [...work('accounts'), ...view('floor', 'pos', 'dashboard')],
}
const valid = new Set<NightclubUserPermission>(NIGHTCLUB_ROLE_DEFAULTS.admin)
export function normalizeNightclubUserPermissions(input: readonly string[]): NightclubUserPermission[] {
  if (!Array.isArray(input) || input.some(permission => !valid.has(permission as NightclubUserPermission))) throw new Error('La matriz contiene permisos desconocidos.')
  const chosen = new Set(input as NightclubUserPermission[])
  for (const section of NIGHTCLUB_USER_SECTIONS) {
    if (NIGHTCLUB_USER_ACTIONS.slice(1).some(action => chosen.has((section.id + '.' + action) as NightclubUserPermission)) && !chosen.has((section.id + '.view') as NightclubUserPermission)) throw new Error('Activa Ver antes de modificar ' + section.label + '.')
  }
  if (chosen.has('special.manageUsers') && !chosen.has('users.view')) throw new Error('Gestionar usuarios requiere acceso a Usuarios.')
  if (chosen.has('special.closeCash') && !chosen.has('cash.view')) throw new Error('Cerrar caja requiere acceso a Caja.')
  return [...chosen].sort()
}
export function nightclubUserPermissions(dataset: NightclubDataset, user: NightclubStaff): NightclubUserPermission[] {
  const base = user.role in NIGHTCLUB_ROLE_DEFAULTS ? dataset.userRolePresets?.[user.role] ?? NIGHTCLUB_ROLE_DEFAULTS[user.role as NightclubBuiltinRole] : dataset.customRoles?.find(item => item.id === user.role)?.permissions ?? []
  if (user.role === 'admin') return normalizeNightclubUserPermissions(NIGHTCLUB_ROLE_DEFAULTS.admin)
  if (user.role === 'partner') return normalizeNightclubUserPermissions(NIGHTCLUB_ROLE_DEFAULTS.partner)
  return normalizeNightclubUserPermissions(user.permissionsInherited ? base : user.permissions ?? base)
}
const admin = (role: string) => { if (!['admin', 'owner'].includes(role)) throw new Error('Solo Administración puede gestionar usuarios.') }
function protectsLastAdmin(dataset: NightclubDataset, previous: NightclubStaff, nextRole?: string, nextActive?: boolean) {
  if (previous.role !== 'admin' || !previous.active || (nextRole === 'admin' && nextActive)) return
  if ((dataset.staff || []).filter(item => item.role === 'admin' && item.active).length <= 1) throw new Error('No se puede desactivar o eliminar al último administrador.')
}
function hasOperations(dataset: NightclubDataset, user: NightclubStaff) {
  return dataset.accounts.some(account => account.openedBy === user.name || account.rounds.some(round => round.serviceStaffId === user.id || round.deliveredBy === user.name))
    || (dataset.commissions || []).some(item => item.staffId === user.id)
    || (dataset.audit || []).some(item => item.actor === user.id || item.actor === user.name)
}
export function saveNightclubUser(dataset: NightclubDataset, input: NightclubStaff, actor: string, role: string, at = new Date().toISOString()): NightclubDataset {
  admin(role)
  const name = input.name?.trim(), email = input.email?.trim().toLowerCase() || ''
  if (!input.id || !name || name.length > 80 || (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) throw new Error('Ingresa nombre y un correo válido cuando corresponda.')
  if (!NIGHTCLUB_USER_ROLES.some(item => item.id === input.role) && !dataset.customRoles?.some(item => item.id === input.role)) throw new Error('Selecciona un rol válido.')
  const next = structuredClone(dataset), current = (next.staff || []).find(item => item.id === input.id)
  if (current) protectsLastAdmin(next, current, input.role, input.active)
  if ((next.staff || []).some(item => item.id !== input.id && !!email && item.email?.toLowerCase() === email)) throw new Error('Ya existe un usuario con ese correo.')
  const base = input.role in NIGHTCLUB_ROLE_DEFAULTS ? next.userRolePresets?.[input.role] ?? NIGHTCLUB_ROLE_DEFAULTS[input.role as NightclubBuiltinRole] : next.customRoles?.find(item => item.id === input.role)?.permissions ?? []
  const permissions = normalizeNightclubUserPermissions(input.role === 'admin' ? NIGHTCLUB_ROLE_DEFAULTS.admin : input.role === 'partner' ? NIGHTCLUB_ROLE_DEFAULTS.partner : input.permissions ?? base)
  if (input.role === 'admin' && !permissions.includes('special.manageUsers')) throw new Error('Administración debe conservar la gestión de usuarios.')
  const inherited = input.permissionsInherited === true || (!current && permissions.join(',') === normalizeNightclubUserPermissions(base).join(','))
  const saved: NightclubStaff = { ...input, name, email: email || undefined, permissions: inherited ? undefined : permissions, permissionsInherited: inherited, createdAt: current?.createdAt || at, createdBy: current?.createdBy || actor, updatedAt: at, updatedBy: actor }
  next.staff = current ? (next.staff || []).map(item => item.id === input.id ? saved : item) : [...(next.staff || []), saved]
  next.audit = [...(next.audit || []), { id: crypto.randomUUID(), type: current ? 'nightclub_user_updated' : 'nightclub_user_created', actor, at, details: { userId: input.id } }]
  return next
}
export function deleteNightclubUser(dataset: NightclubDataset, userId: string, actor: string, role: string, at = new Date().toISOString()): NightclubDataset {
  admin(role)
  const user = (dataset.staff || []).find(item => item.id === userId)
  if (!user) throw new Error('Usuario no encontrado.')
  protectsLastAdmin(dataset, user, undefined, false)
  const next = structuredClone(dataset), used = hasOperations(next, user)
  next.staff = used ? (next.staff || []).map(item => item.id === userId ? { ...item, active: false, updatedAt: at, updatedBy: actor } : item) : (next.staff || []).filter(item => item.id !== userId)
  next.audit = [...(next.audit || []), { id: crypto.randomUUID(), type: used ? 'nightclub_user_disabled_with_history' : 'nightclub_user_deleted', actor, at, details: { userId } }]
  return next
}
export function saveNightclubRolePreset(dataset: NightclubDataset, roleId: NightclubBuiltinRole, permissions: readonly string[], actor: string, role: string, at = new Date().toISOString()): NightclubDataset {
  admin(role)
  if (!NIGHTCLUB_USER_ROLES.some(item => item.id === roleId)) throw new Error('Rol desconocido.')
  const next = structuredClone(dataset)
  const normalized = normalizeNightclubUserPermissions(permissions)
  if (roleId === 'admin' && normalized.join(',') !== normalizeNightclubUserPermissions(NIGHTCLUB_ROLE_DEFAULTS.admin).join(',')) throw new Error('Administración conserva acceso completo.')
  if (roleId === 'partner' && normalized.join(',') !== normalizeNightclubUserPermissions(NIGHTCLUB_ROLE_DEFAULTS.partner).join(',')) throw new Error('Socio conserva acceso de solo lectura a todas las secciones.')
  next.userRolePresets = { ...next.userRolePresets, [roleId]: normalized }
  next.audit = [...(next.audit || []), { id: crypto.randomUUID(), type: 'nightclub_role_preset_updated', actor, at, details: { roleId } }]
  return next
}


export function saveNightclubCustomRole(dataset: NightclubDataset, input: { id?: `custom:${string}`; label: string; permissions: readonly string[] }, actor: string, role: string, at = new Date().toISOString()): NightclubDataset {
  admin(role)
  const label = input.label.trim()
  if (!label || label.length > 60) throw new Error('Ingresa un nombre de rol de hasta 60 caracteres.')
  const normalized = normalizeNightclubUserPermissions(input.permissions)
  const next = structuredClone(dataset)
  const existing = input.id ? next.customRoles?.find(item => item.id === input.id) : undefined
  if (input.id && !existing) throw new Error('Rol personalizado no encontrado.')
  if (NIGHTCLUB_USER_ROLES.some(item => item.label.toLocaleLowerCase() === label.toLocaleLowerCase()) || (next.customRoles || []).some(item => item.id !== input.id && item.label.toLocaleLowerCase() === label.toLocaleLowerCase())) throw new Error('Ya existe un rol con ese nombre.')
  const id = existing?.id || (`custom:${crypto.randomUUID()}` as const)
  const saved = { id, label, permissions: normalized, createdAt: existing?.createdAt || at, createdBy: existing?.createdBy || actor, updatedAt: at, updatedBy: actor }
  next.customRoles = existing ? (next.customRoles || []).map(item => item.id === id ? saved : item) : [...(next.customRoles || []), saved]
  next.audit = [...(next.audit || []), { id: crypto.randomUUID(), type: existing ? 'nightclub_custom_role_updated' : 'nightclub_custom_role_created', actor, at, details: { roleId: id } }]
  return next
}
export function deleteNightclubCustomRole(dataset: NightclubDataset, id: string, actor: string, role: string, at = new Date().toISOString()): NightclubDataset {
  admin(role)
  if (!dataset.customRoles?.some(item => item.id === id)) throw new Error('No se puede eliminar un rol predeterminado o inexistente.')
  if (dataset.staff?.some(user => user.role === id)) throw new Error('Reasigna a todos los usuarios antes de eliminar este rol.')
  const next = structuredClone(dataset)
  next.customRoles = next.customRoles?.filter(item => item.id !== id)
  next.audit = [...(next.audit || []), { id: crypto.randomUUID(), type: 'nightclub_custom_role_deleted', actor, at, details: { roleId: id } }]
  return next
}
