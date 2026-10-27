import { useEffect, useLayoutEffect, useState } from 'react'
import { ArrowLeft, ArrowRight, X } from 'lucide-react'
import type { RestaurantModuleId } from '../views/RestaurantExperience'
import type { RestaurantTourStep } from '../domain/restaurantPosTour'
import { resolveRestaurantTourStepIndex, resolveRestaurantTourTarget, RESTAURANT_TOUR_TARGET_WAIT_MS } from '../domain/restaurantTourTarget'

type Rect = { top: number; left: number; width: number; height: number }

function sameRect(left: Rect | null, right: Rect | null) {
  return left?.top === right?.top && left?.left === right?.left && left?.width === right?.width && left?.height === right?.height
}

function rectFor(selector: string): { rect: Rect | null; invalidSelector: boolean } {
  try {
    const element = Array.from(document.querySelectorAll<HTMLElement>(selector)).find((candidate) => {
      const bounds = candidate.getBoundingClientRect()
      return Boolean(bounds.width && bounds.height)
    })
    if (!element) return { rect: null, invalidSelector: false }
    const bounds = element.getBoundingClientRect()
    return { rect: { top: bounds.top, left: bounds.left, width: bounds.width, height: bounds.height }, invalidSelector: false }
  } catch {
    return { rect: null, invalidSelector: true }
  }
}

type TourTargetState = { stepId: string; status: 'waiting' | 'primary' | 'fallback' | 'missing' | 'invalid-selector'; rect: Rect | null; description?: string }

