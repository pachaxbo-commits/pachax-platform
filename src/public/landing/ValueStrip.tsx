import { LayoutTemplate, Zap, Code2, BarChart3, CloudSync } from 'lucide-react'

export function ValueStrip() {
  return (
    <section className="w-full py-3 sm:py-6">
      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
        {/* Versión Desktop: Barra horizontal con 3 bloques destacados */}
        <div className="hidden sm:grid sm:grid-cols-3 gap-4 lg:gap-6 bg-white border border-slate-200/90 rounded-2xl p-4 lg:p-6 shadow-xs">
          {/* Bloque 1 */}
          <div className="flex items-center gap-4 px-2">
            <div className="w-12 h-12 rounded-xl bg-blue-50 text-[#0066FF] border border-blue-100 flex items-center justify-center shrink-0">
              <LayoutTemplate className="w-6 h-6" />
            </div>
            <div>
              <h4 className="text-sm lg:text-base font-bold text-slate-900">
                Plantillas profesionales
              </h4>
              <p className="text-xs lg:text-sm text-slate-500 mt-0.5">
                Listas para usar y personalizar
              </p>
            </div>
          </div>

          {/* Bloque 2 */}
          <div className="flex items-center gap-4 px-2 sm:border-l sm:border-slate-100">
            <div className="w-12 h-12 rounded-xl bg-blue-50 text-[#0066FF] border border-blue-100 flex items-center justify-center shrink-0">
              <Zap className="w-6 h-6" />
            </div>
            <div>
              <h4 className="text-sm lg:text-base font-bold text-slate-900">
                Planes mensuales accesibles
              </h4>
              <p className="text-xs lg:text-sm text-slate-500 mt-0.5">
                Sin complicaciones
              </p>
            </div>
          </div>

          {/* Bloque 3 */}
          <div className="flex items-center gap-4 px-2 sm:border-l sm:border-slate-100">
            <div className="w-12 h-12 rounded-xl bg-blue-50 text-[#0066FF] border border-blue-100 flex items-center justify-center shrink-0">
              <Code2 className="w-6 h-6" />
            </div>
            <div>
              <h4 className="text-sm lg:text-base font-bold text-slate-900">
                Desarrollo a medida
              </h4>
              <p className="text-xs lg:text-sm text-slate-500 mt-0.5">
                Para negocios únicos
              </p>
            </div>
          </div>
        </div>

        {/* Versión Mobile: 3 Badges compactos en fila con texto adaptado y sin overflow */}
        <div className="sm:hidden grid grid-cols-3 gap-1 bg-white border border-slate-200/80 rounded-2xl p-2.5 shadow-xs">
          <div className="flex flex-col items-center text-center p-1">
            <div className="w-7 h-7 rounded-full bg-blue-50 text-[#0066FF] flex items-center justify-center mb-1 shrink-0">
              <Zap className="w-3.5 h-3.5" />
            </div>
            <span className="text-[10px] font-semibold text-slate-800 leading-tight">
              Implementación rápida
            </span>
          </div>

          <div className="flex flex-col items-center text-center p-1 border-x border-slate-100">
            <div className="w-7 h-7 rounded-full bg-blue-50 text-[#0066FF] flex items-center justify-center mb-1 shrink-0">
              <BarChart3 className="w-3.5 h-3.5" />
            </div>
            <span className="text-[10px] font-semibold text-slate-800 leading-tight">
              Diseño profesional
            </span>
          </div>

          <div className="flex flex-col items-center text-center p-1">
            <div className="w-7 h-7 rounded-full bg-blue-50 text-[#0066FF] flex items-center justify-center mb-1 shrink-0">
              <CloudSync className="w-3.5 h-3.5" />
            </div>
            <span className="text-[10px] font-semibold text-slate-800 leading-tight">
              Soporte continuo
            </span>
          </div>
        </div>
      </div>
    </section>
  )
}
