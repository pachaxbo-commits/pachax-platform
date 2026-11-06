import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, ArrowRight, BookOpen, Check, CircleHelp, RotateCcw, X } from 'lucide-react'
import { QUICK_RETAIL_TUTORIALS, type QuickRetailTutorialEvent, type QuickRetailTutorialId } from './quickRetailTutorials'

type StepState = 'completed' | 'skipped' | 'pending'

export function QuickRetailTutorialCenter({
  isOpen,
  hasProducts,
  canUsePos,
  onClose,
  onOpenPos,
}: {
  isOpen: boolean
  hasProducts: boolean
  canUsePos: boolean
  onClose: () => void
  onOpenPos: () => void
}) {
  const [selectedId, setSelectedId] = useState<QuickRetailTutorialId | null>(null)
  const [stepIndex, setStepIndex] = useState(0)
  const [stepStates, setStepStates] = useState<Record<string, StepState>>({})

  const tutorial = useMemo(() => QUICK_RETAIL_TUTORIALS.find((item) => item.id === selectedId) || null, [selectedId])
  const step = tutorial?.steps[stepIndex]
  const currentKey = tutorial && step ? `${tutorial.id}:${step.id}` : null
  const currentState = currentKey ? stepStates[currentKey] || 'pending' : 'pending'

  useEffect(() => {
    if (!isOpen || !step) return
    const frame = window.requestAnimationFrame(() => {
      const target = document.querySelector<HTMLElement>(`[data-tutorial-target="${step.target}"]`)
      if (target) {
        target.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' })
        target.classList.add('quick-retail-tutorial-highlight')
      }
    })
    return () => {
      window.cancelAnimationFrame(frame)
      document.querySelectorAll('.quick-retail-tutorial-highlight').forEach((element) => element.classList.remove('quick-retail-tutorial-highlight'))
    }
  }, [isOpen, selectedId, stepIndex, step])

  useEffect(() => {
    if (!isOpen) return
    const onEvent = (event: Event) => {
      const detail = (event as CustomEvent<{ action: QuickRetailTutorialEvent }>).detail
      if (!step || !currentKey || detail?.action !== step.expectedEvent) return
      setStepStates((current) => ({ ...current, [currentKey]: 'completed' }))
    }
    window.addEventListener('quick-retail-tutorial-action', onEvent)
    return () => window.removeEventListener('quick-retail-tutorial-action', onEvent)
  }, [isOpen, currentKey, step])

  if (!isOpen) return null

  const selectTutorial = (id: QuickRetailTutorialId) => {
    setSelectedId(id)
    setStepIndex(0)
    onOpenPos()
    window.requestAnimationFrame(() => window.dispatchEvent(new CustomEvent('quick-retail-tutorial-selected')))
  }
  const completedCount = tutorial?.steps.filter((item) => stepStates[`${tutorial.id}:${item.id}`] === 'completed').length || 0
  const resolvedCount = tutorial?.steps.filter((item) => stepStates[`${tutorial.id}:${item.id}`] && stepStates[`${tutorial.id}:${item.id}`] !== 'pending').length || 0
  const progressPercent = tutorial ? Math.round((resolvedCount / tutorial.steps.length) * 100) : 0

  const setCurrentState = (state: StepState) => {
    if (!currentKey) return
    setStepStates((current) => ({ ...current, [currentKey]: state }))
  }
  const restart = () => {
    if (!tutorial) return
    setStepStates((current) => {
      const next = { ...current }
      tutorial.steps.forEach((item) => delete next[`${tutorial.id}:${item.id}`])
      return next
    })
    setStepIndex(0)
    onOpenPos()
  }

  return (
    <section className={`mx-3 mb-4 overflow-hidden rounded-2xl border border-sky-200 bg-white shadow-sm sm:mx-5 ${tutorial ? 'sticky top-[calc(13rem+env(safe-area-inset-top))] z-40 sm:top-[calc(5rem+env(safe-area-inset-top))] lg:static' : ''}`} aria-label="Centro de tutoriales de Comercio">
      <style>{`.quick-retail-tutorial-highlight{position:relative!important;z-index:8!important;outline:3px solid #0ea5e9!important;outline-offset:3px!important;box-shadow:0 0 0 6px rgb(14 165 233 / .14)!important;scroll-margin:1rem!important}`}</style>
      <header className="flex flex-nowrap items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3 sm:px-5">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-sky-100 text-sky-800"><BookOpen size={20} /></span>
          <div className="min-w-0"><h2 className="font-bold text-slate-900">Centro de tutoriales</h2><p className="text-xs text-slate-600">Prácticas interactivas con datos ficticios de esta demo.</p></div>
        </div>
        <button type="button" onClick={onClose} aria-label="Cerrar Centro de tutoriales" className="grid min-h-11 min-w-11 place-items-center rounded-lg text-slate-600 hover:bg-white focus-visible:outline-2 focus-visible:outline-sky-600"><X size={19} /></button>
      </header>

      {!tutorial ? (
        <div className="p-4 sm:p-5">
          <div className="mb-4 flex items-start gap-2 rounded-xl border border-sky-100 bg-sky-50 p-3 text-xs leading-relaxed text-sky-950"><CircleHelp className="mt-0.5 shrink-0" size={16} /><p>El progreso avanza cuando interactúas con los controles indicados. Puedes omitir cualquier paso; el POS no ejecuta acciones por ti.</p></div>
          {!canUsePos ? <p className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950" role="status">El rol actual no tiene acceso al punto de venta. Cambia el rol simulado a Caja, Ventas, Propietario o Administrador para practicar.</p> : <ul className="grid gap-2 md:grid-cols-2" aria-label="Recorridos disponibles">
            {QUICK_RETAIL_TUTORIALS.map((item) => {
              const unavailable = item.requiresProducts && !hasProducts
              return <li key={item.id}>
                <button type="button" disabled={unavailable} onClick={() => selectTutorial(item.id)} className="flex min-h-24 w-full flex-col items-start justify-center rounded-xl border border-slate-200 p-3 text-left transition hover:border-sky-400 hover:bg-sky-50 focus-visible:outline-2 focus-visible:outline-sky-600 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400">
                  <span className="font-semibold text-slate-900">{item.title}</span><span className="mt-1 text-xs leading-relaxed text-slate-600">{item.description}</span>
                  {unavailable && <span className="mt-2 text-[11px] font-semibold text-amber-800">Requiere artículos en el catálogo. Reinicia con datos completos para practicar.</span>}
                </button>
              </li>
            })}
          </ul>}
          {canUsePos && !hasProducts && <p className="mt-3 text-xs text-slate-600" role="status">El dataset está vacío. Puedes hacer el recorrido de orientación; los recorridos de venta estarán disponibles al reiniciar la demo con datos completos.</p>}
        </div>
      ) : (
        <div className="grid gap-4 p-4 sm:p-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center justify-between gap-2"><div><p className="text-[11px] font-bold uppercase tracking-[0.14em] text-sky-700">{tutorial.title}</p><h3 className="mt-1 text-base font-bold text-slate-900">Paso {stepIndex + 1} de {tutorial.steps.length} · {step?.title}</h3></div><button type="button" onClick={() => setSelectedId(null)} className="min-h-11 rounded-lg px-3 text-xs font-semibold text-slate-600 hover:bg-slate-100">Cambiar recorrido</button></div>
            <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-700" aria-live="polite">{step?.instruction}</p>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <div className="h-2 min-w-36 flex-1 overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-label="Progreso del recorrido" aria-valuemin={0} aria-valuemax={tutorial.steps.length} aria-valuenow={resolvedCount}><div className="h-full rounded-full bg-sky-600 transition-[width]" style={{ width: `${progressPercent}%` }} /></div>
              <span className="text-xs font-semibold text-slate-600">{completedCount} completados · {resolvedCount} de {tutorial.steps.length} resueltos</span>
              {currentState === 'completed' && <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700"><Check size={15} /> Acción completada</span>}
              {currentState === 'skipped' && <span className="text-xs font-semibold text-amber-800">Paso omitido</span>}
            </div>
          </div>
          <nav aria-label="Navegación del recorrido" className="flex flex-wrap items-center gap-2 lg:justify-end">
            <button type="button" onClick={() => setStepIndex((index) => Math.max(0, index - 1))} disabled={stepIndex === 0} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-slate-300 px-3 text-sm font-semibold text-slate-700 disabled:opacity-40"><ArrowLeft size={16} /> Anterior</button>
            {currentState === 'pending' && <button type="button" onClick={() => setCurrentState('skipped')} className="min-h-11 rounded-lg px-3 text-sm font-semibold text-slate-600 underline decoration-slate-300 underline-offset-4">Omitir paso</button>}
            {stepIndex < tutorial.steps.length - 1 ? <button type="button" onClick={() => setStepIndex((index) => Math.min(tutorial.steps.length - 1, index + 1))} disabled={currentState === 'pending'} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40">Siguiente <ArrowRight size={16} /></button> : <button type="button" onClick={() => setSelectedId(null)} disabled={currentState === 'pending'} className="min-h-11 rounded-lg bg-emerald-700 px-4 text-sm font-semibold text-white disabled:opacity-40">Finalizar</button>}
            <button type="button" onClick={restart} className="grid min-h-11 min-w-11 place-items-center rounded-lg border border-slate-300 text-slate-700" aria-label="Reiniciar recorrido" title="Reiniciar recorrido"><RotateCcw size={16} /></button>
          </nav>
        </div>
      )}
    </section>
  )
}
