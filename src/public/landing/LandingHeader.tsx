import { useEffect, useState } from 'react'
import { ArrowRight, Menu, X } from 'lucide-react'
import { usePublicRouter } from '../routing/usePublicRouter'
import { useAuthStore } from '../../store/authStore'
import { PUBLIC_TENANT_SELF_SERVICE_CREATION_ENABLED } from '../../core/publicTemplates'

export function LandingHeader() {
  const auth = useAuthStore()
  const { navigate } = usePublicRouter()
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const [isScrolled, setIsScrolled] = useState(false)

  useEffect(() => {
    const handleScroll = () => setIsScrolled(window.scrollY > 12)
    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  const handleNav = (target: string) => {
    setIsMenuOpen(false)
    if (target.startsWith('#')) {
      const el = document.getElementById(target.slice(1))
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' })
        return
      }
    }
    navigate(target)
  }

  const isAuthorized = auth.status === 'authorized'
  const companyName = auth.account?.name || 'Mi Empresa'

  return (
    <header className={`pachax-header${isScrolled ? ' is-scrolled' : ''}`}>
      <div className="pachax-header-inner">
        <a href="/" className="pachax-brand-lockup" aria-label="PACHAX Platform, inicio" onClick={(event) => { event.preventDefault(); navigate('/') }}>
          <img src="/brand/pachax-logo-white.png" alt="PACHAX" />
          <span>Platform</span>
        </a>

        <nav className="pachax-desktop-nav" aria-label="Navegación principal">
          <button type="button" onClick={() => handleNav('#plantillas')}>Plantillas</button>
          <button type="button" onClick={() => handleNav('#planes')}>Planes</button>
          <button type="button" onClick={() => handleNav('#tutoriales')}>Tutoriales</button>
        </nav>

        <div className="pachax-header-actions">
          {isAuthorized ? (
            <button type="button" className="pachax-account-link" onClick={() => navigate('/platform')}>
              <span>Ir a mi empresa ({companyName})</span><ArrowRight aria-hidden="true" />
            </button>
          ) : <>
            <button type="button" className="pachax-login-link" onClick={() => navigate('/login')}>Iniciar sesión</button>
            <button type="button" className="pachax-register-button" onClick={() => navigate('/register')}>
              {PUBLIC_TENANT_SELF_SERVICE_CREATION_ENABLED ? 'Registrarse' : 'Solicitar implementación'} <ArrowRight aria-hidden="true" />
            </button>
          </>}
        </div>

        <button
          type="button"
          className="pachax-menu-toggle"
          onClick={() => setIsMenuOpen((open) => !open)}
          aria-label={isMenuOpen ? 'Cerrar menú' : 'Abrir menú'}
          aria-expanded={isMenuOpen}
          aria-controls="pachax-mobile-menu"
        >
          {isMenuOpen ? <X aria-hidden="true" /> : <Menu aria-hidden="true" />}
        </button>
      </div>

      {isMenuOpen && (
        <div className="pachax-mobile-menu" id="pachax-mobile-menu">
          <nav aria-label="Navegación móvil">
            <button type="button" onClick={() => handleNav('#plantillas')}>Plantillas</button>
            <button type="button" onClick={() => handleNav('#planes')}>Planes</button>
            <button type="button" onClick={() => handleNav('#tutoriales')}>Tutoriales</button>
          </nav>
          <div>
            {isAuthorized ? (
              <button type="button" onClick={() => { setIsMenuOpen(false); navigate('/platform') }}>Ir a mi empresa ({companyName})</button>
            ) : <>
              <button type="button" onClick={() => { setIsMenuOpen(false); navigate('/login') }}>Iniciar sesión</button>
              <button type="button" className="pachax-register-button" onClick={() => { setIsMenuOpen(false); navigate('/register') }}>
                {PUBLIC_TENANT_SELF_SERVICE_CREATION_ENABLED ? 'Registrarse' : 'Solicitar implementación'} <ArrowRight aria-hidden="true" />
              </button>
            </>}
          </div>
        </div>
      )}
    </header>
  )
}
