import { useState } from 'react'
import { Plus, X } from 'lucide-react'
import type { RestaurantSector, RestaurantTable } from '../mocks/restaurantMock'
import type { FloorAction } from '../../modules/restaurant/domain/restaurantFloor'

type Props = {
  sectors: RestaurantSector[]
  tables: RestaurantTable[]
  selectedSectorId: string
  onFloorAction: (action: FloorAction) => { ok: boolean; error?: string }
  onSelectSector: (id: string) => void
  onViewTable: (id: string) => void
}
type Edit = { kind: 'sector' | 'table'; id?: string } | null

export function RestaurantFloorManager({ sectors, tables, selectedSectorId, onFloorAction, onSelectSector, onViewTable }: Props) {
  const activeSectors = sectors.filter(sector => sector.active).sort((a, b) => a.sortOrder - b.sortOrder)
  const currentTables = tables.filter(table => !table.archivedAt && (selectedSectorId === 'all' || table.sectorId === selectedSectorId)).sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0))
  const [edit, setEdit] = useState<Edit>(null)
  const [confirm, setConfirm] = useState<Edit>(null)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [sectorId, setSectorId] = useState('')
  const [capacity, setCapacity] = useState('4')
  const [shape, setShape] = useState<RestaurantTable['shape']>('square')
  const [active, setActive] = useState(true)
  const [transferToId, setTransferToId] = useState('')
  const [error, setError] = useState('')
  const run = (action: FloorAction) => {
    const result = onFloorAction(action)
    if (!result.ok) { setError(result.error || 'No se pudo guardar el cambio.'); return false }
    setError('')
    return true
  }
  const open = (kind: 'sector' | 'table', id?: string) => {
    const sector = kind === 'sector' ? sectors.find(item => item.id === id) : undefined
    const table = kind === 'table' ? tables.find(item => item.id === id) : undefined
    setName(sector?.name || table?.name || '')
    setDescription(sector?.description || '')
    setSectorId(table?.sectorId || (selectedSectorId !== 'all' ? selectedSectorId : activeSectors[0]?.id || ''))
    setCapacity(String(table?.capacity || 4))
    setShape(table?.shape || 'square')
    setActive(table?.active !== false)
    setError('')
    setEdit({ kind, id })
  }
  const save = () => {
    if (!edit) return
    const id = edit.id || crypto.randomUUID()
    const action: FloorAction = edit.kind === 'sector'
      ? edit.id ? { type: 'sector.update', id, name, description } : { type: 'sector.create', id, name, description }
      : edit.id ? { type: 'table.update', id, name, sectorId, capacity: Number(capacity), shape, active } : { type: 'table.create', id, name, sectorId, capacity: Number(capacity), shape, active }
    if (run(action)) { setEdit(null); if (edit.kind === 'sector' && !edit.id) onSelectSector(id) }
  }
  const remove = () => {
    if (!confirm?.id) return
    const action: FloorAction = confirm.kind === 'sector'
      ? { type: 'sector.archive', id: confirm.id, transferToId: transferToId || undefined }
      : { type: 'table.archive', id: confirm.id }
    if (run(action)) { setConfirm(null); setTransferToId(''); if (confirm.kind === 'sector') onSelectSector('all') }
  }
  const askRemove = (kind: 'sector' | 'table', id: string) => { setConfirm({ kind, id }); setTransferToId(''); setError('') }
  return <section className="space-y-4 rounded-2xl border border-slate-200 bg-slate-50/70 p-4 sm:p-5">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-base font-bold text-slate-900">Administrar salón</h2><p className="text-xs text-slate-500">Organiza sectores y mesas para la operación.</p></div><div className="flex gap-2"><button type="button" onClick={() => open('sector')} className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold"><Plus className="mr-1 inline h-3 w-3" />Nuevo sector</button><button type="button" onClick={() => open('table')} disabled={!activeSectors.length} className="rounded-xl bg-slate-900 px-3 py-2 text-xs font-semibold text-white disabled:opacity-40"><Plus className="mr-1 inline h-3 w-3" />Nueva mesa</button></div></div>
    {activeSectors.length === 0 && <p className="rounded-xl border border-dashed border-slate-300 bg-white p-5 text-sm text-slate-600">Aún no hay sectores. Crea el primero para añadir mesas.</p>}
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{activeSectors.map(sector => <div key={sector.id} className="flex items-start justify-between gap-2 rounded-xl border border-slate-200 bg-white p-3"><div><strong className="text-sm text-slate-900">{sector.name}</strong><p className="text-xs text-slate-500">{tables.filter(table => !table.archivedAt && table.sectorId === sector.id).length} mesas{sector.description ? ` · ${sector.description}` : ''}</p></div><ActionMenu label={`Opciones de ${sector.name}`}><MenuAction onClick={() => open('sector', sector.id)}>Editar sector</MenuAction><MenuAction onClick={() => run({ type: 'sector.reorder', id: sector.id, direction: -1 })}>Subir</MenuAction><MenuAction onClick={() => run({ type: 'sector.reorder', id: sector.id, direction: 1 })}>Bajar</MenuAction><MenuAction onClick={() => askRemove('sector', sector.id)}>Eliminar sector</MenuAction></ActionMenu></div>)}</div>
    {currentTables.length > 0 && <div><h3 className="mb-2 text-xs font-bold uppercase text-slate-600">Mesas {selectedSectorId === 'all' ? 'de todos los sectores' : 'del sector'}</h3><div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{currentTables.map(table => <div key={table.id} className="flex items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white p-3"><div><strong className="text-sm text-slate-900">{table.name}</strong><p className="text-xs text-slate-500">{table.capacity} personas · {activeSectors.find(sector => sector.id === table.sectorId)?.name || 'Sector archivado'} · {table.active === false ? 'Desactivada' : table.status === 'available' ? 'Libre' : table.status === 'bill_requested' ? 'Por cerrarse' : 'En uso'}</p></div><ActionMenu label={`Opciones de ${table.name}`}><MenuAction onClick={() => open('table', table.id)}>Editar / mover mesa</MenuAction><MenuAction onClick={() => run({ type: 'table.update', id: table.id, name: table.name, sectorId: table.sectorId || '', capacity: table.capacity, shape: table.shape, active: table.active === false })}>{table.active === false ? 'Activar mesa' : 'Desactivar mesa'}</MenuAction><MenuAction onClick={() => run({ type: 'table.reorder', id: table.id, direction: -1 })}>Subir</MenuAction><MenuAction onClick={() => run({ type: 'table.reorder', id: table.id, direction: 1 })}>Bajar</MenuAction><MenuAction onClick={() => askRemove('table', table.id)}>Eliminar mesa</MenuAction></ActionMenu></div>)}</div></div>}
    {error && !edit && !confirm && <p role="alert" className="text-sm text-red-700">{error}</p>}
    {edit && <Modal title={edit.id ? `Editar ${edit.kind === 'sector' ? 'sector' : 'mesa'}` : `Crear ${edit.kind === 'sector' ? 'sector' : 'mesa'}`} onClose={() => { setEdit(null); setError('') }}><label className="block text-xs font-semibold">Nombre<input autoFocus value={name} onChange={event => setName(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" placeholder={edit.kind === 'sector' ? 'Salón principal' : 'Mesa 1'} /></label>{edit.kind === 'sector' ? <label className="block text-xs font-semibold">Descripción (opcional)<input value={description} onChange={event => setDescription(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" /></label> : <><label className="block text-xs font-semibold">Sector<select value={sectorId} onChange={event => setSectorId(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm">{activeSectors.map(sector => <option key={sector.id} value={sector.id}>{sector.name}</option>)}</select></label><div className="grid grid-cols-2 gap-2"><label className="text-xs font-semibold">Capacidad<input type="number" min="1" max="100" value={capacity} onChange={event => setCapacity(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" /></label><label className="text-xs font-semibold">Forma<select value={shape} onChange={event => setShape(event.target.value as RestaurantTable['shape'])} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"><option value="square">Cuadrada</option><option value="round">Redonda</option><option value="rectangle">Rectangular</option></select></label></div><label className="flex items-center gap-2 text-xs font-semibold"><input type="checkbox" checked={active} onChange={event => setActive(event.target.checked)} /> Mesa activa para ventas</label></>}{error && <p role="alert" className="text-xs text-red-700">{error}</p>}<button type="button" onClick={save} className="w-full rounded-xl bg-teal-500 py-2.5 text-sm font-bold text-slate-950">{edit.id ? 'Guardar cambios' : edit.kind === 'sector' ? 'Crear sector' : 'Crear mesa'}</button><button type="button" onClick={() => { setEdit(null); setError('') }} className="w-full rounded-xl border border-slate-200 py-2.5 text-sm font-semibold">Cancelar</button></Modal>}
    {confirm && <Modal title={`Eliminar ${confirm.kind === 'sector' ? 'sector' : 'mesa'}`} onClose={() => { setConfirm(null); setError('') }}><p className="text-sm text-slate-600">Se ocultará de la operación. El historial de pedidos permanecerá disponible.</p>{confirm.kind === 'sector' && <p className="text-sm font-medium text-slate-700">Este sector contiene {tables.filter(table => !table.archivedAt && table.sectorId === confirm.id).length} mesas.</p>}{confirm.kind === 'sector' && tables.some(table => !table.archivedAt && table.sectorId === confirm.id) && <label className="block text-xs font-semibold">Mover sus mesas a<select value={transferToId} onChange={event => setTransferToId(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"><option value="">Seleccionar sector</option>{activeSectors.filter(sector => sector.id !== confirm.id).map(sector => <option key={sector.id} value={sector.id}>{sector.name}</option>)}</select></label>}{error && <p role="alert" className="text-xs text-red-700">{error}</p>}{error && confirm.kind === 'table' && confirm.id && <button type="button" onClick={() => { onViewTable(confirm.id!); setConfirm(null); setError('') }} className="w-full rounded-xl border border-slate-200 py-2.5 text-sm font-semibold">Ver mesa</button>}<div className="flex gap-2"><button type="button" onClick={() => { setConfirm(null); setError('') }} className="flex-1 rounded-xl border border-slate-200 py-2.5 text-sm font-semibold">Cancelar</button><button type="button" onClick={remove} className="flex-1 rounded-xl bg-slate-900 py-2.5 text-sm font-bold text-white">Confirmar</button></div></Modal>}
  </section>
}

function ActionMenu({ label, children }: { label: string; children: React.ReactNode }) { return <details className="relative shrink-0"><summary aria-label={label} className="cursor-pointer list-none rounded-lg px-2 py-1 text-lg font-bold leading-none text-slate-500 hover:bg-slate-100">•••</summary><div className="absolute right-0 top-full z-20 mt-1 w-40 rounded-xl border border-slate-200 bg-white p-1 shadow-lg">{children}</div></details> }
function MenuAction({ children, onClick }: { children: React.ReactNode; onClick: () => void }) { return <button type="button" aria-label={typeof children === 'string' ? children : undefined} onClick={onClick} className="block w-full rounded-lg px-2 py-1.5 text-left text-xs font-medium text-slate-700 hover:bg-slate-100">{children}</button> }
function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) { return <div className="fixed inset-0 z-[130] grid place-items-center bg-slate-950/50 p-4" onClick={onClose}><section role="dialog" aria-modal="true" aria-label={title} onClick={event => event.stopPropagation()} className="w-full max-w-sm space-y-4 rounded-2xl bg-white p-5 shadow-xl"><header className="flex items-center justify-between"><h3 className="text-lg font-bold">{title}</h3><button type="button" aria-label="Cerrar" onClick={onClose}><X className="h-4 w-4" /></button></header>{children}</section></div> }
