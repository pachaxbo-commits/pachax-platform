import { useState, useEffect } from 'react'
import {
  Wallet,
  Lock,
  Unlock,
  ArrowUpRight,
  MinusCircle,
  PlusCircle,
  Eye,
  EyeOff,
  Calculator,
  Zap,
} from 'lucide-react'
import { CashService } from '../services/cash/cashService'
import { PrintOrchestratorService } from '../services/printing/printOrchestratorService'
import type { CashMovement, CashSession, CashShiftSummary, DenominationDetail } from '../types/cash'

export function CashSessionView() {
  const cashService = CashService.getInstance()
  const registerId = 'reg-caja-principal'

  const [activeSession, setActiveSession] = useState<CashSession | undefined>(undefined)
  const [summary, setSummary] = useState<CashShiftSummary | null>(null)
  const [movements, setMovements] = useState<CashMovement[]>([])

  // Opening form state
  const [openingAmount, setOpeningAmount] = useState<number>(100)
  const [openingNotes, setOpeningNotes] = useState<string>('')

  // Movement modal state
  const [isMovementModalOpen, setIsMovementModalOpen] = useState<boolean>(false)
  const [movementType, setMovementType] = useState<'income' | 'expense' | 'withdrawal'>('expense')
  const [movementAmount, setMovementAmount] = useState<number>(20)
  const [movementCategory, setMovementCategory] = useState<string>('Insumos')
  const [movementDescription, setMovementDescription] = useState<string>('')

  // Closing / Arqueo modal state
  const [isClosingModalOpen, setIsClosingModalOpen] = useState<boolean>(false)
  const [isBlindClosure, setIsBlindClosure] = useState<boolean>(true)
  const [countedCashInput, setCountedCashInput] = useState<number>(0)
  const [differenceReason, setDifferenceReason] = useState<string>('')

  // Denominations counter
  const defaultDenominations: DenominationDetail[] = [
    { denominationValue: 200, count: 0, subtotal: 0 },
    { denominationValue: 100, count: 0, subtotal: 0 },
    { denominationValue: 50, count: 0, subtotal: 0 },
    { denominationValue: 20, count: 0, subtotal: 0 },
    { denominationValue: 10, count: 0, subtotal: 0 },
    { denominationValue: 5, count: 0, subtotal: 0 },
    { denominationValue: 2, count: 0, subtotal: 0 },
    { denominationValue: 1, count: 0, subtotal: 0 },
    { denominationValue: 0.5, count: 0, subtotal: 0 },
  ]
  const [denominations, setDenominations] = useState<DenominationDetail[]>(defaultDenominations)

  const [statusMessage, setStatusMessage] = useState<string | null>(null)

  useEffect(() => {
    refreshSession()
  }, [])

  const refreshSession = () => {
    const session = cashService.getActiveSession(registerId)
    setActiveSession(session)
    if (session) {
      const sum = cashService.calculateShiftSummary(session.id)
      setSummary(sum)
      setMovements((cashService as any).movements?.get(session.id) || [])
    } else {
      setSummary(null)
      setMovements([])
    }
  }

  const handleOpenSession = async () => {
    try {
      const session = await cashService.openSession({
        restaurantId: 'principal',
        branchId: 'main',
        cashRegisterId: registerId,
        terminalId: 'term-caja-01',
        openedByUid: 'cajero-principal',
        openingAmount,
        notes: openingNotes,
      })
      setActiveSession(session)
      refreshSession()
      setStatusMessage('¡Turno de caja abierto exitosamente!')
    } catch (err: any) {
      setStatusMessage(`Error: ${err.message}`)
    }
  }

  const handleAddMovement = async () => {
    if (!activeSession) return
    try {
      await cashService.addMovement({
        cashSessionId: activeSession.id,
        type: movementType,
        amount: movementAmount,
        paymentMethod: 'cash',
        category: movementCategory,
        description: movementDescription || 'Movimiento manual de caja',
        createdByUid: 'cajero-principal',
      })
      setIsMovementModalOpen(false)
      refreshSession()
      setStatusMessage(`Movimiento de ${movementType.toUpperCase()} por Bs. ${movementAmount} registrado.`)
    } catch (err: any) {
      setStatusMessage(`Error: ${err.message}`)
    }
  }

  const handleDenominationChange = (value: number, count: number) => {
    const updated = denominations.map((d) => {
      if (d.denominationValue === value) {
        const newCount = Math.max(0, count)
        return { ...d, count: newCount, subtotal: newCount * value }
      }
      return d
    })
    setDenominations(updated)
    const totalCounted = updated.reduce((sum, d) => sum + d.subtotal, 0)
    setCountedCashInput(totalCounted)
  }

  const handleCloseSession = async () => {
    if (!activeSession) return
    try {
      await cashService.closeSession({
        sessionId: activeSession.id,
        closedByUid: 'cajero-principal',
        countedCash: countedCashInput,
        differenceReason,
        isBlindClosure,
        denominations,
      })
      setIsClosingModalOpen(false)
      refreshSession()
      setStatusMessage('Turno de caja cerrado exitosamente con snapshot financiero inmutable.')
    } catch (err: any) {
      setStatusMessage(`Error al cerrar turno: ${err.message}`)
    }
  }

  const handleKickDrawer = async () => {
    const orchestrator = PrintOrchestratorService.getInstance()
    await orchestrator.kickCashDrawerIndependent('cajero-principal', 'Apertura manual de prueba desde Caja')
    setStatusMessage('Comando de apertura de gaveta enviado a la impresora de caja.')
  }

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6 bg-slate-50 min-h-screen">
      {/* Header */}
      <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="h-12 w-12 rounded-2xl bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-600">
            <Wallet size={24} />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-800">Control de Caja y Turnos</h1>
            <p className="text-xs text-slate-500 font-medium">Gestión de aperturas, arqueos, cierres ciegos y movimientos de dinero</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {activeSession ? (
            <span className="px-3.5 py-1.5 rounded-full bg-emerald-100 text-emerald-800 font-extrabold text-xs flex items-center gap-1.5">
              <Unlock size={14} /> TURNO ABIERTO
            </span>
          ) : (
            <span className="px-3.5 py-1.5 rounded-full bg-slate-200 text-slate-700 font-extrabold text-xs flex items-center gap-1.5">
              <Lock size={14} /> CAJA CERRADA
            </span>
          )}
        </div>
      </div>

      {statusMessage && (
        <div className="bg-blue-50 border border-blue-200 text-blue-800 px-4 py-3 rounded-2xl text-xs font-semibold flex items-center gap-2">
          <Zap size={16} className="text-blue-600 shrink-0" />
          {statusMessage}
        </div>
      )}

      {/* Screen when Session is CLOSED */}
      {!activeSession ? (
        <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm max-w-xl mx-auto space-y-6">
          <div className="text-center space-y-2">
            <div className="h-14 w-14 rounded-2xl bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-600 mx-auto">
              <Lock size={28} />
            </div>
            <h2 className="text-lg font-bold text-slate-800">Apertura de Turno de Caja</h2>
            <p className="text-xs text-slate-500">Ingresa el monto inicial para abrir la sesión operativa de hoy.</p>
          </div>

          <div className="space-y-4 text-xs">
            <div>
              <label className="font-bold text-slate-700 block mb-1">Monto Inicial en Efectivo (Bs.):</label>
              <input
                type="number"
                value={openingAmount}
                onChange={(e) => setOpeningAmount(Number(e.target.value))}
                className="w-full font-mono text-lg font-bold border border-slate-200 rounded-xl p-3 bg-slate-50 text-slate-800 focus:outline-none focus:border-blue-500"
              />
            </div>

            <div>
              <label className="font-bold text-slate-700 block mb-1">Observaciones / Notas de Apertura:</label>
              <input
                type="text"
                value={openingNotes}
                onChange={(e) => setOpeningNotes(e.target.value)}
                placeholder="Ej. Billetes de cambio recibidos del supervisor"
                className="w-full border border-slate-200 rounded-xl p-3 bg-slate-50 text-slate-800 font-semibold focus:outline-none focus:border-blue-500"
              />
            </div>

            <button
              onClick={handleOpenSession}
              className="w-full py-3.5 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm shadow-md shadow-blue-500/20 transition flex items-center justify-center gap-2"
            >
              <Unlock size={18} /> Abrir Turno de Caja
            </button>
          </div>
        </div>
      ) : (
        /* Screen when Session is OPEN */
        <div className="space-y-6">
          {/* Summary Cards */}
          {summary && (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-4">
              <div className="bg-white p-4 rounded-3xl border border-slate-200 shadow-sm space-y-1">
                <div className="text-[10px] uppercase font-extrabold text-slate-400">MONTO INICIAL</div>
                <div className="text-lg font-mono font-bold text-slate-800">Bs. {summary.openingAmount.toFixed(2)}</div>
              </div>

              <div className="bg-white p-4 rounded-3xl border border-slate-200 shadow-sm space-y-1">
                <div className="text-[10px] uppercase font-extrabold text-slate-400">VENTAS EFECTIVO</div>
                <div className="text-lg font-mono font-bold text-emerald-600">+ Bs. {summary.totalSalesCash.toFixed(2)}</div>
              </div>

              <div className="bg-white p-4 rounded-3xl border border-slate-200 shadow-sm space-y-1">
                <div className="text-[10px] uppercase font-extrabold text-slate-400">VENTAS QR / TARJETA</div>
                <div className="text-lg font-mono font-bold text-blue-600">Bs. {(summary.totalSalesQr + summary.totalSalesCard).toFixed(2)}</div>
              </div>

              <div className="bg-white p-4 rounded-3xl border border-slate-200 shadow-sm space-y-1">
                <div className="text-[10px] uppercase font-extrabold text-slate-400">GASTOS / RETIROS</div>
                <div className="text-lg font-mono font-bold text-rose-600">- Bs. {(summary.totalExpenseCash + summary.totalWithdrawalsCash).toFixed(2)}</div>
              </div>

              <div className="bg-blue-600 text-white p-4 rounded-3xl shadow-md shadow-blue-500/20 space-y-1">
                <div className="text-[10px] uppercase font-extrabold opacity-80">EFECTIVO ESPERADO</div>
                <div className="text-xl font-mono font-extrabold">Bs. {summary.expectedCash.toFixed(2)}</div>
              </div>
            </div>
          )}

          {/* Action Bar */}
          <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => {
                  setMovementType('income')
                  setIsMovementModalOpen(true)
                }}
                className="px-4 py-2.5 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 font-bold text-xs flex items-center gap-2 hover:bg-emerald-100 transition"
              >
                <PlusCircle size={16} /> Ingreso de Efectivo
              </button>

              <button
                onClick={() => {
                  setMovementType('expense')
                  setIsMovementModalOpen(true)
                }}
                className="px-4 py-2.5 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 font-bold text-xs flex items-center gap-2 hover:bg-rose-100 transition"
              >
                <MinusCircle size={16} /> Registrar Gasto / Compra
              </button>

              <button
                onClick={() => {
                  setMovementType('withdrawal')
                  setIsMovementModalOpen(true)
                }}
                className="px-4 py-2.5 rounded-2xl bg-amber-50 border border-amber-200 text-amber-800 font-bold text-xs flex items-center gap-2 hover:bg-amber-100 transition"
              >
                <ArrowUpRight size={16} /> Retiro de Caja
              </button>

              <button
                onClick={handleKickDrawer}
                className="px-4 py-2.5 rounded-2xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs flex items-center gap-2 transition"
              >
                <Zap size={16} /> Abrir Gaveta
              </button>
            </div>

            <button
              onClick={() => setIsClosingModalOpen(true)}
              className="px-5 py-2.5 rounded-2xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs flex items-center gap-2 shadow-md transition"
            >
              <Lock size={16} /> Arqueo y Cierre de Turno
            </button>
          </div>

          {/* Movements History Table */}
          <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm space-y-3">
            <h3 className="font-bold text-slate-800 text-sm border-b border-slate-100 pb-2">
              Historial de Movimientos de la Sesión ({movements.length})
            </h3>
            {movements.length === 0 ? (
              <p className="text-xs text-slate-400 py-4 text-center italic">No hay movimientos registrados en este turno todavía.</p>
            ) : (
              <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                {movements.map((mov) => (
                  <div key={mov.id} className="p-3 bg-slate-50 border border-slate-200 rounded-2xl flex items-center justify-between text-xs font-semibold">
                    <div className="space-y-0.5">
                      <span className="uppercase text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-slate-200 text-slate-700">
                        {mov.type}
                      </span>
                      <div className="text-slate-800 font-bold">{mov.description}</div>
                      <div className="text-[10px] text-slate-400">{mov.category} | {new Date(mov.createdAtIso).toLocaleTimeString()}</div>
                    </div>
                    <div className={`font-mono text-sm font-extrabold ${mov.type === 'income' || mov.type === 'opening' || mov.type === 'sale' ? 'text-emerald-600' : 'text-rose-600'}`}>
                      {mov.type === 'income' || mov.type === 'opening' || mov.type === 'sale' ? '+' : '-'} Bs. {mov.amount.toFixed(2)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Movement Modal */}
      {isMovementModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
          <div className="bg-white rounded-3xl border border-slate-200 p-6 max-w-md w-full space-y-4 shadow-2xl">
            <h3 className="font-bold text-slate-800 text-base border-b border-slate-100 pb-3 uppercase">
              Registrar {movementType}
            </h3>

            <div className="space-y-3 text-xs">
              <div>
                <label className="font-bold text-slate-700 block mb-1">Monto (Bs.):</label>
                <input
                  type="number"
                  value={movementAmount}
                  onChange={(e) => setMovementAmount(Number(e.target.value))}
                  className="w-full font-mono text-base font-bold border border-slate-200 rounded-xl p-2.5 bg-slate-50"
                />
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">Categoría:</label>
                <select
                  value={movementCategory}
                  onChange={(e) => setMovementCategory(e.target.value)}
                  className="w-full border border-slate-200 rounded-xl p-2.5 bg-slate-50 font-semibold"
                >
                  <option value="Insumos">Insumos Urgentes</option>
                  <option value="Transporte">Transporte / Flete</option>
                  <option value="Servicios">Servicios / Limpieza</option>
                  <option value="Retiro">Retiro de Seguridad</option>
                  <option value="Ajuste">Ajuste de Caja</option>
                </select>
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">Descripción / Motivo:</label>
                <input
                  type="text"
                  value={movementDescription}
                  onChange={(e) => setMovementDescription(e.target.value)}
                  placeholder="Ej. Compra de 2 kg de verduras"
                  className="w-full border border-slate-200 rounded-xl p-2.5 bg-slate-50 font-semibold"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-slate-100 pt-3">
              <button
                onClick={() => setIsMovementModalOpen(false)}
                className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 font-bold text-xs"
              >
                Cancelar
              </button>
              <button
                onClick={handleAddMovement}
                className="px-5 py-2 rounded-xl bg-blue-600 text-white font-bold text-xs shadow-md"
              >
                Guardar Movimiento
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Closing / Arqueo Modal */}
      {isClosingModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
          <div className="bg-white rounded-3xl border border-slate-200 p-6 max-w-2xl w-full space-y-4 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-bold text-slate-800 text-base flex items-center gap-2">
                <Calculator size={20} className="text-blue-600" /> Arqueo y Cierre de Turno
              </h3>
              <button
                onClick={() => setIsBlindClosure(!isBlindClosure)}
                className="text-xs font-bold text-blue-600 flex items-center gap-1 bg-blue-50 px-3 py-1.5 rounded-xl border border-blue-200"
              >
                {isBlindClosure ? <EyeOff size={14} /> : <Eye size={14} />}
                {isBlindClosure ? 'Modo Cierre Ciego Activo' : 'Modo Visible'}
              </button>
            </div>

            {/* Denominational Calculator */}
            <div className="space-y-3 text-xs">
              <label className="font-bold text-slate-700 block">Conteo por Denominación (Bolivia Bs.):</label>
              <div className="grid grid-cols-3 gap-2.5">
                {denominations.map((d) => (
                  <div key={d.denominationValue} className="p-2.5 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
                    <div className="font-bold text-slate-600">Bs. {d.denominationValue}</div>
                    <div className="flex items-center gap-1">
                      <input
                        type="number"
                        value={d.count || ''}
                        onChange={(e) => handleDenominationChange(d.denominationValue, Number(e.target.value))}
                        placeholder="Cant."
                        className="w-16 p-1 border rounded text-center font-bold text-slate-800 bg-white"
                      />
                      <span className="font-mono text-[11px] font-bold text-slate-500">={d.subtotal}</span>
                    </div>
                  </div>
                ))}
              </div>

              <div className="p-3 bg-blue-50 border border-blue-200 rounded-2xl flex items-center justify-between text-xs">
                <span className="font-bold text-blue-900">Total Efectivo Contado:</span>
                <span className="font-mono text-base font-extrabold text-blue-700">Bs. {countedCashInput.toFixed(2)}</span>
              </div>

              {!isBlindClosure && summary && (
                <div className="p-3 bg-slate-100 rounded-2xl space-y-1 font-mono text-xs">
                  <div>Efectivo Esperado: <strong>Bs. {summary.expectedCash.toFixed(2)}</strong></div>
                  <div>Diferencia: <strong className={countedCashInput - summary.expectedCash >= 0 ? 'text-emerald-600' : 'text-rose-600'}>
                    Bs. {(countedCashInput - summary.expectedCash).toFixed(2)}
                  </strong></div>
                </div>
              )}

              <div>
                <label className="font-bold text-slate-700 block mb-1">Motivo / Observación de Diferencia:</label>
                <input
                  type="text"
                  value={differenceReason}
                  onChange={(e) => setDifferenceReason(e.target.value)}
                  placeholder="Ej. Faltante de Bs. 2 por dar cambio"
                  className="w-full border border-slate-200 rounded-xl p-2.5 bg-slate-50 font-semibold"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-slate-100 pt-3">
              <button
                onClick={() => setIsClosingModalOpen(false)}
                className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-600 font-bold text-xs"
              >
                Cancelar
              </button>
              <button
                onClick={handleCloseSession}
                className="px-5 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs shadow-md"
              >
                Confirmar Cierre Definitivo
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
