import { useState } from 'react'
import type { NightclubCustomRole, NightclubStaff } from '../domain/nightclubAccounts'
import type { NightclubBuiltinRole, NightclubUserRole } from '../domain/nightclubUsers'
import { NIGHTCLUB_ROLE_DEFAULTS, NIGHTCLUB_SPECIAL_PERMISSIONS, NIGHTCLUB_USER_ACTIONS, NIGHTCLUB_USER_ROLES, NIGHTCLUB_USER_SECTIONS, normalizeNightclubUserPermissions } from '../domain/nightclubUsers'

type Result = boolean | Promise<boolean>
type Props = {
  users: NightclubStaff[]
  customRoles?: NightclubCustomRole[]
  view?: 'people' | 'roles' | 'all'
  rolePresets?: Partial<Record<NightclubUserRole, string[]>>
  mode: 'demo' | 'tenant'
  currentUserId?: string
  canEditPresets?: boolean
  allowCreate?: boolean
  allowEdit?: boolean
  allowDelete?: boolean
  onSave: (user: NightclubStaff, initialPassword?: string) => Result
  onDelete: (id: string) => Result
  onSavePreset: (role: NightclubBuiltinRole, permissions: string[]) => Result
  onSaveCustomRole?: (draft: { id?: `custom:${string}`; label: string; permissions: string[] }) => Result
  onDeleteCustomRole?: (id: string) => Result
}
const field = 'min-h-11 w-full rounded-xl border border-slate-700 bg-[#07111a] px-3 text-sm text-white'
const button = 'min-h-10 rounded-xl border border-slate-700 px-4 py-2 text-sm font-semibold text-slate-100 disabled:opacity-40'
const primary = 'min-h-10 rounded-xl bg-amber-300 px-4 py-2 text-sm font-bold text-slate-950 disabled:opacity-40'
const roleLabel = (role: string, customRoles: NightclubCustomRole[] = []) => NIGHTCLUB_USER_ROLES.find(item => item.id === role)?.label || customRoles.find(item => item.id === role)?.label || role
const defaultPermissions = (role: NightclubUserRole, presets?: Props['rolePresets'], customRoles: NightclubCustomRole[] = []) => [...(role.startsWith('custom:') ? customRoles.find(item => item.id === role)?.permissions || [] : presets?.[role] || NIGHTCLUB_ROLE_DEFAULTS[role as NightclubBuiltinRole])]
const blank = (role: NightclubUserRole, presets?: Props['rolePresets']): NightclubStaff => ({ id: crypto.randomUUID(), name: '', email: '', role, active: true, permissions: defaultPermissions(role, presets), permissionsInherited: true })

function PermissionMatrix({ permissions, onChange, disabled = false }: { permissions: string[]; onChange: (permissions: string[]) => void; disabled?: boolean }) {
  const toggle = (permission: string, checked: boolean) => {
    const next = new Set(permissions)
    if (checked) {
      next.add(permission)
      if (!permission.startsWith('special.')) next.add(permission.split('.')[0] + '.view')
      if (permission === 'special.manageUsers') next.add('users.view')
      if (permission === 'special.closeCash') next.add('cash.view')
    } else {
      next.delete(permission)
      if (permission.endsWith('.view')) {
        const section = permission.split('.')[0]
        for (const action of NIGHTCLUB_USER_ACTIONS) next.delete(section + '.' + action)
        if (section === 'users') next.delete('special.manageUsers')
        if (section === 'cash') next.delete('special.closeCash')
      }
    }
    onChange([...next])
  }
  return <div className="overflow-x-auto rounded-xl border border-white/10">
    <div className="flex flex-wrap gap-2 border-b border-white/10 p-3"><button className={button} disabled={disabled} onClick={() => onChange(NIGHTCLUB_USER_SECTIONS.map(section => section.id + '.view'))}>Solo lectura</button><button className={button} disabled={disabled} onClick={() => onChange([...NIGHTCLUB_ROLE_DEFAULTS.admin])}>Seleccionar todos</button><button className={button} disabled={disabled} onClick={() => onChange([])}>Quitar permisos</button></div>
    <table className="w-full min-w-[560px] text-left text-xs"><thead className="bg-slate-800/80"><tr><th className="p-3">Sección</th>{NIGHTCLUB_USER_ACTIONS.map(action => <th key={action} className="p-3 text-center">{({ view: 'Ver', create: 'Crear', edit: 'Editar', delete: 'Eliminar' })[action]}</th>)}</tr></thead>
      <tbody>{NIGHTCLUB_USER_SECTIONS.map(section => <tr key={section.id} className="border-t border-white/10"><th className="p-3 font-medium">{section.label}</th>{NIGHTCLUB_USER_ACTIONS.map(action => { const key = section.id + '.' + action; return <td key={key} className="p-2 text-center"><input type="checkbox" aria-label={section.label + ': ' + action} checked={permissions.includes(key)} disabled={disabled} onChange={event => toggle(key, event.target.checked)} className="h-4 w-4 accent-amber-300" /></td> })}</tr>)}</tbody>
    </table>
    <div className="border-t border-white/10 p-3"><p className="mb-2 font-semibold">Permisos especiales</p><div className="grid gap-2 sm:grid-cols-2">{NIGHTCLUB_SPECIAL_PERMISSIONS.map(item => <label key={item.id} className="flex items-center gap-2"><input type="checkbox" checked={permissions.includes('special.' + item.id)} disabled={disabled} onChange={event => toggle('special.' + item.id, event.target.checked)} className="h-4 w-4 accent-amber-300" />{item.label}</label>)}</div></div>
  </div>
}

