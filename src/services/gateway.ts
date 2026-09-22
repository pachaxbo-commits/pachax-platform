import { connectFunctionsEmulator, getFunctions, httpsCallable } from 'firebase/functions'
import { getFirebaseContext } from '../lib/firebase'
import { PACHAX_FUNCTIONS_REGION } from '../config/functions'
let connected = false
export async function gateway<T>(name: 'tenantGateway' | 'platformGateway', payload: Record<string, unknown>): Promise<T> {
  const context = await getFirebaseContext()
  if (!context) throw new Error('Firebase no configurado.')
  const functions = getFunctions(context.app, PACHAX_FUNCTIONS_REGION)
  if (import.meta.env.VITE_USE_FIREBASE_EMULATOR === 'true' && !connected) {
    connectFunctionsEmulator(functions, window.location.hostname || '127.0.0.1', 5101)
    connected = true
  }
  return (await httpsCallable<Record<string, unknown>, T>(functions, name)(payload)).data
}
