import { getActiveTenant } from '../store/activeTenant'
import { gateway } from '../services/gateway'
import { validateFirebaseEnvironment } from '../config/firebaseEnvironment'
import { getApp, getApps, initializeApp, type FirebaseApp } from 'firebase/app'
import {
  browserLocalPersistence,
  connectAuthEmulator,
  getAuth,
  inMemoryPersistence,
  onAuthStateChanged,
  sendPasswordResetEmail,
  setPersistence,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  type Auth,
  type User,
  type Unsubscribe,
} from 'firebase/auth'
import { connectStorageEmulator, getStorage, ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage'
import {
  collection,
  connectFirestoreEmulator,
  disableNetwork,
  enableNetwork,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  initializeFirestore,
  memoryLocalCache,
  persistentLocalCache,
  persistentMultipleTabManager,
  type Firestore,
} from 'firebase/firestore'
import type { BusinessType, RestaurantAccount, RestaurantBranding, RestaurantMember, UserRole } from '../types'

interface FirebaseWebConfig {
  apiKey: string
  authDomain: string
  projectId: string
  storageBucket: string
  messagingSenderId: string
  appId: string
  measurementId?: string
}

export interface FirebaseContext {
  app: FirebaseApp
  auth: Auth
  db: Firestore
  tenantId: string
  /** @deprecated Compatibility for unconverted restaurant UI only. */
  restaurantId: string
}

interface FirebaseRuntime {
  app: FirebaseApp
  auth: Auth
  db: Firestore
}

function readFirebaseConfig(): FirebaseWebConfig | null {
  validateFirebaseEnvironment(import.meta.env, import.meta.env.PROD)
  const config = {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: import.meta.env.VITE_FIREBASE_APP_ID,
    measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
  }

  const requiredValues = [
    config.apiKey,
    config.authDomain,
    config.projectId,
    config.storageBucket,
    config.messagingSenderId,
    config.appId,
  ]

  return requiredValues.every(Boolean) ? config : null
}

/** @deprecated Use ActiveTenantContext. */
export function getFirebaseRestaurantId(): string { return getActiveTenant()?.tenantId || '' }
/** @deprecated Selection is owned by authStore and verified memberships. */
export function setFirebaseRestaurantId(id: string) {
  if (id !== getActiveTenant()?.tenantId) throw new Error('Selecciona una empresa mediante tu membresía.')
}

export function isFirebaseConfigured() {
  return Boolean(readFirebaseConfig())
}

let firebaseRuntimePromise: Promise<FirebaseRuntime | null> | null = null
let storageEmulatorConnected = false

/** Inicializa app, Firestore y Auth una sola vez por sesion. */
async function getFirebaseRuntime(): Promise<FirebaseRuntime | null> {
  if (!isFirebaseConfigured()) {
    return null
  }

  if (!firebaseRuntimePromise) {
    firebaseRuntimePromise = (async () => {
      const firebaseConfig = readFirebaseConfig()

      if (!firebaseConfig) {
        return null
      }

      const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig)
      let db: Firestore

      const useEmulator = import.meta.env.VITE_USE_FIREBASE_EMULATOR === 'true'

      // La persistencia local tiene que configurarse ANTES de la primera
      // llamada a getFirestore: si se pide la instancia primero, Firestore
      // queda con cache en memoria y la aplicacion pierde todo al cerrarse,
      // que es justo lo contrario de lo que necesita quien vende en calle.
      //
      // Contra el emulador se usa cache en memoria para no arrastrar datos
      // entre sesiones de desarrollo, salvo que se pida explicitamente la
      // cache persistente para poder validar el comportamiento offline real.
      const useMemoryCache = useEmulator && import.meta.env.VITE_EMULATOR_PERSISTENT_CACHE !== 'true'

      try {
        db = initializeFirestore(app, {
          localCache: useMemoryCache
            ? memoryLocalCache()
            : persistentLocalCache({
                tabManager: persistentMultipleTabManager(),
              }),
        })
      } catch {
        // Ya inicializada (por ejemplo, en un hot reload): se reutiliza.
        db = getFirestore(app)
      }

      const auth = getAuth(app)

      if (useEmulator) {
        const host = window.location.hostname || 'localhost'
        // Custom ports for PACHAX: 8185 for Firestore, 9195 for Auth
        connectFirestoreEmulator(db, host, 8185)
        connectAuthEmulator(auth, `http://${host}:9195`, { disableWarnings: true })
      }

      try {
        await setPersistence(auth, browserLocalPersistence)
      } catch {
        await setPersistence(auth, inMemoryPersistence)
      }

      // Interruptor de red solo para desarrollo/QA: permite reproducir el modo
      // avion desde la propia capa de Firestore al validar el flujo offline.
      if (import.meta.env.DEV) {
        ;(window as unknown as { __pachaxDevNetwork?: unknown }).__pachaxDevNetwork = {
          goOffline: () => disableNetwork(db),
          goOnline: () => enableNetwork(db),
        }
      }

      return { app, auth, db }
    })()
  }

  return firebaseRuntimePromise
}

