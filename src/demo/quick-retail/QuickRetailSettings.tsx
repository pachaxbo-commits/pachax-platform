import { Store, Sliders } from 'lucide-react'

export function QuickRetailSettings() {
  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Configuración del Comercio</h1>
        <p className="text-sm text-slate-500">Parámetros de venta rápida, balanza y datos de negocio</p>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-xs space-y-6">
        <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
          <Store className="w-5 h-5 text-slate-700" />
          Datos del Establecimiento
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-semibold text-slate-700 block mb-1">Nombre Comercial</label>
            <input
              type="text"
              defaultValue="Amapola Demo"
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-700 block mb-1">Rubro Principal</label>
            <input
              type="text"
              defaultValue="Heladería, Cafetería & Venta por Peso"
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
            />
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-xs space-y-6">
        <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
          <Sliders className="w-5 h-5 text-slate-700" />
          Parámetros de Balanza y Venta por Peso
        </h2>

        <div className="space-y-3 text-xs">
          <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl">
            <div>
              <div className="font-bold text-slate-800">Unidad de Peso en Balanza</div>
              <div className="text-slate-500">Cálculo de centavos mediante enteros puros (gramos)</div>
            </div>
            <span className="font-mono font-bold bg-white px-3 py-1 rounded-lg border border-slate-200">
              Gramos (g)
            </span>
          </div>

          <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl">
            <div>
              <div className="font-bold text-slate-800">Regla de Redondeo Half-Up</div>
              <div className="text-slate-500">Subtotal por línea: (gramos * precioKg + 500) / 1000</div>
            </div>
            <span className="font-bold text-emerald-700 bg-emerald-100 px-3 py-1 rounded-lg">
              Activo (motor canónico)
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
