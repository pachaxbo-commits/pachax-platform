import { Minus, Plus, Search, ShoppingBag, UserRound, X } from 'lucide-react'
import { useMemo, useRef, useState } from 'react'
import type { NightclubCustomer, NightclubDataset, NightclubRoundDraft, NightclubServiceTarget } from '../domain/nightclubAccounts'
import { nightclubAccountLabel, nightclubProductAvailability } from '../domain/nightclubAccounts'

const money = (value: number) => `Bs ${value.toLocaleString('es-BO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

export function NightclubPOS({ data, draft, selectedAccountId, onSelectAccount, onDraftChange, onOpenAccount, onSendRound, onSettleRound, onCourtesy, onSaveCustomer }: {
  data: NightclubDataset
  draft: NightclubRoundDraft[]
  selectedAccountId: string
  onSelectAccount: (id: string) => void
  onDraftChange: (draft: NightclubRoundDraft[]) => void
  onOpenAccount: (target: NightclubServiceTarget) => string
  onSendRound: (accountId: string, draft: NightclubRoundDraft[], operationId: string, customerId: string | null, serviceStaffId?: string) => boolean
  onSettleRound: (accountId: string, draft: NightclubRoundDraft[], payment: import('../domain/nightclubAccounts').NightclubPaymentDraft, operationId: string) => boolean
  onCourtesy: (accountId: string) => void
  onSaveCustomer: (customer: NightclubCustomer) => boolean
}) {
  const [category, setCategory] = useState('Todos')
  const [search, setSearch] = useState('')
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [processing, setProcessing] = useState(false)
  const [quickPay, setQuickPay] = useState(false)
  const [quickMethod, setQuickMethod] = useState<'cash' | 'qr' | 'card'>('cash')
  const [quickReceived, setQuickReceived] = useState('')
  const operation = useRef<string | null>(null)
  const lock = useRef(false)
  const [destinationMode, setDestinationMode] = useState<'table' | 'bar'>(() => {
    const initial = data.accounts.find(account => account.id === selectedAccountId)
    return initial?.serviceTarget?.type === 'bar' || initial?.serviceTarget?.type === 'customer' ? 'bar' : 'table'
  })
  const [zoneId, setZoneId] = useState(data.zones[0]?.id || '')
  const [customerId, setCustomerId] = useState('')
  const [customerName, setCustomerName] = useState('')
  const [customerSearch, setCustomerSearch] = useState('')
  const [serviceStaffId, setServiceStaffId] = useState('')
  const [creatingCustomer, setCreatingCustomer] = useState(false)
  const [newCustomerName, setNewCustomerName] = useState('')
  const [newCustomerPhone, setNewCustomerPhone] = useState('')
  const accounts = data.accounts.filter(account => account.status !== 'closed')
  const selectedCandidate = accounts.find(account => account.id === selectedAccountId)
  const isBarAccount = (account: typeof selectedCandidate) => account?.serviceTarget?.type === 'bar' || account?.serviceTarget?.type === 'customer' || account?.orderType === 'BAR'
  const selected = selectedCandidate && (destinationMode === 'bar' ? isBarAccount(selectedCandidate) : !isBarAccount(selectedCandidate) && !!selectedCandidate.tableId) ? selectedCandidate : undefined
  const personalAccounts = accounts.filter(isBarAccount)
  const availableCustomers = data.customers.filter(customer => customer.active !== false && `${customer.name} ${customer.phone}`.toLocaleLowerCase().includes(customerSearch.trim().toLocaleLowerCase()))
  const categories = ['Todos', ...new Set(data.products.filter(item => item.active !== false && item.price > 0).map(item => item.category))]
  const products = useMemo(() => data.products.filter(product => product.active !== false && product.price > 0 && (category === 'Todos' || product.category === category) && product.name.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase())), [category, data.products, search])
  const zoneTables = data.tables.filter(table => table.zoneId === zoneId)
  const itemCount = draft.reduce((sum, item) => sum + item.quantity, 0)
  const draftTotal = draft.reduce((sum, item) => sum + (data.products.find(product => product.id === item.productId)?.price || 0) * item.quantity, 0)
  const update = (productId: string, delta: number) => { operation.current = null; onDraftChange((draft.some(item => item.productId === productId) ? draft.map(item => item.productId === productId ? { ...item, quantity: item.quantity + delta } : item) : [...draft, { productId, quantity: delta }]).filter(item => item.quantity > 0)) }
  const selectAccount = (accountId: string) => { operation.current = null; onSelectAccount(accountId) }
  const switchDestination = (mode: 'table' | 'bar') => {
    if (mode === destinationMode) return
    setDestinationMode(mode)
    selectAccount('')
    setCustomerId('')
    setCustomerName('')
  }
  const cancelDraft = () => { onDraftChange([]); selectAccount(''); setCustomerId(''); setCustomerName('') }
  const settleRound = () => { if (!selected || !draft.length || lock.current) return; const received = Number(quickReceived || draftTotal); if (quickMethod === 'cash' && (!Number.isFinite(received) || received < draftTotal)) return; lock.current = true; setProcessing(true); const operationId = operation.current ||= crypto.randomUUID(); const success = onSettleRound(selected.id, draft, { method: quickMethod, ...(quickMethod === 'cash' ? { received } : {}) }, operationId); if (success) { onDraftChange([]); operation.current = null; setQuickPay(false); setQuickReceived(''); if (destinationMode === 'bar') selectAccount('') } lock.current = false; setProcessing(false) }
  const sendRound = () => {
    if (!selected || selected.status !== 'open' || !draft.length || lock.current) return
    lock.current = true
    setProcessing(true)
    const operationId = operation.current ||= crypto.randomUUID()
    const success = onSendRound(selected.id, draft, operationId, customerId || null, serviceStaffId || undefined)
    if (success) { onDraftChange([]); operation.current = null; setDrawerOpen(false); setCustomerId(''); setCustomerName(''); setCustomerSearch(''); setServiceStaffId(''); if (destinationMode === 'bar') selectAccount('') }
    lock.current = false
    setProcessing(false)
  }
  const accountForTable = (tableId: string) => accounts.find(item => item.tableId === tableId || (item.serviceTarget?.type === 'table' && item.serviceTarget.tableId === tableId))
  const chooseTable = (tableId: string) => {
    const table = data.tables.find(item => item.id === tableId)
    if (!table) return
    const account = accountForTable(table.id)
    setDestinationMode('table')
    selectAccount(account?.id || onOpenAccount({ type: 'table', tableId }))
  }
  const createPersonalAccount = () => {
    const customer = data.customers.find(item => item.id === customerId)
    const displayName = customer?.name || customerName.trim()
    const id = onOpenAccount({ type: 'bar', customerId: customer?.id, displayName })
    if (!id) return
    selectAccount(id)
    setCustomerName('')
  }
  const registerCustomer = () => {
    if (!newCustomerName.trim()) return
    const id = crypto.randomUUID()
    if (onSaveCustomer({ id, name: newCustomerName.trim(), phone: newCustomerPhone.trim(), active: true, visits: 0, totalSpent: 0 })) {
      setCustomerId(id); setCustomerSearch(''); setCustomerName(''); setNewCustomerName(''); setNewCustomerPhone(''); setCreatingCustomer(false); operation.current = null
    }
  }

  const destinationPicker = <div className="mt-4 rounded-2xl border border-slate-700/80 bg-slate-950/55 p-3">
    <div className="grid grid-cols-2 gap-2 rounded-xl bg-slate-900 p-1">
      <button onClick={() => switchDestination('table')} className={`min-h-10 rounded-lg text-xs font-bold ${destinationMode === 'table' ? 'bg-amber-400 text-slate-950' : 'text-slate-300 hover:bg-slate-800'}`}>Mesa</button>
      <button onClick={() => switchDestination('bar')} className={`min-h-10 rounded-lg text-xs font-bold ${destinationMode === 'bar' ? 'bg-amber-400 text-slate-950' : 'text-slate-300 hover:bg-slate-800'}`}>Pedido en barra</button>
    </div>
    {destinationMode === 'table' ? <>
      <div className="mt-3 flex flex-wrap gap-1.5">{data.zones.map(zone => <button key={zone.id} onClick={() => setZoneId(zone.id)} className={`min-h-9 rounded-lg border px-3 text-xs font-bold ${zoneId === zone.id ? 'border-amber-300 bg-amber-400/15 text-amber-200' : 'border-slate-700 bg-slate-900 text-slate-300 hover:border-slate-500'}`}>{zone.name}</button>)}</div>
      <div className="mt-3 grid grid-cols-2 gap-2">{zoneTables.map(table => { const account = accountForTable(table.id); const disabled = table.status === 'reserved' || table.status === 'bill_requested' || account?.status === 'bill_requested'; const active = !!account && account.id === selected?.id; return <button key={table.id} disabled={disabled} onClick={() => chooseTable(table.id)} className={`min-h-14 rounded-xl border p-2 text-left transition disabled:cursor-not-allowed disabled:opacity-45 ${active ? 'border-amber-300 bg-amber-400/15' : 'border-slate-700 bg-slate-900 hover:border-slate-500'}`}><strong className="block truncate text-xs text-slate-100">{table.name}</strong><span className={`mt-0.5 block text-[10px] ${active ? 'text-amber-200' : account ? 'text-sky-300' : table.status === 'reserved' ? 'text-violet-300' : 'text-emerald-300'}`}>{active ? 'Destino actual' : account?.status === 'bill_requested' ? 'Por cobrar' : account ? 'Cuenta abierta' : table.status === 'reserved' ? 'Reservada' : 'Abrir cuenta'}</span></button> })}</div>
      {!zoneTables.length && <p className="mt-3 text-xs text-slate-400">Esta zona todavía no tiene mesas.</p>}
    </> : <div className="mt-3 space-y-2">
      {personalAccounts.length > 0 && <div className="flex flex-wrap gap-2">{personalAccounts.map(account => <button key={account.id} onClick={() => selectAccount(account.id)} className={`min-h-10 rounded-lg border px-3 text-xs font-bold ${account.id === selected?.id ? 'border-amber-300 bg-amber-400/15 text-amber-100' : 'border-slate-700 bg-slate-900 text-slate-200'}`}>{nightclubAccountLabel(account, data)}</button>)}</div>}

      {!customerId && <input aria-label="Nombre del cliente (opcional)" value={customerName} onChange={event => setCustomerName(event.target.value)} placeholder="Nombre del cliente (opcional)" className="min-h-11 w-full rounded-xl border border-slate-700 bg-slate-900 px-3 text-sm text-slate-100 placeholder:text-slate-500 focus:border-amber-400 focus:outline-none" />}
      <button disabled={data.shift?.status !== 'open'} onClick={createPersonalAccount} className="min-h-11 w-full rounded-xl bg-amber-400 text-sm font-black text-slate-950 disabled:opacity-40"><UserRound className="mr-2 inline h-4 w-4" />Abrir pedido en barra</button>
    </div>}
  </div>

  const accountPanel = (mobile = false) => <section className={`${mobile ? 'max-h-[88vh] overflow-y-auto pb-8' : 'sticky top-[4.75rem] max-h-[calc(100vh-5.5rem)] overflow-y-auto'} h-full border-slate-700/80 bg-[#121b20] p-4 lg:border-l`}>
    <div className="flex items-start justify-between gap-3"><div><span className="text-[10px] font-bold uppercase tracking-[0.16em] text-amber-300">Destino de ronda</span><h2 className="mt-1 text-lg font-bold">{selected ? nightclubAccountLabel(selected, data) : 'Selecciona una cuenta'}</h2><p className="mt-1 text-xs text-slate-400">Puedes preparar productos antes de elegir el destino.</p></div>{mobile && <button aria-label="Cerrar cuenta" onClick={() => setDrawerOpen(false)} className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-slate-700"><X /></button>}</div>
    {destinationPicker}
    <div className="mt-3 space-y-2 rounded-xl border border-slate-700/80 bg-slate-950/55 p-3"><label className="block text-xs font-bold text-slate-300">Cliente de esta ronda</label><input aria-label="Buscar cliente para esta ronda" placeholder="Buscar por nombre o teléfono" value={customerSearch} onChange={event => setCustomerSearch(event.target.value)} className="min-h-10 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 text-sm" /><select aria-label="Cliente de esta ronda" value={customerId} onChange={event => { setCustomerId(event.target.value); if (event.target.value) setCustomerName(''); operation.current = null }} className="min-h-11 w-full rounded-xl border border-slate-700 bg-slate-900 px-3 text-sm text-slate-100"><option value="">Sin cliente asociado</option>{availableCustomers.map(customer => <option key={customer.id} value={customer.id}>{customer.name}{customer.phone ? ` · ${customer.phone}` : ''}</option>)}{customerId && !availableCustomers.some(customer => customer.id === customerId) && data.customers.find(customer => customer.id === customerId) && <option value={customerId}>{data.customers.find(customer => customer.id === customerId)?.name}</option>}</select><button onClick={() => setCreatingCustomer(value => !value)} className="min-h-9 rounded-lg border border-slate-600 px-3 text-xs font-bold text-amber-200">{creatingCustomer ? 'Cancelar registro' : 'Registrar cliente rápido'}</button>{creatingCustomer && <div className="grid gap-2"><input aria-label="Nombre del nuevo cliente" placeholder="Nombre" value={newCustomerName} onChange={event => setNewCustomerName(event.target.value)} className="min-h-10 rounded-lg bg-slate-900 px-3 text-sm" /><input aria-label="Teléfono del nuevo cliente" placeholder="Teléfono (opcional)" value={newCustomerPhone} onChange={event => setNewCustomerPhone(event.target.value)} className="min-h-10 rounded-lg bg-slate-900 px-3 text-sm" /><button disabled={!newCustomerName.trim()} onClick={registerCustomer} className="min-h-10 rounded-lg bg-amber-400 px-3 text-sm font-bold text-slate-950 disabled:opacity-40">Guardar y seleccionar</button></div>}</div>
    <label className="mt-3 block text-xs font-bold text-slate-300">Responsable de servicio (opcional)<select aria-label="Responsable de servicio" value={serviceStaffId} onChange={event => { setServiceStaffId(event.target.value); operation.current = null }} className="mt-1 min-h-11 w-full rounded-xl border border-slate-700 bg-slate-900 px-3 text-sm text-slate-100"><option value="">Asignar autom?ticamente si corresponde</option>{(data.staff || []).filter(person => person.active && person.role === 'service').map(person => <option key={person.id} value={person.id}>{person.name}</option>)}</select></label>
    <div className="mt-4 space-y-1">{draft.map(line => { const product = data.products.find(item => item.id === line.productId); return <div key={line.productId} className="grid grid-cols-[1fr_auto] items-center gap-3 border-b border-slate-800 py-2.5"><div className="min-w-0"><strong className="block truncate text-sm">{product?.name}</strong><span className="block text-xs text-slate-400">{money((product?.price || 0) * line.quantity)}</span></div><div className="flex items-center gap-2"><button aria-label={`Quitar ${product?.name}`} onClick={() => update(line.productId, -1)} className="grid h-8 w-8 place-items-center rounded-lg bg-slate-800"><Minus size={14} /></button><b className="w-4 text-center text-sm">{line.quantity}</b><button aria-label={`Agregar ${product?.name}`} onClick={() => update(line.productId, 1)} className="grid h-8 w-8 place-items-center rounded-lg bg-slate-800"><Plus size={14} /></button></div></div>})}{!draft.length && <p className="rounded-xl border border-dashed border-slate-700 p-4 text-sm text-slate-400">Añade productos para preparar una nueva ronda.</p>}</div>
    <div className="mt-4 flex items-center justify-between"><span className="text-sm text-slate-400">Subtotal de ronda</span><strong className="text-xl">{money(draftTotal)}</strong></div>
    <button disabled={!draft.length || !selected || selected.status !== 'open' || processing || data.shift?.status !== 'open'} onClick={sendRound} className="mt-4 min-h-12 w-full rounded-xl bg-emerald-400 font-black text-slate-950 disabled:cursor-not-allowed disabled:opacity-40">{selected ? `ENVIAR RONDA · ${money(draftTotal)}` : 'ELIGE EL DESTINO'}</button>
    <button disabled={!draft.length || !selected || selected.status !== 'open' || processing || data.shift?.status !== 'open'} onClick={() => setQuickPay(true)} className="mt-2 min-h-11 w-full rounded-xl bg-amber-300 font-black text-slate-950 disabled:opacity-40">COBRAR Y ENVIAR RONDA</button>{quickPay && <div className="mt-2 rounded-xl border border-amber-300/40 bg-slate-950 p-3"><p className="font-bold">Total a cobrar: {money(draftTotal)}</p><div className="mt-2 grid grid-cols-3 gap-2">{(['cash','qr','card'] as const).map(method => <button key={method} onClick={() => setQuickMethod(method)} className={`rounded-lg p-2 text-xs ${quickMethod === method ? 'bg-amber-300 text-slate-950' : 'bg-slate-800'}`}>{method === 'cash' ? 'Efectivo' : method === 'qr' ? 'QR' : 'Tarjeta'}</button>)}</div>{quickMethod === 'cash' && <label className="mt-2 block text-xs">Recibido<input type="number" value={quickReceived} placeholder={String(draftTotal)} onChange={event => setQuickReceived(event.target.value)} className="mt-1 w-full rounded-lg bg-slate-900 p-2" />Cambio: {money(Math.max(0, Number(quickReceived || draftTotal) - draftTotal))}</label>}<div className="mt-3 flex gap-2"><button onClick={() => setQuickPay(false)} className="flex-1 rounded-lg border p-2 text-xs">Cancelar</button><button onClick={settleRound} className="flex-1 rounded-lg bg-emerald-400 p-2 text-xs font-bold text-slate-950">{quickMethod === 'cash' ? 'Confirmar pago' : 'Confirmar pago recibido'}</button></div></div>}    {!!draft.length && <button onClick={cancelDraft} className="mt-2 w-full rounded-xl border border-slate-700 px-3 py-2 text-xs text-slate-400">Cancelar borrador</button>}
    {selected && <><button onClick={() => onCourtesy(selected.id)} className="mt-2 min-h-11 w-full rounded-xl border border-purple-400 px-3 text-sm font-bold text-purple-200">Cortesía de socio · pedido separado</button><div className="mt-4 border-t border-slate-700 pt-3"><h3 className="font-bold">{isBarAccount(selected) ? 'Rondas de este pedido en barra' : 'Rondas de esta mesa'}</h3>{selected.rounds.map(round => <p key={round.id} className="mt-2 rounded-lg bg-slate-900 p-2 text-xs">#{round.sequence} · {round.customerId ? round.customerNameSnapshot || data.customers.find(customer => customer.id === round.customerId)?.name || 'Cliente' : 'Sin cliente asociado'} · {round.authorization === 'courtesy' ? 'Cortesía autorizada' : round.authorization === 'payment' ? 'Pagado' : 'Cargado a cuenta'} · {round.status} · {money(round.items.reduce((sum, item) => sum + item.lineTotal, 0))}</p>)}</div></>}
    {selected?.status === 'bill_requested' && <p className="mt-3 text-sm text-amber-300">Esta cuenta está por cobrar. Reábrela desde Cuentas para añadir productos.</p>}
  </section>

  return <div className="space-y-3"><header><h1 className="text-2xl font-black">POS · enviar ronda</h1><p className="text-sm text-slate-400">Prepara la ronda y elige una cuenta. El cobro se registra después desde Cuentas o Caja.</p></header>
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
