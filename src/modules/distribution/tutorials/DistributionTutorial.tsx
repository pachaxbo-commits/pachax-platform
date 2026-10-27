import { useEffect, useLayoutEffect, useState, useCallback, useMemo, useRef } from 'react'
import { ArrowLeft, ArrowRight, X, AlertCircle, Compass } from 'lucide-react'
import type { ModuleId } from '../../../config/businessTypes.ts'
import type { DistributionTutorialPlan, DistributionTutorialStep } from './distributionTutorials.ts'
import type { DistributionData } from '../state/useDistributionStore.ts'
import { calculateTutorialCardPlacement, type TutorialRect, type TutorialViewport } from './tutorialLayout.ts'

interface DistributionTutorialProps {
  plan: DistributionTutorialPlan
  activeModule: ModuleId
  data?: DistributionData
  onNavigate?: (module: ModuleId) => void
  onDismiss: () => void
  onComplete: () => void
  onStepChange?: (stepIndex: number) => void
  initialStepIndex?: number
  isContinuous?: boolean
  onPause?: (stepIndex: number) => void
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
  if (typeof document === 'undefined') return null

  // 1. Selector directo data-tour
  const byDataTour = document.querySelector<HTMLElement>(`[data-tour="${targetKey}"]`)
  if (byDataTour) return byDataTour

  // 2. Selectores heurísticos de controles en la UI
  switch (targetKey) {
    case 'header-identity':
      return document.querySelector<HTMLElement>('header') || document.querySelector<HTMLElement>('[data-tour="header"]')
    case 'dashboard-kpis':
      return document.querySelector<HTMLElement>('[data-tour="kpi-grid"]') || document.querySelector<HTMLElement>('main .grid')
    case 'distributor-home-summary':
      return document.querySelector<HTMLElement>('[data-tour="distributor-summary"]') || document.querySelector<HTMLElement>('main')
    case 'bottom-nav':
      return document.querySelector<HTMLElement>('nav') || document.querySelector<HTMLElement>('[role="navigation"]')
    case 'tutorial-trigger-btn':
      return document.querySelector<HTMLElement>('button[data-tour="tutorial-trigger"]') || document.querySelector<HTMLElement>('button[aria-label="Abrir centro de aprendizaje"]')
    case 'inventory-stock-table':
      return document.querySelector<HTMLElement>('table') || document.querySelector<HTMLElement>('[data-tour="stock-list"]')
    case 'inventory-entry-btn':
      return document.querySelector<HTMLElement>('button[data-tour="new-entry-btn"]')
    case 'routes-dispatch-table':
      return document.querySelector<HTMLElement>('[data-tour="dispatch-board"]') || document.querySelector<HTMLElement>('main')
    case 'routes-add-dispatch-btn':
      return document.querySelector<HTMLElement>('button[data-tour="add-dispatch"]')
    case 'sell-customer-selector':
      return document.querySelector<HTMLElement>('[data-tour="customer-select"]') || document.querySelector<HTMLElement>('select')
    case 'sell-product-grid':
      return document.querySelector<HTMLElement>('[data-tour="catalog-grid"]') || document.querySelector<HTMLElement>('main')
    case 'sell-checkout-btn':
      return document.querySelector<HTMLElement>('button[data-tour="checkout-btn"]')
    case 'closures-cash-count':
      return document.querySelector<HTMLElement>('[data-tour="cash-reconciliation"]') || document.querySelector<HTMLElement>('main')
    case 'closures-confirm-btn':
      return document.querySelector<HTMLElement>('button[data-tour="confirm-closure-btn"]')
    default:
      return null
  }
}

