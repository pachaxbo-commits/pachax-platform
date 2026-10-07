import { Minus, Plus, Search, ShoppingBag, UserRound, X } from 'lucide-react'
import { useMemo, useRef, useState } from 'react'
import type { NightclubDataset, NightclubPaymentDraft, NightclubRoundDraft, NightclubServiceTarget } from '../domain/nightclubAccounts'
import { nightclubAccountLabel, nightclubProductAvailability } from '../domain/nightclubAccounts'

const money = (value: number) => `Bs ${value.toLocaleString('es-BO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

export function NightclubPOS({ data, draft, selectedAccountId, onSelectAccount, onDraftChange, onOpenAccount, onSettleRound, onCourtesy }: {
  data: NightclubDataset
  draft: NightclubRoundDraft[]
  selectedAccountId: string
  onSelectAccount: (id: string) => void
  onDraftChange: (draft: NightclubRoundDraft[]) => void
  onOpenAccount: (target: NightclubServiceTarget) => string
  onSettleRound: (accountId: string, draft: NightclubRoundDraft[], payment: NightclubPaymentDraft, operationId: string) => boolean
  onCourtesy: (accountId: string) => void
}) {
  const [category, setCategory] = useState('Todos')
  const [search, setSearch] = useState('')
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [paying, setPaying] = useState(false)
  const [processing, setProcessing] = useState(false)
  const [method, setMethod] = useState<NightclubPaymentDraft['method']>('cash')
  const [received, setReceived] = useState('')
  const [cash, setCash] = useState('')
  const [qr, setQr] = useState('')
  const [card, setCard] = useState('')
  const [partialAmount, setPartialAmount] = useState('')
  const [stagedPayments, setStagedPayments] = useState<NonNullable<NightclubPaymentDraft['installments']>>([])
  const operation = useRef<string | null>(null)
  const lock = useRef(false)
  const [destinationMode, setDestinationMode] = useState<'table' | 'bar'>(() => {
    const initial = data.accounts.find(account => account.id === selectedAccountId)
    return initial?.serviceTarget?.type === 'bar' || initial?.serviceTarget?.type === 'customer' ? 'bar' : 'table'
  })
  const [zoneId, setZoneId] = useState(data.zones[0]?.id || '')
  const [customerId, setCustomerId] = useState('')
  const [customerName, setCustomerName] = useState('')
  const accounts = data.accounts.filter(account => account.status !== 'closed')
  const selectedCandidate = accounts.find(account => account.id === selectedAccountId)
  const isBarAccount = (account: typeof selectedCandidate) => account?.serviceTarget?.type === 'bar' || account?.serviceTarget?.type === 'customer' || account?.orderType === 'BAR'
  const selected = selectedCandidate && (destinationMode === 'bar' ? isBarAccount(selectedCandidate) : !isBarAccount(selectedCandidate) && !!selectedCandidate.tableId) ? selectedCandidate : undefined
  const personalAccounts = accounts.filter(isBarAccount)
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
    setPaying(false)
    setCustomerId('')
    setCustomerName('')
  }
  const cancelDraft = () => { onDraftChange([]); selectAccount(''); setPaying(false); setStagedPayments([]); setCustomerId(''); setCustomerName('') }
  const remaining = Math.round((draftTotal - stagedPayments.reduce((sum, payment) => sum + payment.amount, 0)) * 100) / 100
  const currentAmount = partialAmount.trim() === '' ? remaining : Number(partialAmount)
  const cashDue = method === 'cash' ? currentAmount : method === 'mixed' ? Number(cash) : 0
  const receivedAmount = Number(received)
  const validPayment = !!selected && selected.status === 'open' && draftTotal > 0 && Number.isFinite(currentAmount) && currentAmount > 0 && currentAmount <= remaining && (method !== 'mixed' || stagedPayments.length === 0 && Math.round((Number(cash) + Number(qr) + Number(card)) * 100) === Math.round(draftTotal * 100)) && [cash, qr, card].every(value => value === '' || Number.isFinite(Number(value)) && Number(value) >= 0) && (cashDue === 0 || received.trim() !== '') && Number.isFinite(receivedAmount) && receivedAmount >= cashDue
  const closePayment = () => { setPaying(false); setStagedPayments([]); setPartialAmount(''); setReceived('') }
  const stagePartialPayment = () => {
    if (!validPayment || method === 'mixed' || currentAmount >= remaining) return
    setStagedPayments(current => [...current, { method, amount: currentAmount, received: method === 'cash' ? receivedAmount : undefined }])
    setPartialAmount('')
    setReceived('')
    operation.current = null
  }
  const submitPayment = () => {
    if (!selected || !validPayment || lock.current) return
    lock.current = true
    setProcessing(true)
    const operationId = operation.current ||= crypto.randomUUID()
    const installments = stagedPayments.length ? [...stagedPayments, { method: method as 'cash' | 'qr' | 'card', amount: currentAmount, received: method === 'cash' ? receivedAmount : undefined }] : undefined
    const success = onSettleRound(selected.id, draft, { method: installments ? 'mixed' : method, amount: draftTotal, received: receivedAmount, cashAmount: Number(cash), qrAmount: Number(qr), cardAmount: Number(card), installments }, operationId)
    if (success) { onDraftChange([]); operation.current = null; closePayment(); setDrawerOpen(false); setCash(''); setQr(''); setCard(''); if (destinationMode === 'bar') { selectAccount(''); setCustomerId(''); setCustomerName('') } }
    lock.current = false
    setProcessing(false)
  }
  const accountForTable = (tableId: string) => accounts.find(item => item.tableId === tableId || (item.serviceTarget?.type === 'table' && item.serviceTarget.tableId === tableId))
  const chooseTable = (tableId: string) => {
    const table = data.tables.find(item => item.id === tableId)
    if (!table) return
    const account = accountForTable(table.id)
    setDestinationMode('table')
    setCustomerId('')
    setCustomerName('')
    selectAccount(account?.id || onOpenAccount({ type: 'table', tableId }))
  }
  const createPersonalAccount = () => {
    const customer = data.customers.find(item => item.id === customerId)
    const displayName = customer?.name || customerName.trim()
    const id = onOpenAccount({ type: 'bar', customerId: customer?.id, displayName })
    if (!id) return
    selectAccount(id)
    setCustomerId('')
    setCustomerName('')
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
      <select aria-label="Cliente existente (opcional)" value={customerId} onChange={event => { setCustomerId(event.target.value); if (event.target.value) setCustomerName('') }} className="min-h-11 w-full rounded-xl border border-slate-700 bg-slate-900 px-3 text-sm text-slate-100"><option value="">Sin cliente asociado</option>{data.customers.filter(item => item.active !== false).map(customer => <option key={customer.id} value={customer.id}>{customer.name}</option>)}</select>
      {!customerId && <input aria-label="Nombre del cliente (opcional)" value={customerName} onChange={event => setCustomerName(event.target.value)} placeholder="Nombre del cliente (opcional)" className="min-h-11 w-full rounded-xl border border-slate-700 bg-slate-900 px-3 text-sm text-slate-100 placeholder:text-slate-500 focus:border-amber-400 focus:outline-none" />}
      <button disabled={data.shift?.status !== 'open'} onClick={createPersonalAccount} className="min-h-11 w-full rounded-xl bg-amber-400 text-sm font-black text-slate-950 disabled:opacity-40"><UserRound className="mr-2 inline h-4 w-4" />Abrir pedido en barra</button>
    </div>}
  </div>

  const accountPanel = (mobile = false) => <section className={`${mobile ? 'max-h-[88vh] overflow-y-auto pb-8' : 'sticky top-[4.75rem] max-h-[calc(100vh-5.5rem)] overflow-y-auto'} h-full border-slate-700/80 bg-[#121b20] p-4 lg:border-l`}>
    <div className="flex items-start justify-between gap-3"><div><span className="text-[10px] font-bold uppercase tracking-[0.16em] text-amber-300">Destino de ronda</span><h2 className="mt-1 text-lg font-bold">{selected ? nightclubAccountLabel(selected, data) : 'Selecciona una cuenta'}</h2><p className="mt-1 text-xs text-slate-400">Puedes preparar productos antes de elegir el destino.</p></div>{mobile && <button aria-label="Cerrar cuenta" onClick={() => setDrawerOpen(false)} className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-slate-700"><X /></button>}</div>
    {destinationPicker}
    <div className="mt-4 space-y-1">{draft.map(line => { const product = data.products.find(item => item.id === line.productId); return <div key={line.productId} className="grid grid-cols-[1fr_auto] items-center gap-3 border-b border-slate-800 py-2.5"><div className="min-w-0"><strong className="block truncate text-sm">{product?.name}</strong><span className="block text-xs text-slate-400">{money((product?.price || 0) * line.quantity)}</span></div><div className="flex items-center gap-2"><button aria-label={`Quitar ${product?.name}`} onClick={() => update(line.productId, -1)} className="grid h-8 w-8 place-items-center rounded-lg bg-slate-800"><Minus size={14} /></button><b className="w-4 text-center text-sm">{line.quantity}</b><button aria-label={`Agregar ${product?.name}`} onClick={() => update(line.productId, 1)} className="grid h-8 w-8 place-items-center rounded-lg bg-slate-800"><Plus size={14} /></button></div></div>})}{!draft.length && <p className="rounded-xl border border-dashed border-slate-700 p-4 text-sm text-slate-400">Añade productos para preparar una nueva ronda.</p>}</div>
    <div className="mt-4 flex items-center justify-between"><span className="text-sm text-slate-400">Subtotal de ronda</span><strong className="text-xl">{money(draftTotal)}</strong></div>
    <button disabled={!draft.length || !selected || selected.status !== 'open'} onClick={() => setPaying(true)} className="mt-4 min-h-12 w-full rounded-xl bg-emerald-400 font-black text-slate-950 disabled:cursor-not-allowed disabled:opacity-40">{selected ? `COBRAR Y ENVIAR · ${money(draftTotal)}` : 'ELIGE EL DESTINO'}</button>
    {!!draft.length && <button onClick={cancelDraft} className="mt-2 w-full rounded-xl border border-slate-700 px-3 py-2 text-xs text-slate-400">Cancelar borrador</button>}
    {selected && <><button onClick={() => onCourtesy(selected.id)} className="mt-2 min-h-11 w-full rounded-xl border border-purple-400 px-3 text-sm font-bold text-purple-200">Cortesía de socio · pedido separado</button><div className="mt-4 border-t border-slate-700 pt-3"><h3 className="font-bold">{isBarAccount(selected) ? 'Rondas de este pedido en barra' : 'Rondas de esta mesa'}</h3>{selected.rounds.map(round => <p key={round.id} className="mt-2 rounded-lg bg-slate-900 p-2 text-xs">#{round.sequence} · {round.authorization === 'courtesy' ? 'Cortesía autorizada' : round.authorization === 'payment' ? 'Pagado' : 'Pendiente de regularización'} · {round.status} · {money(round.items.reduce((sum, item) => sum + item.lineTotal, 0))}</p>)}</div></>}
    {selected?.status === 'bill_requested' && <p className="mt-3 text-sm text-amber-300">Esta cuenta está por cobrar. Reábrela desde Cuentas para añadir productos.</p>}
  </section>

  return <div className="space-y-3"><header><h1 className="text-2xl font-black">POS · cobro por ronda</h1><p className="text-sm text-slate-400">Prepara la ronda, elige mesa o pedido en barra y cobra antes de enviarla a Barra.</p></header>
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
    {paying && <div className="fixed inset-0 z-[70] grid place-items-center bg-slate-950/85 p-4">
      <section role="dialog" aria-modal="true" aria-label="Cobrar ronda" className="w-full max-w-md space-y-4 rounded-2xl border border-emerald-400/40 bg-slate-900 p-5">
        <div className="flex justify-between"><h2 className="text-xl font-black">Cobrar esta ronda</h2><button onClick={closePayment} aria-label="Cerrar pago">×</button></div>
        <p className="text-sm text-slate-300">Simulación local. La ronda se registra y envía cuando el saldo queda cubierto.</p>
        <strong className="block text-3xl text-emerald-300">{money(draftTotal)}</strong>
        {stagedPayments.length > 0 && <div className="rounded-xl border border-slate-700 bg-slate-950 p-3 text-sm"><p>Abonos preparados: {money(draftTotal - remaining)}</p><strong>Saldo: {money(remaining)}</strong><p className="mt-1 text-xs text-slate-400">Se registrarán juntos al completar el saldo; cancelar descarta estos abonos.</p></div>}
        <div role="group" aria-label="Método de pago" className="grid grid-cols-2 gap-2">{([['cash', 'Efectivo'], ['qr', 'QR'], ['card', 'Tarjeta'], ['mixed', 'Mixto']] as const).map(([value, label]) => <button key={value} type="button" aria-pressed={method === value} disabled={value === 'mixed' && stagedPayments.length > 0} onClick={() => { setMethod(value); setReceived(''); operation.current = null }} className={`min-h-11 rounded-xl border px-3 text-sm font-bold disabled:opacity-40 ${method === value ? 'border-emerald-300 bg-emerald-300 text-slate-950' : 'border-slate-600 bg-slate-950 text-slate-200'}`}>{label}</button>)}</div>
        {method !== 'mixed' && <label className="block text-sm">Monto de este abono<input aria-label="Monto de este abono" type="number" min="0.01" max={remaining} step="0.01" value={partialAmount} onChange={event => setPartialAmount(event.target.value)} placeholder={String(remaining)} className="mt-1 w-full rounded-xl bg-slate-950 p-3" /></label>}
        {method === 'mixed' && <div className="grid grid-cols-3 gap-2">{([['Efectivo', cash, setCash], ['QR', qr, setQr], ['Tarjeta', card, setCard]] as const).map(([label, value, setter]) => <label key={label} className="text-xs">{label}<input type="number" min="0" step="0.01" value={value} onChange={event => { setter(event.target.value); operation.current = null }} className="mt-1 w-full rounded-lg bg-slate-950 p-2" /></label>)}</div>}
        {cashDue > 0 && <label className="block text-sm">Efectivo recibido<input aria-label="Efectivo recibido" type="number" min="0" step="0.01" value={received} onChange={event => { setReceived(event.target.value); operation.current = null }} placeholder={String(cashDue)} className="mt-1 w-full rounded-xl bg-slate-950 p-3" /><small className="text-slate-400">Cambio: {money(Math.max(0, receivedAmount - cashDue))}</small></label>}
        {currentAmount < remaining && method !== 'mixed' ? <button disabled={!validPayment || processing} onClick={stagePartialPayment} className="w-full rounded-xl bg-amber-300 p-3 font-black text-slate-950 disabled:opacity-40">PREPARAR ABONO · {money(currentAmount)}</button> : <button disabled={!validPayment || processing} onClick={submitPayment} className="w-full rounded-xl bg-emerald-400 p-3 font-black text-slate-950 disabled:opacity-40">{processing ? 'Procesando pago...' : 'CONFIRMAR PAGO Y ENVIAR A BARRA'}</button>}
      </section>
    </div>}
  </div>
}
