import type { CashMovement, CashShiftSummary } from './cashEngine'

const escapeHtml = (value: string | number) => String(value)
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#039;')

const money = (amount: number) => `Bs ${amount.toLocaleString('es-BO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const dateTime = (value: string) => new Date(value).toLocaleString('es-BO', { dateStyle: 'short', timeStyle: 'short' })
const paymentMethod: Record<CashMovement['paymentMethod'], string> = { cash: 'Efectivo', qr: 'QR', card: 'Tarjeta', other: 'Otro' }
const category: Record<CashMovement['category'], string> = { supply_purchase: 'Compra de insumos', worker_payment: 'Pago a trabajador', supplier_payment: 'Pago a proveedor', transport: 'Transporte', maintenance: 'Mantenimiento', services: 'Servicios', additional_cash: 'Ingreso adicional', change_replenishment: 'Reposición de cambio', other: 'Otros' }

export function buildCashClosurePrintDocument(input: {
  restaurantName: string
  openedAt: string
  openedBy: string
  printedAt: string
  openingFloat: number
  summary: CashShiftSummary
  countedCash?: number
  difference: number | null
  movements: CashMovement[]
}) {
  const status = input.difference === null ? 'ARQUEO PRELIMINAR' : input.difference === 0 ? 'CAJA CUADRADA' : input.difference < 0 ? 'FALTANTE' : 'SOBRANTE'
  const rows = input.movements.length ? input.movements.map(item => `<tr><td>${escapeHtml(new Date(item.createdAt).toLocaleTimeString('es-BO', { hour: '2-digit', minute: '2-digit' }))}</td><td>${escapeHtml(item.type === 'income' ? 'Entrada' : 'Salida')}</td><td>${escapeHtml(category[item.category])}<br><small>${escapeHtml(item.description)}</small></td><td>${escapeHtml(paymentMethod[item.paymentMethod])}</td><td class="amount">${item.type === 'income' ? '+' : '-'}${escapeHtml(money(item.amount))}</td></tr>`).join('') : '<tr><td colspan="5">Sin movimientos manuales</td></tr>'
  const counted = input.countedCash === undefined ? 'Pendiente' : money(input.countedCash)
  const difference = input.difference === null ? 'Pendiente' : money(input.difference)

  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Arqueo de caja</title><style>
    @page { size: 80mm auto; margin: 6mm; } * { box-sizing: border-box; } body { width: 68mm; margin: 0 auto; color: #0f172a; font: 11px/1.35 Arial, sans-serif; } h1,h2,p { margin: 0; } header { text-align: center; border-bottom: 1px dashed #64748b; padding-bottom: 8px; } h1 { font-size: 16px; } h2 { font-size: 12px; margin-top: 3px; } .muted { color:#475569; font-size: 10px; } section { border-bottom: 1px dashed #94a3b8; padding: 8px 0; } .title { font-size: 10px; font-weight: 700; letter-spacing: .04em; margin-bottom: 4px; } .line { display:flex; justify-content:space-between; gap: 6px; margin: 2px 0; } .total { font-weight: 700; font-size: 13px; margin-top: 5px; } .status { text-align:center; font-weight:700; padding:6px; border:1px solid #0f172a; margin-top:7px; } table { border-collapse: collapse; width:100%; font-size:9px; } th,td { border-bottom: 1px solid #cbd5e1; padding: 3px 1px; text-align:left; vertical-align:top; } th { font-size:8px; text-transform:uppercase; } .amount { text-align:right; white-space:nowrap; } small { color:#475569; } footer { padding-top:8px; text-align:center; font-size:9px; } @media print { body { width:auto; } }
  </style></head><body><header><h1>${escapeHtml(input.restaurantName)}</h1><h2>ARQUEO Y MOVIMIENTO DE CAJA</h2><p class="muted">Impreso: ${escapeHtml(dateTime(input.printedAt))}</p></header>
  <section><div class="line"><span>Apertura</span><strong>${escapeHtml(dateTime(input.openedAt))}</strong></div><div class="line"><span>Responsable</span><strong>${escapeHtml(input.openedBy)}</strong></div></section>
  <section><p class="title">VENTAS DEL TURNO</p><div class="line"><span>Ventas efectivo</span><strong>${escapeHtml(money(input.summary.cashSales))}</strong></div><div class="line"><span>Ventas QR</span><strong>${escapeHtml(money(input.summary.qrSales))}</strong></div><div class="line"><span>Ventas tarjeta</span><strong>${escapeHtml(money(input.summary.cardSales))}</strong></div><div class="line total"><span>TOTAL VENDIDO</span><span>${escapeHtml(money(input.summary.totalSales))}</span></div></section>
  <section><p class="title">EFECTIVO FÍSICO</p><div class="line"><span>Fondo inicial</span><strong>${escapeHtml(money(input.openingFloat))}</strong></div><div class="line"><span>Entradas efectivo</span><strong>${escapeHtml(money(input.summary.cashIncome))}</strong></div><div class="line"><span>Salidas efectivo</span><strong>${escapeHtml(money(input.summary.cashOutflow))}</strong></div><div class="line total"><span>EFECTIVO ESPERADO</span><span>${escapeHtml(money(input.summary.expectedCash))}</span></div><div class="line"><span>Efectivo contado</span><strong>${escapeHtml(counted)}</strong></div><div class="line"><span>Diferencia</span><strong>${escapeHtml(difference)}</strong></div><p class="status">${status}</p></section>
  <section><p class="title">MOVIMIENTOS MANUALES</p><table><thead><tr><th>Hora</th><th>Tipo</th><th>Concepto</th><th>Medio</th><th class="amount">Monto</th></tr></thead><tbody>${rows}</tbody></table></section><footer>Documento interno de control de caja</footer></body></html>`
}
