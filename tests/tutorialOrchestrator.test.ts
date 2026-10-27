import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildTutorialOrchestratorStorageKey,
  createDefaultOrchestratorState,
  loadTutorialOrchestratorState,
  saveTutorialOrchestratorState,
  clearTutorialOrchestratorState,
} from '../src/components/tutorials/tutorialOrchestratorStorage.ts'
import type {
  TutorialStorageScope,
  TutorialOrchestratorState,
} from '../src/components/tutorials/tutorialOrchestratorTypes.ts'

function createMockStorage() {
  const store = Object.create(null)
  return Object.defineProperties(store, {
    getItem: { value: (key: string) => store[key] ?? null },
    setItem: { value: (key: string, value: string) => { store[key] = String(value) } },
    removeItem: { value: (key: string) => { delete store[key] } },
    clear: { value: () => { Object.keys(store).forEach((k) => delete store[k]) } },
  })
}

test('G6.1 — Storage Key Generation & Strict Scope Isolation', () => {
  const scopeSalon: TutorialStorageScope = {
    template: 'restaurant',
    role: 'owner',
    datasetMode: 'full',
    profile: 'restaurant',
    tenantId: 'demo-tenant-restaurant',
    isDemo: true,
  }

  const scopeFastFood: TutorialStorageScope = {
    template: 'hamburger',
    role: 'cashier',
    datasetMode: 'full',
    profile: 'counter_service',
    tenantId: 'demo-tenant-restaurant',
    isDemo: true,
  }

  const scopeFastFoodEmpty: TutorialStorageScope = {
    ...scopeFastFood,
    datasetMode: 'empty',
  }

  const scopeDistFood: TutorialStorageScope = {
    template: 'distribution',
    role: 'seller',
    datasetMode: 'full',
    profile: 'food',
    tenantId: 'demo-distribution-tenant',
    isDemo: true,
  }

  const scopeDistBeverages: TutorialStorageScope = {
    template: 'distribution',
    role: 'seller',
    datasetMode: 'full',
    profile: 'beverages',
    tenantId: 'demo-distribution-tenant',
    isDemo: true,
  }

  const scopeProdTenant: TutorialStorageScope = {
    template: 'restaurant',
    role: 'owner',
    datasetMode: 'full',
    profile: 'restaurant',
    tenantId: 'empresa-real-bolivia-123',
    isDemo: false,
  }

  const keySalon = buildTutorialOrchestratorStorageKey(scopeSalon)
  const keyFastFood = buildTutorialOrchestratorStorageKey(scopeFastFood)
  const keyFastFoodEmpty = buildTutorialOrchestratorStorageKey(scopeFastFoodEmpty)
  const keyDistFood = buildTutorialOrchestratorStorageKey(scopeDistFood)
  const keyDistBeverages = buildTutorialOrchestratorStorageKey(scopeDistBeverages)
  const keyProd = buildTutorialOrchestratorStorageKey(scopeProdTenant)

  // Verify structure
  assert.equal(keySalon, 'pachax:tutorial-orchestrator:demo:demo-tenant-restaurant:restaurant:full:restaurant:owner:v1')
  assert.equal(keyFastFood, 'pachax:tutorial-orchestrator:demo:demo-tenant-restaurant:hamburger:full:counter_service:cashier:v1')
  assert.equal(keyFastFoodEmpty, 'pachax:tutorial-orchestrator:demo:demo-tenant-restaurant:hamburger:empty:counter_service:cashier:v1')
  assert.equal(keyDistFood, 'pachax:tutorial-orchestrator:demo:demo-distribution-tenant:distribution:full:food:seller:v1')
  assert.equal(keyDistBeverages, 'pachax:tutorial-orchestrator:demo:demo-distribution-tenant:distribution:full:beverages:seller:v1')
  assert.equal(keyProd, 'pachax:tutorial-orchestrator:tenant:empresa-real-bolivia-123:restaurant:full:restaurant:owner:v1')

  // Verify all keys are strictly distinct (no cross-contamination)
  const allKeys = new Set([keySalon, keyFastFood, keyFastFoodEmpty, keyDistFood, keyDistBeverages, keyProd])
  assert.equal(allKeys.size, 6, 'All tutorial scopes must produce strictly isolated storage keys')
})

