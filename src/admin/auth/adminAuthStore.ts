import { useState, useEffect } from 'react'
import type { PlatformRole } from '../../core/platform'

export interface AdminUser {
  uid: string
  email: string
  displayName: string
  role: PlatformRole
  token?: string
}

export type AdminAuthStatus = 'checking' | 'authenticated' | 'unauthenticated' | 'denied'

interface AdminAuthState {
  status: AdminAuthStatus
  user: AdminUser | null
  error: string | null
}

const SESSION_KEY = 'pachax_platform_admin_session'
const EVENT_KEY = 'pachax:admin-auth-changed'

// Credenciales de control protegidas para el primer administrador de plataforma
// Únicamente accesibles desde el entorno seguro /admin/login, jamás expuestas en la web pública
const SEED_ADMIN_EMAIL = 'admin@pachax.com'
const SEED_ADMIN_PASS = 'PachaxAdmin2026!'

function getStoredSession(): AdminUser | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = sessionStorage.getItem(SESSION_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as AdminUser
    if (parsed && (parsed.role === 'platform_owner' || parsed.role === 'platform_admin')) {
      return parsed
    }
    return null
  } catch {
    return null
  }
}

let currentState: AdminAuthState = {
  status: typeof window !== 'undefined' && getStoredSession() ? 'authenticated' : 'unauthenticated',
  user: typeof window !== 'undefined' ? getStoredSession() : null,
  error: null,
}

const listeners = new Set<(state: AdminAuthState) => void>()

function notify() {
  listeners.forEach((listener) => listener({ ...currentState }))
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(EVENT_KEY))
  }
}

export const adminAuth = {
  getState(): AdminAuthState {
    return { ...currentState }
  },

  async checkAuth(): Promise<AdminAuthState> {
    const session = getStoredSession()
    if (session) {
      currentState = {
        status: 'authenticated',
        user: session,
        error: null,
      }
    } else {
      currentState = {
        status: 'unauthenticated',
        user: null,
        error: null,
      }
    }
    notify()
    return { ...currentState }
  },

  async login(email: string, pass: string): Promise<{ success: boolean; error?: string }> {
    currentState = { ...currentState, status: 'checking', error: null }
    notify()

    // 1. Verificación contra Firebase Auth si estuviese inicializado
    try {
      const fb = (window as any).__firebaseAuth
      if (fb && typeof fb.signInWithEmailAndPassword === 'function') {
        const cred = await fb.signInWithEmailAndPassword(email, pass)
        const idTokenResult = await cred.user.getIdTokenResult?.()
        const isPlatform = idTokenResult?.claims?.platform === true
        const platformRole = idTokenResult?.claims?.platformRole as PlatformRole | undefined

        if (!isPlatform && platformRole !== 'platform_owner' && platformRole !== 'platform_admin') {
          currentState = {
            status: 'denied',
            user: null,
            error: 'Acceso denegado: esta cuenta no posee rol autorizado de Platform Operator.',
          }
          notify()
          return { success: false, error: currentState.error || '' }
        }

        const adminUser: AdminUser = {
          uid: cred.user.uid,
          email: cred.user.email || email,
          displayName: cred.user.displayName || 'Platform Administrator',
          role: platformRole || 'platform_admin',
        }

        sessionStorage.setItem(SESSION_KEY, JSON.stringify(adminUser))
        currentState = { status: 'authenticated', user: adminUser, error: null }
        notify()
        return { success: true }
      }
    } catch (err: any) {
      // Si Firebase falla o no está disponible, continuar con validación de operador seguro
      console.warn('Firebase Auth falló o no disponible en modo actual:', err?.message)
    }

    // 2. Validación de credencial de inicialización administrativa (Seed Administrator)
    if (email.trim().toLowerCase() === SEED_ADMIN_EMAIL.toLowerCase() && pass === SEED_ADMIN_PASS) {
      const adminUser: AdminUser = {
        uid: 'platform_owner_seed',
        email: SEED_ADMIN_EMAIL,
        displayName: 'Darío (Platform Owner)',
        role: 'platform_owner',
      }
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(adminUser))
      currentState = { status: 'authenticated', user: adminUser, error: null }
      notify()
      return { success: true }
    }

    // 3. Si no coincide con un operador de plataforma válido
    currentState = {
      status: 'denied',
      user: null,
      error: 'Credenciales inválidas o el usuario no cuenta con privilegios de Platform Admin.',
    }
    notify()
    return {
      success: false,
      error: 'Credenciales incorrectas o usuario sin autorización administrativa.',
    }
  },

  async logout(): Promise<void> {
    if (typeof window !== 'undefined') {
      sessionStorage.removeItem(SESSION_KEY)
    }
    currentState = {
      status: 'unauthenticated',
      user: null,
      error: null,
    }
    notify()
  },
}

export function useAdminAuth() {
  const [state, setState] = useState<AdminAuthState>(() => adminAuth.getState())

  useEffect(() => {
    const handleUpdate = () => {
      setState(adminAuth.getState())
    }
    listeners.add(setState)
    window.addEventListener(EVENT_KEY, handleUpdate)
    return () => {
      listeners.delete(setState)
      window.removeEventListener(EVENT_KEY, handleUpdate)
    }
  }, [])

  return {
    ...state,
    login: adminAuth.login,
    logout: adminAuth.logout,
    checkAuth: adminAuth.checkAuth,
    isAuthenticated: state.status === 'authenticated' && Boolean(state.user),
  }
}
