import { Store, Receipt } from 'lucide-react'

export function RestaurantSettings() {
  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Configuración del Restaurante</h1>
        <p className="text-sm text-slate-500">Parámetros comerciales, comensales y datos del establecimiento</p>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-xs space-y-6">
        <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
          <Store className="w-5 h-5 text-slate-700" />
          Datos Generales del Negocio
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-semibold text-slate-700 block mb-1">Nombre del Establecimiento</label>
            <input
              type="text"
              defaultValue="Bistró Demo"
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-400"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-700 block mb-1">NIT / Razón Social</label>
            <input
              type="text"
              defaultValue="4829102018"
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-400"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-700 block mb-1">Dirección del Salón</label>
            <input
              type="text"
              defaultValue="Av. Principal #450, Zona Central"
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-400"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-700 block mb-1">Teléfono de Contacto</label>
            <input
              type="text"
              defaultValue="71234567"
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-400"
            />
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-xs space-y-6">
        <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
          <Receipt className="w-5 h-5 text-slate-700" />
          Encabezado & Pie de Comanda Térmica
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-semibold text-slate-700 block mb-1">Encabezado de Ticket</label>
            <input
              type="text"
              defaultValue="BISTRO DEMO — GASTRONOMÍA"
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-700 block mb-1">Pie de Comanda / Mensaje</label>
            <input
              type="text"
              defaultValue="¡Gracias por su visita! Vuelva pronto."
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
            />
          </div>
        </div>
      </div>
    </div>
  )
}
