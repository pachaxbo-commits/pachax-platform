import { useState } from 'react'
import { CheckCircle, Calculator } from 'lucide-react'
import { cashClosure } from '../../core/sales'
import type { CompletedRetailSale } from '../mocks/retailMock'

export function QuickRetailCash({ sales }: { sales: CompletedRetailSale[] }) {
  const openingMinor = 20000 // Bs 200.00
  const expensesMinor = 3000 // Bs 30.00
  const [declaredBs, setDeclaredBs] = useState<string>('')
  const [closureResult, setClosureResult] = useState<{ expectedMinor: number; declaredMinor: number; differenceMinor: number } | null>(null)

  // Total de ventas en efectivo minor (cash y la porción de efectivo de ventas mixtas)
  const cashSalesMinor = sales.reduce((sum, s) => sum + s.cashMinor, 0)

  const handleCalculateClosure = (e: React.FormEvent) => {
    e.preventDefault()
    const decVal = Math.round((parseFloat(declaredBs) || 0) * 100)
    try {
      // Reutiliza cashClosure del motor de ventas existente
      const result = cashClosure(openingMinor, cashSalesMinor, expensesMinor, decVal)
      setClosureResult(result)
    } catch (err: any) {
      alert(err.message)
    }
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Caja & Arqueo de Turno</h1>
        <p className="text-sm text-slate-500">Cierre de mostrador y cuadratura de efectivo (excluyendo pagos QR)</p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-xs">
          <span className="text-xs font-medium text-slate-500 uppercase tracking-wider block mb-1">
            Apertura de Caja
          </span>
          <span className="text-xl font-bold text-slate-900">
            Bs {(openingMinor / 100).toFixed(2)}
          </span>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-xs">
          <span className="text-xs font-medium text-emerald-600 uppercase tracking-wider block mb-1">
            Ventas en Efectivo
          </span>
          <span className="text-xl font-bold text-emerald-700">
            +Bs {(cashSalesMinor / 100).toFixed(2)}
          </span>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-xs">
          <span className="text-xs font-medium text-amber-600 uppercase tracking-wider block mb-1">
            Gastos Menores / Salidas
          </span>
          <span className="text-xl font-bold text-amber-700">
            -Bs {(expensesMinor / 100).toFixed(2)}
          </span>
        </div>
      </div>

      {/* Formulario de Arqueo */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs space-y-4">
        <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
          <Calculator className="w-5 h-5 text-slate-700" />
          Arqueo Final de Efectivo
        </h2>

        <form onSubmit={handleCalculateClosure} className="space-y-4 max-w-md">
          <div>
            <label className="text-xs font-semibold text-slate-700 block mb-1">
              Efectivo Contado en Gaveta (Bs)
            </label>
            <input
              type="number"
              step="0.10"
              placeholder="Ej. 350.00"
              value={declaredBs}
              onChange={(e) => setDeclaredBs(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-400"
              required
            />
          </div>

          <button
            type="submit"
            className="px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-xl transition shadow-xs"
          >
            Ejecutar Cierre con cashClosure()
          </button>
        </form>

        {closureResult && (
          <div
            className={`p-4 rounded-xl border mt-4 text-xs space-y-2 ${
              closureResult.differenceMinor === 0
                ? 'bg-emerald-50 border-emerald-300 text-emerald-900'
                : closureResult.differenceMinor < 0
                ? 'bg-rose-50 border-rose-300 text-rose-900'
                : 'bg-blue-50 border-blue-300 text-blue-900'
            }`}
          >
            <div className="flex items-center gap-2 font-bold text-sm">
              <CheckCircle className="w-4 h-4" />
              Resultado de Cierre:
            </div>
            <div className="grid grid-cols-3 gap-2 pt-1 font-semibold">
              <div>
                Esperado: <strong>Bs {(closureResult.expectedMinor / 100).toFixed(2)}</strong>
              </div>
              <div>
                Declarado: <strong>Bs {(closureResult.declaredMinor / 100).toFixed(2)}</strong>
              </div>
              <div>
                Diferencia:{' '}
                <strong>
                  {closureResult.differenceMinor === 0
                    ? 'CUADRADO (Bs 0.00)'
                    : closureResult.differenceMinor < 0
                    ? `FALTANTE Bs ${(Math.abs(closureResult.differenceMinor) / 100).toFixed(2)}`
                    : `SOBRANTE Bs ${(closureResult.differenceMinor / 100).toFixed(2)}`}
                </strong>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
