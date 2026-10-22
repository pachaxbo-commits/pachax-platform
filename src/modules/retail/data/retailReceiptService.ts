import type { BusinessDocumentContext } from '../../../core/businessIdentity'
import type { RetailSale } from './retailRepository'
import { PrintEngineService, classifyPrintJobOutcome } from '../../../services/printing/printEngineService'
import { getActiveReceiptPrinter } from '../../../services/printing/printerProfiles'
import type { PrintJobPayload } from '../../../types/printing'

export async function printRetailReceipt(sale: RetailSale, tenantId: string, branchId: string, document: BusinessDocumentContext) {
  const printer = getActiveReceiptPrinter(tenantId, branchId)
  if (!printer) return { ok: false, message: 'No hay impresora de recibos configurada.' }
  if (printer.tenantId && printer.tenantId !== tenantId) return { ok: false, message: 'La impresora configurada pertenece a otra empresa.' }
  const receiptNumber = sale.saleId.slice(-8).toUpperCase()
  const payload: PrintJobPayload = {
    payloadSchemaVersion: 1,
    templateVersion: 'v1.0-receipt',
    restaurantName: document.companyName.toUpperCase(),
    branchName: document.branchName || 'Sucursal principal',
    headerDetails: document.formattedHeaderLines,
    logoUrl: document.showLogo ? document.logoUrl : undefined,
    orderId: sale.saleId,
    displayNumber: receiptNumber,
    customerName: 'Cliente ocasional',
    items: sale.items.map(item => ({ name: item.productNameSnapshot, basePrice: (item.unitPriceMinor ?? item.subtotalMinor) / 100, quantity: item.quantity, unitLabel: item.unit === 'g' ? 'g' : 'unidad', lineTotal: item.subtotalMinor / 100 })),
    subtotal: sale.totalMinor / 100,
    discountTotal: 0,
    taxTotal: 0,
    deliveryFee: 0,
    grandTotal: sale.totalMinor / 100,
    paymentMethod: sale.payment.method.toUpperCase(),
    paymentDetails: [`Efectivo: Bs ${(sale.payment.cashMinor / 100).toFixed(2)}`, `QR: Bs ${(sale.payment.qrMinor / 100).toFixed(2)}`],
    cashReceived: (sale.payment.receivedMinor ?? sale.payment.cashMinor) / 100,
    changeAmount: sale.payment.changeMinor / 100,
    isCopy: false,
    footerMessage: document.receiptFooter,
    showManagedBy: document.showManagedBy,
    copies: 1,
    createdIso: sale.createdAt,
  }
  try {
    const job = await PrintEngineService.getInstance().submitPrintRequest({ targetType: 'receipt', orderId: sale.saleId, tenantId, branchId, printerProfileId: printer.id, idempotencyKey: `retail-receipt:${sale.saleId}`, payload })
    const outcome = classifyPrintJobOutcome(job, 'Comprobante de venta')
    return { ok: outcome.isSuccess, message: outcome.message }
  } catch (cause) {
    return { ok: false, message: cause instanceof Error ? cause.message : 'No se pudo enviar el comprobante a la impresora.' }
  }
}
