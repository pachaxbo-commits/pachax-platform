import { useState } from 'react'
import type { NightclubDataset, NightclubInventoryItem } from '../domain/nightclubAccounts'

const costUnitLabel = (item: NightclubInventoryItem, products: NightclubDataset['products']) => {
  if (item.bottleCapacityMl) return 'botella'
  if (item.displayUnit === 'kg' || item.unit === 'kg') return 'kg'
  if (item.displayUnit === 'l' || item.unit === 'l') return 'L'
  if (item.unit === 'g' || item.unit === 'ml') return item.unit
  const presentation = products.find(product => item.linkedProductIds?.includes(product.id))?.name.split(' - ').at(-1)?.toLowerCase()
  return presentation === 'botella' || presentation === 'lata' ? presentation : 'unidad'
}

export function NightclubInventoryCosts({ data, onSave }: { data: NightclubDataset; onSave: (item: NightclubInventoryItem) => boolean }) {
  const [editing, setEditing] = useState<string | null>(null)
  const [value, setValue] = useState('')
  return <section className="rounded-2xl border border-slate-800 bg-slate-900 p-4"><h2 className="font-bold">Costo interno de insumos</h2><p className="mt-1 text-xs text-slate-400">Costo de compra según la presentación física. Se usa sin cambiar los cálculos del inventario.</p><div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">{data.inventory.map(item => { const unit = costUnitLabel(item, data.products); return <div key={item.id} className="rounded-xl bg-slate-950 p-3 text-sm"><div className="flex justify-between gap-2"><strong>{item.name}</strong><span className="text-slate-400">por {unit}</span></div>{editing === item.id ? <div className="mt-2 flex gap-2"><input aria-label={'Costo por ' + unit + ' de ' + item.name} type="number" min="0" step="0.0001" value={value} onChange={event => setValue(event.target.value)} className="min-w-0 flex-1 rounded-lg border border-slate-700 bg-slate-900 p-2" /><button className="rounded-lg bg-purple-500 px-3 font-bold" onClick={() => { if (value !== '' && Number.isFinite(Number(value)) && Number(value) >= 0 && onSave({ ...item, unitCost: Number(value) })) setEditing(null) }}>Guardar</button></div> : <button onClick={() => { setEditing(item.id); setValue(item.unitCost === undefined ? '' : String(item.unitCost)) }} className="mt-2 text-xs text-purple-300">{item.unitCost === undefined ? 'Configurar costo' : 'Bs ' + item.unitCost + ' / ' + unit + ' - Editar'}</button>}</div> })}</div></section>
}

export function NightclubCourtesyInventoryMovements({ data }: { data: NightclubDataset }) {
  const movements = (data.inventoryMovements || []).filter(item => item.type === 'member_courtesy' || item.type === 'courtesy_reversal').slice().reverse()
  return <section className="rounded-2xl border border-slate-800 bg-slate-900 p-4"><h2 className="font-bold">Movimientos de cortesías de socios</h2><div className="mt-3 space-y-2">{movements.map(item => <div key={item.id} className="flex flex-wrap items-start justify-between gap-2 rounded-xl bg-slate-950 p-3 text-xs"><div><strong>{item.type === 'member_courtesy' ? 'SALIDA · Cortesía de socio' : 'ENTRADA · Anulación de cortesía'}</strong><p className="mt-1 text-slate-300">{data.inventory.find(stock => stock.id === item.inventoryId)?.name || item.inventoryId} · {item.quantity > 0 ? '+' : ''}{item.quantity} {data.inventory.find(stock => stock.id === item.inventoryId)?.unit}</p><p className="text-slate-400">Socio: {(data.members || []).find(member => member.id === item.memberId)?.name || item.memberId} · Mesa: {data.tables.find(table => table.id === data.accounts.find(account => account.id === item.accountId)?.tableId)?.name || '—'} · {item.actor}</p></div><span className="text-slate-400">{new Date(item.at).toLocaleString('es-BO')}</span></div>)}{!movements.length && <p className="text-sm text-slate-400">Sin movimientos de cortesías.</p>}</div></section>
}
