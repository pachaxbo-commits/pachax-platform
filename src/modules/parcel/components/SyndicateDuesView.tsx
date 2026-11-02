import { useState } from 'react'
import {
  CreditCard,
  PlusCircle,
  CheckCircle2,
  FileDown,
  X,
  History,
  RotateCcw,
  Calendar,
  AlertTriangle,
  Layers,
} from 'lucide-react'
import type { UnionMonthlyDue, UnionMember, UnionDuePayment } from '../types'
import { generateUnionDueReceiptPdf } from '../domain/parcelDocuments'
import { calculateDuesCollectionForPeriod } from '../domain/parcelEngine'

const MONTH_NAMES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
]

function getPeriodConfig(year: number, month: number) {
  const monthStr = String(month).padStart(2, '0')
  const id = `${year}-${monthStr}`
  const label = `${MONTH_NAMES[month - 1]} ${year}`
  const lastDay = new Date(year, month, 0).getDate()
  const dueDate = `${year}-${monthStr}-${String(lastDay).padStart(2, '0')}`
  return { id, label, dueDate }
}

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
  onRevertPayment?: (params: {
    dueId: string
    paymentId: string
    reason: string
    reversalType: 'documentary_void' | 'refund'
    refundMethod: 'none' | 'cash' | 'transfer'
  }) => void
  companyInfo?: import("../types").DocumentCompanyContext
}

