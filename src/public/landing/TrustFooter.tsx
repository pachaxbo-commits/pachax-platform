import { usePublicRouter } from '../routing/usePublicRouter'
import { BrandMark } from '../components/BrandMark'
import { OFFICIAL_WHATSAPP } from '../config/pricingConfig'

export function TrustFooter() {
  const { navigate } = usePublicRouter()

  const facebookUrl = 'https://www.facebook.com/pachaxbo'
  const whatsappUrl = `https://wa.me/${OFFICIAL_WHATSAPP.phoneNumber}?text=${encodeURIComponent('Hola PACHAX, me contacto desde la web oficial.')}`

  return (
    <footer className="w-full bg-[#071322] border-t border-slate-800 text-slate-400 py-6 sm:py-8 relative z-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col md:flex-row items-center justify-between gap-4 sm:gap-6 text-xs">
          {/* Bloque Izquierdo: Logotipo y Copyright */}
          <div className="flex flex-col sm:flex-row items-center gap-3 sm:gap-4 text-center sm:text-left">
            <BrandMark size="sm" variant="light" href="/" />
            <span className="hidden sm:inline-block text-slate-600">|</span>
            <span className="text-slate-400 text-[11px] sm:text-xs">
              © 2026 PACHAX. Todos los derechos reservados.
            </span>
          </div>

          {/* Bloque Central: Canales Oficiales Verificados */}
          <div className="flex flex-wrap items-center justify-center gap-4 text-[11px] sm:text-xs">
            <a
              href={whatsappUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-slate-300 hover:text-white transition-colors"
            >
              WhatsApp: <span className="text-slate-200 font-semibold">{OFFICIAL_WHATSAPP.displayNumber}</span>
            </a>
            <span className="text-slate-600">•</span>
            <a
              href={facebookUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-slate-300 hover:text-white transition-colors"
            >
              Facebook: <span className="text-slate-200 font-semibold">Pachax - Software & Digital Marketing</span>
            </a>
          </div>

          {/* Bloque Derecho: Enlaces Discretos */}
          <div className="flex items-center gap-4 text-[11px] sm:text-xs">
            <button
              type="button"
              onClick={() => navigate('/login')}
              className="text-slate-300 hover:text-white transition-colors cursor-pointer"
            >
              Iniciar sesión
            </button>
            <span className="text-slate-600">•</span>
            <button
              type="button"
              onClick={() => navigate('/register')}
              className="text-sky-400 hover:text-sky-300 font-semibold transition-colors cursor-pointer"
            >
              Crear empresa
            </button>
          </div>
        </div>
      </div>
    </footer>
  )
}
