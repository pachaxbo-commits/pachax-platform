import { Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import type { NightclubAccount, NightclubDataset } from '../domain/nightclubAccounts'
import { nightclubAccountLabel, nightclubBalance, nightclubPaidTotal } from '../domain/nightclubAccounts'

const money = (value: number) => `Bs ${value.toLocaleString('es-BO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

export function NightclubAccounts({ data, canPay, canReopen, onGoToPOS, onRequestBill, onReopenBill, onPay }: {
  data: NightclubDataset
  canPay: boolean
  canReopen: boolean
  onGoToPOS: (account: NightclubAccount) => void
  onRequestBill: (id: string) => void
  onReopenBill: (id: string) => void
  onPay: (account: NightclubAccount) => void
}) {
  const [filter, setFilter] = useState<'all' | 'open' | 'bill' | 'partial' | 'personal'>('all')
  const [search, setSearch] = useState('')
  const accounts = useMemo(() => data.accounts.filter(account => account.status !== 'closed').filter(account => filter === 'all' || filter === 'open' && account.status === 'open' || filter === 'bill' && account.status === 'bill_requested' || filter === 'partial' && nightclubPaidTotal(account) > 0 && nightclubBalance(account) > 0 || filter === 'personal' && account.serviceTarget?.type === 'customer').filter(account => `${account.id} ${nightclubAccountLabel(account, data)} ${account.openedBy}`.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase())), [data, filter, search])
  return <div className="space-y-4"><header><h1 className="text-2xl font-black">Cuentas</h1><p className="text-sm text-slate-400">Saldos abiertos y trabajo pendiente de cobro.</p></header><div className="flex gap-2 overflow-x-auto pb-1">{([['all','Todas'],['open','Abiertas'],['bill','Por cobrar'],['partial','Pago parcial'],['personal','Sin mesa']] as const).map(([id,label]) => <button key={id} onClick={() => setFilter(id)} className={`h-10 shrink-0 rounded-full px-4 text-xs font-bold ${filter === id ? 'bg-amber-400 text-slate-950' : 'bg-slate-800'}`}>{label}</button>)}</div><label className="flex h-11 max-w-xl items-center gap-2 rounded-xl border border-slate-700 bg-slate-950 px-3"><Search size={16} /><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Buscar mesa, cliente, mesero o cuenta" className="flex-1 bg-transparent text-sm outline-none" /></label><div className="overflow-hidden rounded-xl border border-slate-700"><div className="hidden grid-cols-[1.3fr_1fr_repeat(3,.7fr)_auto] gap-3 bg-slate-900 px-4 py-2 text-xs font-bold text-slate-400 md:grid"><span>Cuenta</span><span>Responsable</span><span>Consumido</span><span>Pagado</span><span>Saldo</span><span>Acciones</span></div>{accounts.map(account => <article key={account.id} className="grid gap-3 border-t border-slate-800 p-4 first:border-t-0 md:grid-cols-[1.3fr_1fr_repeat(3,.7fr)_auto] md:items-center"><div><strong>{nightclubAccountLabel(account, data)}</strong><span className="block text-xs text-slate-400">#{account.id.slice(-8)} · {account.status === 'bill_requested' ? 'Por cobrar' : 'Abierta'}</span></div><span className="text-sm">{account.openedBy}</span><Value label="Consumido" value={money(account.subtotal)} /><Value label="Pagado" value={money(nightclubPaidTotal(account))} /><Value label="Saldo" value={money(nightclubBalance(account))} /><div className="flex flex-wrap gap-2 md:justify-end">{account.status === 'open' && <><button onClick={() => onGoToPOS(account)} className="h-10 rounded-lg bg-slate-800 px-3 text-xs font-bold">POS</button><button onClick={() => onRequestBill(account.id)} className="h-10 rounded-lg border border-cyan-400 px-3 text-xs font-bold text-cyan-200">Enviar a cobro</button></>}{account.status === 'bill_requested' && <>{canPay && <button onClick={() => onPay(account)} className="h-10 rounded-lg bg-emerald-400 px-3 text-xs font-black text-slate-950">Cobrar</button>}{canReopen && <button onClick={() => onReopenBill(account.id)} className="h-10 rounded-lg border border-amber-400 px-3 text-xs font-bold text-amber-200">Reabrir</button>}</>}</div></article>)}{!accounts.length && <p className="p-6 text-sm text-slate-400">No hay cuentas para este filtro.</p>}</div></div>
}

function Value({ label, value }: { label: string; value: string }) { return <span className="text-sm"><i className="mr-2 not-italic text-xs text-slate-500 md:hidden">{label}</i><b>{value}</b></span> }
