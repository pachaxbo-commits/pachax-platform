import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronRight, ClipboardCheck, Lock, PackageCheck, Scale, Unlock } from 'lucide-react'
import { Field, FormGrid, NumberInput, TextInput } from '../../../components/ui/Form'
import { ChoiceButton, ChoiceModal } from '../../../components/ui/ChoiceModal'
import { Modal } from '../../../components/ui/Modal'
import { EmptyBlock, Screen } from '../../../components/ui/Screen'
import { buildReconciliation, computeMoneySummary, isSaleForDispatch, round2, toDayKey } from '../domain/engine'
import { declareRouteReturn, newOperationId, reopenClosure, saveAdministrativeCashClosure, saveClosure, subscribeSales, subscribeCollections, subscribeExpenses } from '../data/distributionRepository'
import { KpiCard, PrimaryButton, SecondaryButton, SectionCard, VarianceBadge, formatBs, formatQty } from './shared'
import type { DistributionViewProps } from './DistributionApp'
import type { DistSale, DistCollection, DistExpense, DistClosure, DistPhysicalReturnBreakdown } from '../types'

function AdministrativeCashClose({ session, data }: DistributionViewProps) {
  const isAdministration = session.role === 'admin' || session.role === 'owner'
  const canUseAdminClose = isAdministration && session.can('dist.closure.money')
  const dayKey = toDayKey()
  const [sales, setSales] = useState<DistSale[]>([])
  const [collections, setCollections] = useState<DistCollection[]>([])
  const [expenses, setExpenses] = useState<DistExpense[]>([])
  const [declared, setDeclared] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => {
    if (!canUseAdminClose) return
    const fail = (value: Error) => setError(value.message)
    const stops = [
      subscribeSales([dayKey], null, rows => setSales(rows), fail),
      subscribeCollections([dayKey], null, rows => setCollections(rows), fail),
      subscribeExpenses([dayKey], null, rows => setExpenses(rows), fail),
    ]
    return () => stops.forEach(stop => stop())
  }, [dayKey, canUseAdminClose])
  if (!canUseAdminClose) return null
  const close = data.closures.find(row => row.id === `admin_close_${dayKey}`)
  const adminSales = sales.filter(row => row.sourceLocation === 'centralWarehouse' && !row.pendingConfirmation && row.saleKind !== 'courtesy')
  const adminCollections = collections.filter(row => row.collectionOrigin === 'administration' && !row.pendingConfirmation)
  const adminExpenses = expenses.filter(row => row.expenseOrigin === 'administration' && !row.pendingConfirmation && !row.voided)
  const adminClaims = data.claims.filter(row => row.dayKey === dayKey)
  const unknownOriginCount = collections.filter(row => !row.pendingConfirmation && !row.collectionOrigin).length + expenses.filter(row => !row.pendingConfirmation && !row.voided && !row.expenseOrigin).length
  const cashSales = round2(adminSales.reduce((sum, row) => sum + (row.cashAmount || 0), 0))
  const qrSales = round2(adminSales.reduce((sum, row) => sum + (row.qrAmount || 0), 0))
  const creditSales = round2(adminSales.reduce((sum, row) => sum + (row.creditAmount || 0), 0))
  const cashCollections = round2(adminCollections.reduce((sum, row) => sum + (row.cashAmount || 0), 0))
  const qrCollections = round2(adminCollections.reduce((sum, row) => sum + (row.qrAmount || 0), 0))
  const expensesTotal = round2(adminExpenses.reduce((sum, row) => sum + row.amount, 0))
  const claimCashIn = round2(adminClaims.reduce((sum, row) => sum + (row.cashIn || 0), 0))
  const claimCashOut = round2(adminClaims.reduce((sum, row) => sum + (row.cashOut || 0), 0))
  const claimQrIn = round2(adminClaims.reduce((sum, row) => sum + (row.qrIn || 0), 0))
  const claimQrOut = round2(adminClaims.reduce((sum, row) => sum + (row.qrOut || 0), 0))
  const expectedCash = round2(cashSales + cashCollections + claimCashIn - claimCashOut - expensesTotal)
  const history = data.closures.filter(row => row.closeType === 'administrative').sort((a, b) => b.dayKey.localeCompare(a.dayKey))
  return <SectionCard title="Caja administrativa">
    <p className="mb-3 text-xs text-slate-500">Ventas, cobranzas, reclamos y gastos de Administración · {dayKey}</p>
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      <KpiCard label="Efectivo de ventas" value={formatBs(cashSales)} />
      <KpiCard label="QR de ventas" value={formatBs(qrSales)} />
      <KpiCard label="Crédito generado" value={formatBs(creditSales)} />
      <KpiCard label="Efectivo cobrado" value={formatBs(cashCollections)} />
      <KpiCard label="QR cobrado" value={formatBs(qrCollections)} />
      <KpiCard label="Reembolsos efectivos" value={formatBs(claimCashOut)} />
      <KpiCard label="Otros ingresos en efectivo" value={formatBs(claimCashIn)} />
      <KpiCard label="Reembolsos QR" value={formatBs(claimQrOut)} />
      <KpiCard label="Otros ingresos QR" value={formatBs(claimQrIn)} />
      <KpiCard label="Gastos administrativos" value={formatBs(expensesTotal)} />
    </div>
    {unknownOriginCount > 0 && <p className="mt-2 rounded-xl bg-amber-50 p-3 text-xs text-amber-900">Hay {unknownOriginCount} cobro(s) o gasto(s) históricos del día sin origen verificable. No se suman automáticamente; revisa el efectivo contado antes de cerrar.</p>}
    <p className="mt-3 flex justify-between rounded-xl bg-slate-50 p-3 text-sm"><span>Efectivo esperado</span><strong>{formatBs(close?.expectedCash ?? expectedCash)}</strong></p>
    {close ? <div className="mt-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs"><strong>Cierre del día guardado</strong><p>Declarado {formatBs(close.declaredCash || 0)} · diferencia {formatBs(close.cashDifference || 0)}</p><p>{close.responsibleName} · {close.closedAt ? new Date(close.closedAt).toLocaleString('es-BO') : close.createdAt}</p></div> : <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto] sm:items-end">
      <Field label="Efectivo contado y declarado (Bs)"><NumberInput min={0} value={declared} onChange={event => setDeclared(event.target.value)} placeholder="0.00" /></Field>
      <PrimaryButton disabled={busy || declared === '' || sales.some(row => row.pendingConfirmation) || collections.some(row => row.pendingConfirmation) || expenses.some(row => row.pendingConfirmation)} onClick={async () => {
        setBusy(true); setError('')
        try { await saveAdministrativeCashClosure(dayKey, Number(declared), newOperationId(`admin-close-${dayKey}`)) }
        catch (closeError) { setError((closeError as Error).message || 'No se pudo cerrar la caja administrativa.') }
        finally { setBusy(false) }
      }}>{busy ? 'Guardando…' : 'Cerrar caja administrativa'}</PrimaryButton>
    </div>}
    {error && <p role="alert" className="mt-2 text-xs font-bold text-rose-700">{error}</p>}
    {history.length > 0 && <div className="mt-3"><p className="mb-2 text-xs font-extrabold">Cierres anteriores</p><div className="grid gap-2">{history.map(row => <div key={row.id} className="flex justify-between gap-3 rounded-xl border p-2 text-xs"><span>{row.dayKey} · {row.responsibleName}</span><span className="text-right">Esperado {formatBs(row.expectedCash || 0)} · declarado {formatBs(row.declaredCash || 0)} · diferencia {formatBs(row.cashDifference || 0)}</span></div>)}</div></div>}
  </SectionCard>
}

