import { useState } from 'react'
import { DollarSign, Users, ChefHat, X, Clock, Wallet } from 'lucide-react'
import type { Order } from '../../types'
import type { RestaurantTable } from '../mocks/restaurantMock'
import { visibleTables } from '../../modules/restaurant/domain/restaurantFloor'

type Shift = { id: string; openedAt: string; openedBy: string; openingFloat: number; closedAt?: string; expectedCashAtClose?: number }
const fmt = (amount: number) => `Bs ${amount.toLocaleString('es-BO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const date = (value: string) => new Date(value).toLocaleString('es-BO', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })

export function RestaurantDashboard({ orders, tables, shift, userName, onStartShift, onCloseShift, onNavigate, onOpenTable }: { orders: Order[]; tables: RestaurantTable[]; shift: Shift | null; userName: string; onStartShift: (amount: number, openedAt: string, openedBy: string) => void | Promise<void>; onCloseShift: () => boolean | Promise<boolean>; onNavigate: (module: string) => void; onOpenTable: (table: RestaurantTable) => void }) {
  const [opening, setOpening] = useState(false)
  const [closing, setClosing] = useState(false)
  const [isStarting, setIsStarting] = useState(false)
  const [isClosing, setIsClosing] = useState(false)
  const [floatInput, setFloatInput] = useState('')
  const [cashier, setCashier] = useState(userName)
  const [error, setError] = useState('')
  const activeOrders = orders.filter((order) => order.paymentStatus !== 'paid' && order.status !== 'cancelled')
  const activeTables = visibleTables(tables)
  const occupiedTables = activeTables.filter((table) => table.status === 'occupied' || table.status === 'bill_requested')
  const sales = orders.filter((order) => order.shiftId === shift?.id && order.paymentStatus === 'paid')
  const totalSales = sales.reduce((sum, order) => sum + (order.total || 0), 0)
  const cashSales = sales.reduce((sum, order) => sum + (order.payment?.cashAmount || 0), 0)
  const otherSales = totalSales - cashSales
  const openedAccounts = tables.filter((table) => table.activeOrderId && table.status !== 'available')
  const metricsOrders = shift ? orders.filter((order) => order.shiftId === shift.id) : []

  const start = async () => {
    const amount = Number(floatInput)
    if (!Number.isFinite(amount) || amount < 0 || !cashier.trim() || isStarting) return
    setIsStarting(true)
    try {
      await onStartShift(amount, new Date().toISOString(), cashier.trim())
      setOpening(false)
    } finally {
      setIsStarting(false)
    }
  }
  const close = async () => {
    if (openedAccounts.length || isClosing) { setError('No puedes cerrar el turno mientras existan cuentas abiertas.'); return }
    setIsClosing(true)
    try {
      const ok = await onCloseShift()
      if (ok) {
        setClosing(false)
        setError('')
      } else {
        setError('No se pudo cerrar el turno.')
      }
    } finally {
      setIsClosing(false)
    }
  }

  return (
    <div className="space-y-5">
      {/* Encabezado operativo del turno */}
      <div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-xs flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <span className={`inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-0.5 rounded-full ${shift ? 'text-emerald-800 bg-emerald-50 border border-emerald-200' : 'text-amber-800 bg-amber-50 border border-amber-200'}`}>
              <span className={`h-2 w-2 rounded-full ${shift ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'}`} />
              {shift ? 'Turno en curso' : 'Turno cerrado'}
            </span>
            {shift && (
              <span className="text-xs text-slate-500 font-medium hidden sm:inline">
                Apertura: {date(shift.openedAt)} · {shift.openedBy}
              </span>
            )}
          </div>
          <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">Supervisión de Salón</h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">Control en vivo de mesas, comandas en preparación y caja.</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {shift ? (
            <>
              <button
                type="button"
                onClick={() => onNavigate('pos')}
                className="inline-flex items-center gap-1.5 px-4 py-2.5 text-xs font-bold rounded-xl text-white shadow-xs transition hover:opacity-95"
                style={{ backgroundColor: 'var(--primary)' }}
              >
                Nuevo pedido POS
              </button>
              <button
                type="button"
                onClick={() => onNavigate('cash')}
                className="inline-flex items-center gap-1.5 px-3.5 py-2.5 text-xs font-bold rounded-xl border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 transition"
              >
                Arqueo de caja
              </button>
              <button
                type="button"
                onClick={() => onNavigate('tables')}
                className="inline-flex items-center gap-1.5 px-3.5 py-2.5 text-xs font-bold rounded-xl border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 transition"
              >
                Salón ({occupiedTables.length}/{activeTables.length})
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => { setCashier(userName); setOpening(true) }}
              className="inline-flex items-center gap-2 px-5 py-3 text-sm font-extrabold rounded-xl shadow-xs transition hover:opacity-95"
              style={{ backgroundColor: 'var(--primary)', color: 'var(--primary-foreground)' }}
            >
              <Wallet size={16} />
              INICIAR TURNO
            </button>
          )}
        </div>
      </div>

      {!shift && (
        <div className="flex items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50/80 p-4 text-sm text-amber-900 shadow-xs">
          <Clock className="h-5 w-5 shrink-0 text-amber-700" />
          <div>
            <strong className="block font-bold">Turno no iniciado</strong>
            <span className="text-xs text-amber-800">Inicia el turno para habilitar la apertura de mesas, comandas y ventas en salón.</span>
          </div>
        </div>
      )}

      {/* Métricas clave operativas */}
      {shift && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          <Metric
            icon={<DollarSign className="w-4 h-4 text-emerald-600" />}
            title="Ventas del turno"
            value={fmt(totalSales)}
            detail={`${sales.length} comandas cobradas`}
          />
          <Metric
            icon={<Wallet className="w-4 h-4 text-teal-700" />}
            title="Efectivo en caja"
            value={fmt(cashSales)}
            detail={`${fmt(otherSales)} en QR/tarjeta`}
          />
          <Metric
            icon={<ChefHat className="w-4 h-4 text-amber-600" />}
            title="Comandas activas"
            value={String(activeOrders.length)}
            detail={`${metricsOrders.filter((order) => order.status === 'preparing').length} en preparación`}
          />
          <Metric
            icon={<Users className="w-4 h-4 text-blue-600" />}
            title="Mesas ocupadas"
            value={`${occupiedTables.length} / ${activeTables.length}`}
            detail={`${activeTables.filter((table) => table.status === 'bill_requested').length} pidiendo cuenta`}
          />
        </div>
      )}

      {/* Salón y Comandas en paralelo */}
      {shift && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          {/* Columna Izquierda: Salón en tiempo real */}
          <section className="lg:col-span-5 bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex flex-col">
            <div className="flex items-center justify-between mb-3.5">
              <div>
                <h2 className="text-base font-extrabold text-slate-900">Salón & Mesas</h2>
                <p className="text-xs text-slate-500">Toca para abrir o ver cuenta</p>
              </div>
              <button
                type="button"
                onClick={() => onNavigate('tables')}
                className="text-xs font-bold text-slate-600 hover:text-slate-900"
              >
                Ver plano completo →
              </button>
            </div>

            {activeTables.length === 0 ? (
              <div className="flex flex-col items-center justify-center p-6 text-center border border-dashed border-slate-200 rounded-xl my-auto">
                <p className="text-xs font-semibold text-slate-600 mb-2">Aún no tienes mesas configuradas en tu salón.</p>
                <button
                  type="button"
                  onClick={() => onNavigate('tables')}
                  className="rounded-xl bg-slate-900 px-3 py-2 text-xs font-bold text-white shadow-xs"
                >
                  Configurar salón y mesas
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-2.5 flex-1 content-start">
                {activeTables.map((table) => {
                  const bill = table.status === 'bill_requested'
                  const occupied = table.status === 'occupied'
                  const reserved = table.status === 'reserved'
                  return (
                    <button
                      key={table.id}
                      type="button"
                      onClick={() => onOpenTable(table)}
                      className={`p-3 rounded-xl border text-center transition cursor-pointer flex flex-col justify-between min-h-[76px] ${
                        bill
                          ? 'bg-amber-50/90 border-amber-300 text-amber-900 hover:bg-amber-100/70 ring-1 ring-amber-300/60'
                          : occupied
                          ? 'bg-blue-50/80 border-blue-200 text-blue-900 hover:bg-blue-100/60'
                          : reserved
                          ? 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                          : 'bg-emerald-50/40 border-emerald-200 text-emerald-900 hover:bg-emerald-50/80'
                      }`}
                    >
                      <div className="text-xs font-extrabold truncate">{table.name}</div>
                      <div className="text-[10px] font-bold mt-1">
                        {bill ? (
                          <span className="text-amber-800">Cuenta pedida</span>
                        ) : occupied ? (
                          <span className="text-blue-800">{table.diners || 2} personas</span>
                        ) : reserved ? (
                          <span className="text-slate-500">Reserva</span>
                        ) : (
                          <span className="text-emerald-700">Libre</span>
                        )}
                      </div>
                    </button>
                  )
                })}
              </div>
            )}
          </section>

          {/* Columna Derecha: Comandas activas en cocina & salón */}
          <section className="lg:col-span-7 bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex flex-col">
            <div className="flex items-center justify-between mb-3.5">
              <div>
                <h2 className="text-base font-extrabold text-slate-900">Comandas en Curso</h2>
                <p className="text-xs text-slate-500">Pedidos activos en preparación y servicio</p>
              </div>
              <button
                type="button"
                onClick={() => onNavigate('orders')}
                className="text-xs font-bold text-slate-600 hover:text-slate-900"
              >
                Ver todas ({activeOrders.length}) →
              </button>
            </div>

            <div className="space-y-2.5 flex-1">
              {activeOrders.slice(0, 6).map((order) => (
                <button
                  key={order.id}
                  type="button"
                  onClick={() => onNavigate('orders')}
                  className="w-full p-3 rounded-xl border border-slate-200/90 flex items-center justify-between text-left hover:bg-slate-50/80 transition"
                >
                  <span className="flex items-center gap-3 min-w-0">
                    <span className="w-9 h-9 rounded-xl bg-slate-900 text-white font-extrabold text-xs flex items-center justify-center shrink-0">
                      #{order.displayNumber}
                    </span>
                    <span className="min-w-0">
                      <span className="block text-xs font-extrabold text-slate-900 truncate">
                        {order.tableInfo || 'Para llevar'} {order.customerName ? `· ${order.customerName}` : ''}
                      </span>
                      <span className="block text-[11px] text-slate-500 truncate mt-0.5">
                        {order.items.map((item) => `${item.quantity}x ${item.name}`).join(', ')}
                      </span>
                    </span>
                  </span>
                  <span className="text-right shrink-0 ml-3">
                    <span className="block text-xs font-extrabold text-slate-900">{fmt(order.total)}</span>
                    <span className={`inline-block text-[10px] font-bold px-2 py-0.5 rounded-full mt-0.5 ${
                      order.status === 'preparing'
                        ? 'bg-amber-100 text-amber-800'
                        : order.status === 'ready'
                        ? 'bg-emerald-100 text-emerald-800'
                        : 'bg-blue-100 text-blue-800'
                    }`}>
                      {order.status === 'preparing' ? 'En cocina' : order.status === 'ready' ? 'Listo' : 'Pendiente'}
                    </span>
                  </span>
                </button>
              ))}

              {!activeOrders.length && (
                <div className="h-44 grid place-items-center text-center rounded-xl border border-dashed border-slate-200 p-6">
                  <div>
                    <ChefHat className="h-7 w-7 mx-auto text-slate-300 mb-1.5" />
                    <p className="text-xs font-bold text-slate-600">No hay comandas activas</p>
                    <p className="text-[11px] text-slate-400 mt-0.5">Los pedidos registrados en salón o mostrador aparecerán aquí.</p>
                  </div>
                </div>
              )}
            </div>
          </section>
        </div>
      )}

      {/* Modales de inicio y cierre */}
      {opening && (
        <Dialog title="Iniciar Turno de Restaurante" onClose={() => setOpening(false)}>
          <p className="text-xs text-slate-500">
            Apertura de turno para registrar ventas, comandas de salón y arqueo de caja.
          </p>
          <label className="block text-xs font-bold text-slate-700">
            Fecha y hora de apertura
            <input
              readOnly
              value={date(new Date().toISOString())}
              className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-600"
            />
          </label>
          <label className="block text-xs font-bold text-slate-700">
            Responsable / Cajero
            <input
              value={cashier}
              onChange={(event) => setCashier(event.target.value)}
              className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold"
            />
          </label>
          <label className="block text-xs font-bold text-slate-700">
            Fondo inicial de caja (efectivo para cambio)
            <input
              autoFocus
              min="0"
              step="0.01"
              type="number"
              inputMode="decimal"
              value={floatInput}
              onChange={(event) => setFloatInput(event.target.value)}
              placeholder="Bs 200,00"
              className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold"
            />
          </label>
          <button
            type="button"
            disabled={isStarting}
            onClick={start}
            className="w-full rounded-xl py-3 text-xs font-extrabold text-white shadow-xs transition hover:opacity-95 disabled:opacity-50"
            style={{ backgroundColor: 'var(--primary)' }}
          >
            {isStarting ? 'Iniciando turno...' : 'Confirmar e Iniciar Turno'}
          </button>
        </Dialog>
      )}

      {closing && (
        <Dialog title="Resumen del Turno" onClose={() => setClosing(false)}>
          <div className="grid grid-cols-2 gap-2.5 text-xs">
            <Summary label="Fondo inicial" value={fmt(shift?.openingFloat || 0)} />
            <Summary label="Ventas en efectivo" value={fmt(cashSales)} />
            <Summary label="Otros métodos (QR/tarjeta)" value={fmt(otherSales)} />
            <Summary label="Total facturado" value={fmt(totalSales)} />
            <Summary label="Comandas cobradas" value={String(sales.length)} />
            <Summary label="Efectivo esperado" value={fmt((shift?.openingFloat || 0) + cashSales)} />
          </div>
          <p className="text-[11px] text-slate-500">
            Apertura: {shift ? date(shift.openedAt) : ''} · Responsable: {shift?.openedBy}
          </p>
          {openedAccounts.length > 0 && (
            <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs font-bold text-amber-900">
              No puedes cerrar el turno mientras existan mesas o cuentas abiertas en salón.
            </p>
          )}
          {error && <p role="alert" className="text-xs font-bold text-rose-600">{error}</p>}
          <button
            type="button"
            disabled={openedAccounts.length > 0 || isClosing}
            onClick={close}
            className="w-full rounded-xl bg-slate-900 py-3 text-xs font-extrabold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {isClosing ? 'Cerrando turno...' : 'Confirmar y Cerrar Turno'}
          </button>
        </Dialog>
      )}
    </div>
  )
}

