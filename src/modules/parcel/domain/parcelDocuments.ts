/**
 * Servicios de Comprobantes, Tickets Térmicos (58/80mm), Recibos A4 y Reportes PDF.
 * Compatible con impresoras térmicas de Windows/navegador y descarga de documentos.
 */

import type {
  ParcelShipment,
  ParcelDeliveryRecord,
  UnionMonthlyDue,
  UnionDuePayment,
  DispatchManifest,
} from '../types.ts'
import type { BusinessIdentity, BusinessDocumentContext } from '../../../core/businessIdentity.ts'

export interface DocumentCompanyContext {
  name: string
  legalName?: string
  phone?: string
  address?: string
  city?: string
  taxId?: string
  logoUrl?: string
}

export const DEFAULT_PARCEL_COMPANY: DocumentCompanyContext = {
  name: 'TRANS-BOLIVIA ENCOMIENDAS & LOGÍSTICA',
  legalName: 'Sindicato Mixto de Transporte & Encomiendas Interdepartamental',
  phone: '4-4251234 / 70712345',
  address: 'Av. Ayacucho #452 (Frente a Terminal de Buses)',
  city: 'Cochabamba - Bolivia',
  taxId: '1029384021',
}

/**
 * Normaliza cualquier fuente de identidad corporativa de PACHAX Core (BusinessIdentity,
 * BusinessDocumentContext o DocumentCompanyContext) para su uso en documentos de encomiendas.
 */
export function toDocumentCompanyContext(
  source?: Partial<BusinessIdentity> | Partial<BusinessDocumentContext> | DocumentCompanyContext | null
): DocumentCompanyContext {
  if (!source) return DEFAULT_PARCEL_COMPANY
  const name = ('tradeName' in source && source.tradeName)
    ? source.tradeName
    : ('companyName' in source && source.companyName)
      ? source.companyName
      : ('name' in source && source.name)
        ? source.name
        : DEFAULT_PARCEL_COMPANY.name

  return {
    name,
    legalName: source.legalName || DEFAULT_PARCEL_COMPANY.legalName,
    phone: source.phone || ('whatsapp' in source ? source.whatsapp : undefined) || DEFAULT_PARCEL_COMPANY.phone,
    address: source.address || DEFAULT_PARCEL_COMPANY.address,
    city: source.city || DEFAULT_PARCEL_COMPANY.city,
    taxId: source.taxId || DEFAULT_PARCEL_COMPANY.taxId,
    logoUrl: source.logoUrl,
  }
}

/**
 * Genera el comprobante oficial de recepción de encomienda en formato PDF.
 * Permite emitir 'ticket' (80mm) o 'a4'.
 */