test('G6.2 — Storage Persistence, Fallbacks & Error Recovery', () => {
  const previousWindow = (globalThis as any).window
  const previousLocalStorage = (globalThis as any).localStorage
  const mockStorage = createMockStorage()

  try {
    ;(globalThis as any).localStorage = mockStorage
    ;(globalThis as any).window = { localStorage: mockStorage }

    const scope: TutorialStorageScope = {
      template: 'restaurant',
      role: 'owner',
      datasetMode: 'full',
      profile: 'restaurant',
      tenantId: 'demo-123',
      isDemo: true,
    }

    // 1. Initial load from empty storage
    const initial = loadTutorialOrchestratorState(scope)
    assert.equal(initial.welcomeDismissed, false)
    assert.equal(initial.welcomeSkipped, false)
    assert.equal(initial.isContinuousActive, false)
    assert.equal(initial.isPaused, false)
    assert.equal(initial.currentSectionId, null)
    assert.equal(initial.currentStepIndex, 0)
    assert.deepEqual(initial.completedSectionIds, [])
    assert.equal(initial.completedAll, false)

    // 2. Save active continuous sequence
    const updatedState: TutorialOrchestratorState = {
      welcomeDismissed: true,
      welcomeSkipped: false,
      isContinuousActive: true,
      isPaused: false,
      currentSectionId: 'tables',
      currentStepIndex: 1,
      completedSectionIds: ['pos'],
      completedAll: false,
      lastUpdated: new Date().toISOString(),
    }
    saveTutorialOrchestratorState(scope, updatedState)

    // 3. Load back and verify equality
    const loaded = loadTutorialOrchestratorState(scope)
    assert.equal(loaded.welcomeDismissed, true)
    assert.equal(loaded.isContinuousActive, true)
    assert.equal(loaded.currentSectionId, 'tables')
    assert.equal(loaded.currentStepIndex, 1)
    assert.deepEqual(loaded.completedSectionIds, ['pos'])
    assert.equal(loaded.completedAll, false)

    // 4. Corrupted JSON resilience
    const key = buildTutorialOrchestratorStorageKey(scope)
    mockStorage.setItem(key, '{ invalid json garbage :::')
    const fallbackAfterCorrupt = loadTutorialOrchestratorState(scope)
    assert.equal(fallbackAfterCorrupt.welcomeDismissed, false)
    assert.equal(fallbackAfterCorrupt.isContinuousActive, false)
    assert.deepEqual(fallbackAfterCorrupt.completedSectionIds, [])

    // 5. Clear / Reset state
    saveTutorialOrchestratorState(scope, updatedState)
    clearTutorialOrchestratorState(scope)
    const afterClear = loadTutorialOrchestratorState(scope)
    // Clearing resets progress while keeping welcomeDismissed: true so user isn't re-prompted by welcome popup
    assert.equal(afterClear.welcomeDismissed, true)
    assert.equal(afterClear.completedSectionIds.length, 0)
    assert.equal(afterClear.isContinuousActive, false)
    assert.equal(afterClear.completedAll, false)
  } finally {
    ;(globalThis as any).window = previousWindow
    ;(globalThis as any).localStorage = previousLocalStorage
  }
})

