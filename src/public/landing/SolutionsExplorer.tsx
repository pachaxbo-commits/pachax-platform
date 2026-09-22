import { useState } from 'react'
import {
  Utensils,
  Truck,
  Store,
  Sliders,
  CheckCircle2,
  ArrowRight,
  Sparkles,
  Layers,
  MessageSquare,
} from 'lucide-react'
import { usePublicRouter } from '../routing/usePublicRouter'

export type SolutionTabKey =
  | 'restaurant_pos'
  | 'route_distribution'
  | 'gelateria_weight_cafe'
  | 'custom'

export function SolutionsExplorer() {
  const { navigate } = usePublicRouter()
  const [activeTab, setActiveTab] = useState<SolutionTabKey>('restaurant_pos')

  // Estado del formulario para la opción a medida
  const [customForm, setCustomForm] = useState({
    name: '',
    company: '',
    details: '',
    phone: '',
    email: '',
  })
  const [customPrepared, setCustomPrepared] = useState(false)

  const handleCustomSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!customForm.name || !customForm.details) return
    setCustomPrepared(true)
  }

  return (
    <section id="soluciones" className="py-16 sm:py-24 bg-white border-y border-slate-200/80">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Encabezado de la Sección */}
        <div className="text-center max-w-2xl mx-auto mb-10 sm:mb-14 space-y-3">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-500 bg-slate-100 px-3 py-1 rounded-full border border-slate-200">
            Explorador por Industria
          </span>
          <h2 className="text-3xl sm:text-4xl font-extrabold text-slate-950 tracking-tight">
            Encuentra tu PACHAX
          </h2>
          <p className="text-sm sm:text-base text-slate-600 leading-relaxed">
            Cada sector tiene exigencias operativas únicas. Explora cómo responde cada plantilla o solicita una solución configurada a tu medida.
          </p>
        </div>

        {/* Selector de pestañas interactivas */}
        <div className="flex justify-center mb-8 sm:mb-12">
          <div className="inline-flex p-1.5 bg-slate-100/90 rounded-2xl border border-slate-200/70 overflow-x-auto max-w-full">
            <button
              onClick={() => {
                setActiveTab('restaurant_pos')
                setCustomPrepared(false)
              }}
              className={`px-3.5 sm:px-5 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition-all cursor-pointer whitespace-nowrap flex items-center gap-2 ${
                activeTab === 'restaurant_pos'
                  ? 'bg-white text-slate-950 shadow-xs ring-1 ring-slate-900/5'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Utensils className="w-4 h-4 text-amber-600" />
              <span>Restaurante</span>
            </button>

            <button
              onClick={() => {
                setActiveTab('route_distribution')
                setCustomPrepared(false)
              }}
              className={`px-3.5 sm:px-5 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition-all cursor-pointer whitespace-nowrap flex items-center gap-2 ${
                activeTab === 'route_distribution'
                  ? 'bg-white text-slate-950 shadow-xs ring-1 ring-slate-900/5'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Truck className="w-4 h-4 text-blue-600" />
              <span>Producción y distribución</span>
            </button>

            <button
              onClick={() => {
                setActiveTab('gelateria_weight_cafe')
                setCustomPrepared(false)
              }}
              className={`px-3.5 sm:px-5 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition-all cursor-pointer whitespace-nowrap flex items-center gap-2 ${
                activeTab === 'gelateria_weight_cafe'
                  ? 'bg-white text-slate-950 shadow-xs ring-1 ring-slate-900/5'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Store className="w-4 h-4 text-teal-600" />
              <span>Comercio / Venta rápida</span>
            </button>

            <button
              onClick={() => setActiveTab('custom')}
              className={`px-3.5 sm:px-5 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition-all cursor-pointer whitespace-nowrap flex items-center gap-2 ${
                activeTab === 'custom'
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Sliders className="w-4 h-4 text-amber-400" />
              <span>Necesito algo diferente</span>
            </button>
          </div>
        </div>

        {/* CONTENIDO 1: RESTAURANTE */}
        {activeTab === 'restaurant_pos' && (
          <div className="bg-slate-50/60 rounded-3xl border border-slate-200/80 p-6 sm:p-10 grid grid-cols-1 lg:grid-cols-12 gap-8 items-center animate-in fade-in duration-200">
            <div className="lg:col-span-7 space-y-6">
              <div className="space-y-2">
                <span className="text-xs font-bold text-amber-800 bg-amber-50 px-3 py-1 rounded-full border border-amber-200/60">
                  Gastronomía • Salón • Barra • Delivery
                </span>
                <h3 className="text-2xl sm:text-3xl font-extrabold text-slate-950 tracking-tight">
                  PACHAX para Restaurante
                </h3>
                <p className="text-sm sm:text-base text-slate-600 leading-relaxed">
                  Control total del salón y la cocina en tiempo real. Cierra turnos con arqueo ciego, comanda por lotes con impresión directa en cocina y libera mesas al instante tras el cobro.
                </p>
              </div>

              {/* Capacidades */}
              <div className="space-y-2">
                <span className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                  Módulos operativos incluidos
                </span>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                  {[
                    'Mesas y cuentas activas',
                    'Comandas por lotes (KDS)',
                    'POS y caja rápida',
                    'Turnos y arqueo ciego',
                    'Cocina en tiempo real',
                    'Inventario de insumos',
                  ].map((cap, i) => (
                    <div
                      key={i}
                      className="flex items-center gap-2 bg-white px-3 py-2 rounded-xl border border-slate-200/70 text-xs font-medium text-slate-700 shadow-2xs"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                      <span>{cap}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Botones de acción de la plantilla */}
              <div className="pt-3 flex flex-wrap items-center gap-3">
                <a
                  href="/demo/restaurant"
                  className="px-5 py-2.5 text-sm font-bold text-white bg-slate-900 hover:bg-slate-800 rounded-xl transition shadow-xs inline-flex items-center gap-2 cursor-pointer"
                >
                  <span>Probar demo interactiva</span>
                  <ArrowRight className="w-4 h-4" />
                </a>
                <button
                  onClick={() => navigate('/register?template=restaurant_pos')}
                  className="px-5 py-2.5 text-sm font-semibold text-slate-800 bg-white hover:bg-slate-100 border border-slate-300 rounded-xl transition cursor-pointer"
                >
                  Crear mi empresa con esta plantilla
                </button>
              </div>
            </div>

            {/* Columna visual / preview representativa */}
            <div className="lg:col-span-5 bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-700 flex items-center justify-center font-bold text-xs">
                    M-7
                  </div>
                  <div>
                    <h5 className="text-xs font-bold text-slate-900">Mesa 7 • Cuenta Solicitada</h5>
                    <span className="text-[10px] text-slate-400">Total a cobrar: Bs 215.00</span>
                  </div>
                </div>
                <span className="text-[11px] font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full">
                  Imprimir Ticket
                </span>
              </div>
              <div className="text-xs space-y-2 text-slate-600">
                <div className="flex justify-between">
                  <span>2x Ojo de Bife 350g</span>
                  <span className="font-semibold text-slate-900">Bs 150.00</span>
                </div>
                <div className="flex justify-between">
                  <span>1x Jarra Limonada 1L</span>
                  <span className="font-semibold text-slate-900">Bs 25.00</span>
                </div>
                <div className="flex justify-between">
                  <span>2x Copa Vino Tinto</span>
                  <span className="font-semibold text-slate-900">Bs 40.00</span>
                </div>
              </div>
              <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
                <span className="text-xs text-slate-500">Cobro rápido:</span>
                <div className="flex gap-1.5">
                  <span className="text-[11px] font-bold bg-emerald-50 text-emerald-800 px-2 py-1 rounded-md border border-emerald-200">
                    Efectivo
                  </span>
                  <span className="text-[11px] font-bold bg-blue-50 text-blue-800 px-2 py-1 rounded-md border border-blue-200">
                    Cobro QR
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* CONTENIDO 2: DISTRIBUCIÓN */}
        {activeTab === 'route_distribution' && (
          <div className="bg-slate-50/60 rounded-3xl border border-slate-200/80 p-6 sm:p-10 grid grid-cols-1 lg:grid-cols-12 gap-8 items-center animate-in fade-in duration-200">
            <div className="lg:col-span-7 space-y-6">
              <div className="space-y-2">
                <span className="text-xs font-bold text-blue-800 bg-blue-50 px-3 py-1 rounded-full border border-blue-200/60">
                  Preventa • Despachos • Rutas Móviles • Almacenes
                </span>
                <h3 className="text-2xl sm:text-3xl font-extrabold text-slate-950 tracking-tight">
                  PACHAX para Producción y distribución
                </h3>
                <p className="text-sm sm:text-base text-slate-600 leading-relaxed">
                  Cuadre riguroso de carga en kilos y paquetes, liquidación de choferes al centavo, cobro de cartera a crédito y cierre de ruta con comprobante impreso.
                </p>
              </div>

              {/* Capacidades */}
              <div className="space-y-2">
                <span className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                  Módulos operativos incluidos
                </span>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                  {[
                    'Carga de camiones',
                    'Venta móvil en ruta',
                    'Créditos y cartera',
                    'Liquidación y variance',
                    'Gestión de almacenes',
                    'Impresión térmica móvil',
                  ].map((cap, i) => (
                    <div
                      key={i}
                      className="flex items-center gap-2 bg-white px-3 py-2 rounded-xl border border-slate-200/70 text-xs font-medium text-slate-700 shadow-2xs"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                      <span>{cap}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Botones de acción */}
              <div className="pt-3 flex flex-wrap items-center gap-3">
                <a
                  href="/demo/distribution"
                  className="px-5 py-2.5 text-sm font-bold text-white bg-slate-900 hover:bg-slate-800 rounded-xl transition shadow-xs inline-flex items-center gap-2 cursor-pointer"
                >
                  <span>Probar demo interactiva</span>
                  <ArrowRight className="w-4 h-4" />
                </a>
                <button
                  onClick={() => navigate('/register?template=route_distribution')}
                  className="px-5 py-2.5 text-sm font-semibold text-slate-800 bg-white hover:bg-slate-100 border border-slate-300 rounded-xl transition cursor-pointer"
                >
                  Crear mi empresa con esta plantilla
                </button>
              </div>
            </div>

            {/* Preview representativa */}
            <div className="lg:col-span-5 bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-700 flex items-center justify-center font-bold text-xs">
                    R-02
                  </div>
                  <div>
                    <h5 className="text-xs font-bold text-slate-900">Cierre de Ruta • Hugo M.</h5>
                    <span className="text-[10px] text-slate-400">14 clientes visitados hoy</span>
                  </div>
                </div>
                <span className="text-[11px] font-bold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                  Cuadrado
                </span>
              </div>
              <div className="text-xs space-y-2 text-slate-600">
                <div className="flex justify-between">
                  <span>Total ventas:</span>
                  <span className="font-semibold text-slate-900">Bs 447.00</span>
                </div>
                <div className="flex justify-between">
                  <span>Cobros cartera previa:</span>
                  <span className="font-semibold text-emerald-700">+ Bs 100.00</span>
                </div>
                <div className="flex justify-between">
                  <span>Efectivo entregado:</span>
                  <span className="font-extrabold text-slate-900">Bs 368.00</span>
                </div>
              </div>
              <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
                <span className="text-slate-500">Variance inventario:</span>
                <span className="font-bold text-emerald-600">0.00 kg (Exacto)</span>
              </div>
            </div>
          </div>
        )}

        {/* CONTENIDO 3: COMERCIO */}
        {activeTab === 'gelateria_weight_cafe' && (
          <div className="bg-slate-50/60 rounded-3xl border border-slate-200/80 p-6 sm:p-10 grid grid-cols-1 lg:grid-cols-12 gap-8 items-center animate-in fade-in duration-200">
            <div className="lg:col-span-7 space-y-6">
              <div className="space-y-2">
                <span className="text-xs font-bold text-teal-800 bg-teal-50 px-3 py-1 rounded-full border border-teal-200/60">
                  Mostrador • Balanza Digital • Venta por Peso & Unidad
                </span>
                <h3 className="text-2xl sm:text-3xl font-extrabold text-slate-950 tracking-tight">
                  PACHAX para Comercio / Venta rápida
                </h3>
                <p className="text-sm sm:text-base text-slate-600 leading-relaxed">
                  Atención fluida para negocios con balanza y mostrador. Combina productos por peso exacto con artículos por unidad en un único ticket, imprimiendo al momento o cobrando por QR.
                </p>
              </div>

              {/* Capacidades */}
              <div className="space-y-2">
                <span className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                  Módulos operativos incluidos
                </span>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                  {[
                    'Balanza en gramos y kilos',
                    'Carrito mixto inteligente',
                    'Cobro al paso (Efectivo/QR)',
                    'Catálogo y categorías',
                    'Caja y arqueo de turno',
                    'Control de stock ágil',
                  ].map((cap, i) => (
                    <div
                      key={i}
                      className="flex items-center gap-2 bg-white px-3 py-2 rounded-xl border border-slate-200/70 text-xs font-medium text-slate-700 shadow-2xs"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5 text-teal-600 shrink-0" />
                      <span>{cap}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Botones de acción */}
              <div className="pt-3 flex flex-wrap items-center gap-3">
                <a
                  href="/demo/retail"
                  className="px-5 py-2.5 text-sm font-bold text-white bg-slate-900 hover:bg-slate-800 rounded-xl transition shadow-xs inline-flex items-center gap-2 cursor-pointer"
                >
                  <span>Probar demo interactiva</span>
                  <ArrowRight className="w-4 h-4" />
                </a>
                <button
                  onClick={() => navigate('/register?template=gelateria_weight_cafe')}
                  className="px-5 py-2.5 text-sm font-semibold text-slate-800 bg-white hover:bg-slate-100 border border-slate-300 rounded-xl transition cursor-pointer"
                >
                  Crear mi empresa con esta plantilla
                </button>
              </div>
            </div>

            {/* Preview representativa */}
            <div className="lg:col-span-5 bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-teal-50 text-teal-700 flex items-center justify-center font-bold text-xs">
                    POS
                  </div>
                  <div>
                    <h5 className="text-xs font-bold text-slate-900">Venta de Mostrador</h5>
                    <span className="text-[10px] text-slate-400">Lectura de balanza activa</span>
                  </div>
                </div>
                <span className="text-[11px] font-bold text-teal-800 bg-teal-50 px-2 py-0.5 rounded-full border border-teal-200">
                  325g • Bs 19.50
                </span>
              </div>
              <div className="p-3 bg-slate-900 rounded-xl text-white text-center">
                <span className="text-[11px] text-slate-400 block">Queso Criollo @ Bs 60/kg</span>
                <span className="text-xl font-mono font-bold text-emerald-400">Bs 19.50</span>
              </div>
              <div className="flex items-center justify-between text-xs pt-1">
                <span className="text-slate-500">Ticket mixto:</span>
                <span className="font-bold text-slate-900">Helado + Peso = Bs 37.50</span>
              </div>
            </div>
          </div>
        )}

        {/* CONTENIDO 4: NECESITO ALGO DIFERENTE */}
        {activeTab === 'custom' && (
          <div className="bg-slate-900 text-white rounded-3xl p-6 sm:p-10 grid grid-cols-1 lg:grid-cols-12 gap-8 items-center animate-in fade-in duration-200 shadow-xl">
            <div className="lg:col-span-6 space-y-6">
              <div className="space-y-3">
                <span className="text-xs font-bold text-amber-400 bg-slate-800 px-3 py-1 rounded-full border border-slate-700 inline-flex items-center gap-1.5">
                  <Sparkles className="w-3 h-3" />
                  Adaptación Operativa a Medida
                </span>
                <h3 className="text-2xl sm:text-3xl font-black tracking-tight text-white">
                  Tu negocio no tiene por qué encajar en un molde rígido.
                </h3>
                <p className="text-sm sm:text-base text-slate-300 leading-relaxed">
                  Si tu empresa opera con etapas de producción específicas, pesaje en planta, reglas de comisión complejas o módulos que un software genérico no contempla, la arquitectura PACHAX se configura para tu dinámica.
                </p>
              </div>

              {/* Capacidades a medida */}
              <div className="space-y-2">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                  Posibilidades de adaptación
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                  {[
                    'Etapas de transformación y producción',
                    'Flujos de despacho con validación propia',
                    'Integraciones con hardware y balanzas',
                    'Informes y fórmulas de costo a medida',
                  ].map((item, i) => (
                    <div
                      key={i}
                      className="flex items-center gap-2 bg-slate-800/80 px-3 py-2 rounded-xl border border-slate-700/80 text-slate-200"
                    >
                      <Layers className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                      <span>{item}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Formulario elegante de solicitud a medida */}
            <div className="lg:col-span-6 bg-slate-800/90 rounded-2xl border border-slate-700/80 p-5 sm:p-7 shadow-lg">
              {!customPrepared ? (
                <form onSubmit={handleCustomSubmit} className="space-y-3.5 text-slate-200">
                  <div>
                    <h4 className="text-base font-bold text-white mb-1">
                      Describe tu necesidad operativa
                    </h4>
                    <p className="text-xs text-slate-400">
                      Evaluaremos la mejor arquitectura de módulos para tu caso.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                        Tu nombre *
                      </label>
                      <input
                        type="text"
                        required
                        placeholder="Ej. Martín Soliz"
                        value={customForm.name}
                        onChange={(e) => setCustomForm({ ...customForm, name: e.target.value })}
                        className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-hidden focus:border-amber-400"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                        Nombre de la empresa
                      </label>
                      <input
                        type="text"
                        placeholder="Ej. Cervecería Los Andes"
                        value={customForm.company}
                        onChange={(e) => setCustomForm({ ...customForm, company: e.target.value })}
                        className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-hidden focus:border-amber-400"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                      ¿Qué proceso o dinámica especial necesitas resolver? *
                    </label>
                    <textarea
                      required
                      rows={3}
                      placeholder="Ej. Producimos queso artesanal, despachamos a 20 tiendas con retorno de mermas y necesitamos cobrar en ruta con impresión Bluetooth..."
                      value={customForm.details}
                      onChange={(e) => setCustomForm({ ...customForm, details: e.target.value })}
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-hidden focus:border-amber-400 resize-none"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                        Teléfono / WhatsApp
                      </label>
                      <input
                        type="tel"
                        placeholder="+591 ..."
                        value={customForm.phone}
                        onChange={(e) => setCustomForm({ ...customForm, phone: e.target.value })}
                        className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-hidden focus:border-amber-400"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                        Correo
                      </label>
                      <input
                        type="email"
                        placeholder="contacto@empresa.com"
                        value={customForm.email}
                        onChange={(e) => setCustomForm({ ...customForm, email: e.target.value })}
                        className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-hidden focus:border-amber-400"
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    className="w-full mt-2 py-3 bg-white text-slate-950 hover:bg-slate-100 font-bold text-xs sm:text-sm rounded-xl transition cursor-pointer shadow-md flex items-center justify-center gap-2"
                  >
                    <span>Preparar solicitud de solución a medida</span>
                    <ArrowRight className="w-4 h-4 text-slate-950" />
                  </button>
                </form>
              ) : (
                <div className="p-4 sm:p-6 text-center space-y-4 animate-in fade-in duration-200">
                  <div className="w-12 h-12 rounded-full bg-amber-400/20 text-amber-400 flex items-center justify-center mx-auto">
                    <CheckCircle2 className="w-6 h-6" />
                  </div>
                  <div>
                    <h4 className="text-base font-bold text-white">
                      Solicitud lista para coordinación
                    </h4>
                    <p className="text-xs text-slate-300 mt-1.5 leading-relaxed max-w-md mx-auto">
                      Hemos preparado tu solicitud para <strong>{customForm.company || customForm.name}</strong>. Puedes enviarla directamente a nuestro equipo técnico para acordar la arquitectura operativa.
                    </p>
                  </div>

                  <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-2.5">
                    <a
                      href={`https://wa.me/?text=${encodeURIComponent(
                        `Hola PACHAX, soy ${customForm.name} de ${customForm.company || 'mi negocio'}. Requerimiento: ${customForm.details} (Tel: ${customForm.phone})`
                      )}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="w-full sm:w-auto px-5 py-2.5 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-500 rounded-xl transition inline-flex items-center justify-center gap-2"
                    >
                      <MessageSquare className="w-4 h-4" />
                      <span>Contactar por WhatsApp</span>
                    </a>
                    <button
                      onClick={() => setCustomPrepared(false)}
                      className="text-xs text-slate-400 hover:text-white underline cursor-pointer"
                    >
                      Modificar datos
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </section>
  )
}
