import { useState } from 'react'
import {
  Truck,
  Utensils,
  Music2,
  Store,
  ArrowRight,
  ArrowLeft,
  Check,
  Building2,
  Palette,
  ShieldCheck,
  AlertCircle,
  Loader2,
  Sparkles,
} from 'lucide-react'
import { BrandMark } from '../public/components/BrandMark'
import { gateway } from '../services/gateway'
import type { BusinessType } from '../core/platform'
import { isTemplateProvisioningAvailable, PUBLIC_TENANT_SELF_SERVICE_CREATION_ENABLED } from '../core/publicTemplates'
import { DISTRIBUTION_PROFILES } from '../modules/distribution/domain/catalog'
import type { DistributionIndustryProfile } from '../modules/distribution/types'
import { BRAND_PALETTES, type BrandPalette } from '../core/brandPalettes'
import { onboardingErrorMessage } from '../core/onboardingErrorMessage'
import { readableForeground } from '../lib/tenantTheme'

interface OnboardingWizardProps {
  userEmail: string | null
  userDisplayName: string | null
  existingTenantsCount: number
  onSuccess: (newTenantId: string) => Promise<void>
  onCancel?: () => void
  onSignOut: () => Promise<void>
}

interface TemplateOption {
  type: BusinessType
  title: string
  subtitle: string
  icon: typeof Truck
  status: 'available' | 'coming_soon'
  badge: string
}

const AVAILABLE_TEMPLATES: TemplateOption[] = [
  {
    type: 'route_distribution',
    title: 'Producción y Distribución',
    subtitle: 'Rutas móviles, despachos, ventas, inventario por lotes y cobranza de créditos.',
    icon: Truck,
    status: isTemplateProvisioningAvailable('route_distribution') ? 'available' : 'coming_soon',
    badge: isTemplateProvisioningAvailable('route_distribution') ? 'Disponible' : 'Próximamente',
  },
  {
    type: 'restaurant_pos',
    title: 'Restaurante con salón',
    subtitle: 'Mesas, comandas, cocina, cuentas abiertas, caja y servicio de atención en salón.',
    icon: Utensils,
    status: isTemplateProvisioningAvailable('restaurant_pos') ? 'available' : 'coming_soon',
    badge: isTemplateProvisioningAvailable('restaurant_pos') ? 'Disponible' : 'Próximamente',
  },
  {
    type: 'hamburger_shop',
    title: 'Restaurante servicio rápido',
    subtitle: 'Mostrador, pedidos rápidos de cocina, para llevar y delivery.',
    icon: Utensils,
    status: isTemplateProvisioningAvailable('hamburger_shop') ? 'available' : 'coming_soon',
    badge: isTemplateProvisioningAvailable('hamburger_shop') ? 'Disponible' : 'Próximamente',
  },
  {
    type: 'nightclub_lounge',
    title: 'Club nocturno / Lounge',
    subtitle: 'Mesas, barra, rondas de consumo, cuentas abiertas y control nocturno.',
    icon: Music2,
    status: isTemplateProvisioningAvailable('nightclub_lounge') ? 'available' : 'coming_soon',
    badge: isTemplateProvisioningAvailable('nightclub_lounge') ? 'Disponible' : 'Próximamente',
  },
  {
    type: 'gelateria_weight_cafe',
    title: 'Comercio / Venta rápida',
    subtitle: 'Venta por peso y unidad de mostrador con caja e inventario.',
    icon: Store,
    status: isTemplateProvisioningAvailable('gelateria_weight_cafe') ? 'available' : 'coming_soon',
    badge: isTemplateProvisioningAvailable('gelateria_weight_cafe') ? 'Disponible' : 'Próximamente',
  },
]

