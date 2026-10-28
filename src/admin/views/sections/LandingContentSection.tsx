import { useEffect, useState } from 'react'
import { Type, Save, CheckCircle2, AlertCircle, Loader2, Phone } from 'lucide-react'
import { useCommercialConfig } from '../../store/commercialConfigStore'
import { useAdminAuth } from '../../auth/adminAuthStore'
import type { LandingContentConfig } from '../../types'

export function LandingContentSection() {
  const { user } = useAdminAuth()
  const canManagePublication = user?.role === 'platform_owner' || user?.role === 'platform_admin'
  const { config, updateLandingContent } = useCommercialConfig()
  const [formData, setFormData] = useState<LandingContentConfig>(JSON.parse(JSON.stringify(config.landingContent)))
  const [saveFeedback, setSaveFeedback] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [isProcessing, setIsProcessing] = useState(false)

  useEffect(() => {
    queueMicrotask(() => setFormData(JSON.parse(JSON.stringify(config.landingContent))))
  }, [config.landingContent])

  const handleSave = async () => {
    setIsProcessing(true)
    setSaveFeedback(null)
    setSaveError(null)
    const res = await updateLandingContent(formData)
    setIsProcessing(false)
    if (res.success) {
      setSaveFeedback('¡Textos y configuración de la landing guardados en Firestore!')
      setTimeout(() => setSaveFeedback(null), 4000)
    } else {
      setSaveError(res.error || 'No se pudieron guardar los textos en Firestore.')
    }
  }

  return (
    <div className="space-y-8 max-w-4xl">
      {/* Encabezado */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-6 border-b border-slate-200">
        <div>
          <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
            Contenido y Textos de la Landing Pública
          </h2>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Modifica titulares, subtítulos, canales de WhatsApp y CTAs. Los cambios públicos se confirman al guardar.
          </p>
        </div>
          <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
            <label className="text-xs font-semibold text-slate-600">Estado
              <select value={formData.status || 'draft'} onChange={(e) => setFormData({ ...formData, status: e.target.value as 'published' | 'draft' })} disabled={!canManagePublication} className="mt-1 block w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-900 disabled:opacity-50">
                <option value="draft">Borrador / no mostrar cambios</option>
                <option value="published">Publicado en la landing</option>
              </select>
            </label>
            <button
              type="button"
              onClick={handleSave}
              disabled={isProcessing}
              className="self-end px-6 py-2.5 rounded-xl bg-[#0066FF] hover:bg-[#0052cc] disabled:bg-blue-300 text-white text-xs font-bold shadow-sm inline-flex items-center gap-2 cursor-pointer active:scale-98 transition-all"
            >
              {isProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              <span>{isProcessing ? 'Guardando en Firestore...' : 'Guardar textos'}</span>
            </button>
          </div>
      </div>

      {saveFeedback && (
        <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs font-semibold flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{saveFeedback}</span>
        </div>
      )}

      {saveError && (
        <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-red-900 text-xs font-semibold flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
          <span>{saveError}</span>
        </div>
      )}

      {/* Bloque 1: Sección Hero Principal */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200/90 shadow-2xs space-y-4">
        <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
          <Type className="w-4 h-4 text-[#0066FF]" />
          <span>Sección 1 · Hero Principal</span>
        </h3>

        <div>
          <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1">
            Eyebrow / Kicker Superior
          </label>
          <input
            type="text"
            value={formData.heroTagline}
            onChange={(e) => setFormData({ ...formData, heroTagline: e.target.value })}
            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold text-slate-900"
          />
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1">
            Titular Principal (H1)
          </label>
          <textarea
            rows={2}
            value={formData.heroTitle}
            onChange={(e) => setFormData({ ...formData, heroTitle: e.target.value })}
            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-900"
          />
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1">
            Subtítulo Descriptivo
          </label>
          <textarea
            rows={3}
            value={formData.heroSubtitle}
            onChange={(e) => setFormData({ ...formData, heroSubtitle: e.target.value })}
            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-800"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1">
              Texto CTA Primario
            </label>
            <input
              type="text"
              value={formData.heroCtaPrimary}
              onChange={(e) => setFormData({ ...formData, heroCtaPrimary: e.target.value })}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-900"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1">
              Texto CTA Secundario
            </label>
            <input
              type="text"
              value={formData.heroCtaSecondary}
              onChange={(e) => setFormData({ ...formData, heroCtaSecondary: e.target.value })}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-900"
            />
          </div>
        </div>
      </div>

      {/* Bloque 2: Canal Oficial de WhatsApp */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200/90 shadow-2xs space-y-4">
        <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
          <Phone className="w-4 h-4 text-emerald-600" />
          <span>Canal Comercial de WhatsApp</span>
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1">
              Número internacional (sin símbolos)
            </label>
            <input
              type="text"
              value={formData.officialWhatsAppNumber}
              onChange={(e) => setFormData({ ...formData, officialWhatsAppNumber: e.target.value })}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-mono font-bold text-slate-900"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1">
              Formato visible para clientes
            </label>
            <input
              type="text"
              value={formData.officialWhatsAppDisplay}
              onChange={(e) => setFormData({ ...formData, officialWhatsAppDisplay: e.target.value })}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-900"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1">
            Mensaje prellenado para solicitud de asesoría
          </label>
          <textarea
            rows={2}
            value={formData.defaultCustomDevMessage}
            onChange={(e) => setFormData({ ...formData, defaultCustomDevMessage: e.target.value })}
            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-800"
          />
        </div>
      </div>

      {/* Bloque 3: Métricas del Value Strip del Hero */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200/90 shadow-2xs space-y-4">
        <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
          <Type className="w-4 h-4 text-[#0066FF]" />
          <span>Declaraciones de Valor / Value Strip (4 Métricas)</span>
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {(formData.valueStripMetrics || []).map((metric, idx) => (
            <div key={idx} className="p-4 rounded-xl bg-slate-50 border border-slate-200/80 space-y-2">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                Métrica #{idx + 1}
              </span>
              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-0.5">Etiqueta</label>
                <input
                  type="text"
                  value={metric.label}
                  onChange={(e) => {
                    const list = [...(formData.valueStripMetrics || [])]
                    list[idx] = { ...list[idx], label: e.target.value }
                    setFormData({ ...formData, valueStripMetrics: list })
                  }}
                  className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1 text-xs font-semibold text-slate-900"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-0.5">Valor principal</label>
                <input
                  type="text"
                  value={metric.value}
                  onChange={(e) => {
                    const list = [...(formData.valueStripMetrics || [])]
                    list[idx] = { ...list[idx], value: e.target.value }
                    setFormData({ ...formData, valueStripMetrics: list })
                  }}
                  className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1 text-xs font-bold text-[#0066FF]"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-0.5">Detalle</label>
                <input
                  type="text"
                  value={metric.detail}
                  onChange={(e) => {
                    const list = [...(formData.valueStripMetrics || [])]
                    list[idx] = { ...list[idx], detail: e.target.value }
                    setFormData({ ...formData, valueStripMetrics: list })
                  }}
                  className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1 text-xs text-slate-700"
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Bloque 4: Encabezados y Subtítulos de Secciones Inferiores */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200/90 shadow-2xs space-y-5">
        <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
          <Type className="w-4 h-4 text-slate-500" />
          <span>Encabezados y Subtítulos de Secciones</span>
        </h3>

        <div className="space-y-4">
          <div className="space-y-2 p-3.5 bg-slate-50 rounded-xl border border-slate-200/80">
            <label className="block text-xs font-bold text-slate-800 uppercase tracking-wider">
              Sección 2 · Catálogo de Plantillas
            </label>
            <input
              type="text"
              placeholder="Título de catálogo"
              value={formData.sectionTitles.catalog}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  sectionTitles: { ...formData.sectionTitles, catalog: e.target.value },
                })
              }
              className="w-full bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-xs text-slate-900 font-semibold"
            />
            <input
              type="text"
              placeholder="Subtítulo de catálogo"
              value={formData.sectionTitles.catalogSubtitle || ''}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  sectionTitles: { ...formData.sectionTitles, catalogSubtitle: e.target.value },
                })
              }
              className="w-full bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-xs text-slate-600"
            />
          </div>

          <div className="space-y-2 p-3.5 bg-slate-50 rounded-xl border border-slate-200/80">
            <label className="block text-xs font-bold text-slate-800 uppercase tracking-wider">
              Sección 3 · Planes y Precios
            </label>
            <input
              type="text"
              placeholder="Título de planes"
              value={formData.sectionTitles.pricing}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  sectionTitles: { ...formData.sectionTitles, pricing: e.target.value },
                })
              }
              className="w-full bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-xs text-slate-900 font-semibold"
            />
            <input
              type="text"
              placeholder="Subtítulo de planes"
              value={formData.sectionTitles.pricingSubtitle || ''}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  sectionTitles: { ...formData.sectionTitles, pricingSubtitle: e.target.value },
                })
              }
              className="w-full bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-xs text-slate-600"
            />
          </div>

          <div className="space-y-2 p-3.5 bg-slate-50 rounded-xl border border-slate-200/80">
            <label className="block text-xs font-bold text-slate-800 uppercase tracking-wider">
              Sección 4 · Onboarding
            </label>
            <input
              type="text"
              placeholder="Título de onboarding"
              value={formData.sectionTitles.onboarding}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  sectionTitles: { ...formData.sectionTitles, onboarding: e.target.value },
                })
              }
              className="w-full bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-xs text-slate-900 font-semibold"
            />
            <input
              type="text"
              placeholder="Subtítulo de onboarding"
              value={formData.sectionTitles.onboardingSubtitle || ''}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  sectionTitles: { ...formData.sectionTitles, onboardingSubtitle: e.target.value },
                })
              }
              className="w-full bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-xs text-slate-600"
            />
          </div>

          <div className="space-y-2 p-3.5 bg-slate-50 rounded-xl border border-slate-200/80">
            <label className="block text-xs font-bold text-slate-800 uppercase tracking-wider">
              Sección 5 · Tutoriales Guiados
            </label>
            <input
              type="text"
              placeholder="Título de tutoriales"
              value={formData.sectionTitles.tutorials}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  sectionTitles: { ...formData.sectionTitles, tutorials: e.target.value },
                })
              }
              className="w-full bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-xs text-slate-900 font-semibold"
            />
            <input
              type="text"
              placeholder="Subtítulo de tutoriales"
              value={formData.sectionTitles.tutorialsSubtitle || ''}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  sectionTitles: { ...formData.sectionTitles, tutorialsSubtitle: e.target.value },
                })
              }
              className="w-full bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-xs text-slate-600"
            />
          </div>

          <div className="space-y-2 p-3.5 bg-slate-50 rounded-xl border border-slate-200/80">
            <label className="block text-xs font-bold text-slate-800 uppercase tracking-wider">
              Sección 6 · Extras y Soluciones Estratégicas
            </label>
            <input
              type="text"
              placeholder="Título de extras"
              value={formData.sectionTitles.extras}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  sectionTitles: { ...formData.sectionTitles, extras: e.target.value },
                })
              }
              className="w-full bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-xs text-slate-900 font-semibold"
            />
            <input
              type="text"
              placeholder="Subtítulo de extras"
              value={formData.sectionTitles.extrasSubtitle || ''}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  sectionTitles: { ...formData.sectionTitles, extrasSubtitle: e.target.value },
                })
              }
              className="w-full bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-xs text-slate-600"
            />
          </div>
        </div>
      </div>
    </div>
  )
}
