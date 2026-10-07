import { restaurantStorage } from './restaurantStorage'
import { useEffect, useState, type ComponentType } from 'react'
import { ArrowDownLeft, ArrowRight, ArrowUpRight, Banknote, CalendarClock, ChartNoAxesColumn, CircleAlert, CreditCard, Lock, MoreHorizontal, Pencil, Plus, Printer, ReceiptText, Search, Trash2, Unlock, Wallet } from 'lucide-react'
import { Modal } from '../../components/ui/Modal'
import { Field, NumberInput, SelectInput, TextArea, TextInput } from '../../components/ui/Form'
import { RESTAURANT_STAFF, type RestaurantTable } from '../mocks/restaurantMock'
import type { Order, Product } from '../../types'
import { calculateCashShiftSummary, closingDifference, type CashMovement, type CashMovementCategory, type CashMovementType } from '../../modules/restaurant/domain/cashEngine'
import { buildCashClosurePrintDocument } from '../../modules/restaurant/domain/cashPrint'
import { inventoryShiftRows, type InventoryCount, type InventoryMovement, type InventoryShiftSnapshot } from '../../modules/restaurant/domain/inventoryEngine'
import { RestaurantShiftInventory } from './RestaurantShiftInventory'

type Shift = { id: string; openedAt: string; openedBy: string; openingFloat: number; closedAt?: string; stockSnapshot?: InventoryShiftSnapshot; inventoryCounts?: Record<string, InventoryCount> }
const STORAGE = 'pachax:restaurant-demo:cash-movements:v1'
const money = (amount: number) => `Bs ${amount.toLocaleString('es-BO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const label: Record<CashMovementCategory, string> = { supply_purchase: 'Compra de insumos', worker_payment: 'Pago a trabajador', supplier_payment: 'Pago a proveedor', transport: 'Transporte', maintenance: 'Mantenimiento', services: 'Servicios', additional_cash: 'Ingreso adicional de efectivo', change_replenishment: 'Reposición de cambio', other: 'Otros' }
const categories: Record<CashMovementType, CashMovementCategory[]> = { expense: ['supply_purchase','worker_payment','supplier_payment','transport','maintenance','services','other'], income: ['additional_cash','change_replenishment','other'] }
const readStaff = () => { try { return JSON.parse(restaurantStorage.getItem('pachax:restaurant-demo:users:v1') || '') as typeof RESTAURANT_STAFF } catch { return RESTAURANT_STAFF } }
const read = (): CashMovement[] => { try { return JSON.parse(restaurantStorage.getItem(STORAGE) || '[]') as CashMovement[] } catch { return [] } }

export function RestaurantCash({ shift, orders, tables, products, stockMovements, userName, restaurantName, onStartShift, onCloseShift, onCountInventoryItem, onViewTables }: { shift: Shift | null; orders: Order[]; tables: RestaurantTable[]; products: Product[]; stockMovements: InventoryMovement[]; userName: string; restaurantName: string; onStartShift: (amount: number, at: string, by: string) => void; onCloseShift: (countedCash?: number) => boolean; onCountInventoryItem?: (productId: string, physical: number, note?: string) => void; onViewTables?: () => void }) {
  const [opening, setOpening] = useState(''), [movements, setMovements] = useState<CashMovement[]>(read), [editing, setEditing] = useState<CashMovement | null>(null), [removing, setRemoving] = useState<CashMovement | null>(null), [menu, setMenu] = useState<string | null>(null), [closing, setClosing] = useState(false), [counted, setCounted] = useState(''), [notice, setNotice] = useState('')
  const [filter, setFilter] = useState<'all' | CashMovementType>('all')
  const [search, setSearch] = useState('')
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 60_000); return () => window.clearInterval(timer) }, [])
  const blank = (): CashMovement => ({ id: '', shiftId: shift?.id || '', type: 'expense', category: 'supply_purchase', description: '', amount: 0, paymentMethod: 'cash', createdAt: new Date().toISOString(), createdBy: userName, note: '' })
  const [form, setForm] = useState<CashMovement>(blank)
  const save = (next: CashMovement[]) => { setMovements(next); restaurantStorage.setItem(STORAGE, JSON.stringify(next)) }
  const summary = shift ? calculateCashShiftSummary(shift.openingFloat, orders, shift.id, movements) : null
  const current = shift ? movements.filter(item => item.shiftId === shift.id).sort((a,b) => b.createdAt.localeCompare(a.createdAt)) : []
  const query = search.trim().toLocaleLowerCase('es-BO')
  const visible = current.filter(item => (filter === 'all' || item.type === filter) && (!query || [item.description, item.note, item.createdBy, label[item.category], item.type === 'income' ? 'ingreso entrada' : 'salida gasto'].some(value => value?.toLocaleLowerCase('es-BO').includes(query))))
  const paidOrders = shift ? orders.filter(order => order.shiftId === shift.id && order.paymentStatus === 'paid') : []
  const openedAt = shift ? Date.parse(shift.openedAt) : NaN
  const duration = Number.isFinite(openedAt) ? Math.max(0, Math.floor((now - openedAt) / 60_000)) : null
  const hourlySales = new Map<number, number>()
  for (const order of paidOrders) {
    if (order.payments?.length) {
      for (const payment of order.payments) {
        const at = Date.parse(payment.createdAt)
        if (Number.isFinite(at) && Number.isFinite(payment.amount)) {
          const hour = new Date(at).setMinutes(0, 0, 0)
          hourlySales.set(hour, (hourlySales.get(hour) || 0) + payment.amount)
        }
      }
    } else if (order.paidAt) {
      const at = Date.parse(order.paidAt)
      if (Number.isFinite(at)) {
        const hour = new Date(at).setMinutes(0, 0, 0)
        const amount = (order.payment?.cashAmount || 0) + (order.payment?.qrAmount || 0) + (order.payment?.cardAmount || 0)
        hourlySales.set(hour, (hourlySales.get(hour) || 0) + amount)
      }
    }
  }
  const hours = [...hourlySales.entries()].sort((a, b) => a[0] - b[0]).slice(-8)
  const maxHour = Math.max(...hours.map(([, amount]) => amount), 0)
  const openTables = tables.filter(table => table.activeOrderId && table.status !== 'available')
  const inventoryRows = shift ? inventoryShiftRows(products, shift.stockSnapshot || {}, stockMovements, shift.id, shift.inventoryCounts) : []
  const pendingInventory = inventoryRows.some(row => row.physical === undefined)
  const submit = () => { if (!shift || !form.description.trim() || !Number.isFinite(form.amount) || form.amount <= 0) { setNotice('Completa concepto y un monto mayor a cero.'); return }; const movement = { ...form, id: form.id || crypto.randomUUID(), shiftId: shift.id, createdAt: form.id ? form.createdAt : new Date().toISOString(), createdBy: form.id ? form.createdBy : userName }; save(form.id ? movements.map(item => item.id === movement.id ? movement : item) : [movement, ...movements]); setEditing(null); setNotice(form.id ? 'Movimiento actualizado correctamente.' : 'Movimiento registrado correctamente.') }
  const difference = summary && counted !== '' && Number.isFinite(Number(counted)) && Number(counted) >= 0 ? closingDifference(summary.expectedCash, Number(counted)) : null
  const printClosure = () => {
    if (!shift || !summary) return
    const popup = window.open('', 'pachax-cash-closure', 'width=420,height=720')
    if (!popup) { setNotice('Permite ventanas emergentes para imprimir el arqueo.'); return }
    popup.document.open()
    popup.document.write(buildCashClosurePrintDocument({ restaurantName, openedAt: shift.openedAt, openedBy: shift.openedBy, printedAt: new Date().toISOString(), openingFloat: shift.openingFloat, summary, countedCash: counted === '' ? undefined : Number(counted), difference, movements: current, inventoryRows }))
    popup.document.close()
    popup.focus()
    popup.print()
  }
  const close = () => {
    if (!shift || !summary || difference === null || openTables.length || pendingInventory) return
    if (!onCloseShift(Number(counted))) { setNotice('Completa el arqueo físico de inventario antes de cerrar.'); return }
    const closures = (() => { try { return JSON.parse(restaurantStorage.getItem(`${STORAGE}:closures`) || '[]') as unknown[] } catch { return [] } })()
    restaurantStorage.setItem(`${STORAGE}:closures`, JSON.stringify([{ shiftId: shift.id, closedAt: new Date().toISOString(), closedBy: userName, countedCash: Number(counted), difference, status: difference === 0 ? 'balanced' : difference < 0 ? 'shortage' : 'surplus', summary }, ...closures]))
    setClosing(false)
    setNotice(difference === 0 ? 'Turno cerrado. Caja cuadrada.' : `Turno cerrado con ${difference < 0 ? 'faltante' : 'sobrante'} de ${money(Math.abs(difference))}.`)
  }
  return <div className="mx-auto max-w-6xl space-y-5 pb-8 text-slate-900">
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <p className="mb-1 text-[11px] font-extrabold uppercase tracking-[0.18em] text-teal-700">Operación del turno</p>
        <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">Caja & Control de Turnos</h1>
        <p className="mt-1 text-sm text-slate-500">Ventas, movimientos y arqueo en un solo lugar.</p>
      </div>
      <span className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-extrabold ${shift ? 'bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200' : 'bg-slate-100 text-slate-700'}`}>
        {shift ? <Unlock size={14} /> : <Lock size={14} />}{shift ? 'Turno abierto' : 'Turno cerrado'}
      </span>
    </header>
    {notice && <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm font-semibold text-emerald-800">{notice}</p>}
    {shift && summary ? <>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1 border-y border-slate-200 py-3 text-sm text-slate-600">
        {duration !== null && <span className="inline-flex items-center gap-1.5"><CalendarClock size={15} />{Math.floor(duration / 60)} h {duration % 60} min de turno</span>}
        <span><strong className="tabular-nums text-slate-900">{paidOrders.length}</strong> ventas cobradas</span>
        {paidOrders.length > 0 && <span>Ticket promedio <strong className="tabular-nums text-slate-900">{money(summary.totalSales / paidOrders.length)}</strong></span>}
      </div>

      <section aria-labelledby="sales-heading" className="space-y-3">
        <SectionHeading id="sales-heading" eyebrow="01 / Ventas" title="Ventas del turno" />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Metric label="Total ventas" value={money(summary.totalSales)} icon={ChartNoAxesColumn} featured />
          <Metric label="Efectivo" value={money(summary.cashSales)} icon={Banknote} />
          <Metric label="QR" value={money(summary.qrSales)} icon={Wallet} />
          <Metric label="Tarjeta" value={money(summary.cardSales)} icon={CreditCard} />
        </div>
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
          <div className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
            <h3 className="text-sm font-bold">Ventas durante el turno</h3>
            <p className="mt-0.5 text-xs text-slate-500">Cobros registrados por hora · últimas 8 horas con ventas</p>
            {hours.length ? <div className="mt-5 flex h-36 items-end gap-2 sm:gap-3" role="img" aria-label={`Ventas por hora: ${hours.map(([hour, amount]) => `${new Date(hour).toLocaleTimeString('es-BO', { hour: '2-digit', minute: '2-digit' })}, ${money(amount)}`).join('; ')}`}>
              {hours.map(([hour, amount]) => <div key={hour} className="group flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-2" title={`${new Date(hour).toLocaleTimeString('es-BO', { hour: '2-digit', minute: '2-digit' })}: ${money(amount)}`}>
                <span className="hidden text-[10px] font-bold tabular-nums text-slate-600 group-hover:block sm:block">{money(amount)}</span>
                <div className="w-full max-w-14 rounded-t-md bg-teal-500/80 transition-colors group-hover:bg-teal-600" style={{ height: `${Math.max(8, maxHour > 0 ? (amount / maxHour) * 88 : 8)}px` }} />
                <span className="text-[10px] tabular-nums text-slate-500">{new Date(hour).toLocaleTimeString('es-BO', { hour: '2-digit', minute: '2-digit' })}</span>
              </div>)}
            </div> : <p className="mt-6 rounded-xl bg-slate-50 p-5 text-center text-sm text-slate-500">Aún no hay cobros con hora registrada en este turno.</p>}
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
            <h3 className="text-sm font-bold">Métodos de pago</h3>
            <p className="mt-0.5 text-xs text-slate-500">Distribución del total vendido</p>
            <div className="mt-5 space-y-4">
              {([['Efectivo', summary.cashSales, Banknote], ['QR', summary.qrSales, Wallet], ['Tarjeta', summary.cardSales, CreditCard]] as const).map(([name, amount, Icon]) => {
                const percent = summary.totalSales > 0 ? (amount / summary.totalSales) * 100 : 0
                return <div key={name}>
                  <div className="mb-1.5 flex items-center justify-between gap-2 text-xs"><span className="inline-flex items-center gap-2 font-semibold text-slate-700"><Icon size={14} />{name}</span><span className="tabular-nums text-slate-600">{money(amount)} <strong className="ml-1 text-slate-900">{Math.round(percent)}%</strong></span></div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-teal-500 transition-[width] duration-200" style={{ width: `${Math.max(0, Math.min(100, percent))}%` }} /></div>
                </div>
              })}
            </div>
          </div>
        </div>
      </section>

      <section aria-labelledby="cash-heading" className="space-y-3">
        <SectionHeading id="cash-heading" eyebrow="02 / Caja" title="Balance de efectivo" />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Metric label="Fondo inicial" value={money(shift.openingFloat)} icon={Wallet} />
          <Metric label="Entradas efectivo" value={money(summary.cashIncome)} icon={ArrowDownLeft} />
          <Metric label="Salidas efectivo" value={money(summary.cashOutflow)} icon={ArrowUpRight} />
          <Metric label="Gastos totales" value={money(summary.totalExpenses)} icon={ReceiptText} />
        </div>
        <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5 text-white sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-[11px] font-bold uppercase tracking-[0.16em] text-teal-300">Efectivo esperado en caja</p><strong className="mt-1 block text-3xl font-extrabold tabular-nums tracking-tight sm:text-4xl">{money(summary.expectedCash)}</strong></div><Wallet size={24} className="text-teal-300" /></div>
          <div className="mt-5 grid grid-cols-2 gap-x-4 gap-y-3 border-t border-white/15 pt-4 text-xs sm:grid-cols-4">
            <FormulaPart operator="" label="Fondo inicial" value={money(shift.openingFloat)} />
            <FormulaPart operator="+" label="Ventas efectivo" value={money(summary.cashSales)} />
            <FormulaPart operator="+" label="Entradas" value={money(summary.cashIncome)} />
            <FormulaPart operator="−" label="Salidas" value={money(summary.cashOutflow)} />
          </div>
        </div>
      </section>

      <section aria-labelledby="movements-heading" className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div><h2 id="movements-heading" className="text-base font-bold">Movimientos de caja</h2><p className="text-xs text-slate-500">Registros del turno, editables antes del cierre.</p></div>
          <button type="button" onClick={() => { setForm(blank()); setEditing(blank()) }} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-teal-500 px-4 text-sm font-bold text-slate-950 transition hover:bg-teal-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-600"><Plus size={16} />Registrar movimiento</button>
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-1 rounded-xl bg-slate-100 p-1" role="group" aria-label="Filtrar movimientos">
            {([['all', 'Todos'], ['income', 'Ingresos'], ['expense', 'Salidas / gastos']] as const).map(([value, name]) => <button key={value} type="button" onClick={() => setFilter(value)} aria-pressed={filter === value} className={`rounded-lg px-3 py-2 text-xs font-bold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-600 ${filter === value ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}>{name}</button>)}
          </div>
          <label className="relative block w-full sm:w-64"><Search size={16} className="pointer-events-none absolute left-3 top-3 text-slate-400" /><span className="sr-only">Buscar movimientos</span><input type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Buscar concepto o usuario" className="h-11 w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 text-sm outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-100" /></label>
        </div>
        {visible.length ? <>
          <div className="mt-4 hidden overflow-x-auto md:block"><table className="w-full min-w-[720px] text-left"><thead><tr className="border-b border-slate-200 text-[11px] uppercase tracking-wide text-slate-500"><th className="px-2 py-3">Hora</th><th className="px-2 py-3">Movimiento</th><th className="px-2 py-3">Concepto</th><th className="px-2 py-3 text-right">Monto</th><th className="px-2 py-3">Método</th><th className="px-2 py-3">Usuario</th><th className="px-2 py-3"><span className="sr-only">Acciones</span></th></tr></thead><tbody className="divide-y divide-slate-100">{visible.map(item => <tr key={item.id} className="text-sm transition-colors hover:bg-slate-50"><td className="whitespace-nowrap px-2 py-3 text-xs tabular-nums text-slate-500">{new Date(item.createdAt).toLocaleTimeString('es-BO', { hour: '2-digit', minute: '2-digit' })}</td><td className="px-2 py-3"><MovementBadge item={item} /></td><td className="min-w-40 px-2 py-3"><strong className="font-semibold">{item.description}</strong>{item.note && <span className="block text-xs text-slate-500">{item.note}</span>}</td><td className={`whitespace-nowrap px-2 py-3 text-right font-bold tabular-nums ${item.type === 'income' ? 'text-emerald-700' : 'text-rose-700'}`}>{item.type === 'income' ? '+' : '−'} {money(item.amount)}</td><td className="px-2 py-3 text-xs">{paymentLabel(item.paymentMethod)}</td><td className="px-2 py-3 text-xs">{item.createdBy}</td><td className="px-2 py-3"><MovementActions item={item} menu={menu} setMenu={setMenu} onEdit={() => { setForm(item); setEditing(item) }} onRemove={() => setRemoving(item)} /></td></tr>)}</tbody></table></div>
          <div className="mt-4 divide-y divide-slate-100 md:hidden">{visible.map(item => <div key={item.id} className="py-3 first:pt-0"><div className="flex items-start justify-between gap-2"><div className="min-w-0"><MovementBadge item={item} /><p className="mt-2 break-words text-sm font-semibold">{item.description}</p>{item.note && <p className="mt-0.5 break-words text-xs text-slate-500">{item.note}</p>}</div><div className="flex shrink-0 items-start gap-1"><strong className={`pt-1 text-sm tabular-nums ${item.type === 'income' ? 'text-emerald-700' : 'text-rose-700'}`}>{item.type === 'income' ? '+' : '−'} {money(item.amount)}</strong><MovementActions item={item} menu={menu} setMenu={setMenu} onEdit={() => { setForm(item); setEditing(item) }} onRemove={() => setRemoving(item)} /></div></div><p className="mt-2 text-xs text-slate-500">{new Date(item.createdAt).toLocaleTimeString('es-BO', { hour: '2-digit', minute: '2-digit' })} · {paymentLabel(item.paymentMethod)} · {item.createdBy}</p></div>)}</div>
        </> : <div className="mt-4 rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center"><ReceiptText size={23} className="mx-auto text-slate-400" /><p className="mt-2 text-sm font-semibold text-slate-700">{current.length ? 'No hay movimientos que coincidan con este filtro.' : 'No hay movimientos de caja en este turno.'}</p><p className="mt-1 text-xs text-slate-500">{current.length ? 'Prueba otro filtro o término de búsqueda.' : 'Los ingresos y gastos que registres aparecerán aquí.'}</p></div>}
      </section>

      <section aria-labelledby="close-heading" className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
        <SectionHeading id="close-heading" eyebrow="03 / Finalizar" title="Cierre del turno" />
        <p className="mt-1 text-sm text-slate-500">Revisa el resumen, cuenta el efectivo y confirma el arqueo al terminar.</p>
        {openTables.length > 0 && <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-amber-900" role="alert"><div className="flex items-start gap-2"><CircleAlert size={18} className="mt-0.5 shrink-0" /><div><strong className="text-sm">{openTables.length} {openTables.length === 1 ? 'cuenta abierta' : 'cuentas abiertas'}</strong><p className="text-xs">Cierra las mesas pendientes antes de realizar el arqueo.</p></div></div>{onViewTables && <button type="button" onClick={onViewTables} className="inline-flex items-center gap-1 text-xs font-bold underline underline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-600">Ver mesas pendientes <ArrowRight size={14} /></button>}</div>}
        <div className="mt-4 flex flex-wrap gap-2"><button type="button" onClick={printClosure} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 text-sm font-bold text-slate-800 transition hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-600"><Printer size={16} />Imprimir resumen de caja</button><button type="button" onClick={() => setClosing(true)} disabled={openTables.length > 0} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 text-sm font-bold text-white transition hover:bg-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-600 disabled:cursor-not-allowed disabled:opacity-40"><Lock size={15} />Arqueo y cierre de caja</button></div>
      </section>
    </> : <section className="rounded-2xl border border-slate-200 bg-white p-5"><p className="mb-4 text-sm text-slate-600">Debes iniciar un turno antes de realizar operaciones.</p><Field label="Fondo inicial / cambio en caja"><NumberInput min="0" value={opening} onChange={event => setOpening(event.target.value)} /></Field><button onClick={() => { const amount = Number(opening); if (Number.isFinite(amount) && amount >= 0) onStartShift(amount, new Date().toISOString(), userName) }} className="mt-3 w-full rounded-xl bg-teal-500 p-3 font-bold">Confirmar e iniciar turno</button></section>}
<Modal isOpen={!!editing} onClose={() => setEditing(null)} title={form.id ? 'Editar movimiento' : 'Registrar movimiento'} footer={<button onClick={submit} className="w-full rounded-xl bg-slate-900 p-3 font-bold text-white">Guardar movimiento</button>}><div className="grid gap-3"><Field label="Tipo"><SelectInput value={form.type} onChange={event => { const type = event.target.value as CashMovementType; setForm({ ...form, type, category: categories[type][0] }) }}><option value="expense">Salida / gasto</option><option value="income">Entrada</option></SelectInput></Field><Field label="Categoría"><SelectInput value={form.category} onChange={event => setForm({ ...form, category: event.target.value as CashMovementCategory })}>{categories[form.type].map(item => <option key={item} value={item}>{label[item]}</option>)}</SelectInput></Field>{form.category === 'worker_payment' && <Field label="Trabajador"><SelectInput value={form.workerId || ''} onChange={event => setForm({ ...form, workerId: event.target.value })}><option value="">Seleccionar trabajador</option>{readStaff().filter(worker => worker.active).map(worker => <option key={worker.id} value={worker.id}>{worker.name}</option>)}</SelectInput></Field>}<Field label="Concepto / descripción" required><TextInput value={form.description} onChange={event => setForm({ ...form, description: event.target.value })} placeholder={form.category === 'supply_purchase' ? 'Carne, papa, refrescos…' : 'Motivo del movimiento'} /></Field><div className="grid gap-3 sm:grid-cols-2"><Field label="Monto" required><NumberInput min="0.01" step="0.01" value={form.amount || ''} onChange={event => setForm({ ...form, amount: Number(event.target.value) })} /></Field><Field label="Método de pago"><SelectInput value={form.paymentMethod} onChange={event => setForm({ ...form, paymentMethod: event.target.value as CashMovement['paymentMethod'] })}><option value="cash">Efectivo de caja</option><option value="qr">QR</option><option value="card">Tarjeta</option><option value="other">Otro</option></SelectInput></Field></div>{form.category === 'supply_purchase' && <Field label="Proveedor (opcional)"><TextInput value={form.supplier || ''} onChange={event => setForm({ ...form, supplier: event.target.value })} /></Field>}<Field label="Observación (opcional)"><TextArea value={form.note || ''} onChange={event => setForm({ ...form, note: event.target.value })} /></Field></div></Modal><Modal isOpen={!!removing} onClose={() => setRemoving(null)} title="Eliminar movimiento" footer={<div className="grid grid-cols-2 gap-2"><button onClick={() => setRemoving(null)} className="rounded-xl border p-3 font-bold">Cancelar</button><button onClick={() => { if (removing) { save(movements.filter(item => item.id !== removing.id)); setRemoving(null); setNotice('Movimiento eliminado.') } }} className="rounded-xl bg-rose-700 p-3 font-bold text-white">Eliminar</button></div>}><p className="text-sm">¿Seguro que deseas eliminar este movimiento?</p></Modal><Modal isOpen={closing} onClose={() => setClosing(false)} title="Arqueo y cierre de caja" subtitle="Verifica el efectivo físico antes de confirmar." size="lg" footer={<div className="flex flex-wrap justify-end gap-2"><button type="button" onClick={() => setClosing(false)} className="min-h-11 rounded-xl border border-slate-300 px-4 text-sm font-bold">Cancelar</button><button type="button" onClick={printClosure} className="inline-flex min-h-11 items-center gap-1 rounded-xl border border-slate-300 px-4 text-sm font-bold"><Printer size={15} /> Imprimir</button><button type="button" disabled={difference === null || openTables.length > 0 || pendingInventory} onClick={close} className="min-h-11 rounded-xl bg-slate-900 px-4 text-sm font-bold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40">Confirmar cierre</button></div>}>
  <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4"><Line label="Fondo inicial" value={money(shift?.openingFloat || 0)} /><Line label="Ventas efectivo" value={money(summary?.cashSales || 0)} /><Line label="Ventas QR" value={money(summary?.qrSales || 0)} /><Line label="Ventas tarjeta" value={money(summary?.cardSales || 0)} /><Line label="Total ventas" value={money(summary?.totalSales || 0)} /><Line label="Entradas efectivo" value={money(summary?.cashIncome || 0)} /><Line label="Salidas efectivo" value={money(summary?.cashOutflow || 0)} /><Line label="Gastos totales" value={money(summary?.totalExpenses || 0)} /></div>
  <div className="mt-5 grid gap-2 sm:grid-cols-3">
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3"><p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Efectivo esperado</p><strong className="mt-1 block text-xl tabular-nums">{money(summary?.expectedCash || 0)}</strong></div>
    <div className="rounded-xl border border-slate-200 bg-white p-3"><Field label="Efectivo contado" required><NumberInput min="0" step="0.01" value={counted} onChange={event => setCounted(event.target.value)} placeholder="0,00" /></Field></div>
    <div className={`rounded-xl border p-3 ${difference === null ? 'border-slate-200 bg-slate-50' : difference === 0 ? 'border-emerald-200 bg-emerald-50 text-emerald-900' : difference < 0 ? 'border-rose-200 bg-rose-50 text-rose-900' : 'border-sky-200 bg-sky-50 text-sky-900'}`} aria-live="polite"><p className="text-[11px] font-bold uppercase tracking-wide">Diferencia · {difference === null ? 'Pendiente' : difference === 0 ? 'Exacto' : difference < 0 ? 'Faltante' : 'Sobrante'}</p><strong className="mt-1 block text-xl tabular-nums">{difference === null ? '—' : `${difference > 0 ? '+' : difference < 0 ? '−' : ''} ${money(Math.abs(difference))}`}</strong></div>
  </div>
  {openTables.length > 0 && <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900" role="alert">Hay {openTables.length} {openTables.length === 1 ? 'cuenta abierta' : 'cuentas abiertas'}. Cierra las mesas pendientes antes de confirmar.</div>}
  <RestaurantShiftInventory rows={inventoryRows} onCount={onCountInventoryItem} />
</Modal></div>
}
function SectionHeading({ id, eyebrow, title }: { id: string; eyebrow: string; title: string }) { return <div><p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-teal-700">{eyebrow}</p><h2 id={id} className="text-lg font-extrabold tracking-tight">{title}</h2></div> }
function Metric({ label, value, icon: Icon, featured = false }: { label: string; value: string; icon: ComponentType<{ size?: number; className?: string }>; featured?: boolean }) { return <div className={`rounded-2xl border p-4 transition-colors hover:border-teal-300 ${featured ? 'border-teal-200 bg-teal-50/60' : 'border-slate-200 bg-white'}`}><div className="flex items-center justify-between gap-2"><span className="text-[11px] font-bold uppercase tracking-wide text-slate-600">{label}</span><Icon size={17} className={featured ? 'text-teal-700' : 'text-slate-400'} /></div><strong className={`mt-2 block tabular-nums tracking-tight ${featured ? 'text-2xl' : 'text-xl'}`}>{value}</strong></div> }
function FormulaPart({ operator, label, value }: { operator: string; label: string; value: string }) { return <div className="flex items-start gap-2"><span className="w-3 shrink-0 font-bold text-teal-300">{operator}</span><div><span className="block text-slate-300">{label}</span><strong className="mt-1 block tabular-nums text-sm">{value}</strong></div></div> }
function paymentLabel(method: CashMovement['paymentMethod']) { return method === 'cash' ? 'Efectivo' : method === 'other' ? 'Otro' : method.toUpperCase() }
function MovementBadge({ item }: { item: CashMovement }) { return <span className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-bold ${item.type === 'income' ? 'bg-emerald-50 text-emerald-800' : 'bg-rose-50 text-rose-800'}`}>{item.type === 'income' ? <ArrowDownLeft size={12} /> : <ArrowUpRight size={12} />}{label[item.category]}</span> }
function MovementActions({ item, menu, setMenu, onEdit, onRemove }: { item: CashMovement; menu: string | null; setMenu: (id: string | null) => void; onEdit: () => void; onRemove: () => void }) { return <div className="relative"><button type="button" aria-label={`Acciones de ${item.description}`} aria-expanded={menu === item.id} onClick={() => setMenu(menu === item.id ? null : item.id)} className="rounded-lg p-2 transition hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-600"><MoreHorizontal size={16} /></button>{menu === item.id && <div className="absolute right-0 top-9 z-10 grid w-32 rounded-xl border border-slate-200 bg-white p-1 shadow-lg"><button type="button" onClick={() => { onEdit(); setMenu(null) }} className="flex items-center gap-2 rounded-lg p-2 text-left text-xs hover:bg-slate-50"><Pencil size={13} />Editar</button><button type="button" onClick={() => { onRemove(); setMenu(null) }} className="flex items-center gap-2 rounded-lg p-2 text-left text-xs text-rose-700 hover:bg-rose-50"><Trash2 size={13} />Eliminar</button></div>}</div> }
function Line({ label, value }: { label: string; value: string }) { return <div className="rounded-lg border p-3"><p className="text-xs text-slate-500">{label}</p><strong>{value}</strong></div> }
