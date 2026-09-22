import { BrandMark } from '../components/BrandMark'
import { usePublicRouter } from '../routing/usePublicRouter'

export function LandingFooter() {
  const { navigate } = usePublicRouter()

  return (
    <footer className="bg-slate-900 text-slate-400 text-xs border-t border-slate-800 py-12 sm:py-16">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-12">
          {/* Columna 1: Brand & Posicionamiento */}
          <div className="md:col-span-1 space-y-3">
            <BrandMark size="md" variant="light" href="/" />
            <p className="text-slate-400 text-xs leading-relaxed">
              Plataforma SaaS de gestión operativa para empresas que necesitan un sistema adaptado a su forma real de trabajar.
            </p>
          </div>

          {/* Columna 2: Soluciones */}
          <div className="space-y-2.5">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-200">
              Soluciones
            </h4>
            <ul className="space-y-2">
              <li>
                <a href="/demo/restaurant" className="hover:text-white transition">
                  Restaurante & Gastronomía
                </a>
              </li>
              <li>
                <a href="/demo/distribution" className="hover:text-white transition">
                  Producción y distribución
                </a>
              </li>
              <li>
                <a href="/demo/retail" className="hover:text-white transition">
                  Comercio & Venta rápida
                </a>
              </li>
              <li>
                <button
                  onClick={() => navigate('#soluciones')}
                  className="hover:text-white transition cursor-pointer text-left"
                >
                  Soluciones a medida
                </button>
              </li>
            </ul>
          </div>

          {/* Columna 3: Accesos y Demos */}
          <div className="space-y-2.5">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-200">
              Acceso Rápido
            </h4>
            <ul className="space-y-2">
              <li>
                <a href="/demo" className="hover:text-white transition">
                  Explorador de Demos en vivo
                </a>
              </li>
              <li>
                <button
                  onClick={() => navigate('/login')}
                  className="hover:text-white transition cursor-pointer text-left"
                >
                  Ingreso a mi empresa
                </button>
              </li>
              <li>
                <button
                  onClick={() => navigate('/register')}
                  className="hover:text-white transition cursor-pointer text-left"
                >
                  Crear mi empresa
                </button>
              </li>
            </ul>
          </div>

          {/* Columna 4: Equipo interno */}
          <div className="space-y-2.5">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-200">
              Entorno de Desarrollo
            </h4>
            <ul className="space-y-2">
              <li>
                <a
                  href="/studio"
                  className="text-slate-400 hover:text-amber-400 transition inline-flex items-center gap-1.5"
                >
                  <span>PACHAX Studio (Equipo)</span>
                  <span className="text-[10px] bg-slate-800 text-amber-400 px-1.5 py-0.5 rounded border border-slate-700">
                    Interno
                  </span>
                </a>
              </li>
            </ul>
            <p className="text-[11px] text-slate-500 pt-2">
              Herramienta de simulación responsive y diseño para el equipo de desarrollo.
            </p>
          </div>
        </div>

        {/* Barra inferior de copyright */}
        <div className="pt-8 border-t border-slate-800/80 flex flex-col sm:flex-row items-center justify-between gap-3 text-slate-500 text-[11px]">
          <div>
            © {new Date().getFullYear()} PACHAX. Todos los derechos reservados.
          </div>
          <div className="flex items-center gap-4">
            <span>Privacidad y Seguridad</span>
            <span>Términos de Servicio</span>
          </div>
        </div>
      </div>
    </footer>
  )
}
