import { Megaphone, Palette, Headphones, Zap, Code2, PlusCircle, ArrowRight, MessageSquare } from 'lucide-react'
import {
  COMMERCIAL_EXTRAS,
  OFFICIAL_WHATSAPP,
  type CommercialExtraService,
} from '../config/pricingConfig'
import { usePublicRouter } from '../routing/usePublicRouter'

export function PlatformExtrasSection() {
  const { navigate } = usePublicRouter()

  const renderExtraIcon = (key: CommercialExtraService['iconKey']) => {
    switch (key) {
      case 'megaphone':
        return <Megaphone className="w-5 h-5 text-[#0066FF]" />
      case 'palette':
        return <Palette className="w-5 h-5 text-[#0066FF]" />
      case 'headset':
        return <Headphones className="w-5 h-5 text-[#0066FF]" />
      case 'zap':
        return <Zap className="w-5 h-5 text-[#0066FF]" />
      case 'code':
        return <Code2 className="w-5 h-5 text-[#0066FF]" />
    }
  }

  const handleInquireExtra = (extra: CommercialExtraService) => {
    if (extra.id === 'extra_custom_dev') {
      window.open(OFFICIAL_WHATSAPP.buildUrl(OFFICIAL_WHATSAPP.defaultCustomDevMessage), '_blank')
    } else {
      const msg = `Hola, me interesa consultar sobre el servicio complementario: ${extra.title} (${extra.referencePriceLabel}) para mi negocio.`
      window.open(OFFICIAL_WHATSAPP.buildUrl(msg), '_blank')
    }
  }

  const handleRegisterAddon = (extra: CommercialExtraService) => {
    navigate(`/register?intent=extra&extraId=${extra.id}`)
  }

  return (
    <section id="extras" className="w-full py-20 bg-slate-50 border-t border-slate-200/80 relative">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Encabezado Editorial de la Sección */}
        <div className="max-w-3xl mb-12">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md bg-blue-50 text-[#0066FF] border border-blue-200/80 text-xs font-bold uppercase tracking-wider mb-3">
            <PlusCircle className="w-3.5 h-3.5" />
            <span>SERVICIOS DE VALOR AGREGADO Y EXTRAS</span>
          </div>
          <h2 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold text-slate-950 tracking-tight">
            Potencia tu operación con módulos y servicios especializados
          </h2>
          <p className="text-sm sm:text-base text-slate-600 mt-2.5 leading-relaxed">
            Separa las herramientas técnicas de los servicios de crecimiento. Agrega soporte VIP 24/7, campañas de marketing, identidad visual o integraciones contables cuando tu negocio esté listo para expandirse.
          </p>
        </div>

        {/* Grilla de Extras Comerciales */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-12">
          {COMMERCIAL_EXTRAS.map((extra) => (
            <div
              key={extra.id}
              className="bg-white rounded-2xl border border-slate-200/90 p-6 shadow-xs hover:shadow-md transition-all duration-300 flex flex-col justify-between group"
            >
              <div>
                <div className="flex items-center justify-between gap-2 mb-4">
                  <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center shrink-0">
                    {renderExtraIcon(extra.iconKey)}
                  </div>
                  <span className="text-[11px] font-semibold text-slate-700 bg-slate-100 px-3 py-1 rounded-full border border-slate-200/80">
                    {extra.referencePriceLabel}
                  </span>
                </div>

                <h3 className="text-base sm:text-lg font-bold text-slate-950 tracking-tight mb-2 group-hover:text-[#0066FF] transition-colors">
                  {extra.title}
                </h3>
                <p className="text-xs sm:text-sm text-slate-600 leading-relaxed mb-6">
                  {extra.shortDescription}
                </p>
              </div>

              <div className="pt-4 border-t border-slate-100 flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => handleRegisterAddon(extra)}
                  className="text-xs font-semibold text-slate-500 hover:text-slate-900 cursor-pointer"
                >
                  Solicitar en registro
                </button>
                <button
                  type="button"
                  onClick={() => handleInquireExtra(extra)}
                  className="text-xs font-bold text-[#0066FF] hover:text-[#0052cc] inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <span>Consultar</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Banner Comercial de Cierre (Última sección comercial antes del footer) */}
        <div className="rounded-2xl bg-gradient-to-r from-slate-900 via-slate-900 to-[#002b66] border border-slate-800 p-8 sm:p-10 text-white shadow-xl flex flex-col lg:flex-row items-center justify-between gap-6">
          <div className="space-y-2 text-center lg:text-left max-w-2xl">
            <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md bg-blue-500/20 text-blue-300 text-xs font-bold uppercase tracking-wider mb-1">
              <span>ASESORÍA COMERCIAL DIRECTA</span>
            </div>
            <h3 className="text-xl sm:text-2xl font-extrabold text-white tracking-tight">
              ¿Tu empresa necesita una solución tecnológica a medida?
            </h3>
            <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
              Habla directamente con nuestro equipo de ingeniería y producto. Analizamos tus procesos, básculas, almacenes o reglas de negocio sin compromiso.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-center gap-3 w-full lg:w-auto shrink-0">
            <a
              href={OFFICIAL_WHATSAPP.buildUrl(OFFICIAL_WHATSAPP.defaultCustomDevMessage)}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full sm:w-auto px-6 py-3.5 rounded-xl bg-[#0066FF] hover:bg-[#0052cc] text-white text-xs sm:text-sm font-bold shadow-md inline-flex items-center justify-center gap-2 transition-all cursor-pointer"
            >
              <MessageSquare className="w-4 h-4" />
              <span>Contactar por WhatsApp</span>
            </a>
            <button
              type="button"
              onClick={() => navigate('/register?intent=custom')}
              className="w-full sm:w-auto px-6 py-3.5 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs sm:text-sm font-bold border border-white/20 transition-all cursor-pointer text-center"
            >
              Crear cuenta ahora
            </button>
          </div>
        </div>
      </div>
    </section>
  )
}
