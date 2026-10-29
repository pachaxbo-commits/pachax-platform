import { useCallback, useEffect, useState } from 'react'
import { gateway } from '../../../services/gateway'
import { useAdminAuth } from '../../auth/adminAuthStore'
import type { FormEvent } from 'react'

type BillingKind = 'contracts' | 'charges' | 'payments' | 'subscriptions'
interface BillingRecord {
  id: string
  status: string
  contractId?: string
  businessType?: string
  chargeId?: string
  paymentId?: string
  tenantId?: string | null
  amountMinor?: number
  paidMinor?: number
  pendingMinor?: number
  currency?: string
  kind?: string
  dueAt?: { _seconds?: number; seconds?: number } | string
  customer?: { companyName?: string; email?: string; phone?: string }
  terms?: { companyName?: string; templateId?: string; initialDueMinor?: number; recurringMinor?: number; currency?: string; billingCycle?: string; plan?: { name?: string } | null }
  bankReference?: string
  method?: string
  createdAt?: { _seconds?: number; seconds?: number } | string
  nextRenewalAt?: { _seconds?: number; seconds?: number } | string
  templateId?: string
  planKey?: string | null
  billingCycle?: string
  pendingPlanChange?: { planSnapshot?: { name?: string }; effectiveAt?: { _seconds?: number; seconds?: number } }
}

interface BillingPlanOption { id: string; name: string; templateId: string; currency: string; monthlyMinor: number; annualMinor: number }

export interface PaidContractActivation {
  id: string
  status: string
  businessType?: string
  customer?: { companyName?: string; email?: string; contactName?: string }
}

const currencyLabel = (minor = 0, currency = 'BOB') => `${currency} ${(minor / 100).toFixed(2)}`
const dateLabel = (value?: BillingRecord['dueAt']) => {
  const seconds = typeof value === 'object' && value ? value.seconds ?? value._seconds : undefined
  const date = seconds ? new Date(seconds * 1000) : typeof value === 'string' ? new Date(value) : null
  return date && Number.isFinite(date.getTime()) ? date.toLocaleDateString('es-BO') : '—'
}

