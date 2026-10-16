import type {
  PrinterAdapter,
  PrinterConnectionType,
  PrinterProfile,
  PrintJobPayload,
  PrintResult,
  PrintTransportPayload,
} from '../../types/printing.ts'

const escapeHtml = (val: unknown): string =>
  String(val ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')

export function printHtmlViaBrowser(html: string): Promise<boolean> {
  return new Promise((resolve) => {
    if (typeof window === 'undefined' || typeof document === 'undefined') {
      // Entorno de prueba / node sin DOM: éxito inmediato
      resolve(true)
      return
    }

    const iframe = document.createElement('iframe')
    iframe.style.position = 'fixed'
    iframe.style.top = '-9999px'
    iframe.style.left = '-9999px'
    iframe.style.width = '0px'
    iframe.style.height = '0px'
    iframe.style.border = 'none'
    document.body.appendChild(iframe)

    const doc = iframe.contentWindow?.document || iframe.contentDocument
    if (!doc) {
      if (iframe.parentNode) document.body.removeChild(iframe)
      resolve(false)
      return
    }

    doc.open()
    doc.write(html)
    doc.close()

    const cleanup = () => {
      try {
        if (iframe.parentNode) document.body.removeChild(iframe)
      } catch {}
    }

    // Esperar brevemente a que el render esté completo antes de abrir el diálogo
    setTimeout(() => {
      try {
        iframe.contentWindow?.focus()
        iframe.contentWindow?.print()
        setTimeout(() => {
          cleanup()
          resolve(true)
        }, 800)
      } catch {
        cleanup()
        resolve(false)
      }
    }, 150)
  })
}

export function buildKitchenTicketHtml(
  payload: PrintJobPayload,
  paperWidth: '58mm' | '80mm' = '80mm',
  areaLabel: string = 'COCINA'
): string {
  const contentWidth = paperWidth === '58mm' ? '48mm' : '72mm'
  const timeStr = payload.createdIso ? new Date(payload.createdIso).toLocaleTimeString('es-BO', { hour: '2-digit', minute: '2-digit' }) : ''
  const isReprint = payload.isCopy === true

  return `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <title>Comanda ${escapeHtml(areaLabel)} #${escapeHtml(payload.displayNumber || '')}</title>
  <style>
    @page { size: ${paperWidth} auto; margin: 3mm; }
    @media print { body { width: 100%; margin: 0; } }
    body {
      width: ${contentWidth};
      margin: 0 auto;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace;
      font-size: 13px;
      line-height: 1.35;
      color: #000;
      padding: 2mm 0;
    }
    .text-center { text-align: center; }
    .text-right { text-align: right; }
    .bold { font-weight: bold; }
    .headline { font-size: 18px; margin: 4px 0; }
    .subhead { font-size: 14px; margin: 2px 0; }
    .separator { border-top: 1px dashed #000; margin: 6px 0; }
    .item-row { display: flex; align-items: flex-start; justify-content: space-between; margin: 4px 0; }
    .item-qty { font-weight: bold; min-width: 28px; }
    .item-name { flex: 1; font-weight: bold; }
    .item-note { font-size: 11px; margin-left: 28px; font-style: italic; }
    .reprint-badge { font-size: 15px; font-weight: 900; letter-spacing: 1px; }
  </style>
</head>
<body>
  ${isReprint ? '<div class="text-center bold reprint-badge">*** REIMPRESIÓN / COPIA ***</div><div class="separator"></div>' : ''}
  <div class="text-center bold headline">COMANDA - ${escapeHtml(areaLabel.toUpperCase())}${payload.displayNumber ? ` #${escapeHtml(payload.displayNumber)}` : ''}</div>
  ${payload.restaurantName ? `<div class="text-center bold subhead">${escapeHtml(payload.restaurantName)}</div>` : ''}
  <div class="separator"></div>
  ${payload.tableInfo ? `<div><span class="bold">DESTINO / MESA:</span> ${escapeHtml(payload.tableInfo)}</div>` : ''}
  ${payload.fulfillmentType ? `<div><span class="bold">TIPO:</span> ${escapeHtml(payload.fulfillmentType.toUpperCase())}</div>` : ''}
  <div><span class="bold">HORA:</span> ${escapeHtml(timeStr)}</div>
  ${payload.customerName && payload.customerName !== 'Cliente' ? `<div><span class="bold">RESPONSABLE / CLIENTE:</span> ${escapeHtml(payload.customerName)}</div>` : ''}
  <div class="separator"></div>
  <div class="bold" style="margin-bottom: 4px;">PRODUCTOS:</div>
  ${payload.items.map(item => `
    <div class="item-row">
      <span class="item-qty">${escapeHtml(item.quantity)}x</span>
      <span class="item-name">${escapeHtml(item.name)}</span>
    </div>
    ${item.modifiersText && item.modifiersText.length > 0 ? item.modifiersText.map(mod => `<div class="item-note">[!] ${escapeHtml(mod)}</div>`).join('') : ''}
    ${item.note ? `<div class="item-note">OBS: ${escapeHtml(item.note)}</div>` : ''}
  `).join('')}
  <div class="separator"></div>
  ${payload.showManagedBy !== false ? '<div class="text-center" style="font-size: 10px; margin-top: 6px;">PACHAX Platform</div>' : ''}
</body>
</html>`
}

export function buildReceiptHtml(payload: PrintJobPayload, paperWidth: '58mm' | '80mm' = '80mm'): string {
  const contentWidth = paperWidth === '58mm' ? '48mm' : '72mm'
  const timeStr = payload.createdIso ? new Date(payload.createdIso).toLocaleString('es-BO') : ''
  const isReprint = payload.isCopy === true

  return `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <title>Ticket #${escapeHtml(payload.displayNumber || '')}</title>
  <style>
    @page { size: ${paperWidth} auto; margin: 3mm; }
    @media print { body { width: 100%; margin: 0; } }
    body {
      width: ${contentWidth};
      margin: 0 auto;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace;
      font-size: 12px;
      line-height: 1.35;
      color: #000;
      padding: 2mm 0;
    }
    .text-center { text-align: center; }
    .text-right { text-align: right; }
    .bold { font-weight: bold; }
    .headline { font-size: 16px; margin: 2px 0; }
    .separator { border-top: 1px dashed #000; margin: 5px 0; }
    .flex-row { display: flex; justify-content: space-between; }
    .item-line { margin: 3px 0; }
    .reprint-badge { font-size: 13px; font-weight: 900; }
  </style>
</head>
<body>
  ${isReprint ? '<div class="text-center bold reprint-badge">*** REIMPRESION - COPIA ***</div><div class="separator"></div>' : ''}
  ${payload.logoUrl ? `<div class="text-center" style="margin-bottom: 4px;"><img src="${escapeHtml(payload.logoUrl)}" alt="Logo" style="max-height: 48px; max-width: 120px; margin: 0 auto; display: block; object-fit: contain;" onerror="this.style.display='none'" /></div>` : ''}
  <div class="text-center bold headline">${escapeHtml(payload.restaurantName || 'PACHAX')}</div>
  ${payload.branchName ? `<div class="text-center">${escapeHtml(payload.branchName)}</div>` : ''}
  ${payload.headerDetails?.length ? payload.headerDetails.map(d => `<div class="text-center" style="font-size: 10px;">${escapeHtml(d)}</div>`).join('') : ''}
  ${payload.branchAddress ? `<div class="text-center" style="font-size: 10px;">${escapeHtml(payload.branchAddress)}</div>` : ''}
  ${payload.branchPhone ? `<div class="text-center" style="font-size: 10px;">Tel: ${escapeHtml(payload.branchPhone)}</div>` : ''}
  <div class="separator"></div>
  ${payload.displayNumber ? `<div><span class="bold">TICKET:</span> ${escapeHtml(payload.displayNumber)}</div>` : ''}
  <div><span class="bold">FECHA:</span> ${escapeHtml(timeStr)}</div>
  ${payload.tableInfo ? `<div><span class="bold">MESA:</span> ${escapeHtml(payload.tableInfo)}</div>` : ''}
  ${payload.customerName ? `<div><span class="bold">CLIENTE:</span> ${escapeHtml(payload.customerName)}</div>` : ''}
  <div class="separator"></div>
  <div class="flex-row bold">
    <span>DESCRIPCION</span>
    <span>TOTAL</span>
  </div>
  <div class="separator"></div>
  ${payload.items.map(item => `
    <div class="item-line">
      <div>${escapeHtml(item.quantity)}x ${escapeHtml(item.name)}</div>
      <div class="text-right">${escapeHtml(item.lineTotal.toFixed(2))} Bs</div>
    </div>
  `).join('')}
  <div class="separator"></div>
  <div class="flex-row bold" style="font-size: 14px; margin-top: 4px;">
    <span>TOTAL:</span>
    <span>${escapeHtml(payload.grandTotal.toFixed(2))} Bs</span>
  </div>
  ${payload.paymentMethod ? `<div class="flex-row" style="margin-top: 4px;"><span class="bold">PAGO:</span><span>${escapeHtml(payload.paymentMethod)}</span></div>` : ''}
  ${payload.paymentDetails?.length ? payload.paymentDetails.map(d => `<div class="text-right" style="font-size: 11px;">${escapeHtml(d)}</div>`).join('') : ''}
  <div class="separator"></div>
  <div class="text-center" style="margin-top: 6px; font-size: 11px;">${escapeHtml(payload.footerMessage || '¡Gracias por su preferencia!')}</div>
  ${payload.showManagedBy !== false ? '<div class="text-center" style="margin-top: 4px; font-size: 9px; color: #555;">Gestionado con PACHAX</div>' : ''}
</body>
</html>`
}

export function buildGenericPrintHtml(title: string, text: string, paperWidth: '58mm' | '80mm' = '80mm'): string {
  const contentWidth = paperWidth === '58mm' ? '48mm' : '72mm'
  return `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(title)}</title>
  <style>
    @page { size: ${paperWidth} auto; margin: 3mm; }
    @media print { body { width: 100%; margin: 0; } }
    body {
      width: ${contentWidth};
      margin: 0 auto;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace;
      font-size: 12px;
      line-height: 1.35;
      color: #000;
      white-space: pre-wrap;
      padding: 2mm 0;
    }
  </style>
</head>
<body>${escapeHtml(text)}</body>
</html>`
}

export class BrowserDialogPrinterAdapter implements PrinterAdapter {
  connectionType: PrinterConnectionType = 'browser_dialog'

  async isAvailable(): Promise<boolean> {
    return true
  }

  async connect(_printer: PrinterProfile): Promise<void> {}

  async disconnect(): Promise<void> {}

  formatContent(
    jobOrPayload: { payload?: PrintJobPayload; targetType?: any } | PrintJobPayload,
    targetType: string = 'bar_ticket',
    paperWidth: '58mm' | '80mm' = '80mm'
  ): string {
    const payload = 'items' in jobOrPayload ? jobOrPayload : jobOrPayload.payload
    const target = 'targetType' in jobOrPayload && jobOrPayload.targetType ? jobOrPayload.targetType : targetType
    if (!payload) return ''
    if (target === 'kitchen_ticket' || target === 'bar_ticket') {
      return buildKitchenTicketHtml(payload, paperWidth, target === 'bar_ticket' ? 'BARRA' : 'COCINA')
    }
    return buildReceiptHtml(payload, paperWidth)
  }

  async sendBytes(payload: PrintTransportPayload): Promise<PrintResult> {
    const { printer, jobPayload, targetType, bytes } = payload
    const paperWidth = printer.paperWidth || '80mm'

    let html = ''
    if (jobPayload) {
      if (targetType === 'kitchen_ticket' || targetType === 'bar_ticket') {
        html = buildKitchenTicketHtml(jobPayload, paperWidth, targetType === 'bar_ticket' ? 'BARRA' : 'COCINA')
      } else if (targetType === 'receipt') {
        html = buildReceiptHtml(jobPayload, paperWidth)
      } else if (targetType === 'test') {
        const testText = [
          '*** TICKET DE PRUEBA ***',
          '================================',
          `IMPRESORA: ${printer.name}`,
          `USO: ${printer.role.toUpperCase()}`,
          `CONEXION: USB / IMPRESORA PC`,
          `PAPEL: ${paperWidth}`,
          `FECHA: ${new Date().toLocaleString('es-BO')}`,
          '================================',
          'Configuración verificada con éxito.',
          'PACHAX Platform',
        ].join('\n')
        html = buildGenericPrintHtml('Prueba de Impresión', testText, paperWidth)
      } else {
        html = buildReceiptHtml(jobPayload, paperWidth)
      }
    } else {
      // Decodificar bytes simples como texto plano
      const decoded = new TextDecoder('utf-8', { fatal: false }).decode(bytes)
      const cleanText = decoded.replace(/[\x00-\x1f\x7f-\x9f]/g, (ch) => (ch === '\n' || ch === '\r' || ch === '\t' ? ch : ''))
      html = buildGenericPrintHtml('Impresión', cleanText, paperWidth)
    }

    try {
      const ok = await printHtmlViaBrowser(html)
      if (!ok) {
        return {
          success: false,
          errorMessage: 'No se pudo abrir el diálogo de impresión del navegador.',
          errorClassification: 'safeToRetry',
        }
      }
      return {
        success: true,
        bytesWritten: bytes.length,
        hardwareConfirmed: false,
      }
    } catch (err: unknown) {
      return {
        success: false,
        errorMessage: err instanceof Error ? err.message : 'Error al imprimir',
        errorClassification: 'safeToRetry',
      }
    }
  }
}
