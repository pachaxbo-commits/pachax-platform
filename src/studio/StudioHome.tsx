import { Utensils, Truck, Store, Music2, ArrowRight, Shield } from 'lucide-react'
import type { DemoTemplateId } from '../demo/demoTypes'
import { PUBLIC_TEMPLATES } from '../core/publicTemplates'

export function StudioHome({ onSelectTemplate }: { onSelectTemplate: (templateId: DemoTemplateId) => void }) {
  const presentation = {
    restaurant: {
      company: 'Bistró Demo',
      icon: Utensils,
      badges: ['Salón & Mesas', 'KDS Cocina', 'Caja POS'],
      internalNote: 'Flujo gastronómico completo sin dependencias remotas.',
    },
    distribution: {
      company: 'Distribuidora Demo',
      icon: Truck,
      badges: ['17 Módulos', 'Preventa & Rutas', 'Créditos'],
      internalNote: 'Plantilla de referencia conectada con 55 comprobaciones unitarias.',
    },
    retail: {
      company: 'Amapola Demo',
      icon: Store,
      badges: ['Peso (Gramos)', 'Unidades', 'Carrito Mixto'],
      internalNote: 'Útil para heladerías, cafeterías de mostrador, panaderías, reposterías, tiendas a granel, dulcerías y negocios que vendan por peso y/o unidad.',
    },
    nightclub: {
      company: 'Nocturna Demo',
      icon: Music2,
      badges: ['VIP & Reservados', 'Rondas', 'Barra'],
      internalNote: 'Base independiente para operación nocturna y evolución visual propia.',
    },
  } as const
  const templates = PUBLIC_TEMPLATES.map(template => ({ id: template.studioTemplateId as DemoTemplateId, title: template.title, description: template.shortDescription, ...presentation[template.id] }))

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans flex flex-col justify-between">
      {/* Top Banner de Studio */}
      <header className="bg-slate-900 text-white px-6 py-4 border-b border-slate-800 shadow-sm">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-xl font-black tracking-tight text-white flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-teal-400 animate-pulse" />
              PACHAX Studio
            </span>
            <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700">
              Dev & Preview Shell
            </span>
          </div>

          <div className="flex items-center gap-4 text-xs">
            <span className="text-slate-400 hidden sm:inline">
              Entorno interno de desarrollo • Sin Firebase
            </span>
            <a
              href="/demo"
              className="text-teal-400 hover:text-teal-300 font-semibold underline"
            >
              Ver Demos Públicas →
            </a>
          </div>
        </div>
      </header>

      {/* Main Cover Content */}
      <main className="flex-1 max-w-6xl mx-auto px-6 py-12 flex flex-col justify-center">
        {/* Header */}
        <div className="text-center max-w-3xl mx-auto mb-12">
          <h1 className="text-3xl sm:text-5xl font-black text-slate-900 tracking-tight">
            PACHAX Studio
          </h1>
          <p className="mt-3 text-base sm:text-lg text-slate-600 font-medium">
            Entorno interno de plantillas y experiencia de usuario
          </p>
          <div className="mt-4 inline-flex items-center gap-2 px-3 py-1 bg-amber-50 border border-amber-200 rounded-full text-xs font-semibold text-amber-900">
            <Shield className="w-3.5 h-3.5 text-amber-600" />
            <span>Modo Equipo predeterminado: acceso completo a todos los módulos sin login</span>
          </div>
        </div>

        {/* Tarjetas de plantillas canónicas */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
          {templates.map((t) => {
            const Icon = t.icon
            return (
              <div
                key={t.id}
                onClick={() => onSelectTemplate(t.id)}
                className="bg-white rounded-2xl border border-slate-200/90 hover:border-slate-400 p-6 shadow-xs hover:shadow-xl transition-all cursor-pointer flex flex-col justify-between group"
              >
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <div className="w-12 h-12 rounded-xl bg-slate-100 text-slate-900 flex items-center justify-center group-hover:bg-slate-900 group-hover:text-white transition">
                      <Icon className="w-6 h-6" />
                    </div>
                    <span className="text-[11px] font-bold text-slate-500 bg-slate-100 px-2.5 py-1 rounded-full">
                      {t.company}
                    </span>
                  </div>

                  <h2 className="text-xl font-bold text-slate-900 group-hover:text-teal-700 transition">
                    {t.title}
                  </h2>

                  <p className="text-xs text-slate-600 leading-relaxed mt-2 mb-4">
                    {t.description}
                  </p>

                  {/* Badges de módulos */}
                  <div className="flex flex-wrap gap-1.5 mb-4">
                    {t.badges.map((b, i) => (
                      <span
                        key={i}
                        className="text-[10px] font-semibold bg-slate-100 text-slate-700 px-2 py-0.5 rounded-md"
                      >
                        {b}
                      </span>
                    ))}
                  </div>

                  {/* Nota interna */}
                  <div className="p-3 bg-slate-50 rounded-xl text-[11px] text-slate-500 border border-slate-100">
                    <span className="font-semibold text-slate-700">Apto para: </span>
                    {t.internalNote}
                  </div>
                </div>

                <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-between text-xs font-bold text-slate-900 group-hover:text-teal-700">
                  <span>Abrir en Studio (Modo Equipo)</span>
                  <ArrowRight className="w-4 h-4 transform group-hover:translate-x-1 transition" />
                </div>
              </div>
            )
          })}
        </div>

        {/* Viewport & Colaboración preview footer */}
        <div className="mt-12 p-4 bg-white rounded-2xl border border-slate-200/80 text-xs text-slate-500 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <span className="font-bold text-slate-800">Simulación multidispositivo:</span>
            <span>Celular (360×800, 390×844), Tablet (768×1024), Laptop (1366×768) y Desktop.</span>
          </div>
          <div className="flex items-center gap-3 text-slate-400 font-mono text-[11px]">
            <span>feat/pachax-studio</span>
            <span>•</span>
            <span>branch ready</span>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="py-4 text-center text-xs text-slate-400 border-t border-slate-200/60 bg-white">
        PACHAX Studio • Entorno interno para el equipo de diseño y desarrollo
      </footer>
    </div>
  )
}
