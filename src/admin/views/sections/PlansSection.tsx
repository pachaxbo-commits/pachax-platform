import { useState } from 'react'
import {
  AlertCircle,
  BookOpen,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  EyeOff,
  Globe,
  Loader2,
  Lock,
  Plus,
  Save,
  ShieldCheck,
  Sparkles,
  Trash2,
} from 'lucide-react'
import { useCommercialConfig } from '../../store/commercialConfigStore'
import type { TemplateTierPlan, PlatformExchangeRateConfig } from '../../types'
import type { TemplateKey } from '../../../public/config/pricingConfig'
import { useAdminAuth } from '../../auth/adminAuthStore'
import { defaultCapabilities } from '../../domain/planCapabilityDefaults'
import { ExchangeRateConfigCard } from '../../components/ExchangeRateConfigCard'
import {
  formatPrimaryCommercialAmount,
  formatUsdReferenceText,
} from '../../../core/currencyExchange'
import {
  COMMERCIAL_CAPABILITY_CATALOG,
  TEMPLATE_GUIDANCE_BY_ID,
  UNAVAILABLE_OR_EXTRA_ITEMS,
  buildVerifiedFeatureBullets,
  detectUnsupportedPlanClaims,
  generatePlanLimitsLabel,
} from '../../domain/planAssistantCatalog'

const WIZARD_STEPS = [
  { id: 1, title: '1. Plantilla' },
  { id: 2, title: '2. Definir plan' },
  { id: 3, title: '3. Capacidades' },
  { id: 4, title: '4. Límites' },
  { id: 5, title: '5. Precios' },
  { id: 6, title: '6. Vista previa' },
  { id: 7, title: '7. Guardar y publicar' },
] as const

const TEMPLATE_TABS: { id: TemplateKey; label: string }[] = [
  { id: 'restaurant', label: 'Restaurante' },
  { id: 'hamburger', label: 'Restaurante Rápido' },
  { id: 'distribution', label: 'Distribuidora' },
  { id: 'nightclub', label: 'Nightclub & Lounge' },
  { id: 'retail', label: 'Ventas Express' },
]

const OWNER_QUICK_GUIDE = [
  {
    q: '¿Cómo cambio los precios en Bolivianos (Bs)?',
    a: 'Selecciona la plantilla y el plan, ve al Paso 5 (Precios), deja la moneda en BOB, ingresa el monto mensual y el total de 12 meses en Bs. Luego guarda y aprueba comercialmente en el Paso 7.',
  },
  {
    q: '¿Cómo actualizo el tipo de cambio referencial USD?',
    a: 'En el Paso 5 (o en la sección Plantillas), edita el bloque "Tipo de cambio referencial (Bs por 1 USD)" indicando valor, fuente y estado Válido. Solo el propietario puede guardarlo; si no hay tasa válida, el catálogo muestra solo Bs.',
  },
  {
    q: '¿Dónde subo o reemplazo el QR bancario oficial de PACHAX?',
    a: 'En Admin -> Facturación PACHAX -> Métodos oficiales de cobro manual -> botón "Subir imagen del QR" (PNG, JPG o WebP máx. 512 KB). Subir la imagen no activa el cobro automáticamente hasta que habilites el método.',
  },
  {
    q: '¿Cómo creo un plan nuevo sin programar?',
    a: 'Elige la plantilla en el Paso 1, haz clic en "Crear nuevo plan" y sigue los 7 pasos en orden. Usa "Regenerar lista de beneficios" en el Paso 3 y "Autocompletar texto desde límites" en el Paso 4.',
  },
  {
    q: '¿Necesito 3 planes para publicar una plantilla?',
    a: 'No. Basta con 1 plan de pago publicado y aprobado por plantilla para poder comercializarla en la web pública y en el Portal de Suscripción. El límite de 3 planes por plantilla es un máximo.',
  },
  {
    q: '¿Cómo aplico un descuento puntual a un cliente sin cambiar los precios públicos?',
    a: 'Los precios de la lista son base. En Admin -> Facturación PACHAX -> Cotizaciones puedes ajustar importes de esa cotización concreta sin tocar el plan publicado.',
  },
  {
    q: '¿Cómo cobro extras o implementación base aparte?',
    a: 'La implementación única de plantillas especializadas se configura en Plantillas, y los servicios adicionales en Extras. Ambos se combinan luego al emitir una cotización o alta asistida.',
  },
]

function withCapabilityDefaults(plan: TemplateTierPlan): TemplateTierPlan {
  const caps = plan.capabilitiesV1 || defaultCapabilities(plan.templateId, plan.planKind || 'paid')
  return {
    ...plan,
    currency: plan.currency || 'BOB',
    technicalEntitlements: Array.isArray(plan.technicalEntitlements) ? plan.technicalEntitlements : [],
    capabilitiesV1: {
      ...caps,
      limits: { ...caps.limits, activeBranches: 1 },
    },
  }
}

interface PlanWizardEditorProps {
  initialPlan: TemplateTierPlan
  selectedTemplate: TemplateKey
  plansForTemplate: TemplateTierPlan[]
  canApprovePrice: boolean
  isProcessing: boolean
  exchangeRate: PlatformExchangeRateConfig
  onSaveDraft: (draft: TemplateTierPlan) => Promise<void>
  onApproveCommercial: (draft: TemplateTierPlan) => Promise<void>
  onPublishPlan: (draft: TemplateTierPlan) => Promise<void>
  onUnpublishPlan: (planId: string) => Promise<void>
  onDeletePlan: (planId: string) => Promise<void>
}

