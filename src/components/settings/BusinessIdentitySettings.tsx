import { useState, useRef } from 'react'
import { Building2, Upload, Trash2, Check, AlertCircle, FileText, Image as ImageIcon } from 'lucide-react'
import type { BusinessIdentity } from '../../core/businessIdentity'
import { normalizeBusinessIdentity, validateBusinessIdentity } from '../../core/businessIdentity'
import { BRAND_PALETTES, findBrandPalette } from '../../core/brandPalettes'

export function BusinessIdentitySettings({
  initialIdentity,
  canManage,
  onSaveIdentity,
  onUploadLogo,
}: {
  initialIdentity?: Partial<BusinessIdentity>
  tenantId?: string
  canManage: boolean
  onSaveIdentity: (identity: BusinessIdentity) => Promise<void> | void
  onUploadLogo?: (file: File) => Promise<string>
}) {
  const [form, setForm] = useState<BusinessIdentity>(() => normalizeBusinessIdentity(initialIdentity))
  const [saving, setSaving] = useState(false)
  const [uploadingLogo, setUploadingLogo] = useState(false)
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const selectedPalette = findBrandPalette(form.primaryColor, form.accentColor)

  const handleLogoUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    if (file.size > 2 * 1024 * 1024) {
      setNotice({ type: 'error', message: 'El logotipo no debe superar los 2 MB.' })
      return
    }

    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml']
    if (!allowed.includes(file.type)) {
      setNotice({ type: 'error', message: 'Formato no admitido. Usa JPG, PNG, WEBP o SVG.' })
      return
    }

    setUploadingLogo(true)
    setNotice(null)
    try {
      if (onUploadLogo) {
        const url = await onUploadLogo(file)
        setForm(prev => ({ ...prev, logoUrl: url }))
        setNotice({ type: 'success', message: 'Logotipo cargado correctamente.' })
      } else {
        // Fallback local para sandbox / demo
        const localUrl = URL.createObjectURL(file)
        setForm(prev => ({ ...prev, logoUrl: localUrl }))
        setNotice({ type: 'success', message: 'Logotipo previsualizado en sandbox local.' })
      }
    } catch (err: unknown) {
      setNotice({ type: 'error', message: err instanceof Error ? err.message : 'Error al subir el logotipo.' })
    } finally {
      setUploadingLogo(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const handleRemoveLogo = () => {
    setForm(prev => ({ ...prev, logoUrl: '' }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!canManage || saving) return

    const validation = validateBusinessIdentity(form)
    if (!validation.valid) {
      setNotice({ type: 'error', message: validation.errors[0] || 'Por favor revisa los campos.' })
      return
    }

    setSaving(true)
    setNotice(null)
    try {
      await onSaveIdentity(validation.sanitized)
      setNotice({ type: 'success', message: 'Datos comerciales y configuración de documentos guardados correctamente.' })
      setTimeout(() => setNotice(null), 4000)
    } catch (err: unknown) {
      setNotice({ type: 'error', message: err instanceof Error ? err.message : 'Error al guardar configuración.' })
    } finally {
      setSaving(false)
    }
  }

  const inputClass = 'w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs text-slate-800 focus:border-slate-400 focus:outline-none disabled:bg-slate-50 disabled:text-slate-500 shadow-xs'

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {notice && (
        <div
          className={`flex items-center gap-2 rounded-xl border p-3 text-xs font-semibold ${
            notice.type === 'success'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
              : 'border-rose-200 bg-rose-50 text-rose-800'
          }`}
        >
          {notice.type === 'success' ? <Check size={16} /> : <AlertCircle size={16} />}
          <span>{notice.message}</span>
        </div>
      )}

      {/* SECCIÓN 1: IDENTIDAD COMERCIAL */}
      <section className="rounded-2xl border border-slate-200 bg-white p-5 space-y-4 shadow-xs">
        <header className="flex items-center gap-2 border-b border-slate-100 pb-3">
          <Building2 className="w-5 h-5" style={{ color: 'var(--primary)' }} />
          <div>
            <h2 className="text-sm font-bold text-slate-900">Empresa e Identidad Comercial</h2>
            <p className="text-[11px] text-slate-500">Datos visibles para clientes, reportes y comprobantes.</p>
          </div>
        </header>

        {/* LOGO */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 bg-slate-50/70 p-4 rounded-xl border border-slate-100">
          <div className="h-16 w-24 shrink-0 rounded-lg border border-slate-200 bg-white grid place-items-center overflow-hidden">
            {form.logoUrl ? (
              <img src={form.logoUrl} alt="Logo" className="max-h-full max-w-full object-contain p-1" />
            ) : (
              <div className="text-center text-slate-400">
                <ImageIcon className="w-6 h-6 mx-auto mb-0.5" />
                <span className="text-[9px] font-semibold">Sin logo</span>
              </div>
            )}
          </div>

          <div className="space-y-1">
            <h4 className="text-xs font-bold text-slate-800">Logotipo de la empresa</h4>
            <p className="text-[10px] text-slate-500">Formato JPG, PNG o SVG (máx. 2 MB). Se almacena de forma segura bajo tu cuenta.</p>
            {canManage && (
              <div className="flex items-center gap-2 pt-1">
                <button
                  type="button"
                  disabled={uploadingLogo}
                  onClick={() => fileInputRef.current?.click()}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50 transition cursor-pointer disabled:opacity-50"
                >
                  <Upload size={13} />
                  <span>{uploadingLogo ? 'Subiendo...' : 'Subir imagen'}</span>
                </button>
                {form.logoUrl && (
                  <button
                    type="button"
                    onClick={handleRemoveLogo}
                    className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-50 transition cursor-pointer"
                  >
                    <Trash2 size={13} />
                    <span>Quitar</span>
                  </button>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/svg+xml"
                  className="hidden"
                  onChange={handleLogoUpload}
                />
              </div>
            )}
          </div>
        </div>

        {/* CAMPOS COMERCIALES */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-[11px] font-bold text-slate-700 mb-1">Nombre comercial *</label>
            <input
              type="text"
              disabled={!canManage}
              required
              value={form.tradeName}
              onChange={e => setForm(prev => ({ ...prev, tradeName: e.target.value }))}
              placeholder="Ej. La Trattoria"
              className={inputClass}
            />
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-700 mb-1">Razón social (opcional)</label>
            <input
              type="text"
              disabled={!canManage}
              value={form.legalName || ''}
              onChange={e => setForm(prev => ({ ...prev, legalName: e.target.value }))}
              placeholder="Ej. Gastronomía del Sur S.R.L."
              className={inputClass}
            />
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-700 mb-1">NIT / Identificación fiscal</label>
            <input
              type="text"
              disabled={!canManage}
              value={form.taxId || ''}
              onChange={e => setForm(prev => ({ ...prev, taxId: e.target.value }))}
              placeholder="Ej. 1020304050"
              className={inputClass}
            />
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-700 mb-1">Ciudad</label>
            <input
              type="text"
              disabled={!canManage}
              value={form.city || ''}
              onChange={e => setForm(prev => ({ ...prev, city: e.target.value }))}
              placeholder="Ej. Cochabamba"
              className={inputClass}
            />
          </div>

          <div className="sm:col-span-2">
            <label className="block text-[11px] font-bold text-slate-700 mb-1">Dirección física</label>
            <input
              type="text"
              disabled={!canManage}
              value={form.address || ''}
              onChange={e => setForm(prev => ({ ...prev, address: e.target.value }))}
              placeholder="Ej. Av. Heroínas #456, entre San Martín y 25 de Mayo"
              className={inputClass}
            />
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-700 mb-1">Teléfono comercial</label>
            <input
              type="tel"
              disabled={!canManage}
              value={form.phone || ''}
              onChange={e => setForm(prev => ({ ...prev, phone: e.target.value }))}
              placeholder="Ej. 44221133"
              className={inputClass}
            />
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-700 mb-1">WhatsApp de atención</label>
            <input
              type="tel"
              disabled={!canManage}
              value={form.whatsapp || ''}
              onChange={e => setForm(prev => ({ ...prev, whatsapp: e.target.value }))}
              placeholder="Ej. 70712345"
              className={inputClass}
            />
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-700 mb-1">Correo electrónico</label>
            <input
              type="email"
              disabled={!canManage}
              value={form.email || ''}
              onChange={e => setForm(prev => ({ ...prev, email: e.target.value }))}
              placeholder="contacto@minegocio.com"
              className={inputClass}
            />
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-700 mb-1">Sitio web / Catálogo</label>
            <input
              type="url"
              disabled={!canManage}
              value={form.website || ''}
              onChange={e => setForm(prev => ({ ...prev, website: e.target.value }))}
              placeholder="https://minegocio.com"
              className={inputClass}
            />
          </div>
        </div>

        {/* PALETA DE MARCA */}
        <div className="pt-2 border-t border-slate-100">
          <h4 className="text-xs font-bold text-slate-800 mb-1">Paleta de marca</h4>
          <p className="text-[11px] text-slate-500 mb-3">Elige una combinación con texto legible. Tus colores actuales se conservan hasta que selecciones otra paleta.</p>
          {!selectedPalette && (
            <p className="mb-3 rounded-lg bg-slate-50 px-3 py-2 text-[11px] text-slate-600">
              Colores actuales conservados: principal {form.primaryColor} · acento {form.accentColor}
            </p>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {BRAND_PALETTES.map(palette => {
              const selected = selectedPalette?.id === palette.id
              return (
                <button
                  key={palette.id}
                  type="button"
                  disabled={!canManage}
                  aria-pressed={selected}
                  onClick={() => setForm(prev => ({ ...prev, primaryColor: palette.primary, accentColor: palette.accent }))}
                  className={`flex min-h-12 items-center gap-3 rounded-xl border p-3 text-left transition disabled:cursor-not-allowed disabled:opacity-60 ${selected ? 'border-slate-800 bg-slate-50 ring-1 ring-slate-800' : 'border-slate-200 hover:border-slate-400'}`}
                >
                  <span className="flex -space-x-1.5" aria-hidden="true">
                    <span className="h-5 w-5 rounded-full border-2 border-white" style={{ backgroundColor: palette.primary }} />
                    <span className="h-5 w-5 rounded-full border-2 border-white" style={{ backgroundColor: palette.accent }} />
                  </span>
                  <span className="text-xs font-semibold text-slate-800">{palette.name}</span>
                  {selected && <Check size={15} className="ml-auto text-emerald-700" aria-hidden="true" />}
                </button>
              )
            })}
          </div>
        </div>
      </section>

      {/* SECCIÓN 2: CONFIGURACIÓN DOCUMENTAL (RECIBOS Y TICKETS) */}
      <section className="rounded-2xl border border-slate-200 bg-white p-5 space-y-4 shadow-xs">
        <header className="flex items-center gap-2 border-b border-slate-100 pb-3">
          <FileText className="w-5 h-5" style={{ color: 'var(--primary)' }} />
          <div>
            <h2 className="text-sm font-bold text-slate-900">Configuración de Recibos y Comprobantes</h2>
            <p className="text-[11px] text-slate-500">Personaliza la información impresa y los comprobantes digitales.</p>
          </div>
        </header>

        <div className="grid grid-cols-1 gap-3">
          <div>
            <label className="block text-[11px] font-bold text-slate-700 mb-1">Encabezado personalizado del ticket</label>
            <input
              type="text"
              disabled={!canManage}
              value={form.receiptHeader || ''}
              onChange={e => setForm(prev => ({ ...prev, receiptHeader: e.target.value }))}
              placeholder="Ej. ¡Bienvenidos a nuestro salón!"
              className={inputClass}
            />
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-700 mb-1">Mensaje de pie de recibo</label>
            <input
              type="text"
              disabled={!canManage}
              value={form.receiptFooter || ''}
              onChange={e => setForm(prev => ({ ...prev, receiptFooter: e.target.value }))}
              placeholder="Ej. ¡Gracias por su preferencia · Vuelva pronto!"
              className={inputClass}
            />
          </div>
        </div>

        {/* CASILLAS DE VISIBILIDAD */}
        <div className="pt-2 border-t border-slate-100 space-y-2.5">
          <h4 className="text-xs font-bold text-slate-800">Visibilidad en comprobantes</h4>

          <label className="flex items-center gap-2.5 text-xs text-slate-700 cursor-pointer">
            <input
              type="checkbox"
              disabled={!canManage}
              checked={form.showLogo}
              onChange={e => setForm(prev => ({ ...prev, showLogo: e.target.checked }))}
              className="rounded text-slate-900"
            />
            <span>Mostrar logotipo en el recibo (si está disponible)</span>
          </label>

          <label className="flex items-center gap-2.5 text-xs text-slate-700 cursor-pointer">
            <input
              type="checkbox"
              disabled={!canManage}
              checked={form.showAddress}
              onChange={e => setForm(prev => ({ ...prev, showAddress: e.target.checked }))}
              className="rounded text-slate-900"
            />
            <span>Mostrar dirección física en el recibo</span>
          </label>

          <label className="flex items-center gap-2.5 text-xs text-slate-700 cursor-pointer">
            <input
              type="checkbox"
              disabled={!canManage}
              checked={form.showPhone}
              onChange={e => setForm(prev => ({ ...prev, showPhone: e.target.checked }))}
              className="rounded text-slate-900"
            />
            <span>Mostrar teléfonos de contacto y WhatsApp</span>
          </label>

          <label className="flex items-center gap-2.5 text-xs text-slate-700 cursor-pointer">
            <input
              type="checkbox"
              disabled={!canManage}
              checked={form.showTaxId}
              onChange={e => setForm(prev => ({ ...prev, showTaxId: e.target.checked }))}
              className="rounded text-slate-900"
            />
            <span>Mostrar NIT / Identificación fiscal en el recibo</span>
          </label>

          <label className="flex items-center gap-2.5 text-xs text-slate-700 cursor-pointer">
            <input
              type="checkbox"
              disabled={!canManage}
              checked={form.showManagedBy}
              onChange={e => setForm(prev => ({ ...prev, showManagedBy: e.target.checked }))}
              className="rounded text-slate-900"
            />
            <span>Mostrar discretamente la leyenda "Gestionado con PACHAX"</span>
          </label>
        </div>
      </section>

      {/* BOTÓN DE GUARDAR */}
      {canManage && (
        <div className="flex justify-end">
          <button
            type="submit"
            disabled={saving}
            style={{ backgroundColor: 'var(--primary)', color: 'var(--primary-foreground)' }}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-6 text-sm font-bold shadow-xs transition hover:opacity-95 disabled:opacity-50 cursor-pointer"
          >
            <Check size={16} />
            <span>{saving ? 'Guardando cambios...' : 'Guardar empresa y documentos'}</span>
          </button>
        </div>
      )}
    </form>
  )
}
