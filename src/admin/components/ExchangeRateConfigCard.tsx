import { useState } from 'react'
import { AlertCircle, CheckCircle2, Coins, Loader2, RefreshCw, Save } from 'lucide-react'
import { useAdminAuth } from '../auth/adminAuthStore'
import { useCommercialConfig } from '../store/commercialConfigStore'
import {
  calculateUsdReferenceFromBob,
  formatExchangeDateLabel,
  formatPrimaryCommercialAmount,
  formatUsdReferenceText,
  isExchangeRateUsable,
  type ExchangeRateStatus,
} from '../../core/currencyExchange'

interface ExchangeRateConfigCardProps {
  sampleMonthlyBob?: number
  sampleAnnualBob?: number
  compact?: boolean
}

function toDatetimeLocalValue(iso?: string | null): string {
  const source = iso ? new Date(iso) : new Date()
  if (Number.isNaN(source.getTime())) return ''
  const offsetMs = source.getTimezoneOffset() * 60_000
  return new Date(source.getTime() - offsetMs).toISOString().slice(0, 16)
}

export function ExchangeRateConfigCard({
  sampleMonthlyBob = 340,
  sampleAnnualBob = 3400,
  compact = false,
}: ExchangeRateConfigCardProps) {
  const { user } = useAdminAuth()
  const { exchangeRate, updateExchangeRate } = useCommercialConfig()
  const canEditRate = user?.role === 'platform_owner'

  const activeRevision = exchangeRate.revision ?? 0
  const baseDraft = {
    revision: activeRevision,
    rateInput: exchangeRate.rateBsPerUsd !== null ? String(exchangeRate.rateBsPerUsd) : '',
    sourceInput: exchangeRate.source || '',
    effectiveAtLocal: toDatetimeLocalValue(exchangeRate.effectiveAt),
    statusInput: exchangeRate.status,
  }
  const [draft, setDraft] = useState<typeof baseDraft | null>(null)
  const currentDraft = draft && draft.revision === activeRevision ? draft : baseDraft
  const { rateInput, sourceInput, effectiveAtLocal, statusInput } = currentDraft
  const [saving, setSaving] = useState(false)
  const [feedback, setFeedback] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const patchDraft = (patch: Partial<Omit<typeof baseDraft, 'revision'>>) => {
    setDraft({ ...currentDraft, revision: activeRevision, ...patch })
  }

  const parsedRate = rateInput.trim() === '' ? null : Number(rateInput)
  const previewConfig = {
    ...exchangeRate,
    rateBsPerUsd: parsedRate !== null && Number.isFinite(parsedRate) && parsedRate > 0 ? parsedRate : null,
    source: sourceInput.trim(),
    effectiveAt: effectiveAtLocal ? new Date(effectiveAtLocal).toISOString() : null,
    status: statusInput,
  }
  const previewUsable = isExchangeRateUsable(previewConfig)
  const monthlyUsdPreview = calculateUsdReferenceFromBob(sampleMonthlyBob, previewConfig)
  const annualUsdPreview = calculateUsdReferenceFromBob(sampleAnnualBob, previewConfig)
  const previewLine = formatUsdReferenceText(sampleMonthlyBob, previewConfig)

  const handleSave = async () => {
    if (!canEditRate) {
      setError('Solo Platform Owner puede modificar el tipo de cambio referencial.')
      return
    }
    setSaving(true)
    setFeedback(null)
    setError(null)
    const effectiveIso = effectiveAtLocal ? new Date(effectiveAtLocal).toISOString() : null
    const res = await updateExchangeRate({
      rateBsPerUsd: parsedRate,
      source: sourceInput.trim(),
      effectiveAt: effectiveIso,
      status: statusInput,
    })
    setSaving(false)
    if (res.success) {
      setDraft(null)
      setFeedback('Tipo de cambio referencial actualizado con auditoría y reflejado en el catálogo comercial.')
      setTimeout(() => setFeedback(null), 5000)
    } else {
      setError(res.error || 'No se pudo guardar el tipo de cambio referencial.')
    }
  }

  const handleMarkOutdated = async () => {
    if (!canEditRate) return
    patchDraft({ statusInput: 'outdated' })
    setSaving(true)
    setFeedback(null)
    setError(null)
    const effectiveIso = effectiveAtLocal ? new Date(effectiveAtLocal).toISOString() : null
    const res = await updateExchangeRate({
      rateBsPerUsd: parsedRate,
      source: sourceInput.trim(),
      effectiveAt: effectiveIso,
      status: 'outdated',
    })
    setSaving(false)
    if (res.success) {
      setDraft(null)
      setFeedback('Tipo de cambio marcado como desactualizado. El catálogo público mostrará solo Bolivianos (Bs) hasta aprobar una nueva tasa.')
    } else {
      setError(res.error || 'No se pudo actualizar el estado.')
    }
  }

  const statusBadgeClass =
    exchangeRate.status === 'valid'
      ? 'bg-emerald-100 text-emerald-800 border-emerald-200'
      : exchangeRate.status === 'outdated'
        ? 'bg-amber-100 text-amber-800 border-amber-200'
        : 'bg-slate-100 text-slate-700 border-slate-200'

  const statusLabel =
    exchangeRate.status === 'valid'
      ? 'Vigente y visible'
      : exchangeRate.status === 'outdated'
        ? 'Desactualizado (solo Bs visible)'
        : 'Pendiente de configurar'

  return (
    <section
      className={`rounded-2xl border border-slate-200 bg-white ${compact ? 'p-4' : 'p-5 sm:p-6'} space-y-4 shadow-2xs`}
      data-testid="exchange-rate-config-card"
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-100">
        <div className="flex items-start gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center shrink-0">
            <Coins className="w-4 h-4 text-[#0066FF]" />
          </div>
          <div>
            <h3 className="text-sm font-extrabold text-slate-900">
              Tipo de cambio referencial (Bs por 1 USD)
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Los contratos y cobros permanecen siempre en <strong>Bolivianos (Bs / BOB)</strong>. El equivalente en USD es estrictamente informativo.
            </p>
          </div>
        </div>
        <span className={`px-3 py-1 rounded-full text-[11px] font-bold border self-start sm:self-auto ${statusBadgeClass}`}>
          {statusLabel}
        </span>
      </div>

      {exchangeRate.status !== 'valid' && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-950 flex items-start gap-2">
          <AlertCircle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
          <span>
            Referencia USD no configurada o no vigente. Mientras no exista una tasa aprobada y marcada como <strong>Válida</strong>, la web pública y las tarjetas mostrarán únicamente importes en <strong>Bs</strong> sin usar valores fijos ocultos.
          </span>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <label className="text-xs font-semibold text-slate-700">
          Bs por 1 USD
          <input
            type="number"
            min="0.01"
            max="1000"
            step="0.01"
            placeholder="Ej. 6.96"
            value={rateInput}
            disabled={!canEditRate || saving}
            onChange={(e) => patchDraft({ rateInput: e.target.value })}
            className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-900 disabled:bg-slate-100"
          />
        </label>

        <label className="text-xs font-semibold text-slate-700">
          Fuente autorizada
          <input
            type="text"
            maxLength={140}
            placeholder="Ej. BCB referencial oficial"
            value={sourceInput}
            disabled={!canEditRate || saving}
            onChange={(e) => patchDraft({ sourceInput: e.target.value })}
            className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-900 disabled:bg-slate-100"
          />
        </label>

        <label className="text-xs font-semibold text-slate-700">
          Fecha y hora de vigencia
          <input
            type="datetime-local"
            value={effectiveAtLocal}
            disabled={!canEditRate || saving}
            onChange={(e) => patchDraft({ effectiveAtLocal: e.target.value })}
            className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-900 disabled:bg-slate-100"
          />
        </label>

        <label className="text-xs font-semibold text-slate-700">
          Estado operativo
          <select
            value={statusInput}
            disabled={!canEditRate || saving}
            onChange={(e) => patchDraft({ statusInput: e.target.value as ExchangeRateStatus })}
            className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-900 disabled:bg-slate-100"
          >
            <option value="valid">Válido (mostrar ≈ USD)</option>
            <option value="outdated">Desactualizado (ocultar ≈ USD)</option>
            <option value="pending">Pendiente de aprobación</option>
          </select>
        </label>
      </div>

      {/* Vista previa del resultado y trazabilidad */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3.5 text-xs">
        <div className="space-y-1">
          <p className="font-bold text-slate-800 uppercase tracking-wider text-[10px]">
            Vista previa informativa en catálogo
          </p>
          <p className="text-slate-900 font-bold text-sm">
            {formatPrimaryCommercialAmount(sampleMonthlyBob, 'BOB')} / mes
          </p>
          {previewUsable && previewLine ? (
            <>
              <p className="text-slate-600">{previewLine}</p>
              <p className="text-[11px] text-slate-500">
                Ejemplo anual ({formatPrimaryCommercialAmount(sampleAnnualBob, 'BOB')}):{' '}
                <strong>≈ USD {annualUsdPreview?.toFixed(2)}</strong> · mensual ejemplo: <strong>≈ USD {monthlyUsdPreview?.toFixed(2)}</strong>
              </p>
            </>
          ) : (
            <p className="text-amber-800 font-medium">
              Sin referencia USD visible: falta aprobar una tasa válida con fuente y fecha.
            </p>
          )}
        </div>

        <div className="space-y-1 text-slate-600 lg:border-l lg:border-slate-200 lg:pl-3">
          <p className="font-bold text-slate-800 uppercase tracking-wider text-[10px]">
            Trazabilidad de última modificación
          </p>
          <p>
            Última actualización:{' '}
            <strong>{exchangeRate.updatedAt ? formatExchangeDateLabel(exchangeRate.updatedAt) : 'Sin registro'}</strong>
            {' · '}Revisión #{exchangeRate.revision || 0}
          </p>
          <p>
            Usuario administrador:{' '}
            <strong>{exchangeRate.updatedByEmail || exchangeRate.updatedBy || 'Ninguno aún'}</strong>
          </p>
          <p className="text-[11px] text-slate-500">
            No modifica deudas, renovaciones ni contratos ya emitidos en BOB o USD.
          </p>
        </div>
      </div>

      {feedback && (
        <div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs font-semibold text-emerald-900 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{feedback}</span>
        </div>
      )}
      {error && (
        <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-semibold text-red-900 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {canEditRate ? (
        <div className="flex flex-wrap items-center justify-end gap-2">
          {exchangeRate.status === 'valid' && (
            <button
              type="button"
              onClick={handleMarkOutdated}
              disabled={saving}
              className="px-3.5 py-2 rounded-xl border border-amber-300 bg-amber-50 hover:bg-amber-100 text-amber-900 text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Marcar como desactualizado</span>
            </button>
          )}
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            data-testid="save-exchange-rate-button"
            className="px-4 py-2 rounded-xl bg-[#0066FF] hover:bg-[#0052cc] text-white text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            <span>{saving ? 'Guardando tasa...' : 'Guardar tipo de cambio auditado'}</span>
          </button>
        </div>
      ) : (
        <p className="text-[11px] text-slate-500">
          Solo <strong>Platform Owner</strong> puede modificar o aprobar el tipo de cambio oficial referencial.
        </p>
      )}
    </section>
  )
}
