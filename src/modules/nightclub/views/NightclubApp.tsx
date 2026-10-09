import { useCallback, useEffect, useState } from 'react'
import { collection, getDocs } from 'firebase/firestore'
import { CloudOff, LogOut } from 'lucide-react'
import { getFirebaseContext } from '../../../lib/firebase'
import { gateway } from '../../../services/gateway'
import { getActiveTenant } from '../../../store/activeTenant'
import type { NightclubStaff } from '../domain/nightclubAccounts'
import type { NightclubUserRole } from '../domain/nightclubUsers'
import { NIGHTCLUB_ROLE_DEFAULTS } from '../domain/nightclubUsers'
import { NightclubUsers } from './NightclubUsers'

interface NightclubAppProps {
  tenantId: string
  companyName: string
  logoUrl?: string
  uid: string
  userName: string
  role: string
  onSignOut: () => Promise<void>
}
type TenantMember = { uid: string; displayName: string; email?: string; roleId: NightclubUserRole; status: string; nightclubPermissions?: string[]; deletedAt?: string }
type TenantRole = { nightclubPermissions?: string[] }

/** Operational modules remain fail-closed. Only tenant user administration is connected. */
export function NightclubApp(props: NightclubAppProps) {
  const [users, setUsers] = useState<NightclubStaff[]>([])
  const [presets, setPresets] = useState<Partial<Record<NightclubUserRole, string[]>>>({})
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [showUsers, setShowUsers] = useState(false)
  const membership = getActiveTenant()?.membership as ({ nightclubPermissions?: string[] } | undefined)
  const canManage = ['owner', 'admin'].includes(props.role) || membership?.nightclubPermissions?.includes('special.manageUsers') === true
  const reload = useCallback(async () => {
    if (!canManage) { setLoading(false); return }
    const context = await getFirebaseContext()
    if (!context?.auth.currentUser || context.auth.currentUser.uid !== props.uid) throw new Error('Sesión no autorizada.')
    const root = collection(context.db, 'tenants', props.tenantId, 'members')
    const rolesRef = collection(context.db, 'tenants', props.tenantId, 'roles')
    const [members, roles] = await Promise.all([getDocs(root), getDocs(rolesRef)])
    setUsers(members.docs.map(doc => {
      const item = doc.data() as TenantMember
      return { id: doc.id, name: item.displayName || item.email || doc.id, email: item.email || '', role: item.roleId, active: item.status === 'active', permissions: item.nightclubPermissions || [...(NIGHTCLUB_ROLE_DEFAULTS[item.roleId as keyof typeof NIGHTCLUB_ROLE_DEFAULTS] || [])], ...(item.deletedAt ? { deletedAt: item.deletedAt } : {}) }
    }))
    setPresets(Object.fromEntries(roles.docs.map(doc => [doc.id, (doc.data() as TenantRole).nightclubPermissions]).filter((entry): entry is [string, string[]] => Array.isArray(entry[1]))))
    setError('')
    setLoading(false)
  }, [canManage, props.tenantId, props.uid])
  useEffect(() => { void Promise.resolve().then(reload).catch(cause => { setError(cause instanceof Error ? cause.message : 'No se pudieron cargar los usuarios.'); setLoading(false) }) }, [reload])
  const saveUser = async (user: NightclubStaff, initialPassword?: string) => {
    const existing = users.some(item => item.id === user.id)
    if (existing && user.id === props.uid) throw new Error('No puedes modificar tu propio acceso.')
    if (existing) await gateway('tenantGateway', { action: 'updateMember', tenantId: props.tenantId, uid: user.id, displayName: user.name, roleId: user.role, active: user.active, nightclubPermissions: user.permissions })
    else await gateway('tenantGateway', { action: 'createMember', tenantId: props.tenantId, operationId: user.id, displayName: user.name, email: user.email, password: initialPassword, roleId: user.role, nightclubPermissions: user.permissions })
    await reload()
    return true
  }
  const deleteUser = async (id: string) => {
    if (id === props.uid) throw new Error('No puedes retirar tu propio acceso.')
    await gateway('tenantGateway', { action: 'deleteMember', tenantId: props.tenantId, uid: id })
    await reload()
    return true
  }
  const savePreset = async (roleId: NightclubUserRole, permissions: string[]) => {
    await gateway('tenantGateway', { action: 'saveNightclubRolePreset', tenantId: props.tenantId, roleId, nightclubPermissions: permissions })
    await reload()
    return true
  }
  return <main className="min-h-screen bg-slate-950 p-4 text-slate-100 sm:p-6"><div className="mx-auto max-w-6xl">
    <header className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-400/25 bg-slate-900 p-4 shadow-2xl"><div className="flex items-center gap-3">{props.logoUrl ? <img src={props.logoUrl} alt="" className="h-11 w-11 rounded-xl object-cover" /> : <span className="grid h-11 w-11 place-items-center rounded-xl bg-amber-400 text-slate-950"><CloudOff size={22} /></span>}<div><h1 className="font-black">{props.companyName}</h1><p className="text-xs text-slate-400">Club nocturno / Lounge · {props.userName}</p></div></div><button onClick={() => void props.onSignOut()} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-700 px-4 text-sm font-bold"><LogOut size={15} />Cerrar sesión</button></header>
    <div className="mt-5 rounded-xl border border-slate-700 bg-slate-900 p-5"><h2 className="text-lg font-bold">Servicio operacional todavía no conectado</h2><p className="mt-2 text-sm leading-6 text-slate-300">POS, Caja, Zonas y los demás módulos siguen cerrados hasta conectar su proveedor operacional seguro. No se cargarán datos ficticios ni operaciones locales en producción. Configuración de usuarios usa exclusivamente Auth y membresías de este tenant.</p></div>
    {canManage && <section className="mt-5 rounded-xl border border-slate-700 bg-slate-900 p-4"><button className="min-h-11 text-left font-bold text-amber-300" onClick={() => setShowUsers(value => !value)} aria-expanded={showUsers}>Configuración → Usuarios y permisos {showUsers ? '▴' : '▾'}</button>{loading && <p className="mt-3 text-sm text-slate-400">Cargando usuarios...</p>}{error && <p role="alert" className="mt-3 text-sm text-rose-300">{error}</p>}{showUsers && !loading && !error && <div className="mt-4 border-t border-slate-700 pt-4"><NightclubUsers users={users} rolePresets={presets} mode="tenant" currentUserId={props.uid} canEditPresets={['owner', 'admin'].includes(props.role)} onSave={saveUser} onDelete={deleteUser} onSavePreset={savePreset} /></div>}</section>}
  </div></main>
}
