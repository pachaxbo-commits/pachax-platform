/**
 * PACHAX PLATFORM — OFFICIAL TEMPORARY DEMO CONTEXT
 * 
 * Provides an explicit, non-ambiguous demo execution mode and safe
 * session-scoped storage helpers.
 * 
 * Requirements:
 * - mode: 'demo' (strictly separated from real tenants)
 * - Storage: sessionStorage only (never permanent localStorage, never Firestore)
 * - Namespaced strictly per template: pachax:demo:<businessType>:*
 * - Safe fallback if sessionStorage is unavailable (e.g. Node tests, SSR)
 */

export type ExecutionMode = 'real' | 'demo'

export interface DemoSessionConfig {
  mode: 'demo'
  templateId: string
  businessType: string
  storagePrefix: string
}

const memoryStore = new Map<string, string>()

export function isSessionStorageAvailable(): boolean {
  try {
    if (typeof window === 'undefined' || !window.sessionStorage) return false
    const testKey = '__pachax_demo_test__'
    window.sessionStorage.setItem(testKey, '1')
    window.sessionStorage.removeItem(testKey)
    return true
  } catch {
    return false
  }
}

export function getDemoStorageKey(businessType: string, key: string): string {
  return `pachax:demo:${businessType}:${key}`
}

export function getDemoItem(businessType: string, key: string): string | null {
  const fullKey = getDemoStorageKey(businessType, key)
  if (isSessionStorageAvailable()) {
    try {
      return window.sessionStorage.getItem(fullKey)
    } catch {
      return memoryStore.get(fullKey) || null
    }
  }
  return memoryStore.get(fullKey) || null
}

export function setDemoItem(businessType: string, key: string, value: string): void {
  const fullKey = getDemoStorageKey(businessType, key)
  if (isSessionStorageAvailable()) {
    try {
      window.sessionStorage.setItem(fullKey, value)
      return
    } catch {
      // Fallback to in-memory store if storage quota is exceeded or unavailable
    }
  }
  memoryStore.set(fullKey, value)
}

export function removeDemoItem(businessType: string, key: string): void {
  const fullKey = getDemoStorageKey(businessType, key)
  if (isSessionStorageAvailable()) {
    try {
      window.sessionStorage.removeItem(fullKey)
    } catch {
      // Ignore
    }
  }
  memoryStore.delete(fullKey)
}

/**
 * Completely resets all temporary demo state for a given business template.
 * Never touches real tenant keys, auth tokens or other templates.
 */
export function clearDemoState(businessType: string): void {
  const prefix = `pachax:demo:${businessType}:`
  if (isSessionStorageAvailable()) {
    try {
      const keysToRemove: string[] = []
      for (let i = 0; i < window.sessionStorage.length; i++) {
        const k = window.sessionStorage.key(i)
        if (k && k.startsWith(prefix)) {
          keysToRemove.push(k)
        }
      }
      for (const k of keysToRemove) {
        window.sessionStorage.removeItem(k)
      }
    } catch {
      // Ignore
    }
  }
  for (const k of Array.from(memoryStore.keys())) {
    if (k.startsWith(prefix)) {
      memoryStore.delete(k)
    }
  }
}

let activeDemoMode = false
let activeDemoTemplate: string | null = null

export function isDemoModeActive(): boolean {
  return activeDemoMode
}

export function getActiveDemoTemplate(): string | null {
  return activeDemoTemplate
}

export function enterDemoMode(templateId: string): void {
  activeDemoMode = true
  activeDemoTemplate = templateId
}

export function exitDemoMode(): void {
  activeDemoMode = false
  activeDemoTemplate = null
}
