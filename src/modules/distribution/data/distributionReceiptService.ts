import { PrintEngineService, classifyPrintJobOutcome } from '../../../services/printing/printEngineService.ts'
import { AndroidBluetoothPermissionsService } from '../../../services/printing/androidBluetoothPermissionsService.ts'
import { getActiveReceiptPrinter } from '../../../services/printing/printerProfiles.ts'
import { round2 } from '../domain/engine.ts'
import type { PrintJobPayload } from '../../../types/printing.ts'
import type { DistSale, DistCollection } from '../types.ts'
import {
  type BusinessIdentity,
  type BusinessDocumentContext,
  buildBusinessDocumentContext,
  normalizeBusinessIdentity,
} from '../../../core/businessIdentity.ts'
import {
  type CanonicalReceiptData,
  type CanonicalReceiptItem,
  shareReceipt,
  generateReceiptPdf,
} from '../../../core/receiptService.ts'
import type { DistributionOperationalSettings } from './supportMaintenance.ts'

/**
 * Contexto documental legacy para compatibilidad con llamadas existentes.
 */
export interface ReceiptContext {
  companyName: string
  routeName: string
  distributorName: string
  /** Saldo generado si la venta fue a credito */
  creditBalance?: number
  receiptHeader?: string
  receiptFooter?: string
  taxId?: string
  address?: string
  phone?: string
}

export interface PrintAttemptResult {
  uncertain?: boolean
  ok: boolean
  message: string
}

/**
 * Resuelve la identidad comercial canónica para Distribución:
 * Si el tenant cuenta con BusinessIdentity válido y personalizado, se utiliza directamente.
 * Si no, aplica fallback de lectura a los campos comerciales legacy de supportConfig.
 */
export function resolveDistributionBusinessIdentity(
  tenantIdentity?: Partial<BusinessIdentity> | null,
  supportConfig?: Partial<DistributionOperationalSettings> | null,
  fallbackName?: string
): BusinessIdentity {
  if (tenantIdentity && typeof tenantIdentity === 'object') {
    const norm = normalizeBusinessIdentity(tenantIdentity)
    if (norm.tradeName && norm.tradeName !== 'Mi Empresa') {
      return norm
    }
  }

  // Fallback seguro a campos antiguos de supportConfig si existen
  if (
    supportConfig &&
    (supportConfig.companyName ||
      supportConfig.taxId ||
      supportConfig.address ||
      supportConfig.phone ||
      supportConfig.receiptHeader ||
      supportConfig.receiptFooter)
  ) {
    return normalizeBusinessIdentity({
      tradeName: supportConfig.companyName || fallbackName || 'PACHAX',
      taxId: supportConfig.taxId || '',
      address: supportConfig.address || '',
      phone: supportConfig.phone || '',
      receiptHeader: supportConfig.receiptHeader || '',
      receiptFooter: supportConfig.receiptFooter || 'Gracias por su preferencia',
      showLogo: true,
      showAddress: Boolean(supportConfig.address),
      showPhone: Boolean(supportConfig.phone),
      showTaxId: Boolean(supportConfig.taxId),
      showManagedBy: true,
    })
  }

  return normalizeBusinessIdentity({
    tradeName: fallbackName || 'Mi Empresa',
  })
}

/**
 * Adaptador canónico: DistSale -> CanonicalReceiptData.
 * Respeta rigurosamente:
 * - Venta normal con split (Total completo, desglose de Efectivo, QR, Crédito y Saldo generado).
 * - Venta de cortesía (saleKind === 'courtesy'): TOTAL financiero 0.00, aviso CORTESÍA / MUESTRA SIN COBRO,
 *   y valor referencial etiquetado estrictamente como informativo.
 */
