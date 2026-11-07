import { memo, useRef, useState } from 'react'
import type { RestaurantSector, RestaurantTable } from '../types'
import type { FloorAction } from '../domain/restaurantFloor'
import './restaurantFloorCanvas.css'

type Point = { x: number; y: number }
type Props = {
  tables: RestaurantTable[]; sectors: RestaurantSector[]; selectedId?: string; canEdit: boolean; onEditingChange: (editing: boolean) => void
  onSelect: (table: RestaurantTable) => void
  onSave: (action: FloorAction) => Promise<{ ok: boolean; error?: string }> | { ok: boolean; error?: string }
}
const labels = { available: 'Libre', occupied: 'Ocupada', bill_requested: 'Cuenta solicitada', reserved: 'Reservada' }
const automatic = (index: number): Point => ({ x: (index % 4) * 200 + 20, y: Math.floor(index / 4) * 180 + 20 })
const clamp = (value: number) => Math.max(0, Math.min(2400, Math.round(value / 10) * 10))

export const RestaurantVisualTable = memo(function RestaurantVisualTable({ table }: { table: RestaurantTable }) {
  const count = Math.min(12, Math.max(1, table.capacity))
  const round = table.shape === 'round'
  const rectangle = table.shape === 'rectangle'
  return <svg viewBox="0 0 180 130" aria-hidden="true" className="restaurant-table-vector">
    {Array.from({ length: count }, (_, i) => {
      const angle = (i / count) * Math.PI * 2 - Math.PI / 2
      const x = round ? 90 + Math.cos(angle) * 51 : i < Math.ceil(count / 2) ? 42 + i * (96 / Math.max(1, Math.ceil(count / 2) - 1)) : 42 + (i - Math.ceil(count / 2)) * (96 / Math.max(1, Math.floor(count / 2) - 1))
      const y = round ? 61 + Math.sin(angle) * 49 : i < Math.ceil(count / 2) ? 16 : 105
      return <rect key={i} x={x - 9} y={y - 6} width="18" height="12" rx="4" className="restaurant-table-chair" transform={round ? `rotate(${angle * 180 / Math.PI + 90} ${x} ${y})` : undefined} />
    })}
    {round ? <circle cx="90" cy="61" r="37" className="restaurant-table-top" /> : <rect x={rectangle ? 25 : 50} y="29" width={rectangle ? 130 : 80} height="64" rx="12" className="restaurant-table-top" />}
    <text x="90" y="58" textAnchor="middle" className="restaurant-table-name">{table.name.length > 17 ? `${table.name.slice(0, 15)}…` : table.name}</text>
    <text x="90" y="78" textAnchor="middle" className="restaurant-table-capacity">{table.capacity} plazas</text>
  </svg>
})

