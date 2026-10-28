import { useState } from 'react'
import {
  CreditCard,
  PlusCircle,
  CheckCircle2,
  FileDown,
  X,
} from 'lucide-react'
import type { UnionMonthlyDue, UnionMember, UnionDuePayment } from '../types'
import { generateUnionDueReceiptPdf } from '../domain/parcelDocuments'

interface SyndicateDuesViewProps {
  dues: UnionMonthlyDue[]
  members: UnionMember[]
  onGeneratePeriod: (period: string, periodLabel: string, dueDate: string) => { createdCount: number; skippedCount: number }
  onPayDue: (params: {
    dueId: string
    amount: number
    paymentMethod: 'cash' | 'qr' | 'transfer'
    notes?: string
  }) => UnionMonthlyDue
}

export function SyndicateDuesView({
  dues,
  members,
  onGeneratePeriod,
  onPayDue,
}: SyndicateDuesViewProps) {
  const [selectedPeriod, setSelectedPeriod] = useState('2026-10')
  const [statusFilter, setStatusFilter] = useState<'all' | 'paid' | 'pending' | 'partial'>('all')

  // Modal de cobro de mensualidad
  const [activeDueToPay, setActiveDueToPay] = useState<UnionMonthlyDue | null>(null)
  const [payAmount, setPayAmount] = useState<number>(150)
  const [payMethod, setPayMethod] = useState<'cash' | 'qr' | 'transfer'>('cash')
  const [payNotes, setPayNotes] = useState('')
  const [generatedReceiptDue, setGeneratedReceiptDue] = useState<{ due: UnionMonthlyDue; payment: UnionDuePayment } | null>(null)
  const [feedbackMsg, setFeedbackMsg] = useState<string | null>(null)

  const periods = [
    { id: '2026-10', label: 'Octubre 2026', dueDate: '2026-10-31' },
    { id: '2026-11', label: 'Noviembre 2026', dueDate: '2026-11-30' },
    { id: '2026-12', label: 'Diciembre 2026', dueDate: '2026-12-31' },
  ]

  const currentPeriodConfig = periods.find(p => p.id === selectedPeriod) || periods[0]

  const duesInPeriod = dues.filter(d => d.period === selectedPeriod)

  const filteredDues = duesInPeriod.filter(d => {
    if (statusFilter === 'all') return true
    if (statusFilter === 'paid') return d.status === 'paid'
    if (statusFilter === 'partial') return d.status === 'partial'
    if (statusFilter === 'pending') return d.status === 'pending' || d.status === 'overdue'
    return true
  })

  // Métricas
  const totalDuesInPeriod = duesInPeriod.length
  const paidCount = duesInPeriod.filter(d => d.status === 'paid').length
  const overdueCount = duesInPeriod.filter(d => d.balance > 0).length
  const totalCollected = duesInPeriod.reduce((acc, d) => acc + d.paidAmount, 0)
  const totalPendingDebt = duesInPeriod.reduce((acc, d) => acc + d.balance, 0)

  const handleGeneratePeriodDues = () => {
    const res = onGeneratePeriod(
      currentPeriodConfig.id,
      currentPeriodConfig.label,
      currentPeriodConfig.dueDate
    )
    setFeedbackMsg(
      `Generación completada: ${res.createdCount} cuotas creadas para socios activos (${res.skippedCount} omitidas por existir previamente).`
    )
    setTimeout(() => setFeedbackMsg(null), 5000)
  }

  const openPayModal = (due: UnionMonthlyDue) => {
    setActiveDueToPay(due)
    setPayAmount(due.balance) // Por defecto saldo total restante
    setPayMethod('cash')
    setPayNotes('')
    setGeneratedReceiptDue(null)
  }

  const handleExecutePayment = (e: React.FormEvent) => {
    e.preventDefault()
    if (!activeDueToPay) return

    const updated = onPayDue({
      dueId: activeDueToPay.id,
      amount: payAmount,
      paymentMethod: payMethod,
      notes: payNotes.trim() || undefined,
    })

    const latestPayment = updated.payments[updated.payments.length - 1]
    setGeneratedReceiptDue({ due: updated, payment: latestPayment })
  }

  const handleDownloadReceiptPdf = async (due: UnionMonthlyDue, payment: UnionDuePayment) => {
    const { url, filename } = await generateUnionDueReceiptPdf(due, payment)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  }

  return (
    <div className="space-y-4 font-sans text-slate-800">
      {/* Barra de cabecera con períodos y generación */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200/90 shadow-xs flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-900 border border-amber-300 flex items-center justify-center font-bold">
            <CreditCard className="w-5 h-5 text-amber-700" />
          </div>
          <div>
            <h3 className="text-base font-black text-slate-900 tracking-tight">Administración de Mensualidades</h3>
            <p className="text-xs text-slate-500">Cobro de aportes sindicales, cuotas sociales y emisión de recibos ({members.length} socios registrados)</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <select
            value={selectedPeriod}
            onChange={e => setSelectedPeriod(e.target.value)}
            className="bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs font-bold text-slate-800"
          >
            {periods.map(p => (
              <option key={p.id} value={p.id}>Período: {p.label}</option>
            ))}
          </select>

          <button
            type="button"
            onClick={handleGeneratePeriodDues}
            className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-bold text-xs flex items-center gap-1.5 shadow-xs transition"
          >
            <PlusCircle className="w-4 h-4" />
            <span>Generar Cuotas del Mes</span>
          </button>
        </div>
      </div>

      {feedbackMsg && (
        <div className="p-3 bg-teal-50 border border-teal-200 text-teal-800 rounded-xl text-xs font-semibold flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-teal-600 shrink-0" />
          <span>{feedbackMsg}</span>
        </div>
      )}

      {/* Métricas del período seleccionado */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="p-3.5 bg-white border border-slate-200 rounded-2xl">
          <span className="text-[11px] font-bold text-slate-500 block">Socios al Día</span>
          <span className="text-xl font-black text-emerald-700">{paidCount}</span>
          <span className="text-[10px] text-slate-400 block mt-0.5">de {totalDuesInPeriod} cuotas generadas</span>
        </div>

        <div className="p-3.5 bg-white border border-slate-200 rounded-2xl">
          <span className="text-[11px] font-bold text-slate-500 block">Con Saldo Pendiente</span>
          <span className="text-xl font-black text-red-600">{overdueCount}</span>
          <span className="text-[10px] text-slate-400 block mt-0.5">socios con cuota por pagar</span>
        </div>

        <div className="p-3.5 bg-white border border-slate-200 rounded-2xl">
          <span className="text-[11px] font-bold text-slate-500 block">Total Recaudado</span>
          <span className="text-xl font-black text-slate-900">Bs. {totalCollected.toFixed(2)}</span>
          <span className="text-[10px] text-slate-400 block mt-0.5">ingresos a caja de cuotas</span>
        </div>

        <div className="p-3.5 bg-white border border-slate-200 rounded-2xl">
          <span className="text-[11px] font-bold text-slate-500 block">Deuda por Cobrar</span>
          <span className="text-xl font-black text-amber-700">Bs. {totalPendingDebt.toFixed(2)}</span>
          <span className="text-[10px] text-slate-400 block mt-0.5">en el período {currentPeriodConfig.label}</span>
        </div>
      </div>

      {/* Filtros de estado de cuotas */}
      <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs font-bold w-fit">
        <button
          type="button"
          onClick={() => setStatusFilter('all')}
          className={`px-3 py-1 rounded-lg transition ${statusFilter === 'all' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'}`}
        >
          Todas ({duesInPeriod.length})
        </button>
        <button
          type="button"
          onClick={() => setStatusFilter('paid')}
          className={`px-3 py-1 rounded-lg transition ${statusFilter === 'paid' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'}`}
        >
          Al Día ({paidCount})
        </button>
        <button
          type="button"
          onClick={() => setStatusFilter('pending')}
          className={`px-3 py-1 rounded-lg transition ${statusFilter === 'pending' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'}`}
        >
          Pendientes ({overdueCount})
        </button>
      </div>

      {/* Tabla de cuotas del período */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
        {filteredDues.length === 0 ? (
          <div className="p-10 text-center text-slate-400 text-xs">
            No hay cuotas generadas para este período. Haz clic en "Generar Cuotas del Mes" para crear los compromisos de los socios activos.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-bold text-slate-600 uppercase tracking-wider">
                  <th className="py-3 px-4">Socio / Afiliado</th>
                  <th className="py-3 px-3">N° Socio</th>
                  <th className="py-3 px-3">Cuota</th>
                  <th className="py-3 px-3">Abonado</th>
                  <th className="py-3 px-3">Saldo</th>
                  <th className="py-3 px-3 text-center">Estado</th>
                  <th className="py-3 px-4 text-right">Acción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredDues.map(d => (
                  <tr key={d.id} className="hover:bg-slate-50/70 transition">
                    <td className="py-3 px-4">
                      <div className="font-bold text-slate-900">{d.memberName}</div>
                      <div className="text-[10px] text-slate-400">{d.periodLabel}</div>
                    </td>
                    <td className="py-3 px-3 font-mono font-bold text-slate-700">{d.memberNumber}</td>
                    <td className="py-3 px-3 font-semibold text-slate-800">Bs. {d.amount.toFixed(2)}</td>
                    <td className="py-3 px-3 font-semibold text-emerald-700">Bs. {d.paidAmount.toFixed(2)}</td>
                    <td className="py-3 px-3 font-bold text-slate-900">
                      {d.balance > 0 ? (
                        <span className="text-red-600">Bs. {d.balance.toFixed(2)}</span>
                      ) : (
                        <span className="text-emerald-700">Bs. 0.00</span>
                      )}
                    </td>
                    <td className="py-3 px-3 text-center">
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${d.status === 'paid' ? 'bg-emerald-100 text-emerald-800' : d.status === 'partial' ? 'bg-amber-100 text-amber-800' : 'bg-red-100 text-red-800'}`}
                      >
                        {d.status === 'paid' ? 'AL DÍA' : d.status === 'partial' ? 'PAGO PARCIAL' : 'PENDIENTE'}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right">
                      {d.balance > 0 ? (
                        <button
                          type="button"
                          onClick={() => openPayModal(d)}
                          className="px-3 py-1.5 rounded-lg bg-teal-600 hover:bg-teal-500 font-bold text-white text-xs shadow-xs transition"
                        >
                          Cobrar Cuota
                        </button>
                      ) : (
                        d.payments.length > 0 && (
                          <button
                            type="button"
                            onClick={() => handleDownloadReceiptPdf(d, d.payments[d.payments.length - 1])}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs transition"
                            title="Descargar comprobante en PDF"
                          >
                            <FileDown className="w-3.5 h-3.5" />
                            <span>Recibo PDF</span>
                          </button>
                        )
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal para registrar cobro de cuota */}
      {activeDueToPay && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-2 sm:p-4 overflow-y-auto">
          <div className="relative w-full max-w-lg bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden my-auto max-h-[92vh] flex flex-col font-sans">
            <div className="bg-slate-900 text-white px-5 py-3.5 flex items-center justify-between shrink-0">
              <div>
                <h3 className="font-black text-sm sm:text-base">Cobro de Mensualidad Sindical</h3>
                <p className="text-xs text-slate-300 font-mono">
                  {activeDueToPay.memberNumber} · {activeDueToPay.memberName}
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setActiveDueToPay(null)
                  setGeneratedReceiptDue(null)
                }}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {generatedReceiptDue ? (
              /* Confirmación de pago con recibo listo */
              <div className="p-6 text-center space-y-4">
                <div className="w-14 h-14 bg-emerald-100 text-emerald-800 rounded-full flex items-center justify-center mx-auto">
                  <CheckCircle2 className="w-8 h-8" />
                </div>
                <h4 className="text-lg font-black text-slate-900">¡Pago Registrado Exitosamente!</h4>
                <p className="text-xs text-slate-600">
                  Comprobante N° <strong className="font-mono text-emerald-800">{generatedReceiptDue.payment.receiptNumber}</strong> por Bs.{' '}
                  <strong>{generatedReceiptDue.payment.amount.toFixed(2)}</strong> ({generatedReceiptDue.due.periodLabel}).
                </p>

                <div className="flex items-center justify-center gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => handleDownloadReceiptPdf(generatedReceiptDue.due, generatedReceiptDue.payment)}
                    className="px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-500 font-bold text-xs text-white flex items-center gap-1.5 shadow-sm"
                  >
                    <FileDown className="w-4 h-4" />
                    <span>Descargar Comprobante PDF</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setActiveDueToPay(null)
                      setGeneratedReceiptDue(null)
                    }}
                    className="px-4 py-2 rounded-xl border border-slate-300 font-bold text-xs text-slate-700 hover:bg-slate-100"
                  >
                    Cerrar
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleExecutePayment} className="p-5 space-y-4 text-xs sm:text-sm">
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl space-y-1">
                  <div className="flex justify-between">
                    <span className="text-slate-600">Período:</span>
                    <strong className="text-slate-900">{activeDueToPay.periodLabel}</strong>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-600">Total Obligación:</span>
                    <strong className="text-slate-900">Bs. {activeDueToPay.amount.toFixed(2)}</strong>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-600">Saldo Pendiente:</span>
                    <strong className="text-red-700 font-bold">Bs. {activeDueToPay.balance.toFixed(2)}</strong>
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">Monto a Cobrar (Bs.) *</label>
                  <input
                    type="number"
                    min="1"
                    max={activeDueToPay.balance}
                    step="5"
                    value={payAmount}
                    onChange={e => setPayAmount(parseFloat(e.target.value) || 0)}
                    className="w-full bg-white border border-slate-300 rounded-lg p-2 font-black text-slate-900 text-base"
                    required
                  />
                  <span className="text-[10px] text-slate-500 mt-0.5 block">
                    Puedes registrar el pago total o un pago parcial a cuenta.
                  </span>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">Medio de Pago *</label>
                  <select
                    value={payMethod}
                    onChange={e => setPayMethod(e.target.value as any)}
                    className="w-full bg-white border border-slate-300 rounded-lg p-2 font-bold text-slate-900 text-xs"
                  >
                    <option value="cash">Efectivo en Caja</option>
                    <option value="qr">Pago QR (Simple / Transferencia)</option>
                    <option value="transfer">Depósito Bancario</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">Notas / Glosa de Secretaría</label>
                  <input
                    type="text"
                    placeholder="Ej. Cuota cancelada en reunión ordinaria"
                    value={payNotes}
                    onChange={e => setPayNotes(e.target.value)}
                    className="w-full bg-white border border-slate-300 rounded-lg p-2 text-xs"
                  />
                </div>

                <div className="flex items-center justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setActiveDueToPay(null)}
                    className="px-4 py-2 rounded-xl border border-slate-300 font-bold text-xs text-slate-700 hover:bg-slate-100"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2 rounded-xl bg-teal-600 hover:bg-teal-500 font-bold text-xs text-white shadow-xs"
                  >
                    Confirmar Cobro e Imprimir Recibo
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
