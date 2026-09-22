import { ArrowRight, Sparkles, Compass } from 'lucide-react'
import { usePublicRouter } from '../routing/usePublicRouter'
import { HeroProductShowcase } from './HeroProductShowcase'

export function LandingHero() {
  const { navigate } = usePublicRouter()

  return (
    <section className="relative pt-8 pb-16 sm:pt-14 sm:pb-24 overflow-hidden">
      {/* Fondo sutilmente estructurado con gradiente muy suave en tonos marfil y slate */}
      <div className="absolute inset-0 bg-radial-[at_top_center] from-slate-100/60 via-slate-50/30 to-transparent pointer-events-none -z-10" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Contenido Editorial del Hero */}
        <div className="text-center max-w-3xl mx-auto space-y-5 sm:space-y-6">
          {/* Eyebrow badge */}
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-slate-100 border border-slate-200/80 text-xs font-semibold text-slate-700 shadow-2xs">
            <Sparkles className="w-3.5 h-3.5 text-teal-600" />
            <span>Software empresarial adaptable a tu dinámica</span>
          </div>

          {/* Headline riguroso y potente */}
          <h1 className="text-4xl sm:text-6xl font-black text-slate-950 tracking-tight leading-[1.08]">
            Tu negocio. <br />
            Tu forma de trabajar. <br />
            <span className="text-slate-700 font-extrabold">Un solo sistema.</span>
          </h1>

          {/* Supporting Copy */}
          <p className="text-base sm:text-lg text-slate-600 font-normal max-w-2xl mx-auto leading-relaxed">
            PACHAX adapta ventas, inventario, equipos y operaciones a la forma real en que funciona tu empresa.
          </p>

          {/* Botones de acción */}
          <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-4">
            <button
              onClick={() => navigate('#soluciones')}
              className="w-full sm:w-auto px-6 py-3.5 text-sm sm:text-base font-bold text-white bg-slate-900 hover:bg-slate-800 rounded-xl transition shadow-sm cursor-pointer inline-flex items-center justify-center gap-2 group"
            >
              <Compass className="w-4 h-4 text-teal-400" />
              <span>Explorar soluciones</span>
              <ArrowRight className="w-4 h-4 text-slate-400 group-hover:translate-x-0.5 transition-transform" />
            </button>
            <button
              onClick={() => navigate('/register')}
              className="w-full sm:w-auto px-6 py-3.5 text-sm sm:text-base font-semibold text-slate-800 bg-white hover:bg-slate-50 border border-slate-300/80 rounded-xl transition shadow-2xs cursor-pointer inline-flex items-center justify-center"
            >
              Crear mi empresa
            </button>
          </div>
        </div>

        {/* Vitrina de Producto en Vivo (Hero Visual Showcase) */}
        <div className="mt-12 sm:mt-16">
          <HeroProductShowcase />
        </div>
      </div>
    </section>
  )
}