export async function getFirebaseContext(): Promise<FirebaseContext | null> {
  const tenantId = getActiveTenant()?.tenantId || ''
  const runtime = await getFirebaseRuntime()
  if (!runtime) return null
  return { ...runtime, tenantId, restaurantId: tenantId }
}


/**
 * Instancia secundaria de Auth para crear cuentas sin cerrar la sesion activa.
 *
 * Tiene que respetar el modo emulador: sin esto, probar en el emulador creaba
 * usuarios reales en el proyecto de produccion.
 */
export async function signInWithEmail(email: string, password: string) {
  const context = await getFirebaseContext()

  if (!context) {
    throw new Error('Firebase no esta configurado.')
  }

  return signInWithEmailAndPassword(context.auth, email, password)
}

export async function signOutUser() {
  const context = await getFirebaseContext()

  if (!context) {
    return
  }

  await firebaseSignOut(context.auth)
}

export async function getCurrentFirebaseUser() {
  const context = await getFirebaseContext()
  return context?.auth.currentUser ?? null
}

export async function subscribeToAuthChanges(listener: (user: User | null) => void): Promise<Unsubscribe> {
  const context = await getFirebaseContext()

  if (!context) {
    return () => undefined
  }

  return onAuthStateChanged(context.auth, listener)
}

export async function fetchRestaurantAccount(restaurantId: string): Promise<RestaurantAccount | null> {
  const context = await getFirebaseContext()
  if (!context) return null

  const ref = doc(context.db, 'tenants', restaurantId)
  const snap = await getDoc(ref)
  if (!snap.exists()) return null

  const data = snap.data()
  return {
    id: snap.id,
    name: data.name || 'Mi Restaurante',
    slug: data.slug || restaurantId,
    ownerUid: data.ownerUid || '',
    createdAt: data.createdAt || new Date().toISOString(),
    plan: data.plan || 'pro',
    businessType: data.businessType === 'route_distribution' ? 'mobile_distribution' : 'restaurant',
    currencyCode: data.configuration?.currency || 'BOB',
    currencySymbol: data.configuration?.currencySymbol || 'Bs',
    branding: data.branding ? { name: data.name, logoUrl: data.branding.logoUrl, primaryColor: data.branding.primary, accentColor: data.branding.accent } : {
      name: data.name || 'Mi Restaurante',
      primaryColor: '#0B132B',
      accentColor: '#00F0FF',
      tablesCount: 12,
    },
  }
}

/** Configura el perfil del tenant (tipo de empresa, moneda, marca). */
export async function updateRestaurantProfile(
  restaurantId: string,
  updates: {
    name?: string
    businessType?: BusinessType
    currencyCode?: string
    currencySymbol?: string
    branding?: Partial<RestaurantBranding>
  },
) {
  const context = await getFirebaseContext()
  if (!context) throw new Error('Firebase no esta configurado.')

  if (restaurantId !== context.tenantId) throw new Error('Empresa activa inválida.')
  if (updates.businessType) throw new Error('El tipo de empresa requiere una migración explícita.')
  const payload: Record<string, unknown> = { action: 'updateSettings', tenantId: context.tenantId }
  if (updates.name) payload.name = updates.name
  if (updates.currencyCode) payload.currency = updates.currencyCode
  if (updates.currencySymbol) payload.currencySymbol = updates.currencySymbol
  if (updates.branding) payload.branding = Object.fromEntries(Object.entries({ primary: updates.branding.primaryColor, accent: updates.branding.accentColor }).filter(([, value]) => value !== undefined))
  await gateway('tenantGateway', payload)
}

