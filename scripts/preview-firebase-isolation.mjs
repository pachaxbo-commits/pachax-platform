import { createHash } from 'node:crypto'

const FINGERPRINT_KEYS = [
  'VITE_FIREBASE_API_KEY',
  'VITE_FIREBASE_AUTH_DOMAIN',
  'VITE_FIREBASE_PROJECT_ID',
  'VITE_FIREBASE_STORAGE_BUCKET',
  'VITE_FIREBASE_MESSAGING_SENDER_ID',
  'VITE_FIREBASE_APP_ID',
  'VITE_FIREBASE_MEASUREMENT_ID',
  'VITE_FIREBASE_APPCHECK_SITE_KEY',
  'VITE_FIREBASE_APPCHECK_DEBUG',
  'VITE_USE_FIREBASE_EMULATOR',
  'VITE_FIRESTORE_EMULATOR_PORT',
  'VITE_AUTH_EMULATOR_PORT',
  'VITE_STORAGE_EMULATOR_PORT',
  'VITE_FUNCTIONS_EMULATOR_PORT',
  'VITE_BOT_API_URL',
  'VITE_PACHAX_VISUAL_PREVIEW',
]

const VISUAL_PREVIEW_CONFIG = Object.freeze({
  VITE_FIREBASE_API_KEY: 'pachax-visual-preview-disabled',
  VITE_FIREBASE_AUTH_DOMAIN: 'pachax-visual-preview.invalid',
  VITE_FIREBASE_PROJECT_ID: 'pachax-visual-preview-disabled',
  VITE_FIREBASE_STORAGE_BUCKET: 'pachax-visual-preview.invalid',
  VITE_FIREBASE_MESSAGING_SENDER_ID: '0',
  VITE_FIREBASE_APP_ID: 'pachax-visual-preview-disabled',
  VITE_FIREBASE_MEASUREMENT_ID: 'DISABLED',
  VITE_USE_FIREBASE_EMULATOR: 'false',
  VITE_PACHAX_VISUAL_PREVIEW: 'true',
})

export function previewFirebaseConfigFingerprint(env) {
  const canonical = FINGERPRINT_KEYS.map((key) => `${key}=${String(env[key] ?? '').trim()}`).join('\n')
  return createHash('sha256').update(canonical).digest('hex')
}

/** Fail closed for Vercel Preview unless every Firebase/service endpoint matches
 * an independently prepared staging fingerprint. Never prints environment values.
 */
export function assertPreviewFirebaseIsolation(env, vercelEnvironment) {
  const visualPreview = String(env.VITE_PACHAX_VISUAL_PREVIEW ?? '').trim() === 'true'
  if (vercelEnvironment !== 'preview') {
    if (visualPreview) throw new Error('El modo visual aislado solo se permite en deployments Preview.')
    return
  }

  if (visualPreview) {
    for (const [key, expectedValue] of Object.entries(VISUAL_PREVIEW_CONFIG)) {
      if (String(env[key] ?? '').trim() !== expectedValue) {
        throw new Error('Preview visual bloqueado: la configuración de solo lectura no coincide.')
      }
    }
    if (
      String(env.VITE_FIREBASE_APPCHECK_SITE_KEY ?? '').trim() ||
      String(env.VITE_FIREBASE_APPCHECK_DEBUG ?? '').trim() === 'true' ||
      String(env.VITE_USE_FIREBASE_EMULATOR ?? '').trim() === 'true' ||
      String(env.VITE_BOT_API_URL ?? '').trim()
    ) {
      throw new Error('Preview visual bloqueado: no se permiten App Check ni servicios externos.')
    }
    const expected = String(env.PACHAX_PREVIEW_FIREBASE_CONFIG_SHA256 ?? '').trim().toLowerCase()
    if (!/^[a-f0-9]{64}$/.test(expected) || expected !== previewFirebaseConfigFingerprint(env)) {
      throw new Error('Preview visual bloqueado: la configuración aislada no coincide con su huella aprobada.')
    }
    return
  }

  if (String(env.VITE_FIREBASE_PROJECT_ID ?? '').trim() === 'pachax-platform') {
    throw new Error('Preview bloqueado: su configuración apunta al proyecto Firebase Production.')
  }

  if (env.VITE_USE_FIREBASE_EMULATOR === 'true' || env.VITE_FIREBASE_APPCHECK_DEBUG === 'true') {
    throw new Error('Preview bloqueado: no se permiten emuladores locales ni tokens App Check de depuración.')
  }

  const expected = String(env.PACHAX_PREVIEW_FIREBASE_CONFIG_SHA256 ?? '').trim().toLowerCase()
  if (!/^[a-f0-9]{64}$/.test(expected) || expected !== previewFirebaseConfigFingerprint(env)) {
    throw new Error('Preview bloqueado: la configuración Firebase/servicios no coincide con la huella de staging aprobada.')
  }
}
