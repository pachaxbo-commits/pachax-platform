import { useEffect, useState } from 'react'
import { Plus, Save, Trash2, CheckCircle2, AlertCircle, Globe, EyeOff, Loader2 } from 'lucide-react'
import { useCommercialConfig } from '../../store/commercialConfigStore'
import type { TemplateTierPlan } from '../../types'
import type { TemplateKey } from '../../../public/config/pricingConfig'
import { useAdminAuth } from '../../auth/adminAuthStore'
import { defaultCapabilities } from '../../domain/planCapabilityDefaults'

function withCapabilityDefaults(plan: TemplateTierPlan): TemplateTierPlan {
  return { ...plan, capabilitiesV1: plan.capabilitiesV1 || defaultCapabilities(plan.templateId, plan.planKind) }
}

export function PlansSection() {
  const { user } = useAdminAuth()
  const canApprovePrice = user?.role === 'platform_owner'
  const { config, updatePlan, createPlan, deletePlan, togglePublishPlan } = useCommercialConfig()
  const [selectedTemplate, setSelectedTemplate] = useState<TemplateKey>('restaurant')
  const [editingPlanId, setEditingPlanId] = useState<string | null>(null)
  const [saveFeedback, setSaveFeedback] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [isProcessing, setIsProcessing] = useState(false)

  const templateTabs: { id: TemplateKey; label: string }[] = [
    { id: 'restaurant', label: 'Restaurante' },
    { id: 'hamburger', label: 'Restaurante Rápido' },
    { id: 'distribution', label: 'Distribuidora' },
    { id: 'nightclub', label: 'Nightclub & Lounge' },
    { id: 'retail', label: 'Ventas Express' },
  ]

  const plansForTemplate = config.plans.filter((p) => p.templateId === selectedTemplate)

  const activeEditingPlan = editingPlanId
    ? config.plans.find((p) => p.id === editingPlanId)
    : plansForTemplate[0]

  const [formData, setFormData] = useState<TemplateTierPlan | null>(activeEditingPlan ? withCapabilityDefaults(activeEditingPlan) : null)

  useEffect(() => {
    queueMicrotask(() => setFormData(activeEditingPlan ? JSON.parse(JSON.stringify(withCapabilityDefaults(activeEditingPlan))) : null))
  }, [activeEditingPlan])

  const handleSelectPlan = (plan: TemplateTierPlan) => {
    setEditingPlanId(plan.id)
    setFormData(JSON.parse(JSON.stringify(withCapabilityDefaults(plan))))
    setSaveFeedback(null)
    setSaveError(null)
  }

  const publishedFreeInTemplate = plansForTemplate.filter((p) => p.status === 'published' && p.planKind === 'free').length
  const publishedPaidInTemplate = plansForTemplate.filter((p) => p.status === 'published' && p.planKind !== 'free').length

  const handleSave = async () => {
    if (!formData) return
    if (formData.status === 'published' && formData.priceApproval !== 'approved') {
      setSaveError('Antes de publicar, confirma que el precio y el alcance comercial fueron aprobados.')
      return
    }
    if (formData.status === 'published' && formData.planKind === 'free') {
      setSaveError('Plan Free sigue en preparación y no se puede publicar en esta versión.')
      return
    }

    // Validar límite de planes por template (máx 1 gratuito, máx 3 de pago)
    if (formData.status === 'published') {
      if (formData.planKind === 'free') {
        const freeCount = plansForTemplate.filter(
          (p) => p.id !== formData.id && p.status === 'published' && p.planKind === 'free',
        ).length
        if (freeCount >= 1) {
          setSaveError('No se puede guardar como publicado: cada plantilla permite un máximo de 1 plan gratuito activo en el catálogo. Despublica el actual primero o mantén este en borrador.')
          return
        }
        if (Number(formData.monthlyPriceUSD || 0) > 0 || Number(formData.annualPriceUSD || 0) > 0) {
          setSaveError('El plan gratuito debe tener precio 0.')
          return
        }
      } else {
        const paidCount = plansForTemplate.filter(
          (p) => p.id !== formData.id && p.status === 'published' && p.planKind !== 'free',
        ).length
        if (paidCount >= 3) {
          setSaveError('No se puede guardar como publicado: cada plantilla permite un máximo de 3 planes de pago activos en el catálogo. Despublica otro plan primero o mantén este en borrador.')
          return
        }
      }
    }

    setIsProcessing(true)
    setSaveFeedback(null)
    setSaveError(null)
    const res = await updatePlan(formData.id, formData)
    setIsProcessing(false)
    if (res.success) {
      setSaveFeedback(`¡Plan "${formData.name}" guardado correctamente en Firestore!`)
      setTimeout(() => setSaveFeedback(null), 4000)
    } else {
      setSaveError(res.error || 'No se pudo guardar el plan en Firestore. Los cambios se mantienen en el formulario.')
    }
  }

  const handleTogglePublish = async () => {
    if (!formData) return
    const nextStatus = formData.status === 'published' ? 'draft' : 'published'

    if (nextStatus === 'published') {
      if (formData.planKind === 'free') {
        setSaveError('Plan Free sigue en preparación y no se puede publicar en esta versión.')
        return
      }
      if (formData.priceApproval !== 'approved') {
        setSaveError('Este borrador sigue como referencia. Confirma la aprobación del precio antes de publicarlo.')
        return
      }
      const paidCount = plansForTemplate.filter(
        (p) => p.id !== formData.id && p.status === 'published' && p.planKind !== 'free',
      ).length
      if (paidCount >= 3) {
        setSaveError('Cada plantilla permite un máximo de 3 planes de pago activos publicados simultáneamente en el catálogo. Despublica uno antes de activar este.')
        return
      }
      if (!window.confirm('Los precios de referencia pueden no ser oficiales. ¿Confirmas que este plan debe mostrarse públicamente con los importes actuales?')) return
    }

    setIsProcessing(true)
    setSaveFeedback(null)
    setSaveError(null)
    const res = await togglePublishPlan(formData.id, nextStatus)
    setIsProcessing(false)
    if (res.success) {
      setFormData({ ...formData, status: nextStatus })
      setSaveFeedback(
        nextStatus === 'published'
          ? `¡Plan "${formData.name}" publicado en la landing!`
          : `Plan "${formData.name}" despublicado (ahora en borrador).`
      )
      setTimeout(() => setSaveFeedback(null), 4000)
    } else {
      setSaveError(res.error || 'No se pudo cambiar el estado de publicación en el servidor.')
    }
  }

  const handleCreateNew = async () => {
    setIsProcessing(true)
    setSaveFeedback(null)
    setSaveError(null)
    const newId = `${selectedTemplate}_plan_${Date.now()}`
    const newPlan: TemplateTierPlan = {
      id: newId,
      templateId: selectedTemplate,
      name: 'Nuevo Plan',
      planKind: 'paid',
      tierLevel: 1,
      monthlyPriceUSD: 0,
      annualPriceUSD: 0,
      currency: 'USD',
      billingPeriod: 'monthly',
      clientProfile: 'Perfil de empresa adecuado para este plan.',
      limitsLabel: '1 estación · 1 caja',
      includedFeatures: ['Capacidad inicial 1', 'Capacidad inicial 2'],
      technicalEntitlements: [],
      capabilitiesV1: defaultCapabilities(selectedTemplate, 'paid'),
      ctaLabel: 'Elegir Plan',
      status: 'draft',
      priceApproval: 'pending',
      order: plansForTemplate.length + 1,
    }
    const res = await createPlan(newPlan)
    setIsProcessing(false)
    if (res.success) {
      handleSelectPlan(newPlan)
      setSaveFeedback('Nuevo plan creado en modo borrador (draft) en Firestore.')
    } else {
      setSaveError(res.error || 'Error al crear el nuevo plan en Firestore.')
    }
  }

  const handleDelete = async (id: string) => {
    if (window.confirm('¿Eliminar este plan comercial de Firestore?')) {
      setIsProcessing(true)
      setSaveFeedback(null)
      setSaveError(null)
      const res = await deletePlan(id)
      setIsProcessing(false)
      if (res.success) {
        setEditingPlanId(null)
        setFormData(null)
        setSaveFeedback('Plan eliminado correctamente.')
        setTimeout(() => setSaveFeedback(null), 3000)
      } else {
        setSaveError(res.error || 'No se pudo eliminar el plan en Firestore.')
      }
    }
  }

  const handleAddFeature = () => {
    if (!formData) return
    setFormData({
      ...formData,
      includedFeatures: [...formData.includedFeatures, 'Nueva característica'],
      priceApproval: 'pending',
    })
  }

  const handleUpdateFeature = (idx: number, val: string) => {
    if (!formData) return
    const updated = [...formData.includedFeatures]
    updated[idx] = val
    setFormData({ ...formData, includedFeatures: updated, priceApproval: 'pending' })
  }

  const handleRemoveFeature = (idx: number) => {
    if (!formData) return
    setFormData({
      ...formData,
      includedFeatures: formData.includedFeatures.filter((_, i) => i !== idx),
      priceApproval: 'pending',
    })
  }

  const updateCommercialField = <K extends keyof TemplateTierPlan>(field: K, value: TemplateTierPlan[K]) => {
    setFormData((current) => current ? { ...current, [field]: value, priceApproval: 'pending' } : current)
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
          disabled={isProcessing}
          className="px-4 py-2.5 rounded-xl text-xs font-bold bg-[#0066FF] hover:bg-[#0052cc] disabled:bg-blue-300 text-white shadow-xs inline-flex items-center gap-1.5 transition-all cursor-pointer"
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

      {saveError && (
        <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-red-900 text-xs font-semibold flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
          <span>{saveError}</span>
        </div>
      )}

      {/* Grilla de Planes del Rubro y Formulario */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Lista de Planes a la Izquierda */}
        <div className="lg:col-span-5 space-y-3">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
              Planes ({plansForTemplate.length})
            </span>
            <div className="flex items-center gap-1.5">
              <span
                className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase ${
                  publishedFreeInTemplate >= 1
                    ? 'bg-purple-100 text-purple-900 border border-purple-300'
                    : 'bg-slate-100 text-slate-700 border border-slate-200'
                }`}
              >
                Gratis: {publishedFreeInTemplate} / 1 máx.
              </span>
              <span
                className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase ${
                  publishedPaidInTemplate >= 3
                    ? 'bg-amber-100 text-amber-900 border border-amber-300'
                    : 'bg-blue-50 text-blue-700 border border-blue-200'
                }`}
              >
                Pagos: {publishedPaidInTemplate} / 3 máx.
              </span>
            </div>
          </div>

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
                    {p.planKind === 'free' ? (
                      <span className="text-[10px] font-bold text-purple-700 bg-purple-50 px-2 py-0.5 rounded-full border border-purple-200">
                        Gratis
                      </span>
                    ) : (
                      <span className="text-[10px] font-bold text-slate-700 bg-slate-100 px-2 py-0.5 rounded-full border border-slate-200">
                        Tier {p.tierLevel || 1}
                      </span>
                    )}
                    {p.isPopular && (
                      <span className="text-[10px] font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full border border-blue-200">
                        Popular
                      </span>
                    )}
                    <span
                      className={`text-[9px] px-2 py-0.5 rounded-full font-bold uppercase ${
                        p.status === 'published'
                          ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                          : 'bg-amber-100 text-amber-800 border border-amber-200'
                      }`}
                    >
                      {p.status === 'published' ? 'Publicado' : 'Borrador'}
                    </span>
                  </div>
                </div>

                <div className="flex items-baseline gap-1 text-slate-900 mb-2">
                  {p.planKind === 'free' ? (
                    <>
                      <span className="text-xl font-black">$0</span>
                      <span className="text-xs text-slate-500">USD/mes (Gratis con anuncios)</span>
                    </>
                  ) : (
                    <>
                      <span className="text-xl font-black">${p.monthlyPriceUSD}</span>
                      <span className="text-xs text-slate-500">USD/mes (anual: ${p.annualPriceUSD})</span>
                    </>
                  )}
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
              <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-100">
                <div className="flex items-center gap-2.5">
                  <h3 className="text-base font-bold text-slate-900">
                    Editar: {formData.name}
                  </h3>
                  <span
                    className={`text-[10px] px-2.5 py-0.5 rounded-full font-bold uppercase tracking-wider ${
                      formData.status === 'published'
                        ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                        : 'bg-amber-100 text-amber-800 border border-amber-300'
                    }`}
                  >
                    {formData.status === 'published' ? '● Publicado en Landing' : '○ Borrador (Oculto)'}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleTogglePublish}
                    disabled={isProcessing}
                    className={`text-xs px-3 py-1.5 rounded-xl font-bold inline-flex items-center gap-1.5 transition-all cursor-pointer ${
                      formData.status === 'published'
                        ? 'bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-300'
                        : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300'
                    }`}
                    title={formData.status === 'published' ? 'Pasar a borrador para ocultar de la landing' : 'Publicar plan para que aparezca en la landing pública'}
                  >
                    {formData.status === 'published' ? (
                      <>
                        <EyeOff className="w-3.5 h-3.5" />
                        <span>Despublicar a borrador</span>
                      </>
                    ) : (
                      <>
                        <Globe className="w-3.5 h-3.5" />
                        <span>Publicar en landing</span>
                      </>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => handleDelete(formData.id)}
                    disabled={isProcessing}
                    className="text-xs text-red-600 hover:text-red-700 inline-flex items-center gap-1 font-semibold cursor-pointer px-2 py-1.5 rounded-lg hover:bg-red-50"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Eliminar</span>
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                    Nombre del plan
                  </label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => updateCommercialField('name', e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold text-slate-900"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                    Modalidad del plan
                  </label>
                  <select
                    value={formData.planKind || 'paid'}
                    onChange={(e) => {
                      const newKind = e.target.value as 'free' | 'paid'
                      setFormData({
                        ...formData,
                        planKind: newKind,
                        priceApproval: 'pending',
                        ...(newKind === 'free'
                          ? {
                              monthlyPriceUSD: 0,
                              annualPriceUSD: 0,
                              adsRequired: true,
                              badge: formData.badge || 'Gratis con anuncios',
                            }
                          : {
                              tierLevel: formData.tierLevel || 1,
                              adsRequired: false,
                            }),
                        capabilitiesV1: {
                          ...(formData.capabilitiesV1 || defaultCapabilities(selectedTemplate, newKind)),
                          features: { ...(formData.capabilitiesV1 || defaultCapabilities(selectedTemplate, newKind)).features,
                            adsRequired: newKind === 'free' },
                        },
                      })
                    }}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold text-slate-900"
                  >
                    <option value="paid">De Pago (Suscripción comercial)</option>
                    <option value="free">Gratuito (Con anuncios obligatorios)</option>
                  </select>
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

              <label className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-950">
                <input type="checkbox" checked={formData.priceApproval === 'approved'} disabled={!canApprovePrice}
                  onChange={(event) => setFormData({ ...formData, priceApproval: event.target.checked ? 'approved' : 'pending' })}
                  className="mt-0.5" />
                <span><strong>Aprobación comercial explícita:</strong> {canApprovePrice
                  ? 'confirmo los precios y las características visibles. Solo incluye capacidades implementadas y verificadas; las futuras o cotizadas deben quedar fuera de esta lista. Esto no activa permisos técnicos.'
                  : 'solo Platform Owner puede confirmar precios oficiales. Esto no activa permisos técnicos.'}</span>
              </label>

              <div className="rounded-xl border border-blue-200 bg-blue-50 p-3 text-xs text-blue-950">
                  <strong>Capacidades técnicas:</strong> el servidor valida límites y acceso a reportes por plantilla. PDF y Excel descargables requieren `reports.export`; imprimir resumen mediante el motor requiere `printing.manual`. Ninguna capacidad promete impresión silenciosa ni compatibilidad física universal; los dispositivos requieren validación en el equipo del cliente.
              </div>

              {formData.capabilitiesV1 && (
                <fieldset className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <legend className="px-1 text-xs font-bold uppercase tracking-wide text-slate-700">Capacidades técnicas contratadas</legend>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {([
                      ['activeUsers', 'Usuarios activos', 100],
                      ['activeProducts', 'Productos activos', 200],
                      ['activeBranches', 'Sucursales', 1],
                    ] as const).map(([key, label, max]) => (
                      <label key={key} className="text-xs font-semibold text-slate-700">
                        {label} (máximo verificable: {max})
                        <input type="number" min={1} max={max} value={formData.capabilitiesV1!.limits[key]}
                          onChange={(event) => setFormData({ ...formData, priceApproval: 'pending', capabilitiesV1: {
                            ...formData.capabilitiesV1!, limits: { ...formData.capabilitiesV1!.limits, [key]: Number(event.target.value) },
                          } })}
                          className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2" />
                      </label>
                    ))}
                  </div>
                  <p className="text-xs font-semibold text-slate-700">✓ Resumen operativo básico incluido como capacidad base.</p>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {([
                      ['detailed', 'Reportes detallados', 'Habilita vistas históricas por periodo y desglose disponibles para esta plantilla.'],
                      ['export', 'Exportar informes (PDF y Excel)', 'Habilita la descarga completa de informes en PDF y Excel. La impresión manual se controla por separado.'],
                    ] as const).map(([key, label, description]) => <label key={key} className="flex items-start gap-2 rounded-lg border border-slate-200 bg-white p-2 text-xs">
                      <input type="checkbox" checked={formData.capabilitiesV1!.features.reports[key]} disabled={!canApprovePrice}
                        onChange={(event) => setFormData({ ...formData, priceApproval: 'pending', capabilitiesV1: {
                          ...formData.capabilitiesV1!, features: { ...formData.capabilitiesV1!.features,
                            reports: { ...formData.capabilitiesV1!.features.reports, [key]: event.target.checked } },
                        } })} />
                      <span><strong>{label}</strong><br /><span className="text-slate-500">{description}</span></span>
                    </label>)}
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {([
                      ['receipts.digital', 'Recibo digital / PDF'],
                      ['printing.manual', 'Impresión manual'],
                      ['printing.kitchenAutomatic', 'Impresión automática de cocina/barra'],
                    ] as const).map(([key, label]) => {
                      const supported = key !== 'printing.kitchenAutomatic' || ['restaurant_pos', 'hamburger_shop', 'nightclub_lounge'].includes(String(formData.capabilitiesV1?.businessType))
                      const checked = key === 'receipts.digital'
                        ? formData.capabilitiesV1!.features.receipts.digital
                        : key === 'printing.manual'
                          ? formData.capabilitiesV1!.features.printing.manual
                          : formData.capabilitiesV1!.features.printing.kitchenAutomatic
                      return <label key={key} className={`flex items-start gap-2 rounded-lg border p-2 text-xs ${supported ? 'border-slate-200 bg-white' : 'border-slate-100 bg-slate-100 text-slate-400'}`}>
                        <input type="checkbox" checked={checked} disabled={!supported || !canApprovePrice}
                          onChange={(event) => {
                            const enabled = event.target.checked
                            const current = formData.capabilitiesV1!
                            const features = key === 'receipts.digital'
                              ? { ...current.features, receipts: { digital: enabled } }
                              : key === 'printing.manual'
                                ? { ...current.features, printing: { ...current.features.printing, manual: enabled } }
                                : { ...current.features, printing: { ...current.features.printing, kitchenAutomatic: enabled } }
                            setFormData({ ...formData, priceApproval: 'pending', capabilitiesV1: { ...current, features } })
                          }} />
                        <span>{label}{!supported ? ' · no aplica a esta plantilla' : ''}</span>
                      </label>
                    })}
                  </div>
                  <p className="text-[11px] text-slate-500">Las capacidades comerciales no conceden permisos de rol; cada informe también exige acceso de reportes y sucursal autorizada. Extras solo amplían límites de usuarios/productos dentro del máximo técnico. La impresión no promete compatibilidad universal ni impresión silenciosa.</p>
                </fieldset>
              )}

              {formData.planKind === 'free' && (
                <div className="p-3.5 rounded-xl bg-purple-50 border border-purple-200 text-purple-900 text-xs font-medium flex items-start gap-2.5">
                  <AlertCircle className="w-4 h-4 text-purple-600 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold">Política de Plan Gratuito:</span> Publicidad obligatoria cuando el sistema publicitario PACHAX esté habilitado. Los precios están fijados en $0 USD y no requieren pasarela de pago.
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                    Precio mensual ({formData.currency})
                  </label>
                  <input
                    type="number"
                    disabled={formData.planKind === 'free'}
                    value={formData.planKind === 'free' ? 0 : formData.monthlyPriceUSD}
                    onChange={(e) => updateCommercialField('monthlyPriceUSD', Number(e.target.value))}
                    className={`w-full border rounded-xl px-3 py-2 text-xs font-bold ${
                      formData.planKind === 'free'
                        ? 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed'
                        : 'bg-slate-50 text-slate-900 border-slate-200'
                    }`}
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                    Precio anual equivalente ({formData.currency}/mes)
                  </label>
                  <input
                    type="number"
                    disabled={formData.planKind === 'free'}
                    value={formData.planKind === 'free' ? 0 : formData.annualPriceUSD}
                    onChange={(e) => updateCommercialField('annualPriceUSD', Number(e.target.value))}
                    className={`w-full border rounded-xl px-3 py-2 text-xs font-bold ${
                      formData.planKind === 'free'
                        ? 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed'
                        : 'bg-slate-50 text-slate-900 border-slate-200'
                    }`}
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                    Límites operacionales
                  </label>
                  <input
                    type="text"
                    value={formData.limitsLabel || ''}
                    onChange={(e) => updateCommercialField('limitsLabel', e.target.value)}
                    placeholder="Ej. 1 estación · 1 caja"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-900"
                  />
                </div>
              </div>

              {/* Nivel de Tier, Orden, Badge y CTA */}
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                    Nivel de escala (Tier)
                  </label>
                  {formData.planKind === 'free' ? (
                    <input
                      type="text"
                      disabled
                      value="No aplica (Plan Gratuito)"
                      className="w-full bg-slate-100 border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold text-slate-400 cursor-not-allowed"
                    />
                  ) : (
                    <select
                      value={formData.tierLevel || 1}
                    onChange={(e) => updateCommercialField('tierLevel', Number(e.target.value) as 1 | 2 | 3)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold text-slate-900"
                    >
                      <option value={1}>Tier 1 (Entrada / Básico)</option>
                      <option value={2}>Tier 2 (Crecimiento)</option>
                      <option value={3}>Tier 3 (Escala / Pro)</option>
                    </select>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                    Orden de columna
                  </label>
                  <input
                    type="number"
                    min={1}
                    value={formData.order || 1}
                    onChange={(e) => setFormData({ ...formData, order: Number(e.target.value) })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-900"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                    Badge comercial
                  </label>
                  <input
                    type="text"
                    placeholder="Ej. Más elegido"
                    value={formData.badge || ''}
                    onChange={(e) => updateCommercialField('badge', e.target.value || undefined)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-900"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                    Texto de botón CTA
                  </label>
                  <input
                    type="text"
                    value={formData.ctaLabel || 'Elegir Plan'}
                    onChange={(e) => updateCommercialField('ctaLabel', e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-900"
                  />
                </div>
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="planIsPopularCheck"
                  checked={Boolean(formData.isPopular)}
                  onChange={(e) => setFormData({ ...formData, isPopular: e.target.checked })}
                  className="rounded border-slate-300 text-[#0066FF] focus:ring-[#0066FF]"
                />
                <label htmlFor="planIsPopularCheck" className="text-xs text-slate-700 font-semibold cursor-pointer">
                  Marcar como plan recomendado / popular (destaca visualmente la columna)
                </label>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Perfil de cliente / Descripción de alcance
                </label>
                <textarea
                  rows={2}
                  value={formData.clientProfile}
                  onChange={(e) => updateCommercialField('clientProfile', e.target.value)}
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

              <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={isProcessing}
                  className="px-6 py-2.5 rounded-xl bg-[#0066FF] hover:bg-[#0052cc] disabled:bg-blue-300 text-white text-xs font-bold shadow-sm inline-flex items-center gap-2 cursor-pointer active:scale-98 transition-all"
                >
                  {isProcessing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                  <span>{isProcessing ? 'Guardando...' : 'Guardar plan'}</span>
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
