import { CheckCircle2, Circle, ExternalLink, X } from 'lucide-react'
import type { RestaurantSetupStep } from '../domain/restaurantSetupGuide'
import type { RestaurantModuleId } from '../views/RestaurantExperience'

export function RestaurantSetupGuide({
  steps,
  onNavigate,
  onDismiss,
  onStartPosTour,
}: {
  steps: RestaurantSetupStep[]
  onNavigate: (module: RestaurantModuleId) => void
  onDismiss: () => void
  onStartPosTour?: () => void
}) {
  const completeCount = steps.filter((step) => step.complete).length
  const allComplete = completeCount === steps.length

  return (
    <section className="mb-5 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm" aria-labelledby="restaurant-setup-guide-title">
      <header className="flex flex-col gap-3 border-b border-slate-100 p-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Primeros pasos</p>
          <h2 id="restaurant-setup-guide-title" className="mt-1 text-lg font-bold text-slate-900">Configura tu restaurante</h2>
          <p className="mt-1 text-sm text-slate-600">{allComplete ? 'La configuración inicial está lista.' : `Llevas ${completeCount} de ${steps.length} pasos.`}</p>
        </div>
        <div className="flex flex-wrap gap-1">
          {onStartPosTour && <button type="button" onClick={onStartPosTour} className="inline-flex min-h-10 items-center justify-center gap-1 rounded-xl px-3 text-xs font-bold text-[var(--primary)] hover:bg-slate-100">Ver tutorial POS</button>}
          <button type="button" onClick={onDismiss} className="inline-flex min-h-10 items-center justify-center gap-1 rounded-xl px-3 text-xs font-bold text-slate-600 hover:bg-slate-100" aria-label="Omitir guía por ahora">
            <X size={15} /> Omitir por ahora
          </button>
        </div>
      </header>
      <ol className="divide-y divide-slate-100">
        {steps.map((step, index) => (
          <li key={step.id} className="flex gap-3 p-4">
            <span className="mt-0.5 shrink-0" aria-hidden="true">{step.complete ? <CheckCircle2 size={21} className="text-emerald-600" /> : <Circle size={21} className="text-slate-300" />}</span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2"><strong className="text-sm text-slate-900">{index + 1}. {step.title}</strong><span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${step.complete ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-800'}`}>{step.complete ? 'Completado' : 'Pendiente'}</span></div>
              <p className="mt-1 text-sm text-slate-600">{step.description}</p>
              <p className="mt-1 text-xs text-slate-500">{step.help}</p>
            </div>
            <button type="button" onClick={() => onNavigate(step.module)} className="inline-flex h-10 shrink-0 items-center gap-1 self-center rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 hover:border-slate-300 hover:bg-slate-50">
              Ir a configurar <ExternalLink size={13} />
            </button>
          </li>
        ))}
      </ol>
    </section>
  )
}