export function NightclubUsers({ users, customRoles = [], view = 'all', rolePresets, mode, currentUserId, canEditPresets = true, allowCreate = true, allowEdit = true, allowDelete = true, onSave, onDelete, onSavePreset, onSaveCustomRole, onDeleteCustomRole }: Props) {
  const [search, setSearch] = useState(''), [roleFilter, setRoleFilter] = useState('all'), [stateFilter, setStateFilter] = useState('all')
  const [draft, setDraft] = useState<NightclubStaff | null>(null), [initialPassword, setInitialPassword] = useState('')
  const [presetRole, setPresetRole] = useState<NightclubBuiltinRole>('waiter'), [presetPermissions, setPresetPermissions] = useState<string[] | null>(null)
  const [customDraft, setCustomDraft] = useState<{ id?: `custom:${string}`; label: string; permissions: string[] } | null>(null)
  const [busy, setBusy] = useState(false), [message, setMessage] = useState('')
  const rows = users.filter(user => (roleFilter === 'all' || user.role === roleFilter) && (stateFilter === 'all' || (stateFilter === 'active' ? user.active : !user.active)) && (user.name + ' ' + (user.email || '')).toLocaleLowerCase().includes(search.trim().toLocaleLowerCase())).sort((a, b) => a.name.localeCompare(b.name))
  const activeAdmins = users.filter(user => user.role === 'admin' && user.active).length
  const existing = draft && users.some(user => user.id === draft.id)
  const submit = async () => {
    if (!draft || busy) return
    setMessage('')
    if (mode === 'tenant' && !existing && (!draft.email || initialPassword.length < 8)) return setMessage('Correo y contraseña inicial de al menos 8 caracteres son obligatorios.')
    try {
      normalizeNightclubUserPermissions(draft.permissions || [])
      setBusy(true)
      if (await Promise.resolve(onSave(draft, !existing ? initialPassword : undefined))) { setDraft(null); setInitialPassword(''); setMessage('Usuario guardado.') }
    } catch (error) { setMessage(error instanceof Error ? error.message : 'No se pudo guardar el usuario.') }
    finally { setBusy(false) }
  }
  const remove = async (user: NightclubStaff) => {
    if (!window.confirm('¿Eliminar el acceso de ' + user.name + '? Si tiene operaciones, quedará desactivado para conservar el historial.')) return
    try { setBusy(true); if (await Promise.resolve(onDelete(user.id))) setMessage('Acceso retirado. Los registros históricos se conservan.') }
    catch (error) { setMessage(error instanceof Error ? error.message : 'No se pudo retirar el acceso.') }
    finally { setBusy(false) }
  }
  const changePreset = (role: NightclubBuiltinRole) => { setPresetRole(role); setPresetPermissions(defaultPermissions(role, rolePresets, customRoles)) }
  const savePreset = async () => {
    if (!presetPermissions) return
    try { setBusy(true); normalizeNightclubUserPermissions(presetPermissions); if (await Promise.resolve(onSavePreset(presetRole, presetPermissions))) setMessage('Plantilla de rol guardada para nuevas asignaciones.') }
    catch (error) { setMessage(error instanceof Error ? error.message : 'No se pudo guardar el rol.') }
    finally { setBusy(false) }
  }
  const saveCustom = async () => { if (!customDraft || !onSaveCustomRole) return; try { setBusy(true); normalizeNightclubUserPermissions(customDraft.permissions); if (await Promise.resolve(onSaveCustomRole(customDraft))) { setCustomDraft(null); setMessage('Rol personalizado guardado.') } } catch (error) { setMessage(error instanceof Error ? error.message : 'No se pudo guardar el rol.') } finally { setBusy(false) } }
  const deleteCustom = async (id: string) => { if (!onDeleteCustomRole || !window.confirm('¿Eliminar este rol? Reasigna primero a sus usuarios.')) return; try { setBusy(true); if (await Promise.resolve(onDeleteCustomRole(id))) { setCustomDraft(null); setMessage('Rol eliminado.') } } catch (error) { setMessage(error instanceof Error ? error.message : 'No se pudo eliminar el rol.') } finally { setBusy(false) } }
  return <div className="space-y-5">
    {message && <p role="status" className="rounded-xl border border-amber-300/25 p-3 text-sm text-amber-100">{message}</p>}
    {view !== 'roles' && <><div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-xl font-bold">Usuarios y permisos</h2><p className="text-sm text-slate-400">Gestiona accesos por persona y prepara los permisos de cada sección.</p></div>{allowCreate && <button className={primary} onClick={() => { setDraft(blank('waiter', rolePresets)); setInitialPassword(''); setMessage('') }}>+ Nuevo usuario</button>}</div>
    {mode === 'demo' && <p className="rounded-xl border border-amber-300/25 bg-amber-300/10 p-3 text-xs text-amber-100">Modo demo: los usuarios y permisos se guardan solo en este navegador. No se crean credenciales de acceso. «Probar como usuario» aplica esta matriz en la demo. No representa autenticación ni autorización en producción.</p>}
    {mode === 'tenant' && <p className="rounded-xl border border-sky-300/20 bg-sky-300/5 p-3 text-xs text-sky-100">Las cuentas se crean en Firebase Auth y la pertenencia se guarda por UID en el tenant. Los permisos de POS, Caja y demás operaciones se aplicarán en la segunda etapa.</p>}
    <div className="grid gap-2 sm:grid-cols-3"><input className={field} aria-label="Buscar usuarios" placeholder="Buscar nombre o correo" value={search} onChange={event => setSearch(event.target.value)} /><select className={field} aria-label="Filtrar por rol" value={roleFilter} onChange={event => setRoleFilter(event.target.value)}><option value="all">Todos los roles</option>{[...NIGHTCLUB_USER_ROLES, ...customRoles].map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select><select className={field} aria-label="Filtrar por estado" value={stateFilter} onChange={event => setStateFilter(event.target.value)}><option value="all">Todos los estados</option><option value="active">Activos</option><option value="inactive">Inactivos</option></select></div>
    <div className="overflow-x-auto rounded-xl border border-white/10"><table className="w-full min-w-[560px] text-left text-sm"><thead className="bg-slate-800/80"><tr><th className="p-3">Nombre y acceso</th><th className="p-3">Rol</th><th className="p-3">Estado</th><th className="p-3">Acciones</th></tr></thead><tbody>{rows.map(user => { const protectedAdmin = user.role === 'admin' && user.active && activeAdmins <= 1; return <tr key={user.id} className="border-t border-white/10"><td className="p-3"><strong>{user.name}</strong><small className="block text-slate-400">{user.email || (mode === 'demo' ? 'Sin credenciales en demo' : user.id)}</small></td><td className="p-3">{roleLabel(user.role, customRoles)}</td><td className="p-3">{user.active ? 'Activo' : 'Inactivo'}</td><td className="p-3"><div className="flex flex-wrap gap-2">{allowEdit && <button className={button} onClick={() => { setDraft({ ...user, permissions: [...(['admin', 'partner'].includes(user.role) ? defaultPermissions(user.role, rolePresets, customRoles) : user.permissions || defaultPermissions(user.role, rolePresets, customRoles))] }); setInitialPassword(''); setMessage('') }}>Editar</button>}{allowEdit && <button className={button} disabled={busy || protectedAdmin || user.id === currentUserId} onClick={() => void Promise.resolve(onSave({ ...user, active: !user.active })).then(ok => { if (ok) setMessage(user.active ? 'Usuario desactivado.' : 'Usuario activado.') }).catch(error => setMessage(error instanceof Error ? error.message : 'No se pudo cambiar el estado.'))}>{user.active ? 'Desactivar' : 'Activar'}</button>}{allowDelete && <button className={button} disabled={busy || protectedAdmin || user.id === currentUserId} onClick={() => void remove(user)}>Eliminar</button>}</div></td></tr> })}</tbody></table>{!rows.length && <p className="p-4 text-sm text-slate-400">No hay usuarios que coincidan con estos filtros.</p>}</div>
    {draft && (existing ? allowEdit : allowCreate) && <section className="space-y-4 rounded-xl border border-white/10 bg-[#0d1720] p-4"><h3 className="text-lg font-bold">{existing ? 'Editar usuario' : 'Nuevo usuario'}</h3><div className="grid gap-3 sm:grid-cols-2"><label className="text-xs">Nombre<input className={field + ' mt-1'} value={draft.name} onChange={event => setDraft({ ...draft, name: event.target.value })} /></label><label className="text-xs">Correo de acceso{mode === 'demo' ? ' (opcional en demo)' : ''}<input type="email" readOnly={mode === 'tenant' && !!existing} className={field + ' mt-1'} value={draft.email || ''} onChange={event => setDraft({ ...draft, email: event.target.value })} /></label><label className="text-xs">Rol<select className={field + ' mt-1'} value={draft.role} onChange={event => { const role = event.target.value as NightclubUserRole; setDraft({ ...draft, role, permissions: defaultPermissions(role, rolePresets, customRoles), permissionsInherited: true }) }}>{[...NIGHTCLUB_USER_ROLES, ...customRoles].map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>{mode === 'tenant' && !existing && <label className="text-xs">Contraseña inicial<input type="password" autoComplete="new-password" className={field + ' mt-1'} value={initialPassword} onChange={event => setInitialPassword(event.target.value)} /></label>}</div><div className="flex gap-2 text-xs"><button className={button} onClick={() => setDraft({ ...draft, permissions: defaultPermissions(draft.role, rolePresets, customRoles), permissionsInherited: true })}>Usar plantilla del rol</button><span className="self-center text-slate-400">{draft.permissionsInherited ? 'Hereda cambios de la plantilla' : 'Permisos individuales'}</span></div><PermissionMatrix permissions={draft.permissions || []} onChange={permissions => setDraft({ ...draft, permissions, permissionsInherited: false })} disabled={draft.role === 'admin' || draft.role === 'partner'} /><div className="flex gap-2"><button className={primary} disabled={busy || !draft.name.trim()} onClick={() => void submit()}>{busy ? 'Guardando...' : 'Guardar usuario'}</button><button className={button} onClick={() => { setDraft(null); setInitialPassword('') }}>Cancelar</button></div></section>}
    </>}
{view !== 'people' && mode === 'demo' && <section className="space-y-3 rounded-xl border border-white/10 bg-[#0d1720] p-4"><h3 className="font-bold">Roles personalizados</h3><p className="text-xs text-slate-400">Se guardan solo en esta demo. Reasigna a los usuarios antes de eliminar un rol.</p><div className="flex flex-wrap gap-2">{customRoles.map(item => <div key={item.id} className="flex items-center gap-1"><button className={button} disabled={!canEditPresets} onClick={() => setCustomDraft({ id: item.id, label: item.label, permissions: [...item.permissions] })}>{item.label}</button>{canEditPresets && <button className={button} disabled={busy || users.some(user => user.role === item.id)} onClick={() => void deleteCustom(item.id)} aria-label={'Eliminar rol ' + item.label}>Eliminar</button>}</div>)}</div>{canEditPresets && <button className={primary} onClick={() => setCustomDraft({ label: '', permissions: [] })}>+ Nuevo rol</button>}{customDraft && canEditPresets && <div className="space-y-3"><label className="block text-xs">Nombre del rol<input className={field + ' mt-1'} value={customDraft.label} onChange={event => setCustomDraft({ ...customDraft, label: event.target.value })} /></label><PermissionMatrix permissions={customDraft.permissions} onChange={permissions => setCustomDraft({ ...customDraft, permissions })} /><div className="flex gap-2"><button className={primary} disabled={busy || !customDraft.label.trim()} onClick={() => void saveCustom()}>Guardar rol</button><button className={button} onClick={() => setCustomDraft(null)}>Cancelar</button></div></div>}</section>}
    {view !== 'people' && canEditPresets && <section className="space-y-3 rounded-xl border border-white/10 bg-[#0d1720] p-4"><h3 className="font-bold">Plantillas de roles</h3><p className="text-xs text-slate-400">Ajusta la plantilla para asignaciones futuras. Los permisos individuales existentes permanecen intactos.</p><select className={field} aria-label="Plantilla de rol" value={presetRole} onChange={event => changePreset(event.target.value as NightclubBuiltinRole)}>{NIGHTCLUB_USER_ROLES.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select><PermissionMatrix permissions={presetPermissions || defaultPermissions(presetRole, rolePresets)} onChange={setPresetPermissions} disabled={presetRole === 'admin' || presetRole === 'partner'} /><button className={button} disabled={busy || !presetPermissions} onClick={() => void savePreset()}>Guardar plantilla</button></section>}
  </div>
}
