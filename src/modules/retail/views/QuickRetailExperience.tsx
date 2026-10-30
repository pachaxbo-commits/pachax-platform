import { useCallback, useEffect, useMemo, useState } from 'react'
import { Boxes, ChartNoAxesCombined, LoaderCircle, PackagePlus, RefreshCw, ShoppingCart, Users, Wallet } from 'lucide-react'
import { authorizeReportAction, createRetailMember, loadRetailReportPage, loadRetailState, runRetailCommand, subscribeRetailMembers, updateRetailMember, type RetailReportPage, type RetailTenantMember, type RetailTenantProduct, type RetailTenantSale, type RetailTenantState } from '../data/retailRepository'
import type { BusinessIdentity } from '../../../core/businessIdentity'
import { resolveBusinessDocumentContext } from '../../../core/documents/businessDocumentContext'
import { type CanonicalReceiptData } from '../../../core/receiptService'
import { CanonicalReceiptModal } from '../../../components/receipt/CanonicalReceiptModal'
import { printBusinessReceipt } from '../../../services/printing/businessDocumentPrintService'
import { localDateKey, reportPeriodUtcRange } from '../../../core/reports/reportPeriod'
import { canUseReportCapability } from '../../../core/reports/reportCapabilities'
import { exportBusinessReport } from '../../../core/reports/reportExport'
import { makeBusinessReport } from '../../../core/reports/reportTypes'
import type { ReportSheet } from '../../../core/reports/reportTypes'
import { printBusinessReport } from '../../../core/reports/businessReportPrintService'
import { reportPaginationIsComplete } from '../../../core/reports/reportCompleteness'
import { canUseDocumentCapability } from '../../../core/documents/documentCapabilities'
import { getActiveTenant } from '../../../store/activeTenant'

type Section = 'pos' | 'products' | 'inventory' | 'cash' | 'reports' | 'users'
type CartLine = { productId: string; quantity: number }
type RetailReceiptDraft = {
  method: 'cash' | 'qr' | 'mixed'
  items: Array<{ name: string; quantity: number; unit: string; totalMinor: number }>
}
type RetailReceipt = RetailReceiptDraft & {
  saleId: string
  totalMinor: number
  changeMinor: number
  printedAt: string
}
const EMPTY_STATE: RetailTenantState = { products: [], archivedProducts: [], archivedProductsComplete: true, activeShift: null, recentSales: [], historyLimit: 50, historyComplete: false }
const MINOR_MAX = 9_000_000_000
const toMinor = (value: string) => {
  if (!/^\d+(\.\d{1,2})?$/.test(value.trim())) return null
  const [whole, fraction = ''] = value.trim().split('.')
  const minor = Number(whole) * 100 + Number(fraction.padEnd(2, '0'))
  return Number.isSafeInteger(minor) && minor <= MINOR_MAX ? minor : null
}
const money = (minor: number) => `Bs ${(minor / 100).toFixed(2)}`
const roleAllows = (role: string, section: Section) => ({
  pos: ['owner', 'admin', 'cashier', 'sales'].includes(role),
  products: ['owner', 'admin', 'inventory'].includes(role),
  inventory: ['owner', 'admin', 'inventory'].includes(role),
  cash: ['owner', 'admin', 'cashier'].includes(role),
  reports: ['owner', 'admin'].includes(role),
  users: ['owner', 'admin'].includes(role),
}[section])

export interface QuickRetailExperienceProps {
  tenantId: string
  branchId: string
  uid: string
  userName: string
  role: string
  companyName: string
  businessIdentity?: BusinessIdentity
  logoUrl?: string
  branchName?: string
}