export async function generateShipmentReceptionPdf(
  shipment: ParcelShipment,
  options: {
    company?: DocumentCompanyContext | Partial<BusinessIdentity> | Partial<BusinessDocumentContext>
    format?: '80mm' | 'a4'
    isCopy?: boolean
    copyLabel?: 'ORIGINAL CLIENTE' | 'COPIA AGENCIA' | 'REIMPRESIÓN' | 'REIMPRESIÓN / COPIA' | string
  } = {}
): Promise<{ blob: Blob; url: string; filename: string }> {
  const { jsPDF } = await import('jspdf')
  const { default: autoTable } = await import('jspdf-autotable')

  const company = toDocumentCompanyContext(options.company)
  const format = options.format || 'a4'
  const copyLabel = options.copyLabel || (options.isCopy ? 'REIMPRESIÓN / COPIA' : 'ORIGINAL CLIENTE')

  if (format === '80mm') {
    // Formato de Ticket Térmico de 80mm de ancho (72mm imprimibles), largo dinámico (~220mm)
    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: [80, 240],
    })

    let y = 8
    if (company.logoUrl) {
      try {
        doc.addImage(company.logoUrl, 'JPEG', 28, y, 24, 16)
        y += 18
      } catch {
        // Fallback si la imagen no puede rasterizarse
      }
    }
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(10)
    doc.text(company.name, 40, y, { align: 'center', maxWidth: 74 })
    y += 5

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7)
    if (company.legalName) {
      doc.text(company.legalName, 40, y, { align: 'center', maxWidth: 74 })
      y += 4
    }
    doc.text(`${company.city} · Telf: ${company.phone}`, 40, y, { align: 'center' })
    y += 5

    doc.setLineDashPattern([1, 1], 0)
    doc.line(4, y, 76, y)
    y += 4

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(11)
    doc.text(`GUÍA: ${shipment.trackingCode}`, 40, y, { align: 'center' })
    y += 4
    doc.setFontSize(7)
    doc.setFont('helvetica', 'italic')
    doc.text(`[ ${copyLabel} ]`, 40, y, { align: 'center' })
    y += 4

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.text(`Fecha: ${new Date(shipment.createdAt).toLocaleString('es-BO')}`, 4, y)
    y += 4
    doc.text(`Origen: ${shipment.originCity.toUpperCase()}`, 4, y)
    y += 4
    doc.text(`Destino: ${shipment.destinationCity.toUpperCase()} (${shipment.deliveryType === 'home' ? 'A Domicilio' : 'Agencia'})`, 4, y)
    y += 4

    doc.line(4, y, 76, y)
    y += 4

    // Remitente y Destinatario
    doc.setFont('helvetica', 'bold')
    doc.text('REMITENTE:', 4, y)
    doc.setFont('helvetica', 'normal')
    doc.text(`${shipment.sender.name}`, 22, y, { maxWidth: 54 })
    y += 4
    doc.text(`Tel: ${shipment.sender.phone} ${shipment.sender.docNumber ? `· Doc: ${shipment.sender.docNumber}` : ''}`, 4, y)
    y += 4

    doc.setFont('helvetica', 'bold')
    doc.text('DESTINATARIO:', 4, y)
    doc.setFont('helvetica', 'normal')
    doc.text(`${shipment.recipient.name}`, 25, y, { maxWidth: 51 })
    y += 4
    doc.text(`Tel: ${shipment.recipient.phone} ${shipment.recipient.docNumber ? `· Doc: ${shipment.recipient.docNumber}` : ''}`, 4, y)
    y += 4
    if (shipment.deliveryType === 'home' && shipment.deliveryAddress) {
      doc.text(`Dirección: ${shipment.deliveryAddress}`, 4, y, { maxWidth: 72 })
      y += 4
    }

    doc.line(4, y, 76, y)
    y += 4

    // Contenido declarado
    doc.setFont('helvetica', 'bold')
    doc.text('CONTENIDO DECLARADO:', 4, y)
    y += 4
    doc.setFont('helvetica', 'normal')
    doc.text(shipment.declaredSummary, 4, y, { maxWidth: 72 })
    y += 4
    doc.text(`Bultos: ${shipment.packageCount} | Peso: ${shipment.totalWeightKg || '-'} kg ${shipment.isFragile ? '| FRÁGIL' : ''}`, 4, y)
    y += 5

    doc.line(4, y, 76, y)
    y += 4

    // Cobro
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9)
    const timingText = shipment.paymentTiming === 'origin_paid' ? 'PAGADO EN ORIGEN' : 'COBRO EN DESTINO'
    doc.text(`ESTADO: ${timingText}`, 4, y)
    y += 4.5
    doc.text(`TOTAL FLETE: Bs. ${shipment.finalAmount.toFixed(2)}`, 4, y)
    y += 4
    doc.setFontSize(7)
    doc.setFont('helvetica', 'normal')
    doc.text(`Atendido por: ${shipment.cashierName}`, 4, y)
    y += 6

    // Advertencia legal
    doc.setFontSize(6)
    doc.text('Declaro bajo juramento que el contenido no incluye dinero, sustancias controladas, explosivos ni artículos prohibidos por ley.', 4, y, { maxWidth: 72 })
    y += 10

    // Firmas
    doc.line(8, y, 36, y)
    doc.line(44, y, 72, y)
    y += 3
    doc.text('Firma Remitente', 14, y)
    doc.text('Firma Operador', 50, y)

    const blob = doc.output('blob')
    const url = URL.createObjectURL(blob)
    return { blob, url, filename: `Guia-${shipment.trackingCode}-80mm.pdf` }
  }

  // Formato A4 Estándar
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })

  // Encabezado
  doc.setFillColor(30, 41, 59)
  doc.rect(0, 0, 210, 25, 'F')

  let headerTextX = 14
  if (company.logoUrl) {
    try {
      doc.addImage(company.logoUrl, 'JPEG', 12, 3, 22, 19)
      headerTextX = 38
    } catch {
      // Fallback si la imagen no puede procesarse
    }
  }

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(14)
  doc.setTextColor(255, 255, 255)
  doc.text(company.name, headerTextX, 12)

  doc.setFontSize(8)
  doc.setFont('helvetica', 'normal')
  doc.text(`${company.legalName || ''} · NIT: ${company.taxId || ''} · Telf: ${company.phone || ''}`, headerTextX, 18)

  doc.setFontSize(11)
  doc.setFont('helvetica', 'bold')
  doc.text(`GUÍA DE ENCOMIENDA: ${shipment.trackingCode}`, 200, 12, { align: 'right' })
  doc.setFontSize(8)
  doc.text(`[ ${copyLabel} ]`, 200, 18, { align: 'right' })

  doc.setTextColor(15, 23, 42)
  let y = 35

  doc.setFontSize(9)
  doc.setFont('helvetica', 'bold')
  doc.text('DATOS GENERALES DEL ENVÍO', 14, y)
  y += 5

  const generalRows = [
    ['Fecha de Recepción', new Date(shipment.createdAt).toLocaleString('es-BO'), 'Origen', shipment.originCity.toUpperCase()],
    ['Destino', shipment.destinationCity.toUpperCase(), 'Modalidad', shipment.deliveryType === 'home' ? 'Entrega a Domicilio' : 'Retiro en Agencia'],
    ['Estado del Envío', shipment.status.toUpperCase(), 'Operador / Ventanilla', shipment.cashierName],
  ]

  autoTable(doc, {
    startY: y,
    head: [],
    body: generalRows,
    theme: 'plain',
    styles: { fontSize: 8.5, cellPadding: 2 },
    columnStyles: { 0: { fontStyle: 'bold', cellWidth: 35 }, 2: { fontStyle: 'bold', cellWidth: 35 } },
    margin: { left: 14, right: 14 },
  })

  y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 6

  // Remitente y Destinatario
  doc.setFontSize(9)
  doc.setFont('helvetica', 'bold')
  doc.text('REMITENTE Y DESTINATARIO', 14, y)
  y += 4

  const partiesRows = [
    ['Remitente', shipment.sender.name, 'Destinatario', shipment.recipient.name],
    ['Documento', `${shipment.sender.docType}: ${shipment.sender.docNumber || 'S/N'}`, 'Documento', `${shipment.recipient.docType}: ${shipment.recipient.docNumber || 'S/N'}`],
    ['Teléfono', shipment.sender.phone, 'Teléfono', shipment.recipient.phone],
    ['Dirección', shipment.sender.address || '-', 'Dirección Entrega', shipment.deliveryAddress || shipment.destinationCity],
  ]

  autoTable(doc, {
    startY: y,
    head: [],
    body: partiesRows,
    theme: 'grid',
    styles: { fontSize: 8.5, cellPadding: 2.5 },
    columnStyles: { 0: { fontStyle: 'bold', fillColor: [248, 250, 252], cellWidth: 30 }, 2: { fontStyle: 'bold', fillColor: [248, 250, 252], cellWidth: 30 } },
    margin: { left: 14, right: 14 },
  })

  y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 6

  // Contenido declarado
  doc.setFontSize(9)
  doc.setFont('helvetica', 'bold')
  doc.text('CONTENIDO DECLARADO (DECLARACIÓN JURADA DEL REMITENTE)', 14, y)
  y += 4

  const itemRows = shipment.items.map((item, idx) => [
    String(idx + 1),
    item.description,
    item.packaging.toUpperCase(),
    String(item.quantity),
    item.weightKg ? `${item.weightKg} kg` : '-',
    item.isFragile ? 'SÍ (FRÁGIL)' : 'NO',
    item.declaredValue ? `Bs. ${item.declaredValue.toFixed(2)}` : 'S/V',
  ])

  autoTable(doc, {
    startY: y,
    head: [['#', 'Descripción Declarada', 'Embalaje', 'Cant.', 'Peso', 'Frágil', 'Valor Declarado']],
    body: itemRows,
    headStyles: { fillColor: [51, 65, 85], fontSize: 8 },
    styles: { fontSize: 8, cellPadding: 2 },
    margin: { left: 14, right: 14 },
  })

  y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 6

  // Tarifa y cobro
  const timingLabel = shipment.paymentTiming === 'origin_paid' ? 'PAGADO EN ORIGEN' : 'COBRO EN DESTINO (CONTRAENTREGA)'
  const statusLabel = shipment.paymentStatus === 'paid' ? 'CANCELADO / PAGADO' : 'PENDIENTE DE COBRO'

  const paymentRows = [
    ['Modalidad de Pago', timingLabel],
    ['Estado del Cobro', statusLabel],
    ['Tarifa Base de Envío', `Bs. ${shipment.shippingFee.toFixed(2)}`],
    ['Descuento Aplicado', `Bs. ${shipment.discount.toFixed(2)}`],
    ['TOTAL FINAL A COBRAR', `Bs. ${shipment.finalAmount.toFixed(2)}`],
  ]

  autoTable(doc, {
    startY: y,
    body: paymentRows,
    theme: 'grid',
    styles: { fontSize: 8.5, cellPadding: 2.2 },
    columnStyles: { 0: { fontStyle: 'bold', cellWidth: 60 } },
    margin: { left: 14, right: 14 },
  })

  y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8

  // Nota legal obligatoria
  doc.setFontSize(7.5)
  doc.setFont('helvetica', 'italic')
  doc.setTextColor(71, 85, 105)
  const legalNotice = 'Declaración del usuario: El remitente declara bajo fe de juramento que la encomienda no contiene armas, explosivos, drogas, sustancias químicas controladas, dinero en efectivo no declarado ni artículos ilícitos de transporte restringido por la normativa boliviana vigente. La empresa no asume responsabilidad por información falsa declarada por el remitente.'
  doc.text(legalNotice, 14, y, { maxWidth: 182, align: 'justify' })
  y += 18

  // Espacio para firmas
  doc.setDrawColor(100, 116, 139)
  doc.line(25, y, 85, y)
  doc.line(125, y, 185, y)
  y += 4
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  doc.setTextColor(15, 23, 42)
  doc.text('Firma y Aclaración Remitente', 55, y, { align: 'center' })
  doc.text('Firma y Sello Agente Receptor', 155, y, { align: 'center' })

  const blob = doc.output('blob')
  const url = URL.createObjectURL(blob)
  return { blob, url, filename: `Guia-${shipment.trackingCode}-A4.pdf` }
}

