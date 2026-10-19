import type { BusinessIdentity, BusinessDocumentContext } from '../../../core/businessIdentity.ts'
import type { CanonicalReceiptData, CanonicalReceiptItem } from '../../../core/receiptService.ts'
import type { PrintJobPayload } from '../../../types/printing.ts'
import type { NightclubAccount, NightclubDataset, NightclubRound, NightclubRoundItem } from './nightclubAccounts.ts'
import { nightclubAccountTableId } from './nightclubAccounts.ts'

/**
 * Convierte una cuenta de Nightclub a la estructura canónica de recibo digital/impresión.
 * Incluye la cuenta completa (todas las rondas no canceladas), productos, totales y desglose
 * detallado de métodos de pago (Efectivo, QR, Tarjeta, recibido y cambio).
 */
export function nightclubAccountToReceiptData(
  account: NightclubAccount,
  dataset?: Partial<NightclubDataset>,
  _businessIdentity?: Partial<BusinessIdentity>
): CanonicalReceiptData {
  const validRounds = (account.rounds || []).filter((r) => r.status !== 'cancelled')

  // Agrupar productos válidos de todas las rondas
  const grouped = new Map<string, CanonicalReceiptItem>()
  for (const round of validRounds) {
    for (const item of round.items || []) {
      if (item.status === 'cancelled' || item.status === 'returned') continue
      const key = `${item.productId}:${item.unitPrice}:${item.kind || 'sale'}`
      const existing = grouped.get(key)
      if (existing) {
        existing.quantity += item.quantity
        existing.lineTotal += item.lineTotal
      } else {
        grouped.set(key, {
          name: item.name,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          lineTotal: item.lineTotal,
          note: item.kind === 'courtesy' ? 'Cortesía' : undefined,
        })
      }
    }
  }
  const validItems = Array.from(grouped.values())
  const computedSubtotal = validItems.reduce((acc, item) => acc + item.lineTotal, 0)
  const subtotal = computedSubtotal > 0 ? computedSubtotal : account.subtotal || 0
  const total = subtotal

  // Destino / Mesa
  const tableId = nightclubAccountTableId(account)
  const table = dataset?.tables?.find((t) => t.id === tableId)
  const tableOrPoint = table?.name || account.tableNameSnapshot || (tableId ? `Mesa ${tableId}` : 'Barra')

  // Cliente
  const customer = dataset?.customers?.find((c) => c.id === account.customerId)
  const customerName =
    customer?.name || account.customerDisplayName || (account.customerId ? 'Cliente' : undefined)

  // Pagos confirmados y desglose
  const payments = (
    account.payments?.length ? account.payments : account.payment ? [account.payment] : []
  ).filter((p) => p.status !== 'refunded' && p.kind !== 'pending_electronic_refund')

  let totalCash = 0
  let totalQr = 0
  let totalCard = 0
  let totalReceived = 0
  let totalChange = 0

  for (const p of payments) {
    totalCash += p.cashAmount || 0
    totalQr += p.qrAmount || 0
    totalCard += p.cardAmount || 0
    totalReceived += p.received || 0
    totalChange += p.change || 0
  }

  const paymentDetails: string[] = []
  const methods: string[] = []

  if (totalCash > 0) {
    methods.push('EFECTIVO')
    paymentDetails.push(`Efectivo: Bs ${totalCash.toFixed(2)}`)
  }
  if (totalQr > 0) {
    methods.push('QR')
    paymentDetails.push(`QR: Bs ${totalQr.toFixed(2)}`)
  }
  if (totalCard > 0) {
    methods.push('TARJETA')
    paymentDetails.push(`Tarjeta: Bs ${totalCard.toFixed(2)}`)
  }

  const paymentMethod = methods.length > 1 ? 'MIXTO' : methods[0] || 'PAGADO'

  return {
    receiptNumber: account.id.slice(-6).toUpperCase(),
    dateIso: account.paidAt || account.openedAt || new Date().toISOString(),
    fulfillmentType: tableId ? 'salon' : 'barra',
    tableOrPoint,
    customer: {
      name: customerName,
      phone: customer?.phone,
    },
    items: validItems,
    subtotal,
    total,
    paymentMethod,
    paymentDetails: paymentDetails.length > 0 ? paymentDetails : undefined,
    cashAmount: totalCash,
    qrAmount: totalQr,
    cardAmount: totalCard,
    cashReceived: totalReceived > 0 ? totalReceived : undefined,
    changeAmount: totalChange > 0 ? totalChange : undefined,
  } as CanonicalReceiptData & { cashAmount?: number; qrAmount?: number; cardAmount?: number }
}