export function distSaleToReceiptData(
  sale: DistSale,
  options?: {
    routeName?: string
    distributorName?: string
    creditBalance?: number
    customerPhone?: string
    isCopy?: boolean
  }
): CanonicalReceiptData {
  const isCourtesy = sale.saleKind === 'courtesy'

  const items: CanonicalReceiptItem[] = sale.lines.map((l) => {
    const unit = l.unitType === 'kg' ? 'kg' : l.unitType === 'package' ? 'paq' : 'u'
    const refVal = l.actualUnitPrice * l.quantity
    return {
      name: l.productNameSnapshot,
      quantity: l.quantity,
      unitLabel: unit,
      unitPrice: isCourtesy ? 0 : round2(l.actualUnitPrice),
      lineTotal: isCourtesy ? 0 : round2(l.subtotal),
      modifiers: isCourtesy
        ? [`Valor referencial: Bs ${round2(refVal).toFixed(2)} (Informativo)`]
        : undefined,
    }
  })

  const routeParts: string[] = []
  if (options?.routeName) routeParts.push(`Ruta: ${options.routeName}`)
  if (options?.distributorName) routeParts.push(`Distribuidor: ${options.distributorName}`)
  const tableOrPoint = routeParts.length > 0 ? routeParts.join(' · ') : undefined

  const paymentMethod = isCourtesy
    ? 'CORTESÍA / MUESTRA (SIN COBRO)'
    : sale.paymentKind === 'cash'
    ? 'EFECTIVO'
    : sale.paymentKind === 'qr'
    ? 'QR'
    : sale.paymentKind === 'credit'
    ? 'CRÉDITO'
    : 'MIXTO (EFECTIVO + QR)'

  const paymentDetails: string[] = []
  if (isCourtesy) {
    paymentDetails.push('CORTESÍA / MUESTRA COMERCIAL')
    paymentDetails.push('DOCUMENTO SIN VALOR DE COBRO')
    if (sale.courtesyReason) {
      paymentDetails.push(`Motivo: ${sale.courtesyReason}`)
    }
    const refTotal =
      sale.courtesyReferenceValue !== undefined
        ? sale.courtesyReferenceValue
        : sale.lines.reduce((s, l) => s + (l.referenceSubtotal || l.actualUnitPrice * l.quantity), 0)
    if (refTotal > 0) {
      paymentDetails.push(`Valor referencial: Bs ${round2(refTotal).toFixed(2)} (Informativo)`)
    }
  } else {
    if (sale.cashAmount > 0) paymentDetails.push(`Efectivo: Bs ${round2(sale.cashAmount).toFixed(2)}`)
    if (sale.qrAmount > 0) paymentDetails.push(`QR: Bs ${round2(sale.qrAmount).toFixed(2)}`)
    if (sale.creditAmount > 0) {
      paymentDetails.push(`Crédito nuevo: Bs ${round2(sale.creditAmount).toFixed(2)}`)
      const balance = options?.creditBalance ?? sale.creditAmount
      paymentDetails.push(`Saldo deudor actual: Bs ${round2(balance).toFixed(2)}`)
    }
  }

  const notes = sale.pendingConfirmation
    ? 'VENTA PENDIENTE DE CONFIRMACIÓN'
    : undefined

  return {
    receiptNumber: sale.id ? sale.id.slice(-6).toUpperCase() : '000',
    dateIso: sale.createdAt || new Date().toISOString(),
    fulfillmentType: 'distribution_sale',
    tableOrPoint,
    customer: {
      name: sale.customerName || 'Cliente ocasional',
      phone: options?.customerPhone,
      taxId: sale.customerCode ? `CI: ${sale.customerCode}` : undefined,
    },
    items,
    subtotal: isCourtesy ? 0 : round2(sale.total),
    total: isCourtesy ? 0 : round2(sale.total),
    paymentMethod,
    cashReceived: isCourtesy ? undefined : sale.cashAmount > 0 ? sale.cashAmount : undefined,
    paymentDetails,
    notes,
    isCopy: Boolean(options?.isCopy),
  }
}

/**
 * Adaptador canónico: DistCollection -> CanonicalReceiptData.
 * Genera comprobante de cobro oficial mostrando desglose FIFO de aplicaciones,
 * saldo de cartera antes y después, o formato seguro para cobros legacy.
 */
