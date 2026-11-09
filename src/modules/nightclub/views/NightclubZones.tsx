import { CalendarClock, Check, Clock, LayoutGrid, List, MapPin, Minus, Plus, ReceiptText, RotateCcw, Save, UserRound, Users, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import type { NightclubDataset } from '../domain/nightclubAccounts'
import { nightclubAccountLabel, nightclubBalance, nightclubPaidTotal } from '../domain/nightclubAccounts'
import { calculateNightclubFitZoom, canEditNightclubFloorLayout, createAutomaticNightclubLayout, createNightclubLayoutStorageKey, findNightclubLayoutCollisionsByZone, loadNightclubLayout, mergeNightclubLayout, normalizeNightclubLayout, type NightclubFloorLayout } from '../domain/nightclubFloorLayout'
import type { ReservationDraft } from '../domain/nightclubFloor'
import { NightclubNumberInput } from './NightclubNumberInput'
import { NightclubFloorCanvas } from './NightclubFloorCanvas'

const money = (value: number) => `Bs ${value.toLocaleString('es-BO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const localDay = () => { const now = new Date(); return [now.getFullYear(), String(now.getMonth() + 1).padStart(2, '0'), String(now.getDate()).padStart(2, '0')].join('-') }
const statusLabel = { available: 'Libre', occupied: 'Ocupada', reserved: 'Reservada', bill_requested: 'Cuenta solicitada' } as const
const statusColor = { available: 'bg-emerald-400', occupied: 'bg-sky-400', reserved: 'bg-violet-400', bill_requested: 'bg-amber-400' } as const

export function NightclubZones({ data, onOpenAccount, onGoToPOS, onFinishAccount, onDeliverRound, onSaveReservation, onCancelReservation, onArriveReservation, onAssignCustomer, canDeliver, mode = 'demo', canEditFloorLayout = false, isLight = false, layoutNamespace = '' }: {
  data: NightclubDataset
  onOpenAccount: (tableId: string) => string | Promise<string>
  onGoToPOS: (accountId: string) => void
  onFinishAccount: (accountId: string) => void | Promise<unknown>
  onDeliverRound: (accountId: string, roundId: string) => void | Promise<unknown>
  onSaveReservation?: (draft: ReservationDraft) => boolean | Promise<boolean>
  onCancelReservation?: (id: string) => boolean | Promise<boolean>
  onArriveReservation?: (id: string) => string | Promise<string>
  onAssignCustomer?: (accountId: string, customerId: string) => boolean | Promise<boolean>
  canDeliver: boolean
  mode?: 'tenant' | 'demo' | 'studio'
  canEditFloorLayout?: boolean
  isLight?: boolean
  layoutNamespace?: string
}) {
  const zones = useMemo(() => data.zones.slice().sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id)), [data.zones])
  const automaticLayout = useMemo(() => createAutomaticNightclubLayout(zones, data.tables), [zones, data.tables])
  const layoutKey = useMemo(() => createNightclubLayoutStorageKey(mode === 'studio' ? 'studio' : 'demo', zones, data.tables, layoutNamespace), [mode, zones, data.tables, layoutNamespace])
  const isFloorLayoutEditingAllowed = () => canEditNightclubFloorLayout(mode, canEditFloorLayout)
  const safeEditor = isFloorLayoutEditingAllowed()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [selectedZoneId, setSelectedZoneId] = useState('all')
  const [view, setView] = useState<'map' | 'list'>('map')
  const [zoom, setZoom] = useState(1)
  const [fitRevision, setFitRevision] = useState(0)
  const [editing, setEditing] = useState(false)
  const [draftLayout, setDraftLayout] = useState<NightclubFloorLayout>(automaticLayout)
  const [savedSnapshot, setSavedSnapshot] = useState<{ key: string; layout: NightclubFloorLayout } | null>(null)
  const [reserving, setReserving] = useState(false)
  const [opening, setOpening] = useState(false)
  const [reservationDraft, setReservationDraft] = useState<ReservationDraft>({ id: '', tableId: '', customerName: '', time: '22:00', guests: 2, reservationDate: localDay() })
  const floorMapRef = useRef<HTMLDivElement>(null)
  const didMountZoom = useRef(false)

  const savedLayout = useMemo(() => {
    let restored: NightclubFloorLayout = safeEditor && savedSnapshot?.key === layoutKey ? savedSnapshot.layout : {}
    if (safeEditor) {
      try { if (savedSnapshot?.key !== layoutKey) restored = loadNightclubLayout(localStorage, mode === 'studio' ? 'studio' : 'demo', zones, data.tables, layoutNamespace) } catch { restored = {} }
    }
    return mergeNightclubLayout(automaticLayout, restored)
  }, [automaticLayout, data.tables, layoutKey, layoutNamespace, mode, safeEditor, savedSnapshot, zones])

  const table = editing ? undefined : data.tables.find(item => item.id === selectedId)
  const account = data.accounts.find(item => item.id === table?.activeAccountId && item.status !== 'closed')
  const reservation = data.reservations.find(item => item.tableId === table?.id && item.status === 'confirmed')
  const visibleZones = selectedZoneId === 'all' ? zones : zones.filter(zone => zone.id === selectedZoneId)
  const visibleTables = data.tables.filter(item => selectedZoneId === 'all' || item.zoneId === selectedZoneId)
  const layout = editing ? draftLayout : savedLayout
  const collisions = useMemo(() => findNightclubLayoutCollisionsByZone(layout, data.tables).map(pair => pair.join(' · ')), [layout, data.tables])
  const counts = useMemo(() => ({ total: data.tables.length, available: data.tables.filter(item => item.status === 'available').length, occupied: data.tables.filter(item => item.status === 'occupied').length, reserved: data.tables.filter(item => item.status === 'reserved').length, bill: data.tables.filter(item => item.status === 'bill_requested').length }), [data.tables])

  const startReservation = () => {
    if (!table) return
    setReservationDraft({ id: reservation?.id || '', tableId: table.id, customerName: reservation?.customerName || '', time: reservation?.time || '22:00', guests: reservation?.guests || Math.min(2, table.capacity), reservationDate: reservation?.reservationDate || localDay(), phone: reservation?.phone || '', notes: reservation?.notes || '' })
    setReserving(true)
  }
  const saveReservation = async () => { if (onSaveReservation && await onSaveReservation(reservationDraft)) setReserving(false) }
  const openTable = async () => {
    if (!table || opening) return
    setOpening(true)
    try { const id = await onOpenAccount(table.id); if (id) { onGoToPOS(id); setSelectedId(null) } } finally { setOpening(false) }
  }
  const confirmArrival = async () => {
    if (!reservation || !onArriveReservation) return
    const id = await onArriveReservation(reservation.id)
    if (id) { onGoToPOS(id); setSelectedId(null) }
  }
  const moveTable = (id: string, deltaX: number, deltaY: number) => {
    setSelectedId(id)
    setDraftLayout(current => {
      const point = current[id] || automaticLayout[id]
      if (!point) return current
      return { ...current, [id]: { x: Math.max(8, Math.min(92, point.x + deltaX)), y: Math.max(8, Math.min(92, point.y + deltaY)) } }
    })
  }
  const saveLayout = () => {
    if (!isFloorLayoutEditingAllowed() || collisions.length) return
    const normalized = normalizeNightclubLayout(draftLayout, data.tables.map(item => item.id))
    try { localStorage.setItem(layoutKey, JSON.stringify(normalized)) } catch { return }
    setSavedSnapshot({ key: layoutKey, layout: normalized })
    setDraftLayout(mergeNightclubLayout(automaticLayout, normalized))
    setSelectedId(null)
    setEditing(false)
  }
  const cancelLayout = () => { setDraftLayout(savedLayout); setSelectedId(null); setEditing(false) }
  const beginLayoutEdit = () => { if (!isFloorLayoutEditingAllowed()) return; setDraftLayout(savedLayout); setEditing(true) }
  const resetLayout = () => setDraftLayout(automaticLayout)

  const centerFloorMaps = useCallback(() => {
    const root = floorMapRef.current
    if (!root) return
    const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    for (const scroll of root.querySelectorAll<HTMLElement>('[data-floor-zone-scroll]')) {
      const svg = scroll.querySelector<SVGSVGElement>('svg[data-floor-zone-svg]')
      if (!svg) continue
      const boxes = [...svg.querySelectorAll<SVGGElement>('[data-floor-table]')].map(group => group.getBBox())
      if (!boxes.length) continue
      const left = Math.min(...boxes.map(box => box.x))
      const top = Math.min(...boxes.map(box => box.y))
      const right = Math.max(...boxes.map(box => box.x + box.width))
      const bottom = Math.max(...boxes.map(box => box.y + box.height))
      const targetLeft = Math.max(0, ((left + right) / 2) * zoom - scroll.clientWidth / 2)
      const targetTop = Math.max(0, ((top + bottom) / 2) * zoom - scroll.clientHeight / 2)
      scroll.scrollTo({ left: targetLeft, top: targetTop, behavior: reducedMotion ? 'auto' : 'smooth' })
    }
  }, [zoom])

  useEffect(() => {
    if (!didMountZoom.current) { didMountZoom.current = true; return }
    requestAnimationFrame(centerFloorMaps)
  }, [centerFloorMaps, fitRevision])

  const fitFloorView = useCallback(() => {
    const root = floorMapRef.current
    if (!root) return
    let fittedZoom = 1.5
    let hasContent = false
    for (const scroll of root.querySelectorAll<HTMLElement>('[data-floor-zone-scroll]')) {
      const svg = scroll.querySelector<SVGSVGElement>('svg[data-floor-zone-svg]')
      if (!svg) continue
      const boxes = [...svg.querySelectorAll<SVGGElement>('[data-floor-table]')].map(group => group.getBBox())
      if (!boxes.length) continue
      const left = Math.min(...boxes.map(box => box.x))
      const top = Math.min(...boxes.map(box => box.y))
      const right = Math.max(...boxes.map(box => box.x + box.width))
      const bottom = Math.max(...boxes.map(box => box.y + box.height))
      fittedZoom = Math.min(fittedZoom, calculateNightclubFitZoom(right - left, bottom - top, scroll.clientWidth, scroll.clientHeight))
      hasContent = true
    }
    setZoom(hasContent ? fittedZoom : 1)
    setFitRevision(revision => revision + 1)
  }, [])

  const handleFloorKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Escape' || event.target instanceof HTMLElement && event.target.closest('[role="dialog"]')) return
    if (editing) { event.preventDefault(); cancelLayout(); return }
    if (selectedId) { event.preventDefault(); setSelectedId(null) }
  }

  const surface = isLight ? 'border-slate-200 bg-white text-slate-900' : 'border-slate-700/70 bg-[#09141f] text-slate-100'
  const muted = isLight ? 'text-slate-600' : 'text-slate-400'
  const control = isLight ? 'border-slate-300 bg-white text-slate-800 hover:bg-slate-50' : 'border-white/10 bg-white/[.03] text-slate-200 hover:bg-white/[.07]'

  return <div className="space-y-5" data-tour="section-floor" onKeyDown={handleFloorKeyDown}>
    <header className="flex flex-wrap items-end justify-between gap-3">
      <div><p className={`text-[10px] font-bold uppercase tracking-[.22em] ${isLight ? 'text-amber-700' : 'text-amber-300'}`}>Nightclub · plano operativo</p><h1 className={`mt-1 text-3xl font-semibold tracking-tight ${isLight ? 'text-slate-900' : 'text-white'}`}>Zonas y mesas</h1><p className={`mt-1 max-w-2xl text-sm ${muted}`}>Consulta ocupación, reservas y cuentas abiertas por sector.</p></div>
      {safeEditor && !editing && <button type="button" data-tour="floor-editor-entry" data-tutorial-target="floor-editor-entry" onClick={beginLayoutEdit} className={`inline-flex min-h-11 items-center gap-2 rounded-xl border px-4 text-sm font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-400 ${control}`}><LayoutGrid size={16} />Editar plano</button>}
    </header>

    <section className={`rounded-2xl border p-3 sm:p-4 ${surface}`} data-tour="floor-toolbar" data-tutorial-target="floor-toolbar">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <label className="flex min-w-0 flex-1 items-center gap-2 text-xs font-semibold"><MapPin size={16} className="shrink-0 text-amber-500" /><span className="sr-only">Filtrar zona</span><select aria-label="Filtrar zona" value={selectedZoneId} onChange={event => setSelectedZoneId(event.target.value)} className={`min-h-11 min-w-0 flex-1 rounded-xl border px-3 text-sm ${control}`}><option value="all">Todas las zonas</option>{zones.map(zone => <option key={zone.id} value={zone.id}>{zone.name}</option>)}</select></label>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:flex">
          {([['total', 'Mesas'], ['available', 'Libres'], ['occupied', 'Ocupadas'], ['bill', 'Por cobrar']] as const).map(([key, label]) => <div key={key} className={`min-w-[82px] rounded-xl border px-3 py-2 ${control}`}><span className={`block text-[9px] font-bold uppercase tracking-wider ${muted}`}>{label}</span><strong className="mt-0.5 block text-base">{counts[key]}</strong></div>)}
        </div>
      </div>
      <div className={`mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 border-t pt-3 text-xs ${isLight ? 'border-slate-200 text-slate-600' : 'border-white/10 text-slate-300'}`}>
        {Object.entries(statusLabel).map(([status, label]) => <span key={status} className="inline-flex items-center gap-2"><i className={`h-2.5 w-2.5 rounded-full ${statusColor[status as keyof typeof statusColor]}`} />{label}</span>)}
        <span className={`ml-auto inline-flex items-center gap-2 ${muted}`}><span className="h-2.5 w-2.5 rounded-full border border-current" />Cuenta activa</span>
      </div>
    </section>

    {editing && <section className={`flex flex-wrap items-center gap-2 rounded-2xl border p-3 ${isLight ? 'border-amber-300 bg-amber-50 text-slate-900' : 'border-amber-300/25 bg-amber-300/[.07] text-slate-100'}`} data-tour="floor-editor-controls" data-tutorial-target="floor-editor-controls">
      <div className="mr-auto min-w-[180px]"><strong className="block text-sm">Editando plano demostrativo</strong><span className={`text-xs ${muted}`}>Los cambios quedan solo en este navegador de práctica.</span></div>
      <button type="button" onClick={() => moveTable(selectedId || '', 0, -4)} disabled={!selectedId} aria-label="Mover mesa hacia arriba" className={`grid h-11 w-11 place-items-center rounded-xl border disabled:opacity-40 ${control}`}>↑</button>
      <button type="button" onClick={() => moveTable(selectedId || '', -4, 0)} disabled={!selectedId} aria-label="Mover mesa a la izquierda" className={`grid h-11 w-11 place-items-center rounded-xl border disabled:opacity-40 ${control}`}>←</button>
      <button type="button" onClick={() => moveTable(selectedId || '', 4, 0)} disabled={!selectedId} aria-label="Mover mesa a la derecha" className={`grid h-11 w-11 place-items-center rounded-xl border disabled:opacity-40 ${control}`}>→</button>
      <button type="button" onClick={() => moveTable(selectedId || '', 0, 4)} disabled={!selectedId} aria-label="Mover mesa hacia abajo" className={`grid h-11 w-11 place-items-center rounded-xl border disabled:opacity-40 ${control}`}>↓</button>
      <button type="button" onClick={resetLayout} className={`inline-flex min-h-11 items-center gap-2 rounded-xl border px-3 text-xs font-semibold ${control}`}><RotateCcw size={14} />Auto</button>
      <button type="button" onClick={cancelLayout} className={`inline-flex min-h-11 items-center gap-2 rounded-xl border px-3 text-xs font-semibold ${control}`}><X size={14} />Cancelar</button>
      <button type="button" data-floor-save onClick={saveLayout} disabled={collisions.length > 0} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-amber-300 px-4 text-xs font-bold text-slate-950 disabled:cursor-not-allowed disabled:opacity-50"><Save size={14} />Guardar en demo</button>
      {collisions.length > 0 && <p role="alert" className="w-full text-xs font-medium text-rose-600">Separa las mesas superpuestas antes de guardar ({collisions.length} conflicto{collisions.length === 1 ? '' : 's'}).</p>}
    </section>}

    <section className={`min-w-0 max-w-full overflow-hidden rounded-2xl border p-3 sm:p-4 ${surface}`}>
      <div className="mb-3 flex flex-wrap items-center gap-2"><div className="mr-auto"><h2 className="text-sm font-bold">Plano del establecimiento</h2><p className={`mt-0.5 text-xs ${muted}`}>{editing ? 'Arrastra una mesa o selecciónala y muévela con los controles.' : 'Selecciona una mesa para consultar su reserva o cuenta.'}</p></div>{view === 'map' && <div className={`inline-flex items-center gap-1 rounded-xl border p-1 ${control}`} aria-label="Controles de zoom"><button type="button" aria-label="Alejar plano" disabled={zoom <= 0.8} onClick={() => setZoom(current => Math.max(0.8, Number((current - 0.1).toFixed(1))))} className="grid h-9 w-9 place-items-center rounded-lg disabled:opacity-40"><Minus size={15} /></button><span className="min-w-12 text-center text-[11px] tabular-nums" aria-live="polite">{Math.round(zoom * 100)}%</span><button type="button" aria-label="Acercar plano" disabled={zoom >= 1.5} onClick={() => setZoom(current => Math.min(1.5, Number((current + 0.1).toFixed(1))))} className="grid h-9 w-9 place-items-center rounded-lg disabled:opacity-40"><Plus size={15} /></button><button type="button" aria-label="Ajustar plano a las mesas" onClick={fitFloorView} className="min-h-9 rounded-lg px-2 text-[10px] font-semibold">Ajustar</button></div>}<div className={`inline-flex rounded-xl border p-1 ${control}`}><button type="button" aria-label="Vista de plano" aria-pressed={view === 'map'} onClick={() => setView('map')} className={`grid h-9 w-10 place-items-center rounded-lg ${view === 'map' ? 'bg-amber-300 text-slate-950' : ''}`}><LayoutGrid size={16} /></button><button type="button" aria-label="Vista de lista" aria-pressed={view === 'list'} onClick={() => setView('list')} className={`grid h-9 w-10 place-items-center rounded-lg ${view === 'list' ? 'bg-amber-300 text-slate-950' : ''}`}><List size={16} /></button></div></div>
      {view === 'map' ? <div ref={floorMapRef}><NightclubFloorCanvas zones={visibleZones} tables={visibleTables} layout={layout} accounts={data.accounts} selectedId={selectedId} zoom={zoom} isLight={isLight} editing={editing} onSelect={setSelectedId} onNudge={moveTable} onMove={(id, position) => { setSelectedId(id); setDraftLayout(current => ({ ...current, [id]: position })) }} /></div> : visibleTables.length ? <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3" data-tour="floor-list">{visibleTables.map(item => <button key={item.id} type="button" data-tour="floor-table" aria-pressed={selectedId === item.id} onClick={() => setSelectedId(item.id)} className={`flex min-h-16 items-center gap-3 rounded-xl border p-3 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-400 ${control} ${selectedId === item.id ? 'border-amber-400' : ''}`}><span className={`h-3 w-3 shrink-0 rounded-full ${statusColor[item.status]}`} /><span className="min-w-0 flex-1"><strong className="block truncate text-sm">{item.name}</strong><span className={`block truncate text-xs ${muted}`}>{zones.find(zone => zone.id === item.zoneId)?.name} · {item.capacity} plazas · {statusLabel[item.status]}</span></span>{item.activeAccountId && <span className="rounded-full border border-current px-2 py-1 text-[9px]">Cuenta</span>}</button>)}</div> : <p className={`rounded-xl border border-dashed p-6 text-center text-sm ${isLight ? 'border-slate-300 text-slate-500' : 'border-slate-600 text-slate-500'}`} data-tour="floor-list">{zones.length ? 'Esta zona todavía no tiene mesas.' : 'Todavía no hay zonas configuradas.'}</p>}
    </section>

    {table && <div className="fixed inset-0 z-50 bg-black/70" onClick={() => setSelectedId(null)}><aside role="dialog" aria-modal="true" aria-label={`Detalle de ${table.name}`} data-tutorial-target="floor-table-detail" className={`absolute inset-x-0 bottom-0 max-h-[88dvh] overflow-y-auto rounded-t-3xl border p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:inset-y-0 sm:left-auto sm:right-0 sm:w-full sm:max-w-md sm:rounded-none sm:rounded-l-2xl ${isLight ? 'border-slate-200 bg-white text-slate-900' : 'border-white/10 bg-[#07111a] text-white'}`} onClick={event => event.stopPropagation()}>
      <div className="flex items-start justify-between"><div><span className="text-xs font-bold uppercase text-amber-500">{data.zones.find(item => item.id === table.zoneId)?.name}</span><h2 className="mt-1 text-2xl font-semibold">{table.name}</h2><span className={`text-sm ${muted}`}>{statusLabel[table.status]} · capacidad {table.capacity}</span></div><button aria-label="Cerrar detalle" data-tutorial-target="floor-detail-close" onClick={() => setSelectedId(null)} className={`grid h-11 w-11 place-items-center rounded-xl border ${control}`}><X /></button></div>
      {reservation && <div className={`mt-5 rounded-xl border p-4 ${isLight ? 'border-amber-300 bg-amber-50' : 'border-amber-300/30 bg-amber-300/10'}`}><div className="flex items-start gap-3"><CalendarClock className="mt-0.5 text-amber-500" size={19} /><div><strong>{reservation.customerName}</strong><p className={`mt-1 flex flex-wrap gap-4 text-sm ${muted}`}>{reservation.reservationDate && <span className="flex items-center gap-1"><CalendarClock size={14} />{reservation.reservationDate}</span>}<span className="flex items-center gap-1"><Clock size={14} />{reservation.time}</span><span className="flex items-center gap-1"><Users size={14} />{reservation.guests} personas</span>{reservation.phone && <span>Tel: {reservation.phone}</span>}</p></div></div><div className="mt-4 grid grid-cols-2 gap-2"><button onClick={confirmArrival} disabled={data.shift?.status !== 'open'} className="min-h-11 rounded-lg bg-amber-300 px-3 text-xs font-bold text-slate-950 disabled:opacity-40"><Check className="mr-1 inline" size={14} />Confirmar llegada</button><button onClick={() => onCancelReservation?.(reservation.id)} className={`min-h-11 rounded-lg border px-3 text-xs font-bold ${control}`}>Cancelar reserva</button></div></div>}
      {account ? <div className="mt-5 space-y-4"><div className="grid grid-cols-3 gap-2"><Metric label="Consumido" value={money(account.subtotal)} isLight={isLight} /><Metric label="Pagado" value={money(nightclubPaidTotal(account))} isLight={isLight} /><Metric label="Saldo" value={money(nightclubBalance(account))} isLight={isLight} /></div><div><p className={`text-xs ${muted}`}>Cuenta activa</p><strong>{nightclubAccountLabel(account, data)}</strong><p className={`text-sm ${muted}`}>Mesero: {account.openedBy}</p></div>{onAssignCustomer && <label className={`block text-xs ${muted}`}><UserRound className="mr-1 inline" size={14} />Cliente asignado<select aria-label="Cliente asignado" value={account.customerId || ''} onChange={event => onAssignCustomer(account.id, event.target.value)} className={`mt-2 h-11 w-full rounded-xl border px-3 text-sm ${control}`}><option value="">Sin cliente</option>{data.customers.filter(customer => customer.active !== false).map(customer => <option key={customer.id} value={customer.id}>{customer.name}</option>)}</select></label>}<div className="space-y-2" data-tutorial-target="floor-rounds">{account.rounds.map(round => <div key={round.id} className={`rounded-xl border p-3 ${control}`}><div className="flex justify-between text-xs"><b>Ronda #{round.sequence}</b><span className={muted}>{round.status === 'pending' ? 'Pendiente' : round.status === 'preparing' ? 'En preparación' : round.status === 'ready' ? 'Lista' : round.status === 'delivered' ? 'Entregada' : 'Anulada'}</span></div><p className={`mt-1 text-xs ${muted}`}>{round.items.map(item => `${item.quantity}× ${item.name}`).join(' · ')}</p>{canDeliver && round.status === 'ready' && !!round.authorization && <button onClick={() => onDeliverRound(account.id, round.id)} className="mt-2 min-h-10 rounded-lg bg-emerald-500 px-3 text-xs font-bold text-white">Marcar entregado</button>}</div>)}</div><div className="flex flex-wrap gap-2"><button onClick={() => { onGoToPOS(account.id); setSelectedId(null) }} className="min-h-11 rounded-xl bg-amber-300 px-4 font-bold text-slate-950">Agregar ronda</button><button disabled={nightclubBalance(account) > 0 || account.rounds.some(round => round.status !== 'cancelled' && round.status !== 'delivered')} onClick={() => { onFinishAccount(account.id); setSelectedId(null) }} className={`min-h-11 rounded-xl border px-4 font-bold disabled:opacity-40 ${control}`}>Finalizar ocupación</button></div></div> : !reservation && <div className="mt-6"><p className={`text-sm ${muted}`}>La mesa está libre. Elige la acción que corresponde.</p><div className="mt-4 grid grid-cols-2 gap-2"><button disabled={table.status !== 'available' || data.shift?.status !== 'open' || opening} data-tutorial-target="floor-open-account" onClick={openTable} className="min-h-12 rounded-xl bg-amber-300 px-3 font-bold text-slate-950 disabled:opacity-40"><ReceiptText className="mr-1 inline" size={16} />{opening ? 'Abriendo cuenta...' : 'Abrir cuenta'}</button><button disabled={table.status !== 'available'} onClick={startReservation} className={`min-h-12 rounded-xl border px-3 font-bold disabled:opacity-40 ${control}`}><CalendarClock className="mr-1 inline" size={16} />Reservar</button></div>{data.shift?.status !== 'open' && <p className="mt-3 text-xs text-amber-600">Abre el turno en Caja para iniciar una cuenta.</p>}</div>}
    </aside></div>}

    {reserving && <div className="fixed inset-0 z-[60] grid place-items-center bg-black/75 p-4"><section role="dialog" aria-modal="true" aria-label="Nueva reserva" className={`w-full max-w-sm rounded-2xl border p-5 ${isLight ? 'border-slate-200 bg-white text-slate-900' : 'border-white/10 bg-[#0d1720] text-white'}`}><div className="flex items-start justify-between"><div><p className="text-xs font-bold uppercase text-amber-500">{table?.name}</p><h2 className="text-xl font-semibold">Registrar reserva</h2></div><button aria-label="Cerrar reserva" onClick={() => setReserving(false)} className={`grid h-10 w-10 place-items-center rounded-lg border ${control}`}><X size={17} /></button></div><div className="mt-5 space-y-3"><label className={`block text-xs ${muted}`}>Nombre<input autoFocus value={reservationDraft.customerName} onChange={event => setReservationDraft({ ...reservationDraft, customerName: event.target.value })} className={`mt-1 h-11 w-full rounded-xl border px-3 text-sm ${control}`} /></label><div className="grid grid-cols-2 gap-3"><label className={`block text-xs ${muted}`}>Fecha<input type="date" value={reservationDraft.reservationDate || ''} onChange={event => setReservationDraft({ ...reservationDraft, reservationDate: event.target.value })} className={`mt-1 h-11 w-full rounded-xl border px-3 text-sm ${control}`} /></label><label className={`block text-xs ${muted}`}>Hora<input type="time" value={reservationDraft.time} onChange={event => setReservationDraft({ ...reservationDraft, time: event.target.value })} className={`mt-1 h-11 w-full rounded-xl border px-3 text-sm ${control}`} /></label></div><div className="grid grid-cols-2 gap-3"><label className={`block text-xs ${muted}`}>Personas<NightclubNumberInput min={1} max={table?.capacity} value={reservationDraft.guests} onChange={guests => setReservationDraft({ ...reservationDraft, guests })} className={`mt-1 h-11 w-full rounded-xl border px-3 ${control}`} /></label><label className={`block text-xs ${muted}`}>Teléfono<input type="tel" placeholder="Opcional" value={reservationDraft.phone || ''} onChange={event => setReservationDraft({ ...reservationDraft, phone: event.target.value })} className={`mt-1 h-11 w-full rounded-xl border px-3 text-sm ${control}`} /></label></div><div className="flex gap-2 pt-2"><button onClick={() => setReserving(false)} className={`min-h-11 flex-1 rounded-xl border ${control}`}>Volver</button><button onClick={saveReservation} disabled={!reservationDraft.customerName.trim()} className="min-h-11 flex-1 rounded-xl bg-amber-300 font-bold text-slate-950 disabled:opacity-40">Confirmar</button></div></div></section></div>}
  </div>
}

function Metric({ label, value, isLight }: { label: string; value: string; isLight: boolean }) { return <div className={`rounded-xl border p-3 ${isLight ? 'border-slate-200 bg-slate-50' : 'border-white/10 bg-[#0d1720]'}`}><span className={`block text-[10px] ${isLight ? 'text-slate-500' : 'text-slate-500'}`}>{label}</span><strong className={`mt-1 block text-xs ${isLight ? 'text-slate-900' : 'text-white'}`}>{value}</strong></div> }
