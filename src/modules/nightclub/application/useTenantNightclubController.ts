import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { doc, onSnapshot } from 'firebase/firestore'
import { getFirebaseContext } from '../../../lib/firebase'
import type {
  NightclubAccount,
  NightclubCashMovement,
  NightclubCashbox,
  NightclubCommission,
  NightclubCommissionPayment,
  NightclubCourtesy,
  NightclubCustomer,
  NightclubCustomerIncident,
  NightclubDataset,
  NightclubInventoryBalance,
  NightclubInventoryLot,
  NightclubLocation,
  NightclubMember,
  NightclubOpenBottle,
  NightclubOperatorContext,
  NightclubShift,
  NightclubStaff,
  NightclubTransfer,
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
import type { NightclubFinancialReadScope } from '../data/nightclubFinancialSubscriptions'
import { canStartNightclubFinancialRead, resolveNightclubFinancialReadScope, sameNightclubFinancialReadScope } from '../data/nightclubFinancialSubscriptions'
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
  const repository = useMemo(() => new TenantNightclubRepository(tenantId, branchId, uid), [tenantId, branchId, uid])

  const [floor, setFloor] = useState<NightclubFloorSnapshot>({ zones: [], tables: [], reservations: [] })
  const [accounts, setAccounts] = useState<NightclubAccount[]>([])
  const [catalog, setCatalog] = useState<NightclubCatalogSnapshot>({ products: [] })
  const [inventorySnap, setInventorySnap] = useState<NightclubInventorySnapshot>({ inventory: [], recentMovements: [] })
  const [shift, setShift] = useState<NightclubShift | null>(null)
  const [cashMovements, setCashMovements] = useState<NightclubCashMovement[]>([])
  const [customersState, setCustomersState] = useState<{ key: string; rows: NightclubCustomer[] }>({ key: '', rows: [] })
  const [staffState, setStaffState] = useState<{ key: string; rows: NightclubStaff[] }>({ key: '', rows: [] })
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

  const [operatorContext, setOperatorContext] = useState<NightclubOperatorContext | null>(null)
  const [rawCashboxes, setRawCashboxes] = useState<NightclubCashbox[]>([])
  const [locations, setLocations] = useState<NightclubLocation[]>([])
  const [inventoryBalances, setInventoryBalances] = useState<NightclubInventoryBalance[]>([])
  const [inventoryLots, setInventoryLots] = useState<NightclubInventoryLot[]>([])
  const [openBottles, setOpenBottles] = useState<NightclubOpenBottle[]>([])
  const [transfers, setTransfers] = useState<NightclubTransfer[]>([])
  const [cashboxShifts, setCashboxShifts] = useState<NightclubShift[]>([])
  const permissionKey = permissions ? [...permissions].sort().join(',') : 'template'
  const contextKey = `${tenantId}:${branchId}:${uid}:${role}:${permissionKey}`
  const customers = useMemo(() => customersState.key === contextKey ? customersState.rows : [], [customersState, contextKey])
  const staff = useMemo(() => staffState.key === contextKey ? staffState.rows : [], [staffState, contextKey])
  const [cashboxScopeState, setCashboxScopeState] = useState<{ key: string; scope: NightclubFinancialReadScope }>({ key: '', scope: { kind: 'unresolved' } })
  const cashboxScopeRef = useRef<{ key: string; scope: NightclubFinancialReadScope }>({ key: '', scope: { kind: 'unresolved' } })
  const memberScope = useMemo(() => cashboxScopeState.key === contextKey ? cashboxScopeState.scope : { kind: 'unresolved' as const }, [cashboxScopeState, contextKey])
  const financialReadScope = memberScope
  const financialScopeReady = cashboxScopeState.key === contextKey && financialReadScope.kind !== 'unresolved'

  useEffect(() => {
    let active = true
    let unsub: (() => void) | null = null
    const updateScope = (scope: NightclubFinancialReadScope) => {
      const previous = cashboxScopeRef.current
      if (previous.key === contextKey && sameNightclubFinancialReadScope(previous.scope, scope)) return
      cashboxScopeRef.current = { key: contextKey, scope }
      setAccounts([]); setCashboxShifts([]); setCashMovements([]); setCommissionPayments([]); setCommissions([]); setShift(null); setOperatorContext(null)
      if (previous.key !== contextKey) {
        setFloor({ zones: [], tables: [], reservations: [] }); setCatalog({ products: [] }); setInventorySnap({ inventory: [], recentMovements: [] })
        setRawCashboxes([]); setLocations([]); setInventoryBalances([]); setInventoryLots([]); setOpenBottles([]); setTransfers([])
        setCustomersState({ key: contextKey, rows: [] }); setStaffState({ key: contextKey, rows: [] })
        setPromoters([]); setPromoterEvents([]); setPromoterTicketSales([]); setPromoterLoungeSales([]); setPromoterConsumptions([])
        setMembers([]); setCourtesies([]); setCustomerIncidents([])
      }
      setSyncError(null)
      setCashboxScopeState({ key: contextKey, scope })
    }
    void getFirebaseContext().then(ctx => {
      if (!ctx || !active || !uid) return
      const memberDoc = doc(ctx.db, 'tenants', tenantId, 'members', uid)
      unsub = onSnapshot(memberDoc, snap => {
        if (!active) return
        if (!snap.exists()) { updateScope({ kind: 'unresolved' }); return }
        updateScope(resolveNightclubFinancialReadScope(snap.data()))
      }, error => {
        if (active) {
          updateScope({ kind: 'unresolved' })
          setSyncError(`No se pudo verificar el alcance de cajas: ${error.message}`)
        }
      })
    })
    return () => {
      active = false
      if (unsub) unsub()
    }
  }, [contextKey, tenantId, uid])

  const authorizedCashboxes = useMemo(() => {
    if (financialReadScope.kind === 'unresolved') return []
    if (financialReadScope.kind === 'unrestricted') return rawCashboxes
    return rawCashboxes.filter(c => financialReadScope.cashboxIds.includes(c.id))
  }, [rawCashboxes, financialReadScope])

  const can = useCallback((perm: string) => {
    if (permissions) return permissions.has(perm)
    const activeTenant = getActiveTenant()
    const perms: readonly string[] = activeTenant?.permissions ?? (
      BusinessTemplateRegistry.nightclub_lounge.roles.find(r => r.id === role)?.permissions ?? []
    )
    return perms.includes(perm)
  }, [permissions, role])

  // Subscriptions with permission gating and error handling
  useLayoutEffect(() => {
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

    // 2. Cuentas operativas con listeners selectivos segun Rules
    const canReadAccounts = can('orders.read') || can('cash.close') || can('sales.read')
    const canReadRounds = can('orders.read') || can('cash.close')
    const canReadPayments = can('cash.close') || can('sales.read')
    if (canReadAccounts && canStartNightclubFinancialRead(financialReadScope)) {
      unsubs.push(repository.subscribeOperationalAccounts(
        setAccounts,
        handleSyncError('cuentas operativas'),
        {
          includeRounds: canReadRounds,
          includePayments: canReadPayments,
          financialReadScope,
        }
      ))
    }

    // 3. Turno activo: cash.close o settings.manage
    if ((can('cash.close') || can('settings.manage')) && financialReadScope.kind === 'unrestricted') {
      unsubs.push(repository.subscribeActiveShift(setShift, handleSyncError('turno activo'), financialReadScope))
    }

    // 4. Catálogo: sales.create, orders.read o products.manage
    if (can('sales.create') || can('orders.read') || can('products.manage')) {
      unsubs.push(repository.subscribeCatalog(setCatalog, handleSyncError('catálogo')))
    }

    // 5. Inventario: SOLO inventory.read (alineado con Rules)
    if (can('inventory.read')) {
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
      if (repository.subscribeCommissions && canStartNightclubFinancialRead(financialReadScope)) unsubs.push(repository.subscribeCommissions(setCommissions, handleSyncError('comisiones'), financialReadScope))
    }

    // 11. Pagos de comisiones: cash.close o settings.manage
    if (can('cash.close') || can('settings.manage')) {
      if (repository.subscribeCommissionPayments && canStartNightclubFinancialRead(financialReadScope)) unsubs.push(repository.subscribeCommissionPayments(setCommissionPayments, handleSyncError('pagos de comisiones'), financialReadScope))
    }

    // 12. Incidentes de convivencia: solo admin/owner
    const isAdmin = ['owner', 'admin'].includes(role)
    if (isAdmin && repository.subscribeCustomerIncidents) {
      unsubs.push(repository.subscribeCustomerIncidents(setCustomerIncidents, handleSyncError('incidentes de clientes')))
    }

    // 13. Contexto de operador del usuario actual (siempre para el usuario autenticado)
    if (repository.subscribeOperatorContext) {
      unsubs.push(repository.subscribeOperatorContext(uid, setOperatorContext, handleSyncError('contexto de operador')))
    }

    // 14a. Cajas: inventory.read o cash.close (Rules: inventory.read || cash.close)
    if (can('inventory.read') || can('cash.close')) {
      if (repository.subscribeCashboxes) unsubs.push(repository.subscribeCashboxes(setRawCashboxes, handleSyncError('cajas')))
    }

    // 14b. Turnos de caja: cash.close o settings.manage (Rules: cash.close || settings.manage)
    if (can('cash.close') || can('settings.manage')) {
      if (repository.subscribeCashboxShifts && canStartNightclubFinancialRead(financialReadScope)) unsubs.push(repository.subscribeCashboxShifts(setCashboxShifts, handleSyncError('turnos de caja'), financialReadScope))
    }

    // 15. Ubicaciones: SOLO inventory.read (Rules: inventory.read)
    if (can('inventory.read')) {
      if (repository.subscribeLocations) unsubs.push(repository.subscribeLocations(setLocations, handleSyncError('ubicaciones')))
    }

    // 16. Inventario sensible: SOLO inventory.read (Rules: inventory.read)
    if (can('inventory.read')) {
      if (repository.subscribeInventoryBalances) unsubs.push(repository.subscribeInventoryBalances(setInventoryBalances, handleSyncError('saldos de inventario')))
      if (repository.subscribeInventoryLots) unsubs.push(repository.subscribeInventoryLots(setInventoryLots, handleSyncError('lotes de inventario')))
      if (repository.subscribeOpenBottles) unsubs.push(repository.subscribeOpenBottles(setOpenBottles, handleSyncError('botellas abiertas')))
      if (repository.subscribeTransfers) unsubs.push(repository.subscribeTransfers(setTransfers, handleSyncError('transferencias')))
    }

    return () => {
      unsubs.forEach(unsub => unsub?.())
    }
  }, [repository, role, can, uid, tenantId, branchId, financialReadScope])

  const effectiveShift = useMemo(() => {
    if (!financialScopeReady) return null
    if (operatorContext?.cashboxId) {
      if (operatorContext.activeShiftId) {
        return cashboxShifts.find(s => s.id === operatorContext.activeShiftId) || null
      }
      return null
    }
    return shift
  }, [financialScopeReady, operatorContext, cashboxShifts, shift])

  // Shift-dependent cash movements (only if cash.close or settings.manage)
  useEffect(() => {
    const shiftIdToTrack = effectiveShift?.id
    if (!shiftIdToTrack || financialReadScope.kind === 'unresolved' || (financialReadScope.kind === 'restricted' && !financialReadScope.cashboxIds.length) || (!can('cash.close') && !can('settings.manage'))) {
      return
    }
    const unsubCash = repository.subscribeCashMovements(
      shiftIdToTrack,
      setCashMovements,
      (err: Error) => {
        console.warn('[NightclubApp] Error al consultar movimientos de caja:', err.message)
      },
      financialReadScope
    )
    return () => {
      unsubCash()
      setCashMovements([])
    }
  }, [repository, effectiveShift?.id, can, financialReadScope])

  // Periodic / Initial fetch for customers & staff
  const reloadStaff = useCallback(async () => {
    if (!can('users.manage')) return
    try {
      const list = await repository.getStaff()
      setStaffState({ key: contextKey, rows: list })
    } catch {
      // Ignored in non-permission scopes
    }
  }, [repository, can, contextKey])

  const reloadCustomers = useCallback(async () => {
    if (!can('customers.read') && !can('settings.manage')) return
    try {
      const list = await repository.getCustomers()
      setCustomersState({ key: contextKey, rows: list })
    } catch {
      // Ignored
    }
  }, [repository, can, contextKey])

  useEffect(() => {
    void reloadStaff()
    void reloadCustomers()
  }, [reloadStaff, reloadCustomers])

  const visibleAccounts = useMemo(() => financialScopeReady ? accounts : [], [financialScopeReady, accounts])
  const visibleCashboxShifts = useMemo(() => financialScopeReady ? cashboxShifts : [], [financialScopeReady, cashboxShifts])
  const visibleCashMovements = useMemo(() => financialScopeReady ? cashMovements : [], [financialScopeReady, cashMovements])
  const visibleCommissions = useMemo(() => financialScopeReady ? commissions : [], [financialScopeReady, commissions])
  const visibleCommissionPayments = useMemo(() => financialScopeReady ? commissionPayments : [], [financialScopeReady, commissionPayments])
  const visibleOperatorContext = financialScopeReady ? operatorContext : null
  const visibleShift = financialScopeReady ? shift : null

  const assembledData: NightclubDataset = useMemo(() => ({
    zones: financialScopeReady ? floor.zones : [],
    tables: financialScopeReady ? floor.tables : [],
    reservations: financialScopeReady ? floor.reservations : [],
    accounts: visibleAccounts,
    products: financialScopeReady ? catalog.products : [],
    inventory: financialScopeReady ? inventorySnap.inventory : [],
    inventoryMovements: financialScopeReady ? inventorySnap.recentMovements : [],
    locations: financialScopeReady ? locations : [],
    cashboxes: authorizedCashboxes,
    inventoryBalances: financialScopeReady ? inventoryBalances : [],
    inventoryLots: financialScopeReady ? inventoryLots : [],
    openBottles: financialScopeReady ? openBottles : [],
    transfers: financialScopeReady ? transfers : [],
    operatorContexts: visibleOperatorContext ? [visibleOperatorContext] : [],
    cashboxShifts: visibleCashboxShifts,
    customers: financialScopeReady ? customers : [],
    shift: effectiveShift,
    shiftHistory: effectiveShift?.status === 'closed' ? [effectiveShift] : (visibleShift?.status === 'closed' ? [visibleShift] : []),
    cashMovements: visibleCashMovements,
    staff: financialScopeReady ? staff : [],
    promoters: financialScopeReady ? promoters : [],
    promoterEvents: financialScopeReady ? promoterEvents : [],
    promoterTicketSales: financialScopeReady ? promoterTicketSales : [],
    promoterLoungeSales: financialScopeReady ? promoterLoungeSales : [],
    promoterConsumptions: financialScopeReady ? promoterConsumptions : [],
    members: financialScopeReady ? members : [],
    courtesies: financialScopeReady ? courtesies : [],
    commissions: visibleCommissions,
    commissionPayments: visibleCommissionPayments,
    customerIncidents: financialScopeReady ? customerIncidents : [],
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
  }), [financialScopeReady, floor, visibleAccounts, catalog, inventorySnap, locations, authorizedCashboxes, inventoryBalances, inventoryLots, openBottles, transfers, visibleOperatorContext, visibleCashboxShifts, customers, effectiveShift, visibleShift, visibleCashMovements, staff, promoters, promoterEvents, promoterTicketSales, promoterLoungeSales, promoterConsumptions, members, courtesies, visibleCommissions, visibleCommissionPayments, customerIncidents, companyName, logoUrl])

  const actions = useMemo(() => createTenantNightclubActions({
    tenantId,
    branchId,
    uid,
    userName,
    role,
    staff,
    shift: effectiveShift,
    cashboxShifts: visibleCashboxShifts,
    reloadStaff,
    reloadCustomers,
    repository,
    gatewayFn: gateway,
  }), [tenantId, branchId, uid, userName, role, staff, effectiveShift, visibleCashboxShifts, reloadStaff, reloadCustomers, repository])

  return {
    data: assembledData,
    incidentResponsibleLabel: userName,
    syncError: cashboxScopeState.key === contextKey ? syncError : null,
    setSyncError,
    activeCashboxId: visibleOperatorContext?.cashboxId || null,
    activeLocationId: visibleOperatorContext?.locationId || null,
    ...actions,
  }
}