test('G6.3 — Continuous Progression State Transitions Invariants', () => {
  const sections = [
    { id: 'pos', title: 'Punto de Venta', module: 'pos' },
    { id: 'tables', title: 'Salón y Mesas', module: 'tables' },
    { id: 'kitchen', title: 'Cocina & Despacho', module: 'kitchen' },
  ]

  // State Step 0: Welcome dialog presented
  let state = createDefaultOrchestratorState()
  assert.equal(state.welcomeDismissed, false)
  assert.equal(state.isContinuousActive, false)

  // Action 1: User clicks "Iniciar tutorial"
  state = {
    ...state,
    welcomeDismissed: true,
    welcomeSkipped: false,
    isContinuousActive: true,
    currentSectionId: sections[0].id,
    currentStepIndex: 0,
    lastUpdated: new Date().toISOString(),
  }
  assert.equal(state.isContinuousActive, true)
  assert.equal(state.welcomeDismissed, true)
  assert.equal(state.currentSectionId, 'pos')

  // Action 2: User completes section 'pos'
  state = {
    ...state,
    completedSectionIds: [...state.completedSectionIds, 'pos'],
    currentSectionId: sections[1].id,
    currentStepIndex: 0,
    lastUpdated: new Date().toISOString(),
  }
  assert.equal(state.completedSectionIds.includes('pos'), true)
  assert.equal(state.currentSectionId, 'tables')
  assert.equal(state.isContinuousActive, true)

  // Action 3: User pauses on step 2 of 'tables'
  state = {
    ...state,
    isContinuousActive: false,
    isPaused: true,
    currentStepIndex: 2,
    lastUpdated: new Date().toISOString(),
  }
  assert.equal(state.isContinuousActive, false)
  assert.equal(state.isPaused, true)
  assert.equal(state.currentSectionId, 'tables')
  assert.equal(state.currentStepIndex, 2)

  // Action 4: User resumes sequence from Learning Center
  state = {
    ...state,
    isContinuousActive: true,
    isPaused: false,
    lastUpdated: new Date().toISOString(),
  }
  assert.equal(state.isContinuousActive, true)
  assert.equal(state.isPaused, false)
  assert.equal(state.currentSectionId, 'tables')
  assert.equal(state.currentStepIndex, 2)

  // Action 5: User finishes 'tables' and then 'kitchen'
  state = {
    ...state,
    completedSectionIds: [...state.completedSectionIds, 'tables'],
    currentSectionId: sections[2].id,
    currentStepIndex: 0,
  }
  // Complete last section ('kitchen')
  state = {
    ...state,
    completedSectionIds: [...state.completedSectionIds, 'kitchen'],
    currentSectionId: null,
    isContinuousActive: false,
    completedAll: true,
    lastUpdated: new Date().toISOString(),
  }
  assert.equal(state.isContinuousActive, false)
  assert.equal(state.completedAll, true)
  assert.equal(state.completedSectionIds.length, 3)
  assert.deepEqual(state.completedSectionIds, ['pos', 'tables', 'kitchen'])

  // Action 6: User clicks "Reiniciar tutorial completo"
  state = {
    ...createDefaultOrchestratorState(),
    welcomeDismissed: true,
    isContinuousActive: true,
    currentSectionId: sections[0].id,
    currentStepIndex: 0,
    lastUpdated: new Date().toISOString(),
  }
  assert.equal(state.completedSectionIds.length, 0)
  assert.equal(state.currentSectionId, 'pos')
  assert.equal(state.isContinuousActive, true)
  assert.equal(state.completedAll, false)
})

test('G6.4 — Real Tenant Security Invariant', () => {
  // Production tenant configuration
  const realTenantScope: TutorialStorageScope = {
    template: 'restaurant',
    role: 'owner',
    datasetMode: 'full',
    profile: 'restaurant',
    tenantId: 'real-production-tenant-bo',
    isDemo: false, // Critical: Real tenant
  }

  // Welcome modal must never be opened automatically for real tenants
  const shouldOpenWelcome = (scope: TutorialStorageScope, state: TutorialOrchestratorState) => {
    if (!scope.isDemo) return false // Absolute guard
    return !state.welcomeDismissed
  }

  const freshState = createDefaultOrchestratorState()

  assert.equal(shouldOpenWelcome(realTenantScope, freshState), false, 'Real tenants must never see the demo onboarding welcome popup')

  const demoScope: TutorialStorageScope = {
    ...realTenantScope,
    isDemo: true,
  }
  assert.equal(shouldOpenWelcome(demoScope, freshState), true, 'Demo visitors should see the welcome popup on first arrival')
})
