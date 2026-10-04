import { BarChart3, ShieldCheck, Headphones, User, ArrowRight } from 'lucide-react'
import { usePublicRouter } from '../routing/usePublicRouter'
import { useAuthStore } from '../../store/authStore'
import { BrandMark } from '../components/BrandMark'

export function TrustFooter() {
  const { navigate } = usePublicRouter()
  const auth = useAuthStore()

  const isAuthorized = auth.status === 'authorized'
  const companyName = auth.account?.name || 'Mi Empresa'

  return (
    <footer className="w-full bg-[#FAF9F6] border-t border-slate-200/80 pt-10 pb-16">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-10">
        {/* ============================================================ */}
        {/* Franja de Confianza (3 Pilares) */}
        {/* ============================================================ */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 sm:gap-8 pt-4 pb-8 border-b border-slate-200/70">
          {/* Pilar 1 */}
          <div className="flex items-center gap-3.5">
            <div className="w-10 h-10 rounded-xl bg-blue-50 text-[#0066FF] border border-blue-100 flex items-center justify-center shrink-0">
              <BarChart3 className="w-5 h-5" />
            </div>
            <div>
              <h5 className="text-sm font-bold text-slate-900">
                Impulsa tu negocio
              </h5>
              <p className="text-xs text-slate-500 mt-0.5">
                Herramientas visuales y fáciles de usar
              </p>
            </div>
          </div>

          {/* Pilar 2 */}
          <div className="flex items-center gap-3.5">
            <div className="w-10 h-10 rounded-xl bg-blue-50 text-[#0066FF] border border-blue-100 flex items-center justify-center shrink-0">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h5 className="text-sm font-bold text-slate-900">
                Seguro y confiable
              </h5>
              <p className="text-xs text-slate-500 mt-0.5">
                Tu información siempre protegida
              </p>
            </div>
          </div>

          {/* Pilar 3 */}
          <div className="flex items-center gap-3.5">
            <div className="w-10 h-10 rounded-xl bg-blue-50 text-[#0066FF] border border-blue-100 flex items-center justify-center shrink-0">
              <Headphones className="w-5 h-5" />
            </div>
            <div>
              <h5 className="text-sm font-bold text-slate-900">
                Soporte especializado
              </h5>
              <p className="text-xs text-slate-500 mt-0.5">
                Estamos para ayudarte
              </p>
            </div>
          </div>
        </div>

        {/* ============================================================ */}
        {/* Tarjeta de Sesión Existente / Prompt de Acceso */}
        {/* ============================================================ */}
        <div className="bg-white border border-slate-200/90 rounded-2xl p-5 sm:p-6 shadow-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-11 h-11 rounded-full bg-blue-50 text-[#0066FF] border border-blue-100 flex items-center justify-center shrink-0">
              <User className="w-5 h-5" />
            </div>
            <div>
              <h4 className="text-sm sm:text-base font-bold text-slate-900">
                {isAuthorized
                  ? `Sesión activa en ${companyName}`
                  : '¿Ya tienes una cuenta?'}
              </h4>
              <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
                {isAuthorized
                  ? 'Continúa operando en tu empresa directamente sin pasar por la web de marketing.'
                  : 'Inicia sesión y continúa donde lo dejaste. Mantendrás tu sesión activa.'}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => navigate('/login')}
            className="w-full sm:w-auto px-5 py-2.5 text-xs sm:text-sm font-semibold text-[#0066FF] hover:text-[#0052cc] bg-blue-50 hover:bg-blue-100/80 border border-blue-200/80 rounded-xl transition-all cursor-pointer inline-flex items-center justify-center gap-1.5 shrink-0"
          >
            <span>{isAuthorized ? 'Ir a mi empresa' : 'Iniciar sesión'}</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>

        {/* ============================================================ */}
        {/* Pie Institucional Limpio */}
        {/* ============================================================ */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-6 text-xs text-slate-400">
          <div className="flex items-center gap-3">
            <BrandMark size="sm" />
            <span>— Software de gestión comercial y operacional</span>
          </div>

          <p>© {new Date().getFullYear()} PACHAX Platform. Todos los derechos reservados.</p>
        </div>
      </div>
    </footer>
  )
}
