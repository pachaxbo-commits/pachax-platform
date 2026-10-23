import {
  ShieldCheck,
  Headphones,
  User,
  ArrowRight,
  ExternalLink,
  MessageSquare,
  Lock,
  Layers,
} from 'lucide-react'
import { usePublicRouter } from '../routing/usePublicRouter'
import { useAuthStore } from '../../store/authStore'
import { BrandMark } from '../components/BrandMark'
import { OFFICIAL_WHATSAPP } from '../config/pricingConfig'

export function TrustFooter() {
  const { navigate } = usePublicRouter()
  const auth = useAuthStore()

  const isAuthorized = auth.status === 'authorized'
  const companyName = auth.account?.name || 'Mi Empresa'

  const facebookUrl = 'https://www.facebook.com/pachaxbo'
  const whatsappUrl = `https://wa.me/${OFFICIAL_WHATSAPP.phoneNumber}?text=${encodeURIComponent('Hola PACHAX, me contacto desde la web oficial.')}`

  return (
    <footer className="w-full bg-[#FAF9F6] border-t border-slate-200/80 pt-12 pb-12 overflow-hidden">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-10">
        {/* ============================================================ */}
        {/* Franja de Confianza (3 Pilares de Ingeniería) */}
        {/* ============================================================ */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 sm:gap-8 pb-8 border-b border-slate-200/80">
          {/* Pilar 1 */}
          <div className="flex items-start gap-3.5">
            <div className="w-10 h-10 rounded-xl bg-blue-50 text-[#0066FF] border border-blue-100 flex items-center justify-center shrink-0">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <h5 className="text-sm font-bold text-slate-900">
                Operación Multitenant Blindada
              </h5>
              <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                Cada empresa cuenta con base de datos aislada, sin mezcla de inventario ni transacciones entre clientes.
              </p>
            </div>
          </div>

          {/* Pilar 2 */}
          <div className="flex items-start gap-3.5">
            <div className="w-10 h-10 rounded-xl bg-blue-50 text-[#0066FF] border border-blue-100 flex items-center justify-center shrink-0">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h5 className="text-sm font-bold text-slate-900">
                Auditoría y Arqueo Ciego
              </h5>
              <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                Control estricto de dinero y mercadería: cierres de caja sin que el cajero vea el saldo teórico del sistema.
              </p>
            </div>
          </div>

          {/* Pilar 3 */}
          <div className="flex items-start gap-3.5">
            <div className="w-10 h-10 rounded-xl bg-blue-50 text-[#0066FF] border border-blue-100 flex items-center justify-center shrink-0">
              <Headphones className="w-5 h-5" />
            </div>
            <div>
              <h5 className="text-sm font-bold text-slate-900">
                Acompañamiento Directo
              </h5>
              <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                Atención ágil por canal oficial de WhatsApp con respuesta de ingenieros de plataforma en turnos pico.
              </p>
            </div>
          </div>
        </div>

        {/* ============================================================ */}
        {/* Tarjeta de Sesión Activa / Acceso Rápido */}
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
                  : '¿Ya administras una empresa en PACHAX?'}
              </h4>
              <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
                {isAuthorized
                  ? 'Continúa administrando tus ventas, mesas, camiones o barra directamente.'
                  : 'Inicia sesión con tu correo corporativo y accede al panel operativo.'}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => navigate('/login')}
            className="w-full sm:w-auto px-5 py-2.5 text-xs sm:text-sm font-bold text-[#0066FF] hover:text-[#0052cc] bg-blue-50 hover:bg-blue-100/80 border border-blue-200/80 rounded-xl transition-all cursor-pointer inline-flex items-center justify-center gap-1.5 shrink-0"
          >
            <span>{isAuthorized ? 'Ir a mi empresa' : 'Iniciar sesión'}</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>

        {/* ============================================================ */}
        {/* Canales Oficiales Verificados y Navegación Secundaria */}
        {/* ============================================================ */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-8 pt-4 pb-8 border-b border-slate-200/80 text-xs">
          {/* Columna Marca & Identidad */}
          <div className="md:col-span-5 space-y-3">
            <BrandMark size="sm" />
            <p className="text-slate-500 leading-relaxed max-w-sm">
              Plataforma de software empresarial para empresas con flujos operativos exigentes. Diseñado para gastronomía, distribución en ruta, entretenimiento nocturno y comercio minorista.
            </p>
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-emerald-50 border border-emerald-200/80 text-[11px] font-bold text-emerald-700">
              <Lock className="w-3 h-3 text-emerald-600" />
              <span>Cifrado SSL de extremo a extremo y aislamiento tenant</span>
            </div>
          </div>

          {/* Columna Canales Oficiales */}
          <div className="md:col-span-4 space-y-2.5">
            <h5 className="font-bold uppercase tracking-wider text-slate-900 text-[11px]">
              Canales Oficiales Verificados
            </h5>
            <ul className="space-y-2 text-slate-600">
              <li>
                <a
                  href={whatsappUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-[#0066FF] transition-colors inline-flex items-center gap-1.5 font-medium"
                >
                  <MessageSquare className="w-3.5 h-3.5 text-[#0066FF]" />
                  <span>WhatsApp: {OFFICIAL_WHATSAPP.displayNumber}</span>
                  <ExternalLink className="w-3 h-3 text-slate-400" />
                </a>
              </li>
              <li>
                <a
                  href={facebookUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-[#0066FF] transition-colors inline-flex items-center gap-1.5 font-medium"
                >
                  <ExternalLink className="w-3.5 h-3.5 text-blue-600" />
                  <span>Facebook: Pachax - Software & Digital Marketing</span>
                </a>
              </li>
            </ul>
          </div>

          {/* Columna Navegación Rápida */}
          <div className="md:col-span-3 space-y-2.5">
            <h5 className="font-bold uppercase tracking-wider text-slate-900 text-[11px]">
              Navegación
            </h5>
            <ul className="space-y-1.5 text-slate-600">
              <li>
                <a href="/demo/restaurant" className="hover:text-[#0066FF] transition-colors">
                  Demo Restaurante con Salón
                </a>
              </li>
              <li>
                <a href="/demo/distribution" className="hover:text-[#0066FF] transition-colors">
                  Demo Producción & Distribución
                </a>
              </li>
              <li>
                <a href="/demo/nightclub" className="hover:text-[#0066FF] transition-colors">
                  Demo Nightclub & Lounge
                </a>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => navigate('/register')}
                  className="hover:text-[#0066FF] transition-colors cursor-pointer text-left"
                >
                  Crear nueva empresa
                </button>
              </li>
            </ul>
          </div>
        </div>

        {/* ============================================================ */}
        {/* Pie Institucional Final (Copyright 2026) */}
        {/* ============================================================ */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-400 pt-2">
          <p>© 2026 PACHAX Platform. Todos los derechos reservados.</p>
          <div className="flex items-center gap-4 text-slate-400 text-[11px]">
            <span>Arquitectura Cloud Multitenant</span>
            <span>•</span>
            <span>Alta Disponibilidad</span>
            <span>•</span>
            <span>Seguridad Transaccional</span>
          </div>
        </div>
      </div>
    </footer>
  )
}
