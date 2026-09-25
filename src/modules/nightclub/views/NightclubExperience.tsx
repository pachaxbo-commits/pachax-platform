import { useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { BarChart3, Boxes, ChevronRight, CircleDollarSign, ClipboardList, GlassWater, LayoutGrid, LogOut, Music2, Plus, ReceiptText, Sparkles, Users, Wine } from 'lucide-react'
import type { NightclubDataset, NightclubRoundDraft } from '../domain/nightclubAccounts'

type NightclubModule = 'dashboard' | 'floor' | 'pos' | 'accounts' | 'bar' | 'inventory' | 'products' | 'cash' | 'history' | 'customers' | 'users' | 'reports' | 'settings'

const modules: Array<{ id: NightclubModule; label: string; icon: typeof Music2 }> = [
  { id: 'dashboard', label: 'Inicio', icon: BarChart3 },
  { id: 'floor', label: 'Salón', icon: LayoutGrid },
  { id: 'pos', label: 'POS rápido', icon: CircleDollarSign },
  { id: 'accounts', label: 'Cuentas abiertas', icon: ReceiptText },
  { id: 'bar', label: 'Barra / preparación', icon: GlassWater },
  { id: 'inventory', label: 'Inventario', icon: Boxes },
  { id: 'products', label: 'Productos', icon: Wine },
  { id: 'cash', label: 'Caja', icon: ClipboardList },
  { id: 'history', label: 'Historial', icon: ReceiptText },
  { id: 'customers', label: 'Clientes', icon: Users },
  { id: 'users', label: 'Usuarios', icon: Users },
  { id: 'reports', label: 'Reportes', icon: BarChart3 },
  { id: 'settings', label: 'Configuración', icon: Sparkles },
]

const money = (value: number) => `Bs ${value.toFixed(2)}`

export function NightclubExperience({
  companyName,
  logoUrl,
  userName,
  role,
  data,
  onOpenAccount,
  onAddRound,
  onRequestBill,
  onCloseAccount,
  onStartShift,
  onSignOut,
}: {
  companyName: string
  logoUrl?: string
  userName: string
  role: string
  data: NightclubDataset
  onOpenAccount: (tableId: string) => void
  onAddRound: (accountId: string, items: NightclubRoundDraft[]) => void
  onRequestBill: (accountId: string) => void
  onCloseAccount: (accountId: string) => void
  onStartShift: (openingFloat: number) => void
  onSignOut?: () => void | Promise<void>
}) {
  const [activeModule, setActiveModule] = useState<NightclubModule>('dashboard')
  const [selectedTableId, setSelectedTableId] = useState(() => data.tables.find(table => table.activeAccountId)?.id || data.tables[0]?.id || '')
  const [notice, setNotice] = useState('')
  const activeAccounts = data.accounts.filter(account => account.status !== 'closed')
  const barRounds = activeAccounts.flatMap(account => account.rounds.map(round => ({ ...round, account, table: data.tables.find(table => table.id === account.tableId) }))).filter(round => round.status !== 'ready')
  const sales = data.accounts.filter(account => account.status === 'closed').reduce((sum, account) => sum + account.subtotal, 0)
  const selectedTable = data.tables.find(table => table.id === selectedTableId)
  const selectedAccount = data.accounts.find(account => account.id === selectedTable?.activeAccountId && account.status !== 'closed')
  const groupedTables = useMemo(() => data.zones.map(zone => ({ zone, tables: data.tables.filter(table => table.zoneId === zone.id) })), [data.zones, data.tables])

  const run = (action: () => void, message: string) => {
    try { action(); setNotice(message) } catch (error) { setNotice(error instanceof Error ? error.message : 'No se pudo completar la acción.') }
  }

  const addProduct = (productId: string) => {
    if (!selectedTable) return setNotice('Selecciona una mesa.')
    if (!selectedAccount) return setNotice('Abre la cuenta de la mesa antes de agregar una ronda.')
    run(() => onAddRound(selectedAccount.id, [{ productId, quantity: 1 }]), 'Nueva ronda enviada a barra.')
  }

  return <div className="min-h-screen bg-slate-950 text-slate-100">
    <header className="sticky top-0 z-30 flex min-h-16 items-center justify-between border-b border-purple-500/20 bg-slate-950/95 px-4 backdrop-blur md:px-6">
      <div className="flex items-center gap-3">{logoUrl ? <img src={logoUrl} alt="" className="h-9 w-9 rounded-xl object-cover" /> : <span className="grid h-9 w-9 place-items-center rounded-xl bg-purple-500 text-white"><Music2 size={19} /></span>}<div><strong className="block text-sm">{companyName}</strong><span className="text-[11px] text-purple-300">Club nocturno / Lounge</span></div></div>
      <div className="flex items-center gap-3 text-right"><div><strong className="block text-xs">{userName}</strong><span className="text-[10px] uppercase text-slate-400">{role}</span></div>{onSignOut && <button onClick={() => void onSignOut()} aria-label="Cerrar sesión" className="rounded-xl border border-slate-700 p-2 text-slate-300 hover:bg-slate-800"><LogOut size={16} /></button>}</div>
    </header>
    <div className="mx-auto flex max-w-[1600px]">
      <aside className="sticky top-16 hidden h-[calc(100vh-4rem)] w-60 shrink-0 border-r border-slate-800 bg-slate-950 p-3 md:block"><nav className="space-y-1">{modules.map(item => <button key={item.id} onClick={() => setActiveModule(item.id)} className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-semibold ${activeModule === item.id ? 'bg-purple-500 text-white' : 'text-slate-400 hover:bg-slate-900 hover:text-white'}`}><item.icon size={17} />{item.label}</button>)}</nav></aside>
      <main className="min-w-0 flex-1 p-4 pb-24 sm:p-6 md:pb-6">
        {notice && <button type="button" onClick={() => setNotice('')} className="mb-4 w-full rounded-xl border border-purple-400/30 bg-purple-500/10 p-3 text-left text-sm text-purple-100">{notice}</button>}
        {activeModule === 'dashboard' && <div className="space-y-6"><Title title="Operación nocturna" subtitle="Salón, cuentas, barra y caja en una sola vista." /><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><Metric label="Cuentas abiertas" value={String(activeAccounts.length)} /><Metric label="Mesas ocupadas" value={String(data.tables.filter(table => table.status === 'occupied' || table.status === 'bill_requested').length)} /><Metric label="Rondas en barra" value={String(barRounds.length)} /><Metric label="Subtotal abierto" value={money(activeAccounts.reduce((sum, account) => sum + account.subtotal, 0))} /></div><section className="grid gap-4 lg:grid-cols-2"><Panel title="Zonas"><div className="grid grid-cols-2 gap-2 sm:grid-cols-3">{groupedTables.map(({ zone, tables }) => <button key={zone.id} onClick={() => setActiveModule('floor')} className="rounded-xl border border-slate-800 bg-slate-900 p-3 text-left"><strong className="text-sm">{zone.name}</strong><span className="mt-1 block text-xs text-slate-400">{tables.filter(table => table.status !== 'available').length}/{tables.length} en uso</span></button>)}</div></Panel><Panel title="Barra / preparación"><div className="space-y-2">{barRounds.slice(0, 5).map(round => <div key={round.id} className="flex justify-between rounded-xl bg-slate-900 p-3 text-sm"><span>{round.table?.name} · Ronda #{round.sequence}</span><strong className="text-amber-300">{round.status === 'pending' ? 'Pendiente' : 'Preparando'}</strong></div>)}{!barRounds.length && <Empty text="No hay rondas pendientes." />}</div></Panel></section></div>}
        {activeModule === 'floor' && <div className="space-y-6"><Title title="Salón, VIP y reservados" subtitle="Las cuentas se vinculan siempre mediante tableId." />{groupedTables.map(({ zone, tables }) => <section key={zone.id}><h2 className="mb-3 text-sm font-bold uppercase tracking-wider text-purple-300">{zone.name}</h2><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{tables.map(table => { const account = data.accounts.find(item => item.id === table.activeAccountId && item.status !== 'closed'); return <button key={table.id} onClick={() => { setSelectedTableId(table.id); setActiveModule('pos') }} className={`rounded-2xl border p-4 text-left ${table.status === 'available' ? 'border-emerald-800 bg-emerald-950/20' : table.status === 'reserved' ? 'border-indigo-700 bg-indigo-950/30' : table.status === 'bill_requested' ? 'border-amber-500 bg-amber-950/30' : 'border-purple-600 bg-purple-950/30'}`}><span className="text-[10px] font-bold uppercase text-slate-400">{table.status === 'available' ? 'Libre' : table.status === 'reserved' ? 'Reservada' : table.status === 'bill_requested' ? 'Cuenta solicitada' : 'Ocupada'}</span><strong className="mt-1 block text-lg">{table.name}</strong><span className="text-xs text-slate-400">{zone.name} · {table.capacity} personas</span>{account && <strong className="mt-3 block text-purple-200">{money(account.subtotal)} · {account.rounds.length} rondas</strong>}{table.reservationName && <span className="mt-2 block text-xs text-indigo-200">{table.reservationName}</span>}</button> })}</div></section>)}</div>}
        {activeModule === 'pos' && <div className="space-y-5"><Title title="POS rápido" subtitle="Selecciona una entidad de mesa; no se aceptan nombres escritos manualmente." /><div className="grid gap-5 lg:grid-cols-[300px_1fr]"><Panel title="Mesa / cuenta"><select aria-label="Mesa del POS" value={selectedTableId} onChange={event => setSelectedTableId(event.target.value)} className="w-full rounded-xl border border-slate-700 bg-slate-900 p-3 text-sm">{data.tables.map(table => <option key={table.id} value={table.id}>{table.name} · {data.zones.find(zone => zone.id === table.zoneId)?.name} · {table.status === 'available' ? 'Libre' : table.status === 'reserved' ? 'Reservada' : 'Ocupada'}{table.activeAccountId ? ` · ${money(data.accounts.find(account => account.id === table.activeAccountId)?.subtotal || 0)}` : ''}</option>)}</select>{selectedTable && !selectedAccount && <button onClick={() => run(() => onOpenAccount(selectedTable.id), 'Cuenta abierta correctamente.')} className="mt-3 w-full rounded-xl bg-purple-500 p-3 text-sm font-bold text-white">Abrir mesa y cuenta</button>}{selectedAccount && <div className="mt-3 rounded-xl bg-slate-900 p-3"><span className="text-xs text-slate-400">Cuenta activa</span><strong className="block text-xl">{money(selectedAccount.subtotal)}</strong><span className="text-xs text-slate-400">{selectedAccount.rounds.length} rondas acumuladas</span></div>}</Panel><Panel title="Productos"><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{data.products.map(product => <button key={product.id} onClick={() => addProduct(product.id)} disabled={!selectedAccount || product.stockUnits <= 0} className="rounded-xl border border-slate-800 bg-slate-900 p-4 text-left disabled:opacity-40"><span className="text-[10px] font-bold uppercase text-purple-300">{product.category}</span><strong className="mt-1 block text-sm">{product.name}</strong><span className="mt-2 flex justify-between text-xs"><b>{money(product.price)}</b><span className="text-slate-400">Stock {product.stockUnits}</span></span><span className="mt-3 inline-flex items-center gap-1 text-xs font-bold text-purple-300"><Plus size={13} /> Añadir nueva ronda</span></button>)}{!data.products.length && <Empty text="Catálogo vacío. Configura productos para comenzar." />}</div></Panel></div></div>}
        {activeModule === 'accounts' && <div className="space-y-5"><Title title="Cuentas abiertas" subtitle="Cada mesa mantiene una cuenta única durante todas sus rondas." /><div className="grid gap-4 lg:grid-cols-2">{activeAccounts.map(account => { const table = data.tables.find(item => item.id === account.tableId); return <article key={account.id} className="rounded-2xl border border-slate-800 bg-slate-900 p-5"><div className="flex justify-between"><div><span className="text-xs text-purple-300">{data.zones.find(zone => zone.id === table?.zoneId)?.name}</span><h2 className="text-xl font-bold">{table?.name}</h2></div><strong className="text-xl">{money(account.subtotal)}</strong></div><div className="my-4 space-y-2">{account.rounds.map(round => <div key={round.id} className="rounded-xl bg-slate-950 p-3"><div className="flex justify-between text-xs"><strong>Ronda #{round.sequence}</strong><span className="text-slate-400">{round.status}</span></div><p className="mt-1 text-xs text-slate-400">{round.items.map(item => `${item.quantity}× ${item.name}`).join(' · ')}</p></div>)}</div><div className="flex gap-2">{account.status === 'open' && <button onClick={() => run(() => onRequestBill(account.id), 'Cuenta solicitada a caja.')} className="flex-1 rounded-xl border border-amber-500 px-3 py-2 text-xs font-bold text-amber-300">Solicitar cuenta</button>}{account.status === 'bill_requested' && <button onClick={() => run(() => onCloseAccount(account.id), 'Pago registrado y mesa liberada.')} className="flex-1 rounded-xl bg-emerald-500 px-3 py-2 text-xs font-bold text-slate-950">Cobrar y liberar mesa</button>}<button onClick={() => { setSelectedTableId(account.tableId); setActiveModule('pos') }} className="rounded-xl bg-purple-500 px-3 py-2 text-xs font-bold">Agregar ronda</button></div></article> })}{!activeAccounts.length && <Empty text="No hay cuentas abiertas." />}</div></div>}
        {activeModule === 'bar' && <div className="space-y-5"><Title title="Barra / preparación" subtitle="Comandas orientadas a bebidas, botellas, mixers y snacks." /><div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{barRounds.map(round => <article key={round.id} className="rounded-2xl border border-slate-800 bg-slate-900 p-4"><div className="flex justify-between"><strong>{round.table?.name}</strong><span className="text-xs text-amber-300">Ronda #{round.sequence}</span></div>{round.items.map(item => <p key={item.id} className="mt-2 text-sm text-slate-300">{item.quantity}× {item.name}</p>)}</article>)}{!barRounds.length && <Empty text="Barra sin comandas pendientes." />}</div></div>}
        {activeModule === 'inventory' && <SimpleTable title="Inventario de barra" headers={['Producto', 'Categoría', 'Stock', 'Estado']} rows={data.products.map(product => [product.name, product.category, String(product.stockUnits), product.stockUnits <= 6 ? 'Bajo' : 'Disponible'])} />}
        {activeModule === 'products' && <SimpleTable title="Productos" headers={['Producto', 'Categoría', 'Precio', 'Destino']} rows={data.products.map(product => [product.name, product.category, money(product.price), product.preparationArea])} />}
        {activeModule === 'cash' && <div className="space-y-5"><Title title="Caja nocturna" subtitle="El turno no puede cerrarse mientras existan cuentas abiertas." /><div className="grid gap-3 sm:grid-cols-3"><Metric label="Fondo inicial" value={money(data.shift?.openingFloat || 0)} /><Metric label="Ventas cerradas" value={money(sales)} /><Metric label="Cuentas pendientes" value={String(activeAccounts.length)} /></div><Panel title="Estado de turno">{data.shift ? <p className="text-sm text-slate-300">{activeAccounts.length ? `Hay ${activeAccounts.length} cuenta(s) abierta(s). Cobra y libera las mesas antes del cierre.` : 'Caja lista para arqueo y cierre.'}</p> : <div><p className="mb-3 text-sm text-slate-300">El turno está cerrado. Ábrelo para comenzar la operación.</p><button onClick={() => run(() => onStartShift(1000), 'Turno abierto con fondo inicial de Bs 1.000.')} className="rounded-xl bg-purple-500 px-4 py-3 text-sm font-bold">Abrir turno demo</button></div>}</Panel></div>}
        {activeModule === 'history' && <SimpleTable title="Historial de cuentas" headers={['Mesa', 'Apertura', 'Rondas', 'Subtotal']} rows={data.accounts.map(account => [data.tables.find(table => table.id === account.tableId)?.name || account.tableId, new Date(account.openedAt).toLocaleTimeString('es-BO', { hour: '2-digit', minute: '2-digit' }), String(account.rounds.length), money(account.subtotal)])} />}
        {activeModule === 'customers' && <SimpleTable title="Clientes" headers={['Cliente', 'Teléfono', 'Visitas', 'Consumo histórico']} rows={data.customers.map(customer => [customer.name, customer.phone, String(customer.visits), money(customer.totalSpent)])} />}
        {activeModule === 'users' && <SimpleTable title="Usuarios y roles" headers={['Rol', 'Responsabilidad']} rows={[['Owner / Admin', 'Configuración y reportes'], ['Caja', 'Cobros y cierre'], ['Servicio', 'Mesas, cuentas y rondas'], ['Barra', 'Preparación de comandas'], ['Inventario', 'Stock y conteos']]} />}
        {activeModule === 'reports' && <div className="space-y-5"><Title title="Reportes" subtitle="Base para ventas, consumo por zona, rotación de mesas e inventario." /><div className="grid gap-3 sm:grid-cols-3"><Metric label="Ventas cerradas" value={money(sales)} /><Metric label="Subtotal abierto" value={money(activeAccounts.reduce((sum, account) => sum + account.subtotal, 0))} /><Metric label="Rondas activas" value={String(activeAccounts.reduce((sum, account) => sum + account.rounds.length, 0))} /></div></div>}
        {activeModule === 'settings' && <div className="space-y-5"><Title title="Configuración" subtitle="Zonas, mesas, catálogo, impresión y permisos requieren flujos dedicados antes de persistencia real." /><Panel title="Base configurada"><p className="text-sm text-slate-300">{data.zones.length} zonas · {data.tables.length} mesas · {data.products.length} productos demo.</p></Panel></div>}
      </main>
    </div>
    <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-slate-800 bg-slate-950 p-1 md:hidden">{modules.slice(0, 4).map(item => <button key={item.id} onClick={() => setActiveModule(item.id)} className={`grid place-items-center gap-1 rounded-lg py-2 text-[10px] ${activeModule === item.id ? 'bg-purple-500 text-white' : 'text-slate-400'}`}><item.icon size={17} />{item.label}</button>)}<button onClick={() => setActiveModule('bar')} className={`grid place-items-center gap-1 rounded-lg py-2 text-[10px] ${activeModule === 'bar' ? 'bg-purple-500 text-white' : 'text-slate-400'}`}><Wine size={17} />Barra</button></nav>
  </div>
}

function Title({ title, subtitle }: { title: string; subtitle: string }) { return <header><h1 className="text-2xl font-black sm:text-3xl">{title}</h1><p className="mt-1 text-sm text-slate-400">{subtitle}</p></header> }
function Metric({ label, value }: { label: string; value: string }) { return <div className="rounded-2xl border border-slate-800 bg-slate-900 p-4"><span className="text-xs text-slate-400">{label}</span><strong className="mt-2 block text-2xl">{value}</strong></div> }
function Panel({ title, children }: { title: string; children: ReactNode }) { return <section className="rounded-2xl border border-slate-800 bg-slate-950 p-4"><h2 className="mb-3 flex items-center gap-2 text-sm font-bold"><Sparkles size={15} className="text-purple-400" />{title}</h2>{children}</section> }
function Empty({ text }: { text: string }) { return <div className="rounded-xl border border-dashed border-slate-700 p-5 text-sm text-slate-400">{text}</div> }
function SimpleTable({ title, headers, rows }: { title: string; headers: string[]; rows: string[][] }) { return <div className="space-y-5"><Title title={title} subtitle="Dataset demostrativo desacoplado de persistencia remota." /><div className="overflow-x-auto rounded-2xl border border-slate-800"><table className="w-full min-w-[560px] text-left text-sm"><thead className="bg-slate-900 text-xs uppercase text-slate-400"><tr>{headers.map(header => <th key={header} className="p-3">{header}</th>)}</tr></thead><tbody className="divide-y divide-slate-800">{rows.map((row, index) => <tr key={index}>{row.map((cell, cellIndex) => <td key={cellIndex} className="p-3">{cell}{cellIndex === row.length - 1 && <ChevronRight size={13} className="ml-2 inline text-slate-600" />}</td>)}</tr>)}{!rows.length && <tr><td colSpan={headers.length} className="p-6 text-center text-slate-400">Sin datos todavía.</td></tr>}</tbody></table></div></div> }
