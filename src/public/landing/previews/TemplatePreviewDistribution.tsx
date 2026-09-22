import { Truck, AlertTriangle, CheckCircle2, HandCoins, ArrowDownRight, ArrowUpRight } from 'lucide-react'

export function TemplatePreviewDistribution() {
  return (
    <div className="w-full h-full flex flex-col bg-slate-900 text-slate-100 rounded-xl overflow-hidden border border-slate-800 text-xs select-none">
      {/* Barra superior de ventana */}
      <div className="bg-slate-950 px-3.5 py-2.5 border-b border-slate-800 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5" aria-hidden="true">
            <span className="w-2.5 h-2.5 rounded-full bg-rose-500/80" />
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500/80" />
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500/80" />
          </div>
          <span className="text-[11px] font-bold text-slate-300 ml-1">PACHAX Distribución</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20 text-[10px] font-semibold">
            <Truck className="w-3 h-3" />
            Ruta Norte #2 • Al día
          </span>
        </div>
      </div>

      {/* Contenido: Control de Carga Física (izq) y Liquidación/Cobranza (der) */}
      <div className="p-3.5 grid grid-cols-1 sm:grid-cols-12 gap-3 bg-slate-900/90 flex-1">
        {/* Columna Izquierda: Carga y Variance físico en kilos (6 cols) */}
        <div className="sm:col-span-6 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1">
              Despacho & Retorno Físico
            </span>
            <span className="text-[10px] text-slate-400">Hugo Distribuidor</span>
          </div>

          {/* Producto 1: Viena Especial con faltante de 0.5 kg */}
          <div className="p-2.5 rounded-lg bg-slate-800/80 border border-slate-700/80 space-y-1.5">
            <div className="flex justify-between items-center text-[11px]">
              <span className="font-bold text-slate-200">Viena Especial</span>
              <span className="text-[10px] text-slate-400">25 kg cargados</span>
            </div>
            <div className="grid grid-cols-3 gap-1 text-[10px] text-slate-300 border-t border-slate-700 pt-1">
              <div>
                <span className="text-slate-500 block text-[9px]">Venta</span>
                <span className="font-bold text-slate-200">6.0 kg</span>
              </div>
              <div>
                <span className="text-slate-500 block text-[9px]">Retorno</span>
                <span className="font-bold text-slate-200">18.5 kg</span>
              </div>
              <div className="text-right">
                <span className="text-slate-500 block text-[9px]">Variance</span>
                <span className="inline-flex items-center gap-0.5 font-bold text-rose-400">
                  <AlertTriangle className="w-2.5 h-2.5" /> -0.5 kg
                </span>
              </div>
            </div>
          </div>

          {/* Producto 2: Chorizo Parrillero exacto */}
          <div className="p-2 rounded-lg bg-slate-800/40 border border-slate-700/60 flex items-center justify-between text-[10px]">
            <div>
              <span className="font-bold text-slate-300 block">Chorizo Parrillero</span>
              <span className="text-slate-400">Carga 10 kg • Vendido 3 kg</span>
            </div>
            <div className="text-right">
              <span className="inline-flex items-center gap-1 font-bold text-emerald-400">
                <CheckCircle2 className="w-3 h-3" /> Cuadrado (0.0)
              </span>
            </div>
          </div>
        </div>

        {/* Columna Derecha: Cobranza y Liquidación de Efectivo (6 cols) */}
        <div className="sm:col-span-6 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1">
              <HandCoins className="w-3 h-3 text-blue-400" />
              Liquidación en Calle
            </span>
            <span className="text-[10px] text-slate-400">Arqueo exacto</span>
          </div>

          {/* Resumen de Flujo de Efectivo en Ruta */}
          <div className="p-2.5 rounded-lg bg-slate-800/80 border border-slate-700/80 space-y-1.5 text-[10px]">
            <div className="flex justify-between items-center">
              <span className="text-slate-300 flex items-center gap-1">
                <ArrowDownRight className="w-3 h-3 text-emerald-400" /> Ventas Contado (Doña Martha)
              </span>
              <span className="font-bold text-slate-100">Bs 288.00</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-slate-300 flex items-center gap-1">
                <ArrowDownRight className="w-3 h-3 text-emerald-400" /> Cobranza Cartera (Minimarket)
              </span>
              <span className="font-bold text-slate-100">Bs 100.00</span>
            </div>
            <div className="flex justify-between items-center border-b border-slate-700/80 pb-1">
              <span className="text-slate-300 flex items-center gap-1">
                <ArrowUpRight className="w-3 h-3 text-rose-400" /> Gastos Ruta (Combustible)
              </span>
              <span className="font-bold text-rose-300">-Bs 20.00</span>
            </div>

            {/* Total Efectivo a Entregar: exacto Bs 368 */}
            <div className="flex justify-between items-center pt-0.5 text-[11px]">
              <span className="font-bold text-blue-300">Efectivo a Entregar:</span>
              <span className="font-black text-white text-[12px] bg-blue-500/20 px-1.5 py-0.5 rounded text-blue-200">
                Bs 368.00
              </span>
            </div>
          </div>

          <div className="text-[10px] text-slate-400 px-1 flex items-center justify-between">
            <span>Crédito generado: Bs 159.00</span>
            <span className="text-slate-500">1 nota abierta</span>
          </div>
        </div>
      </div>
    </div>
  )
}