/**
 * Genera el payload de comanda de Barra (bar_ticket).
 * IMPORTANTE: Filtra estrictamente los productos donde preparationArea === 'Barra'.
 * Los productos marcados como 'Directo' NO se imprimen en Barra.
 */
export function buildNightclubBarTicketPayload({
  account,
  round,
  tableName,
  businessIdentity,
  companyName,
  isReprint = false,
  staffName,
}: {
  account?: NightclubAccount
  round:
    | NightclubRound
    | { id: string; sequence: number; createdAt: string; items: NightclubRoundItem[]; serviceStaffName?: string }
  tableName?: string
  businessIdentity?: Partial<BusinessIdentity>
  companyName: string
  isReprint?: boolean
  staffName?: string
}): PrintJobPayload | null {
  // Filtrar estrictamente productos de preparación en Barra
  const barItems = (round.items || []).filter(
    (item) => item.preparationArea === 'Barra' && item.status !== 'cancelled' && item.status !== 'returned'
  )

  // Si no hay productos de Barra, no se envía comanda
  if (barItems.length === 0) {
    return null
  }

  const destination =
    tableName ||
    (account && nightclubAccountTableId(account) ? account.tableNameSnapshot || 'Mesa' : 'Barra') ||
    'Barra'

  return {
    payloadSchemaVersion: 1,
    templateVersion: 'v1.0',
    restaurantName: businessIdentity?.tradeName || companyName || 'PACHAX Platform',
    branchName: 'Principal',
    orderId: round.id,
    sequenceNumber: round.sequence,
    displayNumber: String(round.sequence),
    tableInfo: destination,
    fulfillmentType: destination === 'Barra' ? 'Barra' : 'Mesa',
    customerName: round.serviceStaffName || staffName || account?.openedBy || 'Servicio',
    items: barItems.map((item) => ({
      name: item.name,
      quantity: item.quantity,
      basePrice: 0,
      lineTotal: 0,
      note: item.kind === 'courtesy' ? 'Cortesía' : undefined,
    })),
    subtotal: 0,
    discountTotal: 0,
    taxTotal: 0,
    deliveryFee: 0,
    grandTotal: 0,
    isCopy: isReprint,
    headerDetails: isReprint ? ['*** REIMPRESIÓN / COPIA ***'] : undefined,
    showManagedBy: businessIdentity?.showManagedBy ?? true,
    copies: 1,
    createdIso: round.createdAt || new Date().toISOString(),
  }
}

/**
 * Convierte el recibo canónico a un payload compatible con PrintEngineService (targetType: 'receipt').
 */
export function nightclubReceiptToPrintPayload(
  receiptData: CanonicalReceiptData,
  docContext: BusinessDocumentContext,
  accountId: string
): PrintJobPayload {
  return {
    payloadSchemaVersion: 1,
    templateVersion: 'v1.0',
    restaurantName: docContext.companyName,
    branchName: docContext.branchName || 'Principal',
    branchAddress: docContext.showAddress ? docContext.address : undefined,
    branchPhone: docContext.showPhone ? docContext.phone || docContext.whatsapp : undefined,
    logoUrl: docContext.showLogo ? docContext.logoUrl : undefined,
    headerDetails: docContext.formattedHeaderLines,
    orderId: accountId,
    displayNumber: receiptData.receiptNumber,
    tableInfo: receiptData.tableOrPoint,
    customerName: receiptData.customer?.name,
    customerPhone: receiptData.customer?.phone,
    items: receiptData.items.map((item) => ({
      name: item.name,
      quantity: item.quantity,
      unitLabel: item.unitLabel,
      basePrice: item.unitPrice,
      lineTotal: item.lineTotal,
      note: item.note,
    })),
    subtotal: receiptData.subtotal,
    discountTotal: receiptData.discountTotal || 0,
    taxTotal: 0,
    deliveryFee: receiptData.deliveryFee || 0,
    grandTotal: receiptData.total,
    paymentMethod: receiptData.paymentMethod,
    paymentDetails: receiptData.paymentDetails,
    cashReceived: receiptData.cashReceived,
    changeAmount: receiptData.changeAmount,
    isCopy: Boolean(receiptData.isCopy),
    footerMessage: docContext.receiptFooter,
    showManagedBy: docContext.showManagedBy,
    copies: 1,
    createdIso: receiptData.dateIso,
  }
}
