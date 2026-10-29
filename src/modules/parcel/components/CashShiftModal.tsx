import { useState } from 'react'
import {
  X,
  Wallet,
  Lock,
  Unlock,
} from 'lucide-react'
import type { CashShift, CashMovement } from '../types'

interface CashShiftModalProps {
  isOpen: boolean
  onClose: () => void
  activeShift: CashShift | null
  movements: CashMovement[]
  onOpenShift: (initialCash: number, operatorName?: string) => void
  onCloseShift: (actualCash: number, notes?: string) => void
}

export function CashShiftModal({
  isOpen,
  onClose,
  activeShift,
  movements,
  onOpenShift,
  onCloseShift,
}: CashShiftModalProps) {
  const [initialCash, setInitialCash] = useState<number>(200)
  const [operatorName, setOperatorName] = useState('Juan José Rocha')
  const [actualCash, setActualCash] = useState<number>(activeShift?.expectedCash ?? 0)
  const [closingNotes, setClosingNotes] = useState('')
  const [isClosingConfirm, setIsClosingConfirm] = useState(false)

  const pendingMovements = movements.filter(m => m.shiftId === 'pending_reconciliation')

  if (!isOpen) return null

  const handleOpen = (e: React.FormEvent) => {
    e.preventDefault()
    onOpenShift(initialCash, operatorName.trim() || undefined)
  }

  const handleClose = (e: React.FormEvent) => {
    e.preventDefault()
    onCloseShift(actualCash, closingNotes.trim() || undefined)
    setIsClosingConfirm(false)
  }

  const shiftMovements = activeShift
    ? movements.filter(m => m.shiftId === activeShift.id)
    : []

  const difference = activeShift ? Math.round((actualCash - activeShift.expectedCash) * 100) / 100 : 0

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-2 sm:p-4 overflow-y-auto">
      <div className="relative w-full max-w-xl bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden my-auto max-h-[92vh] flex flex-col font-sans">
        {/* Cabecera */}
        <div className="bg-slate-900 text-white px-5 py-3.5 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-teal-500 text-slate-950 flex items-center justify-center font-bold">
              <Wallet className="w-5 h-5 text-slate-950" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-black tracking-tight">Caja & Arqueo de Turno</h2>
              <p className="text-xs text-slate-300">Control de apertura, cobros del día y cierre de ventanilla</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-white p-1 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4 text-xs sm:text-sm">
          {!activeShift ? (
            /* Formulario de apertura de turno */
            <form onSubmit={handleOpen} className="space-y-4">
              <div className="p-4 bg-teal-50 border border-teal-200 rounded-xl text-teal-900 text-xs flex items-center gap-2.5">
                <Unlock className="w-5 h-5 text-teal-700 shrink-0" />
                <span>La caja de la agencia se encuentra cerrada. Abre un nuevo turno para asignar cobranzas y arqueo.</span>
              </div>

              {pendingMovements.length > 0 && (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-900 text-xs space-y-1">
                  <span className="font-bold block">Movimientos pendientes de conciliación ({pendingMovements.length}):</span>
                  <p className="text-[11px] text-amber-800">
                    Se registraron cobros o egresos fuera de turno por un neto de Bs. {pendingMovements.reduce((acc, m) => acc + (m.type === 'income' ? m.amount : -m.amount), 0).toFixed(2)}. Todos se encuentran preservados en el historial financiero.
                  </p>
                </div>
              )}

              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">Cajero / Operador Responsable *</label>
                <input
                  type="text"
                  value={operatorName}
                  onChange={e => setOperatorName(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 font-medium"
                  required
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">Monto Inicial en Efectivo (Fondo de Cambio Bs.) *</label>
                <input
                  type="number"
                  min="0"
                  step="10"
                  value={initialCash}
                  onChange={e => setInitialCash(parseFloat(e.target.value) || 0)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 font-black text-slate-900 text-lg"
                  required
                />
                <span className="text-[10px] text-slate-500 mt-0.5 block">
                  Efectivo disponible en gaveta antes de iniciar la atención al público.
                </span>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 rounded-xl border border-slate-300 font-bold text-slate-700 hover:bg-slate-100"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-teal-600 hover:bg-teal-500 font-bold text-white shadow-xs"
                >
                  Abrir Turno de Caja
                </button>
              </div>
            </form>
          ) : isClosingConfirm ? (
            /* Formulario de confirmación de cierre y arqueo */
            <form onSubmit={handleClose} className="space-y-4">
              <div className="p-3 bg-amber-50 border border-amber-300 rounded-xl text-amber-900 text-xs">
                <strong>Arqueo Físico de Gaveta:</strong> Cuenta el dinero en efectivo que tienes en mano para comparar con el esperado.
              </div>

              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1.5 text-xs">
                <div className="flex justify-between">
                  <span className="text-slate-600">Fondo Inicial:</span>
                  <strong>Bs. {activeShift.initialCash.toFixed(2)}</strong>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600">(+) Ingresos en Efectivo:</span>
                  <strong className="text-emerald-700">+ Bs. {activeShift.totalCashIn.toFixed(2)}</strong>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600">(-) Egresos en Efectivo:</span>
                  <strong className="text-red-700">- Bs. {activeShift.totalCashOut.toFixed(2)}</strong>
                </div>
                <div className="border-t border-slate-200 pt-1.5 flex justify-between text-sm font-black">
                  <span className="text-slate-900">EFECTIVO ESPERADO EN GAVETA:</span>
                  <span className="text-teal-900">Bs. {activeShift.expectedCash.toFixed(2)}</span>
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">Efectivo Físico Contado (Bs.) *</label>
                <input
                  type="number"
                  step="0.5"
                  value={actualCash}
                  onChange={e => setActualCash(parseFloat(e.target.value) || 0)}
                  className="w-full bg-white border border-slate-300 rounded-lg p-2.5 font-black text-slate-900 text-lg"
                  required
                />
              </div>

              {/* Diferencia calculada */}
              <div className={`p-3 rounded-xl border text-xs font-bold flex items-center justify-between ${difference === 0 ? 'bg-emerald-50 border-emerald-300 text-emerald-800' : difference > 0 ? 'bg-blue-50 border-blue-300 text-blue-800' : 'bg-red-50 border-red-300 text-red-800'}`}>
                <span>{difference === 0 ? 'Arqueo Exacto (Sin diferencias)' : difference > 0 ? 'Sobrante en caja:' : 'Faltante en caja:'}</span>
                <span className="text-sm font-black">Bs. {Math.abs(difference).toFixed(2)}</span>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">Notas de Cierre de Caja</label>
                <textarea
                  rows={2}
                  placeholder="Detalles del arqueo, novedades del turno..."
                  value={closingNotes}
                  onChange={e => setClosingNotes(e.target.value)}
                  className="w-full bg-white border border-slate-300 rounded-lg p-2 text-xs"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsClosingConfirm(false)}
                  className="px-4 py-2 rounded-xl border border-slate-300 font-bold text-slate-700 hover:bg-slate-100"
                >
                  Volver al Resumen
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-red-600 hover:bg-red-500 font-bold text-white shadow-xs"
                >
                  Confirmar y Cerrar Turno
                </button>
              </div>
            </form>
          ) : (
            /* Vista del turno activo */
            <div className="space-y-4">
              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center justify-between">
                <div>
                  <span className="text-[10px] font-bold text-emerald-800 uppercase tracking-wider block">Turno Activo</span>
                  <div className="font-bold text-slate-900 text-xs">Responsable: {activeShift.operatorName}</div>
                  <div className="text-[10px] text-slate-500">Iniciado: {new Date(activeShift.openedAt).toLocaleTimeString('es-BO')}</div>
                </div>
                <div className="text-right">
                  <span className="text-[10px] text-slate-500 block">Efectivo en Gaveta:</span>
                  <span className="text-xl font-black text-emerald-900">Bs. {activeShift.expectedCash.toFixed(2)}</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="p-2.5 bg-slate-50 border rounded-lg">
                  <span className="text-[10px] text-slate-500 block">Fondo Inicial:</span>
                  <strong className="text-slate-800">Bs. {activeShift.initialCash.toFixed(2)}</strong>
                </div>
                <div className="p-2.5 bg-slate-50 border rounded-lg">
                  <span className="text-[10px] text-slate-500 block">Ingresos QR (Banco):</span>
                  <strong className="text-teal-700">Bs. {activeShift.totalQrIn.toFixed(2)}</strong>
                </div>
                <div className="p-2.5 bg-slate-50 border rounded-lg">
                  <span className="text-[10px] text-slate-500 block">Cobros Efectivo:</span>
                  <strong className="text-emerald-700">+ Bs. {activeShift.totalCashIn.toFixed(2)}</strong>
                </div>
                <div className="p-2.5 bg-slate-50 border rounded-lg">
                  <span className="text-[10px] text-slate-500 block">Egresos Efectivo:</span>
                  <strong className="text-red-700">- Bs. {activeShift.totalCashOut.toFixed(2)}</strong>
                </div>
              </div>

              {/* Movimientos del turno */}
              <div>
                <span className="font-bold text-slate-800 text-xs block mb-1.5 uppercase">
                  Movimientos Registrados en este Turno ({shiftMovements.length})
                </span>
                {shiftMovements.length === 0 ? (
                  <div className="p-4 text-center text-slate-400 bg-slate-50 rounded-xl text-xs">
                    Aún no hay movimientos registrados en este turno.
                  </div>
                ) : (
                  <div className="border border-slate-200 rounded-xl max-h-44 overflow-y-auto divide-y divide-slate-100 text-xs">
                    {shiftMovements.map(m => (
                      <div key={m.id} className="p-2.5 flex items-center justify-between">
                        <div>
                          <div className="font-semibold text-slate-800">{m.concept}</div>
                          <div className="text-[10px] text-slate-400">{new Date(m.timestamp).toLocaleTimeString('es-BO')} · {m.paymentMethod.toUpperCase()}</div>
                        </div>
                        <div className={`font-bold text-right ${m.type === 'income' ? 'text-emerald-700' : 'text-red-700'}`}>
                          {m.type === 'income' ? '+' : '-'} Bs. {m.amount.toFixed(2)}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex justify-between items-center pt-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 rounded-xl border border-slate-300 font-bold text-xs text-slate-700 hover:bg-slate-100"
                >
                  Cerrar Ventana
                </button>
                <button
                  type="button"
                  onClick={() => setIsClosingConfirm(true)}
                  className="px-5 py-2 rounded-xl bg-red-600 hover:bg-red-500 font-bold text-xs text-white shadow-xs flex items-center gap-1.5"
                >
                  <Lock className="w-4 h-4" />
                  <span>Realizar Arqueo & Cierre de Caja</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
