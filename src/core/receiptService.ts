/**
 * Canonical Digital Receipt & Share Service for PACHAX Platform.
 * Supports Android Native Share (via Capacitor), Web Share API with file,
 * and graceful browser fallback (download PDF + WhatsApp text link).
 */

import { Capacitor } from '@capacitor/core'
import type { BusinessDocumentContext } from './businessIdentity.ts'

export interface CanonicalReceiptItem {
  name: string
  quantity: number
  unitLabel?: string
  unitPrice: number
  lineTotal: number
  modifiers?: string[]
  note?: string
}

export interface CanonicalReceiptData {
  receiptNumber: string
  dateIso: string
  fulfillmentType?: string
  tableOrPoint?: string
  customer?: {
    name?: string
    phone?: string
    taxId?: string
    address?: string
  }
  items: CanonicalReceiptItem[]
  subtotal: number
  discountTotal?: number
  deliveryFee?: number
  total: number
  paymentMethod?: string
  cashReceived?: number
  changeAmount?: number
  paymentDetails?: string[]
  notes?: string
  isCopy?: boolean
}

/**
 * Convierte un pedido estándar de Restaurante (Order) a la estructura canónica de recibo.
 */
export function orderToReceiptData(order: any, customer?: any): CanonicalReceiptData {
  return {
    receiptNumber: order.displayNumber || (order.id ? order.id.slice(-6).toUpperCase() : '000'),
    dateIso: order.paidAt || order.createdAt || new Date().toISOString(),
    fulfillmentType: order.fulfillmentType || 'salon',
    tableOrPoint: order.tableInfo || (order.fulfillmentType === 'pickup' ? 'Para llevar' : order.fulfillmentType === 'delivery' ? 'Delivery' : undefined),
    customer: {
      name: order.customerName || (customer ? `${customer.firstName || ''} ${customer.lastName || ''}`.trim() : undefined),
      phone: order.customerPhone || customer?.phone || customer?.normalizedPhone,
      taxId: customer?.taxId,
      address: order.deliveryAddress,
    },
    items: (order.items || []).map((item: any) => ({
      name: item.name,
      quantity: item.quantity,
      unitLabel: item.unitLabel,
      unitPrice: item.basePrice ?? (item.lineTotal / (item.quantity || 1)),
      lineTotal: item.lineTotal,
      modifiers: Array.isArray(item.modifiers) ? item.modifiers : item.modifiers?.note ? [item.modifiers.note] : undefined,
      note: item.note,
    })),
    subtotal: order.subtotal ?? order.total,
    discountTotal: order.discountTotal || 0,
    deliveryFee: order.deliveryFee || 0,
    total: order.total,
    paymentMethod: order.paymentMethod ? String(order.paymentMethod).toUpperCase() : 'PAGADO',
    cashReceived: order.cashReceived,
    changeAmount: order.changeAmount,
    paymentDetails: order.paymentDetails,
    isCopy: Boolean(order.isCopy),
  }
}

/**
 * Genera el texto plano formateado del recibo (ideal para WhatsApp o portapapeles).
 */