const CLOSURE_STATUS: Record<DistClosure['status'], string> = {
  draft: 'Devolución declarada; espera confirmación de almacén',
  warehouse_done: 'Devolución confirmada por almacén',
  closed: 'Cierre finalizado',
  reopened: 'Cierre reabierto',
}

interface PhysicalDraft {
  normalReturn: string
  recoverableMerma: string
  nonSellableReturn: string
  nonSellableReason: string
}

function parseDraft(d?: Partial<PhysicalDraft>): DistPhysicalReturnBreakdown {
  const normal = Number(d?.normalReturn || 0)
  const merma = Number(d?.recoverableMerma || 0)
  const nonSellable = Number(d?.nonSellableReturn || 0)
  return {
    normalReturn: Number.isFinite(normal) ? round2(normal) : 0,
    recoverableMerma: Number.isFinite(merma) ? round2(merma) : 0,
    nonSellableReturn: Number.isFinite(nonSellable) ? round2(nonSellable) : 0,
    nonSellableReason: d?.nonSellableReason?.trim() || '',
    totalPhysicalReturn: round2(
      (Number.isFinite(normal) ? normal : 0) +
      (Number.isFinite(merma) ? merma : 0) +
      (Number.isFinite(nonSellable) ? nonSellable : 0)
    ),
  }
}

/**
 * Arqueo de ruta: conciliación física canónica por producto y cuadre de dinero.
 *
 * Flujo canónico:
 * 1. Declaración del distribuidor (Apto + Merma recuperable + No apto con motivo)
 * 2. Recepción y pesaje independiente de almacén
 * 3. Conciliación física (faltante/sobrante/desvío) y devolución a stock en almacén
 * 4. Cuadre final de dinero y cierre
 */
