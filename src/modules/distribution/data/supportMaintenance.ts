import { EmailAuthProvider, reauthenticateWithCredential } from 'firebase/auth'
import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore'
import { getFirebaseContext } from '../../../lib/firebase'
import { LEGACY_FUNCTIONS_REGION } from '../../../config/functions'

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
  const context = await getFirebaseContext()
  if (!context) throw new Error('Firebase no está configurado.')
  const snapshot = await getDoc(doc(context.db, 'tenants', context.tenantId, 'supportConfig', 'main'))
  return { ...DEFAULT_SUPPORT_SETTINGS, ...(snapshot.exists() ? snapshot.data() : {}) } as DistributionOperationalSettings
}

export async function saveSupportSettings(settings: Partial<DistributionOperationalSettings>): Promise<void> {
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
  const call = await callable<{ action: 'prepareCleanDelivery' }, ResetPreview>('changePachaxMemberPassword')
  return (await call({ action: 'prepareCleanDelivery' })).data
}

export async function executeCleanDelivery(input: { requestId: string; password: string; phrase: string }): Promise<ResetResult> {
  const context = await getFirebaseContext()
  const user = context?.auth.currentUser
  if (!user?.email) throw new Error('La cuenta actual no puede confirmar su identidad.')
  await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, input.password))
  await user.getIdToken(true)
  const call = await callable<{ action: 'executeCleanDelivery'; requestId: string; phrase: string; acknowledgement: boolean }, ResetResult>('changePachaxMemberPassword')
  return (await call({ action: 'executeCleanDelivery', requestId: input.requestId, phrase: input.phrase, acknowledgement: true })).data
}
