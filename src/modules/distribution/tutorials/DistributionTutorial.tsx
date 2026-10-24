import { useEffect, useLayoutEffect, useState, useCallback, useRef } from 'react'
import { ArrowLeft, ArrowRight, X, AlertCircle } from 'lucide-react'
import type { ModuleId } from '../../../config/businessTypes.ts'
import type { DistributionTutorialPlan, DistributionTutorialStep } from './distributionTutorials.ts'
import { calculateTutorialCardPlacement, type TutorialRect, type TutorialViewport } from './tutorialLayout.ts'

interface DistributionTutorialProps {
  plan: DistributionTutorialPlan
  activeModule: ModuleId
  onNavigate?: (module: ModuleId) => void
  onDismiss: () => void
  onComplete: () => void
  onStepChange?: (stepIndex: number) => void
  initialStepIndex?: number
}

function sameRect(a: TutorialRect | null, b: TutorialRect | null): boolean {
  if (!a && !b) return true
  if (!a || !b) return false
  return (
    Math.round(a.top) === Math.round(b.top) &&
    Math.round(a.left) === Math.round(b.left) &&
    Math.round(a.width) === Math.round(b.width) &&
    Math.round(a.height) === Math.round(b.height)
  )
}

function findTargetElement(targetKey: string): HTMLElement | null {
  if (!targetKey) return null
  // 1. Try data-tutorial-target exact match
  const byAttr = Array.from(document.querySelectorAll<HTMLElement>(`[data-tutorial-target="${targetKey}"]`)).find((el) => {
    const b = el.getBoundingClientRect()
    return b.width > 0 && b.height > 0 && window.getComputedStyle(el).display !== 'none'
  })
  if (byAttr) return byAttr

  // 2. Try as a generic CSS selector if it contains . or # or [
  if (targetKey.startsWith('.') || targetKey.startsWith('#') || targetKey.includes('[')) {
    try {
      const bySelector = Array.from(document.querySelectorAll<HTMLElement>(targetKey)).find((el) => {
        const b = el.getBoundingClientRect()
        return b.width > 0 && b.height > 0 && window.getComputedStyle(el).display !== 'none'
      })
      if (bySelector) return bySelector
    } catch {
      // invalid selector, ignore
    }
  }

  return null
}

