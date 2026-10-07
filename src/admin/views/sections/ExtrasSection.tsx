import { useState } from 'react'
import { Megaphone, Palette, Headphones, Zap, Code2, CheckCircle2, AlertCircle } from 'lucide-react'
import { useCommercialConfig } from '../../store/commercialConfigStore'
import type { CommercialExtraService } from '../../types'

export function ExtrasSection() {
  const { config, updateExtra } = useCommercialConfig()
  const [saveFeedback, setSaveFeedback] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)

  const renderIcon = (key: CommercialExtraService['iconKey']) => {
    switch (key) {
      case 'megaphone':
        return <Megaphone className="w-4 h-4 text-[#0066FF]" />
      case 'palette':
        return <Palette className="w-4 h-4 text-[#0066FF]" />
      case 'headset':
        return <Headphones className="w-4 h-4 text-[#0066FF]" />
      case 'zap':
        return <Zap className="w-4 h-4 text-[#0066FF]" />
      case 'code':
        return <Code2 className="w-4 h-4 text-[#0066FF]" />
    }
  }

  const handleToggleStatus = async (extra: CommercialExtraService) => {
    const newStatus = extra.status === 'published' ? 'draft' : 'published'
    if (newStatus === 'published' && !window.confirm('Los precios de referencia pueden no ser oficiales. ¿Confirmas que este extra debe mostrarse públicamente?')) return
    setSaveFeedback(null)
    setSaveError(null)
    const res = await updateExtra(extra.id, { status: newStatus })
    if (res.success) {
      setSaveFeedback(`Servicio "${extra.title}" cambiado a ${newStatus} en Firestore.`)
      setTimeout(() => setSaveFeedback(null), 3000)
    } else {
      setSaveError(res.error || 'Error al cambiar estado del servicio.')
    }
  }

  const handleUpdateField = async (id: string, field: keyof CommercialExtraService, value: CommercialExtraService[keyof CommercialExtraService]) => {
    setSaveFeedback(null)
    setSaveError(null)
    const res = await updateExtra(id, { [field]: value })
    if (res.success) {
      setSaveFeedback('Cambios guardados en Firestore.')
      setTimeout(() => setSaveFeedback(null), 2500)
    } else {
      setSaveError(res.error || 'Error al guardar los cambios en Firestore.')
    }
  }

  return (
    <div className="space-y-8">
      {/* Encabezado */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-6 border-b border-slate-200">
        <div>
          <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
            Gestión de Extras y Servicios Estratégicos
          </h2>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Administra los servicios de valor agregado de la Sección 6: precios de referencia, estado y alcance.
          </p>
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

      {/* Lista de Extras Comerciales */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {config.extras.map((extra) => {
          const isPublished = extra.status === 'published'
          return (
            <div
              key={extra.id}
              className={`bg-white rounded-2xl p-6 border transition-all ${
                isPublished
                  ? 'border-slate-200/90 shadow-2xs'
                  : 'border-slate-200/60 bg-slate-50/60 opacity-80'
              }`}
            >
              <div className="flex items-center justify-between gap-3 mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center shrink-0">
                    {renderIcon(extra.iconKey)}
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-slate-900">{extra.title}</h4>
                    <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                      Categoría: {extra.category}
                    </span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => handleToggleStatus(extra)}
                  className={`px-3 py-1 rounded-full text-xs font-bold transition-all cursor-pointer ${
                    isPublished
                      ? 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200'
                      : 'bg-amber-100 text-amber-800 hover:bg-amber-200'
                  }`}
                >
                  {isPublished ? 'Publicado' : 'Borrador (Oculto)'}
                </button>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                    Título comercial
                  </label>
                  <input
                    type="text"
                    value={extra.title}
                    onChange={(e) => handleUpdateField(extra.id, 'title', e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-xs font-semibold text-slate-900"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                    Descripción corta
                  </label>
                  <textarea
                    rows={2}
                    value={extra.shortDescription}
                    onChange={(e) => handleUpdateField(extra.id, 'shortDescription', e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-xs text-slate-800"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                      Precio de referencia
                    </label>
                    <input
                      type="text"
                      value={extra.referencePriceLabel}
                      onChange={(e) => handleUpdateField(extra.id, 'referencePriceLabel', e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-xs text-slate-900 font-bold"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                      Tipo de cobro
                    </label>
                    <select
                      value={extra.pricingType}
                      onChange={(e) => handleUpdateField(extra.id, 'pricingType', e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-xs text-slate-800"
                    >
                      <option value="recurring">Recurrente mensual</option>
                      <option value="one_time">Pago único</option>
                      <option value="custom_quote">Cotización a medida</option>
                    </select>
                  </div>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
