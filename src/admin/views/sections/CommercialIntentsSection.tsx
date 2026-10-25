import { useCallback, useEffect, useState } from 'react'
import { gateway } from '../../../services/gateway'
import { useCommercialConfig } from '../../store/commercialConfigStore'
import { useAdminAuth } from '../../auth/adminAuthStore'

interface CommercialIntent {
  id: string
  email: string
  companyName: string
  templateId: string
  contactPhone?: string
  needs?: string
  status: string
  planSnapshot?: { planId?: string; name?: string; monthlyPrice?: number; annualPrice?: number; currency?: string } | null
  proposal?: { implementationOneTime?: number; monthlyPrice?: number; annualPrice?: number; currency?: string; extraIds?: string[]; status?: string }
}

export function CommercialIntentsSection() {
  const { user } = useAdminAuth()
  const { config } = useCommercialConfig()
  const [intents, setIntents] = useState<CommercialIntent[]>([])
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState('')
  const [implementation, setImplementation] = useState('')
  const [monthly, setMonthly] = useState('')
  const [annual, setAnnual] = useState('')
  const [currency, setCurrency] = useState<'USD' | 'BOB'>('USD')
  const [extraIds, setExtraIds] = useState<string[]>([])
  const [requestId, setRequestId] = useState(() => crypto.randomUUID())
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const selected = intents.find((intent) => intent.id === selectedId) || null
  const refresh = useCallback(async (cursor?: string, append = false) => {
    try {
      const result = await gateway<{ intents: CommercialIntent[]; nextCursor: string | null }>('platformGateway', {
        action: 'listCommercialIntents', limit: 50, ...(cursor ? { cursor } : {}),
      })
      const records = Array.isArray(result?.intents) ? result.intents : []
      setIntents((current) => append ? [...current, ...records.filter((record) => !current.some((item) => item.id === record.id))] : records)
      setNextCursor(result?.nextCursor || null)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudieron consultar las solicitudes.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const timer = window.setTimeout(() => { void refresh() }, 0)
    return () => window.clearTimeout(timer)
  }, [refresh])

  const prepare = async () => {
    if (!selected) return
    setSaving(true)
    setMessage('')
    setError('')
    try {
      await gateway('platformGateway', {
        action: 'prepareCommercialProposal', intentId: selected.id, requestId,
        implementationOneTime: Number(implementation), monthlyPrice: Number(monthly),
        annualPrice: Number(annual), currency, extraIds,
      })
      setMessage('Propuesta guardada como borrador. No activa contratación ni suscripción.')
      setRequestId(crypto.randomUUID())
      await refresh()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo guardar la propuesta.')
    } finally {
      setSaving(false)
    }
  }

  if (!['platform_owner', 'platform_admin'].includes(user?.role || '')) {
    return <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">Tu rol no puede gestionar solicitudes comerciales.</div>
  }

  return (
    <section className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Solicitudes comerciales</h2>
          <p className="mt-1 text-sm text-slate-600">Prepara propuestas no vinculantes. La activación y facturación siguen deshabilitadas.</p>
        </div>
        <button type="button" onClick={() => { setLoading(true); setError(''); void refresh() }} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-800">Actualizar</button>
      </header>

      {message && <div role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">{message}</div>}
      {error && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-900">{error}</div>}

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(320px,0.9fr)]">
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          {loading ? <p className="p-5 text-sm text-slate-600">Cargando solicitudes…</p>
            : intents.length === 0 ? <p className="p-5 text-sm text-slate-600">No hay solicitudes comerciales.</p>
              : <ul className="divide-y divide-slate-200">
                {intents.map((intent) => (
                  <li key={intent.id}>
                    <button type="button" onClick={() => {
                      setSelectedId(intent.id)
                      setImplementation(String(intent.proposal?.implementationOneTime ?? ''))
                      setMonthly(String(intent.proposal?.monthlyPrice ?? ''))
                      setAnnual(String(intent.proposal?.annualPrice ?? ''))
                      setCurrency(intent.proposal?.currency === 'BOB' ? 'BOB' : 'USD')
                      setExtraIds(intent.proposal?.extraIds || [])
                      setMessage('')
                      setError('')
                      setRequestId(crypto.randomUUID())
                    }}
                      className={`w-full p-4 text-left hover:bg-slate-50 ${selectedId === intent.id ? 'bg-blue-50' : ''}`}>
                      <span className="block font-semibold text-slate-900">{intent.companyName}</span>
                      <span className="mt-1 block text-xs text-slate-700">{intent.templateId} · {intent.email || 'Sin correo'}</span>
                      <span className="mt-1 block text-xs text-slate-600">{intent.status}{intent.proposal?.status === 'draft' ? ' · propuesta en borrador' : ''}</span>
                    </button>
                  </li>
                ))}
              </ul>}
          {!loading && nextCursor && <button type="button" onClick={() => { setLoading(true); void refresh(nextCursor, true) }} className="w-full border-t border-slate-200 p-3 text-sm font-semibold text-blue-800 hover:bg-blue-50">Cargar más solicitudes</button>}
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5">
          {!selected ? <p className="text-sm text-slate-600">Selecciona una solicitud para preparar una propuesta.</p> : <>
            <h3 className="font-bold text-slate-900">{selected.companyName}</h3>
            <p className="mt-1 text-xs text-slate-700">{selected.email} {selected.contactPhone ? `· ${selected.contactPhone}` : ''}</p>
            <p className="mt-3 rounded-lg bg-slate-50 p-3 text-sm text-slate-800">{selected.needs || 'No se registraron necesidades adicionales.'}</p>
            {selected.planSnapshot && <p className="mt-3 text-xs text-slate-700">Plan consultado: {selected.planSnapshot.name || selected.planSnapshot.planId} · {selected.planSnapshot.monthlyPrice} {selected.planSnapshot.currency}/mes (referencia guardada)</p>}
            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="text-xs font-semibold text-slate-800">Implementación única<input inputMode="decimal" value={implementation} onChange={(event) => setImplementation(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-sm" /></label>
              <label className="text-xs font-semibold text-slate-800">Mensualidad<input inputMode="decimal" value={monthly} onChange={(event) => setMonthly(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-sm" /></label>
              <label className="text-xs font-semibold text-slate-800">Anualidad<input inputMode="decimal" value={annual} onChange={(event) => setAnnual(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-sm" /></label>
              <label className="text-xs font-semibold text-slate-800">Moneda<select value={currency} onChange={(event) => setCurrency(event.target.value as 'USD' | 'BOB')} className="mt-1 w-full rounded-lg border border-slate-300 bg-white p-2 text-sm"><option value="USD">USD</option><option value="BOB">BOB</option></select></label>
            </div>
            {config.extras.filter((extra) => extra.status === 'published').length > 0 && <fieldset className="mt-4 space-y-2">
              <legend className="text-xs font-semibold text-slate-800">Extras propuestos</legend>
              {config.extras.filter((extra) => extra.status === 'published').map((extra) => <label key={extra.id} className="flex items-center gap-2 text-sm text-slate-800">
                <input type="checkbox" checked={extraIds.includes(extra.id)} onChange={(event) => setExtraIds((current) => event.target.checked ? [...current, extra.id] : current.filter((id) => id !== extra.id))} />{extra.title}
              </label>)}
            </fieldset>}
            <button type="button" disabled={saving} onClick={() => void prepare()} className="mt-5 w-full rounded-lg bg-slate-900 px-4 py-3 text-sm font-bold text-white disabled:opacity-60">{saving ? 'Guardando…' : 'Guardar propuesta en borrador'}</button>
            <p className="mt-2 text-xs text-slate-600">Esta propuesta no publica precios, no crea una empresa, no cobra ni concede entitlements.</p>
          </>}
        </div>
      </div>
    </section>
  )
}
