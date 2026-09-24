import type { Order, OrderItem } from '../../../types'

const escapeHtml = (value: string | number) => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;')

export function buildKitchenBatchPrintDocument(order: Order, tableName: string, sequence: number, lines: OrderItem[], printedAt: string) {
  const areas = [...new Set(lines.map(line => line.productArea || 'Cocina'))]
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Comanda ${escapeHtml(order.displayNumber)}-${sequence}</title><style>
  @page{size:80mm auto;margin:5mm}body{width:70mm;margin:0 auto;font:12px/1.4 Arial,sans-serif;color:#111827}h1{font-size:18px;margin:0}h2{font-size:13px;margin:0 0 6px}header,section{border-bottom:1px dashed #64748b;padding:7px 0}p{margin:2px 0}.item{display:flex;gap:8px;margin:6px 0}.qty{font-weight:700;min-width:22px}.note{font-size:10px;margin-left:30px}.small{font-size:10px;color:#475569}@media print{body{width:auto}}
  </style></head><body><header><h1>COMANDA #${escapeHtml(order.displayNumber)}-${sequence}</h1><p>${escapeHtml(tableName)}</p><p class="small">${escapeHtml(new Date(printedAt).toLocaleString('es-BO'))}</p></header>${areas.map(area => `<section><h2>${escapeHtml(area)}</h2>${lines.filter(line => (line.productArea || 'Cocina') === area).map(line => `<div class="item"><span class="qty">${escapeHtml(line.quantity)}×</span><span>${escapeHtml(line.name)}</span></div>${line.modifiers?.note ? `<p class="note">Obs.: ${escapeHtml(line.modifiers.note)}</p>` : ''}`).join('')}</section>`).join('')}</body></html>`
}