/**
 * Genera la constancia oficial de entrega de encomienda con datos del receptor.
 */
export async function generateDeliveryReceiptPdf(
  shipment: ParcelShipment,
  delivery: ParcelDeliveryRecord,
  companyInput: DocumentCompanyContext | Partial<BusinessIdentity> | Partial<BusinessDocumentContext> = DEFAULT_PARCEL_COMPANY
): Promise<{ blob: Blob; url: string; filename: string }> {
  const { jsPDF } = await import('jspdf')
  const { default: autoTable } = await import('jspdf-autotable')

  const company = toDocumentCompanyContext(companyInput)
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })

  // Encabezado
  doc.setFillColor(15, 118, 110) // Verde teal
  doc.rect(0, 0, 210, 25, 'F')

  let headerTextX = 14
  if (company.logoUrl) {
    try {
      doc.addImage(company.logoUrl, 'JPEG', 12, 3, 22, 19)
      headerTextX = 38
    } catch {
      // Fallback
    }
  }

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(14)
  doc.setTextColor(255, 255, 255)
  doc.text(company.name, headerTextX, 12)

  doc.setFontSize(8.5)
  doc.setFont('helvetica', 'normal')
  doc.text('ACTA Y CONSTANCIA OFICIAL DE ENTREGA DE ENCOMIENDA', 14, 18)

  doc.setFontSize(11)
  doc.setFont('helvetica', 'bold')
  doc.text(`GUÍA: ${shipment.trackingCode}`, 200, 15, { align: 'right' })

  doc.setTextColor(15, 23, 42)
  let y = 35

  const deliveryData = [
    ['Fecha y Hora de Entrega', new Date(delivery.deliveredAt).toLocaleString('es-BO')],
    ['Agencia de Destino', shipment.destinationCity.toUpperCase()],
    ['Entregado por (Operador)', `${delivery.deliveredByName} (UID: ${delivery.deliveredByUid})`],
    ['Persona que Recibe', delivery.receivedByName],
    ['Documento de Identidad', delivery.receivedByDoc],
    ['Relación con Destinatario', delivery.recipientRelationship.toUpperCase()],
    ['Contenido Entregado', `${shipment.packageCount} bulto(s) · ${shipment.declaredSummary}`],
    ['Cobro en Destino', shipment.paymentTiming === 'destination_cod' ? `Bs. ${shipment.finalAmount.toFixed(2)} (PAGADO)` : 'Previamente cancelado en origen'],
    ['Observaciones', delivery.deliveryNotes || 'Entrega realizada en perfecto estado y conformidad.'],
  ]

  autoTable(doc, {
    startY: y,
    head: [['Detalle de Conformidad de Entrega', 'Información Verificada']],
    body: deliveryData,
    headStyles: { fillColor: [15, 118, 110], fontSize: 9 },
    styles: { fontSize: 8.5, cellPadding: 3 },
    columnStyles: { 0: { fontStyle: 'bold', cellWidth: 60 } },
    margin: { left: 14, right: 14 },
  })

  y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 14

  doc.setFontSize(8)
  doc.setFont('helvetica', 'italic')
  doc.text('Constancia: El receptor certifica haber recibido a entera satisfacción el contenido declarado correspondiente a la guía arriba indicada.', 14, y, { maxWidth: 182 })
  y += 24

  if (delivery.signatureCaptured && delivery.signatureCaptured.startsWith('data:image/')) {
    try {
      doc.addImage(delivery.signatureCaptured, 'PNG', 35, y - 22, 50, 18)
    } catch {
      // Si la imagen falla o formato no soportado, la línea impresa siempre está disponible
    }
  }

  doc.line(30, y, 90, y)
  doc.line(120, y, 180, y)
  y += 4
  doc.setFont('helvetica', 'bold')
  doc.text(
    delivery.signatureCaptured ? 'Firma en Pantalla Registrada' : 'Firma de Quien Recibe',
    60,
    y,
    { align: 'center' }
  )
  doc.text('Firma Operador de Entrega', 150, y, { align: 'center' })

  const blob = doc.output('blob')
  const url = URL.createObjectURL(blob)
  return { blob, url, filename: `Entrega-${shipment.trackingCode}.pdf` }
}

