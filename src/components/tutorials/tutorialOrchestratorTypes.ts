export interface TutorialStorageScope {
  template: 'restaurant' | 'hamburger' | 'distribution' | string
  role: string
  datasetMode?: 'full' | 'empty'
  profile?: string
  tenantId?: string
  uid?: string
  isDemo?: boolean
}

export interface TutorialOrchestratorState {
  welcomeDismissed: boolean
  welcomeSkipped: boolean
  isContinuousActive: boolean
  isPaused: boolean
  currentSectionId: string | null
  currentStepIndex: number
  completedSectionIds: string[]
  completedAll: boolean
  lastUpdated: string
}

export interface TutorialSectionItem {
  id: string
  title: string
  description?: string
  module: string
  estimatedMinutes?: number
}

export interface ContinuousTransitionState {
  active: boolean
  completedTitle: string
  nextTitle: string
  nextSectionId: string
  nextModule: string
}