export function distCollectionToReceiptData(
  collection: DistCollection,
  options?: {
    routeName?: string
    collectorName?: string
    customerName?: string
    customerPhone?: string
    isCopy?: boolean
  }
): CanonicalReceiptData {
  const methodLabel =
    collection.method === 'cash'
      ? 'EFECTIVO'
      : collection.method === 'qr'
      ? 'QR'
      : collection.method === 'mixed'
      ? 'MIXTO (EFECTIVO + QR)'
      : 'COBRO'

  const paymentDetails: string[] = []
  if (collection.cashAmount !== undefined && collection.cashAmount > 0) {
    paymentDetails.push(`Efectivo: Bs ${round2(collection.cashAmount).toFixed(2)}`)
  }
  if (collection.qrAmount !== undefined && collection.qrAmount > 0) {
    paymentDetails.push(`QR: Bs ${round2(collection.qrAmount).toFixed(2)}`)
  }

  const items: CanonicalReceiptItem[] = []
  if (collection.allocations && collection.allocations.length > 0) {
    collection.allocations.forEach((alloc) => {
      const debtNumber = alloc.receivableId ? alloc.receivableId.replace(/^rec-/, '').toUpperCase() : 'DEUDA'
      const mod =
        alloc.balanceBefore !== undefined && alloc.balanceAfter !== undefined
          ? [`Saldo: Bs ${round2(alloc.balanceBefore).toFixed(2)} ➔ Bs ${round2(alloc.balanceAfter).toFixed(2)}`]
          : undefined
      items.push({
        name: `Abono Crédito #${debtNumber}`,
        quantity: 1,
        unitPrice: round2(alloc.appliedAmount),
        lineTotal: round2(alloc.appliedAmount),
        modifiers: mod,
      })
    })
  } else if (collection.receivableId) {
    const debtNumber = collection.receivableId.replace(/^rec-/, '').toUpperCase()
    items.push({
      name: `Abono a Crédito #${debtNumber}`,
      quantity: 1,
      unitPrice: round2(collection.amount),
      lineTotal: round2(collection.amount),
    })
  } else {
    items.push({
      name: 'Cobro de Cartera de Cliente',
      quantity: 1,
      unitPrice: round2(collection.amount),
      lineTotal: round2(collection.amount),
    })
  }

  if (
    collection.portfolioBalanceBefore !== undefined &&
    collection.portfolioBalanceAfter !== undefined
  ) {
    paymentDetails.push(`Saldo anterior cartera: Bs ${round2(collection.portfolioBalanceBefore).toFixed(2)}`)
    paymentDetails.push(`Saldo restante cartera: Bs ${round2(collection.portfolioBalanceAfter).toFixed(2)}`)
  }

  const pointParts: string[] = []
  if (options?.routeName) pointParts.push(`Ruta: ${options.routeName}`)
  if (options?.collectorName) pointParts.push(`Cobrador: ${options.collectorName}`)
  const tableOrPoint = pointParts.length > 0 ? pointParts.join(' · ') : undefined

  return {
    receiptNumber: collection.id ? collection.id.slice(-6).toUpperCase() : '000',
    dateIso: collection.createdAt || new Date().toISOString(),
    fulfillmentType: 'distribution_collection',
    tableOrPoint,
    customer: {
      name: options?.customerName || collection.customerName || collection.customerId || 'Cliente',
      phone: options?.customerPhone,
    },
    items,
    subtotal: round2(collection.amount),
    total: round2(collection.amount),
    paymentMethod: methodLabel,
    cashReceived:
      collection.cashAmount !== undefined
        ? collection.cashAmount
        : collection.method === 'cash'
        ? collection.amount
        : undefined,
    paymentDetails,
    notes: collection.pendingConfirmation
      ? 'COMPROBANTE DE COBRO (PENDIENTE DE CONFIRMACIÓN)'
      : 'COMPROBANTE DE COBRO DE CARTERA',
    isCopy: Boolean(options?.isCopy),
  }
}

/**
 * Convierte CanonicalReceiptData y BusinessDocumentContext a PrintJobPayload para ESC/POS.
 */