export function SyndicateDuesView({
  dues,
  members,
  onGeneratePeriod,
  onPayDue,
  onRevertPayment,
  companyInfo,
}: SyndicateDuesViewProps) {
  const currentYear = new Date().getFullYear()

  // Selección dinámica de Año y Mes
  const [selectedYear, setSelectedYear] = useState<number>(() => {
    if (dues.length > 0 && dues[0].period) {
      const y = parseInt(dues[0].period.slice(0, 4), 10)
      if (!isNaN(y)) return y
    }
    return currentYear
  })

  const [selectedMonth, setSelectedMonth] = useState<number>(() => {
    if (dues.length > 0 && dues[0].period) {
      const m = parseInt(dues[0].period.slice(5, 7), 10)
      if (!isNaN(m)) return m
    }
    return 10
  })

  const [viewAllPeriods, setViewAllPeriods] = useState<boolean>(false)
  const [statusFilter, setStatusFilter] = useState<'all' | 'paid' | 'pending' | 'partial'>('all')

  // Modal de cobro de mensualidad
  const [activeDueToPay, setActiveDueToPay] = useState<UnionMonthlyDue | null>(null)
  const [payAmount, setPayAmount] = useState<number>(150)
  const [payMethod, setPayMethod] = useState<'cash' | 'qr' | 'transfer'>('cash')
  const [payNotes, setPayNotes] = useState('')
  const [generatedReceiptDue, setGeneratedReceiptDue] = useState<{ due: UnionMonthlyDue; payment: UnionDuePayment } | null>(null)
  const [feedbackMsg, setFeedbackMsg] = useState<string | null>(null)

  // Modal de historial de pagos y anulación
  const [historyModalDue, setHistoryModalDue] = useState<UnionMonthlyDue | null>(null)
  const [paymentToRevert, setPaymentToRevert] = useState<UnionDuePayment | null>(null)
  const [reversalType, setReversalType] = useState<'documentary_void' | 'refund'>('documentary_void')
  const [refundMethod, setRefundMethod] = useState<'none' | 'cash' | 'transfer'>('cash')
  const [reversalReason, setReversalReason] = useState('')
  const [reversalError, setReversalError] = useState<string | null>(null)

  const currentPeriodConfig = getPeriodConfig(selectedYear, selectedMonth)

  // Años disponibles en el selector
  const existingYears = Array.from(new Set(dues.map(d => parseInt(d.period.slice(0, 4), 10)).filter(y => !isNaN(y))))
  const yearOptions = Array.from(new Set([currentYear - 1, currentYear, currentYear + 1, currentYear + 2, ...existingYears])).sort()
  const existingPeriodIds = Array.from(new Set(dues.map(d => d.period))).sort()

  const duesInPeriod = viewAllPeriods
    ? dues
    : dues.filter(d => d.period === currentPeriodConfig.id)

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
  // Recaudación efectiva basada estrictamente en fechas de pago reales del período
  const totalCollected = viewAllPeriods
    ? dues.reduce((acc, d) => {
        const validPayments = (d.payments || []).filter(p => !p.isReversed)
        return acc + validPayments.reduce((pAcc, p) => pAcc + p.amount, 0)
      }, 0)
    : calculateDuesCollectionForPeriod(dues, currentPeriodConfig.id)
  const totalPendingDebt = duesInPeriod.reduce((acc, d) => acc + d.balance, 0)

  const handleGeneratePeriodDues = () => {
    const res = onGeneratePeriod(
      currentPeriodConfig.id,
      currentPeriodConfig.label,
      currentPeriodConfig.dueDate
    )
    setFeedbackMsg(
      `Generación completada para ${currentPeriodConfig.label}: ${res.createdCount} cuotas creadas para socios (${res.skippedCount} omitidas por existir previamente).`
    )
    setViewAllPeriods(false)
    setTimeout(() => setFeedbackMsg(null), 6000)
  }

  const openPayModal = (due: UnionMonthlyDue) => {
    setActiveDueToPay(due)
    setPayAmount(due.balance)
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

  const openHistoryModal = (due: UnionMonthlyDue) => {
    setHistoryModalDue(due)
    setPaymentToRevert(null)
    setReversalReason('')
    setReversalError(null)
  }

  const handleExecuteReversal = (e: React.FormEvent) => {
    e.preventDefault()
    if (!historyModalDue || !paymentToRevert) return

    if (!reversalReason.trim() || reversalReason.trim().length < 4) {
      setReversalError('Debe ingresar un motivo explicativo de al menos 4 caracteres.')
      return
    }

    if (onRevertPayment) {
      onRevertPayment({
        dueId: historyModalDue.id,
        paymentId: paymentToRevert.id,
        reason: reversalReason.trim(),
        reversalType,
        refundMethod: reversalType === 'refund' ? refundMethod : 'none',
      })
    }

    // Actualizar vista local
    const freshDue = dues.find(d => d.id === historyModalDue.id)
    if (freshDue) {
      setHistoryModalDue(freshDue)
    } else {
      setHistoryModalDue(null)
    }

    setPaymentToRevert(null)
    setReversalReason('')
    setReversalError(null)
    setFeedbackMsg(
      reversalType === 'refund'
        ? 'Reversión y devolución efectiva procesada. Se actualizó el saldo y el flujo de caja.'
        : 'Anulación de registro completada. Se anuló el ingreso documental sin salida indebida de gaveta.'
    )
    setTimeout(() => setFeedbackMsg(null), 6000)
  }

  const handleDownloadReceiptPdf = async (due: UnionMonthlyDue, payment: UnionDuePayment) => {
    const { url, filename } = await generateUnionDueReceiptPdf(due, payment, companyInfo)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  }

  return (
    <div className="space-y-4 font-sans text-slate-800">
      {/* Barra de cabecera con períodos dinámicos y generación */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200/90 shadow-xs flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-900 border border-amber-300 flex items-center justify-center font-bold">
            <CreditCard className="w-5 h-5 text-amber-700" />
          </div>
          <div>
            <h3 className="text-base font-black text-slate-900 tracking-tight">Administración de Mensualidades</h3>
            <p className="text-xs text-slate-500">
              Aportes y cuotas sociales ({members.length} socios registrados) · Operación dinámica multianual
            </p>
          </div>
        </div>

        {/* Selector dinámico de Año, Mes y Período */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-300 rounded-xl p-1">
            <Calendar className="w-4 h-4 text-slate-500 ml-1.5" />
            <select
              value={selectedMonth}
              disabled={viewAllPeriods}
              onChange={e => {
                setSelectedMonth(parseInt(e.target.value, 10))
                setViewAllPeriods(false)
              }}
              className="bg-transparent text-xs font-bold text-slate-800 py-1 px-1.5 focus:outline-hidden disabled:opacity-50"
            >
              {MONTH_NAMES.map((name, idx) => (
                <option key={idx + 1} value={idx + 1}>
                  {name}
                </option>
              ))}
            </select>

            <select
              value={selectedYear}
              disabled={viewAllPeriods}
              onChange={e => {
                setSelectedYear(parseInt(e.target.value, 10))
                setViewAllPeriods(false)
              }}
              className="bg-transparent text-xs font-bold text-slate-800 py-1 px-1.5 border-l border-slate-200 focus:outline-hidden disabled:opacity-50"
            >
              {yearOptions.map(y => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </div>

          <button
            type="button"
            onClick={() => setViewAllPeriods(!viewAllPeriods)}
            className={`px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition ${viewAllPeriods ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}
            title="Ver todo el historial de cuotas de todos los períodos"
          >
            <Layers className="w-3.5 h-3.5" />
            <span>{viewAllPeriods ? 'Viendo Todo' : 'Ver Todos'}</span>
          </button>

          <button
            type="button"
            onClick={handleGeneratePeriodDues}
            className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-bold text-xs flex items-center gap-1.5 shadow-xs transition"
          >
            <PlusCircle className="w-4 h-4" />
            <span>Generar Cuotas {currentPeriodConfig.label}</span>
          </button>
        </div>
      </div>

      {/* Selector rápido de períodos existentes con registros */}
      {existingPeriodIds.length > 0 && (
        <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-200 flex flex-wrap items-center gap-2 text-xs">
          <span className="font-bold text-slate-500 text-[11px] uppercase tracking-wider mr-1">Períodos con datos:</span>
          {existingPeriodIds.map(pid => {
            const y = parseInt(pid.slice(0, 4), 10)
            const m = parseInt(pid.slice(5, 7), 10)
            const isSelected = !viewAllPeriods && selectedYear === y && selectedMonth === m
            return (
              <button
                key={pid}
                type="button"
                onClick={() => {
                  setSelectedYear(y)
                  setSelectedMonth(m)
                  setViewAllPeriods(false)
                }}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition ${isSelected ? 'bg-amber-600 text-white shadow-xs' : 'bg-white text-slate-700 hover:bg-slate-200 border border-slate-200'}`}
              >
                {MONTH_NAMES[m - 1]} {y}
              </button>
            )
          })}
        </div>
      )}

      {/* Banner de feedback */}
      {feedbackMsg && (
        <div className="p-3.5 bg-emerald-50 border border-emerald-300 rounded-xl text-emerald-900 text-xs font-semibold flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
          <span>{feedbackMsg}</span>
        </div>
      )}

      {/* Tarjetas resumen */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
        <div className="bg-white p-3.5 rounded-2xl border border-slate-200/90 shadow-xs">
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
            {viewAllPeriods ? 'Cuotas Registradas (Todo)' : `Cuotas (${currentPeriodConfig.label})`}
          </span>
          <div className="text-xl font-black text-slate-900 mt-1">{totalDuesInPeriod}</div>
          <span className="text-[10px] text-slate-500">{paidCount} socios al día</span>
        </div>

        <div className="bg-white p-3.5 rounded-2xl border border-slate-200/90 shadow-xs">
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">Cobrado Acumulado</span>
          <div className="text-xl font-black text-emerald-700 mt-1">Bs. {totalCollected.toFixed(2)}</div>
          <span className="text-[10px] text-emerald-600">Aportes ingresados</span>
        </div>

        <div className="bg-white p-3.5 rounded-2xl border border-slate-200/90 shadow-xs">
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">Deuda Pendiente</span>
          <div className="text-xl font-black text-amber-700 mt-1">Bs. {totalPendingDebt.toFixed(2)}</div>
          <span className="text-[10px] text-amber-600">{overdueCount} cuotas con saldo</span>
        </div>

        <div className="bg-white p-3.5 rounded-2xl border border-slate-200/90 shadow-xs">
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">Cumplimiento</span>
          <div className="text-xl font-black text-teal-800 mt-1">
            {totalDuesInPeriod > 0 ? Math.round((paidCount / totalDuesInPeriod) * 100) : 0}%
          </div>
          <span className="text-[10px] text-slate-500">Tasa de cobranza</span>
        </div>
      </div>

      {/* Filtros de estado */}
      <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl w-fit text-xs font-bold">
        <button
          type="button"
          onClick={() => setStatusFilter('all')}
          className={`px-3 py-1 rounded-lg transition ${statusFilter === 'all' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'}`}
        >
          Todas ({totalDuesInPeriod})
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
          onClick={() => setStatusFilter('partial')}
          className={`px-3 py-1 rounded-lg transition ${statusFilter === 'partial' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'}`}
        >
          Parciales ({duesInPeriod.filter(d => d.status === 'partial').length})
        </button>
        <button
          type="button"
          onClick={() => setStatusFilter('pending')}
          className={`px-3 py-1 rounded-lg transition ${statusFilter === 'pending' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'}`}
        >
          Pendientes ({overdueCount})
        </button>
      </div>

      {/* Tabla de cuotas */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
        {filteredDues.length === 0 ? (
          <div className="p-10 text-center text-slate-400 text-xs">
            No hay cuotas generadas para {viewAllPeriods ? 'el historial' : currentPeriodConfig.label}. Haz clic en "Generar Cuotas" para crear las obligaciones del período seleccionado.
          </div>
        ) : (
          <>
            {/* Vista Móvil: Tarjetas optimizadas para celular */}
            <div className="md:hidden divide-y divide-slate-100">
              {filteredDues.map(d => (
                <div key={d.id} className="p-3.5 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-xs bg-slate-100 text-slate-700 px-2 py-0.5 rounded-md">
                        {d.memberNumber}
                      </span>
                      <span className="font-bold text-slate-900 text-xs">{d.memberName}</span>
                    </div>
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${d.status === 'paid' ? 'bg-emerald-100 text-emerald-800' : d.status === 'partial' ? 'bg-amber-100 text-amber-800' : 'bg-red-100 text-red-800'}`}
                    >
                      {d.status === 'paid' ? 'AL DÍA' : d.status === 'partial' ? 'PARCIAL' : 'PENDIENTE'}
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-xs text-slate-500">
                    <span>Período: <strong className="text-slate-800 font-semibold">{d.periodLabel}</strong></span>
                    <span>Vence: <strong className="text-slate-700">{d.dueDate}</strong></span>
                  </div>

                  <div className="grid grid-cols-3 gap-2 bg-slate-50 p-2.5 rounded-xl text-center text-xs border border-slate-100">
                    <div>
                      <span className="text-[10px] text-slate-400 block font-semibold uppercase">Cuota</span>
                      <strong className="text-slate-800">Bs. {d.amount.toFixed(2)}</strong>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 block font-semibold uppercase">Abonado</span>
                      <strong className="text-emerald-700">Bs. {d.paidAmount.toFixed(2)}</strong>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 block font-semibold uppercase">Saldo</span>
                      <strong className={d.balance > 0 ? 'text-red-600 font-black' : 'text-emerald-700'}>
                        Bs. {d.balance.toFixed(2)}
                      </strong>
                    </div>
                  </div>

                  <div className="flex items-center justify-end gap-2 pt-1">
                    {d.payments.length > 0 && (
                      <button
                        type="button"
                        onClick={() => openHistoryModal(d)}
                        className="flex-1 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs transition flex items-center justify-center gap-1.5 cursor-pointer"
                      >
                        <History className="w-3.5 h-3.5 text-slate-500" />
                        <span>Pagos ({d.payments.filter(p => !p.isReversed).length})</span>
                      </button>
                    )}
                    {d.balance > 0 && (
                      <button
                        type="button"
                        onClick={() => openPayModal(d)}
                        className="flex-1 py-2 rounded-xl bg-teal-600 hover:bg-teal-500 font-bold text-white text-xs shadow-xs transition flex items-center justify-center cursor-pointer"
                      >
                        Cobrar Cuota
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Vista Desktop: Tabla con scroll horizontal */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-bold text-slate-600 uppercase tracking-wider">
                    <th className="py-3 px-4">Socio / Afiliado</th>
                    <th className="py-3 px-3">N° Socio</th>
                    <th className="py-3 px-3">Período</th>
                    <th className="py-3 px-3">Cuota</th>
                    <th className="py-3 px-3">Abonado</th>
                    <th className="py-3 px-3">Saldo</th>
                    <th className="py-3 px-3 text-center">Estado</th>
                    <th className="py-3 px-4 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredDues.map(d => (
                    <tr key={d.id} className="hover:bg-slate-50/70 transition">
                      <td className="py-3 px-4">
                        <div className="font-bold text-slate-900">{d.memberName}</div>
                        <div className="text-[10px] text-slate-400">Vence: {d.dueDate}</div>
                      </td>
                      <td className="py-3 px-3 font-mono font-bold text-slate-700">{d.memberNumber}</td>
                      <td className="py-3 px-3 text-slate-700 font-semibold">{d.periodLabel}</td>
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
                        <div className="flex items-center justify-end gap-1.5">
                          {d.payments.length > 0 && (
                            <button
                              type="button"
                              onClick={() => openHistoryModal(d)}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs transition"
                              title="Ver pagos y opción de anulación"
                            >
                              <History className="w-3.5 h-3.5 text-slate-500" />
                              <span>Pagos ({d.payments.filter(p => !p.isReversed).length})</span>
                            </button>
                          )}
                          {d.balance > 0 && (
                            <button
                              type="button"
                              onClick={() => openPayModal(d)}
                              className="px-3 py-1 rounded-lg bg-teal-600 hover:bg-teal-500 font-bold text-white text-xs shadow-xs transition"
                            >
                              Cobrar
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
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
                  {activeDueToPay.memberNumber} · {activeDueToPay.memberName} ({activeDueToPay.periodLabel})
                </p>
              </div>
              <button
                type="button"
                onClick={() => setActiveDueToPay(null)}
                className="text-slate-400 hover:text-white p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-4 text-xs sm:text-sm">
              {generatedReceiptDue ? (
                <div className="p-4 bg-emerald-50 border border-emerald-300 rounded-xl text-center space-y-3">
                  <div className="w-10 h-10 rounded-full bg-emerald-500 text-white flex items-center justify-center mx-auto font-bold">
                    ✓
                  </div>
                  <h4 className="font-black text-emerald-950 text-base">¡Cobro Registrado Correctamente!</h4>
                  <p className="text-xs text-emerald-800">
                    Comprobante N° <strong>{generatedReceiptDue.payment.receiptNumber}</strong> por Bs.{' '}
                    <strong>{generatedReceiptDue.payment.amount.toFixed(2)}</strong> ({generatedReceiptDue.payment.paymentMethod.toUpperCase()}).
                  </p>
                  <p className="text-xs text-slate-600">
                    Saldo restante del socio para este período: <strong>Bs. {generatedReceiptDue.due.balance.toFixed(2)}</strong>.
                  </p>

                  <div className="flex justify-center gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => handleDownloadReceiptPdf(generatedReceiptDue.due, generatedReceiptDue.payment)}
                      className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs flex items-center gap-1.5 shadow-xs"
                    >
                      <FileDown className="w-4 h-4" />
                      <span>Descargar Recibo Oficial (PDF)</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveDueToPay(null)}
                      className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs"
                    >
                      Finalizar
                    </button>
                  </div>
                </div>
              ) : (
                <form onSubmit={handleExecutePayment} className="space-y-4">
                  <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs space-y-1">
                    <div className="flex justify-between">
                      <span className="text-slate-600">Cuota Total del Período:</span>
                      <strong>Bs. {activeDueToPay.amount.toFixed(2)}</strong>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-600">Abonado Previamente:</span>
                      <strong className="text-emerald-700">Bs. {activeDueToPay.paidAmount.toFixed(2)}</strong>
                    </div>
                    <div className="flex justify-between text-sm font-bold border-t border-amber-200 pt-1">
                      <span className="text-amber-950">Saldo Pendiente a Cobrar:</span>
                      <span className="text-red-700">Bs. {activeDueToPay.balance.toFixed(2)}</span>
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">
                      Importe a Cobrar (Bs.) * [Máximo: Bs. {activeDueToPay.balance.toFixed(2)}]
                    </label>
                    <input
                      type="number"
                      min="1"
                      max={activeDueToPay.balance}
                      step="1"
                      value={payAmount}
                      onChange={e => setPayAmount(Math.min(activeDueToPay.balance, parseFloat(e.target.value) || 0))}
                      className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2.5 font-black text-slate-900 text-lg"
                      required
                    />
                    <span className="text-[10px] text-slate-500 mt-0.5 block">
                      Permite cobro parcial o liquidación total del período.
                    </span>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">Método de Cobro *</label>
                    <div className="grid grid-cols-3 gap-2">
                      <button
                        type="button"
                        onClick={() => setPayMethod('cash')}
                        className={`p-2.5 rounded-lg border text-xs font-bold transition text-center ${payMethod === 'cash' ? 'bg-amber-600 text-white border-amber-600' : 'bg-slate-50 text-slate-700 border-slate-300'}`}
                      >
                        Efectivo (Gaveta)
                      </button>
                      <button
                        type="button"
                        onClick={() => setPayMethod('qr')}
                        className={`p-2.5 rounded-lg border text-xs font-bold transition text-center ${payMethod === 'qr' ? 'bg-amber-600 text-white border-amber-600' : 'bg-slate-50 text-slate-700 border-slate-300'}`}
                      >
                        QR Digital
                      </button>
                      <button
                        type="button"
                        onClick={() => setPayMethod('transfer')}
                        className={`p-2.5 rounded-lg border text-xs font-bold transition text-center ${payMethod === 'transfer' ? 'bg-amber-600 text-white border-amber-600' : 'bg-slate-50 text-slate-700 border-slate-300'}`}
                      >
                        Transferencia
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">Glosa / Observación</label>
                    <input
                      type="text"
                      placeholder="Ej. Aporte ordinario mensual..."
                      value={payNotes}
                      onChange={e => setPayNotes(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 text-xs"
                    />
                  </div>

                  <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                    <button
                      type="button"
                      onClick={() => setActiveDueToPay(null)}
                      className="px-4 py-2 rounded-xl border border-slate-300 font-bold text-slate-700 hover:bg-slate-100"
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      className="px-5 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 font-bold text-white shadow-xs"
                    >
                      Registrar Cobro & Emitir Recibo
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal de Historial de Pagos y Anulación / Reversión */}
      {historyModalDue && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-2 sm:p-4 overflow-y-auto">
          <div className="relative w-full max-w-xl bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden my-auto max-h-[92vh] flex flex-col font-sans">
            <div className="bg-slate-900 text-white px-5 py-3.5 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2">
                <History className="w-5 h-5 text-amber-400" />
                <div>
                  <h3 className="font-black text-sm sm:text-base">Historial de Pagos y Anulación</h3>
                  <p className="text-xs text-slate-300">
                    {historyModalDue.memberNumber} · {historyModalDue.memberName} ({historyModalDue.periodLabel})
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setHistoryModalDue(null)}
                className="text-slate-400 hover:text-white p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-4 text-xs">
              {paymentToRevert ? (
                /* Subformulario de confirmación de anulación / reversión */
                <form onSubmit={handleExecuteReversal} className="p-4 bg-red-50/70 border border-red-200 rounded-xl space-y-3.5">
                  <div className="flex items-center gap-2 text-red-900 font-bold">
                    <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
                    <span>Anulación / Reversión de Comprobante N° {paymentToRevert.receiptNumber}</span>
                  </div>

                  <div className="text-xs text-slate-700 bg-white p-2.5 rounded-lg border border-red-100 space-y-1">
                    <div>Importe pagado: <strong>Bs. {paymentToRevert.amount.toFixed(2)}</strong></div>
                    <div>Método registrado: <strong>{paymentToRevert.paymentMethod.toUpperCase()}</strong></div>
                    <div>Fecha original: <strong>{new Date(paymentToRevert.date).toLocaleString('es-BO')}</strong></div>
                  </div>

                  {reversalError && (
                    <div className="p-2 bg-red-100 text-red-800 rounded-lg font-semibold text-xs">
                      {reversalError}
                    </div>
                  )}

                  <div>
                    <label className="block text-[11px] font-bold text-slate-800 mb-1.5">
                      Modalidad de Reversión *
                    </label>
                    <div className="space-y-2">
                      <label className="flex items-start gap-2 p-2 bg-white rounded-lg border border-slate-200 cursor-pointer">
                        <input
                          type="radio"
                          name="reversalType"
                          checked={reversalType === 'documentary_void'}
                          onChange={() => setReversalType('documentary_void')}
                          className="mt-0.5"
                        />
                        <div>
                          <strong className="block text-slate-900">Anulación de Registro (Corrección Documental)</strong>
                          <span className="text-[10px] text-slate-500">
                            El cobro se registró por error (error de digitación, recibo anulado). No hubo salida real de dinero de la gaveta física. Se descuenta del resultado operativo sin inflar egresos físicos.
                          </span>
                        </div>
                      </label>

                      <label className="flex items-start gap-2 p-2 bg-white rounded-lg border border-slate-200 cursor-pointer">
                        <input
                          type="radio"
                          name="reversalType"
                          checked={reversalType === 'refund'}
                          onChange={() => setReversalType('refund')}
                          className="mt-0.5"
                        />
                        <div>
                          <strong className="block text-slate-900">Devolución Efectiva de Dinero al Socio</strong>
                          <span className="text-[10px] text-slate-500">
                            Se devuelve físicamente el dinero recaudado al socio. Genera un egreso auditable en caja física o cuenta bancaria.
                          </span>
                        </div>
                      </label>
                    </div>
                  </div>

                  {reversalType === 'refund' && (
                    <div>
                      <label className="block text-[11px] font-bold text-slate-800 mb-1">
                        Canal de Devolución del Dinero *
                      </label>
                      <select
                        value={refundMethod}
                        onChange={e => setRefundMethod(e.target.value as 'cash' | 'transfer')}
                        className="w-full bg-white border border-slate-300 rounded-lg p-2 text-xs font-semibold"
                      >
                        <option value="cash">Efectivo (Salida de gaveta de caja)</option>
                        <option value="transfer">Transferencia Bancaria</option>
                      </select>
                    </div>
                  )}

                  <div>
                    <label className="block text-[11px] font-bold text-slate-800 mb-1">
                      Motivo / Justificación Obligatoria de la Anulación *
                    </label>
                    <textarea
                      rows={2}
                      value={reversalReason}
                      onChange={e => setReversalReason(e.target.value)}
                      placeholder="Indique con claridad por qué se anula o devuelve este pago..."
                      className="w-full bg-white border border-slate-300 rounded-lg p-2 text-xs"
                      required
                    />
                  </div>

                  <div className="flex justify-end gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => setPaymentToRevert(null)}
                      className="px-3 py-1.5 rounded-lg border border-slate-300 bg-white font-bold text-slate-700"
                    >
                      Volver al Listado
                    </button>
                    <button
                      type="submit"
                      className="px-4 py-1.5 rounded-lg bg-red-600 hover:bg-red-500 font-bold text-white shadow-xs"
                    >
                      Confirmar Anulación Contable
                    </button>
                  </div>
                </form>
              ) : (
                /* Listado de pagos */
                <div className="space-y-3">
                  <div className="flex items-center justify-between p-2.5 bg-slate-50 rounded-xl border border-slate-200">
                    <div>
                      <span className="text-slate-500 text-[10px] uppercase font-bold block">Resumen de Cuota</span>
                      <strong className="text-slate-900">Total: Bs. {historyModalDue.amount.toFixed(2)}</strong>
                    </div>
                    <div>
                      <span className="text-slate-500 text-[10px] uppercase font-bold block">Abonado Neto</span>
                      <strong className="text-emerald-700">Bs. {historyModalDue.paidAmount.toFixed(2)}</strong>
                    </div>
                    <div>
                      <span className="text-slate-500 text-[10px] uppercase font-bold block">Saldo Pendiente</span>
                      <strong className={historyModalDue.balance > 0 ? 'text-red-700' : 'text-emerald-700'}>
                        Bs. {historyModalDue.balance.toFixed(2)}
                      </strong>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <span className="font-bold text-slate-700 text-xs block uppercase">
                      Pagos y Movimientos Registrados ({historyModalDue.payments.length})
                    </span>

                    {historyModalDue.payments.length === 0 ? (
                      <div className="p-4 text-center text-slate-400 bg-slate-50 rounded-xl">
                        No hay pagos registrados para esta cuota.
                      </div>
                    ) : (
                      historyModalDue.payments.map((p, pIdx) => (
                        <div
                          key={p.id || pIdx}
                          className={`p-3 rounded-xl border flex flex-wrap items-center justify-between gap-2 ${p.isReversed ? 'bg-red-50/50 border-red-200 opacity-75' : 'bg-white border-slate-200 shadow-2xs'}`}
                        >
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-mono font-bold text-slate-900">{p.receiptNumber}</span>
                              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-slate-100 text-slate-700 uppercase">
                                {p.paymentMethod}
                              </span>
                              {p.isReversed ? (
                                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-red-100 text-red-800 uppercase">
                                  ANULADO
                                </span>
                              ) : (
                                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-emerald-100 text-emerald-800 uppercase">
                                  VÁLIDO
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-slate-500 mt-0.5">
                              {new Date(p.date).toLocaleString('es-BO')} · Cajero: {p.cashierName}
                            </div>
                            {p.isReversed && p.reversalReason && (
                              <div className="text-[10px] text-red-700 mt-1 bg-red-100/60 p-1.5 rounded-md">
                                <strong>Motivo de anulación:</strong> {p.reversalReason}
                              </div>
                            )}
                          </div>

                          <div className="flex items-center gap-2">
                            <span className={`text-sm font-black ${p.isReversed ? 'line-through text-slate-400' : 'text-emerald-700'}`}>
                              Bs. {p.amount.toFixed(2)}
                            </span>

                            {!p.isReversed && (
                              <>
                                <button
                                  type="button"
                                  onClick={() => handleDownloadReceiptPdf(historyModalDue, p)}
                                  className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700"
                                  title="Descargar recibo PDF"
                                >
                                  <FileDown className="w-4 h-4" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setPaymentToRevert(p)
                                    setReversalReason('')
                                    setReversalError(null)
                                  }}
                                  className="px-2.5 py-1 rounded-lg bg-red-100 hover:bg-red-200 text-red-800 font-bold text-[11px] flex items-center gap-1 transition"
                                  title="Anular o revertir este cobro"
                                >
                                  <RotateCcw className="w-3.5 h-3.5 text-red-700" />
                                  <span>Anular</span>
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>

            <div className="bg-slate-50 p-3 flex justify-end border-t border-slate-200">
              <button
                type="button"
                onClick={() => setHistoryModalDue(null)}
                className="px-4 py-2 rounded-xl border border-slate-300 font-bold text-xs text-slate-700 hover:bg-slate-100"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
