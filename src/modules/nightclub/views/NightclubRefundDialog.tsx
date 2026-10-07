import { useState } from 'react'

export function NightclubRefundDialog({ onCancel, onConfirm }: { onCancel: () => void; onConfirm: (reason: string) => void }) {
  const [reason, setReason] = useState('')
  return <div className="fixed inset-0 z-[80] grid place-items-center bg-black/75 p-4">
    <section role="dialog" aria-modal="true" aria-label="Reembolsar ronda" className="w-full max-w-md space-y-4 rounded-2xl border border-amber-300/30 bg-[#10191e] p-5 text-white">
      <h2 className="text-xl font-bold">Reembolsar ronda</h2>
      <label className="block text-sm">Motivo del reembolso<input autoFocus value={reason} onChange={event => setReason(event.target.value)} minLength={4} className="mt-2 w-full rounded-xl border border-slate-600 bg-slate-950 p-3 text-white" /></label>
      <p className="text-xs text-slate-400">Ingresa al menos cuatro caracteres. Esta operación queda en el historial de la simulación.</p>
      <div className="flex gap-2"><button onClick={onCancel} className="flex-1 rounded-xl border border-slate-600 p-3">Cancelar</button><button disabled={reason.trim().length < 4} onClick={() => onConfirm(reason.trim())} className="flex-1 rounded-xl bg-amber-300 p-3 font-bold text-slate-950 disabled:opacity-40">Confirmar reembolso</button></div>
    </section>
  </div>
}
