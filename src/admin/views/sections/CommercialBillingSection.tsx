import { useCallback, useEffect, useRef, useState } from 'react'
import { gateway } from '../../../services/gateway'
import { useAdminAuth } from '../../auth/adminAuthStore'
import type { FormEvent } from 'react'

const MAX_QR_FILE_BYTES = 512 * 1024
const ALLOWED_QR_MIME_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp'])

async function validateQrImageFile(file: File): Promise<{ valid: true } | { valid: false; reason: string }> {
  if (!ALLOWED_QR_MIME_TYPES.has(file.type)) {
    return { valid: false, reason: 'Formato no permitido. Solo puedes subir imágenes PNG, JPG o WebP.' }
  }
  if (file.size <= 0 || file.size > MAX_QR_FILE_BYTES) {
    return { valid: false, reason: 'El tamaño del QR debe ser mayor a 0 bytes y máximo de 512 KB.' }
  }
  try {
    const header = new Uint8Array(await file.slice(0, 12).arrayBuffer())
    const isPng = file.type === 'image/png'
      && header.length >= 8
      && header[0] === 0x89 && header[1] === 0x50 && header[2] === 0x4e && header[3] === 0x47
      && header[4] === 0x0d && header[5] === 0x0a && header[6] === 0x1a && header[7] === 0x0a
    const isJpeg = file.type === 'image/jpeg'
      && header.length >= 3
      && header[0] === 0xff && header[1] === 0xd8 && header[2] === 0xff
    const isWebp = file.type === 'image/webp'
      && header.length >= 12
      && String.fromCharCode(header[0], header[1], header[2], header[3]) === 'RIFF'
      && String.fromCharCode(header[8], header[9], header[10], header[11]) === 'WEBP'
    if (!isPng && !isJpeg && !isWebp) {
      return { valid: false, reason: 'El contenido real del archivo no coincide con PNG, JPG o WebP válido.' }
    }
    return { valid: true }
  } catch {
    return { valid: false, reason: 'No se pudo validar la firma binaria del archivo seleccionado.' }
  }
}

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
  originalAmountMinor?: number
  correctionCount?: number
  paidMinor?: number
  pendingMinor?: number
  currency?: string
  kind?: string
  dueAt?: { _seconds?: number; seconds?: number } | string
  customer?: { companyName?: string; email?: string; phone?: string }
  terms?: { companyName?: string; templateId?: string; initialDueMinor?: number; recurringMinor?: number; currency?: string; billingCycle?: string; periodCount?: number; monthsCovered?: number; plan?: { name?: string } | null }
  bankReference?: string
  method?: string
  createdAt?: { _seconds?: number; seconds?: number } | string
  nextRenewalAt?: { _seconds?: number; seconds?: number } | string
  currentPeriodEnd?: { _seconds?: number; seconds?: number } | string
  billingAccessUntil?: { _seconds?: number; seconds?: number } | string
  effectiveStatus?: string
  daysRemaining?: number | null
  templateId?: string
  planKey?: string | null
  billingCycle?: string
  pendingPlanChange?: { planSnapshot?: { name?: string }; effectiveAt?: { _seconds?: number; seconds?: number }; billingCycle?: string }
  periodCount?: number
  monthsCovered?: number
  recurringMinor?: number
  planSnapshot?: { name?: string } | null
  recordedAt?: { _seconds?: number; seconds?: number } | string
}
interface BillingNote { id: string; note: string; actorRole: string; createdAt?: { seconds?: number; _seconds?: number } }

interface BillingPlanOption { id: string; name: string; templateId: string; currency: string; monthlyMinor: number; annualMinor: number; annualPriceUnit?: 'annual_total_12_months' | null }
interface BillingCursor { createdAtMillis: number; id: string }
type ManualMethods = { available: boolean; qrEnabled: boolean; transferEnabled: boolean; qrImageUrl: string; qrImagePath: string; qrImageDataUrl: string; version: number; bankName: string; accountHolder: string; accountIdentifier: string; transferCurrency: string; instructions: string; whatsappNumber: string }
const EMPTY_METHODS: ManualMethods = { available: false, qrEnabled: false, transferEnabled: false, qrImageUrl: '', qrImagePath: '', qrImageDataUrl: '', version: 0, bankName: '', accountHolder: '', accountIdentifier: '', transferCurrency: '', instructions: '', whatsappNumber: '' }
type RenewalNoticePolicy = { noticeDays: number; version: number; allowedDays: number[] }
const DEFAULT_RENEWAL_NOTICE_POLICY: RenewalNoticePolicy = { noticeDays: 7, version: 0, allowedDays: [3, 7, 15, 30] }

export interface PaidContractActivation {
  id: string
  status: string
  businessType?: string
  customer?: { companyName?: string; email?: string; contactName?: string }
}

const currencyLabel = (minor = 0, currency = 'BOB') => `${currency} ${(minor / 100).toFixed(2)}`
const dateMillis = (value?: BillingRecord['dueAt']) => {
  const seconds = typeof value === 'object' && value ? value.seconds ?? value._seconds : undefined
  const millis = seconds ? seconds * 1000 : typeof value === 'string' ? Date.parse(value) : NaN
  return Number.isFinite(millis) ? millis : null
}
const dateLabel = (value?: BillingRecord['dueAt']) => {
  const millis = dateMillis(value)
  return millis == null ? '—' : new Date(millis).toLocaleDateString('es-BO')
}
const renewalCycleFor = (subscription: BillingRecord): 'monthly' | 'annual' =>
  subscription.pendingPlanChange?.billingCycle === 'annual' || (!subscription.pendingPlanChange && subscription.billingCycle === 'annual') ? 'annual' : 'monthly'
