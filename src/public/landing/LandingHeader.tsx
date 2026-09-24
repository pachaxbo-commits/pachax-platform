import { useState, useEffect } from 'react'
import { Menu, X, ArrowRight } from 'lucide-react'
import { BrandMark } from '../components/BrandMark'
import { usePublicRouter } from '../routing/usePublicRouter'
import { useAuthStore } from '../../store/authStore'

export function LandingHeader() {
  const auth = useAuthStore()
  const { navigate, path } = usePublicRouter()
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const [isScrolled, setIsScrolled] = useState(false)

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 20)
    }
    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  const handleNav = (target: string) => {
    setIsMenuOpen(false)
    if (path !== '/' && target.startsWith('#')) {
      navigate('/' + target)
    } else {
      navigate(target)
    }
  }

  return (
    <header
      className={`sticky top-0 z-50 w-full transition-all duration-200 ${
        isScrolled
          ? 'bg-white/95 backdrop-blur-md border-b border-slate-200/80 shadow-xs'
          : 'bg-white/70 backdrop-blur-xs border-b border-transparent'
      }`}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 sm:h-20 flex items-center justify-between">
        {/* BrandMark provisional (reemplazable centralmente por <PachaxLogo />) */}
        <div className="flex items-center gap-6">
          <BrandMark
            size="md"
            href="/"
            onClick={(e) => {
              e.preventDefault()
              navigate('/')
            }}
          />
        </div>

        {/* Navegación Desktop */}
        <nav className="hidden md:flex items-center gap-8 text-sm font-semibold text-slate-600">
          <button
            onClick={() => handleNav('#producto')}
            className="hover:text-slate-950 transition cursor-pointer"
          >
            Producto
          </button>
          <button
            onClick={() => handleNav('#soluciones')}
            className="hover:text-slate-950 transition cursor-pointer"
          >
            Soluciones
          </button>
          <button
            onClick={() => handleNav('#personalizacion')}
            className="hover:text-slate-950 transition cursor-pointer"
          >
            Personalización
          </button>
          <a
            href="/demo"
            className="hover:text-slate-950 transition inline-flex items-center gap-1.5"
          >
            <span>Demos</span>
            <span className="text-[10px] font-bold text-teal-700 bg-teal-50 border border-teal-200 px-1.5 py-0.2 rounded-md">
              En vivo
            </span>
          </a>
        </nav>

        {/* Acciones Desktop */}
        <div className="hidden md:flex items-center gap-3">
          {auth.status === 'authorized' ? (
            <button
              onClick={() => navigate('/login')}
              className="px-4 py-2 text-sm font-bold text-white bg-slate-900 hover:bg-slate-800 transition rounded-xl shadow-xs cursor-pointer inline-flex items-center gap-2 group"
            >
              <span>Ir al sistema ({auth.account?.name || 'Mi Empresa'})</span>
              <ArrowRight className="w-4 h-4 text-slate-300 group-hover:translate-x-0.5 transition-transform" />
            </button>
          ) : (
            <>
              <button
                onClick={() => navigate('/login')}
                className="px-4 py-2 text-sm font-semibold text-slate-700 hover:text-slate-950 transition cursor-pointer rounded-xl hover:bg-slate-100/80"
              >
                Ingresar
              </button>
              <button
                onClick={() => navigate('/register')}
                className="px-4 py-2 text-sm font-bold text-white bg-slate-900 hover:bg-slate-800 transition rounded-xl shadow-xs cursor-pointer inline-flex items-center gap-2 group"
              >
                <span>Crear mi empresa</span>
                <ArrowRight className="w-4 h-4 text-slate-300 group-hover:translate-x-0.5 transition-transform" />
              </button>
            </>
          )}
        </div>

        {/* Botón menú móvil */}
        <button
          onClick={() => setIsMenuOpen(!isMenuOpen)}
          className="md:hidden p-2 rounded-xl text-slate-700 hover:text-slate-950 hover:bg-slate-100 transition focus:outline-hidden"
          aria-label="Abrir menú"
          aria-expanded={isMenuOpen}
        >
          {isMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
        </button>
      </div>

      {/* Menú Móvil Desplegable */}
      {isMenuOpen && (
        <div className="md:hidden bg-white border-b border-slate-200 px-5 pt-3 pb-6 space-y-4 shadow-xl">
          <nav className="flex flex-col space-y-3 pt-2 text-base font-semibold text-slate-700">
            <button
              onClick={() => handleNav('#producto')}
              className="text-left py-2 hover:text-slate-950 transition cursor-pointer"
            >
              Producto
            </button>
            <button
              onClick={() => handleNav('#soluciones')}
              className="text-left py-2 hover:text-slate-950 transition cursor-pointer"
            >
              Soluciones por sector
            </button>
            <button
              onClick={() => handleNav('#personalizacion')}
              className="text-left py-2 hover:text-slate-950 transition cursor-pointer"
            >
              Personalización de marca
            </button>
            <a
              href="/demo"
              className="py-2 hover:text-slate-950 transition flex items-center justify-between"
            >
              <span>Explorar Demos</span>
              <span className="text-xs font-bold text-teal-700 bg-teal-50 px-2 py-0.5 rounded-full border border-teal-200">
                Interactivas
              </span>
            </a>
          </nav>

          <div className="pt-4 border-t border-slate-100 flex flex-col gap-2.5">
            {auth.status === 'authorized' ? (
              <button
                onClick={() => handleNav('/login')}
                className="w-full py-3 text-sm font-bold text-white bg-slate-900 hover:bg-slate-800 rounded-xl transition cursor-pointer text-center flex items-center justify-center gap-2"
              >
                <span>Ir al sistema ({auth.account?.name || 'Mi Empresa'})</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            ) : (
              <>
                <button
                  onClick={() => handleNav('/login')}
                  className="w-full py-3 text-sm font-semibold text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-xl transition cursor-pointer text-center"
                >
                  Ingresar al sistema
                </button>
                <button
                  onClick={() => handleNav('/register')}
                  className="w-full py-3 text-sm font-bold text-white bg-slate-900 hover:bg-slate-800 rounded-xl transition cursor-pointer text-center flex items-center justify-center gap-2"
                >
                  <span>Crear mi empresa</span>
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </header>
  )
}