export function canonicalReceiptToPrintJobPayload(
  receipt: CanonicalReceiptData,
  docContext: BusinessDocumentContext,
  options?: { isCopy?: boolean; routeName?: string; distributorName?: string }
): PrintJobPayload {
  return {
    payloadSchemaVersion: 1,
    templateVersion: 'v1.0-receipt',
    restaurantName: docContext.companyName.toUpperCase(),
    branchName: receipt.tableOrPoint || docContext.branchName || 'Principal',
    branchAddress: options?.distributorName ? `DISTRIBUIDOR: ${options.distributorName}` : undefined,
    headerDetails: docContext.formattedHeaderLines,
    logoUrl: docContext.showLogo ? docContext.logoUrl : undefined,
    orderId: receipt.receiptNumber,
    displayNumber: receipt.receiptNumber,
    customerName: receipt.customer?.name || 'Cliente ocasional',
    customerPhone: receipt.customer?.taxId || receipt.customer?.phone,
    items: receipt.items.map((it) => ({
      name: it.name,
      basePrice: it.unitPrice,
      quantity: it.quantity,
      unitLabel: it.unitLabel,
      lineTotal: it.lineTotal,
    })),
    subtotal: receipt.subtotal,
    discountTotal: 0,
    taxTotal: 0,
    deliveryFee: 0,
    grandTotal: receipt.total,
    paymentMethod: receipt.paymentMethod,
    paymentDetails: receipt.paymentDetails,
    cashReceived: receipt.cashReceived,
    changeAmount: receipt.changeAmount,
    isCopy: Boolean(options?.isCopy ?? receipt.isCopy),
    footerMessage: docContext.receiptFooter,
    showManagedBy: docContext.showManagedBy,
    copies: 1,
    createdIso: receipt.dateIso,
  }
}

/**
 * Arma el PrintJobPayload para ESC/POS a partir de una venta.
 * Soporta tanto la llamada canónica como la llamada con ReceiptContext legacy.
 */
export function buildSaleReceiptPayload(
  sale: DistSale,
  contextOrDoc: ReceiptContext | BusinessDocumentContext,
  options?: { isCopy?: boolean; routeName?: string; distributorName?: string; creditBalance?: number }
): PrintJobPayload {
  const isDocContext = 'formattedHeaderLines' in contextOrDoc
  const docContext: BusinessDocumentContext = isDocContext
    ? (contextOrDoc as BusinessDocumentContext)
    : buildBusinessDocumentContext(
        {
          tradeName: (contextOrDoc as ReceiptContext).companyName,
          receiptHeader: (contextOrDoc as ReceiptContext).receiptHeader,
          receiptFooter: (contextOrDoc as ReceiptContext).receiptFooter,
          address: (contextOrDoc as ReceiptContext).address,
          phone: (contextOrDoc as ReceiptContext).phone,
          taxId: (contextOrDoc as ReceiptContext).taxId,
        },
        { branchName: `RUTA: ${(contextOrDoc as ReceiptContext).routeName}` }
      )

  const routeName = options?.routeName || (!isDocContext ? (contextOrDoc as ReceiptContext).routeName : undefined)
  const distributorName =
    options?.distributorName || (!isDocContext ? (contextOrDoc as ReceiptContext).distributorName : undefined)
  const creditBalance =
    options?.creditBalance ?? (!isDocContext ? (contextOrDoc as ReceiptContext).creditBalance : undefined)

  const receiptData = distSaleToReceiptData(sale, {
    routeName,
    distributorName,
    creditBalance,
    isCopy: options?.isCopy,
  })

  return canonicalReceiptToPrintJobPayload(receiptData, docContext, {
    isCopy: options?.isCopy,
    routeName,
    distributorName,
  })
}

/**
 * Imprime el recibo de venta en la impresora configurada.
 *
 * Requiere tenantId y branchId explícitos para garantizar aislamiento multiempresa.
 * Un fallo de impresión NUNCA altera ni revierte la venta.
 */
