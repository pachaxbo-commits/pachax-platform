import { useCallback, useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { gateway } from '../../services/gateway'

type BillingDate = string | number | { seconds?: number; _seconds?: number; toDate?: () => Date } | null
type Charge = { id: string; kind: string; amountMinor: number; paidMinor: number; pendingMinor: number; currency: string; status: string; dueAt?: BillingDate; monthsCovered?: number }
type Payment = { id: string; chargeId: string; amountMinor: number; currency: string; method: string; bankReference: string; status: string; rejectionReason?: string | null; recordedAt?: BillingDate; confirmedAt?: BillingDate }
type BillingOverview = {
  enrolled: boolean
  status: string
  daysRemaining: number | null
  subscription: null | { companyName: string; planName: string; currency: string; recurringMinor: number; billingCycle: string; currentPeriodStart?: BillingDate; currentPeriodEnd?: BillingDate; nextRenewalAt?: BillingDate; billingAccessUntil?: BillingDate; monthsCovered?: number; gracePeriodDays: number }
  charges: Charge[]
  payments: Payment[]
  paymentMethods: null | { qrEnabled: boolean; qrImageUrl: string; transferEnabled: boolean; bankName: string; accountHolder: string; accountIdentifier: string; instructions: string; whatsappNumber: string }
  contactUrl: string | null
}

function dateLabel(value?: BillingDate) {
  if (!value) return '—'
  const date = typeof value === 'object' && value && 'toDate' in value && typeof value.toDate === 'function'
    ? value.toDate()
    : typeof value === 'object' && value ? new Date(((value.seconds ?? value._seconds) || 0) * 1000)
      : new Date(value)
  return Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat('es-BO', { timeZone: 'America/La_Paz', dateStyle: 'medium' }).format(date) : '—'
}

function currencyLabel(minor = 0, currency = 'BOB') {
  return `${currency} ${(minor / 100).toFixed(2)}`
}

const statusLabels: Record<string, string> = {
  pending: 'Pendiente de activación', active: 'Activa y al día', overdue: 'Próxima a vencer', grace: 'Período de gracia',
  expired: 'Vencida; acceso operativo restringido', suspended: 'Suspendida por PACHAX', cancelled: 'Cancelada', not_enrolled: 'Sin contrato comercial registrado',
}

export function TenantBillingPortal({ tenantId, role, regularizationOnly = false }: { tenantId: string; role: string; regularizationOnly?: boolean }) {
  const isOwner = role === 'owner'
  const [overview, setOverview] = useState<BillingOverview | null>(null)
  const [open, setOpen] = useState(regularizationOnly)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [selectedCharge, setSelectedCharge] = useState('')
  const [amount, setAmount] = useState('')
  const [bankReference, setBankReference] = useState('')
  const [method, setMethod] = useState<'bank_transfer' | 'bank_qr'>('bank_transfer')

  const refresh = useCallback(async () => {
    if (!isOwner) return
    setLoading(true)
    setError('')
    try {
      const result = await gateway<BillingOverview>('tenantGateway', { action: 'getMyBillingOverview', tenantId })
      setOverview(result)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo consultar la suscripción.')
    } finally {
      setLoading(false)
    }
  }, [isOwner, tenantId])

  useEffect(() => {
    const timer = window.setTimeout(() => { void refresh() }, 0)
    return () => window.clearTimeout(timer)
  }, [refresh])

  const unpaidCharges = useMemo(() => (overview?.charges || []).filter(charge =>
    ['initial', 'renewal'].includes(charge.kind) && ['due', 'partial', 'under_review'].includes(charge.status)
    && charge.amountMinor - charge.paidMinor - charge.pendingMinor > 0), [overview])
  const currentCharge = unpaidCharges.find(charge => charge.id === selectedCharge) || unpaidCharges[0]
  const methods = overview?.paymentMethods
  const status = overview?.status || 'not_enrolled'
  const shouldWarn = overview?.enrolled && ((overview.daysRemaining != null && overview.daysRemaining <= 7)
    || ['grace', 'expired', 'suspended', 'cancelled'].includes(status))
  const totalOutstandingMinor = (overview?.charges || []).reduce((sum, charge) =>
    sum + Math.max(0, charge.amountMinor - charge.paidMinor - charge.pendingMinor), 0)
  const warningText = status === 'grace'
    ? `Tu acceso sigue habilitado durante la gracia hasta ${dateLabel(overview?.subscription?.billingAccessUntil)}. Regulariza para evitar la restricción.`
    : status === 'expired' ? 'El período de gracia terminó. Las operaciones están restringidas; tus datos se conservan.'
      : status === 'suspended' ? 'La cuenta está suspendida por PACHAX. Un pago no la reactiva automáticamente.'
        : status === 'cancelled' ? 'El contrato está cancelado. Contacta a PACHAX para revisar los siguientes pasos.'
          : overview?.daysRemaining === 0 ? 'El período pagado vence hoy.'
            : overview?.daysRemaining != null && overview.daysRemaining <= 3 ? `Quedan ${overview.daysRemaining} día${overview.daysRemaining === 1 ? '' : 's'} para el vencimiento.`
              : overview?.daysRemaining != null ? `Vence en ${overview.daysRemaining} días.` : 'Revisa el estado de tu suscripción.'
  const noticeKey = `pachax-billing-notice:${tenantId}:${status}:${dateLabel(overview?.subscription?.currentPeriodEnd)}`
  const [dismissedNoticeKey, setDismissedNoticeKey] = useState<string | null>(null)
  const noticeDismissed = dismissedNoticeKey === noticeKey
    || (typeof window !== 'undefined' && window.sessionStorage.getItem(noticeKey) === 'dismissed')

  const submitReference = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!currentCharge) return
    setSaving(true)
    setError('')
    setMessage('')
    try {
      const result = await gateway<{ paymentId: string }>('tenantGateway', {
        action: 'recordManualPaymentReference', tenantId, chargeId: currentCharge.id,
        amount, method, bankReference, requestId: crypto.randomUUID(),
      })
      setMessage(`Referencia recibida (${result.paymentId}). El pago queda pendiente de conciliación por PACHAX.`)
      setAmount('')
      setBankReference('')
      await refresh()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo registrar la referencia.')
    } finally {
      setSaving(false)
    }
  }

  if (!isOwner) return null

  return <>
    {!regularizationOnly && shouldWarn && !noticeDismissed && <aside role="status" className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-3 border-b border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950 sm:px-5">
      <p><strong>{statusLabels[status] || 'Revisa tu suscripción'}.</strong> {warningText}</p>
      <div className="flex items-center gap-2"><button type="button" onClick={() => setOpen(true)} className="rounded-lg bg-amber-900 px-3 py-1.5 text-xs font-bold text-white">Ver suscripción</button><button type="button" aria-label="Cerrar aviso por esta sesión" onClick={() => { window.sessionStorage.setItem(noticeKey, 'dismissed'); setDismissedNoticeKey(noticeKey) }} className="rounded-lg border border-amber-300 px-2 py-1.5 text-xs">Cerrar aviso</button></div>
    </aside>}
    {!regularizationOnly && <div className="mx-auto flex w-full max-w-6xl justify-end px-3 py-1 sm:px-5">
      <button type="button" onClick={() => setOpen(true)} className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">Mi empresa · Suscripción y pagos</button>
    </div>}
    {open && <div className="fixed inset-0 z-[100] flex items-end justify-center bg-slate-950/50 p-0 sm:items-center sm:p-4" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setOpen(false) }}>
      <section role="dialog" aria-modal="true" aria-labelledby="tenant-billing-title" className="max-h-[92dvh] w-full max-w-2xl overflow-y-auto rounded-t-2xl bg-white p-4 shadow-2xl sm:rounded-2xl sm:p-6">
        <header className="flex items-start justify-between gap-4"><div><h2 id="tenant-billing-title" className="text-lg font-bold text-slate-950">Suscripción y pagos</h2><p className="mt-1 text-sm text-slate-600">Información privada de esta empresa. Los pagos por QR o transferencia requieren conciliación de PACHAX. Este registro comercial no es una factura fiscal.</p></div>{!regularizationOnly && <button type="button" onClick={() => setOpen(false)} className="rounded-lg border px-3 py-2 text-sm">Cerrar</button>}</header>
        {loading && <p className="mt-4 text-sm text-slate-600">Consultando suscripción…</p>}
        {error && <p role="alert" className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-900">{error}</p>}
        {message && <p role="status" className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">{message}</p>}
        {overview && <div className="mt-4 space-y-4">
          <section className="rounded-xl border border-slate-200 p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Estado</p><p className="mt-1 font-bold text-slate-900">{statusLabels[status] || status}</p></div>{overview.enrolled && <p className="text-right text-sm text-slate-700">{overview.subscription?.planName}<br />{currencyLabel(overview.subscription?.recurringMinor, overview.subscription?.currency)} / {overview.subscription?.billingCycle === 'annual' ? 'año' : 'mes'}</p>}</div>
            {overview.subscription && <dl className="mt-3 grid grid-cols-1 gap-2 text-sm sm:grid-cols-2"><div><dt className="text-xs text-slate-500">Inicio del período actual</dt><dd className="font-semibold">{dateLabel(overview.subscription.currentPeriodStart)}</dd></div><div><dt className="text-xs text-slate-500">Período pagado hasta</dt><dd className="font-semibold">{dateLabel(overview.subscription.currentPeriodEnd)}</dd></div><div><dt className="text-xs text-slate-500">Próximo vencimiento</dt><dd className="font-semibold">{dateLabel(overview.subscription.nextRenewalAt)}</dd></div><div><dt className="text-xs text-slate-500">Acceso durante gracia hasta</dt><dd className="font-semibold">{dateLabel(overview.subscription.billingAccessUntil)}</dd></div><div><dt className="text-xs text-slate-500">Meses cubiertos</dt><dd className="font-semibold">{overview.subscription.monthsCovered || 1}</dd></div><div><dt className="text-xs text-slate-500">Saldo no cubierto</dt><dd className="font-semibold">{currencyLabel(totalOutstandingMinor, overview.subscription.currency)}</dd></div></dl>}
            {!overview.enrolled && <p className="mt-2 text-sm text-slate-600">Esta empresa no está vinculada a un contrato de suscripción administrado por PACHAX.</p>}
            {status === 'suspended' && <p className="mt-2 text-xs text-amber-800">La recepción de un pago no reactiva automáticamente una suspensión administrativa. PACHAX debe autorizar la reactivación.</p>}
            {status === 'cancelled' && <p className="mt-2 text-xs text-amber-800">El contrato está cancelado. Contacta a PACHAX; un pago no reactiva automáticamente el acceso.</p>}
          </section>
          <section className="rounded-xl border border-slate-200 p-4"><h3 className="font-bold">Métodos de pago disponibles</h3>
            {!methods && <p className="mt-2 text-sm text-slate-600">PACHAX todavía no configuró métodos de pago. No realices transferencias hasta recibir instrucciones oficiales.</p>}
            {methods?.qrEnabled && methods.qrImageUrl && <div className="mt-3"><p className="text-sm font-semibold">QR bancario oficial</p><img src={methods.qrImageUrl} alt="QR oficial de pago de PACHAX" referrerPolicy="no-referrer" className="mt-2 h-48 w-48 rounded-lg border object-contain" /></div>}
            {methods?.transferEnabled && <div className="mt-3 rounded-lg bg-slate-50 p-3 text-sm"><p><strong>Entidad:</strong> {methods.bankName}</p><p><strong>Titular:</strong> {methods.accountHolder}</p><p><strong>Identificador:</strong> {methods.accountIdentifier}</p></div>}
            {methods?.instructions && <p className="mt-3 whitespace-pre-wrap text-sm text-slate-700">{methods.instructions}</p>}
            {overview.contactUrl && <a href={`${overview.contactUrl}?text=${encodeURIComponent(`Hola PACHAX, necesito consultar la suscripción de ${overview.subscription?.companyName || 'mi empresa'}.`)}`} target="_blank" rel="noreferrer" className="mt-3 inline-flex rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm font-bold text-emerald-900">Contactar a PACHAX por WhatsApp</a>}
          </section>
          {unpaidCharges.length > 0 && methods && <form onSubmit={submitReference} className="space-y-3 rounded-xl border border-slate-200 p-4"><h3 className="font-bold">Informar una transferencia o pago QR</h3><p className="text-xs text-slate-600">La referencia no confirma el pago. No adjuntes datos de tarjeta ni credenciales bancarias.</p>
            <label className="block text-sm">Cargo<select value={currentCharge?.id || ''} onChange={event => setSelectedCharge(event.target.value)} className="mt-1 min-h-11 w-full rounded-lg border bg-white px-3">{unpaidCharges.map(charge => <option key={charge.id} value={charge.id}>{charge.kind === 'initial' ? 'Inicial' : 'Renovación'} · saldo {currencyLabel(charge.amountMinor - charge.paidMinor - charge.pendingMinor, charge.currency)}</option>)}</select></label>
            <label className="block text-sm">Importe informado<input required inputMode="decimal" value={amount} onChange={event => setAmount(event.target.value)} placeholder="Ej. 150.00" className="mt-1 min-h-11 w-full rounded-lg border px-3" /></label>
            <label className="block text-sm">Método<select value={method} onChange={event => setMethod(event.target.value as typeof method)} className="mt-1 min-h-11 w-full rounded-lg border bg-white px-3">{methods.transferEnabled && <option value="bank_transfer">Transferencia</option>}{methods.qrEnabled && <option value="bank_qr">QR bancario</option>}</select></label>
            <label className="block text-sm">Referencia bancaria<input required minLength={4} maxLength={120} value={bankReference} onChange={event => setBankReference(event.target.value)} className="mt-1 min-h-11 w-full rounded-lg border px-3" /></label>
            <button type="submit" disabled={saving || !currentCharge} className="min-h-11 w-full rounded-lg bg-blue-700 px-4 font-bold text-white disabled:opacity-50">{saving ? 'Enviando referencia…' : 'Enviar referencia para revisión'}</button>
          </form>}
          <section className="rounded-xl border border-slate-200 p-4"><h3 className="font-bold">Cargos pendientes</h3>{unpaidCharges.length === 0 ? <p className="mt-2 text-sm text-slate-600">No hay saldo pendiente registrado.</p> : <ul className="mt-2 divide-y">{unpaidCharges.map(charge => <li key={charge.id} className="py-2 text-sm">{charge.kind === 'initial' ? 'Cargo inicial' : 'Renovación'} · {currencyLabel(charge.amountMinor, charge.currency)} · pagado {currencyLabel(charge.paidMinor, charge.currency)} · en revisión {currencyLabel(charge.pendingMinor, charge.currency)} · {charge.status}</li>)}</ul>}</section>
          <section className="rounded-xl border border-slate-200 p-4"><h3 className="font-bold">Historial de pagos</h3>{overview.payments.length === 0 ? <p className="mt-2 text-sm text-slate-600">Todavía no hay pagos o referencias.</p> : <ul className="mt-2 divide-y">{overview.payments.map(payment => <li key={payment.id} className="py-2 text-sm"><div className="flex flex-wrap justify-between gap-2"><span>{currencyLabel(payment.amountMinor, payment.currency)} · {payment.method} · {payment.status}</span><span>{dateLabel(payment.confirmedAt || payment.recordedAt)}</span></div><p className="text-xs text-slate-600">Referencia {payment.bankReference}{payment.rejectionReason ? ` · ${payment.rejectionReason}` : ''}</p></li>)}</ul>}</section>
          <button type="button" onClick={() => void refresh()} disabled={loading} className="rounded-lg border px-3 py-2 text-sm font-semibold">{loading ? 'Actualizando…' : 'Actualizar estado'}</button>
        </div>}
      </section>
    </div>}
  </>
}
