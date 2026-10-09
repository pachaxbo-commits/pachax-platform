import { useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { NightclubDataset } from '../domain/nightclubAccounts'
import type { NightclubConsumptionDraft, NightclubPromoter, NightclubPromoterEvent, NightclubLoungeSale, NightclubLoungeSaleDraft, NightclubSaleDraft, NightclubTicketSale, NightclubRankingFilter } from '../domain/nightclubPromoters'
import { nightclubLoungeChangeHistory, nightclubLoungeReservationDate, nightclubReservableTables, nightclubPromoterConsumptionTotals, nightclubPromoterRanking } from '../domain/nightclubPromoters'

type Props = {
  data: NightclubDataset
  role: string
  canManageOverride?: boolean
  canSellOverride?: boolean
  onSaveEvent: (value: Pick<NightclubPromoterEvent, 'id' | 'name' | 'date' | 'status'>) => boolean
  onSavePromoter: (value: NightclubPromoter) => boolean
  onDeletePromoter: (id: string) => boolean
  onSaveSale: (value: NightclubSaleDraft) => boolean
  onSaveLoungeSale: (value: NightclubLoungeSaleDraft) => boolean
  onMarkLoungePaid: (id: string) => boolean
  onSaveConsumption: (value: NightclubConsumptionDraft) => boolean
}
const field = 'w-full min-h-11 rounded-xl border border-slate-700 bg-slate-950 p-3 text-sm text-white'
const action = 'min-h-10 rounded-xl bg-amber-300 px-4 py-2 text-sm font-bold text-slate-950 disabled:opacity-40'
const secondary = 'min-h-10 rounded-xl border border-slate-700 px-4 py-2 text-sm text-slate-100'
const money = (value: number) => 'Bs ' + value.toLocaleString('es-BO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const localDay = () => { const now = new Date(); return [now.getFullYear(), String(now.getMonth() + 1).padStart(2, '0'), String(now.getDate()).padStart(2, '0')].join('-') }
const saleStatus = { pending: 'Pendiente', paid: 'Pagada', cancelled: 'Anulada' }
const loungeStatus = { reserved: 'Reservado', paid: 'Pagado', cancelled: 'Cancelado' }
const consumptionKind = { courtesy: 'Cortesía asignada', own_purchase: 'Compra propia' }
const pageSize = 20

export function NightclubPromoters({ data, role, canManageOverride, canSellOverride, onSaveEvent, onSavePromoter, onDeletePromoter, onSaveSale, onSaveLoungeSale, onMarkLoungePaid, onSaveConsumption }: Props) {
  const canManage = canManageOverride ?? (role === 'owner' || role === 'admin')
  const canSell = canSellOverride ?? (canManage || role === 'cashier')
  const [tab, setTab] = useState<'directory' | 'ranking'>('directory')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(0)
  const [selectedId, setSelectedId] = useState('')
  const [promoterDraft, setPromoterDraft] = useState<NightclubPromoter | null>(null)
  const [saleDraft, setSaleDraft] = useState<NightclubSaleDraft | null>(null)
  const [loungeDraft, setLoungeDraft] = useState<NightclubLoungeSaleDraft | null>(null)
  const [loungeZoneId, setLoungeZoneId] = useState('')
  const [expandedLoungeHistoryId, setExpandedLoungeHistoryId] = useState('')
  const loungeInitial = useRef('')
  const [consumptionDraft, setConsumptionDraft] = useState<NightclubConsumptionDraft | null>(null)
  const [scope, setScope] = useState<NightclubRankingFilter['scope']>('month')
  const [periodDate, setPeriodDate] = useState(localDay())
  const [eventId, setEventId] = useState('')
  const [eventDraft, setEventDraft] = useState<Pick<NightclubPromoterEvent, 'id' | 'name' | 'date' | 'status'> | null>(null)
  const [sort, setSort] = useState<NonNullable<NightclubRankingFilter['sort']>>('tickets')
  const [showInactive, setShowInactive] = useState(true)
  const selected = (data.promoters || []).find(person => person.id === selectedId)
  const filter: NightclubRankingFilter = useMemo(() => ({ scope, date: periodDate, eventId, sort, search }), [scope, periodDate, eventId, sort, search])
  const ranked = useMemo(() => nightclubPromoterRanking(data, filter), [data, filter])
  const allRanked = useMemo(() => nightclubPromoterRanking(data, { scope: 'all', sort: 'tickets' }), [data])
  const directory = useMemo(() => (data.promoters || []).filter(person => (showInactive || person.active) && (person.name.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()) || person.phone.includes(search.trim()) || (person.document || '').toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()))).sort((a, b) => a.name.localeCompare(b.name)), [data.promoters, search, showInactive])
  const pages = Math.max(1, Math.ceil(directory.length / pageSize))
  const shown = directory.slice(Math.min(page, pages - 1) * pageSize, (Math.min(page, pages - 1) + 1) * pageSize)
  const events = (data.promoterEvents || []).slice().sort((a, b) => b.date.localeCompare(a.date) || a.name.localeCompare(b.name))
  const zones = data.zones.slice().sort((a, b) => a.sortOrder - b.sortOrder)
  const availableTables = loungeDraft ? nightclubReservableTables(data, loungeDraft.reservationDate, loungeDraft.id).filter(table => table.zoneId === loungeZoneId) : []
  const hasLegacySales = (data.promoterTicketSales || []).some(sale => !sale.eventId)
  const clearFilters = () => { setSearch(''); setScope('month'); setPeriodDate(localDay()); setEventId(''); setSort('tickets'); setShowInactive(true); setPage(0) }
  const changeTab = (value: 'directory' | 'ranking') => { setTab(value); setSelectedId(''); setPromoterDraft(null); setSaleDraft(null); setLoungeDraft(null); setConsumptionDraft(null) }
  const saveEvent = () => { if (eventDraft && onSaveEvent(eventDraft)) setEventDraft(null) }
  const sales = (data.promoterTicketSales || []).filter(sale => sale.promoterId === selectedId).slice().sort((a, b) => b.eventDate.localeCompare(a.eventDate) || b.createdAt.localeCompare(a.createdAt))
  const loungeSales = (data.promoterLoungeSales || []).filter(sale => sale.promoterId === selectedId).slice().sort((a, b) => nightclubLoungeReservationDate(b).localeCompare(nightclubLoungeReservationDate(a)) || b.createdAt.localeCompare(a.createdAt))
  const consumptions = (data.promoterConsumptions || []).filter(item => item.promoterId === selectedId).slice().sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt))
  const periodTotals = selected && scope !== 'event' ? nightclubPromoterConsumptionTotals(data, selected.id, filter) : null
  const allTotals = selected ? nightclubPromoterConsumptionTotals(data, selected.id, { scope: 'all' }) : null
  const selectedRank = selectedStatsTickets(allRanked, selectedId)
  const currentRank = selectedStatsTickets(ranked, selectedId)
  const selectedStats = allRanked.find(row => row.promoter.id === selectedId)
  const beginPromoter = (value?: NightclubPromoter) => setPromoterDraft(value ? { ...value } : { id: crypto.randomUUID(), name: '', phone: '', joinedAt: localDay(), active: true })
  const beginSale = (value?: NightclubTicketSale) => {
    if (!selected) return
    setSaleDraft(value ? { id: value.id, promoterId: selected.id, eventId: value.eventId, eventName: value.eventName, eventDate: value.eventDate, ticketType: value.ticketType, quantity: value.quantity, unitPrice: value.unitPrice, status: value.status, operationId: crypto.randomUUID(), correctionReason: '' } : { id: crypto.randomUUID(), promoterId: selected.id, eventId: '', eventName: '', eventDate: localDay(), ticketType: '', quantity: 1, unitPrice: 0, status: 'pending', operationId: crypto.randomUUID() })
  }
  const beginLoungeSale = (value?: NightclubLoungeSale) => {
    if (!selected) return
    const draft: NightclubLoungeSaleDraft = value
      ? { id: value.id, promoterId: selected.id, reservationDate: nightclubLoungeReservationDate(value), eventId: value.eventId, loungeId: value.loungeId, customerId: value.customerId, agreedPrice: value.agreedPrice, status: value.status, operationId: crypto.randomUUID(), correctionReason: '' }
      : { id: crypto.randomUUID(), promoterId: selected.id, reservationDate: localDay(), loungeId: '', customerId: '', agreedPrice: 0, status: 'reserved', operationId: crypto.randomUUID() }
    const zoneId = value ? data.tables.find(table => table.id === value.loungeId)?.zoneId || '' : ''
    loungeInitial.current = JSON.stringify({ draft, zoneId })
    setLoungeZoneId(zoneId)
    setLoungeDraft(draft)
  }
  const closeLounge = () => {
    if (loungeDraft && JSON.stringify({ draft: loungeDraft, zoneId: loungeZoneId }) !== loungeInitial.current && !window.confirm('Hay cambios sin guardar. ¿Cerrar el formulario?')) return
    setLoungeDraft(null)
  }
  const beginConsumption = () => { if (selected) setConsumptionDraft({ id: crypto.randomUUID(), promoterId: selected.id, date: localDay(), concept: '', amount: 0, kind: 'courtesy', notes: '' }) }
  const savePromoter = () => { if (promoterDraft && onSavePromoter(promoterDraft)) { setSelectedId(promoterDraft.id); setPromoterDraft(null) } }
  const saveSale = () => { if (saleDraft && onSaveSale(saleDraft)) setSaleDraft(null) }
  const saveLoungeSale = () => { if (loungeDraft && onSaveLoungeSale(loungeDraft)) setLoungeDraft(null) }
  const saveConsumption = () => { if (consumptionDraft && onSaveConsumption(consumptionDraft)) setConsumptionDraft(null) }

  return <div className="space-y-5">
    <header className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-2xl font-black">Relacionadores</h1><p className="text-sm text-slate-400">Equipo comercial, entradas y consumos administrativos.</p></div>{canManage && <button className={action} onClick={() => beginPromoter()}>+ Nuevo relacionador</button>}</header>
    <div className="flex flex-wrap gap-2"><button className={tab === 'directory' ? action : secondary} onClick={() => changeTab('directory')}>Directorio</button><button className={tab === 'ranking' ? action : secondary} onClick={() => changeTab('ranking')}>Ranking de ventas</button></div>
    <section className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2"><div><h2 className="font-bold">Jornadas y eventos</h2><p className="text-xs text-slate-400">Cada jornada tiene nombre, fecha e identificador propio. Las ventas antiguas permanecen sin asignar.</p></div>{canManage && <button className={secondary} onClick={() => setEventDraft({ id: crypto.randomUUID(), name: '', date: localDay(), status: 'planned' })}>+ Nueva jornada</button>}</div>
      <div className="mt-3 flex flex-wrap gap-2">{events.map(item => <div key={item.id} className="flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm"><span>{item.name} · {item.date} · {item.status === 'planned' ? 'Planificada' : item.status === 'open' ? 'Abierta' : 'Cerrada'}</span>{canManage && <button className="text-amber-300" onClick={() => setEventDraft({ id: item.id, name: item.name, date: item.date, status: item.status })}>Editar</button>}</div>)}{!events.length && <p className="text-sm text-slate-400">No hay jornadas creadas. Crea una para asociar nuevas ventas.</p>}</div>
    </section>
    <div className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <label className="text-xs text-slate-300">Buscar nombre, teléfono o documento<input className={field + ' mt-1'} aria-label="Buscar relacionadores" value={search} onChange={event => { setSearch(event.target.value); setPage(0) }} placeholder="Buscar..." /></label>
        {tab === 'ranking' && <label className="text-xs text-slate-300">Período<select className={field + ' mt-1'} aria-label="Período del ranking" value={scope} onChange={event => setScope(event.target.value as NightclubRankingFilter['scope'])}><option value="weekend">Fin de semana</option><option value="month">Mes</option><option value="event">Evento</option><option value="all">Histórico</option></select></label>}
        {tab === 'ranking' && (scope === 'weekend' || scope === 'month') && <label className="text-xs text-slate-300">Fecha de referencia<input className={field + ' mt-1'} type="date" aria-label="Fecha del período" value={periodDate} onChange={event => setPeriodDate(event.target.value || localDay())} /></label>}
        {tab === 'ranking' && scope === 'event' && <label className="text-xs text-slate-300">Jornada<select className={field + ' mt-1'} aria-label="Jornada del ranking" value={eventId} onChange={event => setEventId(event.target.value)}><option value="">Selecciona jornada</option>{events.map(item => <option key={item.id} value={item.id}>{item.name} · {item.date}</option>)}{hasLegacySales && <option value="__legacy__">Ventas anteriores sin jornada</option>}</select></label>}
        {tab === 'ranking' && <label className="text-xs text-slate-300">Ordenar por<select className={field + ' mt-1'} aria-label="Orden del ranking" value={sort} onChange={event => setSort(event.target.value as typeof sort)}><option value="tickets">Entradas vendidas</option><option value="lounges">Lounges pagados</option><option value="totalValue">Valor total de ventas</option></select></label>}
      </div><button className={secondary + ' mt-3'} onClick={clearFilters}>Limpiar filtros</button>
    </div>
    {tab === 'ranking' ? <section className="rounded-2xl border border-slate-800 bg-slate-900 p-4"><h2 className="mb-3 font-bold">Mejores vendedores</h2>{scope === 'event' && !eventId ? <p className="text-sm text-slate-400">Selecciona una jornada o «Ventas anteriores sin jornada» para ver el ranking.</p> : ranked.filter(row => row.tickets > 0 || row.lounges > 0).length ? <><div className="grid gap-3 md:grid-cols-3">{ranked.filter(row => row.tickets > 0 || row.lounges > 0).slice(0, 3).map((row, index) => <article key={row.promoter.id} className={'rounded-2xl border p-4 ' + (index === 0 ? 'border-amber-300 bg-amber-300/10' : 'border-slate-700 bg-slate-950')}><span className="text-2xl font-black text-amber-300">#{index + 1}</span><h3 className="mt-2 font-bold">{row.promoter.name}</h3><p className="mt-2 text-sm">{row.tickets} entradas pagadas · {row.lounges} lounges pagados</p><p className="text-sm font-bold">Valor de ventas: {money(row.totalValue)}</p><p className="text-xs text-slate-400">Entradas {money(row.entryValue)} · Lounges {money(row.loungeValue)}</p></article>)}</div><div className="mt-3 space-y-2">{ranked.filter(row => row.tickets > 0).slice(3).map((row, index) => <div key={row.promoter.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-700 bg-slate-950 p-3 text-sm"><span><b className="mr-2 text-amber-300">#{index + 4}</b>{row.promoter.name}{!row.promoter.active && <small className="ml-2 text-slate-400">Inactivo</small>}</span><span>{row.tickets} entradas · {row.lounges} lounges · Valor {money(row.totalValue)}</span></div>)}</div></> : <p className="text-sm text-slate-400">No hay entradas ni lounges pagados que coincidan con los filtros. Prueba otro período, jornada o limpia la búsqueda.</p>}<p className="mt-3 text-xs text-slate-400">Solo cuentan entradas y lounges pagados; reservas, pendientes y cancelaciones no suman. Valor vendido no equivale a dinero ingresado en Caja.</p></section> : <>
      <label className="flex items-center gap-2 text-sm text-slate-300"><input type="checkbox" checked={showInactive} onChange={event => { setShowInactive(event.target.checked); setPage(0) }} /> Mostrar inactivos</label>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{shown.map(person => { const row = allRanked.find(item => item.promoter.id === person.id); return <article key={person.id} className="rounded-2xl border border-slate-800 bg-slate-900 p-4"><div className="flex justify-between gap-2"><h2 className="font-bold">{person.name}</h2><span className={person.active ? 'text-xs text-emerald-300' : 'text-xs text-amber-300'}>{person.active ? 'Activo' : 'Inactivo'}</span></div><p className="mt-1 text-xs text-slate-400">{person.phone || 'Sin teléfono'} · Desde {person.joinedAt}</p><p className="mt-3 text-sm">{row?.tickets || 0} entradas · {row?.lounges || 0} lounges pagados · Valor {money(row?.totalValue || 0)}</p><button className={secondary + ' mt-3'} onClick={() => setSelectedId(person.id)}>Ver ficha</button></article> })}{!directory.length && <p className="text-sm text-slate-400">No hay relacionadores que coincidan con la búsqueda o el filtro de activos. Limpia los filtros para ver todos.</p>}</div>
      {directory.length > pageSize && <div className="flex items-center justify-center gap-3"><button className={secondary} disabled={page <= 0} onClick={() => setPage(value => value - 1)}>Anterior</button><span className="text-sm">Página {Math.min(page, pages - 1) + 1} de {pages}</span><button className={secondary} disabled={page >= pages - 1} onClick={() => setPage(value => value + 1)}>Siguiente</button></div>}
    </>}
    {tab === 'directory' && selected && <section className="rounded-2xl border border-slate-700 bg-slate-900 p-4"><div className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-700 bg-slate-900 p-3"><div><h2 className="text-xl font-bold">{selected.name}</h2><p className="text-xs text-slate-400">{selected.active ? 'Activo' : 'Inactivo'} · Incorporación: {selected.joinedAt}</p></div><button aria-label="Cerrar ficha" className={secondary} onClick={() => setSelectedId('')}>Cerrar ficha</button></div><div className="mt-4 grid gap-2 rounded-xl border border-slate-800 bg-slate-950 p-3 text-sm sm:grid-cols-3"><span>Teléfono: {selected.phone || 'No registrado'}</span><span>Documento: {selected.document || 'No registrado'}</span><span>Cumpleaños: {selected.birthday || 'No registrado'}</span></div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3"><Metric label="Entradas pagadas" value={String(selectedStats?.tickets || 0)} /><Metric label="Lounges pagados" value={String(selectedStats?.lounges || 0)} /><Metric label="Valor de entradas vendidas" value={money(selectedStats?.entryValue || 0)} /><Metric label="Valor total de ventas" value={money(selectedStats?.totalValue || 0)} /><Metric label="Ranking histórico" value={selectedRank ? '#' + selectedRank : 'Sin dato'} /><Metric label="Ranking del período" value={currentRank ? '#' + currentRank : 'Sin dato'} /></div>
      <div className="mt-3 grid gap-3 sm:grid-cols-2"><Metric label="Cortesías asignadas · período / histórico" value={(scope === 'event' ? 'No aplica' : money(periodTotals?.courtesy || 0)) + ' / ' + money(allTotals?.courtesy || 0)} /><Metric label="Compras propias · período / histórico" value={(scope === 'event' ? 'No aplica' : money(periodTotals?.ownPurchase || 0)) + ' / ' + money(allTotals?.ownPurchase || 0)} /></div>
      <div className="sticky bottom-0 z-10 mt-4 flex flex-wrap gap-2 rounded-xl border border-slate-700 bg-slate-900 p-3 shadow-xl">{canManage && <><button className={secondary} onClick={() => beginPromoter(selected)}>Editar datos</button><button className={secondary} onClick={() => onSavePromoter({ ...selected, active: !selected.active })}>{selected.active ? 'Desactivar' : 'Reactivar'}</button><button className={secondary + ' text-rose-300'} onClick={() => { if (window.confirm('¿Eliminar relacionador sin movimientos?')) { if (onDeletePromoter(selected.id)) setSelectedId('') } }}>Eliminar</button></>}{canSell && selected.active && <button className={action} onClick={() => beginSale()}>+ Venta de entradas</button>}{canSell && selected.active && <button className={action} onClick={() => beginLoungeSale()}>Vender / reservar lounge</button>}{canManage && selected.active && <button className={secondary} onClick={beginConsumption}>+ Consumo</button>}</div>
      <div className="mt-5 rounded-xl border border-slate-800 bg-slate-950 p-3"><h3 className="font-bold">Historial de lounges</h3>
        <div className="mt-2 max-h-80 space-y-2 overflow-y-auto">{loungeSales.map(item => <article key={item.id} className="rounded-xl border border-slate-700 bg-slate-900 p-3 text-sm">
          <div className="flex flex-wrap justify-between gap-2"><b>{item.loungeName}{item.eventName ? ' · ' + item.eventName : ''}</b><span>{loungeStatus[item.status]}</span></div>
          <p>Fecha de reserva: {nightclubLoungeReservationDate(item)} · Cliente: {item.customerName || 'Sin cliente asociado'} · Precio acordado: {money(item.agreedPrice)}</p>
          {item.eventName && <p className="text-xs text-slate-400">Jornada histórica: {item.eventName}</p>}
          <p className="text-xs text-slate-400">{item.corrections?.length || 0} cambios · Registró {item.createdBy}</p>
          <div className="mt-2 flex flex-wrap gap-3">
            {canSell && item.status === 'reserved' && <button className="text-xs font-bold text-emerald-300" onClick={() => onMarkLoungePaid(item.id)}>Marcar como pagado</button>}
            {canSell && <button className="text-xs text-amber-300" onClick={() => beginLoungeSale(item)}>Corregir / cancelar</button>}
            <button className="text-xs text-slate-200 underline" onClick={() => setExpandedLoungeHistoryId(expandedLoungeHistoryId === item.id ? '' : item.id)} aria-expanded={expandedLoungeHistoryId === item.id}>Ver historial de cambios</button>
          </div>
          {expandedLoungeHistoryId === item.id && <div className="mt-3 space-y-2 border-t border-slate-700 pt-3">
            {nightclubLoungeChangeHistory(item).map((change, index) => <div key={index} className="rounded-lg bg-slate-950 p-2 text-xs text-slate-300">
              <p>{new Date(change.at).toLocaleString('es-BO')} · {change.actor || 'Usuario no identificado'}</p>
              <p>{change.from ? loungeStatus[change.from] : 'Nuevo registro'} → {loungeStatus[change.to]}</p>
              {!change.fields.length && <p>Sin otros campos modificados</p>}
              {change.fields.map((field, fieldIndex) => <p key={fieldIndex}>{field}</p>)}
              {change.reason && <p>Motivo: {change.reason}</p>}
            </div>)}
          </div>}
        </article>)}{!loungeSales.length && <p className="text-sm text-slate-400">Sin lounges reservados o vendidos.</p>}</div>
      </div>
      <div className="mt-5 grid gap-5 xl:grid-cols-2"><div><h3 className="font-bold">Ventas de entradas</h3><div className="mt-2 max-h-80 space-y-2 overflow-y-auto">{sales.map(sale => <article key={sale.id} className="rounded-xl border border-slate-700 bg-slate-950 p-3 text-sm"><div className="flex justify-between gap-2"><b>{sale.eventName || sale.eventDate} · {sale.ticketType}</b><span>{saleStatus[sale.status]}</span></div><p>{sale.eventDate} · {sale.quantity} × {money(sale.unitPrice)} = {money(sale.total)}</p><p className="text-xs text-slate-400">{sale.corrections?.length || 0} correcciones · Registró {sale.createdBy}</p>{(sale.corrections || []).map((change, index) => <p key={index} className="mt-1 text-xs text-slate-400">{change.at.slice(0, 16)} · {change.actor}: {change.reason} (antes {saleStatus[change.previous.status]}, {money(change.previous.total)})</p>)}{canSell && <button className="mt-2 text-xs text-amber-300" onClick={() => beginSale(sale)}>Corregir</button>}</article>)}{!sales.length && <p className="text-sm text-slate-400">Sin ventas registradas.</p>}</div></div>
      <div><h3 className="font-bold">Consumos administrativos</h3><div className="mt-2 max-h-80 space-y-2 overflow-y-auto">{consumptions.map(item => <article key={item.id} className="rounded-xl border border-slate-700 bg-slate-950 p-3 text-sm"><div className="flex justify-between gap-2"><b>{item.concept}</b><span>{money(item.amount)}</span></div><p>{item.date} · {consumptionKind[item.kind]}</p>{item.notes && <p className="text-xs text-slate-400">{item.notes}</p>}</article>)}{!consumptions.length && <p className="text-sm text-slate-400">Sin consumos registrados.</p>}</div></div></div>
      <p className="mt-4 text-xs text-slate-400">Los consumos de esta ficha no modifican Caja, ventas, inventario ni cortesías operativas.</p>
    </section>}
    {promoterDraft && <Modal title={data.promoters?.some(item => item.id === promoterDraft.id) ? 'Editar relacionador' : 'Nuevo relacionador'} onClose={() => setPromoterDraft(null)}><div className="grid gap-3"><label className="text-xs">Nombre<input className={field + ' mt-1'} aria-label="Nombre del relacionador" value={promoterDraft.name} onChange={event => setPromoterDraft({ ...promoterDraft, name: event.target.value })} /></label><label className="text-xs">Teléfono<input className={field + ' mt-1'} aria-label="Teléfono del relacionador" value={promoterDraft.phone} onChange={event => setPromoterDraft({ ...promoterDraft, phone: event.target.value })} /></label><label className="text-xs">Cumpleaños opcional<input type="date" className={field + ' mt-1'} aria-label="Cumpleaños del relacionador" value={promoterDraft.birthday || ''} onChange={event => setPromoterDraft({ ...promoterDraft, birthday: event.target.value || undefined })} /></label><label className="text-xs">Documento opcional<input className={field + ' mt-1'} aria-label="Documento del relacionador" value={promoterDraft.document || ''} onChange={event => setPromoterDraft({ ...promoterDraft, document: event.target.value })} /></label><label className="text-xs">Fecha de incorporación<input type="date" className={field + ' mt-1'} aria-label="Fecha de incorporación" value={promoterDraft.joinedAt} onChange={event => setPromoterDraft({ ...promoterDraft, joinedAt: event.target.value })} /></label><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={promoterDraft.active} onChange={event => setPromoterDraft({ ...promoterDraft, active: event.target.checked })} /> Activo</label><button className={action} disabled={!promoterDraft.name.trim() || !promoterDraft.joinedAt} onClick={savePromoter}>Guardar relacionador</button></div></Modal>}
    {eventDraft && <Modal title={events.some(item => item.id === eventDraft.id) ? 'Editar jornada' : 'Nueva jornada'} onClose={() => setEventDraft(null)}><div className="grid gap-3"><label className="text-xs">Nombre<input className={field + ' mt-1'} aria-label="Nombre de jornada" value={eventDraft.name} onChange={event => setEventDraft({ ...eventDraft, name: event.target.value })} /></label><label className="text-xs">Fecha<input type="date" className={field + ' mt-1'} aria-label="Fecha de jornada" value={eventDraft.date} onChange={event => setEventDraft({ ...eventDraft, date: event.target.value })} /></label><label className="text-xs">Estado<select className={field + ' mt-1'} aria-label="Estado de jornada" value={eventDraft.status} onChange={event => setEventDraft({ ...eventDraft, status: event.target.value as NightclubPromoterEvent['status'] })}><option value="planned">Planificada</option><option value="open">Abierta</option><option value="closed">Cerrada</option></select></label><button className={action} disabled={!eventDraft.name.trim() || !eventDraft.date} onClick={saveEvent}>Guardar jornada</button></div></Modal>}
    {saleDraft && <Modal title={sales.some(item => item.id === saleDraft.id) ? 'Corregir venta' : 'Registrar venta'} onClose={() => setSaleDraft(null)}><div className="grid gap-3"><label className="text-xs">Jornada<select className={field + ' mt-1'} aria-label="Jornada de la venta" value={saleDraft.eventId || ''} onChange={event => { const linked = events.find(item => item.id === event.target.value); setSaleDraft({ ...saleDraft, eventId: linked?.id, eventName: linked?.name || saleDraft.eventName, eventDate: linked?.date || saleDraft.eventDate }) }}><option value="">{sales.some(item => item.id === saleDraft.id) ? 'Sin jornada (registro anterior)' : 'Selecciona una jornada'}</option>{events.filter(item => item.status !== 'closed' || item.id === saleDraft.eventId).map(item => <option key={item.id} value={item.id}>{item.name} · {item.date}</option>)}</select></label>{!saleDraft.eventId && sales.some(item => item.id === saleDraft.id) && <><p className="text-xs text-slate-400">Venta anterior sin jornada asignada. Puedes conservarla así o asociarla a una jornada real.</p><label className="text-xs">Evento anterior<input className={field + ' mt-1'} aria-label="Nombre histórico del evento" value={saleDraft.eventName || ''} onChange={event => setSaleDraft({ ...saleDraft, eventName: event.target.value })} /></label><label className="text-xs">Fecha anterior<input type="date" className={field + ' mt-1'} aria-label="Fecha histórica del evento" value={saleDraft.eventDate} onChange={event => setSaleDraft({ ...saleDraft, eventDate: event.target.value })} /></label></>}<label className="text-xs">Tipo de entrada<input className={field + ' mt-1'} aria-label="Tipo de entrada" value={saleDraft.ticketType} onChange={event => setSaleDraft({ ...saleDraft, ticketType: event.target.value })} /></label><div className="grid grid-cols-2 gap-2"><label className="text-xs">Cantidad<input type="number" min="1" step="1" className={field + ' mt-1'} aria-label="Cantidad de entradas" value={saleDraft.quantity} onChange={event => setSaleDraft({ ...saleDraft, quantity: Number(event.target.value) })} /></label><label className="text-xs">Precio unitario<input type="number" min="0" step="0.01" className={field + ' mt-1'} aria-label="Precio unitario" value={saleDraft.unitPrice} onChange={event => setSaleDraft({ ...saleDraft, unitPrice: Number(event.target.value) })} /></label></div><p className="text-sm font-bold">Total: {money(saleDraft.quantity * saleDraft.unitPrice)}</p><label className="text-xs">Estado<select className={field + ' mt-1'} aria-label="Estado de venta" value={saleDraft.status} onChange={event => setSaleDraft({ ...saleDraft, status: event.target.value as NightclubSaleDraft['status'] })}><option value="pending">Pendiente</option><option value="paid">Pagada</option><option value="cancelled">Anulada</option></select></label>{sales.some(item => item.id === saleDraft.id) && <label className="text-xs">Motivo de la corrección<input className={field + ' mt-1'} aria-label="Motivo de corrección" value={saleDraft.correctionReason || ''} onChange={event => setSaleDraft({ ...saleDraft, correctionReason: event.target.value })} /></label>}<p className="text-xs text-slate-400">Registro administrativo. Marcar Pagada no registra un cobro en Caja.</p><button className={action} disabled={!saleDraft.ticketType.trim() || (!saleDraft.eventId && !sales.some(item => item.id === saleDraft.id)) || !saleDraft.eventDate || (sales.some(item => item.id === saleDraft.id) && (saleDraft.correctionReason || '').trim().length < 4)} onClick={saveSale}>Guardar venta</button></div></Modal>}
    {loungeDraft && <Modal title={loungeSales.some(item => item.id === loungeDraft.id) ? 'Corregir lounge' : 'Vender / reservar lounge'} onClose={closeLounge} dismissOnBackdrop dismissOnEscape>
      <div className="grid gap-3">
        <label className="text-xs">Fecha de reserva
          <input type="date" className={field + ' mt-1'} aria-label="Fecha de reserva" value={loungeDraft.reservationDate} onChange={event => setLoungeDraft({ ...loungeDraft, reservationDate: event.target.value, loungeId: '' })} />
        </label>
        <label className="text-xs">Zona
          <select className={field + ' mt-1'} aria-label="Zona de la mesa" value={loungeZoneId} onChange={event => { setLoungeZoneId(event.target.value); setLoungeDraft({ ...loungeDraft, loungeId: '' }) }}>
            <option value="">Selecciona zona</option>
            {zones.map(zone => <option key={zone.id} value={zone.id}>{zone.name}</option>)}
          </select>
        </label>
        {!zones.length && <p className="text-xs text-amber-300">No hay zonas configuradas.</p>}
        <label className="text-xs">Mesa
          <select className={field + ' mt-1'} aria-label="Mesa disponible" value={loungeDraft.loungeId} onChange={event => setLoungeDraft({ ...loungeDraft, loungeId: event.target.value })} disabled={!loungeDraft.reservationDate || !loungeZoneId}>
            <option value="">Selecciona mesa</option>
            {availableTables.map(table => <option key={table.id} value={table.id}>{table.name}</option>)}
          </select>
        </label>
        {loungeDraft.reservationDate && loungeZoneId && !availableTables.length && <p className="text-xs text-amber-300">No hay mesas disponibles en esta zona para la fecha seleccionada.</p>}
        <label className="text-xs">Cliente comprador opcional
          <select className={field + ' mt-1'} aria-label="Cliente comprador" value={loungeDraft.customerId || ''} onChange={event => setLoungeDraft({ ...loungeDraft, customerId: event.target.value || undefined })}>
            <option value="">Sin cliente asociado</option>
            {data.customers.map(item => <option key={item.id} value={item.id}>{item.name}{item.phone ? ' · ' + item.phone : ''}</option>)}
          </select>
        </label>
        <label className="text-xs">Precio acordado<input type="number" min="0" step="0.01" className={field + ' mt-1'} aria-label="Precio acordado" value={loungeDraft.agreedPrice} onChange={event => setLoungeDraft({ ...loungeDraft, agreedPrice: Number(event.target.value) })} /></label>
        <label className="text-xs">Estado
          <select className={field + ' mt-1'} aria-label="Estado del lounge" value={loungeDraft.status} onChange={event => setLoungeDraft({ ...loungeDraft, status: event.target.value as NightclubLoungeSaleDraft['status'] })}>
            <option value="reserved">Reservado</option><option value="paid">Pagado</option><option value="cancelled">Cancelado</option>
          </select>
        </label>
        {loungeSales.some(item => item.id === loungeDraft.id) && <label className="text-xs">Motivo de corrección<input className={field + ' mt-1'} aria-label="Motivo de corrección del lounge" value={loungeDraft.correctionReason || ''} onChange={event => setLoungeDraft({ ...loungeDraft, correctionReason: event.target.value })} /></label>}
        <p className="text-xs text-slate-400">Registro comercial: no ocupa la mesa, no abre cuenta y no registra ingreso en Caja. El estado Pagado indica valor vendido; verifica el cobro por separado.</p>
        <button className={action} disabled={!loungeDraft.reservationDate || !loungeZoneId || !loungeDraft.loungeId || !Number.isFinite(loungeDraft.agreedPrice) || loungeDraft.agreedPrice < 0 || (loungeSales.some(item => item.id === loungeDraft.id) && (loungeDraft.correctionReason || '').trim().length < 4)} onClick={saveLoungeSale}>Guardar lounge</button>
      </div>
    </Modal>}
    {consumptionDraft && <Modal title="Registrar consumo" onClose={() => setConsumptionDraft(null)}><div className="grid gap-3"><label className="text-xs">Fecha<input type="date" className={field + ' mt-1'} aria-label="Fecha del consumo" value={consumptionDraft.date} onChange={event => setConsumptionDraft({ ...consumptionDraft, date: event.target.value })} /></label><label className="text-xs">Concepto<input className={field + ' mt-1'} aria-label="Concepto del consumo" value={consumptionDraft.concept} onChange={event => setConsumptionDraft({ ...consumptionDraft, concept: event.target.value })} /></label><label className="text-xs">Monto<input type="number" min="0" step="0.01" className={field + ' mt-1'} aria-label="Monto del consumo" value={consumptionDraft.amount} onChange={event => setConsumptionDraft({ ...consumptionDraft, amount: Number(event.target.value) })} /></label><label className="text-xs">Tipo<select className={field + ' mt-1'} aria-label="Tipo de consumo" value={consumptionDraft.kind} onChange={event => setConsumptionDraft({ ...consumptionDraft, kind: event.target.value as NightclubConsumptionDraft['kind'] })}><option value="courtesy">Cortesía asignada</option><option value="own_purchase">Compra propia</option></select></label><label className="text-xs">Observaciones<textarea className={field + ' mt-1'} aria-label="Observaciones del consumo" value={consumptionDraft.notes || ''} onChange={event => setConsumptionDraft({ ...consumptionDraft, notes: event.target.value })} /></label><button className={action} disabled={!consumptionDraft.date || !consumptionDraft.concept.trim()} onClick={saveConsumption}>Guardar consumo</button></div></Modal>}
  </div>
}
function selectedStatsTickets(rows: ReturnType<typeof nightclubPromoterRanking>, id: string) { const index = rows.findIndex(row => row.promoter.id === id && (row.tickets > 0 || row.lounges > 0)); return index + 1 }
function Metric({ label, value }: { label: string; value: string }) { return <div className="rounded-xl border border-slate-800 bg-slate-950 p-3"><small className="text-slate-400">{label}</small><strong className="mt-1 block text-lg">{value}</strong></div> }
function Modal({ title, onClose, children, dismissOnBackdrop = false, dismissOnEscape = false }: { title: string; onClose: () => void; children: ReactNode; dismissOnBackdrop?: boolean; dismissOnEscape?: boolean }) {
  useEffect(() => {
    if (!dismissOnEscape) return
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') { event.preventDefault(); onClose() } }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [dismissOnEscape, onClose])
  return <div className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-950/85 p-3 sm:p-6" onClick={event => { if (dismissOnBackdrop && event.target === event.currentTarget) onClose() }}><section role="dialog" aria-modal="true" aria-label={title} className="flex max-h-full min-h-0 w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl"><div className="flex shrink-0 items-center justify-between border-b border-slate-700 p-4"><h2 className="text-lg font-bold">{title}</h2><button className={secondary} aria-label="Cerrar formulario" onClick={onClose}>✕</button></div><div className="min-h-0 overflow-y-auto p-4">{children}</div></section></div>
}
