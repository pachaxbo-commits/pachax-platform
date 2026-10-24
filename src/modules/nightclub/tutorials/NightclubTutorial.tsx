import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import type { NightclubModuleId } from '../domain/nightclubAccounts'
import {
  createNightclubTutorialPlans,
  getNightclubTutorialProgressKey,
  getNightclubTutorialStatusLabel,
  getNightclubSafeResumeIndex,
  type NightclubTutorialProgress,
  type NightclubTutorialStep,
  type NightclubTutorialStatus,
} from './nightclubTutorials'
import { calculateTutorialCardPlacement, type TutorialViewport } from './tutorialLayout'

interface NightclubTutorialProps {
  open: boolean
  onClose: () => void
  actorKey: string
  role: string
  modules: readonly NightclubModuleId[]
  permissions: ReadonlySet<string>
  safePractice: boolean
  currentModule: NightclubModuleId
  moreOpen: boolean
  hasDraft: boolean
  hasPracticeDraft: boolean
  hasPracticeRound: boolean
  practiceRoundStatus?: string
  barTutorialRoundStatus?: string
  cashShiftStatus?: string
  cashPaymentAvailable?: boolean
  allowRolePreview?: boolean
  hasPracticeRon?: boolean
  hasPracticeCoca?: boolean
  hasPracticeProduct?: boolean
  practiceSaleExists?: boolean
  hasPracticeAccount?: boolean
  practiceRonBottleEnabled?: boolean
  practiceRonBottlePrice?: number
  practiceRonPourEnabled?: boolean
  practiceCocaLegacy?: boolean
  practiceCocaBottleEnabled?: boolean
  practiceCocaPourEnabled?: boolean
  practiceSaveVersion: number
  practiceProductVersion: number
  practiceAccountVersion: number
  onNavigate: (module: NightclubModuleId) => void
}

interface TutorialSession {
  actorKey: string
  tutorialId: string
  stepIndex: number
  paused: boolean
  practiceSaveBaseline: number
  practiceProductBaseline: number
  practiceAccountBaseline: number
  steps: NightclubTutorialStep[]
  skippedRequired: boolean
}

interface Spotlight {
  element: HTMLElement
  targetKey: string
  rect: { top: number; left: number; width: number; height: number }
  usingFallback: 'more' | 'cart' | null
}

interface DialogReservation { element: HTMLElement; marginTop: string; maxHeight: string }

const moduleTitles: Record<NightclubModuleId, string> = {
  dashboard: 'Inicio', floor: 'Zonas', pos: 'POS', accounts: 'Cuentas', bar: 'Barra', inventory: 'Inventario',
  products: 'Productos', cash: 'Caja', history: 'Historial', customers: 'Clientes', promoters: 'Relacionadores',
  members: 'Socios', users: 'Usuarios', reports: 'Reportes', settings: 'Configuración',
}

function visible(element: HTMLElement): boolean {
  const rect = element.getBoundingClientRect()
  const style = window.getComputedStyle(element)
  return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden'
}

function findTarget(key?: string, includeDisabled = false): HTMLElement | null {
  if (!key) return null
  if (key.startsWith('section-')) {
    const heading = document.querySelector<HTMLElement>('.nightclub-shell main h1')
    return heading && visible(heading) ? heading : null
  }
  const elements = Array.from(document.querySelectorAll<HTMLElement>('[data-tutorial-target]'))
  return elements.find(element => element.dataset.tutorialTarget === key && visible(element) && (includeDisabled || (!element.hasAttribute('disabled') && element.getAttribute('aria-disabled') !== 'true'))) || null
}

function hasVisibleTarget(key?: string): boolean {
  if (!key) return false
  return Array.from(document.querySelectorAll<HTMLElement>('[data-tutorial-target]')).some(element => element.dataset.tutorialTarget === key && visible(element))
}

function stepCondition(step: NightclubTutorialStep, props: NightclubTutorialProps, session: TutorialSession): boolean {
  if (step.advancesOn === 'module') return props.currentModule === step.module
  if (step.advancesOn === 'draft') return props.hasDraft
  if (step.advancesOn === 'practice-draft') return props.hasPracticeDraft
  if (step.advancesOn === 'practice-round') return props.hasPracticeRound
  if (step.advancesOn === 'round-preparing') return props.barTutorialRoundStatus === 'preparing'
  if (step.advancesOn === 'round-ready') return props.barTutorialRoundStatus === 'ready'
  if (step.advancesOn === 'round-delivered') return props.practiceRoundStatus === 'delivered'
  if (step.advancesOn === 'practice-ron' || step.advancesOn === 'practice-coca') return props.practiceSaveVersion > session.practiceSaveBaseline
  if (step.advancesOn === 'practice-product') return props.practiceProductVersion > session.practiceProductBaseline
  if (step.advancesOn === 'practice-account') return props.practiceAccountVersion > session.practiceAccountBaseline
  return true
}

