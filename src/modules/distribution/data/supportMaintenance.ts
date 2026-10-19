import { EmailAuthProvider, reauthenticateWithCredential } from 'firebase/auth'
import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore'
import { getFirebaseContext } from '../../../lib/firebase.ts'
import { LEGACY_FUNCTIONS_REGION } from '../../../config/functions.ts'
import { isDemoModeActive, getDemoItem, setDemoItem, clearDemoState } from '../../../demo/core/demoContext.ts'

export interface DistributionOperationalSettings {
  expiryAlertDays: number
  creditBlockDays: number
  requireQrVerification: boolean
  /** @deprecated Conservado temporalmente sólo para lectura y migración de tenants anteriores */
  companyName?: string
  /** @deprecated Conservado temporalmente sólo para lectura y migración */
  taxId?: string
  /** @deprecated Conservado temporalmente sólo para lectura y migración */
  address?: string
  /** @deprecated Conservado temporalmente sólo para lectura y migración */
  phone?: string
  /** @deprecated Conservado temporalmente sólo para lectura y migración */
  receiptHeader?: string
  /** @deprecated Conservado temporalmente sólo para lectura y migración */
  receiptFooter?: string
  /** @deprecated El ancho de papel ahora pertenece a cada PrinterProfile local */
  defaultPaperWidth?: '58mm' | '80mm'
}

export type SupportSettings = DistributionOperationalSettings

export interface ResetPreview {
  requestId: string
  expiresAt: string
  totalDocuments: number
  counts: Record<string, number>
  preserved: string[]
}

export interface ResetResult {
  resetId: string
  backupId: string
  deletedDocuments: number
  completedAt: string
}

export const DEFAULT_SUPPORT_SETTINGS: DistributionOperationalSettings = {
  expiryAlertDays: 14,
  creditBlockDays: 7,
  requireQrVerification: true,
}

let maintenanceEmulatorConnected = false

async function callable<TInput, TOutput>(name: string) {
  const context = await getFirebaseContext()
  if (!context) throw new Error('Firebase no está configurado.')
  const { connectFunctionsEmulator, getFunctions, httpsCallable } = await import('firebase/functions')
  const functions = getFunctions(context.app, LEGACY_FUNCTIONS_REGION)
  if (import.meta.env.VITE_USE_FIREBASE_EMULATOR === 'true' && !maintenanceEmulatorConnected) {
    connectFunctionsEmulator(functions, window.location.hostname || 'localhost', 5101)
    maintenanceEmulatorConnected = true
  }
  return httpsCallable<TInput, TOutput>(functions, name)
}

export async function loadSupportSettings(): Promise<DistributionOperationalSettings> {
  if (isDemoModeActive()) {
    const raw = getDemoItem('route_distribution', 'support_settings')
    if (raw) {
      try {
        return { ...DEFAULT_SUPPORT_SETTINGS, ...JSON.parse(raw) }
      } catch {
        // Fallback
      }
    }
    return { ...DEFAULT_SUPPORT_SETTINGS }
  }
  const context = await getFirebaseContext()
  if (!context) throw new Error('Firebase no está configurado.')
  const snapshot = await getDoc(doc(context.db, 'tenants', context.tenantId, 'supportConfig', 'main'))
  return { ...DEFAULT_SUPPORT_SETTINGS, ...(snapshot.exists() ? snapshot.data() : {}) } as DistributionOperationalSettings
}

export async function saveSupportSettings(settings: Partial<DistributionOperationalSettings>): Promise<void> {
  if (isDemoModeActive()) {
    const current = await loadSupportSettings()
    const updated = {
      ...current,
      ...settings,
      expiryAlertDays: Number.isInteger(settings.expiryAlertDays) ? settings.expiryAlertDays! : current.expiryAlertDays,
      creditBlockDays: Number.isInteger(settings.creditBlockDays) ? settings.creditBlockDays! : current.creditBlockDays,
      requireQrVerification: settings.requireQrVerification !== undefined ? Boolean(settings.requireQrVerification) : current.requireQrVerification,
    }
    setDemoItem('route_distribution', 'support_settings', JSON.stringify(updated))
    return
  }
  const context = await getFirebaseContext()
  if (!context?.auth.currentUser) throw new Error('Inicia sesión para guardar la configuración.')
  // Solo se persisten las políticas operativas canónicas en supportConfig
  await setDoc(
    doc(context.db, 'tenants', context.tenantId, 'supportConfig', 'main'),
    {
      tenantId: context.tenantId,
      expiryAlertDays: Number.isInteger(settings.expiryAlertDays) ? settings.expiryAlertDays : 14,
      creditBlockDays: Number.isInteger(settings.creditBlockDays) ? settings.creditBlockDays : 7,
      requireQrVerification: Boolean(settings.requireQrVerification),
      updatedAt: serverTimestamp(),
      updatedBy: context.auth.currentUser.uid,
    },
    { merge: true }
  )
}

export async function prepareCleanDelivery(): Promise<ResetPreview> {
  if (isDemoModeActive()) {
    return {
      requestId: `demo_reset_${Date.now()}`,
      expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
      totalDocuments: 24,
      counts: {
        distCustomers: 3,
        distBalances: 3,
        distDispatches: 1,
        distSales: 2,
        distReceivables: 1,
        distCollections: 1,
        distExpenses: 1,
      },
      preserved: ['supportConfig', 'preview-distribution'],
    }
  }
  const call = await callable<{ action: 'prepareCleanDelivery' }, ResetPreview>('changePachaxMemberPassword')
  return (await call({ action: 'prepareCleanDelivery' })).data
}

export async function executeCleanDelivery(input: { requestId: string; password: string; phrase: string }): Promise<ResetResult> {
  if (isDemoModeActive()) {
    clearDemoState('route_distribution')
    return {
      resetId: input.requestId,
      backupId: `demo_backup_${Date.now()}`,
      deletedDocuments: 24,
      completedAt: new Date().toISOString(),
    }
  }
  const context = await getFirebaseContext()
  const user = context?.auth.currentUser
  if (!user?.email) throw new Error('La cuenta actual no puede confirmar su identidad.')
  await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, input.password))
  await user.getIdToken(true)
  const call = await callable<{ action: 'executeCleanDelivery'; requestId: string; phrase: string; acknowledgement: boolean }, ResetResult>('changePachaxMemberPassword')
  return (await call({ action: 'executeCleanDelivery', requestId: input.requestId, phrase: input.phrase, acknowledgement: true })).data
}
