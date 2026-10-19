import { useMemo, useState } from 'react'

type RefundItem = { id: string; name: string; quantity: number; unitPrice: number; lineTotal: number; refundedQuantity?: number; refundInventory?: { eligible?: boolean } }
export type NightclubRefundRequest = { reason: string; returnToStock: boolean; items: Array<{ itemId: string; quantity: number; returnToStock: boolean }> }
export function NightclubRefundDialog({ onCancel, onConfirm, items = [] }: { onCancel: () => void; onConfirm: (value: NightclubRefundRequest) => void | Promise<boolean | void>; items?: RefundItem[] }) {
  const [reason, setReason] = useState('')
  const [returnToStock, setReturnToStock] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const available = useMemo(() => items.map(item => ({ ...item, remaining: item.quantity - Number(item.refundedQuantity || 0) })).filter(item => item.remaining > 0), [items])
  const [quantities, setQuantities] = useState<Record<string, number>>(() => Object.fromEntries(items.map(item => [item.id, item.quantity - Number(item.refundedQuantity || 0)])))
  const selected = available.filter(item => Number(quantities[item.id] || 0) > 0)
  const total = selected.reduce((sum, item) => sum + item.lineTotal / item.quantity * Math.min(item.remaining, Number(quantities[item.id] || 0)), 0)
  const canPhysical = selected.length > 0 && selected.every(item => item.refundInventory?.eligible === true)
  if (!available.length) return null
  const confirm = async () => {
    setSubmitting(true)
    try {
      await onConfirm({ reason: reason.trim(), returnToStock, items: selected.map(item => ({ itemId: item.id, quantity: Number(quantities[item.id]), returnToStock })) })
    } finally {
      setSubmitting(false)
    }
  }
  return <div className="fixed inset-0 z-[80] grid place-items-center bg-black/75 p-4"><section role="dialog" aria-modal="true" aria-label="Reembolso parcial" className="w-full max-w-lg space-y-4 rounded-2xl border border-amber-300/30 bg-[#10191e] p-5 text-white"><div><h2 className="text-xl font-bold">Devolver productos</h2><p className="text-sm text-slate-400">Selecciona cantidad. El importe se calcula con el precio original.</p></div><div className="space-y-2">{available.map(item => <label key={item.id} className="grid grid-cols-[1fr_84px] gap-3 rounded-xl border border-slate-700 p-3 text-sm"><span><strong className="block">{item.name}</strong><small className="text-slate-400">Vendidos: {item.quantity} · Ya devueltos: {item.refundedQuantity || 0} · Disponibles: {item.remaining} · Bs {item.unitPrice.toFixed(2)} c/u</small></span><input aria-label={`Cantidad a devolver ${item.name}`} type="number" min="0" max={item.remaining} value={quantities[item.id] || 0} onChange={event => setQuantities(current => ({ ...current, [item.id]: Math.max(0, Math.min(item.remaining, Math.floor(Number(event.target.value) || 0))) }))} className="h-10 rounded-lg bg-slate-950 px-2 text-center" /></label>)}</div><p className="rounded-xl bg-slate-900 p-3 text-sm font-bold">Total a devolver: Bs {total.toFixed(2)}</p><label className="block text-sm">Motivo<input autoFocus value={reason} onChange={event => setReason(event.target.value)} minLength={4} className="mt-2 w-full rounded-xl border border-slate-600 bg-slate-950 p-3 text-white" /></label><fieldset className="space-y-2 rounded-xl border border-slate-700 p-3"><legend className="px-1 text-sm font-semibold">¿El producto regresó físicamente y puede volver a venderse?</legend><label className="flex gap-2 text-sm"><input type="radio" checked={!returnToStock} onChange={() => setReturnToStock(false)} /> No, únicamente devolver el dinero.</label><label className="flex gap-2 text-sm text-emerald-200"><input type="radio" checked={returnToStock} disabled={!canPhysical} onChange={() => setReturnToStock(true)} /> Sí, devolver el producto al inventario.</label>{!canPhysical && <p className="text-xs text-slate-400">Solo unidades cerradas recuperadas pueden regresar al inventario.</p>}</fieldset><div className="flex gap-2"><button disabled={submitting} onClick={onCancel} className="flex-1 rounded-xl border border-slate-600 p-3">Cancelar</button><button disabled={submitting || reason.trim().length < 4 || !selected.length} onClick={() => void confirm()} className="flex-1 rounded-xl bg-amber-300 p-3 font-bold text-slate-950 disabled:opacity-40">{submitting ? 'Confirmando…' : 'Confirmar devolución'}</button></div></section></div>
}