export function NightclubTutorial(props: NightclubTutorialProps) {
  const { onClose } = props
  const { currentModule, moreOpen, onNavigate } = props
  const [session, setSession] = useState<TutorialSession | null>(null)
  const [selection, setSelection] = useState<{ actorKey: string; tutorialId: string } | null>(null)
  const [progressByActor, setProgressByActor] = useState<Record<string, NightclubTutorialProgress>>(() => {
    try {
      const saved = localStorage.getItem('pachax:nightclub:tutorial-progress:v1')
      if (!saved) return {}
      const parsed: unknown = JSON.parse(saved)
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
      return Object.fromEntries(Object.entries(parsed).filter(([, value]) => {
        if (!value || typeof value !== 'object') return false
        const entry = value as Partial<NightclubTutorialProgress>
        return ['not_started', 'in_progress', 'completed', 'omitted'].includes(entry.status || '') && Number.isInteger(entry.stepIndex) && Number(entry.stepIndex) >= 0
      })) as Record<string, NightclubTutorialProgress>
    } catch {
      return {}
    }
  })
  const [targetClicked, setTargetClicked] = useState(false)
  const [spotlight, setSpotlight] = useState<Spotlight | null>(null)
  const [targetMissing, setTargetMissing] = useState(false)
  const panelRef = useRef<HTMLElement>(null)
  const targetRef = useRef<HTMLElement | null>(null)
  const interactionStartRef = useRef<{ target: HTMLElement; value: string; checked: boolean } | null>(null)
  const reservedDialogRef = useRef<DialogReservation | null>(null)
  const plans = useMemo(() => createNightclubTutorialPlans({ role: props.role, modules: props.modules, permissions: props.permissions, safePractice: props.safePractice, allowRolePreview: props.allowRolePreview, practiceSaleExists: props.practiceSaleExists, hasPracticeAccount: props.hasPracticeAccount, hasPracticeRon: props.hasPracticeRon, practiceRonBottleEnabled: props.practiceRonBottleEnabled, practiceRonBottlePrice: props.practiceRonBottlePrice, practiceRonPourEnabled: props.practiceRonPourEnabled, hasPracticeCoca: props.hasPracticeCoca, practiceCocaLegacy: props.practiceCocaLegacy, practiceCocaBottleEnabled: props.practiceCocaBottleEnabled, practiceCocaPourEnabled: props.practiceCocaPourEnabled, cashShiftOpen: props.cashShiftStatus === 'open', cashPaymentAvailable: props.cashPaymentAvailable, barRoundStatus: props.barTutorialRoundStatus }), [props.role, props.modules, props.permissions, props.safePractice, props.allowRolePreview, props.practiceSaleExists, props.hasPracticeAccount, props.hasPracticeRon, props.practiceRonBottleEnabled, props.practiceRonBottlePrice, props.practiceRonPourEnabled, props.hasPracticeCoca, props.practiceCocaLegacy, props.practiceCocaBottleEnabled, props.practiceCocaPourEnabled, props.cashShiftStatus, props.cashPaymentAvailable, props.barTutorialRoundStatus])
  const tutorialId = (selection?.actorKey === props.actorKey ? selection.tutorialId : plans[0]?.id) || ''
  const selectedPlan = plans.find(plan => plan.id === tutorialId) || plans[0]
  const progressKey = getNightclubTutorialProgressKey(props.actorKey, selectedPlan?.id || '')
  const activeSession = session?.actorKey === props.actorKey && session?.tutorialId === selectedPlan?.id ? session : null
  const steps = useMemo(() => activeSession?.steps || selectedPlan?.steps || [], [activeSession?.steps, selectedPlan])
  const progress = progressByActor[progressKey] || { status: 'not_started' as const, stepIndex: 0 }
  const activeStep = activeSession && !activeSession.paused ? steps[activeSession.stepIndex] : null
  const [viewport, setViewport] = useState<TutorialViewport>(() => ({ width: window.innerWidth, height: window.innerHeight }))
  const [panelHeight, setPanelHeight] = useState(320)
  const [, refreshDom] = useReducer((revision: number) => revision + 1, 0)
  const refreshViewport = useCallback(() => {
    const next = { width: window.innerWidth, height: window.innerHeight }
    setViewport(previous => previous.width === next.width && previous.height === next.height ? previous : next)
  }, [])

  const saveProgress = useCallback((status: NightclubTutorialStatus, stepIndex: number, skippedRequired = false) => {
    setProgressByActor(previous => ({ ...previous, [progressKey]: { status, stepIndex, skippedRequired } }))
  }, [progressKey])

  useEffect(() => {
    try {
      localStorage.setItem('pachax:nightclub:tutorial-progress:v1', JSON.stringify(progressByActor))
    } catch {
      // Tutorial progress remains available for the current session if browser storage is unavailable.
    }
  }, [progressByActor])

  const openIntro = () => {
    if (progress.status === 'in_progress' && selectedPlan) {
      const stepIndex = getNightclubSafeResumeIndex(selectedPlan.steps, progress.stepIndex, { hasPracticeRon: props.hasPracticeRon, hasPracticeCoca: props.hasPracticeCoca, hasPracticeProduct: props.hasPracticeProduct, hasPracticeAccount: props.hasPracticeAccount, practiceSaleExists: props.practiceSaleExists, targetPresent: hasVisibleTarget(selectedPlan.steps[progress.stepIndex]?.target) })
      setSession({ actorKey: props.actorKey, tutorialId: selectedPlan.id, stepIndex, paused: false, practiceSaveBaseline: props.practiceSaveVersion, practiceProductBaseline: props.practiceProductVersion, practiceAccountBaseline: props.practiceAccountVersion, steps: selectedPlan.steps, skippedRequired: Boolean(progress.skippedRequired) })
    }
  }

  const start = () => {
    if (!steps.length || !selectedPlan) return
    saveProgress('in_progress', 0)
    setSession({ actorKey: props.actorKey, tutorialId: selectedPlan.id, stepIndex: 0, paused: false, practiceSaveBaseline: props.practiceSaveVersion, practiceProductBaseline: props.practiceProductVersion, practiceAccountBaseline: props.practiceAccountVersion, steps: selectedPlan.steps, skippedRequired: false })
    setTargetClicked(false)
  }

  const next = useCallback(() => {
    if (!activeSession) return
    const following = activeSession.stepIndex + 1
    if (following >= steps.length) {
      saveProgress(activeSession.skippedRequired ? 'omitted' : 'completed', steps.length, activeSession.skippedRequired)
      setSession(null)
      setSpotlight(null)
      setTargetClicked(false)
      return
    }
    saveProgress('in_progress', following, activeSession.skippedRequired)
    setSession({ ...activeSession, stepIndex: following, practiceSaveBaseline: props.practiceSaveVersion, practiceProductBaseline: props.practiceProductVersion, practiceAccountBaseline: props.practiceAccountVersion })
    setTargetClicked(false)
    requestAnimationFrame(() => {
      const target = findTarget(steps[following]?.target)
      if (target instanceof HTMLInputElement || target instanceof HTMLSelectElement || target instanceof HTMLTextAreaElement) target.focus({ preventScroll: true })
    })
  }, [activeSession, props.practiceSaveVersion, props.practiceProductVersion, props.practiceAccountVersion, saveProgress, steps])

  const canAdvance = Boolean(activeStep && activeSession && (
    activeStep.interaction === 'demo-operation' && ['practice-ron', 'practice-coca', 'practice-product', 'practice-account'].includes(activeStep.advancesOn || '')
      ? stepCondition(activeStep, props, activeSession)
      : activeStep.interaction === 'navigate'
      ? targetClicked && stepCondition(activeStep, props, activeSession)
      : activeStep.interaction === 'observe'
      ? true
      : targetClicked && stepCondition(activeStep, props, activeSession) && (activeStep.advancesOn !== 'click' || !hasVisibleTarget(activeStep.target) || hasVisibleTarget(steps[activeSession.stepIndex + 1]?.target))
  ))

  useEffect(() => {
    if (!activeStep || !activeSession || !canAdvance || activeStep.interaction === 'observe') return
    const frame = requestAnimationFrame(next)
    return () => cancelAnimationFrame(frame)
  }, [activeStep, activeSession, canAdvance, next])

  const locate = useCallback(() => {
    if (!activeStep || !activeSession || activeSession.paused) {
      targetRef.current = null
      setSpotlight(null)
      setTargetMissing(false)
      return
    }
    if (activeStep.module && currentModule !== activeStep.module && activeStep.interaction !== 'navigate') {
      targetRef.current = null
      setSpotlight(null)
      setTargetMissing(true)
      return
    }
    let element = findTarget(activeStep.target, activeStep.interaction === 'observe')
    let usingFallback: Spotlight['usingFallback'] = null
    if (!element && activeStep.target?.startsWith('nav-') && !moreOpen) {
      element = findTarget('nav-more')
      if (element) usingFallback = 'more'
    }
    if (!element && activeStep.target?.startsWith('pos-') && activeStep.target !== 'pos-cart-toggle') {
      element = findTarget('pos-cart-toggle')
      if (element) usingFallback = 'cart'
    }
    if (!element) {
      targetRef.current = null
      setSpotlight(null)
      setTargetMissing(Boolean(activeStep.target))
      return
    }
    setTargetMissing(false)
    if (targetRef.current !== element) {
      targetRef.current = element
      setTargetClicked(false)
      const control = element.matches('input,select,textarea') ? element : element.querySelector<HTMLElement>('input,select,textarea')
      const initial = control as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | null
      interactionStartRef.current = { target: initial || element, value: initial && 'value' in initial ? String(initial.value) : '', checked: initial instanceof HTMLInputElement ? initial.checked : false }
      element.scrollIntoView({ behavior: 'instant', block: 'center', inline: 'nearest' })
    }
    let rect = element.getBoundingClientRect()
    if (rect.height < window.innerHeight && (rect.top < 8 || rect.bottom > window.innerHeight - 8)) {
      element.scrollIntoView({ behavior: 'instant', block: 'center', inline: 'nearest' })
      rect = element.getBoundingClientRect()
    }
    const nextSpotlight: Spotlight = { element, targetKey: activeStep.target || '', rect: { top: rect.top, left: rect.left, width: rect.width, height: rect.height }, usingFallback }
    setSpotlight(previous => {
      if (previous?.element === element && previous.usingFallback === usingFallback && Math.abs(previous.rect.top - nextSpotlight.rect.top) < 1 && Math.abs(previous.rect.left - nextSpotlight.rect.left) < 1 && Math.abs(previous.rect.width - nextSpotlight.rect.width) < 1 && Math.abs(previous.rect.height - nextSpotlight.rect.height) < 1) return previous
      return nextSpotlight
    })
  }, [activeStep, activeSession, currentModule, moreOpen])

  useEffect(() => {
    let frame = requestAnimationFrame(locate)
    if (!activeStep || !activeSession || activeSession.paused) return
    const refresh = () => {
      cancelAnimationFrame(frame)
      refreshDom()
      frame = requestAnimationFrame(() => {
        refreshViewport()
        locate()
      })
    }
    window.addEventListener('resize', refresh)
    window.addEventListener('scroll', refresh, true)
    const observer = new MutationObserver(refresh)
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'disabled', 'data-tutorial-state'] })
    const resizeObserver = new ResizeObserver(entries => {
      refresh()
      if (panelRef.current && entries.some(entry => entry.target === panelRef.current)) {
        const height = panelRef.current.scrollHeight
        setPanelHeight(previous => Math.abs(previous - height) > 1 ? height : previous)
      }
    })
    resizeObserver.observe(document.body)
    if (panelRef.current) resizeObserver.observe(panelRef.current)
    return () => { window.removeEventListener('resize', refresh); window.removeEventListener('scroll', refresh, true); observer.disconnect(); resizeObserver.disconnect(); cancelAnimationFrame(frame) }
  }, [locate, activeStep, activeSession, refreshViewport])

  useEffect(() => {
    const previous = reservedDialogRef.current
    const dialog = spotlight?.element.closest<HTMLElement>('[role="dialog"]') || null
    if (!spotlight || !dialog) {
      if (previous) {
        previous.element.style.marginTop = previous.marginTop
        previous.element.style.maxHeight = previous.maxHeight
        reservedDialogRef.current = null
      }
      return
    }
    const rect = dialog.getBoundingClientRect()
    const placement = calculateTutorialCardPlacement(spotlight.rect, viewport, { width: 360, height: panelHeight }, { top: rect.top, left: rect.left, width: rect.width, height: rect.height })
    const fitsBesideDialog = placement.side === 'left' || placement.side === 'right'
    if (fitsBesideDialog) {
      if (previous) {
        previous.element.style.marginTop = previous.marginTop
        previous.element.style.maxHeight = previous.maxHeight
        reservedDialogRef.current = null
      }
      return
    }
    if (previous && previous.element !== dialog) {
      previous.element.style.marginTop = previous.marginTop
      previous.element.style.maxHeight = previous.maxHeight
      reservedDialogRef.current = null
    }
    if (!reservedDialogRef.current) {
      reservedDialogRef.current = { element: dialog, marginTop: dialog.style.marginTop, maxHeight: dialog.style.maxHeight }
    }
    dialog.style.marginTop = `${Math.min(panelHeight + 24, Math.max(120, viewport.height * 0.3))}px`
    dialog.style.maxHeight = `calc(100vh - ${Math.min(panelHeight + 40, Math.max(136, viewport.height * 0.34))}px)`
    requestAnimationFrame(() => {
      refreshViewport()
      locate()
    })
  }, [spotlight, viewport, panelHeight, locate, refreshViewport])

  useEffect(() => {
    if (!props.open || !activeStep || !activeSession || activeSession.paused) return
    const onClick = (event: MouseEvent) => {
      const path = event.composedPath()
      if (panelRef.current && path.includes(panelRef.current)) return
      const target = targetRef.current?.dataset.tutorialTarget === activeStep.target ? targetRef.current : findTarget(activeStep.target, activeStep.interaction === 'observe')
      const clickedTarget = Boolean(target && path.some(node => node === target || (node instanceof Node && target.contains(node))))
      const permitted = activeStep.interaction !== 'observe' && (activeStep.interaction !== 'demo-operation' || props.safePractice)
      if (!clickedTarget || !permitted) {
        event.preventDefault()
        event.stopPropagation()
        event.stopImmediatePropagation()
        return
      }
      const control = event.target instanceof Element ? event.target.closest('input,select,textarea') : null
      if (activeStep.advancesOn && !['enter', 'select', 'input', 'change'].includes(activeStep.advancesOn) && !(control instanceof HTMLInputElement && ['checkbox', 'radio'].includes(control.type))) setTargetClicked(true)
    }
    const onInput = (event: Event) => {
      if (event.type === 'input' && activeStep.advancesOn !== 'input') return
      if (event.type === 'change' && !['change', 'select', 'click'].includes(activeStep.advancesOn || '')) return
      const target = targetRef.current?.dataset.tutorialTarget === activeStep.target ? targetRef.current : findTarget(activeStep.target)
      if (!target || !(event.target instanceof Node) || !(event.target === target || target.contains(event.target))) return
      if (activeStep.advancesOn === 'select') {
        const control = event.target instanceof HTMLSelectElement ? event.target : null
        if (!control || !control.value || !control.checkValidity()) return
        const start = interactionStartRef.current
        if (start?.target === control && start.value !== control.value) setTargetClicked(true)
      } else if (activeStep.advancesOn === 'click') {
        const control = event.target instanceof HTMLInputElement && ['checkbox', 'radio'].includes(event.target.type) ? event.target : null
        const start = interactionStartRef.current
        if (control && start?.target === control && start.checked !== control.checked && control.checkValidity()) setTargetClicked(true)
      } else if (activeStep.advancesOn === 'input' || activeStep.advancesOn === 'change') setTargetClicked(true)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Enter') return
      const focused = document.activeElement
      if (focused instanceof HTMLTextAreaElement) return
      if (focused instanceof HTMLSelectElement) {
        const target = targetRef.current?.dataset.tutorialTarget === activeStep.target ? targetRef.current : findTarget(activeStep.target)
        if (activeStep.advancesOn === 'select' && target && (focused === target || target.contains(focused)) && focused.value && focused.checkValidity()) {
          event.preventDefault()
          event.stopPropagation()
          event.stopImmediatePropagation()
          setTargetClicked(true)
        }
        return
      }
      if (!(focused instanceof HTMLInputElement) || focused.type === 'submit') return
      event.preventDefault()
      event.stopPropagation()
      event.stopImmediatePropagation()
      const target = targetRef.current?.dataset.tutorialTarget === activeStep.target ? targetRef.current : findTarget(activeStep.target)
      if (activeStep.advancesOn !== 'enter' || !target || !(focused === target || target.contains(focused))) return
      if (!focused.checkValidity() || !focused.value.trim()) return
      setTargetClicked(true)
    }
    document.addEventListener('click', onClick, true)
    document.addEventListener('input', onInput, true)
    document.addEventListener('change', onInput, true)
    document.addEventListener('keydown', onKeyDown, true)
    return () => { document.removeEventListener('click', onClick, true); document.removeEventListener('input', onInput, true); document.removeEventListener('change', onInput, true); document.removeEventListener('keydown', onKeyDown, true) }
  }, [props.open, props.safePractice, activeStep, activeSession, next])

  useEffect(() => () => {
    const reservation = reservedDialogRef.current
    if (!reservation) return
    reservation.element.style.marginTop = reservation.marginTop
    reservation.element.style.maxHeight = reservation.maxHeight
    reservedDialogRef.current = null
  }, [])

  const closeGuide = useCallback(() => {
    if (activeSession) saveProgress('in_progress', activeSession.stepIndex, activeSession.skippedRequired)
    setSession(null)
    setSpotlight(null)
    setTargetClicked(false)
    onClose()
  }, [activeSession, onClose, saveProgress])

  useEffect(() => {
    if (!props.open) return
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') closeGuide() }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [props.open, closeGuide])

  const omitTutorial = () => {
    saveProgress('omitted', 0)
    setSession(null)
    setSpotlight(null)
    props.onClose()
  }

  const skipStep = () => {
    if (!activeSession) return
    if (activeSession.stepIndex + 1 >= steps.length) {
      saveProgress(activeSession.skippedRequired || !activeStep?.optional ? 'omitted' : 'completed', steps.length, activeSession.skippedRequired || !activeStep?.optional)
      setSession(null)
      setSpotlight(null)
      return
    }
    const following = activeSession.stepIndex + 1
    const skippedRequired = activeSession.skippedRequired || !activeStep?.optional
    saveProgress('in_progress', following, skippedRequired)
    setSession({ ...activeSession, stepIndex: following, practiceSaveBaseline: props.practiceSaveVersion, practiceProductBaseline: props.practiceProductVersion, practiceAccountBaseline: props.practiceAccountVersion, skippedRequired })
    setTargetClicked(false)
  }

  if (!props.open) return null

  const statusLabel = getNightclubTutorialStatusLabel(progress.status)
  const spot = spotlight?.rect
  const avoidDialog = spotlight?.element.closest<HTMLElement>('[role="dialog"]')?.getBoundingClientRect()
  const spotlightInDialog = Boolean(spot && avoidDialog)
  const panelStyle: React.CSSProperties = spot
    ? (() => {
      const placement = calculateTutorialCardPlacement(spot, viewport, { width: 360, height: panelHeight }, avoidDialog ? { top: avoidDialog.top, left: avoidDialog.left, width: avoidDialog.width, height: avoidDialog.height } : undefined)
      return { top: placement.top, left: placement.left, width: placement.width, maxHeight: placement.maxHeight }
    })()
    : { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }
  const activeTarget = findTarget(activeStep?.target)
  const compactPanel = Boolean(viewport.height < 650 || Number(panelStyle.maxHeight) <= 250)
  const canContinueCurrentStep = Boolean(activeStep && (activeStep.interaction === 'observe' || canAdvance || (activeStep.advancesOn === 'select' && activeTarget instanceof HTMLSelectElement && Boolean(activeTarget.value) && activeTarget.checkValidity()) || (activeStep.advancesOn === 'enter' && activeTarget instanceof HTMLTextAreaElement)))
  const continueCurrentStep = activeStep?.interaction === 'observe' || activeStep?.advancesOn === 'select' || activeTarget instanceof HTMLTextAreaElement

  return <>
    {activeSession && !activeSession.paused && <>
      {spotlightInDialog && avoidDialog ? <>
        <div aria-hidden="true" className="fixed z-[110] pointer-events-none bg-black/65" style={{ top: 0, left: 0, right: 0, height: Math.max(0, avoidDialog.top) }} />
        <div aria-hidden="true" className="fixed z-[110] pointer-events-none bg-black/65" style={{ top: avoidDialog.top, left: 0, width: Math.max(0, avoidDialog.left), height: avoidDialog.height }} />
        <div aria-hidden="true" className="fixed z-[110] pointer-events-none bg-black/65" style={{ top: avoidDialog.top, left: avoidDialog.right, right: 0, height: avoidDialog.height }} />
        <div aria-hidden="true" className="fixed z-[110] pointer-events-none bg-black/65" style={{ top: avoidDialog.bottom, left: 0, right: 0, bottom: 0 }} />
      </> : <div aria-hidden="true" className={`fixed inset-0 z-[110] pointer-events-none ${spot ? '' : 'bg-black/65'}`} />}
      {spot && <div aria-hidden="true" className={`fixed z-[111] pointer-events-none rounded-xl border-2 border-amber-300 transition-all duration-200 ${spotlightInDialog ? 'shadow-[0_0_0_2px_rgba(251,191,36,.18),0_0_28px_rgba(251,191,36,.35)]' : 'shadow-[0_0_0_9999px_rgba(0,0,0,.66),0_0_28px_rgba(251,191,36,.45)]'}`} style={{ top: spot.top - 4, left: spot.left - 4, width: spot.width + 8, height: spot.height + 8 }} />}
    </>}
    <div className={`fixed z-[112] ${activeSession && !activeSession.paused ? 'w-[min(360px,calc(100vw-24px))]' : 'w-[min(500px,calc(100vw-24px))]'}`} style={activeSession && !activeSession.paused ? panelStyle : panelStyle}>
      <section ref={panelRef} data-nightclub-tutorial-panel role="dialog" aria-modal="true" aria-labelledby="nightclub-tutorial-title" style={{ maxHeight: spot ? panelStyle.maxHeight : 'calc(100dvh - 24px)' }} className={`overflow-y-auto overscroll-contain rounded-2xl border border-amber-300/35 bg-[#101a21] text-slate-100 shadow-2xl shadow-black/50 ${compactPanel ? 'p-2' : 'p-5'}`}>
        {!activeSession && <>
          <div className="flex items-start justify-between gap-4"><div><p className="text-[10px] font-bold uppercase tracking-[.18em] text-amber-300">Aprende en el sistema</p><h2 id="nightclub-tutorial-title" className="mt-1 text-xl font-bold">¿Cómo funciona?</h2></div><button type="button" aria-label="Cerrar tutorial" onClick={closeGuide} className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-white/15 text-xl">×</button></div>
          <p className="mt-3 text-sm leading-6 text-slate-300">Selecciona una guía disponible para tu perfil. Solo aparecen recorridos con secciones autorizadas.</p>
          {props.safePractice ? <p className="mt-3 rounded-xl border border-emerald-300/20 bg-emerald-300/10 p-3 text-xs leading-5 text-emerald-100">Estás en Demo/Studio aislado. Si eliges confirmar una práctica, cambiarás solo datos ficticios locales. El tutorial nunca ejecuta operaciones por ti.</p> : <p className="mt-3 rounded-xl border border-amber-300/20 bg-amber-300/10 p-3 text-xs leading-5 text-amber-100">Estás en el entorno tenant. El tutorial permite navegar y preparar un borrador, pero se detiene antes de abrir cuentas o confirmar ventas, pagos, inventario, reservas o entregas.</p>}
          <div className="mt-4 space-y-2" role="group" aria-label="Tutoriales disponibles">{plans.map(plan => {
            const key = getNightclubTutorialProgressKey(props.actorKey, plan.id)
            const planProgress = progressByActor[key] || { status: 'not_started' as const, stepIndex: 0 }
            return <button key={plan.id} type="button" data-tutorial-plan={plan.id} aria-pressed={plan.id === selectedPlan?.id} onClick={() => { setSelection({ actorKey: props.actorKey, tutorialId: plan.id }); setSession(null); setSpotlight(null) }} className={`block w-full rounded-xl border p-3 text-left ${plan.id === selectedPlan?.id ? 'border-amber-300/50 bg-amber-300/10' : 'border-white/10 bg-black/10'}`}><span className="flex items-center justify-between gap-3 text-sm font-bold"><span>{plan.title}</span><span className="text-xs font-medium text-amber-100">{getNightclubTutorialStatusLabel(planProgress.status)}{plan.id === plans[0]?.id ? ' · Recomendado' : ''}</span></span><span className="mt-1 block text-xs leading-5 text-slate-400">{plan.description}</span><span className="mt-1 block text-[11px] text-slate-500">{plan.steps.length} pasos · unos {Math.max(2, Math.ceil(plan.steps.length * 0.6))} minutos, según tu ritmo</span></button>
          })}</div>
          <div className="mt-3 flex items-center justify-between rounded-xl bg-black/20 px-3 py-2 text-xs"><span>{selectedPlan?.steps.length || 0} pasos · {selectedPlan?.title || 'Sin recorrido disponible'}</span><strong className="text-amber-200">{statusLabel}</strong></div>
          {!steps.length && <p className="mt-3 text-sm text-amber-100">No hay pasos disponibles para los permisos actuales.</p>}
          <div className="mt-4 flex flex-wrap gap-2"><button type="button" data-tutorial-start disabled={!steps.length} onClick={start} className="min-h-11 rounded-xl bg-amber-300 px-4 text-sm font-bold text-slate-950 disabled:opacity-40">{progress.status === 'in_progress' ? 'Reiniciar' : progress.status === 'completed' ? 'Repetir tutorial' : 'Comenzar tutorial'}</button>{progress.status === 'in_progress' && <button type="button" onClick={openIntro} className="min-h-11 rounded-xl border border-amber-300/40 px-4 text-sm font-semibold text-amber-100">Continuar donde quedé</button>}{progress.status !== 'omitted' && <button type="button" onClick={omitTutorial} className="min-h-11 rounded-xl border border-white/15 px-4 text-sm text-slate-300">Omitir tutorial</button>}</div>
        </>}
        {activeSession?.paused && <><div className="flex items-start justify-between gap-4"><div><p className="text-[10px] font-bold uppercase tracking-[.18em] text-amber-300">Tutorial pausado</p><h2 id="nightclub-tutorial-title" className="mt-1 text-xl font-bold">Puedes continuar cuando quieras</h2></div><button type="button" aria-label="Cerrar tutorial" onClick={closeGuide} className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-white/15 text-xl">×</button></div><p className="mt-3 text-sm text-slate-300">Se conserva este paso para el usuario, entorno y tutorial actuales. Al continuar, la guía volverá a la sección correspondiente.</p><div className="mt-4 flex gap-2"><button type="button" onClick={() => setSession({ ...activeSession, paused: false })} className="min-h-11 rounded-xl bg-amber-300 px-4 font-bold text-slate-950">Continuar</button><button type="button" onClick={closeGuide} className="min-h-11 rounded-xl border border-white/15 px-4">Salir</button></div></>}
        {activeStep && activeSession && !activeSession.paused && <>
          <div className={`sticky top-0 z-10 flex items-start justify-between bg-[#101a21] py-1 ${compactPanel ? 'gap-2' : 'gap-4'}`}><div><p className="text-[10px] font-bold uppercase tracking-[.18em] text-amber-300">Paso {activeSession.stepIndex + 1} de {steps.length}{spotlight?.usingFallback === 'more' ? ' · menú Más' : spotlight?.usingFallback === 'cart' ? ' · abrir panel' : ''}</p><h2 id="nightclub-tutorial-title" className={`${compactPanel ? 'mt-0 text-sm' : 'mt-1 text-xl'} font-bold`}>{activeStep.title}</h2></div><button type="button" aria-label="Pausar tutorial" onClick={() => setSession({ ...activeSession, paused: true })} className={`shrink-0 rounded-lg border border-white/15 px-3 text-xs ${compactPanel ? 'min-h-8' : 'min-h-10'}`}>Pausar</button></div>
          <p className={`${compactPanel ? 'mt-1 text-xs leading-4' : 'mt-3 text-sm leading-6'} text-slate-300`}>{spotlight?.usingFallback === 'more' ? `En esta pantalla, abre Más para encontrar ${activeStep.module ? moduleTitles[activeStep.module] : 'la sección'}.` : spotlight?.usingFallback === 'cart' ? 'Abre el panel del pedido para ver este control.' : activeStep.explanation}</p>
          {targetMissing && <div role="status" className="mt-3 rounded-xl border border-amber-300/20 bg-amber-300/10 p-3 text-xs leading-5 text-amber-100"><p>{activeStep.module && currentModule !== activeStep.module ? `Este paso está en ${moduleTitles[activeStep.module]}. Vuelve a esa sección para seguir.` : activeStep.missingMessage || 'Este control no está disponible en la vista actual.'}</p>{activeStep.module && currentModule !== activeStep.module && <button type="button" onClick={() => onNavigate(activeStep.module!)} className="mt-2 rounded-lg border border-amber-300/40 px-3 py-1.5 font-bold">Ir a {moduleTitles[activeStep.module]}</button>}</div>}
          {activeStep.interaction === 'observe' && <p className="mt-3 rounded-xl bg-black/20 p-3 text-xs text-slate-400">Lee la explicación y pulsa Continuar. El control resaltado queda bloqueado durante este paso.</p>}
          <div className={`${compactPanel ? 'mt-1' : 'mt-4'} sticky bottom-0 flex flex-wrap items-center justify-between gap-1 bg-[#101a21] py-1`}><div className="flex gap-1"><button type="button" disabled={activeSession.stepIndex === 0} onClick={() => { const previous = activeSession.stepIndex - 1; saveProgress('in_progress', previous, activeSession.skippedRequired); setSession({ ...activeSession, stepIndex: previous, practiceSaveBaseline: props.practiceSaveVersion, practiceProductBaseline: props.practiceProductVersion, practiceAccountBaseline: props.practiceAccountVersion }); setTargetClicked(false) }} className={`${compactPanel ? 'min-h-8' : 'min-h-10'} rounded-lg border border-white/15 px-2 text-xs disabled:opacity-40`}>Atrás</button><button type="button" onClick={closeGuide} className={`${compactPanel ? 'min-h-8' : 'min-h-10'} rounded-lg border border-white/15 px-2 text-xs`}>Salir</button></div><div className="flex gap-1">{(targetMissing || activeStep.optional) && <button type="button" onClick={skipStep} className={`${compactPanel ? 'min-h-8' : 'min-h-10'} rounded-lg border border-amber-300/30 px-2 text-xs text-amber-100`}>{activeStep.optional ? 'Omitir campo' : 'Omitir paso'}</button>}{canContinueCurrentStep && <button type="button" onClick={continueCurrentStep ? next : () => {}} className={`${compactPanel ? 'min-h-8' : 'min-h-10'} rounded-lg bg-amber-300 px-2 text-xs font-bold text-slate-950`}>Continuar</button>}</div></div>
        </>}
      </section>
    </div>
  </>
}