export function buildReceiptPlainText(
  docContext: BusinessDocumentContext,
  receipt: CanonicalReceiptData
): string {
  const lines: string[] = []

  lines.push(`🧾 *${docContext.companyName.toUpperCase()}*`)
  if (docContext.formattedHeaderLines?.length) {
    docContext.formattedHeaderLines.forEach(h => lines.push(h))
  }
  lines.push('--------------------------------')
  lines.push(`Comprobante: *#${receipt.receiptNumber}*`)
  lines.push(`Fecha: ${new Date(receipt.dateIso).toLocaleString('es-BO')}`)
  if (receipt.tableOrPoint) {
    lines.push(`Destino / Mesa: ${receipt.tableOrPoint}`)
  }
  if (receipt.customer?.name) {
    lines.push(`Cliente: ${receipt.customer.name}`)
  }
  if (receipt.customer?.taxId) {
    lines.push(`NIT/CI: ${receipt.customer.taxId}`)
  }
  lines.push('--------------------------------')

  receipt.items.forEach(item => {
    const qty = item.quantity
    const unit = item.unitLabel ? ` ${item.unitLabel}` : ''
    lines.push(`${qty}${unit} x ${item.name} = Bs ${item.lineTotal.toFixed(2)}`)
    if (item.modifiers?.length) {
      item.modifiers.forEach(m => lines.push(`   └ ${m}`))
    }
  })

  lines.push('--------------------------------')
  if (receipt.discountTotal && receipt.discountTotal > 0) {
    lines.push(`Subtotal: Bs ${receipt.subtotal.toFixed(2)}`)
    lines.push(`Descuento: -Bs ${receipt.discountTotal.toFixed(2)}`)
  }
  if (receipt.deliveryFee && receipt.deliveryFee > 0) {
    lines.push(`Delivery: Bs ${receipt.deliveryFee.toFixed(2)}`)
  }
  lines.push(`*TOTAL: Bs ${receipt.total.toFixed(2)}*`)

  if (receipt.paymentMethod) {
    lines.push(`Forma de pago: ${receipt.paymentMethod}`)
  }
  if (receipt.cashReceived) {
    lines.push(`Recibido: Bs ${receipt.cashReceived.toFixed(2)}`)
  }
  if (receipt.changeAmount) {
    lines.push(`Cambio: Bs ${receipt.changeAmount.toFixed(2)}`)
  }

  if (docContext.receiptFooter) {
    lines.push('--------------------------------')
    lines.push(docContext.receiptFooter)
  }
  if (docContext.showManagedBy) {
    lines.push('Gestionado con PACHAX')
  }

  return lines.join('\n')
}

/**
 * Carga una imagen como Data URL de forma segura (sin bloquear en caso de error).
 */
async function loadImageDataUrlSafe(url: string): Promise<string | null> {
  if (!url || typeof window === 'undefined') return null
  try {
    const response = await fetch(url, { mode: 'cors' })
    if (!response.ok) return null
    const blob = await response.blob()
    return new Promise(resolve => {
      const reader = new FileReader()
      reader.onloadend = () => resolve(typeof reader.result === 'string' ? reader.result : null)
      reader.onerror = () => resolve(null)
      reader.readAsDataURL(blob)
    })
  } catch {
    return null
  }
}

/**
 * Genera un PDF térmico/digital de 80mm estilizado mediante jsPDF.
 */