export function CommercialBillingSection({ onActivateContract }: { onActivateContract?: (contract: PaidContractActivation) => void }) {
  const { user } = useAdminAuth()
  const canView = ['platform_owner', 'platform_admin', 'platform_finance'].includes(user?.role || '')
  const canConfirm = ['platform_owner', 'platform_finance'].includes(user?.role || '')
  const [records, setRecords] = useState<Record<BillingKind, BillingRecord[]>>({ contracts: [], charges: [], payments: [], subscriptions: [] })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [selectedCharge, setSelectedCharge] = useState('')
  const [amount, setAmount] = useState('')
  const [bankReference, setBankReference] = useState('')
  const [method, setMethod] = useState<'bank_transfer' | 'bank_qr'>('bank_transfer')
  const [requestId, setRequestId] = useState(() => crypto.randomUUID())
  const [billingPlans, setBillingPlans] = useState<BillingPlanOption[]>([])
  const [planSelections, setPlanSelections] = useState<Record<string, string>>({})

  const loadBillingData = useCallback(async () => {
    const kinds: BillingKind[] = ['contracts', 'charges', 'payments', 'subscriptions']
    const results = await Promise.all(kinds.map(kind => gateway<{ records: BillingRecord[] }>('platformGateway', { action: 'listBillingRecords', kind, limit: 100 })))
    const nextRecords = Object.fromEntries(kinds.map((kind, index) => [kind, results[index].records || []])) as Record<BillingKind, BillingRecord[]>
    const nextPlans = ['platform_owner', 'platform_admin'].includes(user?.role || '')
      ? (await gateway<{ plans: BillingPlanOption[] }>('platformGateway', { action: 'listPublishedBillingPlans' })).plans || []
      : []
    return { records: nextRecords, plans: nextPlans }
  }, [user])

  const refresh = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const result = await loadBillingData()
      setRecords(result.records)
      setBillingPlans(result.plans)
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'No se pudo consultar la facturación.') }
    finally { setLoading(false) }
  }, [loadBillingData])

  useEffect(() => {
    let active = true
    void loadBillingData().then(result => {
      if (!active) return
      setRecords(result.records)
      setBillingPlans(result.plans)
    }).catch(cause => {
      if (active) setError(cause instanceof Error ? cause.message : 'No se pudo consultar la facturación.')
    }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [loadBillingData])

  const recordPayment = async (event: FormEvent) => {
    event.preventDefault(); setSaving(true); setError(''); setMessage('')
    try {
      const result = await gateway<{ paymentId: string }>('platformGateway', {
        action: 'recordManualPaymentReference', requestId, chargeId: selectedCharge, amount, method, bankReference,
      })
      setMessage(`Referencia registrada para verificación (${result.paymentId}). No está confirmada como pagada.`)
      setAmount(''); setBankReference(''); setRequestId(crypto.randomUUID())
      await refresh()
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'No se pudo registrar la referencia.') }
    finally { setSaving(false) }
  }

  const schedulePlanChange = async (subscription: BillingRecord) => {
    const [planId, billingCycle] = (planSelections[subscription.id] || '').split('|')
    if (!planId || !billingCycle) return
    setSaving(true); setError(''); setMessage('')
    try {
      await gateway('platformGateway', { action: 'requestSubscriptionPlanChange', requestId: crypto.randomUUID(), contractId: subscription.contractId, planId, billingCycle })
      setMessage('Cambio de plan programado para la siguiente renovación. Las condiciones del contrato vigente no se modifican.')
      await refresh()
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'No se pudo programar el cambio de plan.') }
    finally { setSaving(false) }
  }

  const createRenewal = async (subscription: BillingRecord) => {
    setSaving(true); setError(''); setMessage('')
    try {
      const dueAt = new Date(Date.now() + 7 * 86_400_000).toISOString()
      const result = await gateway<{ chargeId: string; reusedPendingCharge?: boolean }>('platformGateway', { action: 'createRenewalCharge', requestId: crypto.randomUUID(), contractId: subscription.contractId, dueAt })
      setMessage(`${result.reusedPendingCharge ? 'Se reutilizó el cargo pendiente' : 'Cargo de renovación creado'}: ${result.chargeId}.`)
      await refresh()
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'No se pudo crear el cargo de renovación.') }
    finally { setSaving(false) }
  }

  const changeStatus = async (subscription: BillingRecord, status: 'overdue' | 'suspended' | 'cancelled') => {
    if (!subscription.contractId || !window.confirm(`¿Confirmas cambiar la suscripción a ${status}? Se registrará en auditoría.`)) return
    setSaving(true); setError(''); setMessage('')
    try {
      await gateway('platformGateway', { action: 'changeSubscriptionStatus', requestId: crypto.randomUUID(), contractId: subscription.contractId, status, reason: `Cambio manual de estado solicitado desde Admin: ${status}.` })
      setMessage(`Suscripción actualizada: ${status}.`)
      await refresh()
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'No se pudo cambiar el estado.') }
    finally { setSaving(false) }
  }

  const reviewPayment = async (payment: BillingRecord, action: 'confirmManualPayment' | 'rejectManualPayment') => {
    if (action === 'confirmManualPayment' && !window.confirm('¿Confirmaste directamente que el dinero ingresó a la cuenta de PACHAX? La referencia o una captura no bastan.')) return
    setSaving(true); setError(''); setMessage('')
    try {
      await gateway('platformGateway', action === 'confirmManualPayment'
        ? { action, requestId: crypto.randomUUID(), paymentId: payment.id }
        : { action, requestId: crypto.randomUUID(), paymentId: payment.id, reason: 'Referencia no conciliada con ingreso bancario verificado.' })
      setMessage(action === 'confirmManualPayment' ? 'Pago confirmado por operador autorizado.' : 'Referencia rechazada y saldo reservado liberado.')
      await refresh()
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'No se pudo revisar el pago.') }
    finally { setSaving(false) }
  }

  if (!canView) return <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">Tu rol no puede consultar la facturación comercial.</div>

  return <section className="space-y-5">
    <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-4">
      <div><h2 className="text-xl font-bold">Facturación de PACHAX</h2><p className="mt-1 text-sm text-slate-600">Contratos, cargos y referencias manuales. No hay cobros automáticos ni pasarela activa.</p></div>
      <button type="button" onClick={() => void refresh()} disabled={loading} className="rounded-lg border px-3 py-2 text-sm font-semibold">{loading ? 'Actualizando…' : 'Actualizar'}</button>
    </header>
    {error && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-900">{error}</div>}
    {message && <div role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">{message}</div>}
    {canConfirm && <form onSubmit={recordPayment} className="grid gap-3 rounded-xl border bg-white p-4 sm:grid-cols-2">
      <h3 className="sm:col-span-2 font-bold">Registrar referencia recibida del cliente</h3>
      <label className="text-sm">Cargo pendiente<select required value={selectedCharge} onChange={event => setSelectedCharge(event.target.value)} className="mt-1 w-full rounded-lg border bg-white p-2"><option value="">Seleccionar cargo</option>{records.charges.filter(item => ['due', 'partial', 'under_review'].includes(item.status)).map(item => <option key={item.id} value={item.id}>{item.contractId} · {currencyLabel((item.amountMinor || 0) - (item.paidMinor || 0), item.currency)}</option>)}</select></label>
      <label className="text-sm">Importe recibido<input required inputMode="decimal" value={amount} onChange={event => setAmount(event.target.value)} className="mt-1 w-full rounded-lg border p-2" /></label>
      <label className="text-sm">Método<select value={method} onChange={event => setMethod(event.target.value as typeof method)} className="mt-1 w-full rounded-lg border bg-white p-2"><option value="bank_transfer">Transferencia</option><option value="bank_qr">QR bancario</option></select></label>
      <label className="text-sm">Referencia bancaria<input required minLength={4} maxLength={120} value={bankReference} onChange={event => setBankReference(event.target.value)} className="mt-1 w-full rounded-lg border p-2" /></label>
      <p className="text-xs text-slate-600 sm:col-span-2">Registrar la referencia no confirma el pago. Solo Owner/Finance pueden conciliar el ingreso real.</p>
      <button type="submit" disabled={saving || !selectedCharge} className="rounded-lg bg-slate-900 p-2 font-bold text-white disabled:opacity-50 sm:col-span-2">{saving ? 'Guardando…' : 'Registrar para revisión'}</button>
    </form>}
    <div className="grid gap-4 xl:grid-cols-2">
      <section className="rounded-xl border bg-white p-4"><h3 className="mb-3 font-bold">Contratos ({records.contracts.length})</h3>{records.contracts.length ? <ul className="divide-y">{records.contracts.map(contract => <li key={contract.id} className="py-3 text-sm"><div className="flex justify-between gap-3"><strong>{contract.customer?.companyName || contract.terms?.companyName || contract.id}</strong><span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs">{contract.status}</span></div><p className="mt-1 text-xs text-slate-600">{contract.terms?.templateId} · {contract.terms?.plan?.name || 'Cotización a medida'} · {contract.terms?.billingCycle || '—'}</p><p className="mt-1 text-xs text-slate-700">Inicial: {currencyLabel(contract.terms?.initialDueMinor, contract.terms?.currency)} · Recurrente: {currencyLabel(contract.terms?.recurringMinor, contract.terms?.currency)}</p>{contract.status === 'ready_for_activation' && user?.role === 'platform_owner' && onActivateContract && <button type="button" onClick={() => onActivateContract({ id: contract.id, status: contract.status, businessType: contract.businessType, customer: contract.customer })} className="mt-2 rounded-lg bg-blue-700 px-3 py-2 text-xs font-bold text-white">Crear empresa pagada y preparar acceso</button>}</li>)}</ul> : <p className="text-sm text-slate-600">Todavía no hay contratos.</p>}</section>
      <section className="rounded-xl border bg-white p-4"><h3 className="mb-3 font-bold">Cargos ({records.charges.length})</h3>{records.charges.length ? <ul className="divide-y">{records.charges.map(charge => <li key={charge.id} className="py-3 text-sm"><div className="flex items-start justify-between gap-3"><strong className="break-all">{charge.id}</strong><span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs">{charge.status}</span></div><p className="mt-1 text-xs">{charge.kind} · vence {dateLabel(charge.dueAt)}</p><p className="mt-1 text-xs">Pagado {currencyLabel(charge.paidMinor, charge.currency)} / {currencyLabel(charge.amountMinor, charge.currency)} · reservado {currencyLabel(charge.pendingMinor, charge.currency)}</p></li>)}</ul> : <p className="text-sm text-slate-600">Todavía no hay cargos.</p>}</section>
      <section className="rounded-xl border bg-white p-4"><h3 className="mb-3 font-bold">Referencias de pago ({records.payments.length})</h3>{records.payments.length ? <ul className="divide-y">{records.payments.map(payment => <li key={payment.id} className="py-3 text-sm"><div className="flex items-start justify-between gap-3"><strong>{payment.bankReference}</strong><span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs">{payment.status}</span></div><p className="mt-1 text-xs">{currencyLabel(payment.amountMinor, payment.currency)} · {payment.method} · {payment.chargeId}</p>{payment.status === 'pending_review' && canConfirm && <div className="mt-2 flex gap-2"><button type="button" disabled={saving} onClick={() => void reviewPayment(payment, 'confirmManualPayment')} className="rounded bg-emerald-700 px-3 py-2 text-xs font-bold text-white">Confirmar ingreso verificado</button><button type="button" disabled={saving} onClick={() => void reviewPayment(payment, 'rejectManualPayment')} className="rounded border px-3 py-2 text-xs font-bold">Rechazar</button></div>}</li>)}</ul> : <p className="text-sm text-slate-600">No hay pagos registrados.</p>}</section>
      <section className="rounded-xl border bg-white p-4"><h3 className="mb-3 font-bold">Suscripciones ({records.subscriptions.length})</h3>{records.subscriptions.length ? <ul className="divide-y">{records.subscriptions.map(subscription => <li key={subscription.id} className="py-3 text-sm"><div className="flex justify-between gap-3"><strong>{subscription.contractId}</strong><span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs">{subscription.status}</span></div><p className="mt-1 text-xs text-slate-600">Tenant {subscription.tenantId || 'pendiente de activación'} · próxima renovación {dateLabel(subscription.nextRenewalAt)}</p>{subscription.pendingPlanChange && <p className="mt-1 text-xs text-blue-800">Cambio a {subscription.pendingPlanChange.planSnapshot?.name || 'nuevo plan'} programado para la siguiente renovación.</p>}
        {subscription.status === 'active' && subscription.contractId && <div className="mt-2 flex flex-col gap-2 sm:flex-row"><select aria-label="Nuevo plan al renovar" value={planSelections[subscription.id] || ''} onChange={event => setPlanSelections(current => ({ ...current, [subscription.id]: event.target.value }))} className="min-h-10 min-w-0 flex-1 rounded border bg-white px-2 text-xs"><option value="">Programar cambio de plan…</option>{billingPlans.filter(plan => plan.templateId === subscription.templateId).flatMap(plan => [<option key={`${plan.id}|monthly`} value={`${plan.id}|monthly`}>{plan.name} · mensual {currencyLabel(plan.monthlyMinor, plan.currency)}</option>, <option key={`${plan.id}|annual`} value={`${plan.id}|annual`}>{plan.name} · anual {currencyLabel(plan.annualMinor, plan.currency)}</option>])}</select><button type="button" disabled={saving || !planSelections[subscription.id]} onClick={() => void schedulePlanChange(subscription)} className="rounded border px-3 py-2 text-xs font-semibold disabled:opacity-50">Programar</button></div>}
        {['platform_owner', 'platform_admin'].includes(user?.role || '') && subscription.status === 'active' && <button type="button" disabled={saving} onClick={() => void createRenewal(subscription)} className="mt-2 rounded border border-blue-200 px-3 py-2 text-xs font-semibold text-blue-800 disabled:opacity-50">Crear / revisar renovación</button>}
        {['platform_owner', 'platform_admin'].includes(user?.role || '') && ['active', 'overdue'].includes(subscription.status) && <div className="mt-2 flex flex-wrap gap-2"><button type="button" disabled={saving} onClick={() => void changeStatus(subscription, 'overdue')} className="rounded border px-3 py-2 text-xs">Marcar vencida</button><button type="button" disabled={saving} onClick={() => void changeStatus(subscription, 'suspended')} className="rounded border px-3 py-2 text-xs">Suspender</button><button type="button" disabled={saving} onClick={() => void changeStatus(subscription, 'cancelled')} className="rounded border border-red-200 px-3 py-2 text-xs text-red-800">Cancelar</button></div>}</li>)}</ul> : <p className="text-sm text-slate-600">No hay suscripciones activas o pendientes.</p>}</section>
    </div>
  </section>
}
