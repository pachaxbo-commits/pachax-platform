import { useCallback, useEffect, useState } from 'react'
import { gateway } from '../../../services/gateway'
import { useCommercialConfig } from '../../store/commercialConfigStore'
import { useAdminAuth } from '../../auth/adminAuthStore'
import { OFFICIAL_WHATSAPP, type TemplateKey } from '../../../public/config/pricingConfig'
import type { FormEvent } from 'react'

interface CommercialIntent {
  id: string
  email: string
  companyName: string
  contactName?: string
  templateId: string
  businessType?: string
  branchCount?: number | null
  contactPhone?: string
  needs?: string
  status: string
  planSnapshot?: { planId?: string; name?: string; monthlyPrice?: number; annualPrice?: number; currency?: string } | null
  proposal?: { implementationOneTime?: number; monthlyPrice?: number; annualPrice?: number; currency?: string; extraIds?: string[]; status?: string }
  quote?: { status?: string; version?: number; initialDueMinor?: number; recurringMinor?: number; currency?: string; billingCycle?: 'monthly' | 'annual' }
  acceptance?: { channel?: string; reference?: string }
  contractId?: string
  requestedExtraSnapshots?: Array<{ id: string; title?: string; pricingType?: string }>
}

const INTAKE_TEMPLATES = [
  ['restaurant', 'Restaurante con salón'], ['distribution', 'Distribución'], ['nightclub', 'Nightclub / Lounge'],
  ['hamburger', 'Restaurante Rápido'], ['retail', 'Comercio / Venta rápida'],
] as const