export async function generateReceiptPdf(
  docContext: BusinessDocumentContext,
  receipt: CanonicalReceiptData
): Promise<Uint8Array> {
  const { jsPDF } = await import('jspdf')

  // Estimación de altura en milímetros para formato rollo 80mm
  const estimatedHeight = Math.max(
    140,
    95 +
      receipt.items.length * 10 +
      receipt.items.reduce((acc, it) => acc + (it.modifiers?.length || 0) * 4, 0) +
      (docContext.formattedHeaderLines.length || 0) * 5 +
      (receipt.paymentDetails?.length || 0) * 5
  )

  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: [80, estimatedHeight],
  })

  let cursorY = 8

  // Intentar cargar e incrustar el logo si está habilitado
  if (docContext.showLogo && docContext.logoUrl) {
    try {
      const logoData = await loadImageDataUrlSafe(docContext.logoUrl)
      if (logoData) {
        doc.addImage(logoData, 'PNG', 28, cursorY, 24, 14, undefined, 'FAST')
        cursorY += 16
      }
    } catch {
      // Si falla, el recibo se genera normalmente con datos textuales
    }
  }

  // Nombre de empresa
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(13)
  doc.setTextColor(30, 41, 59)
  doc.text(docContext.companyName.toUpperCase(), 40, cursorY, { align: 'center', maxWidth: 70 })
  cursorY += 5

  // Líneas de cabecera (NIT, dirección, teléfono)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(71, 85, 105)

  if (docContext.legalName && docContext.legalName !== docContext.companyName) {
    doc.text(docContext.legalName, 40, cursorY, { align: 'center', maxWidth: 70 })
    cursorY += 3.5
  }

  for (const line of docContext.formattedHeaderLines) {
    doc.text(line, 40, cursorY, { align: 'center', maxWidth: 70 })
    cursorY += 3.5
  }

  // Separador
  cursorY += 1
  doc.setDrawColor(203, 213, 225)
  doc.setLineDashPattern([1, 1], 0)
  doc.line(5, cursorY, 75, cursorY)
  cursorY += 4

  // Metadatos del ticket
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.setTextColor(15, 23, 42)
  doc.text(`TICKET #${receipt.receiptNumber}`, 5, cursorY)
  if (receipt.isCopy) {
    doc.setFontSize(7)
    doc.text('(COPIA)', 75, cursorY, { align: 'right' })
  }
  cursorY += 4

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7.5)
  doc.setTextColor(71, 85, 105)
  doc.text(`Fecha: ${new Date(receipt.dateIso).toLocaleString('es-BO')}`, 5, cursorY)
  cursorY += 3.5

  if (receipt.tableOrPoint) {
    doc.text(`Mesa / Destino: ${receipt.tableOrPoint}`, 5, cursorY)
    cursorY += 3.5
  }
  if (receipt.customer?.name) {
    doc.text(`Cliente: ${receipt.customer.name}`, 5, cursorY)
    cursorY += 3.5
  }
  if (receipt.customer?.taxId) {
    doc.text(`NIT / CI: ${receipt.customer.taxId}`, 5, cursorY)
    cursorY += 3.5
  }

  // Separador antes de ítems
  cursorY += 1
  doc.line(5, cursorY, 75, cursorY)
  cursorY += 4

  // Encabezado de columnas
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7.5)
  doc.setTextColor(30, 41, 59)
  doc.text('CANT  PRODUCTO', 5, cursorY)
  doc.text('TOTAL', 75, cursorY, { align: 'right' })
  cursorY += 3

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)

  // Lista de productos
  for (const item of receipt.items) {
    const qtyStr = `${item.quantity}${item.unitLabel ? ` ${item.unitLabel}` : ''}x`
    doc.setFont('helvetica', 'bold')
    doc.text(qtyStr, 5, cursorY)

    doc.setFont('helvetica', 'normal')
    doc.text(item.name, 17, cursorY, { maxWidth: 42 })

    doc.setFont('helvetica', 'bold')
    doc.text(`Bs ${item.lineTotal.toFixed(2)}`, 75, cursorY, { align: 'right' })
    cursorY += 4

    if (item.modifiers && item.modifiers.length > 0) {
      doc.setFont('helvetica', 'italic')
      doc.setFontSize(6.5)
      doc.setTextColor(100, 116, 139)
      for (const mod of item.modifiers) {
        doc.text(`* ${mod}`, 17, cursorY, { maxWidth: 45 })
        cursorY += 3
      }
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(8)
      doc.setTextColor(30, 41, 59)
    }
  }

  // Separador de totales
  cursorY += 1
  doc.line(5, cursorY, 75, cursorY)
  cursorY += 4

  // Totales
  doc.setFontSize(8)
  if (receipt.discountTotal && receipt.discountTotal > 0) {
    doc.text('SUBTOTAL:', 45, cursorY)
    doc.text(`Bs ${receipt.subtotal.toFixed(2)}`, 75, cursorY, { align: 'right' })
    cursorY += 3.5
    doc.text('DESCUENTO:', 45, cursorY)
    doc.text(`-Bs ${receipt.discountTotal.toFixed(2)}`, 75, cursorY, { align: 'right' })
    cursorY += 3.5
  }

  if (receipt.deliveryFee && receipt.deliveryFee > 0) {
    doc.text('DELIVERY:', 45, cursorY)
    doc.text(`Bs ${receipt.deliveryFee.toFixed(2)}`, 75, cursorY, { align: 'right' })
    cursorY += 3.5
  }

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.setTextColor(15, 23, 42)
  doc.text('TOTAL:', 5, cursorY)
  doc.text(`Bs ${receipt.total.toFixed(2)}`, 75, cursorY, { align: 'right' })
  cursorY += 5

  // Medios de pago
  if (receipt.paymentMethod) {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7.5)
    doc.setTextColor(71, 85, 105)
    doc.text(`Pago: ${receipt.paymentMethod}`, 5, cursorY)
    cursorY += 3.5
  }
  if (receipt.cashReceived) {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7.5)
    doc.text(`Recibido: Bs ${receipt.cashReceived.toFixed(2)}`, 5, cursorY)
    if (receipt.changeAmount) {
      doc.text(`Cambio: Bs ${receipt.changeAmount.toFixed(2)}`, 75, cursorY, { align: 'right' })
    }
    cursorY += 3.5
  }

  // Mensaje de pie
  cursorY += 2
  doc.setLineDashPattern([], 0)
  doc.line(5, cursorY, 75, cursorY)
  cursorY += 4

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7.5)
  doc.setTextColor(71, 85, 105)
  if (docContext.receiptFooter) {
    doc.text(docContext.receiptFooter, 40, cursorY, { align: 'center', maxWidth: 70 })
    cursorY += 4
  }
  if (docContext.showManagedBy) {
    doc.setFontSize(6.5)
    doc.setTextColor(148, 163, 184)
    doc.text('Gestionado con PACHAX', 40, cursorY, { align: 'center' })
  }

  return new Uint8Array(doc.output('arraybuffer'))
}

