import { Users, Clock, Receipt, CheckCircle2, Utensils } from 'lucide-react'

export function TemplatePreviewRestaurant() {
  return (
    <div className="w-full h-full flex flex-col bg-slate-900 text-slate-100 rounded-xl overflow-hidden border border-slate-800 text-xs select-none">
      {/* Barra superior de ventana de sistema */}
      <div className="bg-slate-950 px-3.5 py-2.5 border-b border-slate-800 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5" aria-hidden="true">
            <span className="w-2.5 h-2.5 rounded-full bg-rose-500/80" />
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500/80" />
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500/80" />
          </div>
          <span className="text-[11px] font-bold text-slate-300 ml-1">PACHAX Restaurante</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[10px] font-semibold">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            Turno T-04 Abierto
          </span>
        </div>
      </div>

      {/* Contenido dividido: Salón/Mesas (izq) y Pedido/KDS/Caja (der) */}
      <div className="p-3.5 grid grid-cols-1 sm:grid-cols-12 gap-3 bg-slate-900/90 flex-1">
        {/* Columna Izquierda: Salón con estados reales (6 cols) */}
        <div className="sm:col-span-6 space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1">
              <Utensils className="w-3 h-3 text-amber-400" />
              Salón Principal
            </span>
            <span className="text-[10px] text-slate-400">4 de 6 en servicio</span>
          </div>

          <div className="grid grid-cols-2 gap-2">
            {/* Mesa 1: Libre */}
            <div className="p-2 rounded-lg bg-slate-800/40 border border-dashed border-slate-700/80 flex flex-col justify-between h-16">
              <div className="flex items-center justify-between">
                <span className="font-bold text-slate-300 text-[11px]">Mesa 1</span>
                <span className="text-[9px] px-1.5 py-0.2 rounded bg-slate-700/60 text-slate-300">
                  Libre
                </span>
              </div>
              <span className="text-[10px] text-slate-400 flex items-center gap-1">
                <Users className="w-3 h-3" /> 2 p.
              </span>
            </div>

            {/* Mesa 2: Ocupada */}
            <div className="p-2 rounded-lg bg-amber-500/10 border border-amber-500/40 flex flex-col justify-between h-16 shadow-2xs">
              <div className="flex items-center justify-between">
                <span className="font-bold text-amber-200 text-[11px]">Mesa 2</span>
                <span className="text-[9px] px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 font-semibold">
                  Ocupada
                </span>
              </div>
              <div className="flex items-center justify-between text-[10px]">
                <span className="text-amber-200/70 flex items-center gap-1">
                  <Users className="w-3 h-3" /> 4 p.
                </span>
                <span className="font-bold text-amber-300">Bs 124.00</span>
              </div>
            </div>

            {/* Mesa 3: Reserva */}
            <div className="p-2 rounded-lg bg-blue-500/10 border border-blue-500/30 flex flex-col justify-between h-16">
              <div className="flex items-center justify-between">
                <span className="font-bold text-blue-200 text-[11px]">Mesa 3</span>
                <span className="text-[9px] px-1.5 py-0.2 rounded bg-blue-500/20 text-blue-300 font-semibold">
                  Reserva
                </span>
              </div>
              <span className="text-[10px] text-blue-300/80 flex items-center gap-1">
                <Clock className="w-3 h-3" /> 20:00
              </span>
            </div>

            {/* Mesa 4: Por cerrarse (bill_requested) */}
            <div className="p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/40 flex flex-col justify-between h-16 shadow-2xs">
              <div className="flex items-center justify-between">
                <span className="font-bold text-emerald-200 text-[11px]">Mesa 4</span>
                <span className="text-[9px] px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-300 font-semibold">
                  Por cerrarse
                </span>
              </div>
              <div className="flex items-center justify-between text-[10px]">
                <span className="text-emerald-200/70">Cuenta lista</span>
                <span className="font-bold text-emerald-300">Bs 142.50</span>
              </div>
            </div>
          </div>
        </div>

        {/* Columna Derecha: KDS Comandas y Caja (6 cols) */}
        <div className="sm:col-span-6 space-y-2.5">
          {/* Mini KDS / Comanda a cocina */}
          <div className="p-2.5 rounded-lg bg-slate-800/80 border border-slate-700/80 space-y-1.5">
            <div className="flex items-center justify-between border-b border-slate-700 pb-1">
              <span className="font-bold text-slate-200 text-[11px]">Comanda Lote #2 • Mesa 2</span>
              <span className="text-[9px] px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 font-bold">
                En preparación (12m)
              </span>
            </div>
            <div className="space-y-1 text-[11px] text-slate-300">
              <div className="flex justify-between">
                <span>2x Hamburguesa Artesanal</span>
                <span className="text-slate-400">Cocina</span>
              </div>
              <div className="flex justify-between">
                <span>1x Papas Rústicas Extra</span>
                <span className="text-slate-400">Cocina</span>
              </div>
              <div className="flex justify-between">
                <span>2x Limonada Menta & Jengibre</span>
                <span className="text-teal-400">Barra</span>
              </div>
            </div>
          </div>

          {/* Resumen de Caja y Turno */}
          <div className="p-2 rounded-lg bg-slate-950/60 border border-slate-800 flex items-center justify-between text-[11px]">
            <div className="flex items-center gap-1.5 text-slate-400">
              <Receipt className="w-3.5 h-3.5 text-slate-400" />
              <span>Caja Turno:</span>
            </div>
            <div className="flex items-center gap-2 font-bold text-slate-200">
              <span>Efectivo: Bs 452.00</span>
              <CheckCircle2 className="w-3 h-3 text-emerald-400" />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
