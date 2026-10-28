import { useState } from 'react'
import {
  Receipt,
  Plus,
  CheckCircle2,
  X,
} from 'lucide-react'
import type { UnionExpense } from '../types'

interface SyndicateExpensesViewProps {
  expenses: UnionExpense[]
  onAddExpense: (params: {
    category: UnionExpense['category']
    description: string
    amount: number
    paymentMethod: 'cash' | 'transfer' | 'qr'
    invoiceOrVoucherNumber?: string
  }) => UnionExpense
}

export function SyndicateExpensesView({
  expenses,
  onAddExpense,
}: SyndicateExpensesViewProps) {
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [category, setCategory] = useState<UnionExpense['category']>('alquiler')
  const [description, setDescription] = useState('')
  const [amount, setAmount] = useState<number>(100)
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'transfer' | 'qr'>('cash')
  const [invoiceNumber, setInvoiceNumber] = useState('')
  const [feedback, setFeedback] = useState<string | null>(null)

  const handleCreateExpense = (e: React.FormEvent) => {
    e.preventDefault()
    if (!description.trim() || amount <= 0) return

    const created = onAddExpense({
      category,
      description: description.trim(),
      amount,
      paymentMethod,
      invoiceOrVoucherNumber: invoiceNumber.trim() || undefined,
    })

    setDescription('')
    setAmount(100)
    setInvoiceNumber('')
    setIsModalOpen(false)
    setFeedback(`Gasto registrado correctamente (N° ${created.receiptNumber}) por Bs. ${created.amount.toFixed(2)}.`)
    setTimeout(() => setFeedback(null), 5000)
  }

  const categoryLabels: Record<UnionExpense['category'], string> = {
    alquiler: 'Alquiler de Sede / Agencia',
    energia_electrica: 'Energía Eléctrica (Luz)',
    agua: 'Agua Potable',
    internet_telefonia: 'Internet & Telefonía',
    mantenimiento: 'Mantenimiento & Reparaciones',
    suministros: 'Suministros de Oficina / Embalaje',
    combustible: 'Combustible / Lubricantes',
    tramites_legales: 'Trámites & Asesoría Legal',
    otro: 'Otros Egresos Generales',
  }

  const totalExpenses = expenses.reduce((acc, e) => acc + e.amount, 0)

  return (
    <div className="space-y-4 font-sans text-slate-800">
      <div className="bg-white p-4 rounded-2xl border border-slate-200/90 shadow-xs flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-900 border border-amber-300 flex items-center justify-center font-bold">
            <Receipt className="w-5 h-5 text-amber-700" />
          </div>
          <div>
            <h3 className="text-base font-black text-slate-900 tracking-tight">Gastos Operativos del Sindicato</h3>
            <p className="text-xs text-slate-500">Servicios básicos, alquileres de agencias, suministros y mantenimiento</p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setIsModalOpen(true)}
          className="px-4 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-500 font-bold text-white text-xs flex items-center gap-2 shadow-xs transition"
        >
          <Plus className="w-4 h-4" />
          <span>Registrar Nuevo Gasto</span>
        </button>
      </div>

      {feedback && (
        <div className="p-3 bg-teal-50 border border-teal-200 text-teal-800 rounded-xl text-xs font-semibold flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-teal-600 shrink-0" />
          <span>{feedback}</span>
        </div>
      )}

      {/* Tabla de gastos */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
        <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
          <h4 className="font-bold text-xs text-slate-800 uppercase tracking-wider">Historial de Egresos Registrados</h4>
          <span className="text-xs font-black text-slate-900">Total acumulado: Bs. {totalExpenses.toFixed(2)}</span>
        </div>

        {expenses.length === 0 ? (
          <div className="p-8 text-center text-slate-400 text-xs">
            No hay gastos registrados en este turno.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50/50 border-b border-slate-200 text-[11px] font-bold text-slate-600 uppercase">
                  <th className="py-2.5 px-4">Fecha</th>
                  <th className="py-2.5 px-3">N° Recibo</th>
                  <th className="py-2.5 px-3">Rubro / Categoría</th>
                  <th className="py-2.5 px-4">Descripción</th>
                  <th className="py-2.5 px-3">Factura / Recibo</th>
                  <th className="py-2.5 px-3">Método</th>
                  <th className="py-2.5 px-4 text-right">Monto (Bs.)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {expenses.map(e => (
                  <tr key={e.id} className="hover:bg-slate-50/70">
                    <td className="py-2.5 px-4 text-slate-600">{new Date(e.date).toLocaleDateString('es-BO')}</td>
                    <td className="py-2.5 px-3 font-mono font-bold text-slate-800">{e.receiptNumber}</td>
                    <td className="py-2.5 px-3 font-bold text-amber-900">{categoryLabels[e.category] || e.category}</td>
                    <td className="py-2.5 px-4 text-slate-900">{e.description}</td>
                    <td className="py-2.5 px-3 font-mono text-slate-500">{e.invoiceOrVoucherNumber || '-'}</td>
                    <td className="py-2.5 px-3 font-semibold text-slate-700">{e.paymentMethod.toUpperCase()}</td>
                    <td className="py-2.5 px-4 text-right font-black text-slate-950">Bs. {e.amount.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal nuevo gasto */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-2 sm:p-4 overflow-y-auto">
          <div className="relative w-full max-w-lg bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden my-auto max-h-[92vh] flex flex-col font-sans">
            <div className="bg-slate-900 text-white px-5 py-3.5 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2">
                <Receipt className="w-5 h-5 text-amber-400" />
                <h3 className="font-black text-sm sm:text-base">Registrar Gasto del Sindicato</h3>
              </div>
              <button type="button" onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateExpense} className="p-5 space-y-3.5 text-xs sm:text-sm overflow-y-auto">
              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">Categoría / Rubro *</label>
                  <select
                    value={category}
                    onChange={e => setCategory(e.target.value as any)}
                    className="w-full bg-white border border-slate-300 rounded-lg p-2 font-medium"
                  >
                    {Object.entries(categoryLabels).map(([key, label]) => (
                      <option key={key} value={key}>{label}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">Forma de Pago *</label>
                  <select
                    value={paymentMethod}
                    onChange={e => setPaymentMethod(e.target.value as any)}
                    className="w-full bg-white border border-slate-300 rounded-lg p-2 font-bold"
                  >
                    <option value="cash">Efectivo de Caja</option>
                    <option value="transfer">Transferencia Bancaria</option>
                    <option value="qr">Pago QR</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">Descripción del Gasto *</label>
                <input
                  type="text"
                  placeholder="Ej. Compra de rollos de papel térmico para tickets y cinta"
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  className="w-full bg-white border border-slate-300 rounded-lg p-2 font-medium"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">Importe (Bs.) *</label>
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={amount}
                    onChange={e => setAmount(parseFloat(e.target.value) || 0)}
                    className="w-full bg-white border border-slate-300 rounded-lg p-2 font-black text-slate-900 text-base"
                    required
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">N° Factura / Recibo</label>
                  <input
                    type="text"
                    placeholder="Ej. FAC-10294"
                    value={invoiceNumber}
                    onChange={e => setInvoiceNumber(e.target.value)}
                    className="w-full bg-white border border-slate-300 rounded-lg p-2 font-medium"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-slate-300 font-bold text-xs text-slate-700 hover:bg-slate-100"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 font-bold text-xs text-white shadow-xs"
                >
                  Guardar Gasto
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