/**
 * Servicio unificado para compartir recibos:
 * ANDROID: PDF vía Share nativo (@capacitor/share + @capacitor/filesystem)
 * WEB: Web Share con archivo si el navegador lo soporta;
 *      si no, descarga el PDF y abre texto por WhatsApp como fallback seguro.
 */
export async function shareReceipt(
  docContext: BusinessDocumentContext,
  receipt: CanonicalReceiptData,
  options?: { filename?: string; customerPhone?: string }
): Promise<{ success: boolean; method: string; message?: string }> {
  const filename = options?.filename || `Recibo_${receipt.receiptNumber}_${Date.now()}.pdf`
  const plainText = buildReceiptPlainText(docContext, receipt)

  try {
    const pdfBytes = await generateReceiptPdf(docContext, receipt)

    // A) ENTORNO ANDROID / CAPACITOR NATIVO
    if (Capacitor.isNativePlatform()) {
      const [{ Filesystem, Directory }, { Share }] = await Promise.all([
        import('@capacitor/filesystem'),
        import('@capacitor/share'),
      ])

      let binary = ''
      for (let i = 0; i < pdfBytes.length; i += 8192) {
        binary += String.fromCharCode(...pdfBytes.subarray(i, i + 8192))
      }

      const file = await Filesystem.writeFile({
        directory: Directory.Cache,
        path: `receipts/${filename}`,
        data: btoa(binary),
        recursive: true,
      })

      await Share.share({
        title: `${docContext.companyName} - Recibo #${receipt.receiptNumber}`,
        text: plainText,
        files: [file.uri],
        dialogTitle: 'Compartir recibo',
      })

      return { success: true, method: 'android_native_share' }
    }

    // B) ENTORNO NAVEGADOR WEB
    const blob = new Blob([pdfBytes as unknown as BlobPart], { type: 'application/pdf' })
    const nav = typeof navigator !== 'undefined' ? (navigator as any) : null

    // 1. Probar Web Share API con archivos si el navegador lo soporta
    if (nav?.canShare && typeof File !== 'undefined') {
      try {
        const file = new File([blob], filename, { type: 'application/pdf' })
        if (nav.canShare({ files: [file] })) {
          await nav.share({
            title: `${docContext.companyName} - Recibo #${receipt.receiptNumber}`,
            text: plainText,
            files: [file],
          })
          return { success: true, method: 'web_share_file' }
        }
      } catch (shareErr) {
        // El usuario canceló o el navegador denegó; continúa al fallback
        console.warn('[shareReceipt] Web share file falló o cancelado, aplicando fallback:', shareErr)
      }
    }

    // 2. Fallback Web: Descarga automática del PDF + enlace WhatsApp
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    setTimeout(() => URL.revokeObjectURL(url), 45000)

    // Si tiene teléfono de cliente o usuario solicita compartir texto:
    const targetPhone = options?.customerPhone ? options.customerPhone.replace(/\D/g, '') : ''
    const waUrl = targetPhone
      ? `https://wa.me/${targetPhone}?text=${encodeURIComponent(plainText)}`
      : `https://wa.me/?text=${encodeURIComponent(plainText)}`

    window.open(waUrl, '_blank', 'noopener,noreferrer')

    return { success: true, method: 'web_download_and_whatsapp' }
  } catch (error) {
    console.error('[shareReceipt] Error compartiendo recibo:', error)
    // Último recurso seguro: compartir texto vía WhatsApp sin fallar
    const waUrl = `https://wa.me/?text=${encodeURIComponent(plainText)}`
    window.open(waUrl, '_blank', 'noopener,noreferrer')
    return { success: false, method: 'text_fallback', message: (error as Error).message }
  }
}
