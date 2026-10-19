import { AndroidBluetoothSppAdapter } from '../../adapters/printing/androidBluetoothSppAdapter.ts'
import { AndroidNetworkTcpPrinterAdapter } from '../../adapters/printing/androidNetworkTcpPrinterAdapter.ts'
import { BrowserDialogPrinterAdapter } from '../../adapters/printing/browserDialogPrinterAdapter.ts'
import { PrintEngineService } from './printEngineService.ts'
import { getFirebaseRestaurantId } from '../../lib/firebase.ts'
import type { PrinterProfile } from '../../types/printing.ts'
import {
  getPrinterStorageKey,
  loadPrinterProfiles,
  persistPrinterProfiles,
  savePrinterProfileLocal,
  deletePrinterProfileLocal,
  getActivePrinterForRole,
  getActiveReceiptPrinter,
  getActiveKitchenPrinter,
  getActiveBarPrinter,
} from './printerProfiles.ts'

export {
  getPrinterStorageKey,
  loadPrinterProfiles,
  persistPrinterProfiles,
  savePrinterProfileLocal,
  deletePrinterProfileLocal,
  getActivePrinterForRole,
  getActiveReceiptPrinter,
  getActiveKitchenPrinter,
  getActiveBarPrinter,
}

let initialized = false

/** Registra un perfil en el motor y lo deja persistido con scope por empresa y sucursal. */
export function savePrinterProfile(profile: PrinterProfile, tenantId?: string, branchId?: string): void {
  const tid = tenantId || profile.restaurantId || getFirebaseRestaurantId() || 'principal'
  const bid = branchId || profile.branchId || 'main'
  const scopedProfile = savePrinterProfileLocal(profile, tid, bid)

  const engine = PrintEngineService.getInstance()
  engine.registerPrinterProfile(scopedProfile)
}

/** Elimina un perfil del almacenamiento local y del motor en memoria. */
export function deletePrinterProfile(profileId: string, tenantId?: string, branchId?: string): void {
  const tid = tenantId || getFirebaseRestaurantId() || 'principal'
  const bid = branchId || 'main'

  const engine = PrintEngineService.getInstance()
  engine.unregisterPrinterProfile(profileId)

  deletePrinterProfileLocal(profileId, tid, bid)
}

export function initializePrinting(tenantId?: string, branchId?: string): void {
  const engine = PrintEngineService.getInstance()

  if (!initialized) {
    initialized = true
    // Adaptadores reales de V1
    engine.registerAdapter(new AndroidBluetoothSppAdapter())
    engine.registerAdapter(new AndroidNetworkTcpPrinterAdapter())
    engine.registerAdapter(new BrowserDialogPrinterAdapter())
  }

  const tid = tenantId || getFirebaseRestaurantId() || 'principal'
  const bid = branchId || 'main'
  for (const profile of loadPrinterProfiles(tid, bid)) {
    engine.registerPrinterProfile(profile)
  }
}
