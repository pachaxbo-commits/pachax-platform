import { useEffect, useLayoutEffect, useState } from 'react'
import { ArrowLeft, ArrowRight, X } from 'lucide-react'
import type { RestaurantModuleId } from '../views/RestaurantExperience'
import type { RestaurantTourStep } from '../domain/restaurantPosTour'

type Rect = { top: number; left: number; width: number; height: number }

function sameRect(left: Rect | null, right: Rect | null) {
  return left?.top === right?.top && left?.left === right?.left && left?.width === right?.width && left?.height === right?.height
}

function rectFor(selector: string): Rect | null {
  const element = Array.from(document.querySelectorAll<HTMLElement>(selector)).find((candidate) => {
    const bounds = candidate.getBoundingClientRect()
    return Boolean(bounds.width && bounds.height)
  })
  if (!element) return null
  const bounds = element.getBoundingClientRect()
  return { top: bounds.top, left: bounds.left, width: bounds.width, height: bounds.height }
}

export function RestaurantInteractiveTour({
  steps,
  mobileSteps,
  activeModule,
  tourLabel = 'Tutorial',
  onDismiss,
  onComplete,
}: {
  steps: RestaurantTourStep[]
  mobileSteps?: RestaurantTourStep[]
  activeModule: RestaurantModuleId
  tourLabel?: string
  onDismiss: () => void
  onComplete: () => void
}) {
  const activeSteps = typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches && mobileSteps?.length
    ? mobileSteps
    : steps
  const [index, setIndex] = useState(0)
  const [rect, setRect] = useState<Rect | null>(null)
  const [missingTarget, setMissingTarget] = useState(false)
  const step = activeSteps[index]

  useEffect(() => {
    const onTargetClick = (event: MouseEvent) => {
      if (step.interaction !== 'navigate') return
      const target = event.target instanceof Element ? event.target.closest(step.target) : null
      if (!target) return
      window.setTimeout(() => {
        if (document.querySelector(step.advanceWhen || '[data-tour="pos-catalog"]')) {
          setIndex((current) => Math.min(current + 1, activeSteps.length - 1))
        }
      }, 50)
    }
    document.addEventListener('click', onTargetClick, true)
    return () => document.removeEventListener('click', onTargetClick, true)
  }, [activeSteps.length, step])

  useLayoutEffect(() => {
    let hasScrolledToTarget = false
    const refresh = () => {
      const next = rectFor(step.target)
      setRect((current) => sameRect(current, next) ? current : next)
      setMissingTarget((current) => current === !next ? current : !next)
      if (next && !hasScrolledToTarget) {
        hasScrolledToTarget = true
        document.querySelector<HTMLElement>(step.target)?.scrollIntoView({ block: 'center', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })
      }
    }
    refresh()
    window.addEventListener('resize', refresh)
    window.addEventListener('scroll', refresh, true)
    const observer = new MutationObserver(refresh)
    observer.observe(document.body, { childList: true, subtree: true })
    return () => {
      window.removeEventListener('resize', refresh)
      window.removeEventListener('scroll', refresh, true)
      observer.disconnect()
    }
  }, [step])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onDismiss()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onDismiss])

  const finish = () => {
    onComplete()
    onDismiss()
  }
  const next = () => {
    if (index === activeSteps.length - 1) finish()
    else setIndex((current) => current + 1)
  }
  const missingTargetMessage = step.id === 'tables'
    ? 'Ahora no hay una mesa ocupada para abrir. Revisa el estado del sal\u00f3n y contin\u00faa cuando quieras.'
    : step.id === 'ticket'
      ? 'No hay comandas activas ahora. Aqu\u00ed aparecer\u00e1n cuando llegue un pedido. Puedes continuar.'
      : step.id === 'prepare' || step.id === 'ready'
        ? 'No hay una comanda en este estado ahora. Cuando llegue, este control aparecer\u00e1 aqu\u00ed.'
        : 'Esta pantalla a\u00fan est\u00e1 preparando el control. Puedes esperar o volver al paso anterior.'
  const cardTop = rect ? Math.max(12, step.placement === 'top' ? rect.top - 210 : rect.top + rect.height + 14) : 80
  const cardLeft = rect ? Math.min(Math.max(12, rect.left), Math.max(12, window.innerWidth - 372)) : 12

  return (
    <div className="pointer-events-none fixed inset-0 z-[1000]" aria-live="polite">
      {rect ? (
        <>
          <div className="fixed left-0 top-0 bg-slate-950/55" style={{ width: '100vw', height: Math.max(0, rect.top) }} />
          <div className="fixed bottom-0 left-0 bg-slate-950/55" style={{ width: '100vw', top: rect.top + rect.height }} />
          <div className="fixed left-0 bg-slate-950/55" style={{ top: rect.top, width: Math.max(0, rect.left), height: rect.height }} />
          <div className="fixed right-0 bg-slate-950/55" style={{ top: rect.top, left: rect.left + rect.width, height: rect.height }} />
          <div className="pointer-events-none fixed rounded-xl ring-4 ring-amber-300 ring-offset-2 ring-offset-white" style={rect} />
        </>
      ) : <div className="fixed inset-0 bg-slate-950/55" />}

      <div
        role="dialog"
        aria-modal="false"
        aria-label={`${tourLabel}: ${step.title}`}
        className="pointer-events-auto fixed z-[1002] w-[min(360px,calc(100vw-24px))] rounded-2xl bg-white p-4 shadow-2xl"
        style={{ top: cardTop, left: cardLeft }}
      >
        <div className="flex items-start justify-between gap-3">
          <div><p className="text-xs font-bold uppercase tracking-wide text-slate-500">{tourLabel} · Paso {index + 1} de {activeSteps.length}</p><h2 className="mt-1 text-base font-extrabold text-slate-900">{step.title}</h2></div>
          <button type="button" onClick={onDismiss} className="rounded-lg p-1 text-slate-500 hover:bg-slate-100" aria-label="Omitir tutorial"><X size={18} /></button>
        </div>
        <p className="mt-3 text-sm leading-5 text-slate-600">{missingTarget ? missingTargetMessage : step.description}</p>
        {step.interaction === 'navigate' && !missingTarget && activeModule === step.module && <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-900">{step.id === 'open-menu' ? 'Esperando que abras el menú con el botón resaltado.' : step.id === 'open-tables' ? 'Esperando que abras Mesas con el botón resaltado.' : step.id === 'open-kitchen' ? 'Esperando que abras Cocina con el bot\u00f3n resaltado.' : step.id === 'tables' ? 'Esperando que abras una mesa ocupada.' : 'Esperando que abras POS con el botón resaltado.'}</p>}
        <div className="mt-4 flex items-center justify-between gap-2">
          <button type="button" disabled={index === 0} onClick={() => setIndex((current) => Math.max(0, current - 1))} className="inline-flex min-h-10 items-center gap-1 rounded-xl px-3 text-sm font-bold text-slate-600 disabled:opacity-40"><ArrowLeft size={16} />Anterior</button>
          {step.interaction === 'navigate' && !missingTarget && activeModule === step.module ? null : <button type="button" onClick={next} className="inline-flex min-h-10 items-center gap-1 rounded-xl bg-slate-900 px-3 text-sm font-bold text-white hover:bg-slate-800">{index === activeSteps.length - 1 ? 'Finalizar' : 'Siguiente'}<ArrowRight size={16} /></button>}
        </div>
      </div>
    </div>
  )
}