export function QuickRetailExperience({ tenantId, branchId, uid, userName, role, companyName, businessIdentity, logoUrl, branchName = 'Sucursal principal' }: QuickRetailExperienceProps) {
  const [section, setSection] = useState<Section>('pos')
  const [state, setState] = useState<RetailTenantState>(EMPTY_STATE)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [operationIds, setOperationIds] = useState<Record<string, string>>({})
  const [retry, setRetry] = useState<{ key: string; command: Parameters<typeof runRetailCommand>[2]; payload: Record<string, unknown>; id: string } | null>(null)
  const [search, setSearch] = useState('')
  const [weightInputs, setWeightInputs] = useState<Record<string, string>>({})
  const [members, setMembers] = useState<RetailTenantMember[]>([])
  const [membersError, setMembersError] = useState('')
  const [memberSaving, setMemberSaving] = useState(false)
  const [memberNotice, setMemberNotice] = useState('')
  const [memberForm, setMemberForm] = useState({ displayName: '', email: '', roleId: 'cashier' as 'admin' | 'cashier' | 'sales' | 'inventory', password: '' })
  const [memberOperationId, setMemberOperationId] = useState('')
  const [memberRoleDrafts, setMemberRoleDrafts] = useState<Record<string, 'admin' | 'cashier' | 'sales' | 'inventory'>>({})
  const [cart, setCart] = useState<CartLine[]>([])
  const [method, setMethod] = useState<'cash' | 'qr' | 'mixed'>('cash')
  const [cashMinorInput, setCashMinorInput] = useState('')
  const [cashReceivedInput, setCashReceivedInput] = useState('')
  const [lastSale, setLastSale] = useState<{ saleId: string; totalMinor: number; changeMinor: number } | null>(null)
  const [receiptDraft, setReceiptDraft] = useState<RetailReceiptDraft | null>(null)
  const [lastReceipt, setLastReceipt] = useState<RetailReceipt | null>(null)
  const [receiptOpen, setReceiptOpen] = useState(false)
  const [productForm, setProductForm] = useState({ name: '', category: '', sku: '', soldBy: 'unit' as 'unit' | 'weight', price: '' })
  const [stockForm, setStockForm] = useState({ productId: '', quantity: '', direction: 'in' as 'in' | 'out', reason: '' })
  const [openingFloat, setOpeningFloat] = useState('')
  const [movement, setMovement] = useState({ type: 'expense' as 'income' | 'expense', amount: '', reason: '' })
  const [countedCash, setCountedCash] = useState('')
  const timeZone = getActiveTenant()?.tenant.configuration?.timezone || 'America/La_Paz'
  const [reportStartDate, setReportStartDate] = useState(() => localDateKey(new Date(), timeZone))
  const [reportEndDate, setReportEndDate] = useState(() => localDateKey(new Date(), timeZone))
  const [reportSales, setReportSales] = useState<RetailTenantSale[]>([])
  const [reportCursor, setReportCursor] = useState<RetailReportPage['cursor']>(null)
  const [reportHasMore, setReportHasMore] = useState(false)
  const [reportComplete, setReportComplete] = useState(false)
  const [reportLoading, setReportLoading] = useState(false)
  const [reportPageCount, setReportPageCount] = useState(0)
  const [reportLoadedPeriod, setReportLoadedPeriod] = useState('')
  const reportPeriod = `${reportStartDate}/${reportEndDate}/${timeZone}`
  const documentContext = useMemo(() => resolveBusinessDocumentContext(businessIdentity, { name: branchName }, { companyName, logoUrl }), [businessIdentity, branchName, companyName, logoUrl])
  const receiptData: CanonicalReceiptData | null = useMemo(() => lastReceipt ? {
    receiptNumber: lastReceipt.saleId.slice(-8).toUpperCase(),
    dateIso: lastReceipt.printedAt,
    fulfillmentType: 'Venta rápida',
    customer: undefined,
    items: lastReceipt.items.map(item => ({
      name: item.name,
      quantity: item.quantity,
      unitLabel: item.unit,
      unitPrice: item.quantity ? item.totalMinor / 100 / item.quantity : 0,
      lineTotal: item.totalMinor / 100,
    })),
    subtotal: lastReceipt.totalMinor / 100,
    discountTotal: 0,
    total: lastReceipt.totalMinor / 100,
    paymentMethod: lastReceipt.method === 'qr' ? 'QR (registro manual)' : lastReceipt.method === 'mixed' ? 'Mixto' : 'Efectivo',
    documentStatus: 'payment_confirmed',
    cashReceived: lastReceipt.method === 'qr' ? undefined : (lastReceipt.totalMinor + lastReceipt.changeMinor) / 100,
    changeAmount: lastReceipt.changeMinor / 100,
    notes: 'Comprobante interno. No es una factura fiscal.',
  } : null, [lastReceipt])

  const refresh = useCallback(async () => {
    setLoading(true)
    setError('')
    try { setState(await loadRetailState(tenantId, branchId)) }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'No se pudieron cargar los datos de Comercio.') }
    finally { setLoading(false) }
  }, [tenantId, branchId])

  useEffect(() => {
    let active = true
    void loadRetailState(tenantId, branchId).then(result => { if (active) setState(result) })
      .catch(cause => { if (active) setError(cause instanceof Error ? cause.message : 'No se pudieron cargar los datos de Comercio.') })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [tenantId, branchId])

  const loadReportPage = async (reset: boolean) => {
    if (reportLoading) return
    setReportLoading(true); setError('')
    if (reset) { setReportSales([]); setReportCursor(null); setReportHasMore(false); setReportComplete(false); setReportPageCount(0); setReportLoadedPeriod('') }
    try {
      const range = reportPeriodUtcRange({ startDate: reportStartDate, endDate: reportEndDate, timeZone })
      const reportMode = canUseReportCapability(getActiveTenant()?.tenant, 'reports.detailed') ? 'detailed' : 'basic'
      const page = await loadRetailReportPage(tenantId, branchId, {
        startAt: range.startInclusive.toISOString(), endBefore: range.endExclusive.toISOString(),
      }, reportMode, reset ? null : reportCursor)
      setReportSales(current => reset ? page.rows : [...current, ...page.rows])
      setReportCursor(page.cursor); setReportHasMore(page.hasMore)
      setReportPageCount(current => reset ? 1 : current + 1)
      setReportComplete(reportPaginationIsComplete(reset ? page.rows.length : reportSales.length + page.rows.length, 10_000, page.hasMore))
      setReportLoadedPeriod(reportPeriod)
    } catch (cause) {
      setReportSales([]); setReportCursor(null); setReportComplete(false); setReportHasMore(false); setReportLoadedPeriod('')
      setError(cause instanceof Error ? cause.message : 'No se pudo cargar el historial completo de ventas.')
    } finally { setReportLoading(false) }
  }

  const reportSheets = useMemo<ReportSheet[]>(() => {
    const productTotals = new Map<string, { quantity: number; totalMinor: number }>()
    for (const sale of reportSales) for (const line of sale.lines) {
      const current = productTotals.get(line.name) || { quantity: 0, totalMinor: 0 }
      productTotals.set(line.name, { quantity: current.quantity + line.quantity, totalMinor: current.totalMinor + line.lineTotalMinor })
    }
    const sheets: ReportSheet[] = [
      { name: 'Resumen', headers: ['Concepto', 'Valor'], rows: [
        ['Ventas cobradas (Bs)', reportSales.reduce((total, sale) => total + sale.totalMinor, 0) / 100],
        ['Ventas en efectivo (Bs)', reportSales.reduce((total, sale) => total + sale.cashMinor, 0) / 100],
        ['Ventas QR (Bs)', reportSales.reduce((total, sale) => total + sale.qrMinor, 0) / 100],
        ['Tickets', reportSales.length],
      ] },
      { name: 'Ventas', headers: ['Fecha y hora', 'Venta', 'Método', 'Total (Bs)', 'Cambio (Bs)'], rows: reportSales.map(sale => [new Date(sale.createdAt).toLocaleString('es-BO', { timeZone }), sale.id, sale.method.toUpperCase(), sale.totalMinor / 100, sale.changeMinor / 100]) },
    ]
    if (canUseReportCapability(getActiveTenant()?.tenant, 'reports.detailed')) sheets.push({
      name: 'Productos vendidos', headers: ['Producto', 'Cantidad', 'Unidad', 'Importe (Bs)'],
      rows: [...productTotals].map(([name, totals]) => [name, totals.quantity, 'Según unidad del producto', totals.totalMinor / 100]),
    })
    return sheets
  }, [reportSales, timeZone])

  const buildRetailReport = () => makeBusinessReport({ tenantId, branchId, businessType: getActiveTenant()?.tenant.businessType || 'gelateria_weight_cafe', generatedAt: new Date().toISOString(), period: { startDate: reportStartDate, endDate: reportEndDate, timeZone }, identity: documentContext, completeness: 'complete', recordCount: reportSales.length, warnings: [], sheets: reportSheets })
  const exportReport = async (format: 'excel' | 'pdf') => {
    if (!reportComplete || reportLoadedPeriod !== reportPeriod || reportHasMore) { setError('Carga todas las páginas del periodo antes de exportar el reporte.'); return }
    setSaving(true); setError('')
    try {
      await authorizeReportAction(tenantId, branchId, 'reports.export')
      await exportBusinessReport(buildRetailReport(), format)
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'No se pudo exportar el reporte.') }
    finally { setSaving(false) }
  }
  const printReport = async () => {
    if (!reportComplete || reportLoadedPeriod !== reportPeriod || reportHasMore) { setError('Carga todas las páginas del periodo antes de imprimir.'); return }
    if (reportSheets.reduce((sum, sheet) => sum + sheet.rows.length, 0) > 500) { setError('El reporte supera 500 filas para impresión; descarga el PDF o Excel completo.'); return }
    setSaving(true); setError('')
    try { await authorizeReportAction(tenantId, branchId, 'printing.manual'); setNotice(await printBusinessReport(buildRetailReport())) }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'No se pudo imprimir el reporte.') }
    finally { setSaving(false) }
  }
  const canPrintReport = canUseDocumentCapability(getActiveTenant()?.tenant, 'printing.manual')

  useEffect(() => {
    if (!roleAllows(role, 'users')) return
    return subscribeRetailMembers(tenantId, next => { setMembers(next); setMembersError('') }, cause => setMembersError(cause.message))
  }, [tenantId, uid, role])

  const command = async (key: string, type: Parameters<typeof runRetailCommand>[2], payload: Record<string, unknown>) => {
    if (saving) return
    const operationId = operationIds[key] || crypto.randomUUID()
    setOperationIds(current => ({ ...current, [key]: operationId }))
    setSaving(true); setError(''); setNotice('')
    try {
      const result = await runRetailCommand(tenantId, branchId, type, operationId, payload)
      setOperationIds(current => { const next = { ...current }; delete next[key]; return next })
      setRetry(null)
      if (type === 'recordSale') setLastSale(result as { saleId: string; totalMinor: number; changeMinor: number })
      setNotice(type === 'recordSale' ? `Venta guardada. Total ${money(Number(result.totalMinor) || 0)}.` : 'Cambios guardados correctamente.')
      await refresh()
      return result
    } catch (cause) {
      setRetry({ key, command: type, payload, id: operationId })
      setError(cause instanceof Error ? cause.message : 'La operación no se confirmó. Puedes reintentar sin duplicarla.')
      return null
    } finally { setSaving(false) }
  }

  const retryLast = async () => {
    if (!retry || saving) return
    setSaving(true); setError('')
    try {
      const result = await runRetailCommand(tenantId, branchId, retry.command, retry.id, retry.payload)
      setOperationIds(current => { const next = { ...current }; delete next[retry.key]; return next })
      setRetry(null)
      if (retry.command === 'recordSale') {
        const sale = result as { saleId: string; totalMinor: number; changeMinor: number }
        setLastSale(sale)
        if (receiptDraft) setLastReceipt({ ...receiptDraft, ...sale, printedAt: new Date().toISOString() })
        setReceiptDraft(null)
      }
      setNotice('Operación confirmada; el mismo identificador evitó duplicados.')
      await refresh()
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'No se confirmó el reintento.') }
    finally { setSaving(false) }
  }

  const saleCart = useMemo(() => cart.map(line => {
    const product = state.products.find(item => item.id === line.productId)
    const totalMinor = product ? product.soldBy === 'weight' ? Math.round(product.priceMinor * line.quantity / 1000) : product.priceMinor * line.quantity : 0
    return { ...line, product, totalMinor }
  }).filter(line => line.product), [cart, state.products])
  const cartTotal = saleCart.reduce((sum, line) => sum + line.totalMinor, 0)
  const filteredProducts = state.products.filter(product => `${product.name} ${product.sku} ${product.category}`.toLowerCase().includes(search.toLowerCase()))

  const addToCart = (product: RetailTenantProduct, quantity: number) => {
    setCart(current => {
      const existing = current.find(item => item.productId === product.id)
      return existing
        ? current.map(item => item.productId === product.id ? { ...item, quantity: item.quantity + quantity } : item)
        : [...current, { productId: product.id, quantity }]
    })
  }

  const submitSale = async () => {
    if (!saleCart.length || !state.activeShift) return
    const cashMinor = method === 'cash' ? cartTotal : method === 'qr' ? 0 : toMinor(cashMinorInput)
    const qrMinor = method === 'qr' ? cartTotal : method === 'cash' ? 0 : (cashMinor === null ? null : cartTotal - cashMinor)
    const cashReceivedMinor = toMinor(cashReceivedInput || (cashMinor === null ? '' : (cashMinor / 100).toFixed(2)))
    if (cashMinor === null || qrMinor === null || cashReceivedMinor === null) { setError('Revisa los importes del pago.'); return }
    const currentReceiptDraft: RetailReceiptDraft = {
      method,
      items: saleCart.map(line => ({ name: line.product!.name, quantity: line.quantity, unit: line.product!.stockUnit, totalMinor: line.totalMinor })),
    }
    const result = await command('sale', 'recordSale', {
      items: saleCart.map(line => ({ productId: line.productId, quantity: line.quantity })),
      method, cashMinor, qrMinor, cashReceivedMinor,
    })
    if (result) {
      setLastReceipt({ ...currentReceiptDraft, saleId: String(result.saleId), totalMinor: Number(result.totalMinor), changeMinor: Number(result.changeMinor), printedAt: new Date().toISOString() })
      setReceiptOpen(true)
      setReceiptDraft(null)
      setCart([]); setCashMinorInput(''); setCashReceivedInput('')
    } else setReceiptDraft(currentReceiptDraft)
  }

  const submitProduct = async (event: React.FormEvent) => {
    event.preventDefault()
    const priceMinor = toMinor(productForm.price)
    if (priceMinor === null || priceMinor <= 0) { setError('Ingresa un precio válido mayor que cero.'); return }
    const result = await command('product', 'saveProduct', { ...productForm, priceMinor })
    if (result) setProductForm({ name: '', category: '', sku: '', soldBy: 'unit', price: '' })
  }

  const archiveRetailProduct = async (product: RetailTenantProduct) => {
    const reason = window.prompt(`Motivo para archivar ${product.name}:`)
    if (!reason?.trim()) return
    await command(`archive-product:${product.id}`, 'archiveProduct', { productId: product.id, reason })
  }

  const restoreRetailProduct = async (product: RetailTenantProduct) => {
    await command(`restore-product:${product.id}`, 'restoreProduct', { productId: product.id })
  }

  const submitStock = async (event: React.FormEvent) => {
    event.preventDefault()
    const quantity = Number(stockForm.quantity)
    if (!Number.isSafeInteger(quantity) || quantity <= 0) { setError('El ajuste debe ser un entero positivo de gramos o unidades.'); return }
    const result = await command('stock', 'adjustStock', { productId: stockForm.productId, delta: stockForm.direction === 'in' ? quantity : -quantity, reason: stockForm.reason })
    if (result) setStockForm(current => ({ ...current, quantity: '', reason: '' }))
  }

  const submitCashMovement = async (event: React.FormEvent) => {
    event.preventDefault()
    const amountMinor = toMinor(movement.amount)
    if (amountMinor === null || amountMinor <= 0) { setError('Importe de caja inválido.'); return }
    const result = await command('cash-movement', 'recordCashMovement', { type: movement.type, amountMinor, reason: movement.reason })
    if (result) setMovement(current => ({ ...current, amount: '', reason: '' }))
  }

  const submitMember = async (event: React.FormEvent) => {
    event.preventDefault()
    if (memberSaving || !roleAllows(role, 'users')) return
    setMemberSaving(true); setMembersError(''); setMemberNotice('')
    const operationId = memberOperationId || `retail-member-${crypto.randomUUID()}`
    setMemberOperationId(operationId)
    try {
      await createRetailMember(tenantId, branchId, operationId, { ...memberForm, email: memberForm.email.trim().toLowerCase() })
      setMemberForm({ displayName: '', email: '', roleId: 'cashier', password: '' })
      setMemberOperationId('')
      setMemberNotice('Usuario creado. Comparte su contraseña inicial de forma privada.')
    } catch (cause) { setMembersError(cause instanceof Error ? cause.message : 'No se pudo crear el usuario. Puedes reintentar la misma operación.') }
    finally { setMemberSaving(false) }
  }

  const saveMemberRole = async (member: RetailTenantMember) => {
    const roleId = memberRoleDrafts[member.id] || member.roleId as typeof memberForm.roleId
    setMemberSaving(true); setMembersError(''); setMemberNotice('')
    try {
      await updateRetailMember(tenantId, member.id, { displayName: member.displayName, roleId, active: member.status === 'active' })
      setMemberNotice('Rol actualizado.')
    } catch (cause) { setMembersError(cause instanceof Error ? cause.message : 'No se pudo actualizar el rol.') }
    finally { setMemberSaving(false) }
  }

  const toggleMember = async (member: RetailTenantMember) => {
    setMemberSaving(true); setMembersError(''); setMemberNotice('')
    try {
      await updateRetailMember(tenantId, member.id, { displayName: member.displayName, roleId: member.roleId as typeof memberForm.roleId, active: member.status !== 'active' })
      setMemberNotice(member.status === 'active' ? 'Acceso desactivado; se conserva su historial.' : 'Acceso activado.')
    } catch (cause) { setMembersError(cause instanceof Error ? cause.message : 'No se pudo actualizar el acceso.') }
    finally { setMemberSaving(false) }
  }

  const tabs: Array<{ id: Section; label: string; icon: typeof ShoppingCart }> = [
    { id: 'pos', label: 'Venta', icon: ShoppingCart }, { id: 'products', label: 'Productos', icon: PackagePlus },
    { id: 'inventory', label: 'Inventario', icon: Boxes }, { id: 'cash', label: 'Caja', icon: Wallet },
    { id: 'reports', label: 'Reportes', icon: ChartNoAxesCombined }, { id: 'users', label: 'Usuarios', icon: Users },
  ]
  const visibleTabs = tabs.filter(tab => roleAllows(role, tab.id))
  const activeSection = visibleTabs.some(tab => tab.id === section) ? section : visibleTabs[0]?.id || 'pos'

  return <main className="min-h-screen bg-slate-50 px-3 py-4 sm:px-6 sm:py-6">
    <div className="mx-auto max-w-7xl space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border bg-white p-4 shadow-xs sm:p-5">
        <div><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Comercio / Venta rápida</p><h1 className="mt-1 text-xl font-bold text-slate-900 sm:text-2xl">{companyName}</h1><p className="mt-1 text-sm text-slate-600">{userName} · {role} · Sucursal principal</p></div>
        <button type="button" onClick={() => void refresh()} disabled={loading || saving} className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 disabled:opacity-50"><RefreshCw size={16} className={loading ? 'animate-spin' : ''} />Actualizar</button>
      </header>
      {error && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-900">{error}{retry && <button type="button" onClick={() => void retryLast()} disabled={saving} className="ml-2 font-bold underline">Reintentar operación</button>}</div>}
      {notice && <div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">{notice}</div>}
      <nav aria-label="Secciones de Comercio" className="flex gap-2 overflow-x-auto rounded-xl border bg-white p-2">
        {visibleTabs.map(tab => { const Icon = tab.icon; return <button key={tab.id} type="button" onClick={() => setSection(tab.id)} aria-current={activeSection === tab.id ? 'page' : undefined} className={`inline-flex min-h-10 shrink-0 items-center gap-2 rounded-lg px-3 text-sm font-semibold ${activeSection === tab.id ? 'bg-slate-900 text-white' : 'text-slate-700 hover:bg-slate-100'}`}><Icon size={16} />{tab.label}</button> })}
      </nav>
      {loading ? <div className="flex min-h-48 items-center justify-center gap-2 text-sm text-slate-600"><LoaderCircle className="animate-spin" />Cargando información de la empresa…</div> : <>
        {activeSection === 'pos' && <section className="grid gap-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(300px,0.8fr)]">
          <div className="space-y-3 rounded-2xl border bg-white p-4 sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-bold">Punto de venta</h2><p className="text-sm text-slate-600">Busca por nombre o SKU. Los productos se descuentan desde el servidor.</p></div><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Buscar producto o SKU" className="min-h-10 w-full rounded-lg border px-3 sm:w-64" /></div>
            {!state.activeShift && <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">Abre una caja antes de registrar ventas.</p>}
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">{filteredProducts.map(product => <article key={product.id} className="rounded-xl border p-3"><div className="flex justify-between gap-2"><strong className="text-sm">{product.name}</strong><span className="text-xs text-slate-500">{product.sku || '—'}</span></div><p className="mt-1 text-xs text-slate-600">{product.category} · {product.soldBy === 'weight' ? 'por kg' : 'por unidad'}</p><p className="mt-2 font-bold">{money(product.priceMinor)}{product.soldBy === 'weight' ? ' / kg' : ''}</p><p className="text-xs text-slate-600">Stock: {product.stockBase} {product.stockUnit}</p>{product.soldBy === 'unit' ? <button type="button" disabled={!state.activeShift || saving} onClick={() => addToCart(product, 1)} className="mt-3 min-h-10 w-full rounded-lg bg-blue-700 px-3 text-sm font-bold text-white disabled:opacity-50">Agregar unidad</button> : <label className="mt-3 block text-xs text-slate-600">Peso a agregar (g)<input type="number" min="1" step="1" value={weightInputs[product.id] || ''} onChange={event => setWeightInputs(current => ({ ...current, [product.id]: event.target.value }))} aria-label={`Peso de ${product.name} en gramos`} className="mt-1 min-h-10 w-full rounded border px-2" /><button type="button" disabled={!state.activeShift || saving || !Number.isSafeInteger(Number(weightInputs[product.id])) || Number(weightInputs[product.id]) <= 0} onClick={() => { const grams = Number(weightInputs[product.id]); addToCart(product, grams); setWeightInputs(current => ({ ...current, [product.id]: '' })) }} className="mt-1 min-h-10 w-full rounded-lg border font-semibold disabled:opacity-50">Agregar peso</button></label>}</article>)}</div>
            {filteredProducts.length === 0 && <p className="rounded-xl border border-dashed p-8 text-center text-sm text-slate-600">No hay productos. Administración puede registrarlos en Productos.</p>}
          </div>
          <div className="space-y-3 rounded-2xl border bg-white p-4 sm:p-5"><h2 className="text-lg font-bold">Carrito</h2>{saleCart.length ? <ul className="divide-y">{saleCart.map(line => <li key={line.productId} className="flex items-center justify-between gap-2 py-2 text-sm"><div><strong>{line.product?.name}</strong><p className="text-xs text-slate-600">{line.quantity} {line.product?.stockUnit} × {money(line.product?.priceMinor || 0)}{line.product?.soldBy === 'weight' ? ' / kg' : ''}</p></div><div className="text-right"><strong>{money(line.totalMinor)}</strong><button type="button" onClick={() => setCart(items => items.filter(item => item.productId !== line.productId))} className="block text-xs text-red-700 underline">Quitar</button></div></li>)}</ul> : <p className="rounded-lg bg-slate-50 p-4 text-sm text-slate-600">Agrega productos para iniciar la venta.</p>}
            <div className="flex items-center justify-between border-t pt-3 text-lg font-bold"><span>Total</span><span>{money(cartTotal)}</span></div><label className="block text-sm">Método de pago<select value={method} onChange={event => setMethod(event.target.value as typeof method)} className="mt-1 min-h-10 w-full rounded-lg border bg-white px-3"><option value="cash">Efectivo</option><option value="qr">QR (registro manual)</option><option value="mixed">Mixto</option></select></label>
            {method === 'mixed' && <label className="block text-sm">Parte en efectivo<input inputMode="decimal" value={cashMinorInput} onChange={event => setCashMinorInput(event.target.value)} placeholder="Bs" className="mt-1 min-h-10 w-full rounded-lg border px-3" /></label>}
            {method !== 'qr' && <label className="block text-sm">Efectivo recibido<input inputMode="decimal" value={cashReceivedInput} onChange={event => setCashReceivedInput(event.target.value)} placeholder="Bs" className="mt-1 min-h-10 w-full rounded-lg border px-3" /></label>}
            <button type="button" disabled={!saleCart.length || !state.activeShift || saving} onClick={() => void submitSale()} className="min-h-11 w-full rounded-lg bg-slate-900 px-4 text-sm font-bold text-white disabled:opacity-50">{saving ? 'Procesando…' : 'Cobrar y guardar venta'}</button>
            {lastReceipt && <button type="button" onClick={() => setReceiptOpen(true)} className="min-h-10 w-full rounded-lg border px-4 text-sm font-semibold">Ver comprobante</button>}
            {lastSale && <p className="text-xs text-slate-500">Última venta: {lastSale.saleId} · cambio {money(lastSale.changeMinor)}</p>}
          </div>
        </section>}
        {activeSection === 'products' && <section className="grid gap-4 lg:grid-cols-[minmax(280px,0.8fr)_minmax(0,1.4fr)]">
          <form onSubmit={event => void submitProduct(event)} className="space-y-3 rounded-2xl border bg-white p-4 sm:p-5">
            <h2 className="text-lg font-bold">Registrar producto</h2>
            <label className="block text-sm">Nombre<input required maxLength={100} value={productForm.name} onChange={event => setProductForm({ ...productForm, name: event.target.value })} className="mt-1 min-h-10 w-full rounded border px-3" /></label>
            <label className="block text-sm">Categoría<input required maxLength={60} value={productForm.category} onChange={event => setProductForm({ ...productForm, category: event.target.value })} className="mt-1 min-h-10 w-full rounded border px-3" /></label>
            <label className="block text-sm">SKU<input maxLength={48} value={productForm.sku} onChange={event => setProductForm({ ...productForm, sku: event.target.value })} className="mt-1 min-h-10 w-full rounded border px-3" /></label>
            <label className="block text-sm">Modalidad<select value={productForm.soldBy} onChange={event => setProductForm({ ...productForm, soldBy: event.target.value as 'unit' | 'weight' })} className="mt-1 min-h-10 w-full rounded border bg-white px-3"><option value="unit">Por unidad</option><option value="weight">Por peso (precio por kg)</option></select></label>
            <label className="block text-sm">Precio en Bs{productForm.soldBy === 'weight' && <span className="text-slate-500"> por kg</span>}<input required inputMode="decimal" value={productForm.price} onChange={event => setProductForm({ ...productForm, price: event.target.value })} className="mt-1 min-h-10 w-full rounded border px-3" /></label>
            <button disabled={saving} className="min-h-11 w-full rounded-lg bg-slate-900 text-sm font-bold text-white disabled:opacity-50">Guardar producto</button>
          </form>
          <div className="overflow-x-auto rounded-2xl border bg-white p-4 sm:p-5">
            <h2 className="mb-3 text-lg font-bold">Productos activos ({state.products.length})</h2>
            <table className="w-full min-w-[700px] text-left text-sm"><thead><tr className="border-b text-xs text-slate-500"><th className="p-2">Producto</th><th className="p-2">SKU</th><th className="p-2">Venta</th><th className="p-2">Precio</th><th className="p-2">Existencia</th><th className="p-2">Acción</th></tr></thead>
              <tbody>{state.products.map(product => <tr key={product.id} className="border-b"><td className="p-2 font-semibold">{product.name}</td><td className="p-2">{product.sku || '—'}</td><td className="p-2">{product.soldBy === 'weight' ? 'Peso' : 'Unidad'}</td><td className="p-2">{money(product.priceMinor)}{product.soldBy === 'weight' ? ' / kg' : ''}</td><td className="p-2">{product.stockBase} {product.stockUnit}</td><td className="p-2"><button type="button" disabled={saving} onClick={() => void archiveRetailProduct(product)} className="min-h-9 rounded border border-amber-300 px-3 text-xs font-semibold text-amber-900 disabled:opacity-50">Archivar</button></td></tr>)}</tbody>
            </table>
            {state.products.length === 0 && <p className="rounded-xl border border-dashed p-6 text-center text-sm text-slate-600">No hay productos activos en esta sucursal.</p>}
            {state.archivedProducts.length > 0 && <section className="mt-5 border-t pt-4">
              <h3 className="font-bold">Productos archivados ({state.archivedProducts.length}{state.archivedProductsComplete ? '' : '+'})</h3>
              {!state.archivedProductsComplete && <p className="mt-1 text-xs text-slate-600">Se muestran hasta 200 productos; hay más archivados en esta sucursal.</p>}
              <ul className="mt-2 divide-y">{state.archivedProducts.map(product => <li key={product.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span className="text-sm"><strong>{product.name}</strong><small className="ml-2 text-slate-500">{product.sku || product.category}</small></span>
                <button type="button" disabled={saving} onClick={() => void restoreRetailProduct(product)} className="min-h-9 rounded border border-emerald-300 px-3 text-xs font-semibold text-emerald-800 disabled:opacity-50">Reactivar</button>
              </li>)}</ul>
            </section>}
          </div>
        </section>}
        {activeSection === 'inventory' && <section className="grid gap-4 lg:grid-cols-[minmax(280px,0.8fr)_minmax(0,1.4fr)]"><form onSubmit={event => void submitStock(event)} className="space-y-3 rounded-2xl border bg-white p-4 sm:p-5"><h2 className="text-lg font-bold">Ajuste de existencias</h2><label className="block text-sm">Producto<select required value={stockForm.productId} onChange={event => setStockForm({ ...stockForm, productId: event.target.value })} className="mt-1 min-h-10 w-full rounded border bg-white px-3"><option value="">Seleccionar</option>{state.products.map(product => <option key={product.id} value={product.id}>{product.name} · {product.stockUnit}</option>)}</select></label><label className="block text-sm">Movimiento<select value={stockForm.direction} onChange={event => setStockForm({ ...stockForm, direction: event.target.value as 'in' | 'out' })} className="mt-1 min-h-10 w-full rounded border bg-white px-3"><option value="in">Entrada</option><option value="out">Salida</option></select></label><label className="block text-sm">Cantidad entera<input required type="number" min="1" step="1" value={stockForm.quantity} onChange={event => setStockForm({ ...stockForm, quantity: event.target.value })} className="mt-1 min-h-10 w-full rounded border px-3" /></label><label className="block text-sm">Motivo<input required maxLength={160} value={stockForm.reason} onChange={event => setStockForm({ ...stockForm, reason: event.target.value })} className="mt-1 min-h-10 w-full rounded border px-3" /></label><button disabled={saving} className="min-h-11 w-full rounded-lg bg-slate-900 text-sm font-bold text-white disabled:opacity-50">Registrar movimiento auditado</button></form><div className="rounded-2xl border bg-white p-4 sm:p-5"><h2 className="text-lg font-bold">Existencias actuales</h2><ul className="mt-3 divide-y">{state.products.map(product => <li key={product.id} className="flex justify-between gap-3 py-3"><span>{product.name}<small className="block text-slate-500">{product.sku || product.category}</small></span><strong>{product.stockBase} {product.stockUnit}</strong></li>)}</ul></div></section>}
        {activeSection === 'cash' && <section className="grid gap-4 lg:grid-cols-2"><div className="space-y-4 rounded-2xl border bg-white p-4 sm:p-5"><h2 className="text-lg font-bold">Caja del turno</h2>{state.activeShift ? <><dl className="grid gap-2 text-sm sm:grid-cols-2"><dt>Fondo inicial</dt><dd className="font-semibold">{money(state.activeShift.openingFloatMinor)}</dd><dt>Ventas en efectivo</dt><dd className="font-semibold">{money(state.activeShift.cashSalesMinor)}</dd><dt>Entradas manuales</dt><dd className="font-semibold">{money(state.activeShift.cashInMinor)}</dd><dt>Salidas manuales</dt><dd className="font-semibold">{money(state.activeShift.cashOutMinor)}</dd><dt>Ventas</dt><dd className="font-semibold">{state.activeShift.salesCount}</dd></dl><form onSubmit={event => void submitCashMovement(event)} className="space-y-2 border-t pt-3"><h3 className="font-bold">Movimiento de caja</h3><label className="block text-sm">Tipo<select value={movement.type} onChange={event => setMovement({ ...movement, type: event.target.value as 'income' | 'expense' })} className="mt-1 min-h-10 w-full rounded border bg-white px-3"><option value="income">Entrada</option><option value="expense">Salida</option></select></label><label className="block text-sm">Importe en Bs<input required inputMode="decimal" value={movement.amount} onChange={event => setMovement({ ...movement, amount: event.target.value })} className="mt-1 min-h-10 w-full rounded border px-3" /></label><label className="block text-sm">Motivo<input required maxLength={160} value={movement.reason} onChange={event => setMovement({ ...movement, reason: event.target.value })} className="mt-1 min-h-10 w-full rounded border px-3" /></label><button disabled={saving} className="min-h-10 rounded-lg border px-4 text-sm font-semibold disabled:opacity-50">Guardar movimiento</button></form><form onSubmit={event => { event.preventDefault(); const countedCashMinor = toMinor(countedCash); if (countedCashMinor === null) { setError('Importe contado inválido.'); return } void command('close', 'closeShift', { countedCashMinor }).then(result => { if (result) setCountedCash('') }) }} className="space-y-2 border-t pt-3"><h3 className="font-bold">Cerrar turno</h3><label className="block text-sm">Efectivo contado en Bs<input required inputMode="decimal" value={countedCash} onChange={event => setCountedCash(event.target.value)} className="mt-1 min-h-10 w-full rounded border px-3" /></label><button disabled={saving} className="min-h-10 rounded-lg bg-slate-900 px-4 text-sm font-bold text-white disabled:opacity-50">Guardar cierre</button></form></> : <form onSubmit={event => { event.preventDefault(); const openingFloatMinor = toMinor(openingFloat); if (openingFloatMinor === null) { setError('Fondo inicial inválido.'); return } void command('open', 'openShift', { openingFloatMinor }).then(result => { if (result) setOpeningFloat('') }) }} className="space-y-3"><p className="text-sm text-slate-600">No hay turno abierto. La apertura registra el fondo real indicado por el responsable.</p><label className="block text-sm">Fondo inicial en Bs<input required inputMode="decimal" value={openingFloat} onChange={event => setOpeningFloat(event.target.value)} className="mt-1 min-h-10 w-full rounded border px-3" /></label><button disabled={saving} className="min-h-11 w-full rounded-lg bg-slate-900 text-sm font-bold text-white disabled:opacity-50">Abrir turno</button></form>}</div><div className="rounded-2xl border bg-white p-4 sm:p-5"><h2 className="text-lg font-bold">Conciliación</h2>{state.activeShift && <p className="mt-2 text-sm text-slate-600">El efectivo esperado se calcula en el servidor desde el fondo, las ventas en efectivo y los movimientos confirmados. Egresos mayores al efectivo disponible se rechazan.</p>}<p className="mt-3 text-xs text-slate-500">Los pagos QR se registran como método no efectivo; no se conecta un QR bancario.</p></div></section>}
        {activeSection === 'reports' && <section className="space-y-4 rounded-2xl border bg-white p-4 sm:p-5">
          <header><h2 className="text-lg font-bold">Ventas, productos y caja</h2><p className="text-sm text-slate-600">Consulta inclusiva por fechas en la zona horaria de la empresa. Los resultados se validan en el servidor por rol, sucursal y capacidades.</p></header>
          <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
            <label className="block text-sm">Desde<input type="date" value={reportStartDate} onChange={event => setReportStartDate(event.target.value)} className="mt-1 min-h-10 w-full rounded border px-3" /></label>
            <label className="block text-sm">Hasta<input type="date" value={reportEndDate} onChange={event => setReportEndDate(event.target.value)} className="mt-1 min-h-10 w-full rounded border px-3" /></label>
            <button type="button" onClick={() => void loadReportPage(true)} disabled={reportLoading || saving} className="min-h-10 rounded-lg bg-slate-900 px-4 text-sm font-semibold text-white disabled:opacity-50">{reportLoading ? 'Cargando…' : 'Consultar periodo'}</button>
          </div>
          {reportLoadedPeriod === reportPeriod && <>
            <div className={`rounded-lg border p-3 text-sm ${reportComplete ? 'border-emerald-200 bg-emerald-50 text-emerald-900' : 'border-amber-200 bg-amber-50 text-amber-950'}`} role="status">
              {reportComplete ? `Historial completo: ${reportSales.length} venta(s).` : reportHasMore ? `Historial parcial: ${reportSales.length} venta(s) cargadas; aún hay páginas pendientes. Los totales no son definitivos.` : `La consulta no está completa; no se habilitan totales ni exportaciones.`}
            </div>
            {reportComplete && <div className="grid gap-2 sm:grid-cols-3">
              <div className="rounded-xl bg-slate-50 p-3"><span className="text-xs text-slate-600">Ventas cobradas</span><strong className="block text-lg">{money(reportSales.reduce((total, sale) => total + sale.totalMinor, 0))}</strong></div>
              <div className="rounded-xl bg-slate-50 p-3"><span className="text-xs text-slate-600">Efectivo</span><strong className="block text-lg">{money(reportSales.reduce((total, sale) => total + sale.cashMinor, 0))}</strong></div>
              <div className="rounded-xl bg-slate-50 p-3"><span className="text-xs text-slate-600">QR</span><strong className="block text-lg">{money(reportSales.reduce((total, sale) => total + sale.qrMinor, 0))}</strong></div>
            </div>}
            {reportSales.length > 0 && <div className="overflow-x-auto"><table className="w-full min-w-[600px] text-left text-sm"><thead><tr className="border-b text-xs text-slate-500"><th className="p-2">Fecha</th><th className="p-2">Venta</th><th className="p-2">Método</th><th className="p-2">Total</th><th className="p-2">Cambio</th></tr></thead><tbody>{reportSales.map(sale => <tr key={sale.id} className="border-b"><td className="p-2">{new Date(sale.createdAt).toLocaleString('es-BO', { timeZone })}</td><td className="p-2">{sale.id}</td><td className="p-2">{sale.method.toUpperCase()}</td><td className="p-2 font-semibold">{money(sale.totalMinor)}</td><td className="p-2">{money(sale.changeMinor)}</td></tr>)}</tbody></table></div>}
            {reportHasMore && reportPageCount < 100 && <button type="button" onClick={() => void loadReportPage(false)} disabled={reportLoading || saving} className="min-h-10 rounded-lg border px-4 text-sm font-semibold disabled:opacity-50">{reportLoading ? 'Cargando…' : 'Cargar siguiente página'}</button>}
            {reportHasMore && reportPageCount >= 100 && <p className="text-sm text-amber-900">El periodo supera el límite seguro de 10.000 ventas. Reduce las fechas para obtener un reporte completo.</p>}
            {canUseReportCapability(getActiveTenant()?.tenant, 'reports.detailed') && reportComplete && <section className="rounded-xl border p-3"><h3 className="font-bold">Productos más vendidos</h3><ul className="mt-2 divide-y">{reportSheets.find(sheet => sheet.name === 'Productos vendidos')?.rows.map((row, index) => <li key={index} className="flex justify-between gap-3 py-2 text-sm"><span>{row[0]} · {row[1]} {row[2]}</span><strong>{money(Number(row[3]) * 100)}</strong></li>)}</ul>{reportSheets.find(sheet => sheet.name === 'Productos vendidos')?.rows.length === 0 && <p className="mt-2 text-sm text-slate-600">Sin productos vendidos en el periodo.</p>}</section>}
            {reportComplete && <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => void exportReport('pdf')} disabled={saving || !canUseReportCapability(getActiveTenant()?.tenant, 'reports.export')} className="min-h-10 rounded-lg bg-slate-900 px-4 text-sm font-semibold text-white disabled:opacity-50">Descargar PDF</button>
              <button type="button" onClick={() => void exportReport('excel')} disabled={saving || !canUseReportCapability(getActiveTenant()?.tenant, 'reports.export')} className="min-h-10 rounded-lg border px-4 text-sm font-semibold disabled:opacity-50">Descargar Excel</button>
              <button type="button" onClick={() => void printReport()} disabled={saving || !canPrintReport || reportSheets.reduce((sum, sheet) => sum + sheet.rows.length, 0) > 500} className="min-h-10 rounded-lg border px-4 text-sm font-semibold disabled:opacity-50">Imprimir resumen</button>
              {!canUseReportCapability(getActiveTenant()?.tenant, 'reports.export') && <p className="self-center text-xs text-slate-600">La exportación no está incluida en las capacidades actuales.</p>}
              {!canPrintReport && <p className="self-center text-xs text-slate-600">La impresión manual no está incluida en las capacidades actuales.</p>}
            </div>}
          </>}
        </section>}
        {activeSection === 'users' && <section className="grid gap-4 lg:grid-cols-[minmax(280px,0.8fr)_minmax(0,1.4fr)]">
          <form onSubmit={event => void submitMember(event)} className="space-y-3 rounded-2xl border bg-white p-4 sm:p-5">
            <h2 className="text-lg font-bold">Agregar usuario</h2>
            <p className="text-xs text-slate-600">El servidor valida el rol y la sucursal. Comparte la contraseña inicial en privado.</p>
            <label className="block text-sm">Nombre<input required maxLength={80} value={memberForm.displayName} onChange={event => setMemberForm({ ...memberForm, displayName: event.target.value })} className="mt-1 min-h-10 w-full rounded border px-3" /></label>
            <label className="block text-sm">Correo<input required type="email" value={memberForm.email} onChange={event => setMemberForm({ ...memberForm, email: event.target.value })} className="mt-1 min-h-10 w-full rounded border px-3" /></label>
            <label className="block text-sm">Rol<select value={memberForm.roleId} onChange={event => setMemberForm({ ...memberForm, roleId: event.target.value as typeof memberForm.roleId })} className="mt-1 min-h-10 w-full rounded border bg-white px-3"><option value="cashier">Caja</option><option value="sales">Ventas</option><option value="inventory">Inventario</option>{role === 'owner' && <option value="admin">Administrador</option>}</select></label>
            <label className="block text-sm">Contraseña inicial<input required minLength={8} maxLength={72} type="password" value={memberForm.password} onChange={event => setMemberForm({ ...memberForm, password: event.target.value })} className="mt-1 min-h-10 w-full rounded border px-3" /></label>
            <button disabled={memberSaving} className="min-h-11 w-full rounded-lg bg-slate-900 text-sm font-bold text-white disabled:opacity-50">{memberSaving ? 'Guardando…' : 'Crear usuario'}</button>
          </form>
          <div className="space-y-3 rounded-2xl border bg-white p-4 sm:p-5">
            <h2 className="text-lg font-bold">Equipo y permisos</h2>
            {membersError && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{membersError}</p>}
            {memberNotice && <p role="status" className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">{memberNotice}</p>}
            {members.length ? <ul className="divide-y">{members.map(member => <li key={member.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <div className="min-w-0"><strong className="block truncate text-sm">{member.displayName || member.email}</strong><span className="block truncate text-xs text-slate-600">{member.email} · {member.roleId} · {member.status === 'active' ? 'Activo' : 'Desactivado'}</span></div>
              {member.id !== uid && <div className="flex flex-wrap items-center gap-2">
                <select aria-label={`Rol de ${member.displayName || member.email}`} disabled={memberSaving} value={memberRoleDrafts[member.id] || member.roleId} onChange={event => setMemberRoleDrafts(current => ({ ...current, [member.id]: event.target.value as typeof memberForm.roleId }))} className="min-h-9 rounded border bg-white px-2 text-xs"><option value="cashier">Caja</option><option value="sales">Ventas</option><option value="inventory">Inventario</option>{role === 'owner' && <option value="admin">Administrador</option>}</select>
                <button type="button" disabled={memberSaving} onClick={() => void saveMemberRole(member)} className="min-h-9 rounded border px-3 text-xs font-semibold disabled:opacity-50">Guardar rol</button>
                <button type="button" disabled={memberSaving} onClick={() => void toggleMember(member)} className="min-h-9 rounded border border-red-300 px-3 text-xs font-semibold text-red-700 disabled:opacity-50">{member.status === 'active' ? 'Desactivar' : 'Activar'}</button>
              </div>}
            </li>)}</ul> : <p className="rounded-lg bg-slate-50 p-4 text-sm text-slate-600">Todavía no hay usuarios adicionales.</p>}
          </div>
        </section>}
      </>}
    </div>
    {receiptData && <CanonicalReceiptModal
      isOpen={receiptOpen}
      onClose={() => setReceiptOpen(false)}
      documentContext={documentContext}
      receiptData={receiptData}
      onPrint={(options) => printBusinessReceipt({ tenantId, branchId, sourceId: String(lastReceipt?.saleId), receipt: receiptData, identity: documentContext, isCopy: options?.isCopy })}
    />}
  </main>
}
