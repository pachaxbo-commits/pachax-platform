import { Calendar } from 'lucide-react'
import type { Order } from '../../types'
import type { RestaurantShift } from '../../modules/restaurant/views/RestaurantExperience'
import type { InventoryMovement } from '../../modules/restaurant/domain/inventoryEngine'
import { calculateCashShiftSummary } from '../../modules/restaurant/domain/cashEngine'

const money = (value: number) => `Bs ${value.toLocaleString('es-BO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

export function RestaurantReports({ orders, shift, stockMovements = [] }: { orders: Order[]; shift: RestaurantShift | null; stockMovements?: InventoryMovement[] }) {
  const sales = orders.filter(order => order.paymentStatus === 'paid' && order.status !== 'cancelled' && (!shift || order.shiftId === shift.id))
  const summary = calculateCashShiftSummary(0, shift ? sales : sales.map(order => ({ ...order, shiftId: '__all__' })), shift?.id || '__all__', [])
  const byProduct = new Map<string, { name: string; count: number; total: number }>()
  for (const order of sales) for (const item of order.items) {
    const key = item.productId || item.id
    const previous = byProduct.get(key)
    byProduct.set(key, { name: item.name, count: (previous?.count || 0) + item.quantity, total: (previous?.total || 0) + item.lineTotal })
  }
  const top = [...byProduct.values()].sort((a, b) => b.count - a.count).slice(0, 5)
  const max = top[0]?.count || 1
  const inventory = new Map<string, { name: string; sold: number; returned: number; other: number }>()
  for (const movement of stockMovements.filter(item => !shift || item.shiftId === shift.id)) {
    const row = inventory.get(movement.productId) || { name: movement.productName || movement.productId, sold: 0, returned: 0, other: 0 }
    if (movement.type === 'sale' || movement.type === 'command_consumption') row.sold += -movement.quantityBase
    else if (movement.type === 'cancellation_return') row.returned += movement.quantityBase
    else if (['waste', 'loss', 'courtesy', 'internal_consumption'].includes(movement.type)) row.other += -movement.quantityBase
    inventory.set(movement.productId, row)
  }
  return <div className="space-y-6">
    <header className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-2xl font-bold text-slate-900">Reportes de Salón & Ventas</h1><p className="text-sm text-slate-500">Ventas cobradas y consumo de inventario del {shift ? 'turno activo' : 'historial disponible'}.</p></div><span className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold"><Calendar size={16} /> {shift ? new Date(shift.openedAt).toLocaleDateString('es-BO') : 'Todos los turnos'}</span></header>
    <div className="grid gap-4 sm:grid-cols-3"><Card label="Total vendido" value={money(summary.totalSales)} /><Card label="Ventas efectivo" value={money(summary.cashSales)} /><Card label="Ventas QR / tarjeta" value={money(summary.qrSales + summary.cardSales)} /></div>
    <section className="rounded-2xl border border-slate-200 bg-white p-5"><h2 className="mb-4 font-bold">Productos más vendidos</h2>{top.length ? <div className="space-y-3">{top.map(item => <div key={item.name}><div className="flex justify-between gap-2 text-xs font-semibold"><span>{item.name}</span><span>{item.count} · {money(item.total)}</span></div><div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-teal-600" style={{ width: `${item.count / max * 100}%` }} /></div></div>)}</div> : <p className="text-sm text-slate-500">Aún no hay ventas cobradas para mostrar.</p>}</section>
    <section className="rounded-2xl border border-slate-200 bg-white p-5"><h2 className="mb-3 font-bold">Consumo de inventario</h2><p className="mb-3 text-xs text-slate-500">Se registra al confirmar el pedido, aunque la cuenta siga abierta. Las cantidades conservan la unidad base de cada insumo.</p>{inventory.size ? <div className="overflow-x-auto"><table className="w-full min-w-[500px] text-left text-sm"><thead><tr className="border-b text-xs uppercase text-slate-500"><th className="p-2">Insumo</th><th className="p-2 text-right">Venta</th><th className="p-2 text-right">Devolución</th><th className="p-2 text-right">Otras salidas</th></tr></thead><tbody>{[...inventory].map(([id, row]) => <tr key={id} className="border-b"><td className="p-2 font-semibold">{row.name}</td><td className="p-2 text-right">{row.sold}</td><td className="p-2 text-right">{row.returned}</td><td className="p-2 text-right">{row.other}</td></tr>)}</tbody></table></div> : <p className="text-sm text-slate-500">Aún no hay consumo registrado.</p>}</section>
  </div>
}

function Card({ label, value }: { label: string; value: string }) { return <div className="rounded-2xl border border-slate-200 bg-white p-5"><p className="text-xs font-semibold uppercase text-slate-500">{label}</p><strong className="mt-1 block text-2xl text-slate-900">{value}</strong></div> }