/**
 * Genera el recibo oficial de mensualidad o cuota sindical.
 */
export async function generateUnionDueReceiptPdf(
  due: UnionMonthlyDue,
  payment: UnionDuePayment,
  companyInput: DocumentCompanyContext | Partial<BusinessIdentity> | Partial<BusinessDocumentContext> = DEFAULT_PARCEL_COMPANY
): Promise<{ blob: Blob; url: string; filename: string }> {
  const { jsPDF } = await import('jspdf')
  const { default: autoTable } = await import('jspdf-autotable')

  const company = toDocumentCompanyContext(companyInput)
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: [140, 210] }) // Media carta

  doc.setFillColor(30, 41, 59)
  doc.rect(0, 0, 140, 20, 'F')

  if (company.logoUrl) {
    try {
      doc.addImage(company.logoUrl, 'JPEG', 6, 2, 18, 16)
    } catch {
      // Fallback
    }
  }

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10.5)
  doc.setTextColor(255, 255, 255)
  doc.text(company.legalName || company.name, 76, 9, { align: 'center', maxWidth: 115 })

  doc.setFontSize(8)
  doc.setFont('helvetica', 'normal')
  doc.text(`COMPROBANTE DE PAGO DE CUOTA SOCIAL · N° ${payment.receiptNumber}`, 70, 15, { align: 'center' })

  doc.setTextColor(15, 23, 42)
  let y = 28

  const data = [
    ['Socio / Afiliado', `${due.memberName} (N° ${due.memberNumber})`],
    ['Período Correspondiente', due.periodLabel],
    ['Fecha del Pago', new Date(payment.date).toLocaleString('es-BO')],
    ['Método de Pago', payment.paymentMethod.toUpperCase()],
    ['Monto Abonado', `Bs. ${payment.amount.toFixed(2)}`],
    ['Total de la Cuota', `Bs. ${due.amount.toFixed(2)}`],
    ['Saldo Pendiente', `Bs. ${due.balance.toFixed(2)}`],
    ['Estado de la Obligación', due.balance <= 0 ? 'AL DÍA (CANCELADO)' : 'PAGO PARCIAL'],
    ['Cajero / Responsable', payment.cashierName],
  ]

  autoTable(doc, {
    startY: y,
    body: data,
    theme: 'grid',
    styles: { fontSize: 8, cellPadding: 2.5 },
    columnStyles: { 0: { fontStyle: 'bold', cellWidth: 45, fillColor: [248, 250, 252] } },
    margin: { left: 10, right: 10 },
  })

  y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 16

  doc.setDrawColor(100, 116, 139)
  doc.line(18, y, 58, y)
  doc.line(82, y, 122, y)
  y += 4
  doc.setFontSize(7.5)
  doc.setFont('helvetica', 'bold')
  doc.text('Firma del Socio', 38, y, { align: 'center' })
  doc.text('Secretaría de Hacienda / Caja', 102, y, { align: 'center' })

  const blob = doc.output('blob')
  const url = URL.createObjectURL(blob)
  return { blob, url, filename: `Recibo-Cuota-${payment.receiptNumber}.pdf` }
}