export async function updateRestaurantBranding(restaurantId: string, branding: Partial<RestaurantBranding>) {
  const context = await getFirebaseContext()
  if (!context) throw new Error('Firebase no está configurado.')

  if (restaurantId !== context.tenantId) throw new Error('Empresa activa inválida.')
  const safeBranding = Object.fromEntries(Object.entries({ primary: branding.primaryColor, accent: branding.accentColor }).filter(([, value]) => value !== undefined))
  await gateway('tenantGateway', { action: 'updateSettings', tenantId: context.tenantId, branding: safeBranding })
}

/** @deprecated The new owner registers in the onboarding flow. */
export async function createNewRestaurantAccount(_input: { restaurantName: string; ownerName: string; email: string; password: string }): Promise<string> {
  void _input
  throw new Error('Utiliza el nuevo onboarding de empresas.')
}

export async function listRestaurantMembers() {
  const context = await getFirebaseContext()
  if (!context) throw new Error('Firebase no esta configurado.')

  const snap = await getDocs(collection(context.db, 'tenants', context.restaurantId, 'members'))
  return snap.docs.map(memberDoc => {
    const data = memberDoc.data()
    return { ...data, uid: memberDoc.id, role: data.roleId === 'owner' ? 'admin' : data.roleId,
      active: data.status === 'active', routeId: data.routeIds?.[0] || '' } as RestaurantMember
  })
}

export async function createRestaurantMember(input: {
  email: string
  password: string
  displayName: string
  role: UserRole
  /** Ruta asignada (roles de distribucion) */
  routeId?: string
  warehouseId?: string
}) {
  const context = await getFirebaseContext()
  if (!context) throw new Error('Firebase no esta configurado.')

  await gateway('tenantGateway', { action: 'createMember', tenantId: context.tenantId, operationId: crypto.randomUUID(), ...input, roleId: input.role })
}

async function callMemberAdministration<TResult>(payload: Record<string, unknown>): Promise<TResult> {
  const tenantId = getActiveTenant()?.tenantId
  if (!tenantId) throw new Error('Selecciona una empresa.')
  return gateway<TResult>('tenantGateway', { ...payload, tenantId })
}

export async function updateRestaurantMember(uid: string, updates: Partial<Pick<RestaurantMember, 'role' | 'active' | 'displayName' | 'email' | 'routeId' | 'warehouseId'>>) {
  await callMemberAdministration<{ changed: boolean }>({ action: 'updateMember', uid, ...updates })
}

export async function sendRestaurantMemberPasswordReset(email: string) {
  const context = await getFirebaseContext()
  if (!context) throw new Error('Firebase no esta configurado.')

  await sendPasswordResetEmail(context.auth, email.trim())
}

export async function changeRestaurantMemberPassword(uid: string, password: string) {
  await callMemberAdministration<{ changed: boolean }>({ action: 'changePassword', uid, password })
}

export async function deleteRestaurantMemberAccess(uid: string) {
  await callMemberAdministration<{ deleted: boolean }>({ action: 'deleteMember', uid })
}

export async function uploadProductImageToFirebase(file: File, tenantId: string): Promise<string> {
  const context = await getFirebaseContext()
  if (!context) throw new Error('Firebase no esta configurado.')

  const storage = getStorage(context.app)
  if (import.meta.env.VITE_USE_FIREBASE_EMULATOR === 'true' && !storageEmulatorConnected) {
    connectStorageEmulator(storage, window.location.hostname || 'localhost', 9295)
    storageEmulatorConnected = true
  }
  const fileExt = file.name.split('.').pop() || 'jpg'
  const path = `tenants/${tenantId}/products/${Date.now()}_${Math.random().toString(36).substring(2, 7)}.${fileExt}`
  const fileRef = storageRef(storage, path)

  await uploadBytes(fileRef, file)
  return getDownloadURL(fileRef)
}