export async function printSaleReceipt(
  sale: DistSale,
  optionsOrContext:
    | {
        tenantId: string
        branchId?: string
        docContext: BusinessDocumentContext
        isCopy?: boolean
        routeName?: string
        distributorName?: string
        creditBalance?: number
        customerPhone?: string
      }
    | ReceiptContext,
  legacyCopy = false
): Promise<PrintAttemptResult> {
  const isOptions = 'tenantId' in optionsOrContext
  const tenantId = isOptions ? optionsOrContext.tenantId : 'principal'
  const branchId = isOptions ? optionsOrContext.branchId || 'main' : 'main'
  const isCopy = isOptions ? Boolean(optionsOrContext.isCopy) : legacyCopy

  const docContext: BusinessDocumentContext = isOptions
    ? optionsOrContext.docContext
    : buildBusinessDocumentContext(
        {
          tradeName: optionsOrContext.companyName,
          receiptHeader: optionsOrContext.receiptHeader,
          receiptFooter: optionsOrContext.receiptFooter,
          address: optionsOrContext.address,
          phone: optionsOrContext.phone,
          taxId: optionsOrContext.taxId,
        },
        { branchName: `RUTA: ${optionsOrContext.routeName}` }
      )

  // Scope obligatorio por tenant y branch
  const printer = getActiveReceiptPrinter(tenantId, branchId)

  if (!printer) {
    return {
      ok: false,
      message: 'No hay impresora configurada. Entra a Impresoras y vincula tu impresora térmica.',
    }
  }

  // Comprobación estricta de pertenencia de tenant
  if (printer.restaurantId && printer.restaurantId !== tenantId) {
    return {
      ok: false,
      message: 'Impresora configurada pertenece a otra empresa. Reconfigura tu impresora.',
    }
  }

  if (printer.connectionType === 'bluetooth_spp') {
    try {
      let state = await AndroidBluetoothPermissionsService.checkDiagnosticState()
      if (state.isNativeAndroid && state.bluetoothConnectPermission !== 'granted') {
        state = await AndroidBluetoothPermissionsService.requestConnectPermission()
        if (state.bluetoothConnectPermission !== 'granted') {
          return { ok: false, message: state.message }
        }
      }
      if (state.isNativeAndroid && !state.isBluetoothEnabled) {
        return { ok: false, message: state.message }
      }
    } catch (error) {
      console.error('[distribution] error diagnosticando Bluetooth:', error)
    }
  }

  const payload = buildSaleReceiptPayload(sale, docContext, {
    isCopy,
    routeName: isOptions ? optionsOrContext.routeName : optionsOrContext.routeName,
    distributorName: isOptions ? optionsOrContext.distributorName : optionsOrContext.distributorName,
    creditBalance: isOptions ? optionsOrContext.creditBalance : optionsOrContext.creditBalance,
  })

  try {
    const job = await PrintEngineService.getInstance().submitPrintRequest({
      targetType: 'receipt',
      orderId: sale.id,
      tenantId,
      branchId,
      printerProfileId: printer.id,
      idempotencyKey: isCopy
        ? `dist-receipt-copy:${sale.operationId || sale.id}:${Date.now()}`
        : `dist-receipt:${sale.operationId || sale.id}`,
      payload,
    })

    const outcome = classifyPrintJobOutcome(job, 'Recibo de venta')
    if (outcome.isSuccess) {
      return { ok: true, message: isCopy ? 'Copia de recibo enviada a la impresora.' : 'Ticket enviado a la impresora.' }
    }
    if (outcome.category === 'uncertain') {
      return { ok: false, uncertain: true, message: 'El envío quedó incierto. Revisa si salió papel antes de imprimir una copia.' }
    }
    if (outcome.category === 'pending') {
      return { ok: false, message: 'Ticket en cola de reintento.' }
    }
    return { ok: false, message: outcome.message || 'La impresora no confirmó el ticket. Puedes reintentar.' }
  } catch (error) {
    return {
      ok: false,
      message: (error as Error).message || 'No se pudo enviar el ticket. Puedes reintentar.',
    }
  }
}

/**
 * Imprime el comprobante de cobro de cartera en la impresora configurada.
 */
