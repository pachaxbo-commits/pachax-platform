import type { TutorialStorageScope, TutorialOrchestratorState } from './tutorialOrchestratorTypes.ts'

export function buildTutorialOrchestratorStorageKey(scope: TutorialStorageScope): string {
  const env = scope.isDemo ? 'demo' : 'tenant'
  const tenant = scope.tenantId || 'default'
  const uid = scope.uid || 'anon'
  const tpl = scope.template || 'default'
  const dataMode = scope.datasetMode || 'full'
  const prof = scope.profile || 'default'
  const role = scope.role || 'default'
  return `pachax:tutorial-orchestrator:${env}:${tenant}:${uid}:${tpl}:${dataMode}:${prof}:${role}:v1`
}

export function buildLegacyTutorialOrchestratorStorageKey(scope: TutorialStorageScope): string {
  const env = scope.isDemo ? 'demo' : 'tenant'
  const tenant = scope.tenantId || 'default'
  const tpl = scope.template || 'default'
  const dataMode = scope.datasetMode || 'full'
  const prof = scope.profile || 'default'
  const role = scope.role || 'default'
  return `pachax:tutorial-orchestrator:${env}:${tenant}:${tpl}:${dataMode}:${prof}:${role}:v1`
}

export function createDefaultOrchestratorState(): TutorialOrchestratorState {
  return {
    welcomeDismissed: false,
    welcomeSkipped: false,
    isContinuousActive: false,
    isPaused: false,
    currentSectionId: null,
    currentStepIndex: 0,
    completedSectionIds: [],
    completedAll: false,
    lastUpdated: new Date().toISOString(),
  }
}

export function loadTutorialOrchestratorState(scope: TutorialStorageScope): TutorialOrchestratorState {
  if (typeof window === 'undefined') return createDefaultOrchestratorState()
  try {
    const key = buildTutorialOrchestratorStorageKey(scope)
    let raw = window.localStorage.getItem(key)

    // Safe migration from legacy key without uid (DEMO ONLY)
    // In real tenants (isDemo === false), ownership of legacy key cannot be established per user;
    // prior isolation demands starting fresh per tenantId + uid.
    // In demos (isDemo === true), migrate once safely and consume/remove legacy key to prevent repeated imports by other users.
    if (!raw && scope.isDemo) {
      const legacyKey = buildLegacyTutorialOrchestratorStorageKey(scope)
      const legacyRaw = window.localStorage.getItem(legacyKey)
      if (legacyRaw) {
        raw = legacyRaw
        try {
          window.localStorage.setItem(key, legacyRaw)
          // Crucial: remove/consume legacy key so another user cannot inherit it
          window.localStorage.removeItem(legacyKey)
        } catch {
          /* ignore */
        }
      }
    }

    if (!raw) return createDefaultOrchestratorState()
    const parsed = JSON.parse(raw) as Partial<TutorialOrchestratorState>
    return {
      welcomeDismissed: Boolean(parsed.welcomeDismissed),
      welcomeSkipped: Boolean(parsed.welcomeSkipped),
      isContinuousActive: Boolean(parsed.isContinuousActive),
      isPaused: Boolean(parsed.isPaused),
      currentSectionId: typeof parsed.currentSectionId === 'string' ? parsed.currentSectionId : null,
      currentStepIndex: typeof parsed.currentStepIndex === 'number' && Number.isFinite(parsed.currentStepIndex) ? Math.max(0, parsed.currentStepIndex) : 0,
      completedSectionIds: Array.isArray(parsed.completedSectionIds) ? parsed.completedSectionIds.filter((id): id is string => typeof id === 'string') : [],
      completedAll: Boolean(parsed.completedAll),
      lastUpdated: typeof parsed.lastUpdated === 'string' ? parsed.lastUpdated : new Date().toISOString(),
    }
  } catch {
    return createDefaultOrchestratorState()
  }
}

export function saveTutorialOrchestratorState(scope: TutorialStorageScope, state: TutorialOrchestratorState): void {
  if (typeof window === 'undefined') return
  try {
    const key = buildTutorialOrchestratorStorageKey(scope)
    const sanitized: TutorialOrchestratorState = {
      ...state,
      currentStepIndex: Math.max(0, state.currentStepIndex || 0),
      lastUpdated: new Date().toISOString(),
    }
    window.localStorage.setItem(key, JSON.stringify(sanitized))
  } catch {
    /* Private mode or disabled storage fallback */
  }
}

export function clearTutorialOrchestratorState(scope: TutorialStorageScope): TutorialOrchestratorState {
  const reset = createDefaultOrchestratorState()
  // Keep welcomeDismissed: true if user already dismissed, or allow restarting continuous while remembering welcome choice
  reset.welcomeDismissed = true
  saveTutorialOrchestratorState(scope, reset)
  return reset
}
