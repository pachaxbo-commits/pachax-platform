import { useState } from 'react'
import {
  Briefcase,
  DollarSign,
  CheckCircle2,
  X,
  UserPlus,
  Phone,
} from 'lucide-react'
import type { UnionWorker, UnionWorkerPayment } from '../types'

interface SyndicateWorkersViewProps {
  workers: UnionWorker[]
  payments: UnionWorkerPayment[]
  onRegisterPayment: (params: {
    workerId: string
    periodOrConcept: string
    type: 'salary' | 'advance' | 'bonus' | 'travel_allowance'
    amount: number
    paymentMethod: 'cash' | 'transfer'
    notes?: string
  }) => UnionWorkerPayment
  onAddWorker?: (worker: Omit<UnionWorker, 'id'>) => UnionWorker
}

export function SyndicateWorkersView({
  workers,
  payments,
  onRegisterPayment,
  onAddWorker,
}: SyndicateWorkersViewProps) {
  // Modal de Pago
  const [isPayModalOpen, setIsPayModalOpen] = useState(false)
  const [selectedWorkerId, setSelectedWorkerId] = useState(workers[0]?.id || '')
  const [payType, setPayType] = useState<UnionWorkerPayment['type']>('salary')
  const [periodOrConcept, setPeriodOrConcept] = useState('Sueldo Mes Octubre 2026')
  const [amount, setAmount] = useState<number>(2600)
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'transfer'>('cash')
  const [notes, setNotes] = useState('')

  // Modal de Nuevo Trabajador
  const [isAddWorkerOpen, setIsAddWorkerOpen] = useState(false)
  const [newFullName, setNewFullName] = useState('')
  const [newCi, setNewCi] = useState('')
  const [newPhone, setNewPhone] = useState('')
  const [newRole, setNewRole] = useState('Conductor Titular')
  const [newModality, setNewModality] = useState<'monthly' | 'biweekly' | 'daily' | 'per_trip'>('monthly')
  const [newAgreedAmount, setNewAgreedAmount] = useState<number>(3000)

  const [feedback, setFeedback] = useState<string | null>(null)

  const handleSelectWorkerChange = (workerId: string) => {
    setSelectedWorkerId(workerId)
    const w = workers.find(item => item.id === workerId)
    if (w && w.agreedAmount) {
      setAmount(w.agreedAmount)
    }
  }

  const handleExecutePayment = (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedWorkerId) return

    const payment = onRegisterPayment({
      workerId: selectedWorkerId,
      periodOrConcept: periodOrConcept.trim(),
      type: payType,
      amount,
      paymentMethod,
      notes: notes.trim() || undefined,
    })

    setFeedback(`Pago registrado exitosamente (N° ${payment.receiptNumber}) por Bs. ${payment.amount.toFixed(2)}.`)
    setIsPayModalOpen(false)
    setTimeout(() => setFeedback(null), 5000)
  }

  const handleCreateWorker = (e: React.FormEvent) => {
    e.preventDefault()
    if (!onAddWorker || !newFullName.trim() || !newCi.trim()) return

    onAddWorker({
      fullName: newFullName.trim(),
      ci: newCi.trim(),
      phone: newPhone.trim() || 'S/N',
      role: newRole.trim(),
      paymentModality: newModality,
      agreedAmount: Number(newAgreedAmount) || 0,
      status: 'active',
      joinedAt: new Date().toISOString().slice(0, 10),
    })

    setFeedback(`Trabajador "${newFullName.trim()}" registrado con éxito en la nómina sindical.`)
    setNewFullName('')
    setNewCi('')
    setNewPhone('')
    setIsAddWorkerOpen(false)
    setTimeout(() => setFeedback(null), 5000)
  }

  const totalPaidToWorkers = payments.reduce((acc, p) => acc + p.amount, 0)

  return (
    <div className="space-y-4 font-sans text-slate-800">
      {/* Cabecera */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200/90 shadow-xs flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-900 border border-amber-300 flex items-center justify-center font-bold">
            <Briefcase className="w-5 h-5 text-amber-700" />
          </div>
          <div>
            <h3 className="text-base font-black text-slate-900 tracking-tight">Personal & Trabajadores</h3>
            <p className="text-xs text-slate-500">
              Nómina sindical de choferes, personal de almacén y liquidación de pagos ({workers.length} trabajadores).
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {onAddWorker && (
            <button
              type="button"
              onClick={() => setIsAddWorkerOpen(true)}
              className="px-4 py-2.5 rounded-xl border border-amber-300 bg-amber-50 hover:bg-amber-100/70 font-bold text-amber-900 text-xs flex items-center gap-2 shadow-xs transition"
            >
              <UserPlus className="w-4 h-4 text-amber-800" />
              <span>Nuevo Trabajador</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => setIsPayModalOpen(true)}
            className="px-4 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-500 font-bold text-white text-xs flex items-center gap-2 shadow-xs transition"
          >
            <DollarSign className="w-4 h-4" />
            <span>Registrar Pago / Anticipo</span>
          </button>
        </div>
      </div>

      {feedback && (
        <div className="p-3 bg-teal-50 border border-teal-200 text-teal-800 rounded-xl text-xs font-semibold flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-teal-600 shrink-0" />
          <span>{feedback}</span>
        </div>
      )}

      {/* Grid de trabajadores activos */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {workers.map(w => {
          const paymentsOfWorker = payments.filter(p => p.workerId === w.id)
          const totalPaid = paymentsOfWorker.reduce((acc, p) => acc + p.amount, 0)

          return (
            <div key={w.id} className="p-4 bg-white rounded-2xl border border-slate-200 shadow-xs space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-wider bg-slate-100 text-slate-600 px-2 py-0.5 rounded-md">
                  {w.role}
                </span>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
                  Activo
                </span>
              </div>

              <h4 className="font-black text-slate-900 text-sm">{w.fullName}</h4>
              <div className="text-xs text-slate-500 flex items-center gap-3">
                <span>CI: {w.ci}</span>
                <span className="flex items-center gap-1">
                  <Phone className="w-3 h-3 text-slate-400" />
                  {w.phone}
                </span>
              </div>

              <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs">
                <div>
                  <span className="text-[10px] text-slate-400 block">Acordado / Base:</span>
                  <span className="font-bold text-slate-800">
                    Bs. {w.agreedAmount.toFixed(2)} ({w.paymentModality === 'monthly' ? 'Mensual' : w.paymentModality === 'per_trip' ? 'Por viaje' : 'Quincenal'})
                  </span>
                </div>
                <div className="text-right">
                  <span className="text-[10px] text-slate-400 block">Total Percibido:</span>
                  <span className="font-black text-emerald-700">Bs. {totalPaid.toFixed(2)}</span>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Historial de pagos y liquidaciones */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
        <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
          <div>
            <h4 className="font-bold text-xs text-slate-800 uppercase tracking-wider">Historial de Pagos Realizados al Personal</h4>
            <span className="text-[11px] text-slate-500">Total egresado en el período: Bs. {totalPaidToWorkers.toFixed(2)}</span>
          </div>
        </div>

        {payments.length === 0 ? (
          <div className="p-12 text-center text-xs text-slate-400">
            No se han registrado pagos a trabajadores todavía.
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {payments.map(p => (
              <div key={p.id} className="p-3.5 hover:bg-slate-50 transition flex items-center justify-between gap-3 text-xs">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-bold text-slate-700 bg-slate-100 px-2 py-0.5 rounded text-[10px]">
                      {p.receiptNumber}
                    </span>
                    <span className="font-black text-slate-900">{p.workerName}</span>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">
                      {p.type === 'salary' ? 'Sueldo' : p.type === 'advance' ? 'Anticipo' : 'Viático'}
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-500">
                    {p.periodOrConcept} · {new Date(p.date).toLocaleString('es-BO')}
                  </div>
                </div>

                <div className="text-right">
                  <div className="font-black text-slate-900 text-sm">Bs. {p.amount.toFixed(2)}</div>
                  <span className="text-[10px] text-slate-400 uppercase font-semibold">
                    {p.paymentMethod === 'cash' ? 'Efectivo' : 'Transferencia'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modal Registrar Nuevo Trabajador */}
      {isAddWorkerOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-3 overflow-y-auto">
          <div className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden my-auto flex flex-col font-sans">
            <div className="bg-slate-900 text-white px-5 py-3.5 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-amber-500 text-slate-950 flex items-center justify-center font-bold">
                  <UserPlus className="w-4 h-4 text-slate-950" />
                </div>
                <div>
                  <h3 className="font-black text-sm text-white">Nuevo Trabajador</h3>
                  <p className="text-[11px] text-slate-400">Incorpora un conductor o empleado a la nómina</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsAddWorkerOpen(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateWorker} className="p-4 space-y-3 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Nombre Completo *</label>
                <input
                  type="text"
                  value={newFullName}
                  onChange={e => setNewFullName(e.target.value)}
                  placeholder="Ej. Martín Torrico Flores"
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 font-medium text-slate-900"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">C.I. / Documento *</label>
                  <input
                    type="text"
                    value={newCi}
                    onChange={e => setNewCi(e.target.value)}
                    placeholder="Ej. 6543210 Cbba"
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 font-medium text-slate-900"
                    required
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Teléfono / Celular</label>
                  <input
                    type="text"
                    value={newPhone}
                    onChange={e => setNewPhone(e.target.value)}
                    placeholder="Ej. 76543210"
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 font-medium text-slate-900"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Cargo / Función</label>
                  <select
                    value={newRole}
                    onChange={e => setNewRole(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 font-medium text-slate-900"
                  >
                    <option value="Conductor Titular">Conductor Titular</option>
                    <option value="Conductor Relevo">Conductor Relevo</option>
                    <option value="Auxiliar de Carga">Auxiliar de Carga</option>
                    <option value="Encargado de Almacén">Encargado de Almacén</option>
                    <option value="Secretaria Administrativa">Secretaria Administrativa</option>
                    <option value="Mecánico de Flota">Mecánico de Flota</option>
                  </select>
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Modalidad de Pago</label>
                  <select
                    value={newModality}
                    onChange={e => setNewModality(e.target.value as 'monthly' | 'biweekly' | 'per_trip' | 'daily')}
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 font-medium text-slate-900"
                  >
                    <option value="monthly">Mensual</option>
                    <option value="biweekly">Quincenal</option>
                    <option value="per_trip">Por Viaje</option>
                    <option value="daily">Diario</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Monto Base Acordado (Bs.) *</label>
                <input
                  type="number"
                  min="0"
                  step="50"
                  value={newAgreedAmount}
                  onChange={e => setNewAgreedAmount(Number(e.target.value))}
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 font-bold text-slate-900"
                  required
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsAddWorkerOpen(false)}
                  className="px-3 py-1.5 rounded-lg border border-slate-300 text-slate-700 font-bold"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-white font-bold"
                >
                  Guardar Trabajador
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Registrar Pago / Anticipo */}
      {isPayModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-3 overflow-y-auto">
          <div className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden my-auto flex flex-col font-sans">
            <div className="bg-slate-900 text-white px-5 py-3.5 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-amber-500 text-slate-950 flex items-center justify-center font-bold">
                  <DollarSign className="w-4 h-4 text-slate-950" />
                </div>
                <div>
                  <h3 className="font-black text-sm text-white">Liquidación a Personal</h3>
                  <p className="text-[11px] text-slate-400">Registrar egreso por sueldo, anticipo o viático</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsPayModalOpen(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleExecutePayment} className="p-4 space-y-3 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Seleccionar Trabajador *</label>
                <select
                  value={selectedWorkerId}
                  onChange={e => handleSelectWorkerChange(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 font-medium text-slate-900"
                >
                  {workers.map(w => (
                    <option key={w.id} value={w.id}>
                      {w.fullName} ({w.role}) · Acordado: Bs. {w.agreedAmount}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Tipo de Egreso *</label>
                  <select
                    value={payType}
                    onChange={e => setPayType(e.target.value as 'salary' | 'advance' | 'travel_allowance' | 'bonus')}
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 font-medium text-slate-900"
                  >
                    <option value="salary">Sueldo / Salario</option>
                    <option value="advance">Anticipo</option>
                    <option value="travel_allowance">Viático / Viaje</option>
                    <option value="bonus">Bono / Premio</option>
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Medio de Pago</label>
                  <select
                    value={paymentMethod}
                    onChange={e => setPaymentMethod(e.target.value as 'cash' | 'transfer')}
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 font-medium text-slate-900"
                  >
                    <option value="cash">Efectivo (Caja)</option>
                    <option value="transfer">Transferencia Bancaria</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Concepto o Período *</label>
                <input
                  type="text"
                  value={periodOrConcept}
                  onChange={e => setPeriodOrConcept(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 font-medium text-slate-900"
                  placeholder="Ej. Sueldo Mes Octubre 2026"
                  required
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Importe a Desembolsar (Bs.) *</label>
                <input
                  type="number"
                  min="1"
                  step="10"
                  value={amount}
                  onChange={e => setAmount(Number(e.target.value))}
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 font-black text-sm text-slate-900"
                  required
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-600 mb-1">Observaciones</label>
                <input
                  type="text"
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 text-xs"
                  placeholder="Opcional"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsPayModalOpen(false)}
                  className="px-3 py-1.5 rounded-lg border border-slate-300 text-slate-700 font-bold"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-white font-bold"
                >
                  Confirmar Pago
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