export function OnboardingWizard({
  userEmail,
  userDisplayName,
  existingTenantsCount,
  onSuccess,
  onCancel,
  onSignOut,
}: OnboardingWizardProps) {
  // Step 1: Info Empresa, Step 2: Plantilla, Step 3: Configuración, Step 4: Confirmación
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1)

  // Form State
  const [companyName, setCompanyName] = useState('')
  const [phone, setPhone] = useState('')
  const [city, setCity] = useState('')
  const [selectedTemplate, setSelectedTemplate] = useState<BusinessType>('route_distribution')
  const [industryProfile, setIndustryProfile] = useState<DistributionIndustryProfile>('mixed')
  const [selectedPalette, setSelectedPalette] = useState<BrandPalette>(BRAND_PALETTES[0])

  // Submission & Idempotency
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [requestId] = useState(() => `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`)

  const isFirstTenant = existingTenantsCount === 0

  const handleNextStep1 = (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = companyName.trim()
    if (trimmed.length < 2 || trimmed.length > 100) {
      setError('El nombre comercial debe tener entre 2 y 100 caracteres.')
      return
    }
    setError(null)
    setStep(2)
  }

  const handleNextStep2 = () => {
    if (!isTemplateProvisioningAvailable(selectedTemplate)) {
      setError('La plantilla seleccionada está en proceso de consolidación. Selecciona una plantilla disponible.')
      return
    }
    setError(null)
    setStep(3)
  }

  const handleNextStep3 = () => {
    setError(null)
    setStep(4)
  }

  const handleCreateTenant = async () => {
    if (isSubmitting) return
    if (!PUBLIC_TENANT_SELF_SERVICE_CREATION_ENABLED) {
      setError('La creación autónoma de empresas está pausada. Contacta a PACHAX para coordinar una implementación asistida.')
      return
    }
    if (!isTemplateProvisioningAvailable(selectedTemplate)) {
      setError('La plantilla seleccionada no está disponible para creación de empresas en este momento.')
      return
    }
    setError(null)
    setIsSubmitting(true)

    try {
      const trimmedName = companyName.trim()
      let createdTenantId: string

      if (isFirstTenant) {
        // completeOnboarding exige únicamente estos campos canónicos
        const res = await gateway<{ tenantId: string }>('tenantGateway', {
          action: 'completeOnboarding',
          requestId,
          companyName: trimmedName,
          businessType: selectedTemplate,
          ...(selectedTemplate === 'route_distribution' ? { industryProfile } : {}),
          branding: {
            primary: selectedPalette.primary,
            accent: selectedPalette.accent,
          },
        })
        createdTenantId = res.tenantId
      } else {
        // Usuario con empresas existentes: invocar createTenant de tenants.cjs
        const res = await gateway<{ tenantId: string }>('tenantGateway', {
          action: 'createTenant',
          operationId: requestId,
          name: trimmedName,
          businessType: selectedTemplate,
          ...(selectedTemplate === 'route_distribution' ? { industryProfile } : {}),
          branding: {
            primary: selectedPalette.primary,
            accent: selectedPalette.accent,
          },
          businessIdentity: {
            tradeName: trimmedName,
            phone: phone.trim(),
            city: city.trim(),
            email: userEmail || '',
          },
        })
        createdTenantId = res.tenantId
      }

      await onSuccess(createdTenantId)
    } catch (err: unknown) {
      setIsSubmitting(false)
      setError(onboardingErrorMessage(err))
    }
  }

  const selectedTemplateObj = AVAILABLE_TEMPLATES.find(t => t.type === selectedTemplate)

  if (!PUBLIC_TENANT_SELF_SERVICE_CREATION_ENABLED) {
    return (
      <main className="min-h-screen bg-[#FAF9F6] px-5 py-16 font-sans text-slate-900">
        <section className="mx-auto max-w-xl rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-sm sm:p-10">
          <BrandMark size="md" href="/platform" />
          <h1 className="mt-8 text-2xl font-semibold">Creación de empresas pausada</h1>
          <p className="mt-3 text-sm leading-6 text-slate-600">
            Tus empresas existentes y sus operaciones no cambian. Para activar una empresa nueva, coordina una implementación asistida con PACHAX.
          </p>
          <div className="mt-7 flex flex-col justify-center gap-3 sm:flex-row">
            <a className="rounded-xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white" href="mailto:pachax.bo@gmail.com">Contactar a PACHAX</a>
            <button className="rounded-xl border border-slate-300 px-5 py-3 text-sm font-semibold text-slate-700" onClick={onSignOut} type="button">Cerrar sesión</button>
            {onCancel && <button className="rounded-xl border border-slate-300 px-5 py-3 text-sm font-semibold text-slate-700" onClick={onCancel} type="button">Volver</button>}
          </div>
        </section>
      </main>
    )
  }

  return (
    <div className="min-h-screen bg-[#FAF9F6] flex flex-col font-sans selection:bg-[#0066FF] selection:text-white">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-200">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <BrandMark size="md" href="/platform" />

          <div className="flex items-center gap-3">
            <span className="hidden sm:inline text-xs text-slate-500">
              {userDisplayName ? `${userDisplayName} (${userEmail || ''})` : userEmail || ''}
            </span>
            {onCancel && (
              <button
                type="button"
                onClick={onCancel}
                className="px-3 py-1.5 text-xs font-medium text-slate-700 hover:text-slate-950 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer"
              >
                Volver
              </button>
            )}
            <button
              type="button"
              onClick={onSignOut}
              className="px-3 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 transition-colors cursor-pointer"
            >
              Cerrar sesión
            </button>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-4xl w-full mx-auto px-4 sm:px-6 py-8 sm:py-12 flex flex-col justify-center">
        {/* Progress Bar */}
        <div className="mb-8">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-500 mb-2">
            <span className={step >= 1 ? 'text-[#0066FF]' : ''}>1. Datos básicos</span>
            <span className={step >= 2 ? 'text-[#0066FF]' : ''}>2. Plantilla</span>
            <span className={step >= 3 ? 'text-[#0066FF]' : ''}>3. Personalización</span>
            <span className={step >= 4 ? 'text-[#0066FF]' : ''}>4. Confirmación</span>
          </div>
          <div className="w-full h-1.5 bg-slate-200 rounded-full overflow-hidden">
            <div
              className="h-full bg-[#0066FF] transition-all duration-300 rounded-full"
              style={{ width: `${(step / 4) * 100}%` }}
            />
          </div>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl text-red-800 text-sm flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold">Atención</p>
              <p className="mt-0.5">{error}</p>
            </div>
          </div>
        )}

        {/* Step 1: Info básica */}
        {step === 1 && (
          <div className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-8 shadow-xs">
            <div className="max-w-xl">
              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-blue-50 text-blue-700 text-xs font-semibold mb-3">
                <Building2 className="w-3.5 h-3.5" />
                Paso 1 de 4
              </div>
              <h2 className="text-xl sm:text-2xl font-bold text-slate-900">
                {isFirstTenant ? 'Configura tu primera empresa' : 'Registra una nueva empresa'}
              </h2>
              <p className="mt-1 text-sm text-slate-600">
                Ingresa los datos comerciales con los que operará tu sistema.
              </p>

              <form onSubmit={handleNextStep1} className="mt-6 space-y-4">
                <div>
                  <label htmlFor="companyName" className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                    Nombre comercial de la empresa <span className="text-red-500">*</span>
                  </label>
                  <input
                    id="companyName"
                    type="text"
                    required
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
                    placeholder="Ej. Distribuidora Los Andes"
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-300 focus:outline-hidden focus:ring-2 focus:ring-[#0066FF] text-slate-900 text-sm font-medium"
                    autoFocus
                  />
                  <p className="mt-1 text-xs text-slate-500">
                    Nombre público con el que se emitirán notas, comandas o reportes.
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="phone" className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                      Teléfono / WhatsApp (opcional)
                    </label>
                    <input
                      id="phone"
                      type="tel"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="Ej. 70001234"
                      className="w-full px-4 py-2.5 rounded-xl border border-slate-300 focus:outline-hidden focus:ring-2 focus:ring-[#0066FF] text-slate-900 text-sm"
                    />
                  </div>

                  <div>
                    <label htmlFor="city" className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                      Ciudad (opcional)
                    </label>
                    <input
                      id="city"
                      type="text"
                      value={city}
                      onChange={(e) => setCity(e.target.value)}
                      placeholder="Ej. Santa Cruz, La Paz"
                      className="w-full px-4 py-2.5 rounded-xl border border-slate-300 focus:outline-hidden focus:ring-2 focus:ring-[#0066FF] text-slate-900 text-sm"
                    />
                  </div>
                </div>

                <div className="pt-4 flex items-center justify-end">
                  <button
                    type="submit"
                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white bg-slate-900 hover:bg-[#0066FF] transition-colors shadow-xs cursor-pointer"
                  >
                    <span>Continuar</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Step 2: Elegir plantilla */}
        {step === 2 && (
          <div className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-8 shadow-xs">
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-blue-50 text-blue-700 text-xs font-semibold mb-3">
              <Truck className="w-3.5 h-3.5" />
              Paso 2 de 4
            </div>
            <h2 className="text-xl sm:text-2xl font-bold text-slate-900">
              Selecciona el modelo de negocio
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              Cada plantilla viene preconfigurada con módulos, roles operativos y flujos específicos.
            </p>

            <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
              {AVAILABLE_TEMPLATES.map((tmpl) => {
                const Icon = tmpl.icon
                const isSelected = selectedTemplate === tmpl.type
                const isAvailable = tmpl.status === 'available'

                return (
                  <div
                    key={tmpl.type}
                    onClick={() => isAvailable && setSelectedTemplate(tmpl.type)}
                    className={`relative rounded-xl border p-4 transition-all duration-150 flex flex-col justify-between ${
                      isSelected
                        ? 'border-[#0066FF] ring-2 ring-[#0066FF]/10 bg-blue-50/20'
                        : isAvailable
                        ? 'border-slate-200 hover:border-slate-300 bg-white cursor-pointer'
                        : 'border-slate-200 bg-slate-50/60 opacity-60 cursor-not-allowed'
                    }`}
                  >
                    <div>
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div
                          className={`w-9 h-9 rounded-lg flex items-center justify-center ${
                            isSelected
                              ? 'bg-[#0066FF] text-white'
                              : 'bg-slate-100 text-slate-700'
                          }`}
                        >
                          <Icon className="w-4 h-4" />
                        </div>

                        <span
                          className={`text-[11px] font-semibold px-2 py-0.5 rounded-md border ${
                            isAvailable
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                              : 'bg-slate-100 text-slate-600 border-slate-200'
                          }`}
                        >
                          {tmpl.badge}
                        </span>
                      </div>

                      <h3 className="text-sm font-bold text-slate-900 leading-snug">
                        {tmpl.title}
                      </h3>
                      <p className="mt-1 text-xs text-slate-600 leading-relaxed">
                        {tmpl.subtitle}
                      </p>
                    </div>

                    {isSelected && (
                      <div className="mt-3 pt-2 border-t border-blue-100 flex items-center gap-1.5 text-xs font-semibold text-[#0066FF]">
                        <Check className="w-3.5 h-3.5" />
                        <span>Seleccionada</span>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>

            <div className="mt-8 pt-4 border-t border-slate-100 flex items-center justify-between">
              <button
                type="button"
                onClick={() => setStep(1)}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Atrás</span>
              </button>

              <button
                type="button"
                onClick={handleNextStep2}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white bg-slate-900 hover:bg-[#0066FF] transition-colors shadow-xs cursor-pointer"
              >
                <span>Continuar</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Personalización */}
        {step === 3 && (
          <div className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-8 shadow-xs">
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-blue-50 text-blue-700 text-xs font-semibold mb-3">
              <Palette className="w-3.5 h-3.5" />
              Paso 3 de 4
            </div>
            <h2 className="text-xl sm:text-2xl font-bold text-slate-900">
              Personalización inicial
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              Elige los colores de identidad para tu interfaz y notas de venta.
            </p>

            <div className="mt-6 space-y-6">
              {selectedTemplate === 'route_distribution' && (
                <div>
                  <label htmlFor="distribution-industry-profile" className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-2">
                    ¿Qué tipo de productos distribuye tu empresa?
                  </label>
                  <select
                    id="distribution-industry-profile"
                    value={industryProfile}
                    onChange={event => setIndustryProfile(event.target.value as DistributionIndustryProfile)}
                    className="w-full rounded-xl border border-slate-300 bg-white px-3 py-3 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
                  >
                    {DISTRIBUTION_PROFILES.map(profile => <option key={profile.id} value={profile.id}>{profile.label}</option>)}
                  </select>
                  <p className="mt-1 text-xs text-slate-500">Esto sugiere categorías iniciales; puedes vender otros productos y cambiar el rubro luego.</p>
                </div>
              )}
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-2">
                  Paleta de color de marca
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {BRAND_PALETTES.map((palette) => {
                    const isSelected = selectedPalette.id === palette.id
                    return (
                      <button
                        type="button"
                        aria-pressed={isSelected}
                        key={palette.id}
                        onClick={() => setSelectedPalette(palette)}
                        className={`p-3.5 rounded-xl border flex items-center justify-between cursor-pointer transition-all ${
                          isSelected
                            ? 'border-[#0066FF] ring-2 ring-[#0066FF]/10 bg-blue-50/20'
                            : 'border-slate-200 hover:border-slate-300'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <div className="flex -space-x-1">
                            <span
                              className="w-6 h-6 rounded-full border-2 border-white shadow-xs inline-block"
                              style={{ backgroundColor: palette.primary }}
                            />
                            <span
                              className="w-6 h-6 rounded-full border-2 border-white shadow-xs inline-block"
                              style={{ backgroundColor: palette.accent }}
                            />
                          </div>
                          <span className="text-sm font-semibold text-slate-900">
                            {palette.name}
                          </span>
                        </div>

                        {isSelected && <Check className="w-4 h-4 text-[#0066FF]" />}
                      </button>
                    )
                  })}
                </div>
              </div>

              <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl">
                <span className="text-xs font-semibold text-slate-800 uppercase tracking-wider block mb-1">
                  Configuración regional predeterminada
                </span>
                <p className="text-xs text-slate-600">
                  Moneda: <strong>Bolivianos (BOB / Bs)</strong> • Zona horaria: <strong>America/La Paz (GMT-4)</strong>. Podrás ajustar decimales e impuestos más adelante desde la sección de Configuración.
                </p>
              </div>
            </div>

            <div className="mt-8 pt-4 border-t border-slate-100 flex items-center justify-between">
              <button
                type="button"
                onClick={() => setStep(2)}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Atrás</span>
              </button>

              <button
                type="button"
                onClick={handleNextStep3}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white bg-slate-900 hover:bg-[#0066FF] transition-colors shadow-xs cursor-pointer"
              >
                <span>Continuar</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* Step 4: Confirmación y creación */}
        {step === 4 && (
          <div className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-8 shadow-xs">
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-emerald-50 text-emerald-700 text-xs font-semibold mb-3">
              <Sparkles className="w-3.5 h-3.5" />
              Paso 4 de 4: Confirmación
            </div>
            <h2 className="text-xl sm:text-2xl font-bold text-slate-900">
              Listo para crear tu espacio
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              Revisa los datos de tu nueva empresa antes de iniciar la configuración automática.
            </p>

            <div className="mt-6 p-5 bg-slate-50 rounded-xl border border-slate-200 space-y-3">
              <div className="flex items-center justify-between py-1 border-b border-slate-200/80">
                <span className="text-xs font-medium text-slate-500">Nombre comercial:</span>
                <span className="text-sm font-bold text-slate-900">{companyName}</span>
              </div>

              {selectedTemplate === 'route_distribution' && (
                <div className="flex items-center justify-between py-1 border-b border-slate-200/80">
                  <span className="text-xs font-medium text-slate-500">Rubro de distribución:</span>
                  <span className="text-sm font-semibold text-slate-900">{DISTRIBUTION_PROFILES.find(profile => profile.id === industryProfile)?.label}</span>
                </div>
              )}

              <div className="flex items-center justify-between py-1 border-b border-slate-200/80">
                <span className="text-xs font-medium text-slate-500">Modelo de negocio:</span>
                <span className="text-sm font-semibold text-slate-900">
                  {selectedTemplateObj?.title}
                </span>
              </div>

              <div className="flex items-center justify-between py-1 border-b border-slate-200/80">
                <span className="text-xs font-medium text-slate-500">Identidad visual:</span>
                <div className="flex items-center gap-2">
                  <span
                    className="w-4 h-4 rounded-full border border-slate-300"
                    style={{ backgroundColor: selectedPalette.primary, color: readableForeground(selectedPalette.primary) }}
                  />
                  <span className="text-xs font-medium text-slate-700">
                    {selectedPalette.name}
                  </span>
                  <span
                    className="rounded-full px-2 py-0.5 text-[10px] font-semibold"
                    style={{ backgroundColor: selectedPalette.accent, color: readableForeground(selectedPalette.accent) }}
                  >
                    Vista previa
                  </span>
                </div>
              </div>

              <div className="flex items-center justify-between py-1">
                <span className="text-xs font-medium text-slate-500">Rol asignado:</span>
                <div className="flex items-center gap-1 text-emerald-700 text-xs font-semibold">
                  <ShieldCheck className="w-4 h-4" />
                  <span>Dueño (Propietario)</span>
                </div>
              </div>
            </div>

            <div className="mt-8 pt-4 border-t border-slate-100 flex items-center justify-between">
              <button
                type="button"
                disabled={isSubmitting}
                onClick={() => setStep(3)}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold text-slate-700 hover:bg-slate-100 transition-colors disabled:opacity-50 cursor-pointer"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Atrás</span>
              </button>

              <button
                type="button"
                disabled={isSubmitting}
                onClick={handleCreateTenant}
                className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-semibold text-white bg-[#0066FF] hover:bg-blue-700 transition-all shadow-md disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Creando empresa y permisos...</span>
                  </>
                ) : (
                  <>
                    <span>Confirmar y comenzar</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