function PlanWizardEditor({
  initialPlan,
  selectedTemplate,
  plansForTemplate,
  canApprovePrice,
  isProcessing,
  exchangeRate,
  onSaveDraft,
  onApproveCommercial,
  onPublishPlan,
  onUnpublishPlan,
  onDeletePlan,
}: PlanWizardEditorProps) {
  const [step, setStep] = useState<number>(1)
  const [formData, setFormData] = useState<TemplateTierPlan>(() => withCapabilityDefaults(initialPlan))
  const [previewCycle, setPreviewCycle] = useState<'monthly' | 'annual'>('monthly')

  const templateGuidance = TEMPLATE_GUIDANCE_BY_ID[selectedTemplate]
  const claimIssues = detectUnsupportedPlanClaims(formData)
  const caps = formData.capabilitiesV1!
  const isPaid = formData.planKind !== 'free'
  const annualValid =
    formData.annualPriceUnit === 'annual_total_12_months' &&
    Number.isFinite(Number(formData.annualPriceUSD)) &&
    Number(formData.annualPriceUSD) > 0
  const monthlyNum = Number(formData.monthlyPriceUSD || 0)
  const annualNum = Number(formData.annualPriceUSD || 0)
  const monthlyEquivalent = annualValid ? Number((annualNum / 12).toFixed(2)) : null
  const annualSavings = annualValid && monthlyNum > 0 ? Number((monthlyNum * 12 - annualNum).toFixed(2)) : null

  const otherPublishedPaidCount = plansForTemplate.filter(
    (p) => p.id !== formData.id && p.status === 'published' && p.planKind !== 'free',
  ).length

  const pricingReady =
    isPaid &&
    monthlyNum > 0 &&
    annualNum > 0 &&
    formData.annualPriceUnit === 'annual_total_12_months'

  const featureBulletsReady =
    formData.includedFeatures.length > 0 &&
    formData.includedFeatures.every((item) => item.trim().length > 0)

  const canApproveAndPublish =
    canApprovePrice &&
    isPaid &&
    claimIssues.length === 0 &&
    pricingReady &&
    featureBulletsReady

  const updateField = <K extends keyof TemplateTierPlan>(field: K, value: TemplateTierPlan[K]) => {
    setFormData((current) => ({ ...current, [field]: value, priceApproval: 'pending' }))
  }

  const updateLimits = (key: 'activeUsers' | 'activeProducts', rawValue: number) => {
    const max = key === 'activeUsers' ? 100 : 200
    const bounded = Math.max(1, Math.min(max, Math.round(Number.isFinite(rawValue) ? rawValue : 1)))
    setFormData((current) => {
      const nextCaps = {
        ...current.capabilitiesV1!,
        limits: { ...current.capabilitiesV1!.limits, [key]: bounded, activeBranches: 1 },
      }
      return { ...current, priceApproval: 'pending', capabilitiesV1: nextCaps }
    })
  }

  const toggleCapability = (key: typeof COMMERCIAL_CAPABILITY_CATALOG[number]['key'], checked: boolean) => {
    setFormData((current) => {
      const cur = current.capabilitiesV1!
      const nextFeatures = structuredClone(cur.features)
      if (key === 'reports.detailed') nextFeatures.reports.detailed = checked
      if (key === 'reports.export') nextFeatures.reports.export = checked
      if (key === 'receipts.digital') nextFeatures.receipts.digital = checked
      if (key === 'printing.manual') nextFeatures.printing.manual = checked
      if (key === 'printing.kitchenAutomatic') nextFeatures.printing.kitchenAutomatic = checked
      return {
        ...current,
        priceApproval: 'pending',
        capabilitiesV1: { ...cur, features: nextFeatures },
      }
    })
  }

  const isCapabilityChecked = (key: typeof COMMERCIAL_CAPABILITY_CATALOG[number]['key']) => {
    if (key === 'reports.detailed') return caps.features.reports.detailed
    if (key === 'reports.export') return caps.features.reports.export
    if (key === 'receipts.digital') return caps.features.receipts.digital
    if (key === 'printing.manual') return caps.features.printing.manual
    return caps.features.printing.kitchenAutomatic
  }

  const previewAmount =
    previewCycle === 'annual' && annualValid ? annualNum : monthlyNum
  const previewUsdRef =
    formData.currency === 'BOB' && isPaid
      ? formatUsdReferenceText(previewAmount, exchangeRate)
      : null

  return (
    <div className="space-y-6" data-testid="plan-wizard-editor">
      {/* Encabezado del plan seleccionado */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-slate-100">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-base font-extrabold text-slate-900">{formData.name || 'Sin nombre'}</h3>
            <span
              className={`text-[10px] px-2.5 py-0.5 rounded-full font-bold uppercase ${
                formData.status === 'published'
                  ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                  : 'bg-amber-100 text-amber-800 border border-amber-200'
              }`}
            >
              {formData.status === 'published' ? 'Publicado' : 'Borrador'}
            </span>
            <span
              className={`text-[10px] px-2.5 py-0.5 rounded-full font-bold uppercase ${
                formData.priceApproval === 'approved'
                  ? 'bg-blue-100 text-blue-800 border border-blue-200'
                  : 'bg-slate-100 text-slate-700 border border-slate-200'
              }`}
            >
              {formData.priceApproval === 'approved' ? 'Tarifa aprobada' : 'Pendiente de aprobación'}
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Plantilla: <strong>{templateGuidance.label}</strong> · Nivel {formData.tierLevel || 1} · Moneda{' '}
            <strong>{formData.currency}</strong>
          </p>
        </div>

        <button
          type="button"
          onClick={() => void onDeletePlan(formData.id)}
          disabled={isProcessing}
          className="text-xs text-red-600 hover:text-red-700 inline-flex items-center gap-1 font-semibold cursor-pointer px-2.5 py-1.5 rounded-lg hover:bg-red-50 disabled:opacity-50"
        >
          <Trash2 className="w-3.5 h-3.5" />
          <span>Eliminar</span>
        </button>
      </div>

      {/* Navegador de 7 pasos */}
      <nav aria-label="Pasos de configuración del plan" className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-7 gap-1.5">
        {WIZARD_STEPS.map((s) => {
          const active = step === s.id
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => setStep(s.id)}
              data-wizard-step={s.id}
              className={`px-2.5 py-2 rounded-xl text-[11px] font-bold text-left transition-all cursor-pointer border ${
                active
                  ? 'bg-[#0066FF] text-white border-[#0066FF] shadow-xs'
                  : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
              }`}
            >
              {s.title}
            </button>
          )
        })}
      </nav>

      {/* Bloqueo permanente visible si detecta promesas no soportadas */}
      {claimIssues.length > 0 && (
        <div role="alert" className="rounded-xl border border-red-300 bg-red-50 p-3.5 text-xs text-red-900 space-y-1.5">
          <p className="font-bold flex items-center gap-1.5">
            <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
            <span>Promesas no soportadas detectadas (bloquean aprobación y publicación):</span>
          </p>
          <ul className="list-disc pl-5 space-y-0.5">
            {claimIssues.map((issue) => (
              <li key={issue}>{issue}</li>
            ))}
          </ul>
        </div>
      )}

      {/* CONTENIDO DE CADA PASO */}
      {step === 1 && (
        <div className="space-y-4 rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs">
          <h4 className="text-sm font-extrabold text-slate-900">Paso 1 — Plantilla seleccionada</h4>
          <p className="text-slate-700">
            Estás editando un plan para <strong>{templateGuidance.label}</strong> ({templateGuidance.subtitle}).
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="rounded-xl bg-white border border-slate-200 p-3">
              <p className="font-bold text-slate-800">Regla de publicación</p>
              <p className="text-slate-600 mt-1">
                Con <strong>1 solo plan publicado</strong> ya puedes comercializar esta plantilla. El máximo permitido es <strong>3 planes de pago publicados</strong> por plantilla.
              </p>
            </div>
            <div className="rounded-xl bg-white border border-slate-200 p-3">
              <p className="font-bold text-slate-800">Estado en {templateGuidance.label}</p>
              <p className="text-slate-600 mt-1">
                Otros planes publicados actualmente: <strong>{otherPublishedPaidCount} / 3 máx.</strong>
              </p>
            </div>
          </div>
          <p className="text-[11px] text-slate-500">
            Si deseas cambiar de plantilla, usa las pestañas superiores de rubros.
          </p>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-4">
          <h4 className="text-sm font-extrabold text-slate-900">Paso 2 — Definir identidad comercial del plan</h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <label className="text-xs font-bold text-slate-700">
              Nombre comercial del plan
              <input
                type="text"
                maxLength={100}
                value={formData.name}
                onChange={(e) => updateField('name', e.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-900"
              />
            </label>

            <label className="text-xs font-bold text-slate-700">
              Modalidad del plan
              <select
                value={formData.planKind || 'paid'}
                onChange={(e) => {
                  const newKind = e.target.value as 'free' | 'paid'
                  setFormData((current) => ({
                    ...current,
                    planKind: newKind,
                    priceApproval: 'pending',
                    ...(newKind === 'free'
                      ? { monthlyPriceUSD: 0, annualPriceUSD: 0, adsRequired: true, badge: current.badge || 'Gratis con anuncios' }
                      : { tierLevel: current.tierLevel || 1, adsRequired: false }),
                    capabilitiesV1: {
                      ...current.capabilitiesV1!,
                      features: { ...current.capabilitiesV1!.features, adsRequired: newKind === 'free' },
                    },
                  }))
                }}
                className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-900"
              >
                <option value="paid">De Pago (Plan comercial estándar)</option>
                <option value="free">Gratuito (Solo referencia — publicación cerrada)</option>
              </select>
            </label>

            <label className="text-xs font-bold text-slate-700">
              Nivel comercial (Tier 1 a 3)
              <select
                disabled={!isPaid}
                value={formData.tierLevel || 1}
                onChange={(e) => updateField('tierLevel', Number(e.target.value) as 1 | 2 | 3)}
                className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-900 disabled:bg-slate-100"
              >
                <option value={1}>Nivel 1 — Entrada / Básico</option>
                <option value={2}>Nivel 2 — Crecimiento / Recomendado</option>
                <option value={3}>Nivel 3 — Completo (1 sede)</option>
              </select>
            </label>

            <label className="text-xs font-bold text-slate-700">
              Orden de aparición (1 = primero)
              <input
                type="number"
                min={1}
                value={formData.order || 1}
                onChange={(e) => setFormData((c) => ({ ...c, order: Math.max(1, Number(e.target.value)) }))}
                className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-900"
              />
            </label>

            <label className="text-xs font-bold text-slate-700">
              Etiqueta / Badge opcional
              <input
                type="text"
                placeholder="Ej. Más elegido"
                value={formData.badge || ''}
                onChange={(e) => updateField('badge', e.target.value || undefined)}
                className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-900"
              />
            </label>

            <label className="text-xs font-bold text-slate-700">
              Texto del botón CTA
              <input
                type="text"
                value={formData.ctaLabel || 'Elegir Plan'}
                onChange={(e) => updateField('ctaLabel', e.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-900"
              />
            </label>
          </div>

          <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 cursor-pointer">
            <input
              type="checkbox"
              checked={Boolean(formData.isPopular)}
              onChange={(e) => setFormData((c) => ({ ...c, isPopular: e.target.checked }))}
            />
            <span>Destacar visualmente como plan recomendado / popular</span>
          </label>

          <label className="block text-xs font-bold text-slate-700">
            Perfil de cliente ideal (descripción corta en tarjeta)
            <textarea
              rows={2}
              maxLength={500}
              value={formData.clientProfile}
              onChange={(e) => updateField('clientProfile', e.target.value)}
              placeholder="Ej. Restaurantes de 1 sucursal con salón activo y cocina KDS."
              className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-900"
            />
          </label>
        </div>
      )}

      {step === 3 && (
        <div className="space-y-4">
          <h4 className="text-sm font-extrabold text-slate-900">Paso 3 — Capacidades reales vs. no disponibles</h4>

          {/* A. Funciones base */}
          <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-3.5 text-xs space-y-1.5">
            <p className="font-bold text-emerald-950">A. Funciones base de {templateGuidance.label} (siempre incluidas)</p>
            <ul className="space-y-1 text-emerald-900">
              {templateGuidance.baseFeatures.map((feat) => (
                <li key={feat} className="flex items-center gap-1.5">
                  <Check className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
                  <span>{feat}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* B. Capacidades opcionales verificadas (capabilitiesV1) */}
          <div className="rounded-xl border border-slate-200 bg-white p-3.5 space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs font-bold text-slate-800">
                B. Capacidades opcionales verificadas por el servidor (`capabilitiesV1`)
              </p>
              <button
                type="button"
                onClick={() =>
                  setFormData((current) => ({
                    ...current,
                    priceApproval: 'pending',
                    includedFeatures: buildVerifiedFeatureBullets(selectedTemplate, current.capabilitiesV1!),
                  }))
                }
                className="px-3 py-1.5 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-800 text-[11px] font-bold inline-flex items-center gap-1 cursor-pointer"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>Sincronizar viñetas desde capacidades reales</span>
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {COMMERCIAL_CAPABILITY_CATALOG.map((item) => {
                const supported = !item.requiresKitchenTemplate || templateGuidance.supportsKitchenAutoPrint
                const checked = isCapabilityChecked(item.key)
                return (
                  <label
                    key={item.key}
                    className={`flex items-start gap-2 rounded-xl border p-2.5 text-xs ${
                      supported ? 'bg-slate-50 border-slate-200 cursor-pointer' : 'bg-slate-100 border-slate-200 text-slate-400 cursor-not-allowed'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={!supported || !canApprovePrice}
                      onChange={(e) => toggleCapability(item.key, e.target.checked)}
                      className="mt-0.5"
                    />
                    <span>
                      <strong>{item.label}</strong>
                      {!supported && ' (No aplica a esta plantilla)'}
                      <span className="block text-[11px] text-slate-500 mt-0.5">{item.description}</span>
                    </span>
                  </label>
                )
              })}
            </div>
          </div>

          {/* C. No disponible en planes estándar */}
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-3.5 text-xs space-y-1.5">
            <p className="font-bold text-amber-950 flex items-center gap-1.5">
              <Lock className="w-3.5 h-3.5 text-amber-700 shrink-0" />
              <span>C. Funciones NO disponibles en planes estándar (no marcar como incluidas)</span>
            </p>
            <ul className="space-y-1 text-amber-900">
              {UNAVAILABLE_OR_EXTRA_ITEMS.map((item) => (
                <li key={item.label} className="flex flex-wrap items-center justify-between gap-2">
                  <span>• {item.label}</span>
                  <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-white/80 border border-amber-200">
                    {item.category}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          {/* Editor de viñetas visibles en la landing */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                Lista de beneficios visibles en tarjeta pública ({formData.includedFeatures.length})
              </label>
              <button
                type="button"
                onClick={() => updateField('includedFeatures', [...formData.includedFeatures, 'Beneficio operativo verificado'])}
                className="text-xs font-bold text-[#0066FF] hover:underline cursor-pointer"
              >
                + Añadir viñeta
              </button>
            </div>
            <div className="space-y-1.5">
              {formData.includedFeatures.map((feat, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <input
                    type="text"
                    maxLength={180}
                    value={feat}
                    onChange={(e) => {
                      const next = [...formData.includedFeatures]
                      next[idx] = e.target.value
                      updateField('includedFeatures', next)
                    }}
                    className="flex-1 bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-xs text-slate-800"
                  />
                  <button
                    type="button"
                    onClick={() => updateField('includedFeatures', formData.includedFeatures.filter((_, i) => i !== idx))}
                    className="text-slate-400 hover:text-red-600 text-xs px-2 cursor-pointer"
                    aria-label="Eliminar beneficio"
                  >
                    &times;
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {step === 4 && (
        <div className="space-y-4">
          <h4 className="text-sm font-extrabold text-slate-900">Paso 4 — Límites operativos certificados</h4>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <label className="text-xs font-bold text-slate-700">
              Usuarios activos (1 a 100)
              <input
                type="number"
                min={1}
                max={100}
                value={caps.limits.activeUsers}
                onChange={(e) => updateLimits('activeUsers', Number(e.target.value))}
                className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-900"
              />
            </label>

            <label className="text-xs font-bold text-slate-700">
              Productos activos (1 a 200)
              <input
                type="number"
                min={1}
                max={200}
                value={caps.limits.activeProducts}
                onChange={(e) => updateLimits('activeProducts', Number(e.target.value))}
                className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-900"
              />
            </label>

            <label className="text-xs font-bold text-slate-700">
              Sucursales activas (límite V1)
              <input
                type="number"
                readOnly
                disabled
                value={1}
                className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-100 px-3 py-2 text-xs font-bold text-slate-500 cursor-not-allowed"
              />
              <span className="mt-1 block text-[10px] font-normal text-slate-500">
                Multi-sucursal requiere desarrollo a medida.
              </span>
            </label>
          </div>

          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label className="text-xs font-bold text-slate-700">
                Etiqueta resumida de límites (`limitsLabel`)
              </label>
              <button
                type="button"
                onClick={() => updateField('limitsLabel', generatePlanLimitsLabel(caps))}
                className="text-xs font-bold text-[#0066FF] hover:underline cursor-pointer"
              >
                Autocompletar texto desde límites
              </button>
            </div>
            <input
              type="text"
              maxLength={180}
              value={formData.limitsLabel || ''}
              onChange={(e) => updateField('limitsLabel', e.target.value)}
              placeholder={generatePlanLimitsLabel(caps)}
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-900"
            />
          </div>
        </div>
      )}

      {step === 5 && (
        <div className="space-y-5">
          <h4 className="text-sm font-extrabold text-slate-900">Paso 5 — Precios en Bolivianos (Bs) y Referencia USD</h4>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <label className="text-xs font-bold text-slate-700">
              Moneda contractual del plan
              <select
                value={formData.currency}
                onChange={(e) => updateField('currency', e.target.value as 'BOB' | 'USD')}
                className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-900"
              >
                <option value="BOB">Bs (BOB — Principal Bolivia)</option>
                <option value="USD">USD (Legado)</option>
              </select>
            </label>

            <label className="text-xs font-bold text-slate-700">
              Precio mensual ({formData.currency === 'BOB' ? 'Bs' : 'USD'})
              <input
                type="number"
                min={0}
                step="0.01"
                disabled={!isPaid}
                value={isPaid ? formData.monthlyPriceUSD : 0}
                onChange={(e) => updateField('monthlyPriceUSD', Number(e.target.value))}
                className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-900 disabled:bg-slate-100"
              />
              {formData.currency === 'BOB' && isPaid && (
                <span className="mt-1 block text-[11px] font-normal text-slate-500">
                  {formatUsdReferenceText(monthlyNum, exchangeRate) || 'Solo Bs (referencia USD sin tasa válida)'}
                </span>
              )}
            </label>

            <label className="text-xs font-bold text-slate-700">
              Total anual por 12 meses ({formData.currency === 'BOB' ? 'Bs' : 'USD'})
              <input
                type="number"
                min={0}
                step="0.01"
                disabled={!isPaid}
                value={isPaid ? formData.annualPriceUSD : 0}
                onChange={(e) => updateField('annualPriceUSD', Number(e.target.value))}
                className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-900 disabled:bg-slate-100"
              />
              {formData.currency === 'BOB' && isPaid && annualValid && (
                <span className="mt-1 block text-[11px] font-normal text-slate-500">
                  {formatUsdReferenceText(annualNum, exchangeRate) || 'Solo Bs (referencia USD sin tasa válida)'}
                </span>
              )}
            </label>
          </div>

          <label className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-950">
            <input
              type="checkbox"
              checked={formData.annualPriceUnit === 'annual_total_12_months'}
              disabled={!canApprovePrice || !isPaid}
              onChange={(e) =>
                setFormData((current) => ({
                  ...current,
                  annualPriceUnit: e.target.checked ? 'annual_total_12_months' : null,
                  priceApproval: 'pending',
                }))
              }
              className="mt-0.5"
            />
            <span>
              <strong>Confirmación de anualidad (PR #25):</strong> confirmo que el monto anual corresponde al <strong>total completo de 12 meses</strong> en {formData.currency}.
            </span>
          </label>

          {annualValid && monthlyEquivalent !== null && (
            <div className="rounded-xl border border-blue-200 bg-blue-50 p-3 text-xs text-blue-950">
              <p>
                <strong>Equivalente mensual informativo:</strong>{' '}
                {formatPrimaryCommercialAmount(monthlyEquivalent, formData.currency)} / mes
                {annualSavings !== null && annualSavings > 0
                  ? ` (ahorro anual de ${formatPrimaryCommercialAmount(annualSavings, formData.currency)} frente a pagar 12 meses sueltos).`
                  : '.'}
              </p>
            </div>
          )}

          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
            <strong>Implementación, Extras y Descuentos:</strong> La implementación inicial única se edita en la pestaña <strong>Plantillas</strong> y los servicios complementarios en <strong>Extras</strong>. Para aplicar descuentos a un cliente puntual sin alterar estos precios públicos, crea una cotización personalizada desde <strong>Facturación PACHAX</strong>.
          </div>

          <ExchangeRateConfigCard
            compact
            sampleMonthlyBob={formData.currency === 'BOB' && monthlyNum > 0 ? monthlyNum : 340}
            sampleAnnualBob={formData.currency === 'BOB' && annualNum > 0 ? annualNum : 3400}
          />
        </div>
      )}

      {step === 6 && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h4 className="text-sm font-extrabold text-slate-900">Paso 6 — Vista previa exacta para el cliente</h4>
            {annualValid && (
              <div className="inline-flex rounded-xl border border-slate-200 bg-slate-100 p-1 text-xs font-bold">
                <button
                  type="button"
                  onClick={() => setPreviewCycle('monthly')}
                  className={`px-3 py-1 rounded-lg cursor-pointer ${previewCycle === 'monthly' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-600'}`}
                >
                  Mensual
                </button>
                <button
                  type="button"
                  onClick={() => setPreviewCycle('annual')}
                  className={`px-3 py-1 rounded-lg cursor-pointer ${previewCycle === 'annual' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-600'}`}
                >
                  Anual (12 meses)
                </button>
              </div>
            )}
          </div>

          <div className="max-w-md mx-auto rounded-2xl border-2 border-[#0066FF]/30 bg-white p-5 shadow-sm space-y-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <h5 className="text-lg font-black text-slate-900">{formData.name}</h5>
                <p className="text-xs text-slate-600 mt-0.5">{formData.clientProfile}</p>
              </div>
              {formData.badge && (
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase bg-blue-100 text-blue-800">
                  {formData.badge}
                </span>
              )}
            </div>

            {formData.limitsLabel && (
              <p className="text-xs font-semibold text-slate-700 bg-slate-100 px-3 py-1.5 rounded-lg">
                {formData.limitsLabel}
              </p>
            )}

            <div>
              <p className="text-3xl font-black text-slate-950">
                {!isPaid
                  ? 'Gratis'
                  : formatPrimaryCommercialAmount(previewAmount, formData.currency)}
                {isPaid && (
                  <span className="text-sm font-semibold text-slate-500 ml-1">
                    / {previewCycle === 'annual' && annualValid ? 'año' : 'mes'}
                  </span>
                )}
              </p>
              {previewUsdRef && <p className="text-xs text-slate-500 mt-1">{previewUsdRef}</p>}
              {previewCycle === 'annual' && annualValid && monthlyEquivalent !== null && (
                <p className="text-xs text-blue-700 font-medium mt-1">
                  Total por 12 meses. Equivalente informativo: {formatPrimaryCommercialAmount(monthlyEquivalent, formData.currency)}/mes.
                </p>
              )}
            </div>

            <ul className="space-y-1.5 text-xs text-slate-700">
              {formData.includedFeatures.map((feat, idx) => (
                <li key={idx} className="flex items-start gap-2">
                  <Check className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  <span>{feat}</span>
                </li>
              ))}
            </ul>

            <button
              type="button"
              disabled
              className="w-full py-2.5 rounded-xl bg-[#0066FF] text-white text-xs font-bold opacity-90"
            >
              {formData.ctaLabel || 'Elegir Plan'}
            </button>
          </div>
        </div>
      )}

      {step === 7 && (
        <div className="space-y-4">
          <h4 className="text-sm font-extrabold text-slate-900">Paso 7 — Guardar, aprobar y publicar</h4>

          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs space-y-2">
            <p className="font-bold text-slate-800 uppercase tracking-wider text-[11px]">Lista de verificación comercial</p>
            <ul className="space-y-1">
              <li className={pricingReady ? 'text-emerald-800' : 'text-amber-800'}>
                {pricingReady ? '✓' : '○'} Precios mensual y total anual (12 meses) configurados y confirmados ({formData.currency}).
              </li>
              <li className={featureBulletsReady ? 'text-emerald-800' : 'text-amber-800'}>
                {featureBulletsReady ? '✓' : '○'} Lista de beneficios visible completa ({formData.includedFeatures.length} ítems).
              </li>
              <li className={claimIssues.length === 0 ? 'text-emerald-800' : 'text-red-700 font-bold'}>
                {claimIssues.length === 0 ? '✓' : '✕'} Sin promesas no soportadas ni entitlements técnicos obsoletos.
              </li>
              <li className={canApprovePrice ? 'text-emerald-800' : 'text-amber-800'}>
                {canApprovePrice ? '✓' : '○'} Rol propietario (`platform_owner`) requerido para aprobar tarifas o publicar.
              </li>
            </ul>
          </div>

          <div className="flex flex-wrap items-center gap-3 pt-2">
            <button
              type="button"
              disabled={isProcessing}
              onClick={() => void onSaveDraft(formData)}
              className="px-4 py-2.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              {isProcessing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
              <span>Guardar borrador</span>
            </button>

            <button
              type="button"
              disabled={isProcessing || !canApproveAndPublish}
              onClick={() => void onApproveCommercial(formData)}
              className="px-4 py-2.5 rounded-xl border border-blue-300 bg-blue-50 hover:bg-blue-100 text-blue-900 text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>Aprobar comercialmente</span>
            </button>

            <button
              type="button"
              disabled={isProcessing || !canApproveAndPublish}
              onClick={() => void onPublishPlan(formData)}
              className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <Globe className="w-3.5 h-3.5" />
              <span>{formData.status === 'published' ? 'Actualizar publicación en landing' : 'Publicar en landing y portal'}</span>
            </button>

            {formData.status === 'published' && (
              <button
                type="button"
                disabled={isProcessing || !canApprovePrice}
                onClick={() => void onUnpublishPlan(formData.id)}
                className="px-4 py-2.5 rounded-xl border border-amber-300 bg-amber-50 hover:bg-amber-100 text-amber-900 text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <EyeOff className="w-3.5 h-3.5" />
                <span>Despublicar a borrador</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* Botones Anterior / Siguiente */}
      <div className="flex items-center justify-between pt-4 border-t border-slate-100">
        <button
          type="button"
          disabled={step === 1}
          onClick={() => setStep((s) => Math.max(1, s - 1))}
          className="px-3.5 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-xs font-bold text-slate-700 inline-flex items-center gap-1 disabled:opacity-40 cursor-pointer"
        >
          <ChevronLeft className="w-3.5 h-3.5" />
          <span>Paso anterior</span>
        </button>
        <span className="text-[11px] font-semibold text-slate-500">Paso {step} de 7</span>
        <button
          type="button"
          disabled={step === 7}
          onClick={() => setStep((s) => Math.min(7, s + 1))}
          className="px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold inline-flex items-center gap-1 disabled:opacity-40 cursor-pointer"
        >
          <span>Siguiente paso</span>
          <ChevronRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  )
}

export function PlansSection() {
  const { user } = useAdminAuth()
  const canApprovePrice = user?.role === 'platform_owner'
  const { config, exchangeRate, updatePlan, createPlan, deletePlan, togglePublishPlan } = useCommercialConfig()
  const [selectedTemplate, setSelectedTemplate] = useState<TemplateKey>('restaurant')
  const [editingPlanId, setEditingPlanId] = useState<string | null>(null)
  const [showGuide, setShowGuide] = useState(false)
  const [saveFeedback, setSaveFeedback] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [isProcessing, setIsProcessing] = useState(false)

  const plansForTemplate = config.plans.filter((p) => p.templateId === selectedTemplate)
  const activeEditingPlan =
    (editingPlanId ? plansForTemplate.find((p) => p.id === editingPlanId) : undefined) || plansForTemplate[0]

  const publishedFreeCount = plansForTemplate.filter((p) => p.status === 'published' && p.planKind === 'free').length
  const publishedPaidCount = plansForTemplate.filter((p) => p.status === 'published' && p.planKind !== 'free').length

  const handleCreateNew = async () => {
    setIsProcessing(true)
    setSaveFeedback(null)
    setSaveError(null)
    const caps = defaultCapabilities(selectedTemplate, 'paid')
    const newId = `${selectedTemplate}_plan_${Date.now()}`
    const newPlan: TemplateTierPlan = {
      id: newId,
      templateId: selectedTemplate,
      name: 'Nuevo Plan Comercial',
      planKind: 'paid',
      tierLevel: 1,
      monthlyPriceUSD: 0,
      annualPriceUSD: 0,
      annualPriceUnit: 'annual_total_12_months',
      currency: 'BOB',
      billingPeriod: 'monthly',
      clientProfile: `Negocio de ${TEMPLATE_GUIDANCE_BY_ID[selectedTemplate].label} en 1 sucursal.`,
      limitsLabel: generatePlanLimitsLabel(caps),
      includedFeatures: buildVerifiedFeatureBullets(selectedTemplate, caps),
      technicalEntitlements: [],
      capabilitiesV1: caps,
      ctaLabel: 'Elegir Plan',
      status: 'draft',
      priceApproval: 'pending',
      order: plansForTemplate.length + 1,
    }
    const res = await createPlan(newPlan)
    setIsProcessing(false)
    if (res.success) {
      setEditingPlanId(newId)
      setSaveFeedback('Nuevo plan creado en borrador (Bs) en Firestore.')
    } else {
      setSaveError(res.error || 'Error al crear el nuevo plan en Firestore.')
    }
  }

  const handleSaveDraft = async (draft: TemplateTierPlan) => {
    setIsProcessing(true)
    setSaveFeedback(null)
    setSaveError(null)
    const res = await updatePlan(draft.id, {
      ...draft,
      status: 'draft',
      priceApproval: 'pending',
      technicalEntitlements: [],
    })
    setIsProcessing(false)
    if (res.success) {
      setSaveFeedback(`Borrador "${draft.name}" guardado correctamente en Firestore.`)
    } else {
      setSaveError(res.error || 'No se pudo guardar el borrador.')
    }
  }

  const handleApproveCommercial = async (draft: TemplateTierPlan) => {
    const issues = detectUnsupportedPlanClaims(draft)
    if (issues.length > 0) {
      setSaveError(issues[0])
      return
    }
    setIsProcessing(true)
    setSaveFeedback(null)
    setSaveError(null)
    const res = await updatePlan(draft.id, {
      ...draft,
      priceApproval: 'approved',
      annualPriceUnit: 'annual_total_12_months',
      technicalEntitlements: [],
    })
    setIsProcessing(false)
    if (res.success) {
      setSaveFeedback(`Tarifa comercial de "${draft.name}" aprobada y guardada en Firestore.`)
    } else {
      setSaveError(res.error || 'No se pudo aprobar la tarifa del plan.')
    }
  }

  const handlePublishPlan = async (draft: TemplateTierPlan) => {
    const issues = detectUnsupportedPlanClaims(draft)
    if (issues.length > 0) {
      setSaveError(issues[0])
      return
    }
    if (!window.confirm(`¿Confirmas publicar "${draft.name}" (${formatPrimaryCommercialAmount(draft.monthlyPriceUSD, draft.currency)}/mes) en la landing y portal de suscripción?`)) {
      return
    }
    setIsProcessing(true)
    setSaveFeedback(null)
    setSaveError(null)
    const res = await updatePlan(draft.id, {
      ...draft,
      status: 'published',
      priceApproval: 'approved',
      annualPriceUnit: 'annual_total_12_months',
      technicalEntitlements: [],
    })
    setIsProcessing(false)
    if (res.success) {
      setSaveFeedback(`¡Plan "${draft.name}" aprobado y publicado en la landing y portal!`)
    } else {
      setSaveError(res.error || 'No se pudo publicar el plan en el servidor.')
    }
  }

  const handleUnpublishPlan = async (planId: string) => {
    setIsProcessing(true)
    setSaveFeedback(null)
    setSaveError(null)
    const res = await togglePublishPlan(planId, 'draft')
    setIsProcessing(false)
    if (res.success) {
      setSaveFeedback('Plan despublicado a borrador correctamente.')
    } else {
      setSaveError(res.error || 'No se pudo despublicar el plan.')
    }
  }

  const handleDeletePlan = async (planId: string) => {
    if (!window.confirm('¿Eliminar este plan comercial de Firestore?')) return
    setIsProcessing(true)
    setSaveFeedback(null)
    setSaveError(null)
    const res = await deletePlan(planId)
    setIsProcessing(false)
    if (res.success) {
      setEditingPlanId(null)
      setSaveFeedback('Plan eliminado correctamente.')
    } else {
      setSaveError(res.error || 'No se pudo eliminar el plan en Firestore.')
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-5 border-b border-slate-200">
        <div>
          <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
            Asistente Guiado de Planes Comerciales
          </h2>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Configura planes paso a paso en Bolivianos (Bs), valida capacidades reales y publica solo ofertas aprobadas.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setShowGuide((v) => !v)}
            className="px-3.5 py-2.5 rounded-xl text-xs font-bold border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 inline-flex items-center gap-1.5 cursor-pointer"
          >
            <BookOpen className="w-4 h-4 text-[#0066FF]" />
            <span>Guía del propietario</span>
            {showGuide ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>

          <button
            type="button"
            onClick={() => void handleCreateNew()}
            disabled={isProcessing}
            className="px-4 py-2.5 rounded-xl text-xs font-bold bg-[#0066FF] hover:bg-[#0052cc] disabled:bg-blue-300 text-white shadow-xs inline-flex items-center gap-1.5 transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Crear nuevo plan</span>
          </button>
        </div>
      </div>

      {showGuide && (
        <section className="rounded-2xl border border-blue-200 bg-blue-50/70 p-4 sm:p-5 space-y-3">
          <h3 className="text-sm font-extrabold text-slate-900">Guía práctica rápida del propietario (sin programar)</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {OWNER_QUICK_GUIDE.map((item) => (
              <div key={item.q} className="rounded-xl border border-blue-100 bg-white p-3 text-xs space-y-1">
                <p className="font-bold text-slate-900">{item.q}</p>
                <p className="text-slate-600">{item.a}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Selector de plantilla */}
      <div className="flex flex-wrap gap-2 p-1.5 bg-slate-100 rounded-2xl border border-slate-200/80">
        {TEMPLATE_TABS.map((tab) => {
          const isActive = selectedTemplate === tab.id
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => {
                setSelectedTemplate(tab.id)
                setEditingPlanId(null)
                setSaveFeedback(null)
                setSaveError(null)
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
        <div role="status" className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs font-semibold flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{saveFeedback}</span>
        </div>
      )}

      {saveError && (
        <div role="alert" className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-red-900 text-xs font-semibold flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
          <span>{saveError}</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Lista izquierda de planes */}
        <div className="lg:col-span-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
              Planes ({plansForTemplate.length})
            </span>
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-slate-100 text-slate-700 border border-slate-200">
                Gratis: {publishedFreeCount}/1
              </span>
              <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-blue-50 text-blue-700 border border-blue-200">
                Pagos: {publishedPaidCount}/3
              </span>
            </div>
          </div>

          {plansForTemplate.map((p) => {
            const isSelected = activeEditingPlan?.id === p.id
            const usdText = p.currency === 'BOB' ? formatUsdReferenceText(p.monthlyPriceUSD, exchangeRate) : null
            return (
              <div
                key={p.id}
                onClick={() => {
                  setEditingPlanId(p.id)
                  setSaveFeedback(null)
                  setSaveError(null)
                }}
                className={`p-4 rounded-2xl border transition-all cursor-pointer ${
                  isSelected
                    ? 'bg-white border-[#0066FF] shadow-sm ring-2 ring-blue-500/10'
                    : 'bg-white border-slate-200/80 hover:border-slate-300'
                }`}
              >
                <div className="flex items-center justify-between gap-2 mb-1">
                  <h4 className="text-sm font-extrabold text-slate-900 truncate">{p.name}</h4>
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
                <p className="text-lg font-black text-slate-900">
                  {p.planKind === 'free' ? 'Gratis' : formatPrimaryCommercialAmount(p.monthlyPriceUSD, p.currency)}
                  <span className="text-xs font-normal text-slate-500 ml-1">/ mes</span>
                </p>
                {usdText && <p className="text-[11px] text-slate-500">{usdText}</p>}
                <p className="text-xs text-slate-500 line-clamp-1 mt-1">{p.clientProfile}</p>
              </div>
            )
          })}
        </div>

        {/* Asistente derecho */}
        <div className="lg:col-span-8 bg-white rounded-2xl p-5 sm:p-6 border border-slate-200/90 shadow-2xs">
          {activeEditingPlan ? (
            <PlanWizardEditor
              key={`${activeEditingPlan.id}-${activeEditingPlan.revision ?? 0}`}
              initialPlan={activeEditingPlan}
              selectedTemplate={selectedTemplate}
              plansForTemplate={plansForTemplate}
              canApprovePrice={canApprovePrice}
              isProcessing={isProcessing}
              exchangeRate={exchangeRate}
              onSaveDraft={handleSaveDraft}
              onApproveCommercial={handleApproveCommercial}
              onPublishPlan={handlePublishPlan}
              onUnpublishPlan={handleUnpublishPlan}
              onDeletePlan={handleDeletePlan}
            />
          ) : (
            <div className="text-center py-12 text-slate-400 text-xs">
              Selecciona o crea un plan para comenzar la configuración guiada.
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
