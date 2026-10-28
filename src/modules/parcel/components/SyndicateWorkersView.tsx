import { useState } from 'react'
import {
  Briefcase,
  DollarSign,
  CheckCircle2,
  X,
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
}

export function SyndicateWorkersView({
  workers,
  payments,
  onRegisterPayment,
}: SyndicateWorkersViewProps) {
  const [isPayModalOpen, setIsPayModalOpen] = useState(false)
  const [selectedWorkerId, setSelectedWorkerId] = useState(workers[0]?.id || '')
  const [payType, setPayType] = useState<UnionWorkerPayment['type']>('salary')
  const [periodOrConcept, setPeriodOrConcept] = useState('Sueldo Mes Octubre 2026')
  const [amount, setAmount] = useState<number>(2600)
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'transfer'>('cash')
  const [notes, setNotes] = useState('')
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
            <h3 className="text-base font-black text-slate-900 tracking-tight">Personal & Trabajadores del Sindicato</h3>
            <p className="text-xs text-slate-500">Planilla operativa, control de anticipos, sueldos y viáticos por viaje</p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setIsPayModalOpen(true)}
          className="px-4 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-500 font-bold text-white text-xs flex items-center gap-2 shadow-xs transition"
        >
          <DollarSign className="w-4 h-4" />
          <span>Registrar Pago / Anticipo</span>
        </button>
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
              <div className="text-xs text-slate-500">CI: {w.ci} · Tel: {w.phone}</div>

              <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs">
                <div>
                  <span className="text-[10px] text-slate-400 block">Acordado / Base:</span>
                  <span className="font-bold text-slate-800">Bs. {w.agreedAmount.toFixed(2)} ({w.paymentModality === 'monthly' ? 'Mensual' : 'Por viaje'})</span>
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
          <div className="p-8 text-center text-slate-400 text-xs">
            No hay pagos a trabajadores registrados en este turno.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50/50 border-b border-slate-200 text-[11px] font-bold text-slate-600 uppercase">
                  <th className="py-2.5 px-4">Fecha</th>
                  <th className="py-2.5 px-3">Comprobante</th>
                  <th className="py-2.5 px-4">Trabajador</th>
                  <th className="py-2.5 px-3">Tipo / Concepto</th>
                  <th className="py-2.5 px-3">Método</th>
                  <th className="py-2.5 px-4 text-right">Importe</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {payments.map(p => (
                  <tr key={p.id} className="hover:bg-slate-50/70">
                    <td className="py-2.5 px-4 text-slate-600">{new Date(p.date).toLocaleDateString('es-BO')}</td>
                    <td className="py-2.5 px-3 font-mono font-bold text-slate-800">{p.receiptNumber}</td>
                    <td className="py-2.5 px-4 font-bold text-slate-900">{p.workerName}</td>
                    <td className="py-2.5 px-3">
                      <span className="font-semibold text-slate-800">{p.periodOrConcept}</span>
                      <span className="text-[10px] text-slate-400 block uppercase">{p.type}</span>
                    </td>
                    <td className="py-2.5 px-3 font-medium text-slate-700">{p.paymentMethod.toUpperCase()}</td>
                    <td className="py-2.5 px-4 text-right font-black text-slate-950">Bs. {p.amount.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal para registrar pago */}
      {isPayModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-2 sm:p-4 overflow-y-auto">
          <div className="relative w-full max-w-lg bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden my-auto max-h-[92vh] flex flex-col font-sans">
            <div className="bg-slate-900 text-white px-5 py-3.5 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2">
                <DollarSign className="w-5 h-5 text-amber-400" />
                <h3 className="font-black text-sm sm:text-base">Registrar Pago a Trabajador</h3>
              </div>
              <button type="button" onClick={() => setIsPayModalOpen(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleExecutePayment} className="p-5 space-y-3.5 text-xs sm:text-sm overflow-y-auto">
              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">Trabajador *</label>
                <select
                  value={selectedWorkerId}
                  onChange={e => handleSelectWorkerChange(e.target.value)}
                  className="w-full bg-white border border-slate-300 rounded-lg p-2 font-bold text-slate-900"
                  required
                >
                  {workers.map(w => (
                    <option key={w.id} value={w.id}>{w.fullName} ({w.role})</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">Tipo de Pago</label>
                  <select
                    value={payType}
                    onChange={e => setPayType(e.target.value as any)}
                    className="w-full bg-white border border-slate-300 rounded-lg p-2 font-medium"
                  >
                    <option value="salary">Sueldo / Salario Completo</option>
                    <option value="advance">Anticipo de Sueldo</option>
                    <option value="travel_allowance">Viático / Pago por Viaje</option>
                    <option value="bonus">Bono / Gratificación</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">Medio de Pago</label>
                  <select
                    value={paymentMethod}
                    onChange={e => setPaymentMethod(e.target.value as any)}
                    className="w-full bg-white border border-slate-300 rounded-lg p-2 font-bold"
                  >
                    <option value="cash">Efectivo (Sale de Caja)</option>
                    <option value="transfer">Transferencia Bancaria</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">Concepto / Glosa *</label>
                <input
                  type="text"
                  placeholder="Ej. Anticipo de Quincena Octubre 2026"
                  value={periodOrConcept}
                  onChange={e => setPeriodOrConcept(e.target.value)}
                  className="w-full bg-white border border-slate-300 rounded-lg p-2 font-medium"
                  required
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">Importe a Pagar (Bs.) *</label>
                <input
                  type="number"
                  min="1"
                  step="10"
                  value={amount}
                  onChange={e => setAmount(parseFloat(e.target.value) || 0)}
                  className="w-full bg-white border border-slate-300 rounded-lg p-2 font-black text-slate-900 text-base"
                  required
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">Observaciones</label>
                <input
                  type="text"
                  placeholder="Detalles adicionales..."
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  className="w-full bg-white border border-slate-300 rounded-lg p-2 text-xs"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsPayModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-slate-300 font-bold text-xs text-slate-700 hover:bg-slate-100"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 font-bold text-xs text-white shadow-xs"
                >
                  Registrar Pago
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
