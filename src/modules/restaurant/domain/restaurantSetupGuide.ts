import type { Product } from '../../../types'
import type { RestaurantSector, RestaurantTable } from '../types'

export type RestaurantSetupStepId = 'business' | 'floor' | 'products' | 'team' | 'shift'

export type RestaurantSetupFacts = {
  hasBusinessIdentity: boolean
  sectors: RestaurantSector[]
  tables: RestaurantTable[]
  products: Product[]
  members?: Array<{ active?: boolean; role?: string }>
  shift: RestaurantSetupShift | null
  shiftHistory: RestaurantSetupShift[]
}

/** Only the persisted evidence needed by the setup guide. */
export type RestaurantSetupShift = {
  id: string
  openedAt: string
}

export type RestaurantSetupStep = {
  id: RestaurantSetupStepId
  title: string
  description: string
  help: string
  module: 'settings' | 'tables' | 'products' | 'users' | 'cash'
  complete: boolean
}

export function getRestaurantSetupSteps(facts: RestaurantSetupFacts): RestaurantSetupStep[] {
  const activeSectors = facts.sectors.filter((sector) => sector.active)
  const activeTables = facts.tables.filter((table) => !table.archivedAt && table.active !== false)
  const hasFloor = activeSectors.length > 0 && activeTables.some((table) => activeSectors.some((sector) => sector.id === table.sectorId))
  const hasProduct = facts.products.some((product) => product.isActive && product.availability !== 'archived' && Number(product.price) > 0 && product.name.trim().length > 0)
  const hasTeam = Boolean(facts.members?.some((member) => member.active !== false && Boolean(member.role)))
  const hasShiftEvidence = Boolean(facts.shift || facts.shiftHistory.length > 0)

  return [
    { id: 'business', title: 'Configura tu negocio', description: 'Revisa el nombre, datos y apariencia del restaurante.', help: 'El logo y la impresora son opcionales.', module: 'settings', complete: facts.hasBusinessIdentity },
    { id: 'floor', title: 'Organiza tu salón', description: 'Crea sectores y mesas para tomar pedidos correctamente.', help: 'Necesitas al menos un sector y una mesa activa vinculada.', module: 'tables', complete: hasFloor },
    { id: 'products', title: 'Registra tus productos', description: 'Agrega platos, bebidas y sus recetas cuando correspondan.', help: 'Un producto activo con nombre y precio ya deja listo el catálogo.', module: 'products', complete: hasProduct },
    { id: 'team', title: 'Crea tu equipo', description: 'Configura los roles de Caja, Mesero, Cocina e Inventario.', help: 'El paso se completa cuando existe al menos un usuario activo con rol.', module: 'users', complete: hasTeam },
    { id: 'shift', title: 'Abre tu primer turno', description: 'Registra el efectivo inicial antes de empezar a vender.', help: 'También cuenta un turno que ya fue abierto y cerrado.', module: 'cash', complete: hasShiftEvidence },
  ]
}

/**
 * The guide contains administrative setup tasks, so cashiers and operational
 * roles must not receive it unless their granted permissions say otherwise.
 */
export function mayManageRestaurantSetup(role: string, canManageSettings?: boolean): boolean {
  if (['cashier', 'waiter', 'kitchen', 'inventory'].includes(role)) return false
  return canManageSettings ?? ['owner', 'admin', 'team'].includes(role)
}

/** UI preference only. Completion is always derived from persisted business data. */
export function restaurantSetupGuidePreferenceKey(tenantId: string, uid: string): string {
  return `pachax:restaurant-setup-guide:${tenantId}:${uid}:v1`
}
