import { useState, type FormEvent } from 'react'
import { X } from 'lucide-react'
import { getPublicTemplate } from '../../core/publicTemplates'
import { submitPublicCommercialInterest } from '../../services/commercialOnboarding'

interface Props {
  templateId: string
  planId?: string
  onClose: () => void
}

function requestId() {
  return globalThis.crypto?.randomUUID?.() ?? `web-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`
}

export function PublicCommercialInterestDialog({ templateId, planId, onClose }: Props) {
  const [requestKey] = useState(requestId)
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')
  const template = getPublicTemplate(templateId)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy) return
    setBusy(true)
    setError('')
    const form = new FormData(event.currentTarget)
    const branchCountValue = String(form.get('branchCount') || '').trim()
    try {
      await submitPublicCommercialInterest({
        requestId: requestKey,
        contactName: String(form.get('contactName') || ''),
        companyName: String(form.get('companyName') || ''),
        email: String(form.get('email') || '').trim() || undefined,
        contactPhone: String(form.get('contactPhone') || '').trim() || undefined,
        templateId: template.id,
        businessType: String(form.get('businessType') || ''),
        needs: String(form.get('needs') || '').trim() || undefined,
        branchCount: branchCountValue ? Number(branchCountValue) : undefined,
        planId,
        consent: true,
        website: String(form.get('website') || ''),
      })
      setSent(true)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo enviar. Inténtalo nuevamente o utiliza WhatsApp.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/60 p-4" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section role="dialog" aria-modal="true" aria-labelledby="commercial-interest-title" className="relative max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl sm:p-7">
        <button type="button" onClick={onClose} aria-label="Cerrar" className="absolute right-4 top-4 rounded-lg p-2 text-slate-500 hover:bg-slate-100"><X className="h-5 w-5" /></button>
        {sent ? (
          <div className="py-7 text-center">
            <h2 id="commercial-interest-title" className="text-xl font-bold text-slate-950">Solicitud recibida</h2>
            <p className="mt-3 text-sm text-slate-600">Un asesor de PACHAX podrá contactarte. Esto no crea una empresa, suscripción ni pago.</p>
            <button type="button" onClick={onClose} className="mt-6 min-h-11 rounded-xl bg-slate-900 px-5 font-semibold text-white">Listo</button>
          </div>
        ) : (
          <>
            <h2 id="commercial-interest-title" className="pr-10 text-xl font-bold text-slate-950">Solicitar información</h2>
            <p className="mt-1 text-sm text-slate-600">Cuéntanos sobre <strong>{template.title}</strong>. No se creará una cuenta ni se realizará un cobro.</p>
            <form onSubmit={handleSubmit} className="mt-5 space-y-3">
              <label className="block text-sm font-medium text-slate-700">Nombre de contacto<input name="contactName" required minLength={2} maxLength={80} autoComplete="name" className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 px-3" /></label>
              <label className="block text-sm font-medium text-slate-700">Negocio o empresa<input name="companyName" required minLength={2} maxLength={100} autoComplete="organization" className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 px-3" /></label>
              <label className="block text-sm font-medium text-slate-700">Correo electrónico<input name="email" type="email" maxLength={160} autoComplete="email" className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 px-3" /></label>
              <label className="block text-sm font-medium text-slate-700">Teléfono / WhatsApp<input name="contactPhone" type="tel" maxLength={40} autoComplete="tel" className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 px-3" /></label>
              <p className="-mt-2 text-xs text-slate-500">Indica al menos un correo o teléfono.</p>
              <label className="block text-sm font-medium text-slate-700">Tipo de negocio<input name="businessType" required minLength={2} maxLength={80} className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 px-3" /></label>
              <label className="block text-sm font-medium text-slate-700">Sucursales aproximadas <span className="font-normal text-slate-500">(opcional)</span><input name="branchCount" type="number" min={1} max={1000} step={1} inputMode="numeric" className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 px-3" /></label>
              <label className="block text-sm font-medium text-slate-700">¿Qué necesitas resolver? <span className="font-normal text-slate-500">(opcional)</span><textarea name="needs" maxLength={1000} rows={3} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" /></label>
              <label className="hidden" aria-hidden="true">Sitio web<input name="website" tabIndex={-1} autoComplete="off" /></label>
              <label className="flex items-start gap-2 text-sm text-slate-600"><input name="consent" type="checkbox" required className="mt-1 h-4 w-4" /><span>Acepto que PACHAX use estos datos para responder esta solicitud.</span></label>
              {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p>}
              <button type="submit" disabled={busy} className="min-h-11 w-full rounded-xl bg-slate-900 px-4 font-semibold text-white disabled:cursor-wait disabled:opacity-60">{busy ? 'Enviando…' : 'Enviar solicitud'}</button>
            </form>
          </>
        )}
      </section>
    </div>
  )
}