export function ClosureView({ session, data }: DistributionViewProps) {
  const isDistributor = session.role === 'distributor'
  const isWarehouse = session.role === 'warehouse'
  const availableDispatches = data.openDispatches.filter(d => !isWarehouse || (d.warehouseId || 'central') === (session.warehouseId || 'central'))
  const canRegisterReturn = session.can('dist.return.register')
  const canCloseMoney = session.can('dist.closure.money')

  const [selectedDispatchId, setSelectedDispatchId] = useState('')
  const [declarationDrafts, setDeclarationDrafts] = useState<Record<string, Record<string, PhysicalDraft>>>({})
  const [warehouseDrafts, setWarehouseDrafts] = useState<Record<string, Record<string, PhysicalDraft>>>({})
  const [cashDrafts, setCashDrafts] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isDispatchOpen, setIsDispatchOpen] = useState(false)
  const [historyOpenId, setHistoryOpenId] = useState<string | null>(null)

  const [reopenTarget, setReopenTarget] = useState<DistClosure | null>(null)
  const [reopenReason, setReopenReason] = useState('')

  const dispatch = availableDispatches.find(item => item.id === selectedDispatchId) ?? availableDispatches[0] ?? null
  const existingClosure = data.closures.find((closure) => closure.dispatchId === dispatch?.id) ?? null

  const returnsAlreadyApplied = Boolean(existingClosure?.warehouseClosedBy)
  const isReturnDeclared = Boolean(existingClosure?.returnDeclaredAt)

  const dispatchKey = dispatch?.id || ''
  const dispatchDay = dispatch?.dayKey || ''
  const dispatchRoute = dispatch?.routeId || ''
  const dispatchCreated = dispatch?.createdAt || ''

  // Valores guardados previos de declaración
  const savedDeclarationDrafts: Record<string, PhysicalDraft> = useMemo(() => {
    if (existingClosure?.declaredBreakdown) {
      const result: Record<string, PhysicalDraft> = {}
      for (const [pid, b] of Object.entries(existingClosure.declaredBreakdown)) {
        result[pid] = {
          normalReturn: b.normalReturn !== undefined ? String(b.normalReturn) : '',
          recoverableMerma: b.recoverableMerma !== undefined ? String(b.recoverableMerma) : '',
          nonSellableReturn: b.nonSellableReturn !== undefined ? String(b.nonSellableReturn) : '',
          nonSellableReason: b.nonSellableReason || '',
        }
      }
      return result
    }
    if (existingClosure?.declaredReturns) {
      const result: Record<string, PhysicalDraft> = {}
      for (const [pid, val] of Object.entries(existingClosure.declaredReturns)) {
        result[pid] = {
          normalReturn: String(val),
          recoverableMerma: existingClosure.declaredReturnMermas?.[pid] !== undefined ? String(existingClosure.declaredReturnMermas[pid]) : '',
          nonSellableReturn: existingClosure.declaredReturnNonSellables?.[pid] !== undefined ? String(existingClosure.declaredReturnNonSellables[pid]) : '',
          nonSellableReason: existingClosure.declaredReturnNonSellableReasons?.[pid] || '',
        }
      }
      return result
    }
    return {}
  }, [existingClosure])

  // Valores guardados previos de almacén
  const savedWarehouseDrafts: Record<string, PhysicalDraft> = useMemo(() => {
    if (existingClosure?.warehouseBreakdown) {
      const result: Record<string, PhysicalDraft> = {}
      for (const [pid, b] of Object.entries(existingClosure.warehouseBreakdown)) {
        result[pid] = {
          normalReturn: b.normalReturn !== undefined ? String(b.normalReturn) : '',
          recoverableMerma: b.recoverableMerma !== undefined ? String(b.recoverableMerma) : '',
          nonSellableReturn: b.nonSellableReturn !== undefined ? String(b.nonSellableReturn) : '',
          nonSellableReason: b.nonSellableReason || '',
        }
      }
      return result
    }
    if (existingClosure?.products?.length) {
      const result: Record<string, PhysicalDraft> = {}
      for (const p of existingClosure.products) {
        result[p.productId] = {
          normalReturn: String(p.actualReturn ?? ''),
          recoverableMerma: p.returnMerma !== undefined ? String(p.returnMerma) : '',
          nonSellableReturn: p.returnWaste !== undefined ? String(p.returnWaste) : '',
          nonSellableReason: p.returnWasteReason || '',
        }
      }
      return result
    }
    return {}
  }, [existingClosure])

  const curDecDrafts = declarationDrafts[dispatchKey] ?? savedDeclarationDrafts
  const curWhDrafts = warehouseDrafts[dispatchKey] ?? savedWarehouseDrafts

  const setDecDraft = (productId: string, patch: Partial<PhysicalDraft>) => {
    setDeclarationDrafts(cur => {
      const prevForDispatch = cur[dispatchKey] ?? savedDeclarationDrafts
      const prevProduct = prevForDispatch[productId] ?? { normalReturn: '', recoverableMerma: '', nonSellableReturn: '', nonSellableReason: '' }
      return {
        ...cur,
        [dispatchKey]: {
          ...prevForDispatch,
          [productId]: { ...prevProduct, ...patch },
        },
      }
    })
  }

  const setWhDraft = (productId: string, patch: Partial<PhysicalDraft>) => {
    setWarehouseDrafts(cur => {
      const prevForDispatch = cur[dispatchKey] ?? savedWarehouseDrafts
      const prevProduct = prevForDispatch[productId] ?? { normalReturn: '', recoverableMerma: '', nonSellableReturn: '', nonSellableReason: '' }
      return {
        ...cur,
        [dispatchKey]: {
          ...prevForDispatch,
          [productId]: { ...prevProduct, ...patch },
        },
      }
    })
  }

  const declaredCash = cashDrafts[dispatchKey] ?? (existingClosure?.physicalCashDeclared != null ? String(existingClosure.physicalCashDeclared) : '')
  const setDeclaredCash = (value: string) => setCashDrafts(current => ({ ...current, [dispatchKey]: value }))

  const [routeSales, setRouteSales] = useState<DistSale[]>([])
  const [routeCollections, setRouteCollections] = useState<DistCollection[]>([])
  const [routeExpenses, setRouteExpenses] = useState<DistExpense[]>([])
  const [readyDispatch, setReadyDispatch] = useState('')
  const loaded = readyDispatch === dispatchKey

  useEffect(() => {
    if (!dispatchKey) return
    const days = [dispatchDay, toDayKey(new Date())]
    const ready = new Set<string>()
    const expected = session.role === 'warehouse' ? 1 : 3
    const mark = (key: string) => { ready.add(key); if (ready.size >= expected) setReadyDispatch(dispatchKey) }
    const fail = (e: Error) => setError(e.message)
    const ownerUid = session.role === 'distributor' ? session.uid : undefined
    const stop = [subscribeSales(days, dispatchRoute, rows => { setRouteSales(rows.filter(s => isSaleForDispatch(s, dispatchRoute) && (s.dispatchId === dispatchKey || (!s.dispatchId && s.createdAt >= dispatchCreated)))); mark('sales') }, fail, ownerUid)]
    if (session.role !== 'warehouse') {
      stop.push(subscribeCollections(days, dispatchRoute, rows => { setRouteCollections(rows.filter(c => c.createdAt >= dispatchCreated)); mark('collections') }, fail, ownerUid))
      stop.push(subscribeExpenses(days, dispatchRoute, rows => { setRouteExpenses(rows.filter(e => e.createdAt >= dispatchCreated)); mark('expenses') }, fail, ownerUid))
    }
    return () => stop.forEach(fn => fn())
  }, [dispatchKey, dispatchDay, dispatchRoute, dispatchCreated, session.role, session.uid])

  const parsedDeclarationBreakdown = useMemo(() => {
    const map: Record<string, DistPhysicalReturnBreakdown> = {}
    for (const [pid, d] of Object.entries(curDecDrafts)) {
      map[pid] = parseDraft(d)
    }
    return map
  }, [curDecDrafts])

  const parsedWarehouseBreakdown = useMemo(() => {
    const map: Record<string, DistPhysicalReturnBreakdown> = {}
    for (const [pid, d] of Object.entries(curWhDrafts)) {
      map[pid] = parseDraft(d)
    }
    return map
  }, [curWhDrafts])

  // Conciliación física para la vista
  // Si almacén ya confirmó o está registrando recepción, usamos warehouse breakdown. Si no, usamos declaration breakdown.
  const activeBreakdown = (returnsAlreadyApplied || canRegisterReturn || isWarehouse) && Object.keys(parsedWarehouseBreakdown).length > 0
    ? parsedWarehouseBreakdown
    : parsedDeclarationBreakdown

  const productRows = useMemo(() => {
    return buildReconciliation(dispatch, routeSales, activeBreakdown)
  }, [dispatch, routeSales, activeBreakdown])

  const moneySummary = computeMoneySummary(routeSales, routeCollections, routeExpenses)
  const claimCash = data.claims.filter(c => c.routeId === dispatchRoute && c.createdAt >= dispatchCreated).reduce((n,c)=>n+c.cashIn-c.cashOut,0)
  const money = { ...moneySummary, expectedCash: round2(moneySummary.expectedCash + claimCash) }

  const declaredValue = round2(Number(declaredCash) || 0)
  const isCashDeclared = declaredCash !== ''
  const cashDifference = isCashDeclared ? round2(declaredValue - money.expectedCash) : 0

  const buildClosureDoc = (status: DistClosure['status']): DistClosure | null => {
    if (!dispatch) return null
    const now = new Date().toISOString()
    return {
      id: `closure_${dispatch.id}`,
      tenantId: session.tenantId,
      branchId: 'main',
      createdAt: existingClosure?.createdAt ?? now,
      createdBy: existingClosure?.createdBy ?? session.uid,
      dayKey: existingClosure?.dayKey ?? toDayKey(now),
      schemaVersion: 1,
      dispatchId: dispatch.id,
      warehouseId: dispatch.warehouseId || 'central',
      routeId: dispatch.routeId,
      routeName: dispatch.routeName,
      distributorUid: dispatch.distributorUid,
      distributorName: dispatch.distributorName,
      status,
      products: productRows,
      declaredReturns: existingClosure?.declaredReturns || {},
      declaredBreakdown: existingClosure?.declaredBreakdown || parsedDeclarationBreakdown,
      warehouseBreakdown: parsedWarehouseBreakdown,
      returnDeclaredBy: existingClosure?.returnDeclaredBy || '',
      returnDeclaredAt: existingClosure?.returnDeclaredAt || '',
      cashSales: money.cashSales,
      qrSales: money.qrSales,
      creditGenerated: money.creditGenerated,
      cashCollections: money.cashCollections,
      qrCollections: money.qrCollections,
      cashExpenses: money.cashExpenses,
      expectedCash: money.expectedCash,
      physicalCashDeclared: declaredValue,
      cashDifference,
      warehouseClosedBy: status === 'warehouse_done' ? session.uid : (existingClosure?.warehouseClosedBy ?? ''),
      warehouseClosedAt: status === 'warehouse_done' ? now : (existingClosure?.warehouseClosedAt ?? ''),
      closedBy: status === 'closed' ? session.uid : (existingClosure?.closedBy ?? ''),
      closedAt: status === 'closed' ? now : (existingClosure?.closedAt ?? ''),
      note: existingClosure?.note ?? '',
    }
  }

  // Validación y envío de declaración por el distribuidor
  const handleDeclareReturn = async () => {
    if (!dispatch || isSubmitting) return
    setError(null)

    // Validar que todos los productos de la ruta tengan datos
    for (const row of productRows) {
      const d = curDecDrafts[row.productId]
      if (!d || d.normalReturn === '' || Number.isNaN(Number(d.normalReturn))) {
        setError(`Falta declarar la cantidad apta devuelta de: ${row.productName}.`)
        return
      }
      const normal = Number(d.normalReturn)
      const merma = Number(d.recoverableMerma || 0)
      const nonSellable = Number(d.nonSellableReturn || 0)
      if (normal < 0 || merma < 0 || nonSellable < 0) {
        setError('No se permiten cantidades de retorno negativas.')
        return
      }
      if (row.unitType !== 'kg' && (!Number.isInteger(normal) || !Number.isInteger(nonSellable) || merma !== 0)) {
        setError(`El producto ${row.productName} es por unidades/paquetes; requiere enteros y sin merma.`)
        return
      }
      if (nonSellable > 0 && !d.nonSellableReason?.trim()) {
        setError(`Indica el motivo del producto no apto devuelto para: ${row.productName}.`)
        return
      }
    }

    setIsSubmitting(true)
    try {
      await declareRouteReturn(dispatch, parsedDeclarationBreakdown)
    } catch (e) {
      setError((e as Error).message || 'No se pudo registrar la declaración.')
    } finally {
      setIsSubmitting(false)
    }
  }

  // Validación y guardado de retorno de almacén o cierre de dinero
  const submit = async (status: DistClosure['status']) => {
    if (!dispatch || isSubmitting) return
    setError(null)

    const closure = buildClosureDoc(status)
    if (!closure) return

    if (status === 'warehouse_done') {
      if (!isReturnDeclared && !existingClosure?.returnDeclaredAt) {
        setError('El distribuidor debe declarar el retorno antes de la recepción física de almacén.')
        return
      }
      for (const row of productRows) {
        const d = curWhDrafts[row.productId]
        if (!d || d.normalReturn === '' || Number.isNaN(Number(d.normalReturn))) {
          setError(`Falta registrar el conteo/pesaje de almacén para: ${row.productName}.`)
          return
        }
        const normal = Number(d.normalReturn)
        const merma = Number(d.recoverableMerma || 0)
        const nonSellable = Number(d.nonSellableReturn || 0)
        if (normal < 0 || merma < 0 || nonSellable < 0) {
          setError('No se permiten cantidades de retorno negativas.')
          return
        }
        if (row.unitType !== 'kg' && (!Number.isInteger(normal) || !Number.isInteger(nonSellable) || merma !== 0)) {
          setError(`El producto ${row.productName} es por unidades/paquetes; requiere cantidades enteras sin merma.`)
          return
        }
        if (nonSellable > 0 && !d.nonSellableReason?.trim()) {
          setError(`Indica el motivo del producto no apto devuelto en almacén para: ${row.productName}.`)
          return
        }
      }
    }

    if (status === 'closed') {
      if (!returnsAlreadyApplied) {
        setError('Almacén debe confirmar primero la recepción física del retorno.')
        return
      }
      if (!declaredCash || !Number.isFinite(Number(declaredCash)) || Number(declaredCash) < 0) {
        setError('Ingresa el efectivo físico declarado antes de cerrar la ruta.')
        return
      }
    }

    setIsSubmitting(true)
    try {
      await saveClosure({ closure, applyStockReturn: status === 'warehouse_done' && !returnsAlreadyApplied })
    } catch (submitError) {
      setError((submitError as Error).message || 'No se pudo guardar el cierre.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleConfirmReopen = async () => {
    if (!reopenTarget || !reopenReason.trim() || isSubmitting) return
    setError(null)
    setIsSubmitting(true)
    try {
      await reopenClosure(reopenTarget, reopenReason.trim())
      setReopenTarget(null)
      setReopenReason('')
    } catch (e) {
      setError((e as Error).message || 'No se pudo reabrir el cierre.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const historicalClosures = data.closures
    .filter(closure => closure.closeType !== 'administrative')
    .filter(closure => session.role !== 'distributor' || closure.distributorUid === session.uid || closure.returnDeclaredBy === session.uid)
    .filter(closure => session.role !== 'warehouse' || (closure.warehouseId || 'central') === (session.warehouseId || 'central'))
    .slice()
    .sort((a, b) => (b.closedAt || b.warehouseClosedAt || b.createdAt).localeCompare(a.closedAt || a.warehouseClosedAt || a.createdAt))

  const closureHistory = (
    <SectionCard title="Historial de cierres">
      {historicalClosures.length === 0 ? <p className="text-xs font-semibold text-slate-500">Todavía no hay cierres registrados.</p> : <div className="grid gap-2">
        {historicalClosures.map(closure => {
          const expanded = historyOpenId === closure.id
          return <article key={closure.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
            <button type="button" onClick={() => setHistoryOpenId(expanded ? null : closure.id)} className="flex min-h-[62px] w-full items-center gap-3 p-3 text-left" aria-expanded={expanded}>
              <span className="min-w-0 flex-1">
                <strong className="block break-words text-sm text-slate-900">{closure.routeName || 'Ruta registrada'} · {closure.distributorName || 'Distribuidor'}</strong>
                <span className="mt-0.5 block text-[11px] font-semibold text-slate-500">{new Date(closure.closedAt || closure.warehouseClosedAt || closure.createdAt).toLocaleString('es-BO')}</span>
                <span className="mt-1 block text-[10px] font-extrabold text-[var(--primary)]">{CLOSURE_STATUS[closure.status] || 'Estado pendiente'}</span>
              </span>
              {expanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
            </button>
            {expanded && <div className="grid gap-3 border-t border-slate-100 p-3">
              <div className="grid gap-2 md:grid-cols-2">
                {closure.products.length === 0 ? <p className="text-xs text-slate-500">Almacén todavía no confirmó las cantidades.</p> : closure.products.map(row => (
                  <div key={row.productId} className="rounded-xl bg-slate-50 p-3">
                    <div className="flex items-start justify-between gap-2">
                      <strong className="min-w-0 break-words text-xs text-slate-900">{row.productName}</strong>
                      <VarianceBadge variance={row.variance} unitType={row.unitType} />
                    </div>
                    <dl className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                      <div><dt className="text-[9px] font-bold uppercase text-slate-400">Total físico</dt><dd className="text-xs font-black">{formatQty(row.totalLoadedPhysical ?? row.totalLoaded, row.unitType)}</dd></div>
                      <div><dt className="text-[9px] font-bold uppercase text-slate-400">Vendido</dt><dd className="text-xs font-black">{formatQty(row.sold, row.unitType)}</dd></div>
                      <div><dt className="text-[9px] font-bold uppercase text-slate-400">Debía volver</dt><dd className="text-xs font-black">{formatQty(row.expectedReturn, row.unitType)}</dd></div>
                      <div><dt className="text-[9px] font-bold uppercase text-slate-400">Apto vuelto</dt><dd className="text-xs font-black">{formatQty(row.actualReturn, row.unitType)}</dd></div>
                    </dl>
                    {(row.returnMerma || row.returnWaste || row.shortage || row.overage || row.declarationVariance !== undefined) && (
                      <div className="mt-2 flex flex-wrap gap-2 text-[10px] font-bold text-slate-600">
                        {Boolean(row.returnMerma) && <span className="rounded bg-amber-100 px-1.5 py-0.5 text-amber-800">Merma rec: {formatQty(row.returnMerma!, row.unitType)}</span>}
                        {Boolean(row.returnWaste) && <span className="rounded bg-rose-100 px-1.5 py-0.5 text-rose-800">Pérdida/Desecho: {formatQty(row.returnWaste!, row.unitType)} ({row.returnWasteReason || 'sin motivo'})</span>}
                        {Boolean(row.shortage) && <span className="rounded bg-rose-200 px-1.5 py-0.5 text-rose-900">Faltante: {formatQty(row.shortage!, row.unitType)}</span>}
                        {Boolean(row.overage) && <span className="rounded bg-indigo-100 px-1.5 py-0.5 text-indigo-900">Sobrante a cuarentena: {formatQty(row.overage!, row.unitType)}</span>}
                        {row.declarationVariance !== undefined && row.declarationVariance !== 0 && (
                          <span className={`rounded px-1.5 py-0.5 ${row.declarationVariance < 0 ? 'bg-amber-100 text-amber-900' : 'bg-emerald-100 text-emerald-900'}`}>
                            Desvío pesaje: {row.declarationVariance > 0 ? `+${row.declarationVariance}` : row.declarationVariance} {row.unitType}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
              {session.role === 'admin' && closure.status === 'closed' && (
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <KpiCard label="Ventas efectivo" value={formatBs(closure.cashSales)} />
                  <KpiCard label="Ventas QR" value={formatBs(closure.qrSales)} />
                  <KpiCard label="Crédito" value={formatBs(closure.creditGenerated)} />
                  <KpiCard label="Cobros efectivo" value={formatBs(closure.cashCollections)} />
                  <KpiCard label="Cobros QR" value={formatBs(closure.qrCollections)} />
                  <KpiCard label="Gastos" value={formatBs(closure.cashExpenses)} />
                  <KpiCard label="Efectivo esperado" value={formatBs(closure.expectedCash)} />
                  <KpiCard label="Efectivo declarado" value={formatBs(closure.physicalCashDeclared)} />
                </div>
              )}
              {session.role === 'admin' && closure.status === 'closed' && (
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <VarianceBadge variance={closure.cashDifference} />
                  <SecondaryButton onClick={() => setReopenTarget(closure)}>
                    <Unlock size={15} /> Reabrir cierre
                  </SecondaryButton>
                </div>
              )}
            </div>}
          </article>
        })}
      </div>}
    </SectionCard>
  )

  if (!dispatch) {
    return (
      <Screen title="Cierre de ruta">
        <AdministrativeCashClose session={session} data={data} />
        {isDistributor && (
          <p className="rounded-2xl bg-amber-50 p-3 text-xs font-semibold leading-relaxed text-amber-900">
            Para cerrar tu ruta, primero declaras cuánto producto devuelves. Almacén cuenta y confirma físicamente esa devolución; después se habilita el cierre final del efectivo.
          </p>
        )}
        <EmptyBlock
          title="No hay rutas abiertas"
          description={isDistributor ? 'El arqueo se habilita cuando Almacén registra una carga abierta para tu usuario.' : 'El arqueo se hace sobre un despacho abierto. Registra un despacho primero.'}
        />
        {closureHistory}
        {error && <p role="alert" className="text-sm text-rose-700">{error}</p>}
      </Screen>
    )
  }

  return (
    <Screen title="Cierre de ruta" subtitle={`${dispatch.routeName} · ${dispatch.distributorName}`}>
      <div className="grid w-full min-w-0 gap-3">
        <AdministrativeCashClose session={session} data={data} />
        {availableDispatches.length > 1 && (
          <Field label="Ruta a cerrar">
            <ChoiceButton label={`${dispatch.routeName} · ${dispatch.distributorName}`} placeholder="Selecciona despacho" onClick={() => setIsDispatchOpen(true)} />
          </Field>
        )}

        <div className="rounded-2xl bg-amber-50 p-3.5 text-xs font-semibold leading-relaxed text-amber-900">
          <p className="font-extrabold">Flujo físico de cierre en 2 pasos:</p>
          <ol className="mt-1.5 list-inside list-decimal space-y-1">
            <li><strong>Declaración del distribuidor:</strong> Registra las cantidades físicas que trae de vuelta (apto, merma y pérdidas).</li>
            <li><strong>Recepción independiente de almacén:</strong> Almacén realiza el pesaje/conteo físico. El stock apto vuelve al inventario y se liquidan faltantes/sobrantes.</li>
            <li><strong>Arqueo de dinero:</strong> Tras la confirmación de almacén, se realiza el cuadre y entrega de caja.</li>
          </ol>
        </div>

        {/* =========================================================================
            SECCIÓN 1: PRODUCTOS EN RUTA Y CONCILIACIÓN FÍSICA
           ========================================================================= */}
        <div data-tutorial-target="closure-physical-reconciliation">
        <SectionCard title="Conciliación física de productos">
          <div className="grid gap-3">
            {productRows.map((row) => {
              const decDraft = curDecDrafts[row.productId] ?? { normalReturn: '', recoverableMerma: '', nonSellableReturn: '', nonSellableReason: '' }
              const whDraft = curWhDrafts[row.productId] ?? { normalReturn: '', recoverableMerma: '', nonSellableReturn: '', nonSellableReason: '' }
              const decParsed = parseDraft(decDraft)
              const whParsed = parseDraft(whDraft)

              const declaredPhysical = existingClosure?.declaredBreakdown?.[row.productId]?.totalPhysicalReturn
                ?? (existingClosure?.declaredReturns?.[row.productId] !== undefined
                    ? round2(
                        Number(existingClosure.declaredReturns[row.productId] || 0) +
                        Number(existingClosure.declaredReturnMermas?.[row.productId] || 0) +
                        Number(existingClosure.declaredReturnNonSellables?.[row.productId] || 0)
                      )
                    : decParsed.totalPhysicalReturn ?? 0)

              const hasDeclaration = isReturnDeclared || Boolean(existingClosure?.returnDeclaredAt)
              const hasWarehouseConfirmation = returnsAlreadyApplied

              const isKg = row.unitType === 'kg'

              return (
                <div key={row.productId} className="w-full min-w-0 rounded-2xl border border-slate-200 bg-white p-3.5 shadow-sm">
                  {/* Encabezado del producto */}
                  <div className="flex items-start justify-between gap-2 border-b border-slate-100 pb-2.5">
                    <div>
                      <p className="min-w-0 break-words text-sm font-extrabold text-slate-900">{row.productName}</p>
                      <span className="text-[10px] font-bold uppercase text-slate-400">Unidad: {row.unitType}</span>
                    </div>
                    {hasWarehouseConfirmation ? (
                      <VarianceBadge variance={row.variance} unitType={row.unitType} />
                    ) : hasDeclaration ? (
                      <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-[10px] font-black text-amber-800">
                        <Scale size={11} /> RETORNO DECLARADO
                      </span>
                    ) : (
                      <span className="inline-flex shrink-0 rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-black text-slate-500">
                        SIN DECLARAR
                      </span>
                    )}
                  </div>

                  {/* Datos de carga y ventas */}
                  <dl className="mt-2.5 grid grid-cols-2 gap-x-3 gap-y-1.5 sm:grid-cols-4">
                    <div>
                      <dt className="text-[10px] font-bold uppercase text-slate-400">Despacho inicial</dt>
                      <dd className="text-xs font-black tabular-nums text-slate-800">
                        {formatQty(row.initialPhysicalDispatch ?? row.initialDispatch, row.unitType)}
                        {Boolean(row.initialDispatchMerma) && (
                          <span className="block text-[9px] font-semibold text-amber-700">
                            ({formatQty(row.initialNormalDispatch ?? row.initialDispatch, row.unitType)} + {formatQty(row.initialDispatchMerma ?? 0, row.unitType)} merma)
                          </span>
                        )}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-[10px] font-bold uppercase text-slate-400">Aumentos</dt>
                      <dd className="text-xs font-black tabular-nums text-slate-800">
                        {formatQty(row.additionsPhysical ?? row.additions, row.unitType)}
                        {Boolean(row.additionsMerma) && (
                          <span className="block text-[9px] font-semibold text-amber-700">
                            (+{formatQty(row.additionsMerma ?? 0, row.unitType)} merma)
                          </span>
                        )}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-[10px] font-bold uppercase text-slate-400">Vendido</dt>
                      <dd className="text-xs font-black tabular-nums text-slate-800">{formatQty(row.sold, row.unitType)}</dd>
                    </div>
                    <div>
                      <dt className="text-[10px] font-bold uppercase text-slate-400">Debe retornar</dt>
                      <dd className="text-xs font-black tabular-nums text-slate-800">
                        {formatQty(row.expectedReturn, row.unitType)}
                      </dd>
                    </div>
                  </dl>

                  {/* -----------------------------------------------------------------
                      PASO 1: DECLARACIÓN DEL DISTRIBUIDOR
                     ----------------------------------------------------------------- */}
                  <div className="mt-3 rounded-xl border border-slate-100 bg-slate-50/70 p-3">
                    <div className="flex items-center justify-between gap-2 pb-1.5">
                      <span className="text-[11px] font-extrabold uppercase tracking-wide text-slate-600">
                        1. Declaración del distribuidor
                      </span>
                      {hasDeclaration && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-black text-emerald-700">
                          <CheckCircle2 size={12} /> Declarado
                        </span>
                      )}
                    </div>

                    {!hasDeclaration && (!hasWarehouseConfirmation && (isDistributor || session.role === 'admin')) ? (
                      <div className="mt-1 grid gap-2">
                        <FormGrid columns={isKg ? 2 : 1}>
                          <Field label="Apto normal que devuelve">
                            <NumberInput
                              value={decDraft.normalReturn}
                              min={0}
                              step={isKg ? 0.01 : 1}
                              placeholder="0"
                              onChange={(e) => setDecDraft(row.productId, { normalReturn: e.target.value })}
                            />
                          </Field>
                          {isKg && (
                            <Field label="Merma operativa recuperable (kg)">
                              <NumberInput
                                value={decDraft.recoverableMerma}
                                min={0}
                                step={0.01}
                                placeholder="0"
                                onChange={(e) => setDecDraft(row.productId, { recoverableMerma: e.target.value })}
                              />
                            </Field>
                          )}
                        </FormGrid>

                        <FormGrid columns={2}>
                          <Field label="No apto / vencido / roto">
                            <NumberInput
                              value={decDraft.nonSellableReturn}
                              min={0}
                              step={isKg ? 0.01 : 1}
                              placeholder="0"
                              onChange={(e) => setDecDraft(row.productId, { nonSellableReturn: e.target.value })}
                            />
                          </Field>
                          <Field label="Motivo si no es apto" required={Number(decDraft.nonSellableReturn) > 0}>
                            <TextInput
                              value={decDraft.nonSellableReason}
                              placeholder="Ej: vencimiento, bolsa rota"
                              onChange={(e) => setDecDraft(row.productId, { nonSellableReason: e.target.value })}
                            />
                          </Field>
                        </FormGrid>

                        <div className="mt-1 flex items-center justify-between text-xs font-black text-slate-700">
                          <span>Total físico que declaras devolver:</span>
                          <span className="tabular-nums">{formatQty(decParsed.totalPhysicalReturn ?? 0, row.unitType)}</span>
                        </div>
                      </div>
                    ) : (
                      // Vista de sólo lectura de la declaración registrada
                      <div className="mt-1 rounded-lg bg-white p-2 text-xs font-semibold text-slate-700 shadow-2xs">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span>
                            Apto: <strong>{formatQty(row.declared?.normal ?? decParsed.normalReturn, row.unitType)}</strong>
                            {Boolean(row.declared?.recoverableMerma || decParsed.recoverableMerma) && (
                              <span className="ml-1 text-amber-700">+ {formatQty(row.declared?.recoverableMerma ?? decParsed.recoverableMerma, row.unitType)} merma</span>
                            )}
                            {Boolean(row.declared?.nonSellable || decParsed.nonSellableReturn) && (
                              <span className="ml-1 text-rose-700">+ {formatQty(row.declared?.nonSellable ?? decParsed.nonSellableReturn, row.unitType)} pérdida</span>
                            )}
                          </span>
                          <span className="font-extrabold text-slate-900">
                            Total declarado: {formatQty(row.declared?.totalPhysical ?? declaredPhysical, row.unitType)}
                          </span>
                        </div>
                        {(row.declared?.nonSellableReason || decParsed.nonSellableReason) && (
                          <p className="mt-1 text-[11px] font-normal italic text-slate-500">
                            Motivo no apto: {row.declared?.nonSellableReason || decParsed.nonSellableReason}
                          </p>
                        )}
                      </div>
                    )}
                  </div>

                  {/* -----------------------------------------------------------------
                      PASO 2: RECEPCIÓN Y PESAJE INDEPENDIENTE DE ALMACÉN
                     ----------------------------------------------------------------- */}
                  {hasDeclaration && (
                    <div className="mt-3 rounded-xl border border-slate-200 bg-white p-3">
                      <div className="flex items-center justify-between gap-2 pb-1.5">
                        <span className="text-[11px] font-extrabold uppercase tracking-wide text-slate-800">
                          2. Recepción y pesaje de almacén
                        </span>
                        {hasWarehouseConfirmation ? (
                          <span className="inline-flex items-center gap-1 text-[10px] font-black text-emerald-700">
                            <CheckCircle2 size={12} /> Confirmado por almacén
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[10px] font-black text-amber-700">
                            <AlertTriangle size={12} /> Pendiente de confirmación
                          </span>
                        )}
                      </div>

                      {!hasWarehouseConfirmation ? (
                        <div className="mt-1 grid gap-2">
                          <p className="text-[11px] text-slate-500">
                            Almacén debe contar/pesar independientemente. No reutilices ciegamente lo declarado.
                          </p>
                          <FormGrid columns={isKg ? 2 : 1}>
                            <Field label="Apto normal recibido en almacén">
                              <NumberInput
                                value={whDraft.normalReturn}
                                min={0}
                                step={isKg ? 0.01 : 1}
                                disabled={!canRegisterReturn && !isWarehouse && session.role !== 'admin'}
                                placeholder="0"
                                onChange={(e) => setWhDraft(row.productId, { normalReturn: e.target.value })}
                              />
                            </Field>
                            {isKg && (
                              <Field label="Merma recuperable recibida (kg)">
                                <NumberInput
                                  value={whDraft.recoverableMerma}
                                  min={0}
                                  step={0.01}
                                  disabled={!canRegisterReturn && !isWarehouse && session.role !== 'admin'}
                                  placeholder="0"
                                  onChange={(e) => setWhDraft(row.productId, { recoverableMerma: e.target.value })}
                                />
                              </Field>
                            )}
                          </FormGrid>

                          <FormGrid columns={2}>
                            <Field label="No apto / desecho recibido">
                              <NumberInput
                                value={whDraft.nonSellableReturn}
                                min={0}
                                step={isKg ? 0.01 : 1}
                                disabled={!canRegisterReturn && !isWarehouse && session.role !== 'admin'}
                                placeholder="0"
                                onChange={(e) => setWhDraft(row.productId, { nonSellableReturn: e.target.value })}
                              />
                            </Field>
                            <Field label="Motivo de pérdida" required={Number(whDraft.nonSellableReturn) > 0}>
                              <TextInput
                                value={whDraft.nonSellableReason}
                                disabled={!canRegisterReturn && !isWarehouse && session.role !== 'admin'}
                                placeholder="Motivo de desecho/pérdida"
                                onChange={(e) => setWhDraft(row.productId, { nonSellableReason: e.target.value })}
                              />
                            </Field>
                          </FormGrid>

                          {/* Comparativa y desvío de pesaje vs lo declarado */}
                          <div className="mt-1 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-50 p-2 text-xs">
                            <span className="font-bold text-slate-700">
                              Total físico contado por almacén: <strong>{formatQty(whParsed.totalPhysicalReturn ?? 0, row.unitType)}</strong>
                            </span>
                            {whDraft.normalReturn !== '' && (
                              <span className={`font-black ${round2((whParsed.totalPhysicalReturn ?? 0) - declaredPhysical) === 0 ? 'text-slate-600' : round2((whParsed.totalPhysicalReturn ?? 0) - declaredPhysical) < 0 ? 'text-rose-600' : 'text-emerald-700'}`}>
                                Desvío vs declarado: {round2((whParsed.totalPhysicalReturn ?? 0) - declaredPhysical) > 0 ? `+${round2((whParsed.totalPhysicalReturn ?? 0) - declaredPhysical)}` : round2((whParsed.totalPhysicalReturn ?? 0) - declaredPhysical)} {row.unitType}
                              </span>
                            )}
                          </div>
                        </div>
                      ) : (
                        // Vista confirmada de almacén
                        <div className="mt-1 rounded-lg bg-slate-50 p-2.5 text-xs font-semibold text-slate-700">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span>
                              Apto: <strong>{formatQty(row.actualReturn, row.unitType)}</strong>
                              {Boolean(row.returnMerma) && <span className="ml-1 text-amber-700">+ {formatQty(row.returnMerma ?? 0, row.unitType)} merma rec</span>}
                              {Boolean(row.returnWaste) && <span className="ml-1 text-rose-700">+ {formatQty(row.returnWaste ?? 0, row.unitType)} no apto</span>}
                            </span>
                            <span className="font-extrabold text-slate-900">
                              Total recibido: {formatQty(round2(row.actualReturn + (row.returnMerma || 0) + (row.returnWaste || 0)), row.unitType)}
                            </span>
                          </div>
                          <div className="mt-2 flex flex-wrap gap-2 text-[10px]">
                            {Boolean(row.shortage) && <span className="rounded bg-rose-100 px-1.5 py-0.5 font-bold text-rose-800">Faltante: {formatQty(row.shortage!, row.unitType)}</span>}
                            {Boolean(row.overage) && <span className="rounded bg-indigo-100 px-1.5 py-0.5 font-bold text-indigo-800">Sobrante a cuarentena: {formatQty(row.overage!, row.unitType)}</span>}
                            {row.declarationVariance !== undefined && row.declarationVariance !== 0 && (
                              <span className="rounded bg-amber-100 px-1.5 py-0.5 font-bold text-amber-900">
                                Desvío de pesaje: {row.declarationVariance > 0 ? `+${row.declarationVariance}` : row.declarationVariance} {row.unitType}
                              </span>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </SectionCard>
        </div>

        {/* =========================================================================
            BOTÓN ACCIÓN PASO 1: DECLARAR RETORNO PARA ALMACÉN
           ========================================================================= */}
        {!isReturnDeclared && (isDistributor || session.role === 'admin') && (
          <div data-tutorial-target="closure-returns-card" className="w-full">
            <SecondaryButton full disabled={isSubmitting || !loaded} onClick={handleDeclareReturn}>
              <ClipboardCheck size={16} /> Declarar retorno para almacén
            </SecondaryButton>
          </div>
        )}

        {/* =========================================================================
            BOTÓN ACCIÓN PASO 2: CONFIRMAR RECEPCIÓN FÍSICA EN ALMACÉN
           ========================================================================= */}
        {isReturnDeclared && !returnsAlreadyApplied && (canRegisterReturn || isWarehouse || session.role === 'admin') && (
          <SecondaryButton full disabled={isSubmitting || !loaded} onClick={() => void submit('warehouse_done')}>
            <PackageCheck size={16} /> Confirmar recepción física de almacén
          </SecondaryButton>
        )}

        {/* =========================================================================
            SECCIÓN 2: ARQUEO DE DINERO Y CIERRE FINAL
           ========================================================================= */}
        {session.role !== 'warehouse' && (
          <div data-tutorial-target="closure-cash-reconciliation" className="w-full">
            <SectionCard title="Arqueo de dinero">
            {!returnsAlreadyApplied ? (
              <p className="rounded-xl bg-slate-100 p-3 text-xs font-semibold text-slate-600">
                El arqueo y cierre final del dinero se habilitará en cuanto Almacén confirme la recepción física del retorno.
              </p>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  <KpiCard label="Ventas efectivo" value={formatBs(money.cashSales)} />
                  <KpiCard label="Ventas QR" value={formatBs(money.qrSales)} />
                  <KpiCard label="Crédito generado" value={formatBs(money.creditGenerated)} tone="warning" />
                  <KpiCard label="Cobros efectivo" value={formatBs(money.cashCollections)} />
                  <KpiCard label="Cobros QR" value={formatBs(money.qrCollections)} />
                  <KpiCard label="Gastos" value={formatBs(money.cashExpenses)} tone="danger" />
                </div>

                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <KpiCard
                    label="Efectivo esperado"
                    value={formatBs(money.expectedCash)}
                    hint="Ventas efectivo + cobros efectivo - gastos"
                    tone="primary"
                  />
                  <Field label="Efectivo físico declarado (Bs)">
                    <NumberInput
                      value={declaredCash}
                      min={0}
                      step={1}
                      disabled={!canCloseMoney || existingClosure?.status === 'closed'}
                      onChange={(event) => setDeclaredCash(event.target.value)}
                    />
                  </Field>
                </div>

                <div className="mt-3 grid grid-cols-2 gap-2">
                  <KpiCard
                    label="QR confirmado"
                    value={formatBs(data.supportSettings.requireQrVerification ? data.qrVerifications.filter(v => (v.sourceType === 'sale' ? routeSales.some(s => s.id === v.sourceId) : routeCollections.some(c => c.id === v.sourceId))).reduce((sum, v) => sum + v.amount, 0) : money.qrSales + money.qrCollections)}
                    tone="positive"
                  />
                  <KpiCard
                    label="QR por verificar"
                    value={formatBs(data.supportSettings.requireQrVerification ? money.qrSales + money.qrCollections - data.qrVerifications.filter(v => (v.sourceType === 'sale' ? routeSales.some(s => s.id === v.sourceId) : routeCollections.some(c => c.id === v.sourceId))).reduce((sum, v) => sum + v.amount, 0) : 0)}
                    tone="warning"
                  />
                </div>
                <p className="mt-2 text-xs text-slate-500">Administración concilia los depósitos en Verificar QR. El dinero del banco se verifica por separado del efectivo en mano.</p>
                {isCashDeclared && (
                  <div className="mt-3 flex items-center justify-between gap-2 rounded-2xl bg-slate-50 px-3 py-2.5">
                    <span className="text-xs font-extrabold uppercase text-slate-500">Diferencia de caja</span>
                    <VarianceBadge variance={cashDifference} />
                  </div>
                )}

                {canCloseMoney && existingClosure?.status !== 'closed' && (
                  <div className="mt-3">
                    <PrimaryButton data-tutorial-target="closure-submit-btn" full disabled={isSubmitting || !loaded || !returnsAlreadyApplied} onClick={() => void submit('closed')}>
                      <Lock size={16} /> Cerrar ruta
                    </PrimaryButton>
                  </div>
                )}
              </>
            )}
          </SectionCard>
          </div>
        )}

        {error && <p role="alert" className="text-xs font-bold text-rose-600">{error}</p>}

        {/* Estado general del cierre y opción de reapertura */}
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-slate-200 bg-white p-3">
          <p className="text-[11px] font-bold text-slate-500">
            <ClipboardCheck size={13} className="mr-1 inline" />
            Estado del cierre: {existingClosure ? CLOSURE_STATUS[existingClosure.status] || 'Pendiente' : 'Devolución pendiente de declarar'}
          </p>
          {existingClosure?.status === 'closed' && session.can('dist.reports.view') && (
            <SecondaryButton onClick={() => setReopenTarget(existingClosure)}>
              <Unlock size={15} /> Reabrir (administración)
            </SecondaryButton>
          )}
        </div>

        {closureHistory}
      </div>

      <ChoiceModal
        isOpen={isDispatchOpen}
        onClose={() => setIsDispatchOpen(false)}
        title="Ruta a cerrar"
        subtitle="Selecciona un despacho abierto"
        searchable
        options={availableDispatches.map(item => ({ value: item.id, label: item.routeName, description: `${item.distributorName} · ${new Date(item.createdAt).toLocaleString('es-BO')}` }))}
        selectedValue={dispatch.id}
        onSelect={setSelectedDispatchId}
      />

      {/* Modal de confirmación de reapertura con motivo obligatorio */}
      <Modal
        isOpen={Boolean(reopenTarget)}
        onClose={() => { if (!isSubmitting) setReopenTarget(null) }}
        title="Reabrir cierre de ruta"
        subtitle={`${reopenTarget?.routeName || 'Ruta'} · ${reopenTarget?.distributorName || 'Distribuidor'}`}
        variant="dialog"
        footer={
          <div className="flex w-full gap-2">
            <SecondaryButton full disabled={isSubmitting} onClick={() => setReopenTarget(null)}>
              Cancelar
            </SecondaryButton>
            <PrimaryButton full disabled={isSubmitting || !reopenReason.trim()} onClick={handleConfirmReopen}>
              Confirmar reapertura
            </PrimaryButton>
          </div>
        }
      >
        <div className="space-y-3">
          <p className="text-xs font-semibold leading-relaxed text-slate-600">
            Al reabrir el cierre, se revertirá el retorno del stock apto a la ruta (siempre que el almacén no haya consumido esos lotes) y la ruta volverá a estado abierto para correcciones.
          </p>
          <Field label="Motivo de la reapertura" required error={!reopenReason.trim() ? 'El motivo es obligatorio' : null}>
            <TextInput
              value={reopenReason}
              placeholder="Ej: Corrección de pesaje de merma o conteo físico"
              onChange={(e) => setReopenReason(e.target.value)}
            />
          </Field>
        </div>
      </Modal>
    </Screen>
  )
}