export function DistributionTutorial({
  plan,
  activeModule,
  data,
  onNavigate,
  onDismiss,
  onComplete,
  onStepChange,
  initialStepIndex = 0,
  isContinuous = false,
  onPause,
}: DistributionTutorialProps) {
  const [index, setIndex] = useState(() => Math.max(0, Math.min(initialStepIndex, plan.steps.length - 1)))
  const [rect, setRect] = useState<TutorialRect | null>(null)
  const [missingTarget, setMissingTarget] = useState(false)
  const cardRef = useRef<HTMLDivElement>(null)
  const [cardDimensions, setCardDimensions] = useState({ width: 340, height: 230 })

  const step: DistributionTutorialStep = plan.steps[index] || plan.steps[0]

  // Baselines de datos al entrar a un nuevo paso para verificar ledger sin efectos en render
  const [prevStepId, setPrevStepId] = useState(step.id)
  const [domActionCompleted, setDomActionCompleted] = useState(false)
  const [baseline, setBaseline] = useState(() => ({
    sales: data?.sales.length ?? 0,
    receivables: data?.receivables.length ?? 0,
    collections: data?.collections.length ?? 0,
    expenses: data?.expenses.length ?? 0,
    closures: data?.closures.length ?? 0,
  }))

  if (step.id !== prevStepId) {
    setPrevStepId(step.id)
    setDomActionCompleted(false)
    setBaseline({
      sales: data?.sales.length ?? 0,
      receivables: data?.receivables.length ?? 0,
      collections: data?.collections.length ?? 0,
      expenses: data?.expenses.length ?? 0,
      closures: data?.closures.length ?? 0,
    })
  }

  // Verificación de operaciones de negocio según diferencias reales en el ledger
  const isDataOperationCompleted = useMemo(() => {
    if (!step.verifiedOperation) return false
    switch (step.verifiedOperation) {
      case 'confirm_sale':
        return (data?.sales.length ?? 0) > baseline.sales
      case 'register_credit':
        return (data?.receivables.length ?? 0) > baseline.receivables
      case 'register_collection':
        return (data?.collections.length ?? 0) > baseline.collections
      case 'register_expense':
        return (data?.expenses.length ?? 0) > baseline.expenses
      case 'day_closure':
        return (data?.closures.length ?? 0) > baseline.closures
      default:
        return false
    }
  }, [step.verifiedOperation, data, baseline])

  // Verificación de elementos DOM específicos (cliente seleccionado o producto agregado al carrito)
  const checkDomSatisfaction = useCallback((): boolean => {
    if (step.verifiedOperation === 'select_customer') {
      const el = findTargetElement('sell-customer-selector')
      const custId = el?.getAttribute('data-customer-id')
      return Boolean(custId && custId.length > 0)
    }
    if (step.verifiedOperation === 'add_to_cart') {
      const checkoutBtn = findTargetElement('sell-checkout-btn')
      return Boolean(checkoutBtn)
    }
    return false
  }, [step.verifiedOperation])

  // Satisfacción total del paso
  const hasActed =
    step.interaction === 'observe'
      ? true
      : step.interaction === 'navigate'
        ? activeModule === step.module
        : isDataOperationCompleted || domActionCompleted

  // Notificar cambio de paso solo cuando el índice cambia efectivamente
  const onStepChangeRef = useRef(onStepChange)
  useEffect(() => {
    onStepChangeRef.current = onStepChange
  })

  useEffect(() => {
    onStepChangeRef.current?.(index)
  }, [index])

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

      setRect((curr) => (sameRect(curr, next) ? curr : next))
      setMissingTarget(false)

      if (!hasScrolled && bounds.width > 0 && bounds.height > 0) {
        hasScrolled = true
        element.scrollIntoView({
          behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
          block: 'center',
          inline: 'nearest',
        })
      }
    }

    refresh()
    window.addEventListener('resize', refresh)
    window.addEventListener('scroll', refresh, true)

    const observer = new MutationObserver(refresh)
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['data-tour', 'class'],
    })

    return () => {
      window.removeEventListener('resize', refresh)
      window.removeEventListener('scroll', refresh, true)
      observer.disconnect()
    }
  }, [step])

  // Interacción en vivo: detectar clic sobre el objetivo
  useEffect(() => {
    const onTargetClick = (event: MouseEvent) => {
      const el = findTargetElement(step.target)
      if (!el) return

      const clicked = event.target instanceof Element && (event.target === el || el.contains(event.target))
      if (!clicked) return

      if (step.interaction === 'navigate' && step.module && onNavigate) {
        onNavigate(step.module)
      } else if (step.verifiedOperation === 'select_customer' || step.verifiedOperation === 'add_to_cart') {
        window.setTimeout(() => {
          if (checkDomSatisfaction()) {
            setDomActionCompleted(true)
          }
        }, 50)
      }
    }

    document.addEventListener('click', onTargetClick, true)
    return () => document.removeEventListener('click', onTargetClick, true)
  }, [step.target, step.interaction, step.module, step.verifiedOperation, onNavigate, checkDomSatisfaction])

  // Tecla Escape para salir o pausar
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (isContinuous && onPause) {
          onPause(index)
        } else {
          onDismiss()
        }
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onDismiss, onPause, isContinuous, index])

  // Finalización mutuamente excluyente de omisión: SOLO llama a onComplete
  const finish = useCallback(() => {
    onComplete()
  }, [onComplete])

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
        maxHeight: viewport.height - 40,
        flipCard: false,
      }

  return (
    <aside
      aria-label={`Tutorial interactivo: ${plan.title}`}
      className="fixed inset-0 z-[1000] pointer-events-none transition-all duration-300"
    >
      {/* 4 Franjas de oscurecimiento exterior */}
      {rect && rect.width > 0 && rect.height > 0 ? (
        <>
          <div
            className="fixed left-0 top-0 bg-slate-950/65 backdrop-blur-[1px] transition-all duration-200"
            style={{ width: '100vw', height: Math.max(0, rect.top) }}
          />
          <div
            className="fixed bottom-0 left-0 bg-slate-950/65 backdrop-blur-[1px] transition-all duration-200"
            style={{ width: '100vw', top: Math.max(0, rect.top + rect.height) }}
          />
          <div
            className="fixed left-0 bg-slate-950/65 backdrop-blur-[1px] transition-all duration-200"
            style={{
              top: Math.max(0, rect.top),
              width: Math.max(0, rect.left),
              height: Math.max(0, rect.height),
            }}
          />
          <div
            className="fixed right-0 bg-slate-950/65 backdrop-blur-[1px] transition-all duration-200"
            style={{
              top: Math.max(0, rect.top),
              left: Math.max(0, rect.left + rect.width),
              height: Math.max(0, rect.height),
            }}
          />

          {/* Anillo de resalte amarillo/ámbar */}
          <div
            className="pointer-events-none fixed rounded-2xl ring-4 ring-amber-400 ring-offset-2 ring-offset-slate-950/30 transition-all duration-200 animate-pulse"
            style={{
              top: rect.top,
              left: rect.left,
              width: rect.width,
              height: rect.height,
            }}
          />
        </>
      ) : (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-[1px]" />
      )}

      {/* Tarjeta Flotante Inteligente */}
      <div
        ref={cardRef}
        role="dialog"
        aria-modal="false"
        aria-label={`${plan.title}: ${step.title}`}
        className="pointer-events-auto fixed z-[1002] rounded-3xl bg-white p-4 sm:p-5 shadow-2xl border border-slate-200/90 text-slate-900 transition-all duration-200 flex flex-col justify-between"
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
          <div className="flex items-center gap-1 shrink-0">
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
              onClick={onDismiss}
              className="rounded-lg p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer shrink-0"
              aria-label="Cerrar u omitir tutorial"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Explicación y diagnóstico de control no visible */}
        <div className="py-3 text-xs sm:text-[13px] text-slate-600 leading-relaxed overflow-y-auto max-h-[180px] pr-1">
          {missingTarget ? (
            <div className="flex flex-col gap-2 rounded-xl border border-amber-200 bg-amber-50 p-2.5 text-amber-900 mb-2">
              <div className="flex items-start gap-2">
                <AlertCircle size={16} className="shrink-0 mt-0.5 text-amber-600" />
                <div className="min-w-0 flex-1">
                  <p className="font-bold text-xs text-amber-950">Control no visible en pantalla</p>
                  <p className="text-[11px] mt-0.5 leading-relaxed text-amber-800">
                    {step.missingMessage || 'El elemento resaltado no se encuentra visible en esta vista o aún se está cargando.'}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-amber-200/60">
                {step.module && activeModule !== step.module && onNavigate && (
                  <button
                    type="button"
                    onClick={() => onNavigate(step.module)}
                    className="inline-flex items-center gap-1 rounded-lg bg-amber-600 hover:bg-amber-700 text-white px-2.5 py-1 text-[11px] font-bold transition cursor-pointer"
                  >
                    <Compass size={13} />
                    <span>Ir a {step.module.replace('dist.', '')}</span>
                  </button>
                )}
                {step.optional && (
                  <button
                    type="button"
                    onClick={next}
                    className="rounded-lg bg-white border border-amber-300 text-amber-900 px-2 py-1 text-[11px] font-semibold hover:bg-amber-100 transition cursor-pointer"
                  >
                    Omitir este paso
                  </button>
                )}
                <button
                  type="button"
                  onClick={onDismiss}
                  className="rounded-lg text-amber-800 hover:text-amber-950 px-2 py-1 text-[11px] font-medium transition cursor-pointer"
                >
                  Pausar tutorial
                </button>
              </div>
            </div>
          ) : (
            <p>{step.explanation}</p>
          )}

          {step.requiredActionHint && !missingTarget && (
            <div className={`mt-2 rounded-xl p-2.5 text-[11px] font-bold border transition-colors ${
              hasActed
                ? 'bg-emerald-50 text-emerald-900 border-emerald-200'
                : 'bg-amber-50 text-amber-900 border-amber-200'
            }`}>
              <span className="block text-[10px] uppercase font-black tracking-wider opacity-80 mb-0.5">
                {hasActed ? '✓ Acción completada' : 'Acción requerida:'}
              </span>
              <span>{step.requiredActionHint}</span>
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
              disabled={!hasActed}
              onClick={next}
              className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-bold transition shadow-xs cursor-pointer ${
                hasActed
                  ? 'bg-slate-900 hover:bg-slate-800 text-white'
                  : 'bg-slate-200 text-slate-400 cursor-not-allowed opacity-60'
              }`}
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
