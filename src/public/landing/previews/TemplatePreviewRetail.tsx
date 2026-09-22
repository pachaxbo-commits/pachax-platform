import { Scale, ShoppingBag, Banknote, QrCode } from 'lucide-react'

export function TemplatePreviewRetail() {
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
          <span className="text-[11px] font-bold text-slate-300 ml-1">PACHAX Comercio / Mostrador</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-teal-500/10 text-teal-400 border border-teal-500/20 text-[10px] font-semibold">
            <Scale className="w-3 h-3" />
            Balanza Conectada
          </span>
        </div>
      </div>

      {/* Contenido: Balanza e Items (izq) y Carrito y Cobro Express (der) */}
      <div className="p-3.5 grid grid-cols-1 sm:grid-cols-12 gap-3 bg-slate-900/90 flex-1">
        {/* Columna Izquierda: Lectura en tiempo real de balanza (6 cols) */}
        <div className="sm:col-span-6 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Venta por Peso & Unidad
            </span>
            <span className="text-[10px] text-teal-400 font-mono">0.325 kg</span>
          </div>

          {/* Display Digital de la Balanza */}
          <div className="p-2.5 rounded-lg bg-slate-950 border border-teal-500/30 space-y-1 shadow-2xs">
            <div className="flex justify-between items-baseline">
              <span className="font-bold text-teal-300 text-[11px]">Helado Artesanal</span>
              <span className="text-[10px] text-slate-400">Bs 60.00 / kg</span>
            </div>
            <div className="flex justify-between items-baseline border-t border-slate-800/80 pt-1">
              <span className="font-mono text-sm font-black text-white">325 g</span>
              <div className="text-right">
                <span className="text-[9px] text-slate-400 block">Subtotal</span>
                <span className="font-mono text-xs font-black text-teal-300">Bs 19.50</span>
              </div>
            </div>
          </div>

          {/* Productos por unidad */}
          <div className="p-2 rounded-lg bg-slate-800/40 border border-slate-700/60 space-y-1 text-[10px]">
            <div className="flex justify-between text-slate-300">
              <span>1x Café Latte Especial</span>
              <span className="font-bold text-slate-200">Bs 18.00</span>
            </div>
            <div className="flex justify-between text-slate-300">
              <span>1x Croissant Almendras</span>
              <span className="font-bold text-slate-200">Bs 14.00</span>
            </div>
          </div>
        </div>

        {/* Columna Derecha: Carrito y Cobro Express con vuelto (6 cols) */}
        <div className="sm:col-span-6 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1">
              <ShoppingBag className="w-3 h-3 text-teal-400" />
              Ticket Actual (3 items)
            </span>
            <span className="text-[10px] text-slate-400">Caja #1</span>
          </div>

          {/* Tarjeta de Total y Pago */}
          <div className="p-2.5 rounded-lg bg-slate-800/80 border border-slate-700/80 space-y-2">
            <div className="flex justify-between items-baseline">
              <span className="text-slate-400 text-[10px] uppercase font-bold">Total a Cobrar:</span>
              <span className="text-sm font-black text-white font-mono">Bs 51.50</span>
            </div>

            {/* Simulación de Cobro con vuelto rápido */}
            <div className="p-1.5 rounded bg-slate-950/70 border border-slate-800 space-y-0.5 text-[10px]">
              <div className="flex justify-between text-slate-400">
                <span>Efectivo recibido:</span>
                <span className="font-mono text-slate-200">Bs 60.00</span>
              </div>
              <div className="flex justify-between font-bold text-emerald-300">
                <span>Cambio a entregar:</span>
                <span className="font-mono">Bs 8.50</span>
              </div>
            </div>

            {/* Accesos rápidos de cobro */}
            <div className="grid grid-cols-2 gap-1.5 pt-0.5">
              <div className="py-1 px-2 rounded bg-slate-700/60 text-slate-200 font-semibold text-[10px] flex items-center justify-center gap-1">
                <Banknote className="w-3 h-3 text-emerald-400" />
                <span>Efectivo</span>
              </div>
              <div className="py-1 px-2 rounded bg-teal-500/20 text-teal-300 font-semibold text-[10px] flex items-center justify-center gap-1 border border-teal-500/30">
                <QrCode className="w-3 h-3" />
                <span>Cobro QR</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
