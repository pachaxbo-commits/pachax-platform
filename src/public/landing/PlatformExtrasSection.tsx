import { Megaphone, Palette, Headphones, Zap, Code2, Cpu, ArrowRight, MessageSquare, Check } from 'lucide-react'
import { usePublicRouter } from '../routing/usePublicRouter'
import { useCommercialConfig } from '../../admin/store/commercialConfigStore'
import type { CommercialExtraService } from '../../admin/types'

export function PlatformExtrasSection() {
  const { navigate } = usePublicRouter()
  const { landingContent, publishedExtras } = useCommercialConfig()

  const featuredCustom = publishedExtras.find(
    (e) => e.id === 'extra_custom_dev' || e.category === 'custom'
  ) || publishedExtras[0]

  const complementaryExtras = publishedExtras.filter(
    (e) => e.id !== featuredCustom?.id
  )

  const renderIcon = (iconKey: string, className = 'w-5 h-5') => {
    switch (iconKey) {
      case 'megaphone':
        return <Megaphone className={className} />
      case 'palette':
        return <Palette className={className} />
      case 'headset':
        return <Headphones className={className} />
      case 'zap':
        return <Zap className={className} />
      case 'scale':
        return <Cpu className={className} />
      case 'code':
      default:
        return <Code2 className={className} />
    }
  }

  const handleInquireWhatsApp = (extra?: CommercialExtraService) => {
    const text = extra
      ? `Hola PACHAX, me interesa consultar sobre el servicio estratégico: ${extra.title} (${extra.referencePriceLabel}) para mi empresa.`
      : landingContent.defaultCustomDevMessage

    const url = `https://wa.me/${landingContent.officialWhatsAppNumber}?text=${encodeURIComponent(text)}`
    window.open(url, '_blank')
  }

  const handleRegisterAddon = (extra: CommercialExtraService) => {
    navigate(`/register?intent=extra&extraId=${extra.id}`)
  }

  return (
    <section id="extras" className="w-full py-20 bg-slate-50 border-t border-slate-200/80 relative">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Encabezado Editorial */}
        <div className="max-w-3xl mb-12">
          <div className="text-xs font-bold uppercase tracking-wider text-[#0066FF] mb-2">
            SERVICIOS ESTRATÉGICOS Y EXTENSIONES
          </div>
          <h2 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold text-slate-950 tracking-tight">
            Potencia tu operación con módulos y servicios especializados
          </h2>
          <p className="text-sm sm:text-base text-slate-600 mt-2.5 leading-relaxed">
            Separa el software operativo de los servicios de aceleración de negocio. Incorpora ingeniería a medida, marketing enfocado en ventas, identidad visual y soporte prioritario cuando tu escala lo requiera.
          </p>
        </div>

        {/* Portafolio Asimétrico: Columna izquierda destacada (Ingeniería a Medida) + Columna derecha (Franjas de servicios) */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8 mb-12 items-stretch">
          {/* Card Heroica: Solución de Software e Integración a Medida (5 columnas en desktop) */}
          {featuredCustom && (
            <div className="lg:col-span-5 bg-slate-950 text-white rounded-2xl border border-slate-800 p-7 sm:p-8 flex flex-col justify-between shadow-xl relative overflow-hidden">
              <div
                aria-hidden="true"
                className="absolute -right-16 -top-16 w-56 h-56 bg-blue-600/15 rounded-full blur-3xl pointer-events-none"
              />

              <div className="relative z-10">
                <div className="flex items-center justify-between gap-3 mb-6">
                  <div className="w-11 h-11 rounded-xl bg-blue-500/20 text-blue-400 border border-blue-500/30 flex items-center justify-center shrink-0">
                    {renderIcon(featuredCustom.iconKey, 'w-6 h-6 text-blue-400')}
                  </div>
                  <span className="text-xs font-bold tracking-wider uppercase text-blue-300 bg-blue-900/40 border border-blue-700/50 px-3 py-1 rounded-full">
                    {featuredCustom.referencePriceLabel}
                  </span>
                </div>

                <div className="text-xs font-bold uppercase tracking-wider text-blue-400 mb-2">
                  PILAR ESTRATÉGICO
                </div>
                <h3 className="text-xl sm:text-2xl font-extrabold text-white tracking-tight mb-3">
                  {featuredCustom.title}
                </h3>
                <p className="text-xs sm:text-sm text-slate-300 leading-relaxed mb-6">
                  {featuredCustom.shortDescription}
                </p>

                <div className="space-y-2.5 pt-4 border-t border-slate-800 mb-8">
                  <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-2">
                    Capacidades del servicio:
                  </div>
                  <div className="flex items-start gap-2 text-xs text-slate-300">
                    <Check className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
                    <span>Integración con balanzas industriales, lectores térmicos y KDS</span>
                  </div>
                  <div className="flex items-start gap-2 text-xs text-slate-300">
                    <Check className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
                    <span>Conexión directa con ERPs contables, Facturación y CRM corporativo</span>
                  </div>
                  <div className="flex items-start gap-2 text-xs text-slate-300">
                    <Check className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
                    <span>Desarrollo de módulos exclusivos y workflows a medida para tu empresa</span>
                  </div>
                  <div className="flex items-start gap-2 text-xs text-slate-300">
                    <Check className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
                    <span>Acuerdos de Nivel de Servicio (SLA) con guardia de ingeniería</span>
                  </div>
                </div>
              </div>

              <div className="relative z-10 pt-4 border-t border-slate-800/80 flex flex-col sm:flex-row gap-3">
                <button
                  type="button"
                  onClick={() => handleInquireWhatsApp(featuredCustom)}
                  className="flex-1 py-3 px-4 rounded-xl text-xs sm:text-sm font-bold bg-[#0066FF] hover:bg-[#0052cc] text-white transition-all inline-flex items-center justify-center gap-2 shadow-md cursor-pointer"
                >
                  <MessageSquare className="w-4 h-4" />
                  <span>Consultar por WhatsApp</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleRegisterAddon(featuredCustom)}
                  className="py-3 px-4 rounded-xl text-xs sm:text-sm font-semibold bg-white/10 hover:bg-white/20 text-white transition-all cursor-pointer border border-white/15"
                >
                  Solicitar
                </button>
              </div>
            </div>
          )}

          {/* Columna Derecha: Franjas de Servicios Complementarios (7 columnas en desktop) */}
          <div className="lg:col-span-7 flex flex-col justify-between gap-4">
            {complementaryExtras.map((extra) => (
              <div
                key={extra.id}
                className="bg-white rounded-2xl border border-slate-200/90 p-5 sm:p-6 shadow-xs hover:shadow-md transition-all duration-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4 group"
              >
                <div className="flex items-start gap-4 flex-1 min-w-0">
                  <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center shrink-0 mt-0.5 group-hover:bg-blue-100/70 transition-colors">
                    {renderIcon(extra.iconKey, 'w-5 h-5 text-[#0066FF]')}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <h4 className="text-sm sm:text-base font-bold text-slate-950 tracking-tight group-hover:text-[#0066FF] transition-colors">
                        {extra.title}
                      </h4>
                    </div>
                    <p className="text-xs sm:text-sm text-slate-600 leading-snug line-clamp-2">
                      {extra.shortDescription}
                    </p>
                  </div>
                </div>

                <div className="flex sm:flex-col items-center sm:items-end justify-between sm:justify-center gap-3 shrink-0 pt-3 sm:pt-0 border-t sm:border-t-0 border-slate-100">
                  <span className="text-xs font-bold text-slate-800 bg-slate-100 px-2.5 py-1 rounded-md border border-slate-200/80">
                    {extra.referencePriceLabel}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleInquireWhatsApp(extra)}
                    className="text-xs font-bold text-[#0066FF] hover:text-[#0052cc] inline-flex items-center gap-1 cursor-pointer"
                  >
                    <span>Consultar</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Banner Comercial de Cierre */}
        <div className="rounded-2xl bg-gradient-to-r from-slate-900 via-slate-900 to-[#002b66] border border-slate-800 p-8 sm:p-10 text-white shadow-xl flex flex-col lg:flex-row items-center justify-between gap-6">
          <div className="space-y-2 text-center lg:text-left max-w-2xl">
            <div className="text-xs font-bold uppercase tracking-wider text-blue-300">
              ASESORÍA COMERCIAL DIRECTA
            </div>
            <h3 className="text-xl sm:text-2xl font-extrabold text-white tracking-tight">
              ¿Tu empresa necesita una solución tecnológica a medida?
            </h3>
            <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
              Habla directamente con nuestro equipo de ingeniería y producto. Analizamos tus procesos, básculas, almacenes o reglas de negocio sin compromiso.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-center gap-3 w-full lg:w-auto shrink-0">
            <button
              type="button"
              onClick={() => handleInquireWhatsApp()}
              className="w-full sm:w-auto px-6 py-3.5 rounded-xl bg-[#0066FF] hover:bg-[#0052cc] text-white text-xs sm:text-sm font-bold shadow-md inline-flex items-center justify-center gap-2 transition-all cursor-pointer"
            >
              <MessageSquare className="w-4 h-4" />
              <span>Contactar por WhatsApp</span>
            </button>
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
