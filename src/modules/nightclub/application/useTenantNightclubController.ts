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

interface UseTenantNightclubControllerProps {
  tenantId: string
  branchId?: string
  uid: string
  userName: string
  role: string
  companyName: string
  logoUrl?: string
}

export function useTenantNightclubController({
  tenantId,
  branchId = 'main',
  uid,
  userName,
  role,
  companyName,
  logoUrl,
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

  // Subscriptions
  useEffect(() => {
    const unsubFloor = repository.subscribeFloor(setFloor)
    const unsubAccounts = repository.subscribeOperationalAccounts(setAccounts)
    const unsubShift = repository.subscribeActiveShift(setShift)
    const unsubCatalog = repository.subscribeCatalog(setCatalog)
    const unsubInv = repository.subscribeInventory(setInventorySnap)
    const unsubPromoters = repository.subscribePromoters ? repository.subscribePromoters(setPromoters) : () => {}
    const unsubEvents = repository.subscribePromoterEvents ? repository.subscribePromoterEvents(setPromoterEvents) : () => {}
    const unsubSales = repository.subscribePromoterTicketSales ? repository.subscribePromoterTicketSales(setPromoterTicketSales) : () => {}
    const unsubLounges = repository.subscribePromoterLoungeSales ? repository.subscribePromoterLoungeSales(setPromoterLoungeSales) : () => {}
    const unsubConsumptions = repository.subscribePromoterConsumptions ? repository.subscribePromoterConsumptions(setPromoterConsumptions) : () => {}
    const unsubMembers = repository.subscribeMembers ? repository.subscribeMembers(setMembers) : () => {}
    const unsubCourtesies = repository.subscribeCourtesies ? repository.subscribeCourtesies(setCourtesies) : () => {}
    const unsubCommissions = repository.subscribeCommissions ? repository.subscribeCommissions(setCommissions) : () => {}
    const unsubCommissionPayments = repository.subscribeCommissionPayments ? repository.subscribeCommissionPayments(setCommissionPayments) : () => {}
    const isAdmin = ['owner', 'admin'].includes(role)
    const unsubIncidents = (isAdmin && repository.subscribeCustomerIncidents)
      ? repository.subscribeCustomerIncidents(setCustomerIncidents)
      : () => {}

    return () => {
      unsubFloor()
      unsubAccounts()
      unsubShift()
      unsubCatalog()
      unsubInv()
      unsubPromoters()
      unsubEvents()
      unsubSales()
      unsubLounges()
      unsubConsumptions()
      unsubMembers()
      unsubCourtesies()
      unsubCommissions()
      unsubCommissionPayments()
      unsubIncidents()
    }
  }, [repository, role])

  // Shift-dependent cash movements
  useEffect(() => {
    if (!shift?.id) {
      setCashMovements([])
      return
    }
    const unsubCash = repository.subscribeCashMovements(shift.id, setCashMovements)
    return () => {
      unsubCash()
    }
  }, [repository, shift?.id])

  // Periodic / Initial fetch for customers & staff
  const reloadStaff = useCallback(async () => {
    try {
      const list = await repository.getStaff()
      setStaff(list)
    } catch {
      // Ignored in non-permission scopes
    }
  }, [repository])

  const reloadCustomers = useCallback(async () => {
    try {
      const list = await repository.getCustomers()
      setCustomers(list)
    } catch {
      // Ignored
    }
  }, [repository])

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
    ...actions,
  }
}
