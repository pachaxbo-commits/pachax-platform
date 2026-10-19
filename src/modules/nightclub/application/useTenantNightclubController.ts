import { useCallback, useEffect, useMemo, useState } from 'react'
import type {
  NightclubAccount,
  NightclubCashMovement,
  NightclubCommission,
  NightclubCommissionPayment,
  NightclubCourtesy,
  NightclubCustomer,
  NightclubCustomerIncident,
  NightclubDataset,
  NightclubMember,
  NightclubShift,
  NightclubStaff,
} from '../domain/nightclubAccounts'
import type {
  NightclubLoungeSale,
  NightclubPromoter,
  NightclubPromoterConsumption,
  NightclubPromoterEvent,
  NightclubTicketSale,
} from '../domain/nightclubPromoters'
import { TenantNightclubRepository } from '../data/tenantNightclubRepository'
import type {
  NightclubCatalogSnapshot,
  NightclubFloorSnapshot,
  NightclubInventorySnapshot,
} from '../data/nightclubRepository'
import { gateway } from '../../../services/gateway'
import { createTenantNightclubActions } from './tenantNightclubActions'

import { getActiveTenant } from '../../../store/activeTenant'
import { BusinessTemplateRegistry } from '../../../core/templates'

interface UseTenantNightclubControllerProps {
  tenantId: string
  branchId?: string
  uid: string
  userName: string
  role: string
  companyName: string
  logoUrl?: string
  permissions?: ReadonlySet<string> | null
}

