import { Minus, Plus, Search, ShoppingBag, UserRound, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import type { NightclubDataset, NightclubRoundDraft, NightclubServiceTarget } from '../domain/nightclubAccounts'
import { nightclubAccountLabel, nightclubProductAvailability } from '../domain/nightclubAccounts'

const money = (value: number) => `Bs ${value.toLocaleString('es-BO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

export function NightclubPOS({ data, draft, selectedAccountId, onSelectAccount, onDraftChange, onOpenAccount, onSendRound }: {
  data: NightclubDataset
  draft: NightclubRoundDraft[]
  selectedAccountId: string
  onSelectAccount: (id: string) => void
  onDraftChange: (draft: NightclubRoundDraft[]) => void
  onOpenAccount: (target: NightclubServiceTarget) => string
  onSendRound: (accountId: string, draft: NightclubRoundDraft[]) => void
}) {
  const [category, setCategory] = useState('Todos')
  const [search, setSearch] = useState('')
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [destinationMode, setDestinationMode] = useState<'table' | 'customer'>('table')
  const [zoneId, setZoneId] = useState(data.zones[0]?.id || '')
  const [customerId, setCustomerId] = useState('')
  const [customerName, setCustomerName] = useState('')
  const accounts = data.accounts.filter(account => account.status !== 'closed')
  const selected = accounts.find(account => account.id === selectedAccountId)
  const personalAccounts = accounts.filter(account => account.serviceTarget?.type === 'customer' || (!account.tableId && account.customerDisplayName))
  const categories = ['Todos', ...new Set(data.products.filter(item => item.active !== false).map(item => item.category))]
  const products = useMemo(() => data.products.filter(product => product.active !== false && (category === 'Todos' || product.category === category) && product.name.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase())), [category, data.products, search])
  const zoneTables = data.tables.filter(table => table.zoneId === zoneId)
  const itemCount = draft.reduce((sum, item) => sum + item.quantity, 0)
  const draftTotal = draft.reduce((sum, item) => sum + (data.products.find(product => product.id === item.productId)?.price || 0) * item.quantity, 0)
  const update = (productId: string, delta: number) => onDraftChange((draft.some(item => item.productId === productId) ? draft.map(item => item.productId === productId ? { ...item, quantity: item.quantity + delta } : item) : [...draft, { productId, quantity: delta }]).filter(item => item.quantity > 0))
  const accountForTable = (tableId: string) => accounts.find(item => item.tableId === tableId || (item.serviceTarget?.type === 'table' && item.serviceTarget.tableId === tableId))
  const chooseTable = (tableId: string) => {
    const table = data.tables.find(item => item.id === tableId)
    if (!table) return
    const account = accountForTable(table.id)
    onSelectAccount(account?.id || onOpenAccount({ type: 'table', tableId }))
  }
  const createPersonalAccount = () => {
    const customer = data.customers.find(item => item.id === customerId)
    const displayName = customer?.name || customerName.trim()
    if (!displayName) throw new Error('Escribe o selecciona el nombre del cliente.')
    onSelectAccount(onOpenAccount({ type: 'customer', customerId: customer?.id, displayName }))
    setCustomerId('')
    setCustomerName('')
  }

  const destinationPicker = <div className="mt-4 rounded-2xl border border-slate-700/80 bg-slate-950/55 p-3">
    <div className="grid grid-cols-2 gap-2 rounded-xl bg-slate-900 p-1">
      <button onClick={() => setDestinationMode('table')} className={`min-h-10 rounded-lg text-xs font-bold ${destinationMode === 'table' ? 'bg-amber-400 text-slate-950' : 'text-slate-300 hover:bg-slate-800'}`}>Mesa</button>
      <button onClick={() => setDestinationMode('customer')} className={`min-h-10 rounded-lg text-xs font-bold ${destinationMode === 'customer' ? 'bg-amber-400 text-slate-950' : 'text-slate-300 hover:bg-slate-800'}`}>Cuenta personal</button>
    </div>
    {destinationMode === 'table' ? <>
      <div className="mt-3 flex flex-wrap gap-1.5">{data.zones.map(zone => <button key={zone.id} onClick={() => setZoneId(zone.id)} className={`min-h-9 rounded-lg border px-3 text-xs font-bold ${zoneId === zone.id ? 'border-amber-300 bg-amber-400/15 text-amber-200' : 'border-slate-700 bg-slate-900 text-slate-300 hover:border-slate-500'}`}>{zone.name}</button>)}</div>
      <div className="mt-3 grid grid-cols-2 gap-2">{zoneTables.map(table => { const account = accountForTable(table.id); const disabled = table.status === 'reserved' || table.status === 'bill_requested' || account?.status === 'bill_requested'; const active = !!account && account.id === selected?.id; return <button key={table.id} disabled={disabled} onClick={() => chooseTable(table.id)} className={`min-h-14 rounded-xl border p-2 text-left transition disabled:cursor-not-allowed disabled:opacity-45 ${active ? 'border-amber-300 bg-amber-400/15' : 'border-slate-700 bg-slate-900 hover:border-slate-500'}`}><strong className="block truncate text-xs text-slate-100">{table.name}</strong><span className={`mt-0.5 block text-[10px] ${active ? 'text-amber-200' : account ? 'text-sky-300' : table.status === 'reserved' ? 'text-violet-300' : 'text-emerald-300'}`}>{active ? 'Destino actual' : account?.status === 'bill_requested' ? 'Por cobrar' : account ? 'Cuenta abierta' : table.status === 'reserved' ? 'Reservada' : 'Abrir cuenta'}</span></button> })}</div>
      {!zoneTables.length && <p className="mt-3 text-xs text-slate-400">Esta zona todavía no tiene mesas.</p>}
    </> : <div className="mt-3 space-y-2">
      {personalAccounts.length > 0 && <div className="flex flex-wrap gap-2">{personalAccounts.map(account => <button key={account.id} onClick={() => onSelectAccount(account.id)} className={`min-h-10 rounded-lg border px-3 text-xs font-bold ${account.id === selected?.id ? 'border-amber-300 bg-amber-400/15 text-amber-100' : 'border-slate-700 bg-slate-900 text-slate-200'}`}>{nightclubAccountLabel(account, data)}</button>)}</div>}
      <select aria-label="Cliente existente" value={customerId} onChange={event => { setCustomerId(event.target.value); if (event.target.value) setCustomerName('') }} className="min-h-11 w-full rounded-xl border border-slate-700 bg-slate-900 px-3 text-sm text-slate-100"><option value="">Cliente nuevo</option>{data.customers.filter(item => item.active !== false).map(customer => <option key={customer.id} value={customer.id}>{customer.name}</option>)}</select>
      {!customerId && <input aria-label="Nombre para cuenta personal" value={customerName} onChange={event => setCustomerName(event.target.value)} placeholder="Nombre del cliente" className="min-h-11 w-full rounded-xl border border-slate-700 bg-slate-900 px-3 text-sm text-slate-100 placeholder:text-slate-500 focus:border-amber-400 focus:outline-none" />}
      <button disabled={data.shift?.status !== 'open' || (!customerId && !customerName.trim())} onClick={createPersonalAccount} className="min-h-11 w-full rounded-xl bg-amber-400 text-sm font-black text-slate-950 disabled:opacity-40"><UserRound className="mr-2 inline h-4 w-4" />Abrir cuenta personal</button>
    </div>}
  </div>

  const accountPanel = (mobile = false) => <section className={`${mobile ? 'max-h-[88vh] overflow-y-auto pb-8' : 'sticky top-[4.75rem] max-h-[calc(100vh-5.5rem)] overflow-y-auto'} h-full border-slate-700/80 bg-[#121b20] p-4 lg:border-l`}>
    <div className="flex items-start justify-between gap-3"><div><span className="text-[10px] font-bold uppercase tracking-[0.16em] text-amber-300">Destino de ronda</span><h2 className="mt-1 text-lg font-bold">{selected ? nightclubAccountLabel(selected, data) : 'Selecciona una cuenta'}</h2><p className="mt-1 text-xs text-slate-400">Puedes preparar productos antes de elegir el destino.</p></div>{mobile && <button aria-label="Cerrar cuenta" onClick={() => setDrawerOpen(false)} className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-slate-700"><X /></button>}</div>
    {destinationPicker}
    <div className="mt-4 space-y-1">{draft.map(line => { const product = data.products.find(item => item.id === line.productId); return <div key={line.productId} className="grid grid-cols-[1fr_auto] items-center gap-3 border-b border-slate-800 py-2.5"><div className="min-w-0"><strong className="block truncate text-sm">{product?.name}</strong><span className="block text-xs text-slate-400">{money((product?.price || 0) * line.quantity)}</span></div><div className="flex items-center gap-2"><button aria-label={`Quitar ${product?.name}`} onClick={() => update(line.productId, -1)} className="grid h-8 w-8 place-items-center rounded-lg bg-slate-800"><Minus size={14} /></button><b className="w-4 text-center text-sm">{line.quantity}</b><button aria-label={`Agregar ${product?.name}`} onClick={() => update(line.productId, 1)} className="grid h-8 w-8 place-items-center rounded-lg bg-slate-800"><Plus size={14} /></button></div></div>})}{!draft.length && <p className="rounded-xl border border-dashed border-slate-700 p-4 text-sm text-slate-400">Añade productos para preparar una nueva ronda.</p>}</div>
    <div className="mt-4 flex items-center justify-between"><span className="text-sm text-slate-400">Subtotal de ronda</span><strong className="text-xl">{money(draftTotal)}</strong></div>
    <button disabled={!draft.length || !selected || selected.status !== 'open'} onClick={() => { if (!selected) return; onSendRound(selected.id, draft); onDraftChange([]); setDrawerOpen(false) }} className="mt-4 min-h-12 w-full rounded-xl bg-amber-400 font-black text-slate-950 disabled:cursor-not-allowed disabled:opacity-40">{selected ? 'ENVIAR RONDA' : 'ELIGE EL DESTINO'}</button>
    {selected?.status === 'bill_requested' && <p className="mt-3 text-sm text-amber-300">Esta cuenta está por cobrar. Reábrela desde Cuentas para añadir productos.</p>}
  </section>

  return <div className="space-y-3"><header><h1 className="text-2xl font-black">POS</h1><p className="text-sm text-slate-400">Prepara la ronda y elige su destino antes de enviarla.</p></header>
    <div className="grid min-h-[calc(100vh-9.5rem)] overflow-hidden rounded-2xl border border-slate-700 bg-[#0d1519] lg:grid-cols-[minmax(0,1fr)_22rem] xl:grid-cols-[minmax(0,1fr)_24rem]">
      <section className="min-w-0 p-3 sm:p-4 xl:p-5"><div className="flex flex-wrap gap-1.5">{categories.map(item => <button key={item} onClick={() => setCategory(item)} className={`min-h-9 rounded-lg border px-3 text-xs font-bold transition ${category === item ? 'border-amber-300 bg-amber-400 text-slate-950' : 'border-slate-700 bg-slate-900 text-slate-300 hover:border-slate-500'}`}>{item}</button>)}</div>
        <label className="mt-3 flex min-h-11 items-center gap-2 rounded-xl border border-slate-700 bg-slate-900/80 px-3 transition focus-within:border-amber-400 focus-within:bg-slate-900 focus-within:ring-2 focus-within:ring-amber-400/10"><Search size={17} className="text-slate-400" /><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Buscar por nombre" className="min-w-0 flex-1 !bg-transparent text-sm !text-slate-100 outline-none placeholder:!text-slate-500" /></label>
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">{products.map(product => { const available = nightclubProductAvailability(product, data.inventory); const quantity = draft.find(item => item.productId === product.id)?.quantity || 0; return <button key={product.id} disabled={available <= quantity} onClick={() => update(product.id, 1)} className="group grid h-40 grid-rows-[5rem_1fr] overflow-hidden rounded-xl border border-slate-700 bg-slate-900 text-left transition hover:-translate-y-0.5 hover:border-amber-400/60 disabled:translate-y-0 disabled:opacity-40"><div className="bg-slate-800">{product.imageUrl ? <img src={product.imageUrl} alt="" className="h-full w-full object-cover" /> : <div className="grid h-full place-items-center text-slate-500 transition group-hover:text-amber-300"><ShoppingBag /></div>}</div><div className="flex min-h-0 flex-col justify-between p-2.5"><strong className="line-clamp-2 text-sm leading-5">{product.name}</strong><div className="flex items-end justify-between gap-2"><span className="text-sm font-black text-amber-300">{money(product.price)}</span>{quantity > 0 && <span className="rounded-full bg-amber-400 px-2 py-0.5 text-[10px] font-black text-slate-950">×{quantity}</span>}</div></div></button>})}</div>
        {!products.length && <p className="mt-4 rounded-xl border border-dashed border-slate-700 p-5 text-sm text-slate-400">No hay productos que coincidan con la búsqueda.</p>}
      </section>
      <div className="hidden min-w-0 lg:block">{accountPanel()}</div>
    </div>
    <button onClick={() => setDrawerOpen(true)} className="fixed inset-x-3 bottom-16 z-30 flex min-h-14 items-center justify-between rounded-2xl bg-amber-400 px-4 font-bold text-slate-950 shadow-xl lg:hidden"><span>{selected ? nightclubAccountLabel(selected, data) : 'Elegir destino'} · {itemCount}</span><span>{money(draftTotal)}</span></button>
    {drawerOpen && <div className="fixed inset-0 z-[60] bg-black/60 lg:hidden" onClick={() => setDrawerOpen(false)}><div className="absolute inset-x-0 bottom-0 max-h-[88vh] rounded-t-3xl bg-[#121b20]" onClick={event => event.stopPropagation()}>{accountPanel(true)}</div></div>}
  </div>
}
