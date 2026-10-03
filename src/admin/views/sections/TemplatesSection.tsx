import { useState } from 'react'
import { RefreshCw, Save, CheckCircle2 } from 'lucide-react'
import { useCommercialConfig } from '../../store/commercialConfigStore'
import type { CommercialTemplateItem } from '../../types'

export function TemplatesSection() {
  const { config, updateTemplate, mediaAssets, resetToDefaults } = useCommercialConfig()
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>(config.templates[0]?.id || 'restaurant')
  const [saveFeedback, setSaveFeedback] = useState<string | null>(null)

  const selectedTemplate = config.templates.find((t) => t.id === selectedTemplateId) || config.templates[0]

  const [formData, setFormData] = useState<CommercialTemplateItem>(selectedTemplate)

  // Sincronizar formulario al cambiar de plantilla seleccionada
  const handleSelectTemplate = (id: string) => {
    setSelectedTemplateId(id)
    const tpl = config.templates.find((t) => t.id === id)
    if (tpl) {
      setFormData(JSON.parse(JSON.stringify(tpl)))
      setSaveFeedback(null)
    }
  }

  const handleSave = () => {
    updateTemplate(formData.id, formData)
    setSaveFeedback('¡Cambios guardados con éxito! La landing pública ya refleja esta configuración.')
    setTimeout(() => setSaveFeedback(null), 4000)
  }

  const handleAddBullet = () => {
    setFormData((prev) => ({
      ...prev,
      bullets: [...prev.bullets, 'Nueva capacidad'],
    }))
  }

  const handleUpdateBullet = (index: number, val: string) => {
    setFormData((prev) => {
      const updated = [...prev.bullets]
      updated[index] = val
      return { ...prev, bullets: updated }
    })
  }

  const handleRemoveBullet = (index: number) => {
    setFormData((prev) => {
      const updated = prev.bullets.filter((_, idx) => idx !== index)
      return { ...prev, bullets: updated }
    })
  }

  return (
    <div className="space-y-8">
      {/* Encabezado */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-6 border-b border-slate-200">
        <div>
          <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
            Gestión de Plantillas Comerciales
          </h2>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Edita títulos, miniaturas, capacidades, estados (published/draft) y rutas de demostración.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              if (window.confirm('¿Restablecer todas las plantillas a la configuración oficial?')) {
                resetToDefaults()
                handleSelectTemplate(selectedTemplateId)
              }
            }}
            className="px-3.5 py-2 rounded-xl text-xs font-semibold bg-white border border-slate-200 text-slate-700 hover:text-slate-950 hover:bg-slate-50 shadow-2xs inline-flex items-center gap-1.5 transition-all cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5 text-slate-400" />
            <span>Restablecer defaults</span>
          </button>
        </div>
      </div>

      {/* Selector de Plantilla a Editar */}
      <div className="flex flex-wrap gap-2 p-1.5 bg-slate-100 rounded-2xl border border-slate-200/80">
        {config.templates.map((tpl) => {
          const isSelected = tpl.id === selectedTemplateId
          return (
            <button
              key={tpl.id}
              type="button"
              onClick={() => handleSelectTemplate(tpl.id)}
              className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-2 ${
                isSelected
                  ? 'bg-white text-slate-950 shadow-xs border border-slate-200/80'
                  : 'text-slate-600 hover:text-slate-950 hover:bg-white/60'
              }`}
            >
              <span>{tpl.commercialName}</span>
              <span
                className={`text-[9px] px-1.5 py-0.2 rounded font-bold uppercase ${
                  tpl.status === 'published'
                    ? 'bg-emerald-100 text-emerald-800'
                    : 'bg-amber-100 text-amber-800'
                }`}
              >
                {tpl.status}
              </span>
            </button>
          )
        })}
      </div>

      {saveFeedback && (
        <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs font-semibold flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{saveFeedback}</span>
        </div>
      )}

      {/* Formulario Principal de Edición en 2 Columnas */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Columna Izquierda: Formulario de Campos */}
        <div className="lg:col-span-7 bg-white rounded-2xl p-6 border border-slate-200/90 shadow-2xs space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                Nombre comercial
              </label>
              <input
                type="text"
                value={formData.commercialName}
                onChange={(e) => setFormData({ ...formData, commercialName: e.target.value })}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold text-slate-900 focus:outline-none focus:border-[#0066FF]"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                Estado de publicación
              </label>
              <select
                value={formData.status}
                onChange={(e) => setFormData({ ...formData, status: e.target.value as 'published' | 'draft' })}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold text-slate-900 focus:outline-none focus:border-[#0066FF]"
              >
                <option value="published">Visible / Publicado en web pública</option>
                <option value="draft">Borrador / Oculto de la web pública</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
              Subtítulo de tarjeta (Coverflow)
            </label>
            <input
              type="text"
              value={formData.cardSubtitle}
              onChange={(e) => setFormData({ ...formData, cardSubtitle: e.target.value })}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-900 focus:outline-none focus:border-[#0066FF]"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
              Descripción detallada (Catálogo sección 2)
            </label>
            <textarea
              rows={2}
              value={formData.detailDescription}
              onChange={(e) => setFormData({ ...formData, detailDescription: e.target.value })}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-900 focus:outline-none focus:border-[#0066FF]"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                Perfil de cliente / Audiencia objetivo
              </label>
              <input
                type="text"
                value={formData.targetAudience}
                onChange={(e) => setFormData({ ...formData, targetAudience: e.target.value })}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-900 focus:outline-none focus:border-[#0066FF]"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                Problema operacional que resuelve
              </label>
              <input
                type="text"
                value={formData.problemSolved}
                onChange={(e) => setFormData({ ...formData, problemSolved: e.target.value })}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-900 focus:outline-none focus:border-[#0066FF]"
              />
            </div>
          </div>

          {/* Miniatura y Punto Focal */}
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/80 space-y-3">
            <label className="block text-xs font-bold text-slate-900 uppercase tracking-wider">
              Asset fotográfico y Punto Focal
            </label>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <span className="block text-[11px] font-semibold text-slate-500 mb-1">
                  Seleccionar asset precargado:
                </span>
                <select
                  value={formData.thumbnailUrl}
                  onChange={(e) => {
                    const asset = mediaAssets.find((a) => a.url === e.target.value)
                    setFormData({
                      ...formData,
                      thumbnailUrl: e.target.value,
                      thumbnailFocalPoint: asset?.focalPointDefault || formData.thumbnailFocalPoint,
                    })
                  }}
                  className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-800"
                >
                  {mediaAssets.map((asset) => (
                    <option key={asset.id} value={asset.url}>
                      {asset.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <span className="block text-[11px] font-semibold text-slate-500 mb-1">
                  Punto focal (object-position):
                </span>
                <select
                  value={formData.thumbnailFocalPoint}
                  onChange={(e) => setFormData({ ...formData, thumbnailFocalPoint: e.target.value })}
                  className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-800"
                >
                  <option value="50% 35%">Superior (50% 35%)</option>
                  <option value="50% 38%">Medio-Superior (50% 38% - Recomendado)</option>
                  <option value="50% 42%">Ligeramente arriba (50% 42%)</option>
                  <option value="50% 48%">Casi centro (50% 48%)</option>
                  <option value="50% 50%">Centro exacto (50% 50%)</option>
                  <option value="50% 60%">Inferior (50% 60%)</option>
                </select>
              </div>
            </div>

            <div>
              <span className="block text-[11px] font-semibold text-slate-500 mb-1">
                URL directa de imagen:
              </span>
              <input
                type="text"
                value={formData.thumbnailUrl}
                onChange={(e) => setFormData({ ...formData, thumbnailUrl: e.target.value })}
                className="w-full bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-xs font-mono text-slate-700"
              />
            </div>
          </div>

          {/* Rutas y Acciones */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                Ruta de demostración (Demo Route)
              </label>
              <input
                type="text"
                value={formData.demoRoute}
                onChange={(e) => setFormData({ ...formData, demoRoute: e.target.value, demoPath: e.target.value })}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-mono text-slate-800"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                Texto del botón principal
              </label>
              <input
                type="text"
                value={formData.primaryActionLabel}
                onChange={(e) => setFormData({ ...formData, primaryActionLabel: e.target.value })}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-800"
              />
            </div>
          </div>

          {/* Bullets / Capacidades */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                Capacidades destacadas (Bullets)
              </label>
              <button
                type="button"
                onClick={handleAddBullet}
                className="text-xs font-bold text-[#0066FF] hover:underline cursor-pointer"
              >
                + Añadir capacidad
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {formData.bullets.map((b, idx) => (
                <div key={idx} className="flex items-center gap-1.5">
                  <input
                    type="text"
                    value={b}
                    onChange={(e) => handleUpdateBullet(idx, e.target.value)}
                    className="flex-1 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1 text-xs text-slate-800"
                  />
                  <button
                    type="button"
                    onClick={() => handleRemoveBullet(idx)}
                    className="w-6 h-6 rounded text-slate-400 hover:text-red-600 flex items-center justify-center text-xs cursor-pointer"
                    title="Eliminar"
                  >
                    &times;
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Botón de Guardado */}
          <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={handleSave}
              className="px-6 py-2.5 rounded-xl bg-[#0066FF] hover:bg-[#0052cc] text-white text-xs font-bold shadow-sm inline-flex items-center gap-2 cursor-pointer active:scale-98 transition-all"
            >
              <Save className="w-3.5 h-3.5" />
              <span>Guardar cambios en plantilla</span>
            </button>
          </div>
        </div>

        {/* Columna Derecha: Previsualización en Vivo de la Tarjeta */}
        <div className="lg:col-span-5 space-y-4 sticky top-6">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Previsualización de Tarjeta (Coverflow)
            </span>
            <span className="text-[11px] text-slate-400">Escala 1:1</span>
          </div>

          {/* Tarjeta Coverflow Maquetada */}
          <div className="w-[270px] h-[390px] mx-auto rounded-2xl overflow-hidden shadow-xl border border-white/40 bg-gradient-to-b from-[#071322] via-[#0d2038] to-[#040b15] text-white flex flex-col justify-between relative">
            {/* Slot de Imagen */}
            <div className="relative w-full h-[68%] overflow-hidden bg-[#06101c]">
              <img
                src={formData.thumbnailUrl}
                alt={formData.thumbnailAlt}
                style={{ objectPosition: formData.thumbnailFocalPoint }}
                className="w-full h-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-[#08101a] via-transparent to-black/15 pointer-events-none" />
              {formData.badge && (
                <span className="absolute top-2.5 right-2.5 text-[9px] font-bold tracking-wide uppercase px-2 py-0.5 rounded-full bg-blue-600/95 text-white border border-blue-400/40 shadow-xs">
                  {formData.badge}
                </span>
              )}
            </div>

            {/* Slot Inferior */}
            <div className="w-full h-[32%] p-3.5 bg-[#08101a]/95 backdrop-blur-xs border-t border-white/10 flex items-center justify-between gap-2">
              <div className="min-w-0 flex-1">
                <h4 className="text-sm font-bold tracking-tight text-white truncate">
                  {formData.commercialName}
                </h4>
                <p className="text-[10.5px] text-slate-300 line-clamp-1 mt-0.5">
                  {formData.cardSubtitle}
                </p>
              </div>

              <div className="w-7 h-7 rounded-full bg-white text-slate-900 flex items-center justify-center shrink-0 shadow-sm font-bold text-xs">
                &rarr;
              </div>
            </div>
          </div>

          <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-600 text-center">
            Esta tarjeta se actualiza en tiempo real en la vitrina 3D del Hero.
          </div>
        </div>
      </div>
    </div>
  )
}
