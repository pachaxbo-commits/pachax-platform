import { Utensils, Truck, Store, ArrowRight, Sparkles } from 'lucide-react'
import { BrandMark } from '../public/components/BrandMark'

export function DemoGallery() {
  const demos = [
    {
      id: 'restaurant',
      title: 'Restaurante',
      company: 'Bistró Demo',
      description: 'Pedidos, mesas, cocina, caja, inventario y atención en salón.',
      icon: Utensils,
      url: '/demo/restaurant',
      tag: 'Gastronomía & Salón',
      highlights: ['Comandas en tiempo real', 'Plano visual de mesas', 'Cocina KDS', 'Arqueo de turnos'],
    },
    {
      id: 'distribution',
      title: 'Producción y distribución',
      company: 'Distribuidora Demo',
      description: 'Inventario, almacenes, despachos, rutas, ventas, créditos y retornos.',
      icon: Truck,
      url: '/demo/distribution',
      tag: 'Logística & Preventa',
      highlights: ['Cierre de rutas', 'Cobranza de créditos', 'Gestión de almacenes', 'Tickets e impresión'],
    },
    {
      id: 'retail',
      title: 'Comercio / Venta rápida',
      company: 'Amapola Demo',
      description: 'Venta por unidad o peso, atención en mostrador, caja e inventario.',
      icon: Store,
      url: '/demo/retail',
      tag: 'Mostrador & Balanza',
      highlights: ['Balanza en gramos', 'Carrito mixto (peso/unidad)', 'Venta rápida al paso', 'Caja en mostrador'],
    },
  ]

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans flex flex-col justify-between">
      {/* Header */}
      <header className="bg-white border-b border-slate-200/80 px-6 py-4 shadow-xs">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <BrandMark size="sm" href="/" />
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200">
              Galería de Soluciones
            </span>
          </div>
          <a
            href="/"
            className="text-xs font-semibold text-slate-500 hover:text-slate-950 transition"
          >
            Volver a inicio →
          </a>
        </div>
      </header>

      {/* Hero */}
      <main className="flex-1 max-w-6xl mx-auto px-6 py-12 flex flex-col justify-center">
        <div className="text-center max-w-2xl mx-auto mb-12">
          <span className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-teal-800 bg-teal-100/80 px-3 py-1 rounded-full mb-3">
            <Sparkles className="w-3.5 h-3.5 text-teal-600" />
            Demostraciones Interactivas
          </span>
          <h1 className="text-3xl sm:text-4xl font-extrabold text-slate-900 tracking-tight">
            Explora las Soluciones PACHAX
          </h1>
          <p className="mt-3 text-slate-600 text-sm sm:text-base leading-relaxed">
            Selecciona la plantilla adaptada a la dinámica de tu empresa para interactuar con datos ficticios en un entorno real.
          </p>
        </div>

        {/* Grid de las 3 Soluciones */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {demos.map((d) => {
            const Icon = d.icon
            return (
              <a
                key={d.id}
                href={d.url}
                className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-xs hover:shadow-lg hover:border-slate-300 transition flex flex-col justify-between group"
              >
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <div className="w-12 h-12 rounded-xl bg-slate-100 text-slate-900 flex items-center justify-center group-hover:bg-slate-900 group-hover:text-white transition">
                      <Icon className="w-6 h-6" />
                    </div>
                    <span className="text-[11px] font-bold text-slate-500 bg-slate-100 px-2.5 py-1 rounded-full">
                      {d.tag}
                    </span>
                  </div>

                  <h2 className="text-xl font-bold text-slate-900 group-hover:text-teal-700 transition">
                    {d.title}
                  </h2>
                  <p className="text-xs text-teal-700 font-semibold mt-0.5 mb-3">
                    Empresa demo: {d.company}
                  </p>
                  <p className="text-xs text-slate-500 leading-relaxed mb-5">
                    {d.description}
                  </p>

                  <div className="space-y-1.5 pt-4 border-t border-slate-100">
                    {d.highlights.map((h, i) => (
                      <div key={i} className="text-xs text-slate-600 flex items-center gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-teal-500" />
                        <span>{h}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-between text-xs font-bold text-slate-900 group-hover:text-teal-700">
                  <span>Probar demostración</span>
                  <ArrowRight className="w-4 h-4 transform group-hover:translate-x-1 transition" />
                </div>
              </a>
            )
          })}
        </div>
      </main>

      {/* Footer */}
      <footer className="py-6 text-center text-xs text-slate-400 border-t border-slate-200/60 bg-white">
        PACHAX • Demostraciones interactivas con datos ficticios •{' '}
        <span className="text-slate-500 font-medium">Software diseñado para celular, tablet y escritorio</span>
      </footer>
    </div>
  )
}