export function RestaurantFloorCanvas({ tables, sectors, canEdit, selectedId, onEditingChange, onSelect, onSave }: Props) {
  const [zoom, setZoom] = useState(1)
  const [editing, setEditing] = useState(false)
  const [list, setList] = useState(false)
  const [draft, setDraft] = useState<Record<string, Point>>({})
  const [editId, setEditId] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const viewport = useRef<HTMLDivElement>(null)
  const sectorIds = useRef<Record<string, string>>({})
  const revisions = useRef<Record<string, number>>({})
  const drag = useRef<{ id: string; x: number; y: number; start: Point } | null>(null)
  const groups = [...new Set(tables.map(t => t.sectorId || 'unassigned'))].map(id => ({ id, name: sectors.find(s => s.id === id)?.name || 'Sin sector', tables: tables.filter(t => (t.sectorId || 'unassigned') === id) }))
  const point = (table: RestaurantTable, index: number) => draft[table.id] || (table.layout?.version === 1 && Number.isFinite(table.layout.x) && Number.isFinite(table.layout.y) && table.layout.sectorId === table.sectorId ? table.layout : automatic(index))
  const move = (id: string, p: Point) => setDraft(d => ({ ...d, [id]: { x: clamp(p.x), y: clamp(p.y) } }))
  const nudge = (x: number, y: number) => {
    const group = groups.find(g => g.tables.some(t => t.id === editId))
    const index = group?.tables.findIndex(t => t.id === editId) ?? -1
    if (!group || index < 0) return
    const p = point(group.tables[index], index)
    move(editId!, { x: p.x + x, y: p.y + y })
  }
  const save = async () => {
    if (busy || !canEdit) return
    if (Object.keys(draft).some(id => !tables.some(t => t.id === id && t.sectorId === sectorIds.current[id]))) { setError('Una mesa cambió de sector o fue archivada. Cancela la edición y revisa el plano actualizado.'); return }
    for (const group of groups) for (let i = 0; i < group.tables.length; i++) for (let j = i + 1; j < group.tables.length; j++) {
      const a = point(group.tables[i], i), b = point(group.tables[j], j)
      if (Math.abs(a.x - b.x) < 180 && Math.abs(a.y - b.y) < 160) { setError('Separa las mesas superpuestas antes de guardar.'); return }
    }
    setBusy(true); setError('')
    try {
      const positions = tables.filter(t => draft[t.id]).map(t => ({ id: t.id, ...draft[t.id], expectedSectorId: sectorIds.current[t.id], expectedRevision: revisions.current[t.id] || 0 }))
      if (!positions.length) { setEditing(false); onEditingChange(false); return }
      const result = await onSave({ type: 'layout.save', positions })
      if (!result.ok) { setError(result.error || 'No se pudo guardar. Conservamos tus cambios para reintentar.'); return }
      setEditing(false); onEditingChange(false); setDraft({}); setEditId(null)
    } catch { setError('No se pudo guardar. Revisa la conexión y vuelve a intentarlo.') } finally { setBusy(false) }
  }
  return <section className="restaurant-floor" aria-label="Mapa del restaurante">
    <header className="restaurant-floor-toolbar">
      <div><strong>Plano del salón</strong><span>{editing ? 'Edición de distribución' : 'Selecciona una mesa para consultar su cuenta'}</span></div>
      <div className="restaurant-floor-controls">
        <button type="button" aria-pressed={list} onClick={() => setList(!list)}>{list ? 'Ver plano' : 'Ver lista'}</button>
        <button type="button" aria-label="Alejar plano" onClick={() => setZoom(v => Math.max(.6, v - .1))}>−</button>
        <button type="button" onClick={() => setZoom(1)} aria-label="Restablecer zoom">{Math.round(zoom * 100)}%</button>
        <button type="button" aria-label="Acercar plano" onClick={() => setZoom(v => Math.min(1.5, v + .1))}>+</button>
        <button type="button" onClick={() => setZoom(Math.max(.25, Math.min(1, ((viewport.current?.clientWidth || 820) - 40) / Math.max(820, ...groups.flatMap(g => g.tables.map((t,i) => point(t,i).x + 200))))))}>Ajustar vista</button>
        {canEdit && !editing && <button type="button" onClick={() => { sectorIds.current = Object.fromEntries(tables.map(t => [t.id, t.sectorId || ''])); revisions.current = Object.fromEntries(tables.map(t => [t.id, t.layout?.revision || 0])); setEditing(true); onEditingChange(true); setList(false) }}>Editar distribución</button>}
      </div>
    </header>
    {editing && <div className="restaurant-floor-editor"><p>En PC, arrastra una mesa. En celular, selecciónala y usa los controles de posición. También puedes usar las flechas del teclado. Los cambios se guardan juntos.</p><div className="restaurant-floor-controls">
      {[[0,-20,'↑'],[-20,0,'←'],[20,0,'→'],[0,20,'↓']].map(([x,y,label]) => <button type="button" key={label} disabled={!editId || busy} aria-label={`Mover mesa ${label}`} onClick={() => nudge(Number(x),Number(y))}>{label}</button>)}
      <button type="button" disabled={busy} onClick={() => { const next: Record<string,Point> = {}; groups.forEach(g => g.tables.forEach((t,i) => { next[t.id] = automatic(i) })); setDraft(next) }}>Distribución automática</button>
      <button type="button" disabled={busy} onClick={() => { setDraft({}); setEditing(false); onEditingChange(false); setError('') }}>Cancelar edición</button>
      <button type="button" disabled={busy} onClick={save}>{busy ? 'Guardando…' : 'Guardar distribución'}</button>
    </div></div>}
    {error && <p role="alert" className="restaurant-floor-error">{error}</p>}
    <div ref={viewport} data-tour="tables-grid" className="restaurant-floor-scroll">
      {!groups.length && <p className="restaurant-floor-empty">Este sector todavía no tiene mesas.</p>}
      {groups.map(group => {
        const width = Math.max(820, ...group.tables.map((t,i) => point(t,i).x + 200))
        const height = Math.max(220, ...group.tables.map((t,i) => point(t,i).y + 180))
        return <section className="restaurant-floor-sector" key={group.id} aria-label={group.name}>
          <h2>{group.name}<small>{group.tables.length} mesas</small></h2>
          <div className={list ? 'restaurant-floor-list' : 'restaurant-floor-space'} style={list ? undefined : { width: width * zoom, height: height * zoom }}>
            <div className={list ? undefined : 'restaurant-floor-plane'} style={list ? undefined : { width, height, transform: `scale(${zoom})` }}>
              {group.tables.map((table,index) => { const p = point(table,index); const inactive = table.active === false; return <button key={table.id} type="button" data-table-id={table.id} data-tour={table.status === 'occupied' || table.status === 'bill_requested' ? 'tables-active' : table.status === 'available' ? 'tables-available' : undefined} disabled={inactive && !editing} aria-label={`${table.name}, ${table.capacity} plazas, ${inactive ? 'Desactivada' : labels[table.status]}`} aria-pressed={editing ? editId === table.id : selectedId === table.id} className={`restaurant-floor-table ${inactive ? 'inactive' : table.status} ${editing ? 'is-editing' : ''}`} style={list ? undefined : { left:p.x, top:p.y }}
                onClick={() => editing ? setEditId(table.id) : onSelect(table)}
                onKeyDown={event => { if (!editing || !['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key)) return; event.preventDefault(); move(table.id,{x:p.x+(event.key==='ArrowLeft'?-20:event.key==='ArrowRight'?20:0),y:p.y+(event.key==='ArrowUp'?-20:event.key==='ArrowDown'?20:0)}) }}
                onPointerDown={event => { if (!editing || busy || event.pointerType === 'touch') return; setEditId(table.id); event.currentTarget.setPointerCapture(event.pointerId); drag.current={id:table.id,x:event.clientX,y:event.clientY,start:p} }}
                onPointerMove={event => { const d=drag.current; if (!d || d.id!==table.id || !editing) return; move(table.id,{x:d.start.x+(event.clientX-d.x)/zoom,y:d.start.y+(event.clientY-d.y)/zoom}) }}
                onPointerUp={event => { drag.current=null; if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId) }} onPointerCancel={() => { drag.current=null }}>
                <RestaurantVisualTable table={table}/><span className="restaurant-floor-table-status">{inactive ? 'Desactivada' : labels[table.status]}{table.activeOrderId ? ' · Cuenta abierta' : ''}</span>
              </button> })}
            </div>
          </div>
        </section>
      })}
    </div>
    <footer className="restaurant-floor-legend">Libre · Ocupada · Cuenta solicitada · Reservada<span>Las selecciones no modifican cuentas.</span></footer>
  </section>
}
