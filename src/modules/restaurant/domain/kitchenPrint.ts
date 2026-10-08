import type { Order, OrderItem } from '../../../types'

const escapeHtml = (value: string | number) => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;')

export type KitchenTicketKind = 'new' | 'addition' | 'cancellation' | 'reprint'

export type KitchenTicketJobStatus = 'pending' | 'sent' | 'agent_confirmed' | 'error' | 'retry'

export interface KitchenTicketJob {
  id: string
  idempotencyKey: string
  orderId: string
  batchId: string
  sequence: number
  kind: KitchenTicketKind
  status: KitchenTicketJobStatus
  text: string
  createdAt: string
  sentAt?: string
  confirmedAt?: string
  error?: string
  retries: number
  createdBy: string
}

export interface KitchenTicketTextInput {
  order: Order
  sequence: number
  lines: OrderItem[]
  createdAt: string
  kind?: KitchenTicketKind
  businessName?: string
}

const orderTypeLabel = (order: Order) => {
  if (order.fulfillmentType === 'table') return order.tableInfo || 'MESA'
  if (order.fulfillmentType === 'delivery') return 'DELIVERY'
  return 'PARA LLEVAR'
}

/**
 * Texto plano intencionalmente simple: sirve para ESC/POS, un agente local y el
 * fallback de impresión del navegador. No contiene importes ni datos de pago.
 */
export function buildKitchenTicketText({ order, sequence, lines, createdAt, kind = 'new', businessName }: KitchenTicketTextInput) {
  const stamp = new Date(createdAt)
  const headline = kind === 'addition' ? 'ADICION' : kind === 'cancellation' ? 'CANCELACION' : kind === 'reprint' ? 'REIMPRESION' : 'COCINA'
  const header = [
    headline,
    '-'.repeat(32),
    businessName?.trim(),
    `PEDIDO #${order.displayNumber || order.sequence}-${sequence}`,
    `HORA ${stamp.toLocaleTimeString('es-BO', { hour: '2-digit', minute: '2-digit' })}`,
    orderTypeLabel(order),
    order.customerName && order.customerName !== 'Cliente' ? `CLIENTE: ${order.customerName}` : undefined,
    '-'.repeat(32),
  ].filter(Boolean)
  const items = lines.flatMap((line) => [
    `${line.quantity}x ${line.name}`,
    line.modifiers?.note ? `  OBS: ${line.modifiers.note}` : undefined,
  ].filter(Boolean) as string[])
  return [...header, ...items, '', '-'.repeat(32), ''].join('\n')
}

export function buildKitchenTicketPrintDocument(text: string, paperWidth: '58mm' | '80mm' = '80mm') {
  const width = paperWidth === '58mm' ? '48mm' : '70mm'
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Comanda de cocina</title><style>@page{size:${paperWidth} auto;margin:4mm}body{width:${width};margin:0 auto;color:#000;font:12px/1.35 ui-monospace,SFMono-Regular,Menlo,monospace;white-space:pre-wrap}@media print{body{width:auto}}</style></head><body>${escapeHtml(text)}</body></html>`
}

export function buildKitchenBatchPrintDocument(order: Order, tableName: string, sequence: number, lines: OrderItem[], printedAt: string) {
  const areas = [...new Set(lines.map(line => line.productArea || 'Cocina'))]
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Comanda ${escapeHtml(order.displayNumber)}-${sequence}</title><style>
  @page{size:80mm auto;margin:5mm}body{width:70mm;margin:0 auto;font:12px/1.4 Arial,sans-serif;color:#111827}h1{font-size:18px;margin:0}h2{font-size:13px;margin:0 0 6px}header,section{border-bottom:1px dashed #64748b;padding:7px 0}p{margin:2px 0}.item{display:flex;gap:8px;margin:6px 0}.qty{font-weight:700;min-width:22px}.note{font-size:10px;margin-left:30px}.small{font-size:10px;color:#475569}@media print{body{width:auto}}
  </style></head><body><header><h1>COMANDA #${escapeHtml(order.displayNumber)}-${sequence}</h1><p>${escapeHtml(tableName)}</p><p class="small">${escapeHtml(new Date(printedAt).toLocaleString('es-BO'))}</p></header>${areas.map(area => `<section><h2>${escapeHtml(area)}</h2>${lines.filter(line => (line.productArea || 'Cocina') === area).map(line => `<div class="item"><span class="qty">${escapeHtml(line.quantity)}×</span><span>${escapeHtml(line.name)}</span></div>${line.modifiers?.note ? `<p class="note">Obs.: ${escapeHtml(line.modifiers.note)}</p>` : ''}`).join('')}</section>`).join('')}</body></html>`
}
