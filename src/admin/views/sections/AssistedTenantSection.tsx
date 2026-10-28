import { useEffect, useState } from 'react'
import { AlertCircle, Building2, CheckCircle2, ClipboardCopy, LoaderCircle, ShieldCheck } from 'lucide-react'
import { gateway } from '../../../services/gateway'

interface ProvisionableTemplate {
  businessType: string
  name: string
  description: string
  version: number
}

interface AssistedTenantResult {
  success: true
  tenantId: string
  businessType: string
  ownerUid: string
  ownerAccess: {
    method: 'one_time_password_setup' | 'existing_account'
    setupLink: string | null
    setupLinkPending: boolean
    accountDisabled?: boolean
  }
}

const INDUSTRY_PROFILES = [
  ['food', 'Alimentos'], ['beverages', 'Bebidas'], ['cleaning', 'Limpieza'],
  ['hardware', 'Ferretería'], ['pharmacy', 'Farmacia'], ['pets', 'Mascotas'],
  ['stationery', 'Papelería'], ['spare_parts', 'Repuestos'], ['mixed', 'Mixta'],
] as const

function errorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : ''
  return message.replace(/^FirebaseError:\s*/i, '').trim() || 'No se pudo completar el alta. Reintenta con la misma operación.'
}

export function AssistedTenantSection() {
  const [templates, setTemplates] = useState<ProvisionableTemplate[]>([])
  const [loadingTemplates, setLoadingTemplates] = useState(true)
  const [templateError, setTemplateError] = useState<string | null>(null)
  const [companyName, setCompanyName] = useState('')
  const [businessType, setBusinessType] = useState('')
  const [ownerName, setOwnerName] = useState('')
  const [ownerEmail, setOwnerEmail] = useState('')
  const [legalName, setLegalName] = useState('')
  const [phone, setPhone] = useState('')
  const [city, setCity] = useState('')
  const [taxId, setTaxId] = useState('')
  const [industryProfile, setIndustryProfile] = useState('mixed')
  const [ownerEmailConfirmed, setOwnerEmailConfirmed] = useState(false)
  const [saving, setSaving] = useState(false)
  const [result, setResult] = useState<AssistedTenantResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [operationId, setOperationId] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    void gateway<{ templates: ProvisionableTemplate[] }>('platformGateway', { action: 'listAssistedTenantTemplates' })
      .then(response => {
        if (!active) return
        if (!response || !Array.isArray(response.templates)) throw new Error('La pasarela no devolvió las plantillas disponibles.')
        setTemplates(response.templates)
        setBusinessType(current => current || response.templates[0]?.businessType || '')
      })
      .catch(reason => { if (active) setTemplateError(errorMessage(reason)) })
      .finally(() => { if (active) setLoadingTemplates(false) })
    return () => { active = false }
  }, [])

  const selectedTemplate = templates.find(template => template.businessType === businessType)
  const isDistribution = businessType === 'route_distribution'
  const retryLocked = operationId !== null

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!ownerEmailConfirmed || saving) return
    setSaving(true)
    setError(null)
    setResult(null)
    const currentOperationId = operationId ?? crypto.randomUUID()
    setOperationId(currentOperationId)
    try {
      const response = await gateway<AssistedTenantResult>('platformGateway', {
        action: 'createAssistedTenant',
        operationId: currentOperationId,
        companyName,
        businessType,
        ownerEmail,
        ownerDisplayName: ownerName,
        ownerEmailConfirmed: true,
        ...(isDistribution ? { industryProfile } : {}),
        currency: 'BOB',
        currencySymbol: 'Bs',
        timezone: 'America/La_Paz',
        businessIdentity: { legalName, phone, city, taxId },
      })
      if (!response?.success || !response.tenantId) throw new Error('La empresa todavía no fue confirmada por el servidor. Reintenta la misma operación.')
      setResult(response)
      setOperationId(null)
    } catch (reason) {
      setError(errorMessage(reason))
    } finally {
      setSaving(false)
    }
  }

  const handleCopySetupLink = async () => {
    if (!result?.ownerAccess.setupLink) return
    try {
      await navigator.clipboard.writeText(result.ownerAccess.setupLink)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2500)
    } catch {
      setError('El navegador no permitió copiar el enlace. Selecciónalo y cópialo manualmente para entregarlo al propietario por un canal verificado.')
    }
  }

  const inputClass = 'mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:bg-slate-100'

  return (
    <section className="mx-auto max-w-4xl space-y-5">
      <header className="flex items-start gap-3 border-b border-slate-200 pb-5">
        <span className="rounded-xl bg-blue-50 p-2.5 text-blue-700"><Building2 className="h-5 w-5" /></span>
        <div>
          <h2 className="text-xl font-black tracking-tight text-slate-900">Alta asistida de empresa</h2>
          <p className="mt-1 max-w-2xl text-sm text-slate-600">Crea una empresa desde PACHAX Admin y prepara el acceso de su propietario. Solo Platform Owner puede completar esta acción.</p>
        </div>
      </header>

      <div className="flex gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3.5 text-sm text-amber-950">
        <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" />
        <p>No crea un plan, una suscripción ni cobros. Las altas públicas continúan cerradas. El propietario nuevo recibirá un enlace de un solo uso para configurar su contraseña; no se comparte ninguna contraseña.</p>
      </div>

      {templateError && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-900">No se pudieron cargar las plantillas disponibles: {templateError}</div>}
      {error && <div role="alert" className="flex gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-900"><AlertCircle className="h-4 w-4 shrink-0" />{error}</div>}

      {result ? (
        <div className="space-y-4 rounded-2xl border border-emerald-200 bg-white p-5 shadow-sm sm:p-7">
          <div className="flex items-start gap-3 text-emerald-900"><CheckCircle2 className="mt-0.5 h-6 w-6 shrink-0" /><div><h3 className="text-lg font-bold">Empresa creada y acceso preparado</h3><p className="mt-1 text-sm">{templates.find(item => item.businessType === result.businessType)?.name || result.businessType} · ID {result.tenantId}</p></div></div>
          {result.ownerAccess.method === 'existing_account' ? (
            <p className="rounded-xl bg-slate-50 p-3 text-sm text-slate-700">La cuenta existente del propietario ya fue vinculada. Puede iniciar sesión con su método actual y elegir esta empresa.</p>
          ) : result.ownerAccess.setupLink ? (
            <div className="space-y-3 rounded-xl border border-blue-200 bg-blue-50 p-4">
              <p className="text-sm font-semibold text-blue-950">Entrega segura al propietario</p>
              <p className="text-sm text-blue-900">Este enlace de configuración es de un solo uso. Entrégalo únicamente al propietario por un canal verificado. No queda guardado en la auditoría ni se volverá a mostrar aquí.</p>
              <textarea aria-label="Enlace de configuración de contraseña de un solo uso" readOnly value={result.ownerAccess.setupLink} rows={3} className="w-full resize-y rounded-lg border border-blue-200 bg-white p-2 font-mono text-xs text-slate-700" />
              <button type="button" onClick={handleCopySetupLink} className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-blue-700 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-800"><ClipboardCopy className="h-4 w-4" />{copied ? 'Copiado' : 'Copiar enlace'}</button>
            </div>
          ) : (
            <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">{result.ownerAccess.accountDisabled ? 'La cuenta del propietario está deshabilitada. No se reactivó automáticamente; verifica el estado con el propietario y utiliza el procedimiento autorizado de cuentas.' : 'La empresa ya está activa, pero el enlace no pudo generarse. Vuelve a ejecutar la misma operación para solicitar un enlace; la empresa no se duplicará.'}</p>
          )}
          <p className="text-xs text-slate-500">La operación quedó registrada en la auditoría de Platform.</p>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-5 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="text-sm font-semibold text-slate-800">Nombre comercial<input required minLength={2} maxLength={100} autoComplete="organization" value={companyName} onChange={event => setCompanyName(event.target.value)} disabled={retryLocked || saving} className={inputClass} /></label>
            <label className="text-sm font-semibold text-slate-800">Plantilla disponible<select required value={businessType} onChange={event => setBusinessType(event.target.value)} disabled={loadingTemplates || retryLocked || saving || templates.length === 0} className={inputClass}>{loadingTemplates && <option value="">Cargando plantillas…</option>}{templates.map(template => <option key={template.businessType} value={template.businessType}>{template.name}</option>)}</select></label>
          </div>
          {selectedTemplate && <p className="-mt-3 text-xs leading-5 text-slate-500">{selectedTemplate.description}</p>}

          {isDistribution && <label className="block text-sm font-semibold text-slate-800">Perfil de distribuidora<select value={industryProfile} onChange={event => setIndustryProfile(event.target.value)} disabled={retryLocked || saving} className={inputClass}>{INDUSTRY_PROFILES.map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label>}

          <fieldset className="space-y-4 rounded-xl border border-slate-200 p-4">
            <legend className="px-1 text-sm font-bold text-slate-900">Propietario y acceso</legend>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="text-sm font-semibold text-slate-800">Nombre del propietario<input required minLength={2} maxLength={80} autoComplete="name" value={ownerName} onChange={event => setOwnerName(event.target.value)} disabled={retryLocked || saving} className={inputClass} /></label>
              <label className="text-sm font-semibold text-slate-800">Correo del propietario<input required type="email" maxLength={160} autoComplete="email" value={ownerEmail} onChange={event => setOwnerEmail(event.target.value)} disabled={retryLocked || saving} className={inputClass} /></label>
            </div>
            <label className="flex items-start gap-2.5 text-sm leading-5 text-slate-700"><input required type="checkbox" checked={ownerEmailConfirmed} onChange={event => setOwnerEmailConfirmed(event.target.checked)} disabled={retryLocked || saving} className="mt-1 h-4 w-4 rounded border-slate-300 text-blue-700 focus:ring-blue-600" /><span>Confirmo que este correo corresponde al propietario autorizado y que puede recibir acceso a la nueva empresa.</span></label>
          </fieldset>

          <details className="rounded-xl border border-slate-200 p-4">
            <summary className="cursor-pointer text-sm font-bold text-slate-900">Datos empresariales iniciales (opcionales)</summary>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <label className="text-sm font-semibold text-slate-800">Razón social<input maxLength={120} value={legalName} onChange={event => setLegalName(event.target.value)} disabled={retryLocked || saving} className={inputClass} /></label>
              <label className="text-sm font-semibold text-slate-800">Teléfono de contacto<input maxLength={30} autoComplete="tel" value={phone} onChange={event => setPhone(event.target.value)} disabled={retryLocked || saving} className={inputClass} /></label>
              <label className="text-sm font-semibold text-slate-800">Ciudad<input maxLength={80} autoComplete="address-level2" value={city} onChange={event => setCity(event.target.value)} disabled={retryLocked || saving} className={inputClass} /></label>
              <label className="text-sm font-semibold text-slate-800">NIT / identificación fiscal<input maxLength={40} value={taxId} onChange={event => setTaxId(event.target.value)} disabled={retryLocked || saving} className={inputClass} /></label>
            </div>
            <p className="mt-3 text-xs text-slate-500">Moneda inicial: BOB (Bs) · Zona horaria: America/La_Paz · La paleta usa colores predefinidos seguros.</p>
          </details>

          <div className="flex flex-col gap-3 border-t border-slate-100 pt-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs leading-5 text-slate-500">{retryLocked ? 'Reintenta sin cambiar los datos; se conserva el mismo identificador para no duplicar la empresa.' : 'El formulario mantiene el mismo identificador al reintentar para no duplicar la empresa.'}</p>
            <button type="submit" disabled={loadingTemplates || saving || templates.length === 0 || !ownerEmailConfirmed} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-blue-700 px-5 py-2.5 text-sm font-bold text-white hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-50">
              {saving ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Building2 className="h-4 w-4" />}{saving ? 'Creando empresa…' : retryLocked ? 'Reintentar la misma operación' : 'Crear empresa y preparar acceso'}
            </button>
          </div>
        </form>
      )}
    </section>
  )
}
