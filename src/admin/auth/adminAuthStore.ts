import { useState, useEffect } from 'react'
import type { PlatformRole } from '../../core/platform'
import {
  getFirebaseContext,
  signInWithEmail,
  signOutUser,
  subscribeToAuthChanges,
} from '../../lib/firebase'
import { gateway } from '../../services/gateway'
import type { User } from 'firebase/auth'

export interface AdminUser {
  uid: string
  email: string
  displayName: string
  role: PlatformRole
  token?: string
}

export type AdminAuthStatus = 'checking' | 'authenticated' | 'unauthenticated' | 'denied'

export interface AdminAuthState {
  status: AdminAuthStatus
  user: AdminUser | null
  error: string | null
}

const EVENT_KEY = 'pachax:admin-auth-changed'

let currentState: AdminAuthState = {
  status: 'checking',
  user: null,
  error: null,
}

const listeners = new Set<(state: AdminAuthState) => void>()

function notify() {
  listeners.forEach((listener) => listener({ ...currentState }))
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(EVENT_KEY))
  }
}

let initialized = false

async function verifyOperator(firebaseUser: User | null): Promise<void> {
  if (!firebaseUser) {
    currentState = {
      status: 'unauthenticated',
      user: null,
      error: null,
    }
    notify()
    return
  }

  currentState = { ...currentState, status: 'checking', error: null }
  notify()

  try {
    // 1. Obtener token con claims actualizados desde Firebase Auth
    const idTokenResult = await firebaseUser.getIdTokenResult(true)
    const isPlatformClaim = idTokenResult.claims.platform === true
    const tokenRole = idTokenResult.claims.platformRole as PlatformRole | undefined

    const validRoles: PlatformRole[] = [
      'platform_owner',
      'platform_admin',
      'platform_support',
      'platform_content',
      'platform_finance',
    ]

    if (!isPlatformClaim || !tokenRole || !validRoles.includes(tokenRole)) {
      currentState = {
        status: 'denied',
        user: null,
        error: 'Acceso denegado: esta cuenta no posee rol autorizado de Platform Operator.',
      }
      notify()
      return
    }

    // 2. Validación obligatoria en backend contra platformGateway -> validateOperator
    // FAIL-CLOSED: Si falla la conexión, hay timeout o la función no responde,
    // BAJO NINGUNA CIRCUNSTANCIA se permite el acceso administrativo.
    try {
      const validation = await gateway<{ uid: string; role: PlatformRole; permissions: string[] }>(
        'platformGateway',
        { action: 'validateOperator' },
      )

      if (!validation || !validation.role || !validRoles.includes(validation.role)) {
        currentState = {
          status: 'denied',
          user: null,
          error: 'Acceso denegado: rol de operador inválido o no reconocido por el sistema.',
        }
        notify()
        return
      }

      currentState = {
        status: 'authenticated',
        user: {
          uid: firebaseUser.uid,
          email: firebaseUser.email || '',
          displayName: firebaseUser.displayName || firebaseUser.email?.split('@')[0] || 'Platform Operator',
          role: validation.role,
        },
        error: null,
      }
      notify()
    } catch (gateErr: any) {
      console.warn('Fallo de validación en platformGateway:', gateErr?.message)
      const errorMsg =
        gateErr?.code === 'functions/permission-denied' || gateErr?.message?.includes('denied')
          ? 'Acceso denegado: la cuenta de operador no se encuentra activa o no existe en platformOperators.'
          : 'No se pudo verificar tu autorización administrativa. Inténtalo nuevamente.'

      currentState = {
        status: 'denied',
        user: null,
        error: errorMsg,
      }
      notify()
    }
  } catch (err: any) {
    currentState = {
      status: 'denied',
      user: null,
      error: 'No se pudo verificar tu autorización administrativa. Inténtalo nuevamente.',
    }
    notify()
  }
}

function initAuthListener() {
  if (initialized || typeof window === 'undefined') return
  initialized = true

  subscribeToAuthChanges((firebaseUser) => {
    verifyOperator(firebaseUser)
  }).catch((err) => {
    console.error('Error suscribiendo a cambios de autenticación:', err)
    currentState = { status: 'unauthenticated', user: null, error: null }
    notify()
  })
}

export const adminAuth = {
  getState(): AdminAuthState {
    initAuthListener()
    return { ...currentState }
  },

  async checkAuth(): Promise<AdminAuthState> {
    initAuthListener()
    const context = await getFirebaseContext()
    const currentUser = context?.auth.currentUser || null
    await verifyOperator(currentUser)
    return { ...currentState }
  },

  async login(email: string, pass: string): Promise<{ success: boolean; error?: string }> {
    initAuthListener()
    currentState = { ...currentState, status: 'checking', error: null }
    notify()

    try {
      const userCred = await signInWithEmail(email.trim(), pass)
      await verifyOperator(userCred.user)

      if (currentState.status === 'authenticated') {
        return { success: true }
      } else {
        return {
          success: false,
          error: currentState.error || 'Acceso denegado: cuenta sin privilegios de Platform Operator.',
        }
      }
    } catch (err: any) {
      let message = 'Error de autenticación.'
      if (err?.code === 'auth/invalid-credential' || err?.code === 'auth/wrong-password' || err?.code === 'auth/user-not-found') {
        message = 'Credenciales incorrectas.'
      } else if (err?.code === 'auth/too-many-requests') {
        message = 'Demasiados intentos fallidos. Intenta más tarde.'
      } else if (err?.message) {
        message = err.message
      }
      currentState = {
        status: 'unauthenticated',
        user: null,
        error: message,
      }
      notify()
      return { success: false, error: message }
    }
  },

  async logout(): Promise<void> {
    try {
      await signOutUser()
    } catch (err) {
      console.warn('Error al cerrar sesión:', err)
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
    initAuthListener()
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