export function RestaurantInteractiveTour({
  steps,
  mobileSteps,
  activeModule,
  tourLabel = 'Tutorial',
  initialStepIndex = 0,
  isContinuous = false,
  onDismiss,
  onComplete,
  onPause,
  onStepChange,
}: {
  steps: RestaurantTourStep[]
  mobileSteps?: RestaurantTourStep[]
  activeModule: RestaurantModuleId
  tourLabel?: string
  initialStepIndex?: number
  isContinuous?: boolean
  onDismiss: (stepIndex: number) => void
  onComplete: () => void
  onPause?: (stepIndex: number) => void
  onStepChange?: (stepIndex: number) => void
}) {
  const activeSteps = typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches && mobileSteps?.length
    ? mobileSteps
    : steps
  const safeInitialIndex = Math.max(0, Math.min(initialStepIndex, activeSteps.length - 1))
  const [activeStepId, setActiveStepId] = useState(activeSteps[safeInitialIndex]?.id ?? activeSteps[0]?.id ?? '')
  const index = resolveRestaurantTourStepIndex(activeSteps, activeStepId)
  const step = activeSteps[index]
  const [targetState, setTargetState] = useState<TourTargetState>({ stepId: step.id, status: 'waiting', rect: null })
  const currentTargetState = targetState.stepId === step.id ? targetState : { stepId: step.id, status: 'waiting' as const, rect: null }
  const rect = currentTargetState.rect
  const missingTarget = currentTargetState.status === 'fallback' || currentTargetState.status === 'missing' || currentTargetState.status === 'invalid-selector'

  // Notify parent of step change to persist cursor in real time
  useEffect(() => {
    onStepChange?.(index)
  }, [index, onStepChange])

  // Click on target element triggers next step for navigation interactions
  useEffect(() => {
    const onTargetClick = (event: MouseEvent) => {
      if (step.interaction !== 'navigate') return
      const target = event.target instanceof Element ? event.target.closest(step.target) : null
      if (!target) return
      window.setTimeout(() => {
        if (document.querySelector(step.advanceWhen || '[data-tour="pos-catalog"]')) {
          setActiveStepId(activeSteps[Math.min(index + 1, activeSteps.length - 1)]?.id ?? step.id)
        }
      }, 50)
    }
    document.addEventListener('click', onTargetClick, true)
    return () => document.removeEventListener('click', onTargetClick, true)
  }, [activeSteps, index, step])

  useLayoutEffect(() => {
    let hasScrolledToTarget = false
    let waitExpired = false
    let errorLogged = false
    const commit = (status: TourTargetState['status'], rect: Rect | null, description?: string) => {
      setTargetState((current) => current.stepId === step.id && current.status === status && sameRect(current.rect, rect) && current.description === description
        ? current
        : { stepId: step.id, status, rect, description })
      if (rect && !hasScrolledToTarget) {
        hasScrolledToTarget = true
        const target = status === 'fallback' ? step.missingTarget?.fallbackTarget : step.target
        if (target) document.querySelector<HTMLElement>(target)?.scrollIntoView({ block: 'center', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })
      }
    }
    const refresh = () => {
      const primary = rectFor(step.target)
      if (primary.invalidSelector) {
        if (!errorLogged) {
          errorLogged = true
          console.error(`[RestaurantInteractiveTour] Selector inválido en el paso "${step.id}": ${step.target}`)
        }
        commit('invalid-selector', null)
        return
      }
      if (primary.rect) {
        commit('primary', primary.rect)
        return
      }
      if (!waitExpired) {
        commit('waiting', null)
        return
      }

      const fallback = step.missingTarget ? rectFor(step.missingTarget.fallbackTarget) : null
      if (fallback?.invalidSelector) {
        if (!errorLogged) {
          errorLogged = true
          console.error(`[RestaurantInteractiveTour] Selector alternativo inválido en el paso "${step.id}": ${step.missingTarget?.fallbackTarget}`)
        }
        commit('invalid-selector', null)
        return
      }
      const resolution = resolveRestaurantTourTarget(step, {
        primaryFound: false,
        fallbackFound: Boolean(fallback?.rect),
      })
      if (resolution.status === 'fallback') commit('fallback', fallback?.rect || null, resolution.description)
      else {
        if (!step.missingTarget && !errorLogged) {
          errorLogged = true
          console.error(`[RestaurantInteractiveTour] No se encontró el objetivo esperado en el paso "${step.id}": ${step.target}`)
        } else if (step.missingTarget && !errorLogged) {
          errorLogged = true
          console.error(`[RestaurantInteractiveTour] No se encontró el objetivo ni su alternativa en el paso "${step.id}": ${step.target} / ${step.missingTarget.fallbackTarget}`)
        }
        commit('missing', null)
      }
    }
    const timeout = window.setTimeout(() => {
      waitExpired = true
      refresh()
    }, RESTAURANT_TOUR_TARGET_WAIT_MS)
    window.addEventListener('resize', refresh)
    window.addEventListener('scroll', refresh, true)
    const observer = new MutationObserver(refresh)
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-tour'] })
    refresh()
    return () => {
      window.clearTimeout(timeout)
      window.removeEventListener('resize', refresh)
      window.removeEventListener('scroll', refresh, true)
      observer.disconnect()
    }
  }, [step])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (isContinuous && onPause) {
          onPause(index)
        } else {
          onDismiss(index)
        }
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onDismiss, onPause, isContinuous, index])

  const finish = () => {
    onComplete()
  }
  const next = () => {
    if (index === activeSteps.length - 1) finish()
    else setActiveStepId(activeSteps[index + 1]?.id ?? step.id)
  }
  const missingTargetMessage = currentTargetState.status === 'fallback'
    ? currentTargetState.description
    : currentTargetState.status === 'invalid-selector' || currentTargetState.status === 'missing'
      ? 'No pudimos ubicar el control de este paso. Vuelve al módulo o continúa con el siguiente paso.'
      : null
  const estimatedCardHeight = 240
  const cardBelow = rect ? rect.top + rect.height + 14 : 80
  const cardAbove = rect ? rect.top - estimatedCardHeight - 14 : 80
  const hasRoomBelow = rect ? cardBelow + estimatedCardHeight <= window.innerHeight - 12 : false
  const hasRoomAbove = rect ? cardAbove >= 12 : false
  const preferredCardTop = step.placement === 'top' ? cardAbove : cardBelow
  const cardTop = rect
    ? hasRoomBelow && hasRoomAbove
      ? preferredCardTop
      : hasRoomBelow
        ? cardBelow
        : hasRoomAbove
          ? cardAbove
          : Math.min(Math.max(12, preferredCardTop), Math.max(12, window.innerHeight - estimatedCardHeight - 12))
    : 80
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
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
              {tourLabel} · Paso {index + 1} de {activeSteps.length}
            </p>
            <h2 className="mt-1 text-base font-extrabold text-slate-900">{step.title}</h2>
          </div>
          <div className="flex items-center gap-1">
            {isContinuous && onPause && (
              <button
                type="button"
                onClick={() => onPause(index)}
                className="rounded-lg px-2 py-1 text-xs font-bold text-slate-500 hover:bg-slate-100 hover:text-slate-800 transition cursor-pointer"
                aria-label="Pausar recorrido continuo"
              >
                Pausar
              </button>
            )}
            <button
              type="button"
              onClick={() => onDismiss(index)}
              className="rounded-lg p-1 text-slate-500 hover:bg-slate-100 cursor-pointer"
              aria-label="Cerrar tutorial"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        <p className="mt-3 text-sm leading-5 text-slate-600">
          {currentTargetState.status === 'waiting'
            ? 'Estamos buscando este control. Puedes esperar un momento.'
            : missingTarget
            ? missingTargetMessage
            : step.description}
        </p>

        {step.interaction === 'navigate' && !missingTarget && activeModule === step.module && (
          <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-900">
            {step.id === 'open-menu'
              ? 'Esperando que abras el menú con el botón resaltado.'
              : step.id === 'open-tables'
              ? 'Esperando que abras Mesas con el botón resaltado.'
              : step.id === 'open-kitchen'
              ? 'Esperando que abras Cocina con el botón resaltado.'
              : step.id === 'open-cash'
              ? 'Esperando que abras Caja con el botón resaltado.'
              : step.id === 'open-customers'
              ? 'Esperando que abras Clientes con el botón resaltado.'
              : step.id === 'open-customer-form'
              ? 'Esperando que abras el formulario con el botón resaltado.'
              : step.id === 'open-customer-profile'
              ? 'Esperando que abras la ficha del cliente.'
              : step.id === 'tables'
              ? 'Esperando que abras una mesa ocupada.'
              : 'Esperando que abras POS con el botón resaltado.'}
          </p>
        )}

        <div className="mt-4 flex items-center justify-between gap-2">
          <button
            type="button"
            disabled={index === 0}
            onClick={() => setActiveStepId(activeSteps[Math.max(0, index - 1)]?.id ?? step.id)}
            className="inline-flex min-h-10 items-center gap-1 rounded-xl px-3 text-sm font-bold text-slate-600 disabled:opacity-40 cursor-pointer"
          >
            <ArrowLeft size={16} />
            Anterior
          </button>
          <button
            type="button"
            disabled={currentTargetState.status === 'waiting'}
            onClick={next}
            className="inline-flex min-h-10 items-center gap-1 rounded-xl bg-slate-900 px-3 text-sm font-bold text-white hover:bg-slate-800 disabled:cursor-wait disabled:opacity-50 cursor-pointer"
          >
            {index === activeSteps.length - 1 ? 'Finalizar' : 'Siguiente'}
            <ArrowRight size={16} />
          </button>
        </div>
      </div>
    </div>
  )
}
