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
      setIsScrolled(window.scrollY > 15)
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

  const isAuthorized = auth.status === 'authorized'
  const companyName = auth.account?.name || 'Mi Empresa'

  return (
    <header
      className={`sticky top-0 z-50 w-full transition-all duration-200 ${
        isScrolled
          ? 'bg-white/95 backdrop-blur-md border-b border-slate-200/80 shadow-xs'
          : 'bg-white/80 backdrop-blur-xs border-b border-slate-100'
      }`}
    >
      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 h-16 sm:h-20 flex items-center justify-between">
        {/* Identidad Oficial: Logo PACHAX Platform */}
        <div className="flex items-center shrink-0">
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
        <nav className="hidden md:flex items-center gap-8 text-[14px] font-medium text-slate-700">
          <button
            type="button"
            onClick={() => handleNav('#plantillas')}
            className="hover:text-slate-950 transition-colors cursor-pointer"
          >
            Plantillas
          </button>
          <button
            type="button"
            onClick={() => handleNav('#planes')}
            className="hover:text-slate-950 transition-colors cursor-pointer"
          >
            Planes
          </button>
          <button
            type="button"
            onClick={() => handleNav('#tutoriales')}
            className="hover:text-slate-950 transition-colors cursor-pointer"
          >
            Tutoriales
          </button>
        </nav>

        {/* Acciones Desktop */}
        <div className="hidden md:flex items-center gap-4 shrink-0">
          {/* Separador vertical sutil */}
          <div className="h-5 w-px bg-slate-200" aria-hidden="true" />

          {isAuthorized ? (
            <button
              type="button"
              onClick={() => navigate('/login')}
              className="px-4 py-2 text-sm font-semibold text-white bg-slate-900 hover:bg-slate-800 transition-all rounded-xl shadow-xs cursor-pointer inline-flex items-center gap-2 group"
            >
              <span>Ir a mi empresa ({companyName})</span>
              <ArrowRight className="w-4 h-4 text-slate-300 group-hover:translate-x-0.5 transition-transform" />
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={() => navigate('/login')}
                className="px-3 py-2 text-sm font-medium text-slate-700 hover:text-slate-950 transition-colors cursor-pointer"
              >
                Iniciar sesión
              </button>
              <button
                type="button"
                onClick={() => navigate('/register')}
                className="px-5 py-2.5 text-sm font-semibold text-white bg-[#0066FF] hover:bg-[#0052cc] transition-all rounded-xl shadow-xs hover:shadow-md cursor-pointer inline-flex items-center gap-1.5 active:scale-98"
              >
                <span>Registrarse</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </>
          )}
        </div>

        {/* Acciones Mobile / Tablet (Diseñadas para caber con holgura desde 360px) */}
        <div className="flex md:hidden items-center gap-1.5 sm:gap-2 shrink-0">
          {isAuthorized ? (
            <button
              type="button"
              onClick={() => navigate('/login')}
              className="px-2.5 py-1 text-xs font-semibold text-white bg-slate-900 rounded-lg inline-flex items-center gap-1"
            >
              <span>Mi Empresa</span>
              <ArrowRight className="w-3 h-3" />
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={() => navigate('/login')}
                className="px-2 py-1 text-xs font-medium text-slate-700 hover:text-slate-950 whitespace-nowrap"
              >
                Iniciar sesión
              </button>
              <button
                type="button"
                onClick={() => navigate('/register')}
                className="px-2.5 py-1 text-xs font-semibold text-white bg-[#0066FF] hover:bg-[#0052cc] rounded-lg shadow-xs whitespace-nowrap"
              >
                Registrarse
              </button>
            </>
          )}

          {/* Botón de Menú Hamburguesa */}
          <button
            type="button"
            onClick={() => setIsMenuOpen(!isMenuOpen)}
            className="p-1 text-slate-700 hover:text-slate-950 rounded-lg hover:bg-slate-100 transition-colors"
            aria-label={isMenuOpen ? 'Cerrar menú' : 'Abrir menú'}
            aria-expanded={isMenuOpen}
          >
            {isMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Menú Móvil Desplegable */}
      {isMenuOpen && (
        <div className="md:hidden border-t border-slate-200 bg-white/98 backdrop-blur-md px-4 pt-3 pb-6 space-y-3 animate-in fade-in slide-in-from-top-2 duration-150 shadow-lg">
          <div className="flex flex-col space-y-2 text-sm font-medium text-slate-800">
            <button
              type="button"
              onClick={() => handleNav('#plantillas')}
              className="py-2 px-3 text-left rounded-lg hover:bg-slate-50 transition-colors"
            >
              Plantillas
            </button>
            <button
              type="button"
              onClick={() => handleNav('#planes')}
              className="py-2 px-3 text-left rounded-lg hover:bg-slate-50 transition-colors"
            >
              Planes
            </button>
            <button
              type="button"
              onClick={() => handleNav('#tutoriales')}
              className="py-2 px-3 text-left rounded-lg hover:bg-slate-50 transition-colors"
            >
              Tutoriales
            </button>
          </div>

          <div className="pt-3 border-t border-slate-100 flex flex-col gap-2">
            {isAuthorized ? (
              <button
                type="button"
                onClick={() => {
                  setIsMenuOpen(false)
                  navigate('/login')
                }}
                className="w-full py-2.5 text-sm font-semibold text-white bg-slate-900 rounded-xl text-center"
              >
                Ir a mi empresa ({companyName})
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => {
                    setIsMenuOpen(false)
                    navigate('/login')
                  }}
                  className="w-full py-2 text-sm font-medium text-slate-700 border border-slate-200 rounded-xl text-center"
                >
                  Iniciar sesión
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIsMenuOpen(false)
                    navigate('/register')
                  }}
                  className="w-full py-2.5 text-sm font-semibold text-white bg-[#0066FF] rounded-xl text-center shadow-xs"
                >
                  Registrarse
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </header>
  )
}