export function DistributionTutorial({
  plan,
  activeModule,
  onNavigate,
  onDismiss,
  onComplete,
  onStepChange,
  initialStepIndex = 0,
}: DistributionTutorialProps) {
  const [index, setIndex] = useState(() => Math.max(0, Math.min(initialStepIndex, plan.steps.length - 1)))
  const [rect, setRect] = useState<TutorialRect | null>(null)
  const [missingTarget, setMissingTarget] = useState(false)
  const cardRef = useRef<HTMLDivElement>(null)
  const [cardDimensions, setCardDimensions] = useState({ width: 340, height: 230 })

  const step: DistributionTutorialStep = plan.steps[index] || plan.steps[0]

  useEffect(() => {
    if (step && step.module && activeModule !== step.module && onNavigate) {
      onNavigate(step.module);
    }
  }, [step, activeModule, onNavigate]);

  // Notificar cambio de paso
  useEffect(() => {
    onStepChange?.(index)
  }, [index, onStepChange])

  // Medir dimensiones reales de la tarjeta para cálculo exacto de posición
  useLayoutEffect(() => {
    if (cardRef.current) {
      const bounds = cardRef.current.getBoundingClientRect()
      if (bounds.width > 0 && bounds.height > 0) {
        setCardDimensions({
          width: Math.min(360, bounds.width),
          height: bounds.height,
        })
      }
    }
  }, [step, missingTarget])

  // Buscar el elemento objetivo y calcular rect
  useLayoutEffect(() => {
    let hasScrolled = false
    const refresh = () => {
      const element = findTargetElement(step.target)
      if (!element) {
        setRect(null)
        setMissingTarget(true)
        return
      }

      const bounds = element.getBoundingClientRect()
      const next: TutorialRect = {
        top: bounds.top,
        left: bounds.left,
        width: bounds.width,
        height: bounds.height,
      }

      setRect((current) => (sameRect(current, next) ? current : next))
      setMissingTarget(false)

      if (!hasScrolled) {
        hasScrolled = true
        element.scrollIntoView({
          block: 'center',
          inline: 'center',
          behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
        })
      }
    }

    refresh()
    window.addEventListener('resize', refresh)
    window.addEventListener('scroll', refresh, true)
    const observer = new MutationObserver(refresh)
    observer.observe(document.body, { childList: true, subtree: true, attributes: true })

    return () => {
      window.removeEventListener('resize', refresh)
      window.removeEventListener('scroll', refresh, true)
      observer.disconnect()
    }
  }, [step])

  // Escuchar clics en el elemento objetivo cuando el paso requiere interacción o navegación
  useEffect(() => {
    const onTargetClick = (event: MouseEvent) => {
      if (step.interaction === 'navigate') {
        const element = findTargetElement(step.target)
        if (element && event.target instanceof Element && element.contains(event.target)) {
          // El usuario clickeó el control real
          window.setTimeout(() => {
            setIndex((curr) => Math.min(curr + 1, plan.steps.length - 1))
          }, 60)
        }
      }
    }

    document.addEventListener('click', onTargetClick, true)
    return () => document.removeEventListener('click', onTargetClick, true)
  }, [step, plan.steps.length])

  // Si el paso requería navegar a un módulo y ya estamos en él
  useEffect(() => {
    if (step.interaction === 'navigate' && step.advancesOn === 'module' && activeModule === step.module) {
      // Ya estamos en el módulo requerido
    }
  }, [activeModule, step])

  // Tecla Escape para salir
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onDismiss()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onDismiss])

  const finish = useCallback(() => {
    onComplete()
    onDismiss()
  }, [onComplete, onDismiss])

  const next = useCallback(() => {
    if (index >= plan.steps.length - 1) {
      finish()
    } else {
      setIndex((curr) => curr + 1)
    }
  }, [index, plan.steps.length, finish])

  const prev = useCallback(() => {
    setIndex((curr) => Math.max(0, curr - 1))
  }, [])

  // Calcular posición de la tarjeta
  const viewport: TutorialViewport = {
    width: typeof window !== 'undefined' ? window.innerWidth : 1024,
    height: typeof window !== 'undefined' ? window.innerHeight : 768,
  }

  const placement = rect
    ? calculateTutorialCardPlacement(rect, viewport, cardDimensions)
    : {
        top: Math.max(20, Math.min(100, viewport.height * 0.15)),
        left: Math.max(12, Math.min(24, (viewport.width - 340) / 2)),
        width: Math.min(340, viewport.width - 24),
        maxHeight: 320,
        side: 'below' as const,
      }

  return (
    <aside aria-label="Tutorial guiado interactivo" className="fixed inset-0 z-[1000] pointer-events-none" aria-live="polite">
      {/* 4 cuadrantes oscurecidos para el efecto spotlight */}
      {rect ? (
        <>
          <div
            className="fixed left-0 top-0 bg-slate-950/60 pointer-events-none"
            style={{ width: '100vw', height: Math.max(0, rect.top) }}
          />
          <div
            className="fixed bottom-0 left-0 bg-slate-950/60 pointer-events-none"
            style={{ width: '100vw', top: rect.top + rect.height }}
          />
          <div
            className="fixed left-0 bg-slate-950/60 pointer-events-none"
            style={{ top: rect.top, width: Math.max(0, rect.left), height: rect.height }}
          />
          <div
            className="fixed right-0 bg-slate-950/60 pointer-events-none"
            style={{ top: rect.top, left: rect.left + rect.width, height: rect.height }}
          />
          {/* Anillo de enfoque sobre el control verdadero */}
          <div
            className="fixed rounded-xl ring-4 ring-sky-400 ring-offset-2 ring-offset-white pointer-events-none shadow-lg transition-all duration-200"
            style={{
              top: rect.top - 2,
              left: rect.left - 2,
              width: rect.width + 4,
              height: rect.height + 4,
            }}
          />
        </>
      ) : (
        <div className="fixed inset-0 bg-slate-950/60 pointer-events-none" />
      )}

      {/* Tarjeta flotante de instrucciones */}
      <div
        ref={cardRef}
        role="dialog"
        aria-modal="false"
        aria-label={`${plan.title}: ${step.title}`}
        className="fixed z-[1002] pointer-events-auto rounded-2xl bg-white p-4 sm:p-5 shadow-2xl border border-slate-200/90 transition-all duration-200"
        style={{
          top: placement.top,
          left: placement.left,
          width: placement.width,
          maxHeight: placement.maxHeight,
        }}
      >
        {/* Cabecera del paso */}
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-2.5">
          <div className="min-w-0">
            <div className="inline-flex items-center gap-1.5 text-[10px] sm:text-[11px] font-extrabold uppercase tracking-wider text-sky-600">
              <span>{plan.title}</span>
              <span className="text-slate-300">·</span>
              <span className="text-slate-500">Paso {index + 1} de {plan.steps.length}</span>
            </div>
            <h2 className="mt-0.5 text-sm sm:text-base font-extrabold text-slate-950 leading-tight">
              {step.title}
            </h2>
          </div>
          <button
            type="button"
            onClick={onDismiss}
            className="rounded-lg p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer shrink-0"
            aria-label="Cerrar u omitir tutorial"
          >
            <X size={16} />
          </button>
        </div>

        {/* Explicación y aviso de elemento no presente */}
        <div className="py-3 text-xs sm:text-[13px] text-slate-600 leading-relaxed overflow-y-auto max-h-[160px] pr-1">
          {missingTarget ? (
            <div className="flex items-start gap-2 text-amber-800 bg-amber-50 p-2.5 rounded-xl border border-amber-200 mb-2">
              <AlertCircle size={16} className="shrink-0 mt-0.5 text-amber-600" />
              <div>
                <p className="font-semibold text-xs text-amber-900">Control en preparación</p>
                <p className="text-[11px] mt-0.5">
                  {step.missingMessage || 'El elemento resaltado no está visible en esta pantalla o aún se está cargando. Puedes continuar al siguiente paso o pulsar el módulo en el menú.'}
                </p>
              </div>
            </div>
          ) : (
            <p>{step.explanation}</p>
          )}

          {step.requiredActionHint && !missingTarget && (
            <div className="mt-2 rounded-xl bg-sky-50 p-2 text-[11px] font-semibold text-sky-900 border border-sky-100">
              {step.requiredActionHint}
            </div>
          )}
        </div>

        {/* Barra de progreso y botones de navegación */}
        <div className="flex items-center justify-between gap-2 pt-2.5 border-t border-slate-100 mt-1">
          <button
            type="button"
            disabled={index === 0}
            onClick={prev}
            className="inline-flex items-center gap-1 rounded-xl px-2.5 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-100 disabled:opacity-30 disabled:pointer-events-none transition cursor-pointer"
          >
            <ArrowLeft size={14} />
            <span>Anterior</span>
          </button>

          <div className="flex items-center gap-1.5">
            <span className="text-[10px] font-semibold text-slate-400">
              {index + 1}/{plan.steps.length}
            </span>
            <button
              type="button"
              onClick={next}
              className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 px-3 py-1.5 text-xs font-bold text-white shadow-xs transition cursor-pointer"
            >
              <span>{index === plan.steps.length - 1 ? 'Finalizar' : 'Siguiente'}</span>
              <ArrowRight size={14} />
            </button>
          </div>
        </div>
      </div>
    </aside>
  )
}
