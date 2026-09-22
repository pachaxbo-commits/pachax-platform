import { useState } from 'react'
import { Sparkles, MessageSquare, Copy, Check, ArrowRight } from 'lucide-react'
import { TEMPLATE_SHOWCASE_DATA, type TemplateShowcaseItem } from './templateShowcaseData'
import { TemplateShowcaseCard } from './TemplateShowcaseCard'
import { TemplateModeSelectorModal } from './TemplateModeSelectorModal'
import { getWhatsAppUrl } from '../config/publicContact'

export function TemplateShowcaseSection() {
  const [selectedItem, setSelectedItem] = useState<TemplateShowcaseItem | null>(null)
  const [isCustomOpen, setIsCustomOpen] = useState(false)
  const [customForm, setCustomForm] = useState({
    name: '',
    company: '',
    details: '',
  })
  const [isCopied, setIsCopied] = useState(false)

  const preparedText = `Hola, soy ${customForm.name || 'un visitante'} de ${customForm.company || 'mi negocio'}. Requerimiento especial para PACHAX: ${customForm.details || 'Quisiera conversar sobre la adaptación a mis procesos.'}`

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(preparedText)
      setIsCopied(true)
      setTimeout(() => setIsCopied(false), 2500)
    } catch {
      // Fallback
    }
  }

  return (
    <section id="soluciones" className="py-16 sm:py-24 bg-[#FAF9F6] border-y border-slate-200/80 scroll-mt-12">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Encabezado Editorial Protagonista */}
        <div className="text-center max-w-3xl mx-auto mb-12 sm:mb-16 space-y-3.5">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-900 text-white text-xs font-bold shadow-2xs">
            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
            <span>Plantillas Canónicas</span>
          </div>

          <h2 className="text-3xl sm:text-5xl font-black text-slate-950 tracking-tight leading-tight">
            Una plataforma. <br className="hidden sm:inline" />
            <span className="text-slate-700">Tres formas reales de operar.</span>
          </h2>

          <p className="text-sm sm:text-base text-slate-600 max-w-2xl mx-auto leading-relaxed">
            Cada sector tiene una dinámica única. Selecciona una plantilla para explorarla desde cero o ver cómo se comporta cuando una empresa ya está operando a diario.
          </p>
        </div>

        {/* Las 3 Grandes Muestras / Cards Protagonistas */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 sm:gap-8">
          {TEMPLATE_SHOWCASE_DATA.map((item) => (
            <TemplateShowcaseCard
              key={item.id}
              item={item}
              onSelect={(it) => setSelectedItem(it)}
            />
          ))}
        </div>

        {/* Opción Adicional: Solución a Medida (Evolución de SolutionsExplorer) */}
        <div className="mt-12 sm:mt-16 max-w-4xl mx-auto bg-white rounded-3xl border border-slate-200/90 p-6 sm:p-8 shadow-sm">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-slate-100 pb-5">
            <div>
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                Procesos Especiales
              </span>
              <h3 className="text-lg sm:text-xl font-bold text-slate-950 mt-0.5">
                ¿Tu empresa opera de una forma diferente?
              </h3>
              <p className="text-xs sm:text-sm text-slate-600 mt-1">
                La arquitectura de PACHAX permite adaptar módulos, flujos de cobranza o reglas específicas para tu industria.
              </p>
            </div>

            <button
              onClick={() => setIsCustomOpen(!isCustomOpen)}
              className="px-4 py-2.5 text-xs font-bold text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-xl transition cursor-pointer shrink-0"
            >
              {isCustomOpen ? 'Ocultar formulario' : 'Solicitar adaptación'}
            </button>
          </div>

          {/* Formulario desplegable desacoplado con WhatsApp / Portapapeles */}
          {isCustomOpen && (
            <div className="pt-6 space-y-4 animate-in fade-in duration-200">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">
                    Tu nombre
                  </label>
                  <input
                    type="text"
                    placeholder="Ej. Rodrigo Vargas"
                    value={customForm.name}
                    onChange={(e) => setCustomForm({ ...customForm, name: e.target.value })}
                    className="w-full text-xs px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl focus:outline-none focus:ring-1 focus:ring-slate-900"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">
                    Nombre de tu empresa
                  </label>
                  <input
                    type="text"
                    placeholder="Ej. Frigorífico del Valle"
                    value={customForm.company}
                    onChange={(e) => setCustomForm({ ...customForm, company: e.target.value })}
                    className="w-full text-xs px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl focus:outline-none focus:ring-1 focus:ring-slate-900"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  Describe brevemente tus procesos particulares
                </label>
                <textarea
                  rows={3}
                  placeholder="Ej. Realizamos producción cárnica con pesaje en recepción, despacho por lote a 8 camiones y preventa previa..."
                  value={customForm.details}
                  onChange={(e) => setCustomForm({ ...customForm, details: e.target.value })}
                  className="w-full text-xs px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl focus:outline-none focus:ring-1 focus:ring-slate-900"
                />
              </div>

              <div className="flex flex-wrap items-center gap-3 pt-2">
                <a
                  href={getWhatsAppUrl(preparedText)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-5 py-2.5 rounded-xl bg-slate-900 text-white hover:bg-slate-800 text-xs font-bold transition flex items-center gap-2 shadow-xs cursor-pointer"
                >
                  <MessageSquare className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Enviar por WhatsApp</span>
                  <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
                </a>

                <button
                  type="button"
                  onClick={handleCopy}
                  className="px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold transition flex items-center gap-2 cursor-pointer"
                >
                  {isCopied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{isCopied ? '¡Requerimiento copiado!' : 'Copiar requerimiento'}</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Modal Interactivo de Elección de Modo */}
      <TemplateModeSelectorModal
        item={selectedItem}
        onClose={() => setSelectedItem(null)}
      />
    </section>
  )
}
