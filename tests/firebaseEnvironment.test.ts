import assert from 'node:assert/strict'
import { test } from 'node:test'
import { FIREBASE_ENV_KEYS, validateFirebaseEnvironment } from '../src/config/firebaseEnvironment.ts'

const demo = Object.fromEntries(FIREBASE_ENV_KEYS.map(key => [key, 'demo-value']))
demo.VITE_FIREBASE_PROJECT_ID = 'demo-pachax-platform'
demo.VITE_USE_FIREBASE_EMULATOR = 'true'
test('production without Firebase fails explicitly', () => {
  assert.throws(() => validateFirebaseEnvironment({}, true), /incompleta/)
})
test('partial development configuration fails instead of falling back', () => {
  assert.throws(() => validateFirebaseEnvironment({ VITE_FIREBASE_API_KEY: 'x' }, false), /incompleta/)
})
test('isolated emulator build is allowed', () => validateFirebaseEnvironment(demo, true))
test('emulator configuration rejects a real project', () => {
  assert.throws(() => validateFirebaseEnvironment({ ...demo, VITE_FIREBASE_PROJECT_ID: 'real-project' }, false), /exclusivamente/)
})
test('demo cannot silently reach remote Firebase', () => {
  assert.throws(() => validateFirebaseEnvironment({ ...demo, VITE_USE_FIREBASE_EMULATOR: 'false' }, false), /requiere/)
})
