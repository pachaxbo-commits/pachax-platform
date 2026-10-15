import type { PrinterProfile } from '../../types/printing.ts'

/**
 * Persistencia y gestión de perfiles de impresoras con aislamiento multitenant.
 *
 * Scoping obligatorio por empresa y sucursal:
 * pachax:printers:{tenantId}:{branchId}
 * Las impresoras son hardware local en el dispositivo del cliente.
 */

export function getPrinterStorageKey(tenantId: string = 'principal', branchId: string = 'main'): string {
  return `pachax:printers:${tenantId}:${branchId}`
}

export function loadPrinterProfiles(tenantId?: string, branchId?: string): PrinterProfile[] {
  const tid = tenantId || 'principal'
  const bid = branchId || 'main'
  try {
    const scopedKey = getPrinterStorageKey(tid, bid)
    const raw = localStorage.getItem(scopedKey)
    if (raw) {
      const parsed = JSON.parse(raw)
      return Array.isArray(parsed) ? (parsed as PrinterProfile[]) : []
    }

    // Migración / Fallback seguro si existe configuración en clave legacy global
    const legacyRaw = localStorage.getItem('pachax:printer-profiles')
    if (legacyRaw) {
      const parsed = JSON.parse(legacyRaw)
      if (Array.isArray(parsed) && parsed.length > 0) {
        const matching = parsed.filter((p: PrinterProfile) => !p.restaurantId || p.restaurantId === tid)
        if (matching.length > 0) {
          persistPrinterProfiles(matching, tid, bid)
          return matching
        }
      }
    }
    return []
  } catch {
    return []
  }
}

export function persistPrinterProfiles(profiles: PrinterProfile[], tenantId?: string, branchId?: string): void {
  const tid = tenantId || 'principal'
  const bid = branchId || 'main'
  try {
    localStorage.setItem(getPrinterStorageKey(tid, bid), JSON.stringify(profiles))
  } catch {
    // Sin almacenamiento local la sesión sigue en memoria
  }
}

/** Guarda o actualiza un perfil scoped en localStorage */
export function savePrinterProfileLocal(profile: PrinterProfile, tenantId?: string, branchId?: string): PrinterProfile {
  const tid = tenantId || profile.restaurantId || 'principal'
  const bid = branchId || profile.branchId || 'main'
  const scopedProfile: PrinterProfile = {
    ...profile,
    restaurantId: tid,
    branchId: bid,
  }

  const current = loadPrinterProfiles(tid, bid)
  const next = [...current.filter(p => p.id !== scopedProfile.id), scopedProfile]
  persistPrinterProfiles(next, tid, bid)
  return scopedProfile
}

/** Elimina un perfil scoped de localStorage */
export function deletePrinterProfileLocal(profileId: string, tenantId?: string, branchId?: string): void {
  const tid = tenantId || 'principal'
  const bid = branchId || 'main'
  const current = loadPrinterProfiles(tid, bid)
  persistPrinterProfiles(current.filter(p => p.id !== profileId), tid, bid)
}

/** Impresora activa para un rol determinado en la empresa actual. */
export function getActivePrinterForRole(role: 'receipt' | 'kitchen' | 'bar', tenantId?: string, branchId?: string): PrinterProfile | null {
  const tid = tenantId || 'principal'
  const bid = branchId || 'main'
  const profiles = loadPrinterProfiles(tid, bid).filter(p => p.isActive)
  return profiles.find(p => p.role === role) || null
}

/** Impresora de recibos activa, si hay alguna configurada. */
export function getActiveReceiptPrinter(tenantId?: string, branchId?: string): PrinterProfile | null {
  return getActivePrinterForRole('receipt', tenantId, branchId) || loadPrinterProfiles(tenantId, branchId).find(p => p.isActive) || null
}

/** Impresora de cocina activa, si hay alguna configurada. */
export function getActiveKitchenPrinter(tenantId?: string, branchId?: string): PrinterProfile | null {
  return getActivePrinterForRole('kitchen', tenantId, branchId) || null
}
