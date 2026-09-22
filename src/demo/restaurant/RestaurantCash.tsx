import { useState } from 'react'
import { Wallet, Lock, Unlock, ArrowUpRight, ArrowDownLeft, PlusCircle } from 'lucide-react'

export function RestaurantCash() {
  const [isOpen, setIsOpen] = useState(true)
  const initialAmount = 250
  const [movements, setMovements] = useState<Array<{ id: string; type: 'income' | 'expense'; amount: number; concept: string; time: string }>>([
    { id: 'm1', type: 'income', amount: 80, concept: 'Cobro comanda mesa 2', time: '12:30' },
    { id: 'm2', type: 'expense', amount: 35, concept: 'Compra hielo de emergencia', time: '13:15' },
    { id: 'm3', type: 'income', amount: 140, concept: 'Cobro comanda mesa 5', time: '13:50' },
  ])
  const [newConcept, setNewConcept] = useState('')
  const [newAmount, setNewAmount] = useState('')
  const [newType, setNewType] = useState<'income' | 'expense'>('expense')

  const totalIncomes = movements.filter((m) => m.type === 'income').reduce((sum, m) => sum + m.amount, 0)
  const totalExpenses = movements.filter((m) => m.type === 'expense').reduce((sum, m) => sum + m.amount, 0)
  const currentBalance = initialAmount + totalIncomes - totalExpenses

  const handleAddMovement = (e: React.FormEvent) => {
    e.preventDefault()
    const amt = parseFloat(newAmount)
    if (!amt || isNaN(amt) || !newConcept.trim()) return
    setMovements([
      ...movements,
      {
        id: `m-${Date.now()}`,
        type: newType,
        amount: amt,
        concept: newConcept.trim(),
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      },
    ])
    setNewConcept('')
    setNewAmount('')
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Caja & Control de Turnos</h1>
          <p className="text-sm text-slate-500">Apertura, arqueo y registro de movimientos de dinero en efectivo</p>
        </div>

        <div className="flex items-center gap-2">
          <span className={`inline-flex items-center gap-1 text-xs font-bold px-3 py-1 rounded-full ${
            isOpen ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-700'
          }`}>
            {isOpen ? <Unlock className="w-3.5 h-3.5" /> : <Lock className="w-3.5 h-3.5" />}
            {isOpen ? 'Turno Abierto' : 'Turno Cerrado'}
          </span>
          <button
            onClick={() => setIsOpen(!isOpen)}
            className="px-3 py-1.5 text-xs font-semibold border border-slate-300 rounded-lg hover:bg-slate-50 transition"
          >
            {isOpen ? 'Cerrar Turno' : 'Reabrir Turno'}
          </button>
        </div>
      </div>

      {/* KPI Balances */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-xs">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-1">Monto Inicial</span>
          <span className="text-xl font-bold text-slate-900">Bs {initialAmount.toFixed(2)}</span>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-xs">
          <span className="text-xs font-semibold text-emerald-600 uppercase tracking-wider block mb-1">Ingresos Efectivo</span>
          <span className="text-xl font-bold text-emerald-700">+Bs {totalIncomes.toFixed(2)}</span>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-xs">
          <span className="text-xs font-semibold text-amber-600 uppercase tracking-wider block mb-1">Gastos / Retiros</span>
          <span className="text-xl font-bold text-amber-700">-Bs {totalExpenses.toFixed(2)}</span>
        </div>
      </div>

      {/* Saldo actual card */}
      <div className="p-5 bg-gradient-to-r from-slate-900 to-slate-800 text-white rounded-2xl flex items-center justify-between shadow-xs">
        <div>
          <span className="text-xs text-slate-300 uppercase tracking-wider font-semibold block">Efectivo Esperado en Gaveta</span>
          <span className="text-3xl font-extrabold mt-1 block">Bs {currentBalance.toFixed(2)}</span>
        </div>
        <Wallet className="w-10 h-10 text-teal-400 opacity-80" />
      </div>

      {/* Movimientos & Registro */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Formulario rápido */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs">
          <h2 className="text-sm font-bold text-slate-900 mb-3 flex items-center gap-1.5">
            <PlusCircle className="w-4 h-4 text-slate-600" />
            Registrar Movimiento
          </h2>
          <form onSubmit={handleAddMovement} className="space-y-3">
            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">Tipo</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setNewType('expense')}
                  className={`py-1.5 text-xs font-bold rounded-lg border transition ${
                    newType === 'expense' ? 'bg-amber-100 border-amber-300 text-amber-900' : 'border-slate-200 text-slate-600'
                  }`}
                >
                  Gasto / Retiro
                </button>
                <button
                  type="button"
                  onClick={() => setNewType('income')}
                  className={`py-1.5 text-xs font-bold rounded-lg border transition ${
                    newType === 'income' ? 'bg-emerald-100 border-emerald-300 text-emerald-900' : 'border-slate-200 text-slate-600'
                  }`}
                >
                  Ingreso Extra
                </button>
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">Concepto</label>
              <input
                type="text"
                value={newConcept}
                onChange={(e) => setNewConcept(e.target.value)}
                placeholder="Ej. Insumo de verdulería"
                className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-lg"
                required
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">Monto (Bs)</label>
              <input
                type="number"
                step="0.5"
                value={newAmount}
                onChange={(e) => setNewAmount(e.target.value)}
                placeholder="0.00"
                className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-lg"
                required
              />
            </div>

            <button
              type="submit"
              className="w-full py-2 text-xs font-bold text-white bg-slate-900 hover:bg-slate-800 rounded-xl transition"
            >
              Guardar Movimiento
            </button>
          </form>
        </div>

        {/* Tabla de movimientos */}
        <div className="lg:col-span-2 bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs">
          <h2 className="text-sm font-bold text-slate-900 mb-3">Movimientos del Turno</h2>
          <div className="divide-y divide-slate-100">
            {movements.map((m) => (
              <div key={m.id} className="py-2.5 flex items-center justify-between text-xs">
                <div className="flex items-center gap-2.5">
                  <span className={`w-7 h-7 rounded-lg flex items-center justify-center ${
                    m.type === 'income' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
                  }`}>
                    {m.type === 'income' ? <ArrowDownLeft className="w-3.5 h-3.5" /> : <ArrowUpRight className="w-3.5 h-3.5" />}
                  </span>
                  <div>
                    <div className="font-semibold text-slate-900">{m.concept}</div>
                    <div className="text-[11px] text-slate-400">{m.time}</div>
                  </div>
                </div>
                <div className={`font-bold ${m.type === 'income' ? 'text-emerald-600' : 'text-amber-600'}`}>
                  {m.type === 'income' ? '+' : '-'}Bs {m.amount.toFixed(2)}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