export function CommercialIntentsSection() {
  const { user } = useAdminAuth()
  const { config } = useCommercialConfig()
  const [intents, setIntents] = useState<CommercialIntent[]>([])
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState('')
  const [nextStatus, setNextStatus] = useState<'new' | 'contacted' | 'qualified' | 'closed'>('new')
  const [implementation, setImplementation] = useState('')
  const [monthly, setMonthly] = useState('')
  const [annual, setAnnual] = useState('')
  const [currency, setCurrency] = useState<'USD' | 'BOB'>('USD')
  const [extraIds, setExtraIds] = useState<string[]>([])
  const [extraAmounts, setExtraAmounts] = useState<Record<string, { oneTime: string; monthly: string; annual: string }>>({})
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'annual'>('monthly')
  const [discount, setDiscount] = useState('0')
  const [discountReason, setDiscountReason] = useState('')
  const [acceptanceChannel, setAcceptanceChannel] = useState<'whatsapp' | 'email' | 'signed_document' | 'in_person'>('whatsapp')
  const [acceptanceReference, setAcceptanceReference] = useState('')
  const [dueAt, setDueAt] = useState(() => { const date = new Date(); date.setDate(date.getDate() + 7); return date.toISOString().slice(0, 10) })
  const [intakeOpen, setIntakeOpen] = useState(false)
  const [intake, setIntake] = useState({ contactName: '', companyName: '', email: '', contactPhone: '', templateId: 'distribution' as TemplateKey, planId: '', extraIds: [] as string[], billingCycle: 'monthly' as 'monthly' | 'annual', needs: '' })
  const [requestId, setRequestId] = useState(() => crypto.randomUUID())
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const selected = intents.find((intent) => intent.id === selectedId) || null
  const selectablePlans = config.plans.filter(plan => plan.templateId === intake.templateId && plan.status === 'published'
    && plan.priceApproval === 'approved' && plan.planKind !== 'free')
  const selectableExtras = config.extras.filter(extra => extra.status === 'published'
    && (extra.applicableTemplates === 'all' || extra.applicableTemplates.includes(intake.templateId)))
  const whatsAppMessage = selected
    ? selected.quote
      ? `Hola, compartimos la propuesta PACHAX para ${selected.companyName}. Referencia ${selected.id}. Pago inicial ${((selected.quote.initialDueMinor ?? 0) / 100).toFixed(2)} ${selected.quote.currency || ''}; renovación ${((selected.quote.recurringMinor ?? 0) / 100).toFixed(2)} ${selected.quote.currency || ''} por ciclo ${selected.quote.billingCycle || 'mensual'}. Por favor revisa las condiciones y responde para coordinar.`
      : `Hola, recibimos la solicitud de ${selected.companyName} para ${selected.templateId}. Referencia ${selected.id}. Queremos conversar sobre la cotización y los siguientes pasos.`
    : ''
  const whatsAppUrl = selected ? OFFICIAL_WHATSAPP.buildUrl(whatsAppMessage) : ''
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
        action: 'saveCommercialQuote', intentId: selected.id, requestId,
        implementation, monthly, annual, currency, billingCycle, discount, discountReason,
        extras: extraIds.map(id => ({ id, ...(extraAmounts[id] || { oneTime: '0', monthly: '0', annual: '0' }) })),
      })
      setMessage('Cotización guardada como borrador. No activa contratación ni suscripción.')
      setRequestId(crypto.randomUUID())
      await refresh()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo guardar la propuesta.')
    } finally {
      setSaving(false)
    }
  }

  const createManualIntent = async (event: FormEvent) => {
    event.preventDefault()
    setSaving(true); setError(''); setMessage('')
    try {
      const result = await gateway<{ intentId: string }>('platformGateway', { action: 'createManualCommercialIntent', requestId, ...intake, planId: intake.planId || null })
      setMessage(`Solicitud registrada (${result.intentId}). No crea una empresa ni una suscripción.`)
      setRequestId(crypto.randomUUID())
      setIntakeOpen(false)
      setIntake({ contactName: '', companyName: '', email: '', contactPhone: '', templateId: 'distribution', planId: '', extraIds: [], billingCycle: 'monthly', needs: '' })
      await refresh()
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'No se pudo registrar la solicitud.') }
    finally { setSaving(false) }
  }

  const offerQuote = async () => {
    if (!selected) return
    setSaving(true); setError(''); setMessage('')
    try {
      await gateway('platformGateway', { action: 'offerCommercialQuote', intentId: selected.id, requestId: crypto.randomUUID() })
      setMessage('Cotización marcada como ofrecida. Registra la aceptación del cliente antes de crear el contrato.')
      await refresh()
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'No se pudo ofrecer la cotización.') }
    finally { setSaving(false) }
  }

  const withdrawQuote = async () => {
    if (!selected) return
    setSaving(true); setError(''); setMessage('')
    try {
      await gateway('platformGateway', { action: 'withdrawCommercialQuote', intentId: selected.id, requestId: crypto.randomUUID() })
      setMessage('Oferta retirada. Puedes preparar una nueva versión sin alterar contratos anteriores.')
      await refresh()
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'No se pudo retirar la oferta.') }
    finally { setSaving(false) }
  }

  const recordAcceptance = async () => {
    if (!selected) return
    setSaving(true); setError(''); setMessage('')
    try {
      await gateway('platformGateway', { action: 'recordCommercialAcceptance', intentId: selected.id, requestId: crypto.randomUUID(), channel: acceptanceChannel, reference: acceptanceReference })
      setMessage('Aceptación registrada para auditoría.')
      await refresh()
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'No se pudo registrar la aceptación.') }
    finally { setSaving(false) }
  }

  const createContract = async () => {
    if (!selected) return
    setSaving(true); setError(''); setMessage('')
    try {
      const date = new Date(`${dueAt}T12:00:00-04:00`).toISOString()
      const result = await gateway<{ contractId: string; chargeId: string }>('platformGateway', { action: 'createCommercialContract', intentId: selected.id, requestId: crypto.randomUUID(), dueAt: date })
      setMessage(`Contrato ${result.contractId} y cargo ${result.chargeId} creados, pendientes de pago.`)
      await refresh()
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'No se pudo crear el contrato.') }
    finally { setSaving(false) }
  }

  const updateStatus = async () => {
    if (!selected) return
    setSaving(true)
    setMessage('')
    setError('')
    try {
      await gateway('platformGateway', {
        action: 'updateCommercialIntentStatus', intentId: selected.id, status: nextStatus, requestId: crypto.randomUUID(),
      })
      setMessage('Estado de solicitud actualizado.')
      await refresh()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo actualizar el estado.')
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
          <p className="mt-1 text-sm text-slate-600">Prepara cotizaciones. El contrato se activa después de la aceptación, el pago manual verificado y el alta asistida.</p>
        </div>
        <div className="flex gap-2"><button type="button" onClick={() => { setLoading(true); setError(''); void refresh() }} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-800">Actualizar</button><button type="button" onClick={() => setIntakeOpen(value => !value)} className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white">Registrar contacto de WhatsApp</button></div>
      </header>

      {intakeOpen && <form onSubmit={createManualIntent} className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:grid-cols-2">
        <h3 className="sm:col-span-2 font-bold">Nueva solicitud recibida directamente</h3>
        <label className="text-sm">Nombre de contacto<input required minLength={2} maxLength={100} value={intake.contactName} onChange={event => setIntake({ ...intake, contactName: event.target.value })} className="mt-1 w-full rounded-lg border p-2" /></label>
        <label className="text-sm">Empresa<input required minLength={2} maxLength={120} value={intake.companyName} onChange={event => setIntake({ ...intake, companyName: event.target.value })} className="mt-1 w-full rounded-lg border p-2" /></label>
        <label className="text-sm">Correo<input required type="email" maxLength={160} value={intake.email} onChange={event => setIntake({ ...intake, email: event.target.value })} className="mt-1 w-full rounded-lg border p-2" /></label>
        <label className="text-sm">Teléfono / WhatsApp<input required type="tel" minLength={5} maxLength={40} value={intake.contactPhone} onChange={event => setIntake({ ...intake, contactPhone: event.target.value })} className="mt-1 w-full rounded-lg border p-2" /></label>
        <label className="text-sm">Plantilla<select value={intake.templateId} onChange={event => setIntake({ ...intake, templateId: event.target.value as TemplateKey, planId: '', extraIds: [] })} className="mt-1 w-full rounded-lg border bg-white p-2">{INTAKE_TEMPLATES.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>
        <label className="text-sm">Ciclo solicitado<select value={intake.billingCycle} onChange={event => setIntake({ ...intake, billingCycle: event.target.value as 'monthly' | 'annual' })} className="mt-1 w-full rounded-lg border bg-white p-2"><option value="monthly">Mensual</option><option value="annual">Anual</option></select></label>
        <label className="text-sm">Plan publicado (opcional)<select value={intake.planId} onChange={event => setIntake({ ...intake, planId: event.target.value })} className="mt-1 w-full rounded-lg border bg-white p-2"><option value="">Sin plan aprobado · solicitar cotización</option>{selectablePlans.map(plan => <option key={plan.id} value={plan.id}>{plan.name}</option>)}</select></label>
        {selectableExtras.length > 0 && <fieldset className="space-y-1 rounded-lg border p-3 text-sm sm:col-span-2"><legend className="px-1 font-semibold">Extras publicados solicitados (opcional)</legend>{selectableExtras.map(extra => <label key={extra.id} className="flex items-center gap-2"><input type="checkbox" checked={intake.extraIds.includes(extra.id)} onChange={event => setIntake(current => ({ ...current, extraIds: event.target.checked ? [...current.extraIds, extra.id] : current.extraIds.filter(id => id !== extra.id) }))} />{extra.title}</label>)}</fieldset>}
        <label className="text-sm sm:col-span-2">Necesidades<textarea maxLength={1500} value={intake.needs} onChange={event => setIntake({ ...intake, needs: event.target.value })} className="mt-1 w-full rounded-lg border p-2" rows={3} /></label>
        <p className="text-xs text-slate-600 sm:col-span-2">Solo registra el contacto. No crea tenant, contrato, suscripción ni cobro.</p>
        <button type="submit" disabled={saving} className="rounded-lg bg-blue-700 p-2 font-bold text-white disabled:opacity-50 sm:col-span-2">{saving ? 'Guardando…' : 'Registrar contacto'}</button>
      </form>}

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
                      setNextStatus(['new', 'contacted', 'qualified', 'closed'].includes(intent.status) ? intent.status as 'new' | 'contacted' | 'qualified' | 'closed' : 'new')
                      setImplementation(String(intent.proposal?.implementationOneTime ?? ''))
                      setMonthly(String(intent.proposal?.monthlyPrice ?? intent.planSnapshot?.monthlyPrice ?? ''))
                      setAnnual(String(intent.proposal?.annualPrice ?? intent.planSnapshot?.annualPrice ?? ''))
                      setCurrency(intent.proposal?.currency === 'BOB' || intent.planSnapshot?.currency === 'BOB' ? 'BOB' : 'USD')
                      setBillingCycle(intent.quote?.billingCycle || 'monthly')
                      setDiscount('0')
                      setDiscountReason('')
                      setAcceptanceReference('')
                      setExtraIds(intent.proposal?.extraIds || intent.requestedExtraSnapshots?.map(extra => extra.id) || [])
                      setMessage('')
                      setError('')
                      setRequestId(crypto.randomUUID())
                    }}
                      className={`w-full p-4 text-left hover:bg-slate-50 ${selectedId === intent.id ? 'bg-blue-50' : ''}`}>
                      <span className="block font-semibold text-slate-900">{intent.companyName}</span>
                      <span className="mt-1 block text-xs text-slate-700">{intent.templateId} · {intent.email || intent.contactPhone || 'Sin contacto'}</span>
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
            <p className="mt-1 text-xs text-slate-700">Contacto: {selected.contactName || 'No indicado'} · {selected.businessType || 'Tipo de negocio no indicado'}{selected.branchCount ? ` · ${selected.branchCount} sucursales` : ''}</p>
            <p className="mt-1 text-xs text-slate-700">{selected.email} {selected.contactPhone ? `· ${selected.contactPhone}` : ''}</p>
            <a href={whatsAppUrl} target="_blank" rel="noreferrer" className="mt-3 inline-flex rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-900">Continuar por WhatsApp con referencia y resumen</a>
            <p className="mt-3 rounded-lg bg-slate-50 p-3 text-sm text-slate-800">{selected.needs || 'No se registraron necesidades adicionales.'}</p>
            {selected.requestedExtraSnapshots?.length ? <p className="mt-2 text-xs text-slate-700">Extras solicitados: {selected.requestedExtraSnapshots.map(extra => extra.title || extra.id).join(', ')}</p> : null}
            {selected.planSnapshot && <p className="mt-3 text-xs text-slate-700">Plan consultado: {selected.planSnapshot.name || selected.planSnapshot.planId} · {selected.planSnapshot.monthlyPrice} {selected.planSnapshot.currency}/mes (referencia guardada)</p>}
            {selected.contractId && <p className="mt-2 rounded bg-emerald-50 p-2 text-xs text-emerald-900">Contrato: {selected.contractId}. Consulta cargos y pagos en Facturación.</p>}
            <div className="mt-4 flex flex-col gap-2 sm:flex-row">
              <label className="flex-1 text-xs font-semibold text-slate-800">Estado de seguimiento<select value={nextStatus} onChange={(event) => setNextStatus(event.target.value as typeof nextStatus)} className="mt-1 min-h-10 w-full rounded-lg border border-slate-300 bg-white p-2 text-sm"><option value="new">Nueva</option><option value="contacted">Contactada</option><option value="qualified">Calificada</option><option value="closed">Cerrada</option></select></label>
              <button type="button" disabled={saving || nextStatus === selected.status} onClick={() => void updateStatus()} className="self-end rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-800 disabled:opacity-50">Actualizar estado</button>
            </div>
            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="text-xs font-semibold text-slate-800">Implementación única<input inputMode="decimal" value={implementation} onChange={(event) => setImplementation(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-sm" /></label>
              <label className="text-xs font-semibold text-slate-800">Mensualidad<input inputMode="decimal" value={monthly} onChange={(event) => setMonthly(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-sm" /></label>
              <label className="text-xs font-semibold text-slate-800">Anualidad<input inputMode="decimal" aria-describedby="quote-annual-help" value={annual} onChange={(event) => setAnnual(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-sm" /><span id="quote-annual-help" className="mt-1 block font-normal text-slate-600">Opcional para ciclo mensual; requerido para cotización anual.</span></label>
              <label className="text-xs font-semibold text-slate-800">Moneda<select value={currency} onChange={(event) => setCurrency(event.target.value as 'USD' | 'BOB')} className="mt-1 w-full rounded-lg border border-slate-300 bg-white p-2 text-sm"><option value="USD">USD</option><option value="BOB">BOB</option></select></label>
              <label className="text-xs font-semibold text-slate-800">Ciclo contratado<select value={billingCycle} onChange={event => setBillingCycle(event.target.value as 'monthly' | 'annual')} className="mt-1 w-full rounded-lg border border-slate-300 bg-white p-2 text-sm"><option value="monthly">Mensual</option><option value="annual">Anual</option></select></label>
              <label className="text-xs font-semibold text-slate-800">Descuento autorizado<input inputMode="decimal" value={discount} onChange={event => setDiscount(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-sm" /></label>
              {Number(discount) > 0 && <label className="text-xs font-semibold text-slate-800 sm:col-span-2">Motivo del descuento<input minLength={8} maxLength={500} value={discountReason} onChange={event => setDiscountReason(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-sm" /></label>}
            </div>
            {config.extras.filter((extra) => extra.status === 'published').length > 0 && <fieldset className="mt-4 space-y-2">
              <legend className="text-xs font-semibold text-slate-800">Extras propuestos</legend>
              {config.extras.filter((extra) => extra.status === 'published').map((extra) => <div key={extra.id} className="rounded border p-2 text-sm text-slate-800">
                <label className="flex items-center gap-2"><input type="checkbox" checked={extraIds.includes(extra.id)} onChange={(event) => setExtraIds((current) => event.target.checked ? [...current, extra.id] : current.filter((id) => id !== extra.id))} />{extra.title} · {extra.pricingType}</label>
                {extraIds.includes(extra.id) && <div className="mt-2 grid grid-cols-3 gap-2">{(extra.pricingType === 'recurring' ? ['monthly', 'annual'] as const : ['oneTime'] as const).map(kind => <label key={kind} className="text-[11px]">{kind === 'oneTime' ? 'Único' : kind === 'monthly' ? 'Mensual' : 'Anual'}<input inputMode="decimal" value={extraAmounts[extra.id]?.[kind] ?? '0'} onChange={event => { const existing = extraAmounts[extra.id] || { oneTime: '0', monthly: '0', annual: '0' }; setExtraAmounts(current => ({ ...current, [extra.id]: { ...existing, [kind]: event.target.value } })) }} className="mt-1 w-full rounded border p-1" /></label>)}</div>}
              </div>)}
            </fieldset>}
            {selected.quote && <p className="mt-3 rounded bg-slate-50 p-2 text-xs text-slate-700">Cotización v{selected.quote.version}: {selected.quote.status}{selected.quote.initialDueMinor !== undefined ? ` · inicial ${(selected.quote.initialDueMinor / 100).toFixed(2)} ${selected.quote.currency}` : ''}</p>}
            {!selected.acceptance && <button type="button" disabled={saving || Boolean(selected.contractId)} onClick={() => void prepare()} className="mt-5 w-full rounded-lg bg-slate-900 px-4 py-3 text-sm font-bold text-white disabled:opacity-60">{saving ? 'Guardando…' : 'Guardar cotización en borrador'}</button>}
            {selected.quote?.status === 'draft' && <button type="button" disabled={saving} onClick={() => void offerQuote()} className="mt-2 w-full rounded-lg bg-blue-700 px-4 py-3 text-sm font-bold text-white disabled:opacity-60">Ofrecer cotización al cliente</button>}
            {selected.quote?.status === 'offered' && !selected.acceptance && !selected.contractId && <button type="button" disabled={saving} onClick={() => void withdrawQuote()} className="mt-2 w-full rounded-lg border border-amber-300 px-4 py-2 text-sm font-semibold text-amber-900 disabled:opacity-60">Retirar oferta para corregirla</button>}
            {selected.quote?.status === 'offered' && !selected.acceptance && <div className="mt-3 space-y-2 rounded-lg border p-3"><label className="block text-xs font-semibold">Canal<select value={acceptanceChannel} onChange={event => setAcceptanceChannel(event.target.value as typeof acceptanceChannel)} className="mt-1 w-full rounded border bg-white p-2"><option value="whatsapp">WhatsApp</option><option value="email">Correo</option><option value="signed_document">Documento firmado</option><option value="in_person">Presencial</option></select></label><label className="block text-xs font-semibold">Referencia verificable de aceptación<input minLength={4} maxLength={300} value={acceptanceReference} onChange={event => setAcceptanceReference(event.target.value)} className="mt-1 w-full rounded border p-2" placeholder="ID de mensaje / documento / registro de llamada" /></label><button type="button" disabled={saving || acceptanceReference.trim().length < 4} onClick={() => void recordAcceptance()} className="w-full rounded-lg border p-2 text-sm font-bold">Registrar aceptación confirmada</button></div>}
            {selected.acceptance && !selected.contractId && <div className="mt-3 space-y-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3"><p className="text-xs text-emerald-900">Aceptación registrada ({selected.acceptance.channel}): {selected.acceptance.reference}</p><label className="block text-xs font-semibold">Vencimiento inicial<input type="date" value={dueAt} onChange={event => setDueAt(event.target.value)} className="mt-1 w-full rounded border p-2" /></label><button type="button" disabled={saving} onClick={() => void createContract()} className="w-full rounded-lg bg-emerald-700 p-2 text-sm font-bold text-white">Crear contrato y orden de cobro</button></div>}
            <p className="mt-2 text-xs text-slate-600">La cotización no publica precios ni activa tenant, suscripción, pago o entitlements. La aceptación registrada debe tener respaldo verificable.</p>
          </>}
        </div>
      </div>
    </section>
  )
}