export async function printCollectionReceipt(
  collection: DistCollection,
  options: {
    tenantId: string
    branchId?: string
    docContext: BusinessDocumentContext
    isCopy?: boolean
    routeName?: string
    collectorName?: string
    customerName?: string
    customerPhone?: string
  }
): Promise<PrintAttemptResult> {
  const tenantId = options.tenantId
  const branchId = options.branchId || 'main'
  const isCopy = Boolean(options.isCopy)

  const printer = getActiveReceiptPrinter(tenantId, branchId)

  if (!printer) {
    return {
      ok: false,
      message: 'No hay impresora configurada. Entra a Impresoras y vincula tu impresora térmica.',
    }
  }

  if (printer.restaurantId && printer.restaurantId !== tenantId) {
    return {
      ok: false,
      message: 'Impresora configurada pertenece a otra empresa.',
    }
  }

  if (printer.connectionType === 'bluetooth_spp') {
    try {
      let state = await AndroidBluetoothPermissionsService.checkDiagnosticState()
      if (state.isNativeAndroid && state.bluetoothConnectPermission !== 'granted') {
        state = await AndroidBluetoothPermissionsService.requestConnectPermission()
        if (state.bluetoothConnectPermission !== 'granted') {
          return { ok: false, message: state.message }
        }
      }
      if (state.isNativeAndroid && !state.isBluetoothEnabled) {
        return { ok: false, message: state.message }
      }
    } catch (error) {
      console.error('[distribution] error diagnosticando Bluetooth:', error)
    }
  }

  const receiptData = distCollectionToReceiptData(collection, {
    routeName: options.routeName,
    collectorName: options.collectorName,
    customerName: options.customerName,
    customerPhone: options.customerPhone,
    isCopy,
  })

  const payload = canonicalReceiptToPrintJobPayload(receiptData, options.docContext, {
    isCopy,
    routeName: options.routeName,
    distributorName: options.collectorName,
  })

  try {
    const job = await PrintEngineService.getInstance().submitPrintRequest({
      targetType: 'receipt',
      orderId: collection.id,
      tenantId,
      branchId,
      printerProfileId: printer.id,
      idempotencyKey: isCopy
        ? `dist-collection-copy:${collection.operationId || collection.id}:${Date.now()}`
        : `dist-collection:${collection.operationId || collection.id}`,
      payload,
    })

    const outcome = classifyPrintJobOutcome(job, 'Comprobante de cobro')
    if (outcome.isSuccess) {
      return { ok: true, message: isCopy ? 'Copia de comprobante enviada a la impresora.' : 'Comprobante enviado a la impresora.' }
    }
    if (outcome.category === 'uncertain') {
      return { ok: false, uncertain: true, message: 'El envío quedó incierto. Revisa si salió papel antes de imprimir una copia.' }
    }
    if (outcome.category === 'pending') {
      return { ok: false, message: 'Comprobante en cola de reintento.' }
    }
    return { ok: false, message: outcome.message || 'La impresora no confirmó el ticket.' }
  } catch (error) {
    return {
      ok: false,
      message: (error as Error).message || 'No se pudo enviar el comprobante.',
    }
  }
}

/**
 * @deprecated Utilizar shareReceipt() canónico con distSaleToReceiptData.
 */
export function buildSaleReceiptText(sale: DistSale, context: ReceiptContext): string {
  const lines: string[] = []
  lines.push(context.companyName.toUpperCase())
  lines.push(new Date(sale.createdAt).toLocaleString('es-BO'))
  lines.push(`Distribuidor: ${context.distributorName}`)
  lines.push(`Ruta: ${context.routeName}`)
  lines.push(`Cliente: ${sale.customerName || 'Cliente ocasional'}`)
  if (sale.customerCode) lines.push(`CI: ${sale.customerCode}`)
  lines.push('--------------------------------')
  for (const line of sale.lines) {
    lines.push(
      `${line.quantity} ${line.unitType === 'kg' ? 'kg' : line.unitType === 'package' ? 'paq' : 'u'} x ${line.productNameSnapshot} @ Bs ${round2(line.actualUnitPrice).toFixed(2)} = Bs ${round2(line.subtotal).toFixed(2)}`
    )
  }
  lines.push('--------------------------------')
  lines.push(`TOTAL: Bs ${round2(sale.total).toFixed(2)}`)
  if (sale.cashAmount > 0) lines.push(`Efectivo: Bs ${round2(sale.cashAmount).toFixed(2)}`)
  if (sale.qrAmount > 0) lines.push(`QR: Bs ${round2(sale.qrAmount).toFixed(2)}`)
  if (sale.creditAmount > 0) lines.push(`Crédito: Bs ${round2(sale.creditAmount).toFixed(2)}`)
  if (sale.creditAmount > 0) {
    lines.push(`Saldo generado: Bs ${round2(context.creditBalance ?? sale.creditAmount).toFixed(2)}`)
  }
  return lines.join('\n')
}

/**
 * @deprecated Utilizar shareReceipt() canónico con distSaleToReceiptData.
 */
export async function shareSaleReceipt(sale: DistSale, context: ReceiptContext): Promise<boolean> {
  const text = buildSaleReceiptText(sale, context)
  const nav = navigator as Navigator & { share?: (data: { title?: string; text: string }) => Promise<void> }

  if (typeof nav.share === 'function') {
    try {
      await nav.share({ title: context.companyName, text })
      return true
    } catch {
      return false
    }
  }

  window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank')
  return true
}

export { shareReceipt, generateReceiptPdf }