export function useTenantNightclubController({
  tenantId,
  branchId = 'main',
  uid,
  userName,
  role,
  companyName,
  logoUrl,
  permissions,
}: UseTenantNightclubControllerProps) {
  const repository = useMemo(() => new TenantNightclubRepository(tenantId, branchId), [tenantId, branchId])

  const [floor, setFloor] = useState<NightclubFloorSnapshot>({ zones: [], tables: [], reservations: [] })
  const [accounts, setAccounts] = useState<NightclubAccount[]>([])
  const [catalog, setCatalog] = useState<NightclubCatalogSnapshot>({ products: [] })
  const [inventorySnap, setInventorySnap] = useState<NightclubInventorySnapshot>({ inventory: [], recentMovements: [] })
  const [shift, setShift] = useState<NightclubShift | null>(null)
  const [cashMovements, setCashMovements] = useState<NightclubCashMovement[]>([])
  const [customers, setCustomers] = useState<NightclubCustomer[]>([])
  const [staff, setStaff] = useState<NightclubStaff[]>([])
  const [promoters, setPromoters] = useState<NightclubPromoter[]>([])
  const [promoterEvents, setPromoterEvents] = useState<NightclubPromoterEvent[]>([])
  const [promoterTicketSales, setPromoterTicketSales] = useState<NightclubTicketSale[]>([])
  const [promoterLoungeSales, setPromoterLoungeSales] = useState<NightclubLoungeSale[]>([])
  const [promoterConsumptions, setPromoterConsumptions] = useState<NightclubPromoterConsumption[]>([])
  const [members, setMembers] = useState<NightclubMember[]>([])
  const [courtesies, setCourtesies] = useState<NightclubCourtesy[]>([])
  const [commissions, setCommissions] = useState<NightclubCommission[]>([])
  const [commissionPayments, setCommissionPayments] = useState<NightclubCommissionPayment[]>([])
  const [customerIncidents, setCustomerIncidents] = useState<NightclubCustomerIncident[]>([])
  const [syncError, setSyncError] = useState<string | null>(null)

  const can = useCallback((perm: string) => {
    if (permissions) return permissions.has(perm)
    const activeTenant = getActiveTenant()
    const perms: readonly string[] = activeTenant?.permissions ?? (
      BusinessTemplateRegistry.nightclub_lounge.roles.find(r => r.id === role)?.permissions ?? []
    )
    return perms.includes(perm)
  }, [permissions, role])

  // Subscriptions with permission gating and error handling
  useEffect(() => {
    const handleSyncError = (colName: string) => (err: Error) => {
      console.warn(`[NightclubApp] Error de sincronización en ${colName}:`, err.message)
      if (err.message.includes('permission-denied') || (err as { code?: string }).code === 'permission-denied') {
        setSyncError(`Permiso denegado para consultar ${colName}. Verifica los roles asignados a tu usuario.`)
      } else {
        setSyncError(`Problema de conexión al sincronizar ${colName}. Reintentando automáticamente...`)
      }
    }

    const unsubs: Array<(() => void) | undefined> = []

    // 1. Zonas, mesas y reservas: orders.read o settings.manage
    if (can('orders.read') || can('settings.manage')) {
      unsubs.push(repository.subscribeFloor(setFloor, handleSyncError('zonas y mesas')))
    }

    // 2. Cuentas operativas: orders.read, cash.close o sales.read
    if (can('orders.read') || can('cash.close') || can('sales.read')) {
      unsubs.push(repository.subscribeOperationalAccounts(setAccounts, handleSyncError('cuentas operativas')))
    }

    // 3. Turno activo: cash.close o settings.manage
    if (can('cash.close') || can('settings.manage')) {
      unsubs.push(repository.subscribeActiveShift(setShift, handleSyncError('turno activo')))
    }

    // 4. Catálogo: sales.create, orders.read o products.manage
    if (can('sales.create') || can('orders.read') || can('products.manage')) {
      unsubs.push(repository.subscribeCatalog(setCatalog, handleSyncError('catálogo')))
    }

    // 5. Inventario: inventory.read o settings.manage
    if (can('inventory.read') || can('settings.manage')) {
      unsubs.push(repository.subscribeInventory(setInventorySnap, handleSyncError('inventario')))
    }

    // 6. Relacionadores: settings.manage, sales.read o sales.create
    if (can('settings.manage') || can('sales.read') || can('sales.create')) {
      if (repository.subscribePromoters) unsubs.push(repository.subscribePromoters(setPromoters, handleSyncError('relacionadores')))
      if (repository.subscribePromoterEvents) unsubs.push(repository.subscribePromoterEvents(setPromoterEvents, handleSyncError('eventos de relacionadores')))
      if (repository.subscribePromoterTicketSales) unsubs.push(repository.subscribePromoterTicketSales(setPromoterTicketSales, handleSyncError('entradas de relacionadores')))
      if (repository.subscribePromoterLoungeSales) unsubs.push(repository.subscribePromoterLoungeSales(setPromoterLoungeSales, handleSyncError('lounges de relacionadores')))
    }

    // 7. Consumos de relacionadores: settings.manage o sales.read
    if (can('settings.manage') || can('sales.read')) {
      if (repository.subscribePromoterConsumptions) unsubs.push(repository.subscribePromoterConsumptions(setPromoterConsumptions, handleSyncError('consumos de relacionadores')))
    }

    // 8. Socios: customers.read o orders.read
    if (can('customers.read') || can('orders.read')) {
      if (repository.subscribeMembers) unsubs.push(repository.subscribeMembers(setMembers, handleSyncError('socios')))
    }

    // 9. Cortesías: orders.read o sales.read
    if (can('orders.read') || can('sales.read')) {
      if (repository.subscribeCourtesies) unsubs.push(repository.subscribeCourtesies(setCourtesies, handleSyncError('cortesías')))
    }

    // 10. Comisiones: sales.read, orders.read o cash.close
    if (can('sales.read') || can('orders.read') || can('cash.close')) {
      if (repository.subscribeCommissions) unsubs.push(repository.subscribeCommissions(setCommissions, handleSyncError('comisiones')))
    }

    // 11. Pagos de comisiones: cash.close o settings.manage
    if (can('cash.close') || can('settings.manage')) {
      if (repository.subscribeCommissionPayments) unsubs.push(repository.subscribeCommissionPayments(setCommissionPayments, handleSyncError('pagos de comisiones')))
    }

    // 12. Incidentes de convivencia: solo admin/owner
    const isAdmin = ['owner', 'admin'].includes(role)
    if (isAdmin && repository.subscribeCustomerIncidents) {
      unsubs.push(repository.subscribeCustomerIncidents(setCustomerIncidents, handleSyncError('incidentes de clientes')))
    }

    return () => {
      unsubs.forEach(unsub => unsub?.())
    }
  }, [repository, role, can])

  // Shift-dependent cash movements (only if cash.close or settings.manage)
  useEffect(() => {
    if (!shift?.id || (!can('cash.close') && !can('settings.manage'))) {
      setCashMovements([])
      return
    }
    const unsubCash = repository.subscribeCashMovements(
      shift.id,
      setCashMovements,
      (err: Error) => {
        console.warn('[NightclubApp] Error al consultar movimientos de caja:', err.message)
      }
    )
    return () => {
      unsubCash()
    }
  }, [repository, shift?.id, can])

  // Periodic / Initial fetch for customers & staff
  const reloadStaff = useCallback(async () => {
    if (!can('users.manage')) return
    try {
      const list = await repository.getStaff()
      setStaff(list)
    } catch {
      // Ignored in non-permission scopes
    }
  }, [repository, can])

  const reloadCustomers = useCallback(async () => {
    if (!can('customers.read') && !can('settings.manage')) return
    try {
      const list = await repository.getCustomers()
      setCustomers(list)
    } catch {
      // Ignored
    }
  }, [repository, can])

  useEffect(() => {
    void reloadStaff()
    void reloadCustomers()
  }, [reloadStaff, reloadCustomers])

  const assembledData: NightclubDataset = useMemo(() => ({
    zones: floor.zones,
    tables: floor.tables,
    reservations: floor.reservations,
    accounts,
    products: catalog.products,
    inventory: inventorySnap.inventory,
    inventoryMovements: inventorySnap.recentMovements,
    customers,
    shift,
    shiftHistory: shift?.status === 'closed' ? [shift] : [],
    cashMovements,
    staff,
    promoters,
    promoterEvents,
    promoterTicketSales,
    promoterLoungeSales,
    promoterConsumptions,
    members,
    courtesies,
    commissions,
    commissionPayments,
    customerIncidents,
    audit: [],
    branding: {
      businessName: companyName,
      subtitle: 'Club nocturno / Lounge',
      logoDataUrl: logoUrl,
      primaryColor: '#d8a84e',
      accentColor: '#35d0a0',
      surfaceColor: '#0d1720',
      theme: 'dark',
    },
  }), [floor, accounts, catalog, inventorySnap, customers, shift, cashMovements, staff, promoters, promoterEvents, promoterTicketSales, promoterLoungeSales, promoterConsumptions, members, courtesies, commissions, commissionPayments, customerIncidents, companyName, logoUrl])

  const actions = useMemo(() => createTenantNightclubActions({
    tenantId,
    branchId,
    uid,
    userName,
    role,
    staff,
    shift,
    reloadStaff,
    reloadCustomers,
    repository,
    gatewayFn: gateway,
  }), [tenantId, branchId, uid, userName, role, staff, shift, reloadStaff, reloadCustomers, repository])

  return {
    data: assembledData,
    incidentResponsibleLabel: userName,
    syncError,
    setSyncError,
    ...actions,
  }
}
