export const FIREBASE_ENV_KEYS = [
  'VITE_FIREBASE_API_KEY', 'VITE_FIREBASE_AUTH_DOMAIN',
  'VITE_FIREBASE_PROJECT_ID', 'VITE_FIREBASE_STORAGE_BUCKET',
  'VITE_FIREBASE_MESSAGING_SENDER_ID', 'VITE_FIREBASE_APP_ID',
] as const

/** Pure validation, shared by the build and Firebase initialization. Never logs values. */
export function validateFirebaseEnvironment(env: Record<string, unknown>, production: boolean): void {
  const missing = FIREBASE_ENV_KEYS.filter(key => typeof env[key] !== 'string' || !String(env[key]).trim())
  const configured = FIREBASE_ENV_KEYS.some(key => Boolean(env[key]))
  if (missing.length && (production || configured)) {
    throw new Error(`Configuración Firebase incompleta: ${missing.join(', ')}. Configura el nuevo proyecto PACHAX.`)
  }
  const emulator = env.VITE_USE_FIREBASE_EMULATOR === 'true'
  if (emulator && env.VITE_FIREBASE_PROJECT_ID !== 'demo-pachax-platform') {
    throw new Error('Las pruebas deben usar exclusivamente demo-pachax-platform.')
  }
  if (!emulator && String(env.VITE_FIREBASE_PROJECT_ID || '').startsWith('demo-')) {
    throw new Error('Un proyecto demo requiere VITE_USE_FIREBASE_EMULATOR=true.')
  }
}
