import { useEffect, useState } from 'react'
import { Megaphone, Palette, Headphones, Zap, Code2, CheckCircle2, AlertCircle, Loader2, Save } from 'lucide-react'
import { useAdminAuth } from '../../auth/adminAuthStore'
import { useCommercialConfig } from '../../store/commercialConfigStore'
import type { CommercialExtraService } from '../../types'
import type { TemplateKey } from '../../../public/config/pricingConfig'

const TEMPLATE_LABELS: Record<TemplateKey, string> = {
  restaurant: 'Restaurante con salón',
  distribution: 'Producción y Distribución',
  nightclub: 'Nightclub & Lounge',
  hamburger: 'Restaurante Rápido',
  retail: 'Comercio / Venta rápida',
}

export function ExtrasSection() {
  const { user } = useAdminAuth()
  const { config, updateExtra, createExtra, deleteExtra } = useCommercialConfig()
  const [drafts, setDrafts] = useState<Record<string, CommercialExtraService>>({})
  const [saveFeedback, setSaveFeedback] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [isProcessing, setIsProcessing] = useState(false)
  const canManageCommercial = user?.role === 'platform_owner' || user?.role === 'platform_admin'

  useEffect(() => {
    queueMicrotask(() => setDrafts(Object.fromEntries(config.extras.map((extra) => [extra.id, structuredClone(extra)]))))
  }, [config.extras])

  const renderIcon = (key: CommercialExtraService['iconKey']) => {
    switch (key) {
      case 'megaphone': return <Megaphone className="w-4 h-4 text-[#0066FF]" />
      case 'palette': return <Palette className="w-4 h-4 text-[#0066FF]" />
      case 'headset': return <Headphones className="w-4 h-4 text-[#0066FF]" />
      case 'zap': return <Zap className="w-4 h-4 text-[#0066FF]" />
      case 'code': return <Code2 className="w-4 h-4 text-[#0066FF]" />
    }
  }

  const setField = <K extends keyof CommercialExtraService>(id: string, field: K, value: CommercialExtraService[K]) => {
    setDrafts((current) => ({ ...current, [id]: { ...current[id], [field]: value } }))
    setSaveFeedback(null)
    setSaveError(null)
  }

  const handleCreateExtra = async () => {
    setIsProcessing(true)
    setSaveFeedback(null)
    setSaveError(null)
    const newId = `extra_${crypto.randomUUID()}`
    const newExtra: CommercialExtraService = {
      id: newId,
      title: 'Nuevo Servicio Complementario',
      category: 'support',
      shortDescription: 'Descripción del servicio adicional para clientes de la plataforma.',
      referencePriceLabel: 'Cotización personalizada',
      pricingType: 'custom_quote',
      iconKey: 'zap',
      applicableTemplates: 'all',
      status: 'draft',
      order: config.extras.length + 1,
      revision: 0,
    }
    const res = await createExtra(newExtra)
    setIsProcessing(false)
    if (res.success) {
      setSaveFeedback('Nuevo servicio creado en borrador en Firestore.')
      setTimeout(() => setSaveFeedback(null), 3000)
    } else setSaveError(res.error || 'No se pudo crear el servicio extra.')
  }

  const handleDeleteExtra = async (id: string, title: string) => {
    if (!window.confirm(`¿Eliminar el servicio "${title}" de Firestore?`)) return
    setIsProcessing(true)
    setSaveFeedback(null)
    setSaveError(null)
    const res = await deleteExtra(id)
    setIsProcessing(false)
    if (res.success) {
      setSaveFeedback(`Servicio "${title}" eliminado correctamente.`)
      setTimeout(() => setSaveFeedback(null), 3000)
    } else setSaveError(res.error || 'No se pudo eliminar el servicio extra.')
  }

  const handleSave = async (extra: CommercialExtraService) => {
    const draft = drafts[extra.id] || extra
    if (Array.isArray(draft.applicableTemplates) && draft.applicableTemplates.length === 0) {
      setSaveError('Selecciona al menos una plantilla o activa “Todas las plantillas operativas”.')
      return
    }
    if (draft.status === 'published' && !canManageCommercial) {
      setSaveError('Solo Platform Owner o Admin puede publicar servicios o definir su alcance comercial.')
      return
    }
    if (draft.status === 'published' && !window.confirm('Confirma que el contenido y el precio de referencia están aprobados para mostrarse públicamente.')) return
    setIsProcessing(true)
    setSaveFeedback(null)
    setSaveError(null)
    const res = await updateExtra(extra.id, draft)
    setIsProcessing(false)
    if (res.success) {
      setDrafts((current) => ({ ...current, [extra.id]: { ...draft, revision: (extra.revision || 0) + 1 } }))
      setSaveFeedback(`Servicio "${draft.title}" guardado en Firestore como ${draft.status === 'published' ? 'publicado' : 'borrador'}.`)
      setTimeout(() => setSaveFeedback(null), 3000)
    } else setSaveError(res.error || 'No se pudieron guardar los cambios. Recarga el servicio si otro operador lo editó.')
  }

  const handleToggleStatus = (extra: CommercialExtraService) => {
    const draft = drafts[extra.id] || extra
    const nextStatus = (draft.status || extra.status) === 'published' ? 'draft' : 'published'
    if (nextStatus === 'published' && !canManageCommercial) return
    setField(extra.id, 'status', nextStatus)
  }

  const templates = config.templates.filter((template) => template.id !== 'custom' && template.id in TEMPLATE_LABELS)

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-6 border-b border-slate-200">
        <div>
          <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">Gestión de Extras y Servicios Estratégicos</h2>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">Administra descripción, tipo de cobro, alcance, orden y publicación. Los borradores no aparecen en la web pública.</p>
        </div>
        <button type="button" onClick={handleCreateExtra} disabled={isProcessing} className="px-4 py-2.5 rounded-xl text-xs font-bold bg-[#0066FF] hover:bg-[#0052cc] text-white shadow-xs inline-flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-50">
          + Crear nuevo servicio
        </button>
      </div>

      {saveFeedback && <div role="status" className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs font-semibold flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" /><span>{saveFeedback}</span></div>}
      {saveError && <div role="alert" className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-red-900 text-xs font-semibold flex items-center gap-2"><AlertCircle className="w-4 h-4 text-red-600 shrink-0" /><span>{saveError}</span></div>}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {config.extras.map((extra) => {
          const draft = drafts[extra.id] || extra
          const isPublished = extra.status === 'published'
  const selectedTemplates: TemplateKey[] = Array.isArray(draft.applicableTemplates) ? draft.applicableTemplates : []
          return (
            <div key={extra.id} className={`bg-white rounded-2xl p-5 sm:p-6 border transition-all ${isPublished ? 'border-slate-200/90 shadow-2xs' : 'border-slate-200/60 bg-slate-50/60'}`}>
              <div className="flex items-center justify-between gap-3 mb-4">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center shrink-0">{renderIcon(draft.iconKey)}</div>
                  <div className="min-w-0"><h4 className="text-sm font-bold text-slate-900 truncate">{draft.title}</h4><span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Categoría: {draft.category}</span></div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className={`px-3 py-1 rounded-full text-xs font-bold ${isPublished ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>{isPublished ? 'Publicado' : 'Borrador'}</span>
                  <button type="button" onClick={() => handleDeleteExtra(extra.id, extra.title)} disabled={isProcessing} className="text-xs text-red-500 hover:text-red-700 px-2 py-1 rounded-lg hover:bg-red-50 cursor-pointer font-bold disabled:opacity-50" aria-label={`Eliminar ${extra.title}`}>&times;</button>
                </div>
              </div>

              <div className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <label className="sm:col-span-2 block text-[11px] font-bold text-slate-500 uppercase tracking-wider">Título comercial
                    <input type="text" value={draft.title} onChange={(e) => setField(extra.id, 'title', e.target.value)} className="mt-1 w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold text-slate-900" />
                  </label>
                  <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider">Categoría
                    <select value={draft.category} onChange={(e) => setField(extra.id, 'category', e.target.value as CommercialExtraService['category'])} className="mt-1 w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-800">
                      <option value="support">Soporte</option><option value="marketing">Marketing</option><option value="branding">Branding</option><option value="automation">Automatización</option><option value="consulting">Consultoría</option><option value="custom">A Medida</option>
                    </select>
                  </label>
                </div>

                <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider">Descripción corta
                  <textarea rows={2} value={draft.shortDescription} onChange={(e) => setField(extra.id, 'shortDescription', e.target.value)} className="mt-1 w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-800" />
                </label>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider">Etiqueta de precio de referencia
                  <input type="text" value={draft.referencePriceLabel} onChange={(e) => setField(extra.id, 'referencePriceLabel', e.target.value)} disabled={!canManageCommercial} className="mt-1 w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-900 disabled:opacity-50" />
                  </label>
                  <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider">Tipo de cobro
                    <select value={draft.pricingType} onChange={(e) => setField(extra.id, 'pricingType', e.target.value as CommercialExtraService['pricingType'])} disabled={!canManageCommercial} className="mt-1 w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-800 disabled:opacity-50">
                      <option value="recurring">Recurrente mensual</option><option value="one_time">Pago único</option><option value="custom_quote">Cotización a medida</option>
                    </select>
                  </label>
                </div>

                <fieldset className="rounded-xl border border-slate-200 p-3">
                  <legend className="px-1 text-[11px] font-bold text-slate-600">Plantillas aplicables</legend>
                  <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 mb-2">
                    <input type="checkbox" checked={draft.applicableTemplates === 'all'} disabled={!canManageCommercial} onChange={(e) => setField(extra.id, 'applicableTemplates', e.target.checked ? 'all' : [])} />
                    Todas las plantillas operativas
                  </label>
                  {draft.applicableTemplates !== 'all' && <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {templates.map((template) => {
                      const id = template.id as TemplateKey
                      const checked = selectedTemplates.includes(id)
                      return <label key={id} className="flex items-center gap-2 text-xs text-slate-700"><input type="checkbox" checked={checked} onChange={(e) => {
                        const next = e.target.checked ? [...selectedTemplates, id] : selectedTemplates.filter((item) => item !== id)
                        setField(extra.id, 'applicableTemplates', next)
                      }} disabled={!canManageCommercial} />{TEMPLATE_LABELS[id]}</label>
                    })}
                  </div>}
                </fieldset>

                <div className="flex flex-col sm:flex-row sm:items-end gap-3">
                  <label className="block flex-1 text-[11px] font-bold text-slate-500 uppercase tracking-wider">Orden público
                    <input type="number" min={1} step={1} value={draft.order} onChange={(e) => setField(extra.id, 'order', Number(e.target.value))} className="mt-1 w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-900" />
                  </label>
                  <button type="button" onClick={() => handleToggleStatus(extra)} disabled={isProcessing || !canManageCommercial} className={`px-3 py-2 rounded-xl text-xs font-bold border disabled:opacity-50 ${isPublished ? 'text-amber-800 border-amber-200 bg-amber-50' : 'text-slate-700 border-slate-200 bg-white'}`}>
                    {isPublished ? 'Cambiar a borrador' : 'Preparar publicación'}
                  </button>
                  <button type="button" onClick={() => handleSave(extra)} disabled={isProcessing} className="px-4 py-2 rounded-xl text-xs font-bold bg-[#0066FF] hover:bg-[#0052cc] text-white inline-flex items-center justify-center gap-1.5 disabled:opacity-50">
                    {isProcessing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                    {isProcessing ? 'Guardando…' : 'Guardar cambios'}
                  </button>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