/**
 * Genera el Manifiesto de Despacho de Carga / Encomiendas entre agencias en PDF.
 */
export async function generateManifestPdf(
  manifest: DispatchManifest,
  shipments: ParcelShipment[],
  companyInput: DocumentCompanyContext | Partial<BusinessIdentity> | Partial<BusinessDocumentContext> = DEFAULT_PARCEL_COMPANY
): Promise<{ blob: Blob; url: string; filename: string }> {
  const { jsPDF } = await import('jspdf')
  const { default: autoTable } = await import('jspdf-autotable')

  const company = toDocumentCompanyContext(companyInput)
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })

  doc.setFillColor(30, 41, 59)
  doc.rect(0, 0, 297, 22, 'F')

  let headerTextX = 14
  if (company.logoUrl) {
    try {
      doc.addImage(company.logoUrl, 'JPEG', 12, 2, 20, 18)
      headerTextX = 36
    } catch {
      // Fallback
    }
  }

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(13)
  doc.setTextColor(255, 255, 255)
  doc.text(company.name, headerTextX, 11)

  doc.setFontSize(8)
  doc.setFont('helvetica', 'normal')
  doc.text('MANIFIESTO DE DESPACHO INTERDEPARTAMENTAL DE ENCOMIENDAS', 14, 17)

  doc.setFontSize(12)
  doc.setFont('helvetica', 'bold')
  doc.text(`MANIFIESTO: ${manifest.manifestNumber}`, 283, 13, { align: 'right' })

  doc.setTextColor(15, 23, 42)
  let y = 30

  const summary = [
    ['Fecha de Salida', new Date(manifest.createdAt).toLocaleString('es-BO'), 'Destino', manifest.destinationCity.toUpperCase()],
    ['Conductor / Responsable', manifest.driverOrResponsible, 'Placa de Vehículo', manifest.vehiclePlate || 'S/P'],
    ['Total Encomiendas', `${manifest.parcelIds.length} guías`, 'Total Bultos / Peso', `${manifest.totalPackages} bultos · ${manifest.totalWeightKg} kg`],
  ]

  autoTable(doc, {
    startY: y,
    body: summary,
    theme: 'plain',
    styles: { fontSize: 8.5, cellPadding: 1.5 },
    columnStyles: { 0: { fontStyle: 'bold', cellWidth: 45 }, 2: { fontStyle: 'bold', cellWidth: 45 } },
    margin: { left: 14, right: 14 },
  })

  y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 4

  const manifestShipments = shipments.filter(s => manifest.parcelIds.includes(s.id))
  const tableRows = manifestShipments.map((s, idx) => [
    String(idx + 1),
    s.trackingCode,
    s.sender.name,
    s.recipient.name,
    s.recipient.phone,
    s.declaredSummary,
    String(s.packageCount),
    s.totalWeightKg ? `${s.totalWeightKg} kg` : '-',
    s.paymentTiming === 'origin_paid' ? 'PAGADO ORIGEN' : `DESTINO (Bs ${s.finalAmount})`,
  ])

  autoTable(doc, {
    startY: y,
    head: [['#', 'Guía', 'Remitente', 'Destinatario', 'Teléfono', 'Contenido Declarado', 'Bultos', 'Peso', 'Cobro']],
    body: tableRows,
    headStyles: { fillColor: [51, 65, 85], fontSize: 8 },
    styles: { fontSize: 7.5, cellPadding: 2 },
    margin: { left: 14, right: 14 },
  })

  y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 14

  doc.line(30, y, 90, y)
  doc.line(120, y, 180, y)
  doc.line(210, y, 270, y)
  y += 4
  doc.setFontSize(8)
  doc.setFont('helvetica', 'bold')
  doc.text('Despachado por (Agencia Origen)', 60, y, { align: 'center' })
  doc.text('Transportista / Chofer', 150, y, { align: 'center' })
  doc.text('Recibido por (Agencia Destino)', 240, y, { align: 'center' })

  const blob = doc.output('blob')
  const url = URL.createObjectURL(blob)
  return { blob, url, filename: `Manifiesto-${manifest.manifestNumber}.pdf` }
}

