import assert from 'node:assert/strict'
import test from 'node:test'
import { assertPreviewFirebaseIsolation, previewFirebaseConfigFingerprint } from '../preview-firebase-isolation.mjs'

const staging = {
  VITE_FIREBASE_API_KEY: 'staging-public-key',
  VITE_FIREBASE_AUTH_DOMAIN: 'pachax-staging.firebaseapp.com',
  VITE_FIREBASE_PROJECT_ID: 'pachax-staging',
  VITE_FIREBASE_STORAGE_BUCKET: 'pachax-staging.firebasestorage.app',
  VITE_FIREBASE_MESSAGING_SENDER_ID: '123456789',
  VITE_FIREBASE_APP_ID: '1:123456789:web:staging',
  VITE_FIREBASE_MEASUREMENT_ID: '',
  VITE_FIREBASE_APPCHECK_SITE_KEY: 'staging-app-check-site-key',
  VITE_FIREBASE_APPCHECK_DEBUG: 'false',
  VITE_USE_FIREBASE_EMULATOR: 'false',
  VITE_BOT_API_URL: '',
}

test('preview rejects Firebase Production before considering a fingerprint', () => {
  assert.throws(() => assertPreviewFirebaseIsolation({
    ...staging,
    VITE_FIREBASE_PROJECT_ID: 'pachax-platform',
    PACHAX_PREVIEW_FIREBASE_CONFIG_SHA256: previewFirebaseConfigFingerprint(staging),
  }, 'preview'), /Production/)
})

test('preview requires the complete Firebase and service configuration fingerprint', () => {
  assert.throws(() => assertPreviewFirebaseIsolation(staging, 'preview'), /huella de staging/)
  assert.throws(() => assertPreviewFirebaseIsolation({
    ...staging,
    PACHAX_PREVIEW_FIREBASE_CONFIG_SHA256: previewFirebaseConfigFingerprint(staging),
    VITE_FIREBASE_STORAGE_BUCKET: 'pachax-platform.appspot.com',
  }, 'preview'), /huella de staging/)
  assert.throws(() => assertPreviewFirebaseIsolation({
    ...staging,
    PACHAX_PREVIEW_FIREBASE_CONFIG_SHA256: previewFirebaseConfigFingerprint(staging),
    VITE_BOT_API_URL: 'https://prod-bot.example.com',
  }, 'preview'), /huella de staging/)
})

test('preview accepts only an exact staging fingerprint and rejects emulator/debug configurations', () => {
  const config = { ...staging }
  config.PACHAX_PREVIEW_FIREBASE_CONFIG_SHA256 = previewFirebaseConfigFingerprint(config)
  assert.doesNotThrow(() => assertPreviewFirebaseIsolation(config, 'preview'))
  assert.throws(() => assertPreviewFirebaseIsolation({ ...config, VITE_USE_FIREBASE_EMULATOR: 'true' }, 'preview'), /emuladores locales/)
  assert.throws(() => assertPreviewFirebaseIsolation({ ...config, VITE_FIREBASE_APPCHECK_DEBUG: 'true' }, 'preview'), /depuración/)
})

test('non-preview builds retain their existing configuration path', () => {
  assert.doesNotThrow(() => assertPreviewFirebaseIsolation({ VITE_FIREBASE_PROJECT_ID: 'pachax-platform' }, 'production'))
  assert.doesNotThrow(() => assertPreviewFirebaseIsolation({}, undefined))
})
