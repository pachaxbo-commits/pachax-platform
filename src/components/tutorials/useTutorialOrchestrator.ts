import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import type {
  TutorialStorageScope,
  TutorialOrchestratorState,
  TutorialSectionItem,
  ContinuousTransitionState,
} from './tutorialOrchestratorTypes.ts'
import {
  loadTutorialOrchestratorState,
  saveTutorialOrchestratorState,
} from './tutorialOrchestratorStorage.ts'

interface UseTutorialOrchestratorOptions {
  scope: TutorialStorageScope
  sections: TutorialSectionItem[]
  onNavigateToModule: (moduleId: string) => void
  onOpenSectionTour: (sectionId: string, initialStepIndex?: number) => void
  onCloseSectionTour: (sectionId: string) => void
  onResetAllStatuses?: () => void
}

export function useTutorialOrchestrator({
  scope,
  sections,
  onNavigateToModule,
  onOpenSectionTour,
  onCloseSectionTour,
  onResetAllStatuses,
}: UseTutorialOrchestratorOptions) {
  const [state, setState] = useState<TutorialOrchestratorState>(() => {
    const loaded = loadTutorialOrchestratorState(scope)
    // On page reload: if sequence was active, pause it gracefully without losing cursor or causing duplicate runners
    if (loaded.isContinuousActive) {
      const paused: TutorialOrchestratorState = {
        ...loaded,
        isContinuousActive: false,
        isPaused: true,
      }
      saveTutorialOrchestratorState(scope, paused)
      return paused
    }
    return loaded
  })
  const [transitionState, setTransitionState] = useState<ContinuousTransitionState | null>(null)
  const [isSummaryOpen, setIsSummaryOpen] = useState(false)
  const transitionTimerRef = useRef<number | null>(null)

  // Scope tracking for dynamic role / template / dataset / uid switching
  const prevScopeRef = useRef(scope)
  useEffect(() => {
    const prev = prevScopeRef.current
    if (
      prev.template !== scope.template ||
      prev.role !== scope.role ||
      prev.profile !== scope.profile ||
      prev.datasetMode !== scope.datasetMode ||
      prev.tenantId !== scope.tenantId ||
      prev.uid !== scope.uid
    ) {
      prevScopeRef.current = scope
      if (transitionTimerRef.current) {
        window.clearTimeout(transitionTimerRef.current)
        transitionTimerRef.current = null
      }
      setTransitionState(null)
      setIsSummaryOpen(false)
      // Close previous tour when role / scope changes
      if (state.currentSectionId) {
        onCloseSectionTour(state.currentSectionId)
      }
      const reloaded = loadTutorialOrchestratorState(scope)
      setState(reloaded)
    }
  }, [scope, state.currentSectionId, onCloseSectionTour])

  // Sync state changes to storage
  const updateState = useCallback(
    (updater: (prev: TutorialOrchestratorState) => TutorialOrchestratorState) => {
      setState((prev) => {
        const next = updater(prev)
        saveTutorialOrchestratorState(scope, next)
        return next
      })
    },
    [scope]
  )

  // Real-time step cursor tracking within active tour
  const updateStepIndex = useCallback(
    (stepIndex: number) => {
      const safeStep = Math.max(0, Number.isFinite(stepIndex) ? stepIndex : 0)
      updateState((prev) => {
        if (prev.currentStepIndex === safeStep) return prev
        return {
          ...prev,
          currentStepIndex: safeStep,
        }
      })
    },
    [updateState]
  )

  // Sections by ID mapping
  const sectionsById = useMemo(() => {
    return new Map(sections.map((s) => [s.id, s]))
  }, [sections])

  // Is welcome open? Strictly in demo mode, if not yet dismissed, and sections exist
  const isWelcomeOpen = useMemo(() => {
    if (!scope.isDemo) return false
    if (sections.length === 0) return false
    if (state.welcomeDismissed) return false
    if (state.isContinuousActive) return false
    return true
  }, [scope.isDemo, sections.length, state.welcomeDismissed, state.isContinuousActive])

  // Clean transition timer on unmount
  useEffect(() => {
    return () => {
      if (transitionTimerRef.current) {
        window.clearTimeout(transitionTimerRef.current)
        transitionTimerRef.current = null
      }
    }
  }, [])

  // Start continuous sequence from beginning or first incomplete
  const startContinuousSequence = useCallback(
    (initialSectionId?: string, initialStepIndex = 0) => {
      if (sections.length === 0) return
      const targetSection = (initialSectionId ? sectionsById.get(initialSectionId) : null) || sections[0]
      const targetStep = Math.max(0, initialStepIndex)

      updateState((prev) => ({
        ...prev,
        welcomeDismissed: true,
        welcomeSkipped: false,
        isContinuousActive: true,
        isPaused: false,
        currentSectionId: targetSection.id,
        currentStepIndex: targetStep,
        completedAll: false,
      }))

      onNavigateToModule(targetSection.module)
      window.setTimeout(() => {
        onOpenSectionTour(targetSection.id, targetStep)
      }, 150)
    },
    [sections, sectionsById, updateState, onNavigateToModule, onOpenSectionTour]
  )

  // Skip welcome
  const skipWelcome = useCallback(() => {
    updateState((prev) => ({
      ...prev,
      welcomeDismissed: true,
      welcomeSkipped: true,
      isContinuousActive: false,
      isPaused: false,
    }))
  }, [updateState])

  // Complete section and advance to next in continuous mode
  const handleSectionCompleted = useCallback(
    (sectionId: string) => {
      const completedIds = Array.from(new Set([...state.completedSectionIds, sectionId]))

      if (!state.isContinuousActive) {
        // Individual tour completion
        updateState((prev) => ({
          ...prev,
          completedSectionIds: completedIds,
        }))
        return
      }

      // Continuous sequence logic
      const currentIndex = sections.findIndex((s) => s.id === sectionId)
      const nextSection =
        currentIndex >= 0 && currentIndex < sections.length - 1
          ? sections[currentIndex + 1]
          : null

      if (nextSection) {
        const completedSection = sectionsById.get(sectionId)
        const transition: ContinuousTransitionState = {
          active: true,
          completedTitle: completedSection?.title || 'Sección',
          nextTitle: nextSection.title,
          nextSectionId: nextSection.id,
          nextModule: nextSection.module,
        }
        setTransitionState(transition)

        updateState((prev) => ({
          ...prev,
          completedSectionIds: completedIds,
          currentSectionId: nextSection.id,
          currentStepIndex: 0,
        }))

        onCloseSectionTour(sectionId)
        onNavigateToModule(nextSection.module)

        if (transitionTimerRef.current) {
          window.clearTimeout(transitionTimerRef.current)
        }
        // Unified 3.5s transition (or 1.2s if prefers-reduced-motion)
        const isReducedMotion = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
        const delayMs = isReducedMotion ? 1200 : 3500

        transitionTimerRef.current = window.setTimeout(() => {
          setTransitionState(null)
          onOpenSectionTour(nextSection.id, 0)
          transitionTimerRef.current = null
        }, delayMs)
      } else {
        // All sections finished!
        updateState((prev) => ({
          ...prev,
          completedSectionIds: completedIds,
          isContinuousActive: false,
          isPaused: false,
          completedAll: true,
          currentSectionId: null,
          currentStepIndex: 0,
        }))
        onCloseSectionTour(sectionId)
        setIsSummaryOpen(true)
      }
    },
    [state.completedSectionIds, state.isContinuousActive, sections, sectionsById, updateState, onCloseSectionTour, onNavigateToModule, onOpenSectionTour]
  )

  // Force skip transition timer and open immediately
  const handleContinueNow = useCallback(() => {
    if (!transitionState) return
    if (transitionTimerRef.current) {
      window.clearTimeout(transitionTimerRef.current)
      transitionTimerRef.current = null
    }
    const targetSectionId = transitionState.nextSectionId
    const targetModule = transitionState.nextModule
    setTransitionState(null)
    onNavigateToModule(targetModule)
    onOpenSectionTour(targetSectionId, 0)
  }, [transitionState, onNavigateToModule, onOpenSectionTour])

  // Pause sequence with exact step cursor
  const pauseSequence = useCallback(
    (currentStepIndex?: number) => {
      if (transitionTimerRef.current) {
        window.clearTimeout(transitionTimerRef.current)
        transitionTimerRef.current = null
      }
      setTransitionState(null)

      if (state.currentSectionId) {
        onCloseSectionTour(state.currentSectionId)
      }

      const stepIndex = typeof currentStepIndex === 'number' && Number.isFinite(currentStepIndex)
        ? Math.max(0, currentStepIndex)
        : (state.currentStepIndex || 0)

      updateState((prev) => ({
        ...prev,
        isContinuousActive: false,
        isPaused: true,
        currentStepIndex: stepIndex,
      }))
    },
    [state.currentSectionId, state.currentStepIndex, updateState, onCloseSectionTour]
  )

  // Resume paused sequence at exact step
  const resumeSequence = useCallback(() => {
    if (sections.length === 0) return

    // Find section to resume: either currentSectionId or first incomplete section
    let targetSection = state.currentSectionId
      ? sectionsById.get(state.currentSectionId)
      : null

    if (!targetSection || state.completedSectionIds.includes(targetSection.id)) {
      targetSection = sections.find((s) => !state.completedSectionIds.includes(s.id)) || sections[0]
    }

    const stepIndex = state.currentSectionId === targetSection.id ? (state.currentStepIndex || 0) : 0

    updateState((prev) => ({
      ...prev,
      isContinuousActive: true,
      isPaused: false,
      currentSectionId: targetSection.id,
      currentStepIndex: stepIndex,
    }))

    onNavigateToModule(targetSection.module)
    window.setTimeout(() => {
      onOpenSectionTour(targetSection.id, stepIndex)
    }, 150)
  }, [sections, sectionsById, state.currentSectionId, state.currentStepIndex, state.completedSectionIds, updateState, onNavigateToModule, onOpenSectionTour])

  // Complete restart: resets in-memory React state, cleans completed IDs, resets storage and legacy statuses
  const restartAll = useCallback(() => {
    if (transitionTimerRef.current) {
      window.clearTimeout(transitionTimerRef.current)
      transitionTimerRef.current = null
    }
    setTransitionState(null)
    setIsSummaryOpen(false)

    const firstSection = sections[0]
    const resetState: TutorialOrchestratorState = {
      welcomeDismissed: true,
      welcomeSkipped: false,
      isContinuousActive: Boolean(firstSection),
      isPaused: false,
      currentSectionId: firstSection ? firstSection.id : null,
      currentStepIndex: 0,
      completedSectionIds: [],
      completedAll: false,
      lastUpdated: new Date().toISOString(),
    }

    // 1. Explicitly overwrite in-memory React state
    setState(resetState)
    // 2. Explicitly overwrite storage
    saveTutorialOrchestratorState(scope, resetState)
    // 3. Clear legacy individual tour statuses in parent component (Restaurant / Distribution)
    onResetAllStatuses?.()

    // 4. Start first tour cleanly
    if (firstSection) {
      onNavigateToModule(firstSection.module)
      window.setTimeout(() => {
        onOpenSectionTour(firstSection.id, 0)
      }, 150)
    }
  }, [scope, sections, onResetAllStatuses, onNavigateToModule, onOpenSectionTour])

  // Replay a specific individual section
  const replaySection = useCallback(
    (sectionId: string) => {
      const section = sectionsById.get(sectionId)
      if (!section) return
      setIsSummaryOpen(false)
      onNavigateToModule(section.module)
      window.setTimeout(() => {
        onOpenSectionTour(sectionId, 0)
      }, 150)
    },
    [sectionsById, onNavigateToModule, onOpenSectionTour]
  )

  // Has a resumable sequence? Evaluates true whenever any progress exists or sequence was paused / refreshed
  const hasResumableSequence = useMemo(() => {
    if (state.completedAll) return false
    if (state.isPaused) return true
    if (state.isContinuousActive) return true
    if (state.currentSectionId !== null) return true
    if (state.completedSectionIds.length > 0 && state.completedSectionIds.length < sections.length) {
      return true
    }
    return false
  }, [state.completedAll, state.isPaused, state.isContinuousActive, state.currentSectionId, state.completedSectionIds.length, sections.length])

  // Resumable section label for UI
  const resumableTargetInfo = useMemo(() => {
    if (!hasResumableSequence) return null
    let target = state.currentSectionId ? sectionsById.get(state.currentSectionId) : null
    if (!target || state.completedSectionIds.includes(target.id)) {
      target = sections.find((s) => !state.completedSectionIds.includes(s.id)) || null
    }
    if (!target) return null
    const stepNumber = (state.currentStepIndex || 0) + 1
    return {
      sectionId: target.id,
      sectionTitle: target.title,
      stepNumber,
    }
  }, [hasResumableSequence, state.currentSectionId, state.currentStepIndex, state.completedSectionIds, sections, sectionsById])

  return {
    state,
    isWelcomeOpen,
    isSummaryOpen,
    transitionState,
    hasResumableSequence,
    resumableTargetInfo,
    startContinuousSequence,
    skipWelcome,
    handleSectionCompleted,
    handleContinueNow,
    pauseSequence,
    resumeSequence,
    restartAll,
    replaySection,
    updateStepIndex,
    dismissSummary: () => setIsSummaryOpen(false),
  }
}