/**
 * Reporte consolidado financiero y operativo en PDF.
 */
export async function generateOperationalReportPdf(params: {
  title: string
  subtitle: string
  headers: string[]
  rows: (string | number)[][]
  summaryLines?: string[]
  company?: DocumentCompanyContext | Partial<BusinessIdentity> | Partial<BusinessDocumentContext>
}): Promise<{ blob: Blob; url: string; filename: string }> {
  const { jsPDF } = await import('jspdf')
  const { default: autoTable } = await import('jspdf-autotable')

  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
  const company = toDocumentCompanyContext(params.company)

  doc.setFillColor(30, 41, 59)
  doc.rect(0, 0, 297, 22, 'F')

  let headerTextX = 14
  if (company.logoUrl) {
    try {
      doc.addImage(company.logoUrl, 'JPEG', 12, 2, 20, 18)
      headerTextX = 36
    } catch {
      // Fallback
    }
  }

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(13)
  doc.setTextColor(255, 255, 255)
  doc.text(company.name, headerTextX, 11)

  doc.setFontSize(8)
  doc.setFont('helvetica', 'normal')
  doc.text(`${params.title.toUpperCase()} · ${params.subtitle}`, headerTextX, 17)

  doc.setFontSize(8)
  doc.text(`Generado: ${new Date().toLocaleString('es-BO')}`, 283, 14, { align: 'right' })

  doc.setTextColor(15, 23, 42)
  let y = 30

  if (params.summaryLines && params.summaryLines.length > 0) {
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8.5)
    doc.text('RESUMEN:', 14, y)
    y += 4
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    for (const line of params.summaryLines) {
      doc.text(line, 14, y)
      y += 4
    }
    y += 2
  }

  autoTable(doc, {
    startY: y,
    head: [params.headers],
    body: params.rows.map(r => r.map(v => String(v))),
    headStyles: { fillColor: [51, 65, 85], fontSize: 8 },
    styles: { fontSize: 7.5, cellPadding: 2 },
    margin: { left: 14, right: 14 },
    didDrawPage: () => {
      doc.setFontSize(8)
      doc.text(`Página ${doc.getNumberOfPages()}`, 280, 202, { align: 'right' })
    },
  })

  const blob = doc.output('blob')
  const url = URL.createObjectURL(blob)
  return { blob, url, filename: `${params.title.toLowerCase().replace(/\s+/g, '-')}.pdf` }
}
