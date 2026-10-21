import { useMemo, useState } from 'react'
import { ChevronDown, ChevronRight, HandCoins, Search, ShieldCheck } from 'lucide-react'
import { RangePicker } from './RangePicker'
import { CreditProducts } from './CreditProducts'
import { Modal } from '../../../components/ui/Modal'
import { Field, NumberInput, Segmented, TextArea, TextInput } from '../../../components/ui/Form'
import { EmptyBlock, Screen } from '../../../components/ui/Screen'
import { toDayKey, round2, validateCollection } from '../domain/engine'
import { getCustomerStatementHistory, newOperationId, registerCollection, submitCreditOverride } from '../data/distributionRepository'
import { KpiCard, PrimaryButton, formatBs } from './shared'
import type { DistributionViewProps } from './DistributionApp'
import type { DistCollection, DistReceivable } from '../types'
import { CanonicalReceiptModal } from '../../../components/receipt/CanonicalReceiptModal'
import { buildBusinessDocumentContext } from '../../../core/businessIdentity'
import { distCollectionToReceiptData, printCollectionReceipt } from '../data/distributionReceiptService'
import { exportCustomerStatement } from '../data/reportExports'
import { analyzeCustomerStatement, type CustomerStatementAnalysis } from '../domain/customerStatement.ts'

interface CustomerCredit {
  customerId: string
  customerName: string
  balance: number
  originalAmount: number
  lastMovementAt: string
  receivables: DistReceivable[]
}

/**
 * Cartera por cliente. Un credito pagado no se elimina: queda en PAID con su
 * historial, porque la clienta necesita poder auditar lo cobrado.
 */
