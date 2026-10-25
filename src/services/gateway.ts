import { connectFunctionsEmulator, getFunctions, httpsCallable } from 'firebase/functions'
import { getFirebaseContext } from '../lib/firebase.ts'
import { PACHAX_FUNCTIONS_REGION } from '../config/functions.ts'
let connected = false
export async function gateway<T>(name: 'tenantGateway' | 'platformGateway' | 'publicCommercialGateway', payload: Record<string, unknown>): Promise<T> {
  const context = await getFirebaseContext()
  if (!context) throw new Error('Firebase no configurado.')
  const emulator = import.meta.env.VITE_USE_FIREBASE_EMULATOR === 'true'
  if (name === 'publicCommercialGateway' && !emulator) {
    const siteKey = import.meta.env.VITE_FIREBASE_APPCHECK_SITE_KEY
    if (!siteKey) throw new Error('El formulario público no está disponible temporalmente. Utiliza el canal de contacto alternativo.')
  }
  const functions = getFunctions(context.app, PACHAX_FUNCTIONS_REGION)
  if (emulator && !connected) {
    connectFunctionsEmulator(functions, window.location.hostname || '127.0.0.1', Number(import.meta.env.VITE_FUNCTIONS_EMULATOR_PORT || 5101))
    connected = true
  }
  try {
    return (await httpsCallable<Record<string, unknown>, T>(functions, name)(payload)).data
  } catch (cause) {
    const code = typeof cause === 'object' && cause !== null && 'code' in cause ? String(cause.code) : ''
    if (name === 'publicCommercialGateway' && ['functions/unauthenticated', 'functions/unavailable', 'functions/deadline-exceeded', 'functions/internal'].includes(code)) {
      throw new Error('No pudimos verificar o enviar la solicitud. Recarga la página e inténtalo nuevamente.', { cause })
    }
    throw cause
  }
}