const renewalPeriodsFor = (cycle: 'monthly' | 'annual') => cycle === 'annual' ? [1, 2, 3, 5] : [1, 2, 3, 6, 12]
const futurePlanChangeFor = (subscription: BillingRecord) => {
  const effectiveAt = dateMillis(subscription.pendingPlanChange?.effectiveAt)
  return effectiveAt != null && effectiveAt > Date.now()
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
  const [recordsHasMore, setRecordsHasMore] = useState<Record<BillingKind, boolean>>({ contracts: false, charges: false, payments: false, subscriptions: false })
  const [recordCursors, setRecordCursors] = useState<Partial<Record<BillingKind, BillingCursor>>>({})
  const [loadingMore, setLoadingMore] = useState<BillingKind | null>(null)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [templateFilter, setTemplateFilter] = useState('all')
  const [methods, setMethods] = useState<ManualMethods>(EMPTY_METHODS)
  const [savedQrSnapshot, setSavedQrSnapshot] = useState<{ qrImageUrl: string; qrImagePath: string; qrImageDataUrl: string }>({ qrImageUrl: '', qrImagePath: '', qrImageDataUrl: '' })
  const [qrImageUpload, setQrImageUpload] = useState<{ mimeType: string; base64: string } | null>(null)
  const [pendingQrMeta, setPendingQrMeta] = useState<{ name: string; sizeKb: string; mimeType: string } | null>(null)
  const [qrPendingRemoval, setQrPendingRemoval] = useState(false)
  const qrFileInputRef = useRef<HTMLInputElement | null>(null)
  const [methodsLoading, setMethodsLoading] = useState(false)
  const [methodsSaving, setMethodsSaving] = useState(false)
  const [renewalNoticePolicy, setRenewalNoticePolicy] = useState(DEFAULT_RENEWAL_NOTICE_POLICY)
  const [internalNotes, setInternalNotes] = useState<Record<string, BillingNote[]>>({})
  const [notesOpen, setNotesOpen] = useState<Record<string, boolean>>({})
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({})
  const [correctionChargeId, setCorrectionChargeId] = useState('')
  const [correctionAmount, setCorrectionAmount] = useState('')
  const [correctionReason, setCorrectionReason] = useState('')

  const loadBillingData = useCallback(async () => {
    const kinds: BillingKind[] = ['contracts', 'charges', 'payments', 'subscriptions']
    const results = await Promise.all(kinds.map(kind => gateway<{ records: BillingRecord[]; hasMore?: boolean; nextCursor?: BillingCursor | null }>('platformGateway', { action: 'listBillingRecords', kind, limit: 30 })))
    const nextRecords = Object.fromEntries(kinds.map((kind, index) => [kind, results[index].records || []])) as Record<BillingKind, BillingRecord[]>
    const nextPlans = ['platform_owner', 'platform_admin'].includes(user?.role || '')
      ? (await gateway<{ plans: BillingPlanOption[] }>('platformGateway', { action: 'listPublishedBillingPlans' })).plans || []
      : []
    const nextMore = Object.fromEntries(kinds.map((kind, index) => [kind, results[index].hasMore === true])) as Record<BillingKind, boolean>
    const nextCursors = Object.fromEntries(kinds.map((kind, index) => [kind, results[index].nextCursor || undefined])) as Partial<Record<BillingKind, BillingCursor>>
    const loadedMethods = ['platform_owner', 'platform_finance'].includes(user?.role || '')
      ? (await gateway<{ methods: Partial<ManualMethods> }>('platformGateway', { action: 'getManualPaymentMethods' })).methods || EMPTY_METHODS
      : EMPTY_METHODS
    const nextMethods = { ...EMPTY_METHODS, ...loadedMethods, qrImageUrl: loadedMethods.qrImageUrl || '', qrImagePath: loadedMethods.qrImagePath || '', qrImageDataUrl: loadedMethods.qrImageDataUrl || '', transferCurrency: loadedMethods.transferCurrency || '', version: Number.isSafeInteger(loadedMethods.version) ? loadedMethods.version as number : 0 }
    const nextNotice = user?.role === 'platform_owner'
      ? (await gateway<RenewalNoticePolicy>('platformGateway', { action: 'getBillingRenewalNoticePolicy' }))
      : DEFAULT_RENEWAL_NOTICE_POLICY
    return { records: nextRecords, plans: nextPlans, more: nextMore, cursors: nextCursors, methods: nextMethods, renewalNoticePolicy: nextNotice }
  }, [user])

  const refresh = useCallback(async () => {
    setLoading(true); setMethodsLoading(true); setError('')
    try {
      const result = await loadBillingData()
      setRecords(result.records)
      setBillingPlans(result.plans)
      setRecordsHasMore(result.more)
      setRecordCursors(result.cursors)
      setMethods(result.methods)
      setRenewalNoticePolicy(result.renewalNoticePolicy)
      setSavedQrSnapshot({ qrImageUrl: result.methods.qrImageUrl, qrImagePath: result.methods.qrImagePath, qrImageDataUrl: result.methods.qrImageDataUrl })
      setQrPendingRemoval(false)
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'No se pudo consultar la facturación.') }
    finally { setLoading(false); setMethodsLoading(false) }
  }, [loadBillingData])

  useEffect(() => {
    let active = true
    void loadBillingData().then(result => {
      if (!active) return
      setRecords(result.records)
      setBillingPlans(result.plans)
      setRecordsHasMore(result.more)
      setRecordCursors(result.cursors)
      setMethods(result.methods)
      setRenewalNoticePolicy(result.renewalNoticePolicy)
      setSavedQrSnapshot({ qrImageUrl: result.methods.qrImageUrl, qrImagePath: result.methods.qrImagePath, qrImageDataUrl: result.methods.qrImageDataUrl })
    }).catch(cause => {
      if (active) setError(cause instanceof Error ? cause.message : 'No se pudo consultar la facturación.')
    }).finally(() => { if (active) { setLoading(false); setMethodsLoading(false) } })
    return () => { active = false }
  }, [loadBillingData])

  const loadMore = async (kind: BillingKind) => {
    const cursor = recordCursors[kind]
    if (!cursor || loadingMore) return
    setLoadingMore(kind); setError('')
    try {
      const page = await gateway<{ records: BillingRecord[]; hasMore: boolean; nextCursor?: BillingCursor | null }>('platformGateway', {
        action: 'listBillingRecords', kind, limit: 30, cursor,
      })
      setRecords(current => ({ ...current, [kind]: [...current[kind], ...(page.records || [])] }))
      setRecordsHasMore(current => ({ ...current, [kind]: page.hasMore === true }))
      setRecordCursors(current => ({ ...current, [kind]: page.nextCursor || undefined }))
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'No se pudo cargar la siguiente página.') }
    finally { setLoadingMore(null) }
  }

  const saveMethods = async (event: FormEvent) => {
    event.preventDefault(); setMethodsSaving(true); setError(''); setMessage('')
    try {
      await gateway('platformGateway', { action: 'saveManualPaymentMethods', requestId: crypto.randomUUID(), expectedVersion: methods.version, methods: { ...methods, qrImageDataUrl: '' }, ...(qrImageUpload ? { qrImageUpload } : {}) })
      setMessage('La configuración oficial de cobros se guardó y auditó. Subir el QR no activa la cobranza por sí solo; revisa los indicadores de estado antes de compartirlo.')
      setQrImageUpload(null)
      setPendingQrMeta(null)
      setQrPendingRemoval(false)
      if (qrFileInputRef.current) qrFileInputRef.current.value = ''
      await refresh()
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'No se pudo guardar la configuración de cobros.') }
    finally { setMethodsSaving(false) }
  }

  const saveRenewalNoticePolicy = async (event: FormEvent) => {
    event.preventDefault(); setSaving(true); setError(''); setMessage('')
    try {
      const result = await gateway<Pick<RenewalNoticePolicy, 'noticeDays' | 'version'>>('platformGateway', {
        action: 'saveBillingRenewalNoticePolicy', requestId: crypto.randomUUID(), noticeDays: renewalNoticePolicy.noticeDays,
        expectedVersion: renewalNoticePolicy.version,
      })
      setRenewalNoticePolicy(current => ({ ...current, noticeDays: result.noticeDays, version: result.version }))
      setMessage('Aviso de renovación guardado. Esto cambia cuándo se muestra el aviso; no genera cargos ni adelanta vencimientos.')
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'No se pudo guardar el aviso de renovación.') }
    finally { setSaving(false) }
  }

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
      const cycle = renewalCycleFor(subscription)
      const choices = renewalPeriodsFor(cycle)
      const selected = Number(planSelections[`prepay:${subscription.id}`]) || 1
      const periodCount = choices.includes(selected) ? selected : 1
      const result = await gateway<{ chargeId: string; renewalMode?: string; reusedPendingCharge?: boolean }>('platformGateway', { action: 'createRenewalCharge', requestId: crypto.randomUUID(), contractId: subscription.contractId, dueAt, periodCount })
      const chargeType = periodCount > 1 ? 'prepago anticipado' : 'renovación ordinaria'
      setMessage(`${result.reusedPendingCharge ? 'Se reutilizó el cargo pendiente' : `Cargo de ${chargeType} creado`}: ${result.chargeId} · ${periodCount} ${cycle === 'annual' ? 'año(s)' : 'mes(es)'}. El nuevo período se aplica desde el vencimiento ya pagado, sin solaparse.`)
      await refresh()
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'No se pudo crear el cargo de renovación.') }
    finally { setSaving(false) }
  }

  const changeStatus = async (subscription: BillingRecord, status: 'overdue' | 'suspended' | 'cancelled') => {
    if (!subscription.contractId) return
    const reason = window.prompt(`Motivo para cambiar el estado a ${status} (mínimo 8 caracteres):`)
    if (!reason || reason.trim().length < 8 || !window.confirm(`¿Confirmas cambiar la suscripción a ${status}? Se registrará en auditoría.`)) return
    setSaving(true); setError(''); setMessage('')
    try {
      await gateway('platformGateway', { action: 'changeSubscriptionStatus', requestId: crypto.randomUUID(), contractId: subscription.contractId, status, reason })
      setMessage(`Suscripción actualizada: ${status}.`)
      await refresh()
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'No se pudo cambiar el estado.') }
    finally { setSaving(false) }
  }

  const reviewPayment = async (payment: BillingRecord, action: 'confirmManualPayment' | 'rejectManualPayment') => {
    const rejectionReason = action === 'rejectManualPayment' ? window.prompt('Motivo del rechazo (mínimo 8 caracteres):') : null
    if (action === 'rejectManualPayment' && (!rejectionReason || rejectionReason.trim().length < 8)) return
    if (action === 'confirmManualPayment' && !window.confirm('¿Confirmaste directamente que el dinero ingresó a la cuenta de PACHAX? La referencia o una captura no bastan.')) return
    setSaving(true); setError(''); setMessage('')
    try {
      await gateway('platformGateway', action === 'confirmManualPayment'
        ? { action, requestId: crypto.randomUUID(), paymentId: payment.id }
        : { action, requestId: crypto.randomUUID(), paymentId: payment.id, reason: rejectionReason })
      setMessage(action === 'confirmManualPayment' ? 'Pago confirmado por operador autorizado.' : 'Referencia rechazada y saldo reservado liberado.')
      await refresh()
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'No se pudo revisar el pago.') }
    finally { setSaving(false) }
  }

  const reactivate = async (subscription: BillingRecord) => {
    const paidRenewal = records.charges.find(charge => charge.contractId === subscription.contractId
      && charge.kind === 'renewal' && charge.status === 'paid' && charge.paidMinor === charge.amountMinor)
    if (!paidRenewal || !subscription.contractId) {
      setError('Primero debe existir una renovación totalmente conciliada para esta empresa.')
      return
    }
    const reason = window.prompt('Motivo de la reactivación excepcional (mínimo 12 caracteres):')
    if (!reason || reason.trim().length < 12 || !window.confirm('¿Confirmas reactivar esta suspensión administrativa después de revisar el pago conciliado?')) return
    setSaving(true); setError(''); setMessage('')
    try {
      await gateway('platformGateway', { action: 'reactivateSuspendedSubscription', requestId: crypto.randomUUID(), contractId: subscription.contractId, chargeId: paidRenewal.id, reason })
      setMessage('Reactivación autorizada y auditada por Platform Owner.')
      await refresh()
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'No se pudo reactivar la suscripción.') }
    finally { setSaving(false) }
  }

  const loadNotes = async (contractId: string) => {
    try {
      const result = await gateway<{ notes: BillingNote[] }>('platformGateway', { action: 'listBillingInternalNotes', contractId, limit: 50 })
      setInternalNotes(current => ({ ...current, [contractId]: result.notes || [] }))
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'No se pudieron cargar las observaciones internas.') }
  }

  const toggleNotes = async (contractId: string) => {
    const opening = !notesOpen[contractId]
    setNotesOpen(current => ({ ...current, [contractId]: opening }))
    if (opening) await loadNotes(contractId)
  }

  const addInternalNote = async (event: FormEvent, contractId: string) => {
    event.preventDefault()
    const note = noteDrafts[contractId]?.trim() || ''
    if (note.length < 3) return
    setSaving(true); setError(''); setMessage('')
    try {
      await gateway('platformGateway', { action: 'addBillingInternalNote', requestId: crypto.randomUUID(), contractId, note })
      setNoteDrafts(current => ({ ...current, [contractId]: '' }))
      setMessage('Observación interna guardada con auditoría.')
      await loadNotes(contractId)
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'No se pudo guardar la observación interna.') }
    finally { setSaving(false) }
  }

  const correctCharge = async (event: FormEvent, chargeId: string) => {
    event.preventDefault()
    if (!window.confirm('¿Confirmas corregir este cargo no pagado ni reservado? El importe original y el motivo quedarán auditados.')) return
    setSaving(true); setError(''); setMessage('')
    try {
      const result = await gateway<{ correctionId: string }>('platformGateway', { action: 'correctBillingCharge', requestId: crypto.randomUUID(),
        chargeId, correctedAmount: correctionAmount, reason: correctionReason })
      setMessage(`Cargo corregido y auditado (${result.correctionId}). El contrato aceptado no se modificó.`)
      setCorrectionChargeId(''); setCorrectionAmount(''); setCorrectionReason('')
      await refresh()
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'No se pudo corregir el cargo.') }
    finally { setSaving(false) }
  }

  const normalizedSearch = search.trim().toLocaleLowerCase('es')
  const filtered = (kind: BillingKind) => records[kind].filter(record => {
    const text = [record.id, record.contractId, record.customer?.companyName, record.customer?.email,
      record.terms?.companyName, record.terms?.templateId, record.bankReference, record.tenantId].filter(Boolean).join(' ').toLocaleLowerCase('es')
    const matchesSearch = !normalizedSearch || text.includes(normalizedSearch)
    const recordStatus = kind === 'subscriptions' ? (record.effectiveStatus || record.status) : record.status
    const matchesStatus = statusFilter === 'all' || recordStatus === statusFilter
    const recordTemplate = record.templateId || record.businessType || record.terms?.templateId
    const matchesTemplate = templateFilter === 'all' || recordTemplate === templateFilter
    return matchesSearch && matchesStatus && matchesTemplate
  })
  const confirmedRevenue = records.payments.filter(item => item.status === 'confirmed')
    .reduce((sum, item) => { const currency = item.currency || 'BOB'; sum[currency] = (sum[currency] || 0) + (Number(item.amountMinor) || 0); return sum }, {} as Record<string, number>)
  const summary = {
    active: records.subscriptions.filter(item => (item.effectiveStatus || item.status) === 'active').length,
    expiring: records.subscriptions.filter(item => (item.effectiveStatus || item.status) === 'active' && typeof item.daysRemaining === 'number' && item.daysRemaining <= renewalNoticePolicy.noticeDays).length,
    grace: records.subscriptions.filter(item => (item.effectiveStatus || item.status) === 'grace').length,
    suspended: records.subscriptions.filter(item => ['suspended', 'cancelled', 'expired'].includes(item.effectiveStatus || item.status)).length,
    pending: records.charges.filter(item => ['due', 'partial', 'under_review'].includes(item.status)).length,
    review: records.payments.filter(item => item.status === 'pending_review').length,
  }

  if (!canView) return <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">Tu rol no puede consultar la facturación comercial.</div>

  return <section className="space-y-5">
    <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-4">
      <div><h2 className="text-xl font-bold">Facturación de PACHAX</h2><p className="mt-1 text-sm text-slate-600">Contratos, cargos y referencias manuales. No hay cobros automáticos ni pasarela activa.</p></div>
      <button type="button" onClick={() => void refresh()} disabled={loading} className="rounded-lg border px-3 py-2 text-sm font-semibold">{loading ? 'Actualizando…' : 'Actualizar'}</button>
    </header>
    {error && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-900">{error}</div>}
    {message && <div role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">{message}</div>}
    {user?.role === 'platform_owner' && (() => {
      const hasSavedQr = Boolean(savedQrSnapshot.qrImagePath || savedQrSnapshot.qrImageUrl)
      const hasCurrentPreview = Boolean(methods.qrImageDataUrl || methods.qrImageUrl)
      const imageStatusLabel = qrImageUpload
        ? 'Vista previa local (pendiente de guardar)'
        : qrPendingRemoval
          ? 'Retiro pendiente de guardar'
          : methods.qrImagePath
            ? 'Configurada en almacenamiento privado'
            : methods.qrImageUrl
              ? 'URL HTTPS heredada configurada'
              : 'Sin imagen guardada'

      const handleQrFileSelected = async (file: File | undefined, inputEl: HTMLInputElement) => {
        if (!file) return
        const validation = await validateQrImageFile(file)
        if (!validation.valid) {
          setError(validation.reason)
          inputEl.value = ''
          return
        }
        const reader = new FileReader()
        reader.onload = () => {
          const value = typeof reader.result === 'string' ? reader.result : ''
          const base64 = value.split(',')[1] || ''
          if (!base64) {
            setError('No se pudo leer la imagen QR seleccionada.')
            return
          }
          setQrImageUpload({ mimeType: file.type, base64 })
          setPendingQrMeta({ name: file.name, sizeKb: `${(file.size / 1024).toFixed(1)} KB`, mimeType: file.type })
          setQrPendingRemoval(false)
          setMethods(current => ({ ...current, qrImageUrl: '', qrImagePath: '', qrImageDataUrl: value }))
          setError('')
        }
        reader.onerror = () => setError('No se pudo leer la imagen QR seleccionada.')
        reader.readAsDataURL(file)
      }

      const handleCancelStagedUpload = () => {
        setQrImageUpload(null)
        setPendingQrMeta(null)
        setQrPendingRemoval(false)
        if (qrFileInputRef.current) qrFileInputRef.current.value = ''
        setMethods(current => ({
          ...current,
          qrImageUrl: savedQrSnapshot.qrImageUrl,
          qrImagePath: savedQrSnapshot.qrImagePath,
          qrImageDataUrl: savedQrSnapshot.qrImageDataUrl,
        }))
      }

      const handleRemoveQrWithConfirm = () => {
        if (!window.confirm('¿Estás seguro de quitar la imagen oficial del QR bancario? Al guardar, se deshabilitará el cobro QR para clientes.')) {
          return
        }
        setQrImageUpload(null)
        setPendingQrMeta(null)
        setQrPendingRemoval(true)
        if (qrFileInputRef.current) qrFileInputRef.current.value = ''
        setMethods(current => ({
          ...current,
          qrEnabled: false,
          available: current.transferEnabled ? current.available : false,
          qrImageUrl: '',
          qrImagePath: '',
          qrImageDataUrl: '',
        }))
      }

      return <form onSubmit={saveMethods} className="space-y-4 rounded-xl border border-blue-200 bg-blue-50/50 p-4">
        <div>
          <h3 className="font-bold text-slate-900">Métodos oficiales de cobro manual</h3>
          <p className="mt-1 text-xs text-slate-600">
            Solo Platform Owner puede configurar este QR oficial de PACHAX (distinto al QR de ventas POS de cada empresa). Subir una imagen NO habilita automáticamente la cobranza ni confirma pagos reportados.
          </p>
        </div>

        {/* Estado comercial separado */}
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <div className="rounded-lg border border-slate-200 bg-white p-2.5 text-xs">
            <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500">Imagen configurada</span>
            <span className={`mt-1 inline-block rounded-full px-2 py-0.5 font-bold ${
              qrImageUpload ? 'bg-amber-100 text-amber-900' : qrPendingRemoval ? 'bg-red-100 text-red-900' : hasSavedQr ? 'bg-emerald-100 text-emerald-900' : 'bg-slate-100 text-slate-700'
            }`}>{imageStatusLabel}</span>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-2.5 text-xs">
            <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500">QR habilitado</span>
            <span className={`mt-1 inline-block rounded-full px-2 py-0.5 font-bold ${methods.qrEnabled ? 'bg-emerald-100 text-emerald-900' : 'bg-slate-100 text-slate-700'}`}>
              {methods.qrEnabled ? 'Cobro QR habilitado' : 'Cobro QR deshabilitado'}
            </span>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-2.5 text-xs">
            <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500">Visibilidad para propietarios</span>
            <span className={`mt-1 inline-block rounded-full px-2 py-0.5 font-bold ${methods.available ? 'bg-emerald-100 text-emerald-900' : 'bg-slate-100 text-slate-700'}`}>
              {methods.available ? 'Visible en portal de suscripción' : 'Oculto para clientes'}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white p-3 text-sm cursor-pointer">
            <input type="checkbox" checked={methods.available} onChange={event => setMethods(value => ({ ...value, available: event.target.checked }))} />
            <span>Mostrar métodos habilitados a propietarios</span>
          </label>
          <label className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white p-3 text-sm cursor-pointer">
            <input type="checkbox" checked={methods.qrEnabled} onChange={event => setMethods(value => ({ ...value, qrEnabled: event.target.checked }))} />
            <span>Habilitar cobro por QR</span>
          </label>

          {/* Selector y acciones de QR */}
          <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 sm:col-span-2">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-bold text-slate-900">Imagen oficial del QR bancario</p>
                <p className="text-xs text-slate-600">Formatos permitidos: PNG, JPG o WebP · Tamaño máximo 512 KB · Guardado privado en PACHAX.</p>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row">
                <input
                  ref={qrFileInputRef}
                  data-testid="qr-file-input"
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={event => { void handleQrFileSelected(event.target.files?.[0], event.currentTarget) }}
                  className="sr-only"
                />
                <button
                  type="button"
                  data-testid="upload-qr-image-button"
                  disabled={methodsSaving || methodsLoading}
                  onClick={() => qrFileInputRef.current?.click()}
                  className="min-h-10 w-full rounded-lg bg-slate-900 px-4 py-2 text-xs font-bold text-white hover:bg-slate-800 disabled:opacity-50 sm:w-auto cursor-pointer"
                >
                  {hasCurrentPreview ? 'Reemplazar imagen del QR' : 'Subir imagen del QR'}
                </button>
              </div>
            </div>

            {qrPendingRemoval && (
              <div className="flex flex-col gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-950 sm:flex-row sm:items-center sm:justify-between">
                <span>Se programó el retiro de la imagen QR. Pulsa «Guardar configuración auditada» para confirmar la eliminación.</span>
                <button
                  type="button"
                  onClick={handleCancelStagedUpload}
                  className="rounded border border-amber-400 bg-white px-2.5 py-1 font-semibold text-amber-950 cursor-pointer"
                >
                  Deshacer retiro
                </button>
              </div>
            )}

            {hasCurrentPreview && (
              <div className="flex flex-col items-start gap-4 rounded-lg border border-slate-200 bg-slate-50 p-3 sm:flex-row sm:items-center">
                <img
                  src={methods.qrImageDataUrl || methods.qrImageUrl}
                  alt="Vista previa del QR oficial"
                  referrerPolicy="no-referrer"
                  className="h-40 w-40 shrink-0 rounded-lg border bg-white object-contain p-1"
                />
                <div className="min-w-0 flex-1 text-xs text-slate-600 space-y-1.5">
                  <p className="font-bold text-slate-900">
                    {qrImageUpload
                      ? 'Vista previa antes de guardar (archivo nuevo seleccionado)'
                      : methods.qrImagePath
                        ? 'Imagen actual guardada en PACHAX (almacenamiento privado)'
                        : 'Imagen actual por URL HTTPS heredada'}
                  </p>
                  {pendingQrMeta && (
                    <p className="text-slate-700">
                      Archivo: <strong>{pendingQrMeta.name}</strong> · {pendingQrMeta.sizeKb} ({pendingQrMeta.mimeType})
                    </p>
                  )}
                  <p>
                    El QR privado nunca queda público en Storage; solo se entrega por función autenticada a Platform Owner/Finance y a propietarios activos cuando esté habilitado y visible.
                  </p>
                  <div className="flex flex-wrap gap-2 pt-1">
                    {qrImageUpload && (
                      <button
                        type="button"
                        onClick={handleCancelStagedUpload}
                        className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 font-semibold text-slate-800 hover:bg-slate-100 cursor-pointer"
                      >
                        Cancelar cambio seleccionado
                      </button>
                    )}
                    <button
                      type="button"
                      data-testid="remove-qr-image-button"
                      disabled={methodsSaving || methodsLoading}
                      onClick={handleRemoveQrWithConfirm}
                      className="rounded-lg border border-red-300 bg-red-50 px-3 py-1.5 font-semibold text-red-900 hover:bg-red-100 cursor-pointer"
                    >
                      Quitar imagen del QR
                    </button>
                  </div>
                </div>
              </div>
            )}

            <details className="rounded-lg border border-slate-200 bg-slate-50 p-2.5 text-xs text-slate-600">
              <summary className="cursor-pointer font-semibold text-slate-700">Compatibilidad heredada: URL HTTPS de QR aprobado (opcional)</summary>
              <label className="mt-2 block text-xs">
                URL HTTPS de QR aprobado
                <input
                  type="url"
                  value={methods.qrImageUrl}
                  onChange={event => {
                    setQrImageUpload(null)
                    setPendingQrMeta(null)
                    setQrPendingRemoval(false)
                    setMethods(value => ({ ...value, qrImagePath: '', qrImageDataUrl: '', qrImageUrl: event.target.value }))
                  }}
                  placeholder="URL HTTPS aprobada; sin valor por defecto"
                  className="mt-1 min-h-10 w-full rounded-lg border bg-white px-3 text-sm"
                />
              </label>
            </details>
          </div>

          <label className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white p-3 text-sm sm:col-span-2 cursor-pointer">
            <input type="checkbox" checked={methods.transferEnabled} onChange={event => setMethods(value => ({ ...value, transferEnabled: event.target.checked }))} />
            <span>Habilitar transferencias bancarias</span>
          </label>
          <label className="text-sm">Banco / entidad<input value={methods.bankName} onChange={event => setMethods(value => ({ ...value, bankName: event.target.value }))} className="mt-1 min-h-10 w-full rounded-lg border bg-white px-3" /></label>
          <label className="text-sm">Titular<input value={methods.accountHolder} onChange={event => setMethods(value => ({ ...value, accountHolder: event.target.value }))} className="mt-1 min-h-10 w-full rounded-lg border bg-white px-3" /></label>
          <label className="text-sm">Identificador de cuenta<input value={methods.accountIdentifier} onChange={event => setMethods(value => ({ ...value, accountIdentifier: event.target.value }))} className="mt-1 min-h-10 w-full rounded-lg border bg-white px-3" /></label>
          <label className="text-sm">Moneda de la cuenta<select value={methods.transferCurrency} onChange={event => setMethods(value => ({ ...value, transferCurrency: event.target.value }))} className="mt-1 min-h-10 w-full rounded-lg border bg-white px-3"><option value="">Seleccionar moneda aprobada</option><option value="BOB">BOB</option><option value="USD">USD</option></select></label>
          <label className="text-sm sm:col-span-2">WhatsApp oficial<input type="tel" value={methods.whatsappNumber} onChange={event => setMethods(value => ({ ...value, whatsappNumber: event.target.value }))} placeholder="Formato internacional (ej. +59177987776)" className="mt-1 min-h-10 w-full rounded-lg border bg-white px-3" /></label>
          <label className="text-sm sm:col-span-2">Instrucciones para clientes<textarea maxLength={1000} value={methods.instructions} onChange={event => setMethods(value => ({ ...value, instructions: event.target.value }))} className="mt-1 min-h-20 w-full rounded-lg border bg-white p-3" /></label>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <button type="submit" disabled={methodsSaving || methodsLoading} className="min-h-10 w-full rounded-lg bg-blue-800 px-4 py-2 text-sm font-bold text-white disabled:opacity-50 sm:w-auto cursor-pointer">{methodsSaving ? 'Guardando…' : 'Guardar configuración auditada'}</button>
          {methodsLoading && <span className="text-xs text-slate-600">Consultando configuración…</span>}
        </div>
      </form>
    })()}
    {user?.role === 'platform_owner' && <form onSubmit={saveRenewalNoticePolicy} className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
      <div><h3 className="font-bold">Aviso previo al vencimiento</h3><p className="mt-1 text-sm text-slate-600">Define cuándo aparece el recordatorio en el portal del propietario. Este ajuste no crea cargos, no muestra un QR sin saldo pendiente y no cambia los días de gracia.</p></div>
      <div className="flex flex-wrap items-end gap-3"><label className="text-sm font-semibold">Mostrar el aviso<select aria-label="Días de aviso de renovación" value={renewalNoticePolicy.noticeDays} onChange={event => setRenewalNoticePolicy(current => ({ ...current, noticeDays: Number(event.target.value) }))} className="mt-1 min-h-11 w-full rounded-lg border bg-white px-3 sm:w-56">{renewalNoticePolicy.allowedDays.map(days => <option key={days} value={days}>{days} días antes</option>)}</select></label><button type="submit" disabled={saving || loading} className="min-h-11 rounded-lg border border-slate-400 px-4 py-2 text-sm font-bold text-slate-900 disabled:opacity-50">{saving ? 'Guardando…' : 'Guardar aviso'}</button><span className="text-xs text-slate-500">Valor vigente: {renewalNoticePolicy.noticeDays} días · versión {renewalNoticePolicy.version}</span></div>
    </form>}
    <section className="space-y-3 rounded-xl border bg-white p-4">
      <h3 className="font-bold">Resumen de cobranza · registros cargados</h3>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">{[
        ['Vencen en ' + renewalNoticePolicy.noticeDays + ' días', summary.expiring], ['Activas', summary.active], ['En gracia', summary.grace],
        ['Restringidas', summary.suspended], ['Cargos pendientes', summary.pending], ['Pagos por revisar', summary.review],
      ].map(([label, value]) => <div key={label} className="rounded-lg bg-slate-50 p-3"><p className="text-xs text-slate-600">{label}</p><p className="mt-1 text-lg font-bold">{value}</p></div>)}</div>
      <p className="text-xs text-slate-600">Ingresos confirmados en los pagos cargados: {Object.entries(confirmedRevenue).map(([currency, minor]) => currencyLabel(minor, currency)).join(' · ') || 'ninguno'}. No se convierten importes de otras monedas.</p>
      <div className="grid gap-2 sm:grid-cols-3"><label className="text-xs font-semibold">Buscar<input value={search} onChange={event => setSearch(event.target.value)} placeholder="Empresa, correo, referencia…" className="mt-1 min-h-10 w-full rounded-lg border px-3 text-sm font-normal" /></label><label className="text-xs font-semibold">Estado<select value={statusFilter} onChange={event => setStatusFilter(event.target.value)} className="mt-1 min-h-10 w-full rounded-lg border bg-white px-3 text-sm font-normal"><option value="all">Todos</option>{['pending','active','overdue','grace','expired','suspended','cancelled','due','partial','under_review','pending_review','confirmed','rejected','paid','ready_for_activation'].map(value => <option key={value} value={value}>{value}</option>)}</select></label><label className="text-xs font-semibold">Plantilla<select value={templateFilter} onChange={event => setTemplateFilter(event.target.value)} className="mt-1 min-h-10 w-full rounded-lg border bg-white px-3 text-sm font-normal"><option value="all">Todas</option>{['restaurant_pos','distribution','nightclub_lounge','hamburger_shop','gelateria_weight_cafe'].map(value => <option key={value} value={value}>{value}</option>)}</select></label></div>
    </section>
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
      <section className="rounded-xl border bg-white p-4"><h3 className="mb-3 font-bold">Contratos ({filtered('contracts').length} cargados)</h3>{filtered('contracts').length ? <ul className="divide-y">{filtered('contracts').map(contract => <li key={contract.id} className="py-3 text-sm"><div className="flex justify-between gap-3"><strong>{contract.customer?.companyName || contract.terms?.companyName || contract.id}</strong><span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs">{contract.status}</span></div><p className="mt-1 text-xs text-slate-600">{contract.terms?.templateId} · {contract.terms?.plan?.name || 'Cotización a medida'} · {contract.terms?.billingCycle || '—'} · {contract.terms?.monthsCovered || 1} meses cubiertos</p><p className="mt-1 text-xs text-slate-700">Inicial: {currencyLabel(contract.terms?.initialDueMinor, contract.terms?.currency)} · Recurrente: {currencyLabel(contract.terms?.recurringMinor, contract.terms?.currency)}</p>{contract.status === 'ready_for_activation' && user?.role === 'platform_owner' && onActivateContract && <button type="button" disabled={saving} onClick={() => onActivateContract({ id: contract.id, status: contract.status, businessType: contract.businessType, customer: contract.customer })} className="mt-2 rounded-lg bg-blue-700 px-3 py-2 text-xs font-bold text-white">Crear empresa pagada y preparar acceso</button>}{canView && <div className="mt-2"><button type="button" onClick={() => void toggleNotes(contract.id)} className="rounded border px-3 py-2 text-xs font-semibold">{notesOpen[contract.id] ? 'Ocultar observaciones' : 'Observaciones internas auditadas'}</button>{notesOpen[contract.id] && <div className="mt-2 space-y-2 rounded-lg bg-slate-50 p-3">{(internalNotes[contract.id] || []).map(item => <p key={item.id} className="border-b pb-2 text-xs text-slate-700">{item.note} <span className="text-slate-500">· {item.actorRole} · {dateLabel(item.createdAt)}</span></p>)}{(internalNotes[contract.id] || []).length === 0 && <p className="text-xs text-slate-500">Sin observaciones internas.</p>}{['platform_owner', 'platform_admin', 'platform_finance'].includes(user?.role || '') && <form onSubmit={event => void addInternalNote(event, contract.id)} className="space-y-2"><label className="block text-xs font-semibold">Nueva observación<textarea minLength={3} maxLength={1500} required value={noteDrafts[contract.id] || ''} onChange={event => setNoteDrafts(current => ({ ...current, [contract.id]: event.target.value }))} className="mt-1 min-h-20 w-full rounded border bg-white p-2 text-sm font-normal" /></label><button type="submit" disabled={saving || (noteDrafts[contract.id] || '').trim().length < 3} className="rounded bg-slate-800 px-3 py-2 text-xs font-bold text-white disabled:opacity-50">Guardar observación</button></form>}</div>}</div>}</li>)}</ul> : <p className="text-sm text-slate-600">No hay contratos cargados que coincidan.</p>}{recordsHasMore.contracts && <button type="button" disabled={loadingMore === 'contracts'} onClick={() => void loadMore('contracts')} className="mt-3 rounded-lg border px-3 py-2 text-sm">{loadingMore === 'contracts' ? 'Cargando…' : 'Cargar más contratos'}</button>}</section>
      <section className="rounded-xl border bg-white p-4"><h3 className="mb-3 font-bold">Cargos ({filtered('charges').length} cargados)</h3>{filtered('charges').length ? <ul className="divide-y">{filtered('charges').map(charge => <li key={charge.id} className="py-3 text-sm"><div className="flex items-start justify-between gap-3"><strong className="break-all">{charge.id}</strong><span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs">{charge.status}</span></div><p className="mt-1 text-xs">{charge.kind} · vence {dateLabel(charge.dueAt)} · {charge.monthsCovered || 1} meses prepagados</p><p className="mt-1 text-xs">Pagado {currencyLabel(charge.paidMinor, charge.currency)} / {currencyLabel(charge.amountMinor, charge.currency)} · reservado {currencyLabel(charge.pendingMinor, charge.currency)}</p>{Number.isSafeInteger(charge.originalAmountMinor) && <p className="mt-1 text-xs text-amber-800">Importe original {currencyLabel(charge.originalAmountMinor, charge.currency)} · {charge.correctionCount || 0} corrección(es) auditada(s)</p>}{user?.role === 'platform_owner' && ['due', 'partial'].includes(charge.status) && Number(charge.paidMinor || 0) === 0 && Number(charge.pendingMinor || 0) === 0 && <div className="mt-2">{correctionChargeId !== charge.id ? <button type="button" disabled={saving} onClick={() => { setCorrectionChargeId(charge.id); setCorrectionAmount((Number(charge.amountMinor || 0) / 100).toFixed(2)) }} className="rounded border border-amber-300 px-3 py-2 text-xs font-semibold text-amber-900">Corregir cargo pendiente</button> : <form onSubmit={event => void correctCharge(event, charge.id)} className="grid gap-2 rounded-lg bg-amber-50 p-3 sm:grid-cols-2"><label className="text-xs font-semibold">Nuevo importe ({charge.currency})<input required inputMode="decimal" value={correctionAmount} onChange={event => setCorrectionAmount(event.target.value)} className="mt-1 min-h-10 w-full rounded border bg-white px-2 text-sm font-normal" /></label><label className="text-xs font-semibold sm:col-span-2">Motivo obligatorio<textarea required minLength={12} maxLength={500} value={correctionReason} onChange={event => setCorrectionReason(event.target.value)} className="mt-1 min-h-16 w-full rounded border bg-white p-2 text-sm font-normal" /></label><button type="button" onClick={() => setCorrectionChargeId('')} className="rounded border px-3 py-2 text-xs">Cancelar</button><button type="submit" disabled={saving || correctionReason.trim().length < 12 || !correctionAmount} className="rounded bg-amber-800 px-3 py-2 text-xs font-bold text-white disabled:opacity-50">Confirmar y auditar</button></form>}</div>}</li>)}</ul> : <p className="text-sm text-slate-600">No hay cargos cargados que coincidan.</p>}{recordsHasMore.charges && <button type="button" disabled={loadingMore === 'charges'} onClick={() => void loadMore('charges')} className="mt-3 rounded-lg border px-3 py-2 text-sm">{loadingMore === 'charges' ? 'Cargando…' : 'Cargar más cargos'}</button>}</section>
      <section className="rounded-xl border bg-white p-4"><h3 className="mb-3 font-bold">Referencias de pago ({filtered('payments').length} cargadas)</h3>{filtered('payments').length ? <ul className="divide-y">{filtered('payments').map(payment => <li key={payment.id} className="py-3 text-sm"><div className="flex items-start justify-between gap-3"><strong>{payment.bankReference}</strong><span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs">{payment.status}</span></div><p className="mt-1 text-xs">{currencyLabel(payment.amountMinor, payment.currency)} · {payment.method} · cargo {payment.chargeId}</p>{payment.status === 'pending_review' && canConfirm && <div className="mt-2 flex gap-2"><button type="button" disabled={saving} onClick={() => void reviewPayment(payment, 'confirmManualPayment')} className="rounded bg-emerald-700 px-3 py-2 text-xs font-bold text-white">Confirmar ingreso verificado</button><button type="button" disabled={saving} onClick={() => void reviewPayment(payment, 'rejectManualPayment')} className="rounded border px-3 py-2 text-xs font-bold">Rechazar</button></div>}</li>)}</ul> : <p className="text-sm text-slate-600">No hay referencias cargadas que coincidan.</p>}{recordsHasMore.payments && <button type="button" disabled={loadingMore === 'payments'} onClick={() => void loadMore('payments')} className="mt-3 rounded-lg border px-3 py-2 text-sm">{loadingMore === 'payments' ? 'Cargando…' : 'Cargar más referencias'}</button>}</section>
      <section className="rounded-xl border bg-white p-4"><h3 className="mb-3 font-bold">Suscripciones ({filtered('subscriptions').length} cargadas)</h3>{filtered('subscriptions').length ? <ul className="divide-y">{filtered('subscriptions').map(subscription => { const effectiveStatus = subscription.effectiveStatus || subscription.status; const renewalCycle = renewalCycleFor(subscription); const periodOptions = renewalPeriodsFor(renewalCycle); const rawPeriodCount = Number(planSelections[`prepay:${subscription.id}`]) || 1; const selectedPeriodCount = periodOptions.includes(rawPeriodCount) ? rawPeriodCount : 1; const planChangeInFuture = futurePlanChangeFor(subscription); return <li key={subscription.id} className="py-3 text-sm"><div className="flex justify-between gap-3"><strong>{subscription.customer?.companyName || subscription.terms?.companyName || subscription.contractId}</strong><span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs">{effectiveStatus === 'grace' ? 'Período de gracia' : effectiveStatus === 'expired' ? 'Vencida' : effectiveStatus}</span></div><p className="mt-1 text-xs text-slate-600">{subscription.templateId || subscription.businessType} · {subscription.tenantId || 'pendiente de activación'} · próxima renovación {dateLabel(subscription.nextRenewalAt)}</p><p className="mt-1 text-xs text-slate-600">Plan {subscription.planSnapshot?.name || subscription.planKey || 'Acuerdo personalizado'} · {subscription.billingCycle === 'annual' ? 'anual' : 'mensual'} · {subscription.periodCount || 1} período(s) · {currencyLabel(subscription.recurringMinor, subscription.currency)}</p>{subscription.billingAccessUntil && <p className="mt-1 text-xs text-slate-600">Acceso permitido hasta {dateLabel(subscription.billingAccessUntil)} (incluye hasta 7 días de gracia desde el vencimiento).</p>}{subscription.pendingPlanChange && <p className="mt-1 text-xs text-blue-800">Cambio a {subscription.pendingPlanChange.planSnapshot?.name || 'nuevo plan'} programado para {dateLabel(subscription.pendingPlanChange.effectiveAt)}.</p>}
        {subscription.status === 'active' && subscription.contractId && <div className="mt-2 flex flex-col gap-2 sm:flex-row"><select aria-label="Nuevo plan al renovar" value={planSelections[subscription.id] || ''} onChange={event => setPlanSelections(current => ({ ...current, [subscription.id]: event.target.value }))} className="min-h-10 min-w-0 flex-1 rounded border bg-white px-2 text-xs"><option value="">Programar cambio de plan…</option>{billingPlans.filter(plan => plan.templateId === subscription.templateId).flatMap(plan => [<option key={`${plan.id}|monthly`} value={`${plan.id}|monthly`}>{plan.name} · mensual {currencyLabel(plan.monthlyMinor, plan.currency)}</option>, ...(plan.annualPriceUnit === 'annual_total_12_months' ? [<option key={`${plan.id}|annual`} value={`${plan.id}|annual`}>{plan.name} · total anual {currencyLabel(plan.annualMinor, plan.currency)}</option>] : [])])}</select><button type="button" disabled={saving || !planSelections[subscription.id]} onClick={() => void schedulePlanChange(subscription)} className="rounded border px-3 py-2 text-xs font-semibold disabled:opacity-50">Programar</button></div>}
        {['platform_owner', 'platform_admin'].includes(user?.role || '') && ['active', 'overdue', 'grace', 'expired', 'suspended'].includes(effectiveStatus) && subscription.contractId && <div className="mt-2 flex flex-col gap-2 sm:flex-row"><label className="text-xs">Períodos del plan efectivo<select aria-label={`Períodos de prepago ${subscription.contractId}`} value={String(selectedPeriodCount)} onChange={event => setPlanSelections(current => ({ ...current, [`prepay:${subscription.id}`]: event.target.value }))} className="mt-1 min-h-10 w-full rounded border bg-white px-2 sm:w-auto">{periodOptions.map(count => <option value={count} key={count}>{count} {renewalCycle === 'annual' ? (count === 1 ? 'año' : 'años') : (count === 1 ? 'mes' : 'meses')}</option>)}</select></label><button type="button" disabled={saving || planChangeInFuture} onClick={() => void createRenewal(subscription)} className="self-end rounded border border-blue-200 px-3 py-2 text-xs font-semibold text-blue-800 disabled:opacity-50">{selectedPeriodCount > 1 ? 'Crear prepago anticipado' : 'Crear renovación ordinaria'}</button></div>}{planChangeInFuture && <p className="mt-1 text-xs text-amber-800">El cambio de plan entra en vigor el {dateLabel(subscription.pendingPlanChange?.effectiveAt)}. El cargo de renovación podrá crearse desde esa fecha para conservar la tarifa y las capacidades contratadas.</p>}
        {subscription.status === 'suspended' && user?.role === 'platform_owner' && <button type="button" disabled={saving} onClick={() => void reactivate(subscription)} className="mt-2 rounded border border-amber-300 px-3 py-2 text-xs font-semibold text-amber-900 disabled:opacity-50">Reactivar tras conciliar renovación</button>}
        {['platform_owner', 'platform_admin'].includes(user?.role || '') && ['active', 'overdue'].includes(subscription.status) && <div className="mt-2 flex flex-wrap gap-2"><button type="button" disabled={saving || subscription.status === 'overdue'} onClick={() => void changeStatus(subscription, 'overdue')} className="rounded border px-3 py-2 text-xs disabled:opacity-50">Marcar vencida</button><button type="button" disabled={saving} onClick={() => void changeStatus(subscription, 'suspended')} className="rounded border px-3 py-2 text-xs">Suspender</button><button type="button" disabled={saving} onClick={() => void changeStatus(subscription, 'cancelled')} className="rounded border border-red-200 px-3 py-2 text-xs text-red-800">Cancelar</button></div>}</li>})}</ul> : <p className="text-sm text-slate-600">No hay suscripciones cargadas que coincidan.</p>}{recordsHasMore.subscriptions && <button type="button" disabled={loadingMore === 'subscriptions'} onClick={() => void loadMore('subscriptions')} className="mt-3 rounded-lg border px-3 py-2 text-sm">{loadingMore === 'subscriptions' ? 'Cargando…' : 'Cargar más suscripciones'}</button>}</section>
    </div>
  </section>
}
