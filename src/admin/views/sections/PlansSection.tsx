import { useState } from 'react'
import { Plus, Save, Trash2, CheckCircle2 } from 'lucide-react'
import { useCommercialConfig } from '../../store/commercialConfigStore'
import type { TemplateTierPlan } from '../../types'
import type { TemplateKey } from '../../../public/config/pricingConfig'

export function PlansSection() {
  const { config, updatePlan, createPlan, deletePlan } = useCommercialConfig()
  const [selectedTemplate, setSelectedTemplate] = useState<TemplateKey>('restaurant')
  const [editingPlanId, setEditingPlanId] = useState<string | null>(null)
  const [saveFeedback, setSaveFeedback] = useState<string | null>(null)

  const templateTabs: { id: TemplateKey; label: string }[] = [
    { id: 'restaurant', label: 'Restaurante' },
    { id: 'distribution', label: 'Distribuidora' },
    { id: 'nightclub', label: 'Nightclub & Lounge' },
    { id: 'retail', label: 'Ventas Express' },
  ]

  const plansForTemplate = config.plans.filter((p) => p.templateId === selectedTemplate)

  const activeEditingPlan = editingPlanId
    ? config.plans.find((p) => p.id === editingPlanId)
    : plansForTemplate[0]

  const [formData, setFormData] = useState<TemplateTierPlan | null>(activeEditingPlan || null)

  const handleSelectPlan = (plan: TemplateTierPlan) => {
    setEditingPlanId(plan.id)
    setFormData(JSON.parse(JSON.stringify(plan)))
    setSaveFeedback(null)
  }

  const handleSave = () => {
    if (!formData) return
    updatePlan(formData.id, formData)
    setSaveFeedback(`¡Plan "${formData.name}" guardado correctamente!`)
    setTimeout(() => setSaveFeedback(null), 4000)
  }

  const handleCreateNew = () => {
    const newId = `${selectedTemplate}_plan_${Date.now()}`
    const newPlan: TemplateTierPlan = {
      id: newId,
      templateId: selectedTemplate,
      name: 'Nuevo Plan',
      tierLevel: 1,
      monthlyPriceUSD: 29,
      annualPriceUSD: 24,
      currency: 'USD',
      billingPeriod: 'monthly',
      clientProfile: 'Perfil de empresa adecuado para este plan.',
      limitsLabel: '1 estación · 1 caja',
      includedFeatures: ['Capacidad inicial 1', 'Capacidad inicial 2'],
      technicalEntitlements: [],
      ctaLabel: 'Elegir Plan',
      status: 'draft',
      order: plansForTemplate.length + 1,
    }
    createPlan(newPlan)
    handleSelectPlan(newPlan)
    setSaveFeedback('Nuevo plan creado en modo borrador (draft).')
  }

  const handleDelete = (id: string) => {
    if (window.confirm('¿Eliminar este plan comercial?')) {
      deletePlan(id)
      setEditingPlanId(null)
      setFormData(null)
    }
  }

  const handleAddFeature = () => {
    if (!formData) return
    setFormData({
      ...formData,
      includedFeatures: [...formData.includedFeatures, 'Nueva característica'],
    })
  }

  const handleUpdateFeature = (idx: number, val: string) => {
    if (!formData) return
    const updated = [...formData.includedFeatures]
    updated[idx] = val
    setFormData({ ...formData, includedFeatures: updated })
  }

  const handleRemoveFeature = (idx: number) => {
    if (!formData) return
    setFormData({
      ...formData,
      includedFeatures: formData.includedFeatures.filter((_, i) => i !== idx),
    })
  }

  return (
    <div className="space-y-8">
      {/* Encabezado */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-6 border-b border-slate-200">
        <div>
          <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
            Gestión de Planes Comerciales
          </h2>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Administra precios referenciales, niveles operativos (tier 1 a 3), límites y estado de publicación.
          </p>
        </div>

        <button
          type="button"
          onClick={handleCreateNew}
          className="px-4 py-2.5 rounded-xl text-xs font-bold bg-[#0066FF] hover:bg-[#0052cc] text-white shadow-xs inline-flex items-center gap-1.5 transition-all cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>Crear nuevo plan</span>
        </button>
      </div>

      {/* Selector de Rubro / Plantilla */}
      <div className="flex flex-wrap gap-2 p-1.5 bg-slate-100 rounded-2xl border border-slate-200/80">
        {templateTabs.map((tab) => {
          const isActive = selectedTemplate === tab.id
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => {
                setSelectedTemplate(tab.id)
                setEditingPlanId(null)
                setFormData(null)
              }}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                isActive
                  ? 'bg-white text-slate-950 shadow-xs border border-slate-200/80'
                  : 'text-slate-600 hover:text-slate-950 hover:bg-white/60'
              }`}
            >
              {tab.label}
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

      {/* Grilla de Planes del Rubro y Formulario */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Lista de Planes a la Izquierda */}
        <div className="lg:col-span-5 space-y-3">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-400 block mb-1">
            Planes configurados ({plansForTemplate.length})
          </span>

          {plansForTemplate.map((p) => {
            const isSelected = formData?.id === p.id
            return (
              <div
                key={p.id}
                onClick={() => handleSelectPlan(p)}
                className={`p-4 rounded-2xl border transition-all cursor-pointer ${
                  isSelected
                    ? 'bg-white border-[#0066FF] shadow-sm ring-2 ring-blue-500/10'
                    : 'bg-white border-slate-200/80 hover:border-slate-300'
                }`}
              >
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <h4 className="text-sm font-extrabold text-slate-900">
                    {p.name}
                  </h4>
                  <div className="flex items-center gap-1.5">
                    {p.isPopular && (
                      <span className="text-[10px] font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full border border-blue-200">
                        Popular
                      </span>
                    )}
                    <span
                      className={`text-[9px] px-2 py-0.5 rounded-full font-bold uppercase ${
                        p.status === 'published'
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-amber-100 text-amber-800'
                      }`}
                    >
                      {p.status}
                    </span>
                  </div>
                </div>

                <div className="flex items-baseline gap-1 text-slate-900 mb-2">
                  <span className="text-xl font-black">${p.monthlyPriceUSD}</span>
                  <span className="text-xs text-slate-500">USD/mes (anual: ${p.annualPriceUSD})</span>
                </div>

                <p className="text-xs text-slate-500 line-clamp-1">{p.clientProfile}</p>
              </div>
            )
          })}
        </div>

        {/* Editor del Plan Seleccionado */}
        <div className="lg:col-span-7 bg-white rounded-2xl p-6 border border-slate-200/90 shadow-2xs">
          {formData ? (
            <div className="space-y-5">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <h3 className="text-base font-bold text-slate-900">
                  Editar: {formData.name}
                </h3>
                <button
                  type="button"
                  onClick={() => handleDelete(formData.id)}
                  className="text-xs text-red-600 hover:text-red-700 inline-flex items-center gap-1 font-semibold cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Eliminar plan</span>
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                    Nombre del plan
                  </label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold text-slate-900"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                    Estado de publicación
                  </label>
                  <select
                    value={formData.status}
                    onChange={(e) => setFormData({ ...formData, status: e.target.value as 'published' | 'draft' })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold text-slate-900"
                  >
                    <option value="published">Publicado (Visible en landing)</option>
                    <option value="draft">Borrador (Oculto en landing)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                    Precio mensual ($ USD)
                  </label>
                  <input
                    type="number"
                    value={formData.monthlyPriceUSD}
                    onChange={(e) => setFormData({ ...formData, monthlyPriceUSD: Number(e.target.value) })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-900"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                    Precio anual ($ USD/mes)
                  </label>
                  <input
                    type="number"
                    value={formData.annualPriceUSD}
                    onChange={(e) => setFormData({ ...formData, annualPriceUSD: Number(e.target.value) })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-900"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                    Límites operacionales
                  </label>
                  <input
                    type="text"
                    value={formData.limitsLabel || ''}
                    onChange={(e) => setFormData({ ...formData, limitsLabel: e.target.value })}
                    placeholder="Ej. 1 estación · 1 caja"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-900"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Perfil de cliente / Descripción de alcance
                </label>
                <textarea
                  rows={2}
                  value={formData.clientProfile}
                  onChange={(e) => setFormData({ ...formData, clientProfile: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-900"
                />
              </div>

              {/* Características incluidas */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                    Funcionalidades incluidas
                  </label>
                  <button
                    type="button"
                    onClick={handleAddFeature}
                    className="text-xs font-bold text-[#0066FF] hover:underline cursor-pointer"
                  >
                    + Añadir ítem
                  </button>
                </div>
                <div className="space-y-2">
                  {formData.includedFeatures.map((feat, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <input
                        type="text"
                        value={feat}
                        onChange={(e) => handleUpdateFeature(idx, e.target.value)}
                        className="flex-1 bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-xs text-slate-800"
                      />
                      <button
                        type="button"
                        onClick={() => handleRemoveFeature(idx)}
                        className="text-slate-400 hover:text-red-600 text-xs px-2 cursor-pointer"
                      >
                        &times;
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              <div className="pt-4 border-t border-slate-100 flex items-center justify-end">
                <button
                  type="button"
                  onClick={handleSave}
                  className="px-6 py-2.5 rounded-xl bg-[#0066FF] hover:bg-[#0052cc] text-white text-xs font-bold shadow-sm inline-flex items-center gap-2 cursor-pointer active:scale-98 transition-all"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>Guardar plan</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="text-center py-12 text-slate-400 text-xs">
              Selecciona un plan de la lista de la izquierda para comenzar a editarlo.
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