function Metric({ icon, title, value, detail }: { icon: React.ReactNode; title: string; value: string; detail: string }) {
  return (
    <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
      <div className="flex items-center justify-between text-slate-500 mb-2">
        <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">{title}</span>
        <span className="p-1.5 rounded-lg bg-slate-50 border border-slate-100">{icon}</span>
      </div>
      <div className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight">{value}</div>
      <div className="text-[11px] font-medium text-slate-500 mt-1">{detail}</div>
    </div>
  )
}

function Summary({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-200 p-2.5 bg-slate-50">
      <p className="text-[10px] font-bold text-slate-500 uppercase">{label}</p>
      <p className="mt-0.5 font-extrabold text-slate-900 text-sm">{value}</p>
    </div>
  )
}

function Dialog({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[100] grid place-items-center bg-slate-950/50 p-4" onClick={onClose}>
      <section
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(event) => event.stopPropagation()}
        className="w-full max-w-md space-y-4 rounded-2xl bg-white p-5 shadow-2xl border border-slate-200"
      >
        <header className="flex items-center justify-between">
          <h2 className="text-base font-extrabold text-slate-900">{title}</h2>
          <button type="button" aria-label="Cerrar" onClick={onClose} className="rounded-lg p-1.5 hover:bg-slate-100 text-slate-500">
            <X className="h-4 w-4" />
          </button>
        </header>
        {children}
      </section>
    </div>
  )
}
