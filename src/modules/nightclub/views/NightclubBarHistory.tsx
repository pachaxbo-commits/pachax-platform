import { useMemo, useState } from 'react'
import { Search, X } from 'lucide-react'
import type { NightclubDataset } from '../domain/nightclubAccounts'
import { nightclubAccountTableId, nightclubBalance, nightclubPaidTotal, normalizeNightclubRole } from '../domain/nightclubAccounts'
import type { NightclubHistoryFilters } from '../domain/nightclubHistory'
import { nightclubBusinessShifts, selectNightclubHistory } from '../domain/nightclubHistory'
import { NightclubShiftHistory } from './NightclubShiftHistory'
import { NightclubRefundDialog } from './NightclubRefundDialog'

const money = (value: number) => `Bs ${value.toLocaleString('es-BO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const when = (at: string) => new Date(at).toLocaleString('es-BO', { dateStyle: 'short', timeStyle: 'short' })
const initialFilters = (shiftId: string): NightclubHistoryFilters => ({ shiftId, from: '', to: '', query: '', table: '', waiter: '', product: '', category: '', paymentMethod: '', status: 'all', user: '' })

export function NightclubBarHistory({ data, role, actor, onRefundRound }: {
  data: NightclubDataset
  role: string
  actor: string
  onRefundRound: (accountId: string, roundId: string, reason: string) => boolean
}) {
  const [filters, setFilters] = useState<NightclubHistoryFilters>(() => initialFilters(data.shift?.id || 'all'))
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [view, setView] = useState<'accounts' | 'products' | 'shifts'>('accounts')
  const [refundTarget, setRefundTarget] = useState<{ accountId: string; roundId: string } | null>(null)
  const viewerRole = normalizeNightclubRole(role)
  const canSeePayments = viewerRole !== 'bar' && viewerRole !== 'inventory'
  const canRefund = viewerRole === 'owner' || viewerRole === 'admin'
  const shifts = nightclubBusinessShifts(data)
  const result = useMemo(() => selectNightclubHistory(data, filters, { role, actor }), [data, filters, role, actor])
  const selected = result.accounts.find(row => row.account.id === selectedId)
  const productOptions = [...new Map(data.accounts.flatMap(account => account.rounds.flatMap(batch => batch.items.map(item => [item.productId, item.name] as const)))).entries()]
  const categoryOptions = [...new Set(data.accounts.flatMap(account => account.rounds.flatMap(batch => batch.items.map(item => item.category).filter((category): category is string => !!category))))]
  const setFilter = (key: keyof NightclubHistoryFilters, value: string) => setFilters(previous => ({ ...previous, [key]: value }))
  const refund = (accountId: string, roundId: string) => setRefundTarget({ accountId, roundId })

  return <div className="space-y-4">
    <div className="flex flex-wrap gap-2">
      <button onClick={() => setView('accounts')} className={`h-10 rounded-full px-4 text-xs font-bold ${view === 'accounts' ? 'bg-amber-400 text-slate-950' : 'bg-slate-800'}`}>Mesas y pedidos en barra</button>
      <button onClick={() => setView('products')} className={`h-10 rounded-full px-4 text-xs font-bold ${view === 'products' ? 'bg-amber-400 text-slate-950' : 'bg-slate-800'}`}>Por producto</button>
      {canSeePayments && <button onClick={() => setView('shifts')} className={`h-10 rounded-full px-4 text-xs font-bold ${view === 'shifts' ? 'bg-amber-400 text-slate-950' : 'bg-slate-800'}`}>Cierres de turno</button>}
    </div>
    {view === 'shifts' ? <NightclubShiftHistory data={data} /> : <>
    <section className="grid gap-2 rounded-xl border border-slate-700 bg-[#121b20] p-3 sm:grid-cols-2 lg:grid-cols-4">
      <label className="text-xs text-slate-400">Jornada<select aria-label="Jornada comercial" value={filters.shiftId} onChange={event => setFilter('shiftId', event.target.value)} className="mt-1 h-10 w-full rounded-lg bg-slate-950 px-2 text-sm text-white"><option value="all">Todas las jornadas</option>{shifts.map(shift => <option key={shift.id} value={shift.id}>{when(shift.openedAt)} · {shift.status === 'open' ? 'Actual' : 'Cerrada'}</option>)}</select></label>
      <label className="text-xs text-slate-400">Desde<input aria-label="Desde fecha de jornada" type="date" value={filters.from} onChange={event => setFilter('from', event.target.value)} className="mt-1 h-10 w-full rounded-lg bg-slate-950 px-2 text-sm text-white" /></label>
      <label className="text-xs text-slate-400">Hasta<input aria-label="Hasta fecha de jornada" type="date" value={filters.to} onChange={event => setFilter('to', event.target.value)} className="mt-1 h-10 w-full rounded-lg bg-slate-950 px-2 text-sm text-white" /></label>
      <label className="text-xs text-slate-400">Estado<select aria-label="Estado histórico" value={filters.status} onChange={event => setFilter('status', event.target.value)} className="mt-1 h-10 w-full rounded-lg bg-slate-950 px-2 text-sm text-white"><option value="all">Todos</option><option value="open">Abierto</option><option value="closed">Cerrado</option><option value="courtesy">Con cortesía</option><option value="cancelled">Con anulación</option></select></label>
      <Filter label="Mesa o pedido" value={filters.table} onChange={value => setFilter('table', value)} />
      <Filter label="Mesero" value={filters.waiter} onChange={value => setFilter('waiter', value)} />
      <label className="text-xs text-slate-400">Producto<select aria-label="Producto histórico" value={filters.product} onChange={event => setFilter('product', event.target.value)} className="mt-1 h-10 w-full rounded-lg bg-slate-950 px-2 text-sm text-white"><option value="">Todos</option>{productOptions.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>
      <label className="text-xs text-slate-400">Categoría<select aria-label="Categoría histórica" value={filters.category} onChange={event => setFilter('category', event.target.value)} className="mt-1 h-10 w-full rounded-lg bg-slate-950 px-2 text-sm text-white"><option value="">Todas</option>{categoryOptions.map(category => <option key={category}>{category}</option>)}</select></label>
      {canSeePayments && <label className="text-xs text-slate-400">Pago<select aria-label="Método de pago histórico" value={filters.paymentMethod} onChange={event => setFilter('paymentMethod', event.target.value)} className="mt-1 h-10 w-full rounded-lg bg-slate-950 px-2 text-sm text-white"><option value="">Todos</option><option value="cash">Efectivo</option><option value="qr">QR</option><option value="card">Tarjeta</option><option value="mixed">Mixto</option></select></label>}
      <Filter label="Usuario que registró" value={filters.user} onChange={value => setFilter('user', value)} />
      <label className="flex items-center gap-2 rounded-lg bg-slate-950 px-3 sm:col-span-2"><Search size={16} className="text-slate-400" /><input aria-label="Buscar historial" value={filters.query} onChange={event => setFilter('query', event.target.value)} placeholder="Buscar mesa, producto, usuario…" className="h-10 min-w-0 flex-1 bg-transparent text-sm outline-none" /></label>
    </section>
    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
      <Metric label="Ventas cobradas" value={canSeePayments ? money(result.summary.salesTotal) : '—'} />
      <Metric label="Mesas atendidas" value={String(result.summary.tablesServed)} />
      <Metric label="Mesas abiertas" value={String(result.summary.openTables)} />
      <Metric label="Productos vendidos" value={`${result.summary.productsSold} u.`} />
      <Metric label="Cortesías" value={canSeePayments ? money(result.summary.courtesyValue) : '—'} />
      <Metric label="Anulaciones" value={canSeePayments ? money(result.summary.cancelledValue) : '—'} />
      <Metric label="Ticket promedio" value={canSeePayments ? money(result.summary.averageTicket) : '—'} />
      <Metric label="Saldo pendiente" value={canSeePayments ? money(result.summary.pendingTotal) : '—'} />
    </div>
    {view === 'accounts' ? <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">{result.accounts.map(row => <button key={row.account.id} onClick={() => setSelectedId(row.account.id)} className="rounded-xl border border-slate-700 bg-[#121b20] p-4 text-left hover:border-amber-400"><strong className="block text-base">{row.label}</strong><span className="mt-1 block text-xs text-slate-400">{when(row.account.openedAt)} · {row.account.rounds.length} ronda(s) · {row.account.status === 'closed' ? 'Cerrado' : 'Abierto'}</span>{canSeePayments && <span className="mt-2 block text-sm text-emerald-300">Pagado {money(nightclubPaidTotal(row.account))}</span>}</button>)}{!result.accounts.length && <p className="rounded-xl border border-dashed border-slate-700 p-5 text-sm text-slate-400">No hay pedidos para estos filtros.</p>}</div> : <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">{result.productLocations.map(item => <article key={item.productId} className="rounded-xl border border-slate-700 bg-[#121b20] p-4"><strong>{item.name}</strong><span className="ml-2 text-amber-300">{item.quantity} u.</span><p className="mt-2 text-xs text-slate-400">{item.places.map(place => `${place.label}: ${place.quantity}`).join(' · ')}</p></article>)}{!result.productLocations.length && <p className="rounded-xl border border-dashed border-slate-700 p-5 text-sm text-slate-400">Sin productos para estos filtros.</p>}</div>}
    {selected && <div className="fixed inset-0 z-50 bg-black/65" onClick={() => setSelectedId(null)}><aside role="dialog" aria-modal="true" aria-label={`Historial de ${selected.label}`} className="absolute inset-y-0 right-0 w-full max-w-2xl overflow-y-auto border-l border-slate-700 bg-[#10191e] p-4 pb-20 sm:p-6" onClick={event => event.stopPropagation()}><div className="flex items-start justify-between gap-2"><div><span className="text-xs font-bold uppercase text-amber-300">Historial auditable</span><h2 className="text-2xl font-black">{selected.label}</h2><p className="text-sm text-slate-400">{selected.account.status === 'closed' ? 'Cerrado' : 'Abierto'} · Jornada {selected.shift ? when(selected.shift.openedAt) : 'sin identificar'}</p></div><button aria-label="Cerrar historial" onClick={() => setSelectedId(null)} className="grid h-11 w-11 place-items-center rounded-xl border border-slate-700"><X size={18} /></button></div>
      <div className="mt-4 grid grid-cols-2 gap-2 text-sm sm:grid-cols-3"><Detail label="Tipo" value={nightclubAccountTableId(selected.account) ? 'Mesa' : 'Venta directa en Barra'} /><Detail label="Apertura" value={when(selected.account.openedAt)} /><Detail label="Cierre" value={selected.account.paidAt ? when(selected.account.paidAt) : 'Todavía abierto'} /><Detail label="Mesero" value={selected.account.waiterName || selected.account.openedBy} /><Detail label="Cliente" value={data.customers.find(item => item.id === selected.account.customerId)?.name || selected.account.customerDisplayName || 'Sin cliente'} />{canSeePayments && <><Detail label="Consumo" value={money(selected.account.subtotal)} /><Detail label="Pagado" value={money(nightclubPaidTotal(selected.account))} /><Detail label="Saldo" value={money(nightclubBalance(selected.account))} /><Detail label="Métodos" value={(selected.account.payments || (selected.account.payment ? [selected.account.payment] : [])).map(payment => payment.method.toUpperCase()).join(' + ') || 'Sin pagos'} /></>}</div>
      <h3 className="mt-6 text-sm font-bold uppercase tracking-wider text-slate-300">Rondas</h3><div className="mt-2 space-y-2">{selected.account.rounds.map(batch => <div key={batch.id} className="rounded-lg bg-slate-900 p-3 text-sm"><div className="flex justify-between gap-2"><strong>#{batch.sequence} · {batch.authorization === 'courtesy' ? 'Cortesía' : batch.authorization === 'payment' ? 'Pagado' : 'Cargado a cuenta'}</strong><span>{batch.status}</span></div><p className="mt-1 text-xs text-slate-400">{batch.items.map(item => `${item.quantity}× ${item.name}`).join(' · ')}</p>{canRefund && batch.authorization === 'payment' && batch.status !== 'cancelled' && batch.status !== 'delivered' && <button onClick={() => refund(selected.account.id, batch.id)} className="mt-2 rounded-lg border border-amber-400 px-3 py-2 text-xs font-bold text-amber-200">Reembolsar ronda</button>}</div>)}</div>
      <h3 className="mt-6 text-sm font-bold uppercase tracking-wider text-slate-300">Cronología</h3><ol className="mt-3 space-y-2 border-l border-slate-700 pl-4">{selected.entries.filter(entry => canSeePayments || entry.type !== 'payment' && entry.type !== 'refund').filter(entry => viewerRole !== 'bar' || !entry.productId || entry.preparationArea === 'Barra').map(entry => <li key={entry.id} className="relative rounded-lg bg-slate-900 p-3 before:absolute before:-left-[21px] before:top-5 before:h-2 before:w-2 before:rounded-full before:bg-amber-400"><span className="text-[11px] text-slate-400">{when(entry.at)} · {entry.actor}</span><strong className="mt-1 block text-sm">{entry.text}{entry.productName ? ` · ${entry.quantity}× ${entry.productName}` : ''}</strong>{entry.reason && <p className="mt-1 text-xs text-slate-400">Motivo: {entry.reason}</p>}{entry.amount !== undefined && canSeePayments && <span className="mt-1 block text-xs text-emerald-300">{money(entry.amount)}</span>}</li>)}</ol>
    </aside></div>}
    {refundTarget && <NightclubRefundDialog onCancel={() => setRefundTarget(null)} onConfirm={reason => { onRefundRound(refundTarget.accountId, refundTarget.roundId, reason); setRefundTarget(null) }} />}
    </>}
  </div>
}

function Filter({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) { return <label className="text-xs text-slate-400">{label}<input value={value} onChange={event => onChange(event.target.value)} className="mt-1 h-10 w-full rounded-lg bg-slate-950 px-2 text-sm text-white" /></label> }
function Metric({ label, value }: { label: string; value: string }) { return <div className="rounded-xl border border-slate-700 bg-[#121b20] p-3"><span className="text-xs text-slate-400">{label}</span><strong className="mt-1 block text-xl">{value}</strong></div> }
function Detail({ label, value }: { label: string; value: string }) { return <div className="rounded-lg bg-slate-900 p-2"><span className="block text-[11px] text-slate-400">{label}</span><strong>{value}</strong></div> }