export function CreditsView({ session, data, documentContext, businessIdentity }: DistributionViewProps) {
  const isAdmin = session.role === 'admin' || session.role === 'owner'
  const [period, setPeriod] = useState<string[]>([])
  const [search, setSearch] = useState('')
  const [receiptCollection, setReceiptCollection] = useState<DistCollection | null>(null)
  const [selected, setSelected] = useState<CustomerCredit | null>(null)
  const [collectTarget, setCollectTarget] = useState<DistReceivable | null>(null)
  const [isCustomerCollect, setIsCustomerCollect] = useState(false)
  const [amount, setAmount] = useState('')
  const [method, setMethod] = useState<'cash' | 'qr' | 'mixed'>('cash')
  const [mixedCash, setMixedCash] = useState('')
  const [mixedQr, setMixedQr] = useState('')
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [paidOpen, setPaidOpen] = useState(false)
  const [statementBusy, setStatementBusy] = useState(false)
  const [statementError, setStatementError] = useState('')
  const [statement, setStatement] = useState<{ customerId: string; analysis: CustomerStatementAnalysis | null }>({ customerId: '', analysis: null })
  const [statementLoadingId, setStatementLoadingId] = useState('')
  const statementAnalysis = statement.customerId === selected?.customerId ? statement.analysis : null
  const statementRows = statementAnalysis?.movements ?? []
  const statementLoading = statementLoadingId !== '' && statementLoadingId === selected?.customerId

  const selectCustomer = (entry: CustomerCredit) => {
    setSelected(entry)
    setPaidOpen(false)
    setStatementError('')
    if (!isAdmin) return
    setStatement({ customerId: entry.customerId, analysis: null })
    setStatementLoadingId(entry.customerId)
    void getCustomerStatementHistory(entry.customerId).then(history => {
      setStatement({ customerId: entry.customerId, analysis: analyzeCustomerStatement(history.receivables, history.collections, history.claims, history.sales) })
    }).catch(failure => setStatementError((failure as Error).message || 'No se pudo cargar el historial completo.'))
      .finally(() => setStatementLoadingId(current => current === entry.customerId ? '' : current))
  }

  const exportStatement = async (format: 'PDF' | 'Excel') => {
    if (!selected || statementBusy) return
    setStatementBusy(true); setStatementError('')
    try {
      const customer = data.customers.find(row => row.id === selected.customerId)
      if (!customer) throw new Error('No se encontró el registro del cliente.')
      const history = await getCustomerStatementHistory(selected.customerId)
      await exportCustomerStatement(customer, history, format)
    } catch (statementFailure) { setStatementError((statementFailure as Error).message || 'No se pudo preparar el estado de cuenta.') }
    finally { setStatementBusy(false) }
  }

  // Excepción de crédito
  const [overrideModalOpen, setOverrideModalOpen] = useState(false)
  const [overrideReason, setOverrideReason] = useState('')
  const [overrideDays, setOverrideDays] = useState('7')
  const [overrideError, setOverrideError] = useState<string | null>(null)
  const [isSubmittingOverride, setIsSubmittingOverride] = useState(false)

  const byCustomer = useMemo(() => {
    const map = new Map<string, CustomerCredit>()
    for (const receivable of data.receivables) {
      if (period.length && !period.includes(receivable.dayKey || toDayKey(receivable.createdAt))) continue
      const current = map.get(receivable.customerId)
      const entry: CustomerCredit = current ?? {
        customerId: receivable.customerId,
        customerName: receivable.customerName || 'Cliente',
        balance: 0,
        originalAmount: 0,
        lastMovementAt: receivable.createdAt,
        receivables: [],
      }
      entry.balance = round2(entry.balance + (Number(receivable.balance) || 0))
      entry.originalAmount = round2(entry.originalAmount + (Number(receivable.originalAmount) || 0))
      entry.receivables.push(receivable)
      if (receivable.createdAt > entry.lastMovementAt) entry.lastMovementAt = receivable.createdAt
      map.set(receivable.customerId, entry)
    }
    return [...map.values()].sort((a, b) => b.balance - a.balance)
  }, [data.receivables, period])

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase()
    return term ? byCustomer.filter((entry) => [entry.customerName, data.customers.find(c => c.id === entry.customerId)?.customerCode, data.customers.find(c => c.id === entry.customerId)?.identityNumber].join(' ').toLowerCase().includes(term)) : byCustomer
  }, [byCustomer, search, data.customers])

  const totalOutstanding = round2(byCustomer.reduce((sum, entry) => sum + entry.balance, 0))

  const openCustomerCollect = (customer: CustomerCredit) => {
    setIsCustomerCollect(true)
    setCollectTarget(null)
    setAmount(String(round2(customer.balance)))
    setMethod('cash')
    setMixedCash('')
    setMixedQr('')
    setNote('')
    setError(null)
  }

  const openCollect = (receivable: DistReceivable) => {
    setIsCustomerCollect(false)
    setCollectTarget(receivable)
    setAmount(String(round2(receivable.balance)))
    setMethod('cash')
    setMixedCash('')
    setMixedQr('')
    setNote('')
    setError(null)
  }

  const submitCollection = async () => {
    if (!selected || isSubmitting) return
    const maxBalance = isCustomerCollect ? selected.balance : (collectTarget?.balance ?? 0)
    const value = round2(Number(amount))
    const validation = validateCollection(value, maxBalance)
    if (validation) {
      setError(validation)
      return
    }

    let cashPortion = 0
    let qrPortion = 0
    if (method === 'mixed') {
      cashPortion = round2(Number(mixedCash))
      qrPortion = round2(Number(mixedQr))
      if (!(cashPortion > 0)) {
        setError('El monto en efectivo debe ser mayor a 0.')
        return
      }
      if (!(qrPortion > 0)) {
        setError('El monto en QR debe ser mayor a 0.')
        return
      }
      if (Math.abs(round2(cashPortion + qrPortion) - value) > 0.01) {
        setError(`La suma de efectivo (${cashPortion}) y QR (${qrPortion}) debe coincidir con el total (${value}).`)
        return
      }
    } else if (method === 'cash') {
      cashPortion = value
    } else {
      qrPortion = value
    }

    setIsSubmitting(true)
    try {
      const col = await registerCollection({
        operationId: newOperationId('col'),
        customerId: selected.customerId,
        customerName: selected.customerName,
        customerCode: data.customers.find(c => c.id === selected.customerId)?.customerCode || data.customers.find(c => c.id === selected.customerId)?.identityNumber,
        receivable: isCustomerCollect ? undefined : (collectTarget ?? undefined),
        receivableId: isCustomerCollect ? undefined : collectTarget?.id,
        amount: value,
        method,
        cashAmount: cashPortion,
        qrAmount: qrPortion,
        collectedByUid: session.uid,
        collectedByName: session.userName,
        routeId: session.routeId || collectTarget?.routeId || 'route-directa',
        note,
      })
      setCollectTarget(null)
      setIsCustomerCollect(false)
      setSelected(null)
      if (!col.pendingConfirmation) {
        setReceiptCollection(col)
      }
    } catch (submitError) {
      setError((submitError as Error).message || 'No se pudo registrar el cobro.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleGrantOverride = async () => {
    if (!selected || isSubmittingOverride) return
    if (overrideReason.trim().length < 4) {
      setOverrideError('El motivo debe tener al menos 4 caracteres.')
      return
    }
    const days = Number(overrideDays)
    if (!Number.isInteger(days) || days < 1 || days > 30) {
      setOverrideError('Los días de vigencia deben ser entre 1 y 30.')
      return
    }

    setIsSubmittingOverride(true)
    setOverrideError(null)
    try {
      await submitCreditOverride({
        customerId: selected.customerId,
        reason: overrideReason.trim(),
        days,
      })
      setOverrideModalOpen(false)
      setOverrideReason('')
    } catch (err) {
      setOverrideError((err as Error).message || 'No se pudo autorizar la excepción.')
    } finally {
      setIsSubmittingOverride(false)
    }
  }

  const handleRevokeOverride = async (overrideId: string) => {
    if (isSubmittingOverride) return
    setIsSubmittingOverride(true)
    try {
      await submitCreditOverride({
        overrideId,
        revoke: true,
        reason: 'Revocado por administración.',
      })
    } catch (err) {
      alert((err as Error).message || 'No se pudo revocar la excepción.')
    } finally {
      setIsSubmittingOverride(false)
    }
  }

  const effectiveDocContext = useMemo(
    () =>
      documentContext ||
      buildBusinessDocumentContext(businessIdentity, {
        companyName: session.restaurantName,
        branchName: 'Casa Matriz',
      }),
    [documentContext, session.restaurantName, businessIdentity]
  )

  const receiptCollectionData = useMemo(() => {
    if (!receiptCollection) return null
    return distCollectionToReceiptData(receiptCollection, {
      collectorName: receiptCollection.collectedByName,
      customerName: receiptCollection.customerName,
      customerPhone: data.customers.find((c) => c.id === receiptCollection.customerId)?.phone,
      routeName: receiptCollection.routeId,
    })
  }, [receiptCollection, data.customers])

  const handlePrintCollection = async () => {
    if (!receiptCollection) return
    return await printCollectionReceipt(receiptCollection, {
      tenantId: session.tenantId,
      branchId: 'main',
      docContext: effectiveDocContext,
      collectorName: receiptCollection.collectedByName,
      customerName: receiptCollection.customerName,
      customerPhone: data.customers.find((c) => c.id === receiptCollection.customerId)?.phone,
      routeName: receiptCollection.routeId,
    })
  }

  return (
    <Screen title="Creditos" subtitle="Cartera general de todos los clientes">
      <div className="grid w-full min-w-0 gap-3">
        <p className="text-xs text-slate-600">La deuda es compartida entre administracion y distribuidores. Filtra por fecha de la venta a credito; el saldo incluye todos los cobros registrados.</p>
        <RangePicker dayKeys={period.length ? period : [toDayKey(new Date())]} onChange={setPeriod} />
        <button className="text-left text-sm font-bold text-[var(--primary)]" onClick={() => setPeriod([])}>{period.length ? 'Ver todos los creditos' : 'Mostrando todos los creditos'}</button>
        <div className="grid grid-cols-2 gap-2">
          <KpiCard label="Cartera pendiente" value={formatBs(totalOutstanding)} tone="warning" />
          <KpiCard label="Clientes con saldo" value={String(byCustomer.filter((entry) => entry.balance > 0).length)} />
        </div>

        <div className="relative w-full">
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <TextInput
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar cliente..."
            className="pl-9"
          />
        </div>

        {filtered.length === 0 && <EmptyBlock title="Sin creditos registrados" />}

        <div className="grid gap-2">
          {selected && isAdmin && <div className="grid grid-cols-2 gap-2"><button type="button" disabled={statementBusy} onClick={() => void exportStatement('PDF')} className="min-h-11 rounded-xl border p-2 text-xs font-bold disabled:opacity-50">{statementBusy ? 'Preparando…' : 'Estado de cuenta PDF'}</button><button type="button" disabled={statementBusy} onClick={() => void exportStatement('Excel')} className="min-h-11 rounded-xl border p-2 text-xs font-bold disabled:opacity-50">Estado de cuenta Excel</button></div>}
          {statementError && <p role="alert" className="text-xs font-bold text-rose-700">{statementError}</p>}
          {selected && isAdmin && <section className="rounded-2xl border border-slate-200 p-3">
            <h3 className="text-xs font-extrabold">Estado de cuenta completo</h3>
            {statementLoading ? <p className="mt-2 text-xs text-slate-500">Cargando y confirmando historial con el servidor…</p> : !statementAnalysis ? <p className="mt-2 text-xs text-slate-500">El historial completo no está cargado.</p> : <>
              {statementAnalysis.warnings.length > 0 && <div role="alert" className="mt-2 grid gap-1 rounded-xl bg-amber-50 p-3 text-xs text-amber-900"><strong>Revisión necesaria: historial con movimientos sin conciliar.</strong>{statementAnalysis.warnings.map((warning, index) => <p key={`${index}-${warning}`}>{warning}</p>)}</div>}
              {statementRows.length === 0 ? <p className="mt-2 text-xs text-slate-500">No hay movimientos históricos.</p> : <div className="mt-2 grid max-h-72 gap-2 overflow-y-auto">{statementRows.map(row => <article key={row.id} className={`rounded-xl p-2 text-[11px] ${row.warning ? 'bg-amber-50 text-amber-950' : 'bg-slate-50'}`}><div className="flex justify-between gap-2"><strong>{row.kind === 'credit' ? 'Venta a crédito' : row.kind === 'payment' ? 'Cobranza' : 'Ajuste'}</strong><span className="shrink-0">{new Date(row.at).toLocaleString('es-BO')}</span></div><p>{row.route} · {row.detail}</p>{row.method && <p>{row.method}</p>}{row.note && <p>Nota: {row.note}</p>}{row.warning && <p className="font-bold">{row.warning}</p>}<p className="flex justify-between"><span>Debe {formatBs(row.debit)} · Haber {formatBs(row.credit)}</span><strong>Saldo {formatBs(row.balance)}</strong></p></article>)}<p className="flex justify-between border-t pt-2 text-xs"><strong>Saldo progresivo</strong><strong>{formatBs(statementAnalysis.ledgerBalance)}</strong></p><p className="flex justify-between text-xs"><span>Saldo actual de cartera</span><strong>{formatBs(statementAnalysis.currentBalance)}</strong></p></div>}
            </>}
          </section>}
          {filtered.map((entry) => (
            <button
              key={entry.customerId}
              type="button"
              onClick={() => selectCustomer(entry)}
              className="flex w-full min-w-0 items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-3 text-left"
            >
              <div className="min-w-0">
                <p className="break-words text-sm font-extrabold text-slate-900">{entry.customerName}</p><p className="text-xs text-slate-500">{data.customers.find(c => c.id === entry.customerId)?.customerCode || data.customers.find(c => c.id === entry.customerId)?.identityNumber}</p>
                <p className="text-[11px] font-semibold text-slate-500">
                  Ultimo movimiento: {new Date(entry.lastMovementAt).toLocaleDateString('es-BO')}
                </p>
              </div>
              <span
                className={`shrink-0 text-base font-black tabular-nums ${entry.balance > 0 ? 'text-[var(--primary)]' : 'text-emerald-600'}`}
              >
                {formatBs(entry.balance)}
              </span>
            </button>
          ))}
        </div>
      </div>

      <Modal
        isOpen={Boolean(selected)}
        onClose={() => setSelected(null)}
        title={selected?.customerName ?? ''}
        subtitle={selected ? `Saldo actual ${formatBs(selected.balance)}` : ''}
      >
        <div className="grid gap-2">
          {selected && isAdmin && (
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5">
                  <ShieldCheck size={16} className="text-slate-600" />
                  <p className="text-xs font-bold text-slate-800">Excepción de crédito</p>
                </div>
                {(() => {
                  const activeOverride = (data.creditOverrides || []).find(
                    (o) => o.customerId === selected.customerId && o.active !== false && (!o.validUntil || o.validUntil >= new Date().toISOString())
                  )
                  return activeOverride ? (
                    <button
                      type="button"
                      disabled={isSubmittingOverride}
                      onClick={() => void handleRevokeOverride(activeOverride.id)}
                      className="rounded-xl border border-rose-200 bg-rose-50 px-2.5 py-1 text-[11px] font-bold text-rose-700"
                    >
                      Revocar
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        setOverrideModalOpen(true)
                        setOverrideReason('')
                        setOverrideDays('7')
                        setOverrideError(null)
                      }}
                      className="rounded-xl border border-indigo-200 bg-indigo-50 px-2.5 py-1 text-[11px] font-bold text-indigo-700"
                    >
                      Autorizar crédito
                    </button>
                  )
                })()}
              </div>
              {(() => {
                const activeOverride = (data.creditOverrides || []).find(
                  (o) => o.customerId === selected.customerId && o.active !== false && (!o.validUntil || o.validUntil >= new Date().toISOString())
                )
                return activeOverride ? (
                  <p className="mt-1.5 text-[11px] font-medium text-emerald-700">
                    Activo hasta {new Date(activeOverride.validUntil).toLocaleDateString('es-BO')}: {activeOverride.reason}
                  </p>
                ) : null
              })()}
            </div>
          )}

          {selected && selected.balance > 0 && session.can('dist.collection.create') && (
            <button
              type="button"
              onClick={() => openCustomerCollect(selected)}
              className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-2xl text-xs font-extrabold text-white shadow-sm"
              style={{ backgroundColor: 'var(--primary)' }}
            >
              <HandCoins size={16} /> Cobrar a cuenta general (FIFO) — {formatBs(selected.balance)}
            </button>
          )}

          {!!selected?.receivables.some((receivable) => receivable.balance > 0) && (
            <p className="text-[10px] font-extrabold uppercase tracking-wide text-slate-500">Pendiente de pago</p>
          )}
          {selected?.receivables
            .slice()
            .sort((a, b) => Number(b.balance > 0) - Number(a.balance > 0) || b.createdAt.localeCompare(a.createdAt))
            .filter((receivable) => receivable.balance > 0 || paidOpen)
            .map((receivable) => (
              <div key={receivable.id} className="rounded-2xl border border-slate-200 p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-xs font-extrabold text-slate-900">
                      Venta a credito {formatBs(receivable.originalAmount)}
                    </p>
                    <p className="text-[11px] font-semibold text-slate-500">
                      {new Date(receivable.createdAt).toLocaleString('es-BO')} · {receivable.distributorName}
                    </p>
                    <p className="text-[11px] font-semibold text-slate-500">
                      Pagado {formatBs(receivable.paidAmount)} · Saldo {formatBs(receivable.balance)}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-black ${
                      receivable.balance <= 0
                        ? 'bg-emerald-50 text-emerald-700'
                        : receivable.paidAmount > 0
                          ? 'bg-amber-50 text-amber-700'
                          : 'bg-rose-50 text-rose-700'
                    }`}
                  >
                    {receivable.balance <= 0 ? 'PAGADO' : receivable.paidAmount > 0 ? 'PARCIAL' : 'PENDIENTE'}
                  </span>
                </div>
                <CreditProducts
                  saleId={receivable.saleId}
                  lines={receivable.saleLines || data.sales.find((sale) => sale.id === receivable.saleId)?.lines}
                />
                {receivable.balance > 0 && session.can('dist.collection.create') && (
                  <button
                    type="button"
                    onClick={() => openCollect(receivable)}
                    className="mt-2 flex min-h-[40px] w-full items-center justify-center gap-2 rounded-2xl text-xs font-extrabold text-white"
                    style={{ backgroundColor: 'var(--primary)' }}
                  >
                    <HandCoins size={15} /> Cobrar esta deuda
                  </button>
                )}
              </div>
            ))}
          {!!selected?.receivables.some((receivable) => receivable.balance <= 0) && (
            <button
              type="button"
              onClick={() => setPaidOpen((value) => !value)}
              className="mt-1 flex min-h-[44px] w-full items-center justify-between rounded-2xl border border-slate-200 px-3 text-left text-xs font-extrabold text-slate-700"
            >
              <span>Créditos pagados ({selected.receivables.filter((receivable) => receivable.balance <= 0).length})</span>
              {paidOpen ? <ChevronDown size={17} /> : <ChevronRight size={17} />}
            </button>
          )}
        </div>
      </Modal>

      <Modal
        isOpen={Boolean(collectTarget || isCustomerCollect)}
        onClose={() => {
          setCollectTarget(null)
          setIsCustomerCollect(false)
        }}
        title={isCustomerCollect ? 'Cobrar a cuenta del cliente (FIFO)' : 'Registrar cobro'}
        subtitle={
          isCustomerCollect
            ? `Saldo total de ${selected?.customerName ?? ''}: ${formatBs(selected?.balance ?? 0)}`
            : collectTarget
              ? `Saldo pendiente ${formatBs(collectTarget.balance)}`
              : ''
        }
        footer={
          <PrimaryButton full disabled={isSubmitting} onClick={() => void submitCollection()}>
            {isSubmitting ? 'Guardando...' : 'Confirmar cobro'}
          </PrimaryButton>
        }
      >
        <div className="grid gap-3">
          {!isCustomerCollect && collectTarget && (
            <CreditProducts
              saleId={collectTarget.saleId}
              lines={collectTarget.saleLines || data.sales.find((sale) => sale.id === collectTarget.saleId)?.lines}
            />
          )}
          {isCustomerCollect && (
            <p className="text-xs text-slate-600">
              El pago se aplicará de forma automática en orden FIFO cancelando las deudas más antiguas del cliente.
            </p>
          )}
          <Field label="Monto cobrado (Bs)" required>
            <NumberInput value={amount} min={0} step={1} onChange={(event) => setAmount(event.target.value)} />
          </Field>
          <Field label="Forma de cobro">
            <Segmented
              value={method}
              onChange={setMethod}
              options={[
                { value: 'cash', label: 'Efectivo' },
                { value: 'qr', label: 'QR' },
                { value: 'mixed', label: 'Mixto' },
              ]}
            />
          </Field>
          {method === 'mixed' && (
            <div className="grid grid-cols-2 gap-2 rounded-2xl border border-slate-200 bg-slate-50 p-2.5">
              <Field label="Efectivo (Bs)" required>
                <NumberInput
                  value={mixedCash}
                  min={0}
                  step={1}
                  onChange={(event) => setMixedCash(event.target.value)}
                />
              </Field>
              <Field label="QR (Bs)" required>
                <NumberInput
                  value={mixedQr}
                  min={0}
                  step={1}
                  onChange={(event) => setMixedQr(event.target.value)}
                />
              </Field>
            </div>
          )}
          <Field label="Observacion">
            <TextArea value={note} onChange={(event) => setNote(event.target.value)} />
          </Field>
          <p className="text-[11px] font-semibold text-slate-500">
            Un cobro no es una venta nueva: reduce el saldo del cliente y entra al arqueo, pero no suma a las ventas.
          </p>
          {error && <p className="text-xs font-bold text-rose-600">{error}</p>}
        </div>
      </Modal>

      <Modal
        isOpen={overrideModalOpen}
        onClose={() => setOverrideModalOpen(false)}
        title="Autorizar crédito excepcional"
        subtitle={selected ? `Cliente: ${selected.customerName}` : ''}
        footer={
          <PrimaryButton full disabled={isSubmittingOverride} onClick={() => void handleGrantOverride()}>
            {isSubmittingOverride ? 'Guardando...' : 'Autorizar crédito'}
          </PrimaryButton>
        }
      >
        <div className="grid gap-3">
          <p className="text-xs text-slate-600">
            Permite temporalmente a los distribuidores conceder crédito a este cliente, a pesar de que tenga facturas o créditos vencidos.
          </p>
          <Field label="Días de vigencia" required>
            <NumberInput
              value={overrideDays}
              min={1}
              max={30}
              step={1}
              onChange={(e) => setOverrideDays(e.target.value)}
            />
          </Field>
          <Field label="Motivo de la autorización (mínimo 4 caracteres)" required>
            <TextArea
              value={overrideReason}
              onChange={(e) => setOverrideReason(e.target.value)}
              placeholder="Ej. Autorizado por gerencia para entrega de fin de mes..."
            />
          </Field>
          {overrideError && <p className="text-xs font-bold text-rose-600">{overrideError}</p>}
        </div>
      </Modal>

      {receiptCollection && receiptCollectionData && (
        <CanonicalReceiptModal
          isOpen={Boolean(receiptCollection)}
          onClose={() => setReceiptCollection(null)}
          receiptData={receiptCollectionData}
          documentContext={effectiveDocContext}
          onPrint={handlePrintCollection}
        />
      )}
    </Screen>
  )
}
