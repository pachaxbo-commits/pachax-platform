import { useState } from 'react'
import { Clock3, Plus, Shield, UserCheck, X } from 'lucide-react'
import { RESTAURANT_STAFF } from '../mocks/restaurantMock'

type RestaurantRole = 'owner' | 'admin' | 'cashier' | 'waiter' | 'kitchen'
type Staff = { id: string; name: string; email: string; role: string; roleName: string; active?: boolean }
type Attendance = { staffId: string; checkIn: string; checkOut?: string }
const STORAGE = 'pachax:restaurant-demo:attendance:v1'
const roleOptions: Array<{ id: RestaurantRole; label: string; detail: string }> = [
  { id: 'owner', label: 'Propietario', detail: 'Acceso completo, reportes y configuración.' },
  { id: 'admin', label: 'Administrador', detail: 'Operación, catálogo, inventario y equipo.' },
  { id: 'cashier', label: 'Caja', detail: 'Turnos, cobros, facturación e historial.' },
  { id: 'waiter', label: 'Mesero', detail: 'Mesas, pedidos y comandas.' },
  { id: 'kitchen', label: 'Cocina', detail: 'Comandas, preparación y entregas.' },
]
const readAttendance = (): Attendance[] => { try { return JSON.parse(localStorage.getItem(STORAGE) || '[]') as Attendance[] } catch { return [] } }
const formatTime = (value?: string) => value ? new Date(value).toLocaleTimeString('es-BO', { hour: '2-digit', minute: '2-digit' }) : '—'

export function RestaurantUsers({ currentRole, onSelectRole }: { currentRole: string; onSelectRole?: (roleId: string) => void }) {
  const [staff, setStaff] = useState<Staff[]>(() => RESTAURANT_STAFF.map(item => ({ ...item, active: true })))
  const [attendance, setAttendance] = useState<Attendance[]>(readAttendance)
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState({ name: '', email: '', role: 'waiter' as RestaurantRole })
  const persistAttendance = (next: Attendance[]) => { setAttendance(next); localStorage.setItem(STORAGE, JSON.stringify(next)) }
  const toggleAttendance = (staffId: string) => {
    const open = attendance.find(item => item.staffId === staffId && !item.checkOut)
    const now = new Date().toISOString()
    persistAttendance(open ? attendance.map(item => item === open ? { ...item, checkOut: now } : item) : [{ staffId, checkIn: now }, ...attendance])
  }
  const create = () => {
    if (!form.name.trim() || !/^\S+@\S+\.\S+$/.test(form.email)) return
    const role = roleOptions.find(item => item.id === form.role)!
    setStaff(previous => [...previous, { id: crypto.randomUUID(), name: form.name.trim(), email: form.email.trim().toLowerCase(), role: form.role, roleName: role.label, active: true }])
    setForm({ name: '', email: '', role: 'waiter' }); setCreating(false)
  }

  return <div className="space-y-6">
    <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><h1 className="text-2xl font-bold text-slate-900">Usuarios y asistencia</h1><p className="text-sm text-slate-500">Personal, roles y registro diario del restaurante.</p></div><button onClick={() => setCreating(true)} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl bg-slate-900 px-4 text-sm font-bold text-white"><Plus size={16} /> Nuevo usuario</button></header>
    <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">{roleOptions.map(role => <article key={role.id} className="rounded-2xl border border-slate-200 bg-white p-3"><div className="flex items-center gap-2"><Shield size={15} className="text-teal-600" /><strong className="text-xs text-slate-900">{role.label}</strong></div><p className="mt-2 text-[11px] text-slate-500">{role.detail}</p><span className="mt-2 inline-block rounded-full bg-slate-100 px-2 py-1 text-[10px] font-bold text-slate-600">{staff.filter(item => item.role === role.id).length} usuario(s)</span></article>)}</section>
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">{staff.map(member => { const activeAttendance = attendance.find(item => item.staffId === member.id && !item.checkOut); const last = attendance.find(item => item.staffId === member.id); const isSelected = currentRole === member.role; return <article key={member.id} className={`rounded-2xl border bg-white p-5 shadow-xs ${isSelected ? 'border-teal-300 ring-2 ring-teal-400/20' : 'border-slate-200'}`}><div className="flex items-start gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-900 text-sm font-bold text-white">{member.name.slice(0,2).toUpperCase()}</span><div className="min-w-0 flex-1"><h3 className="truncate text-sm font-bold">{member.name}</h3><p className="truncate text-xs text-slate-500">{member.email}</p></div><span className={`rounded-full px-2 py-1 text-[9px] font-black ${activeAttendance ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>{activeAttendance ? 'EN TURNO' : 'FUERA'}</span></div><div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3"><span className="inline-flex items-center gap-1 rounded-lg bg-slate-100 px-2 py-1 text-xs font-semibold"><Shield size={12} />{member.roleName}</span>{onSelectRole && <button onClick={() => onSelectRole(member.role)} className={`rounded-lg px-2 py-1 text-xs font-semibold ${isSelected ? 'bg-teal-600 text-white' : 'text-slate-600 hover:bg-slate-100'}`}>{isSelected ? 'Rol activo' : 'Simular rol'}</button>}</div><div className="mt-3 rounded-xl bg-slate-50 p-3 text-[11px] text-slate-600"><p className="flex items-center gap-1 font-semibold"><Clock3 size={13} /> Entrada {formatTime(activeAttendance?.checkIn || last?.checkIn)} · Salida {formatTime(last?.checkOut)}</p><button onClick={() => toggleAttendance(member.id)} className={`mt-2 w-full rounded-xl py-2 text-xs font-bold ${activeAttendance ? 'border border-slate-200 bg-white text-slate-700' : 'bg-teal-500 text-slate-950'}`}>{activeAttendance ? 'Registrar salida' : 'Registrar entrada'}</button></div></article> })}</div>
    {creating && <div className="fixed inset-0 z-[120] grid place-items-center bg-slate-950/50 p-4" onClick={() => setCreating(false)}><section role="dialog" onClick={event => event.stopPropagation()} className="w-full max-w-sm space-y-3 rounded-2xl bg-white p-5"><header className="flex justify-between"><div><h2 className="text-lg font-bold">Nuevo usuario</h2><p className="text-xs text-slate-500">El acceso remoto se conectará al repositorio de usuarios.</p></div><button onClick={() => setCreating(false)}><X size={18} /></button></header><label className="block text-xs font-semibold">Nombre<input value={form.name} onChange={event => setForm({ ...form, name: event.target.value })} className="mt-1 w-full rounded-xl border border-slate-200 p-3" /></label><label className="block text-xs font-semibold">Correo<input type="email" value={form.email} onChange={event => setForm({ ...form, email: event.target.value })} className="mt-1 w-full rounded-xl border border-slate-200 p-3" /></label><label className="block text-xs font-semibold">Rol<select value={form.role} onChange={event => setForm({ ...form, role: event.target.value as RestaurantRole })} className="mt-1 w-full rounded-xl border border-slate-200 p-3">{roleOptions.map(role => <option key={role.id} value={role.id}>{role.label}</option>)}</select></label><button onClick={create} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 p-3 text-sm font-bold text-white"><UserCheck size={16} /> Crear usuario</button></section></div>}
  </div>
}
