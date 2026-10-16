import { useCallback, useEffect, useMemo, useState } from 'react'
import type {
  NightclubAccount,
  NightclubCashMovement,
  NightclubCustomer,
  NightclubDataset,
  NightclubInventoryItem,
  NightclubInventoryMovementType,
  NightclubPaymentDraft,
  NightclubProduct,
  NightclubRoundDraft,
  NightclubServiceTarget,
  NightclubShift,
  NightclubStaff,
} from '../domain/nightclubAccounts'
import type { TableDraft, ZoneDraft } from '../domain/nightclubFloor'
import type { NightclubUserRole } from '../domain/nightclubUsers'
import { TenantNightclubRepository } from '../data/tenantNightclubRepository'
import type {
  NightclubCatalogSnapshot,
  NightclubFloorSnapshot,
  NightclubInventorySnapshot,
} from '../data/nightclubRepository'
import { gateway } from '../../../services/gateway'

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
  role: _role,
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

  // Subscriptions
  useEffect(() => {
    const unsubFloor = repository.subscribeFloor(setFloor)
    const unsubAccounts = repository.subscribeOpenAccounts(setAccounts)
    const unsubShift = repository.subscribeActiveShift(setShift)
    const unsubCatalog = repository.subscribeCatalog(setCatalog)
    const unsubInv = repository.subscribeInventory(setInventorySnap)

    return () => {
      unsubFloor()
      unsubAccounts()
      unsubShift()
      unsubCatalog()
      unsubInv()
    }
  }, [repository])

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
    cashMovements,
    staff,
    promoters: [],
    promoterEvents: [],
    promoterTicketSales: [],
    promoterLoungeSales: [],
    promoterConsumptions: [],
    members: [],
    courtesies: [],
    commissions: [],
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
  }), [floor, accounts, catalog, inventorySnap, customers, shift, cashMovements, staff, companyName, logoUrl])

  return {
    data: assembledData,
    incidentResponsibleLabel: userName,

    onSaveZone: (draft: ZoneDraft) => {
      const operationId = crypto.randomUUID()
      void repository.saveZone({ operationId, zone: draft })
    },
    onSaveTable: (draft: TableDraft) => {
      const operationId = crypto.randomUUID()
      void repository.saveTable({ operationId, table: draft })
    },
    onDeleteZone: (id: string) => {
      const operationId = crypto.randomUUID()
      void repository.deleteZone({ operationId, id })
    },
    onDeleteTable: (id: string) => {
      const operationId = crypto.randomUUID()
      void repository.deleteTable({ operationId, id })
    },
    onSaveReservation: () => {},
    onCancelReservation: () => {},
    onArriveReservation: () => '',
    onSaveBranding: () => {},

    onOpenAccount: (target: string | NightclubServiceTarget) => {
      const operationId = crypto.randomUUID()
      const normalizedTarget: NightclubServiceTarget =
        typeof target === 'string'
          ? target.startsWith('table:')
            ? { type: 'table', tableId: target.slice(6) }
            : { type: 'bar', displayName: target }
          : target
      void repository.openAccount({ operationId, target: normalizedTarget })
      return `account_${operationId}`
    },

    onSendRound: (
      accountId: string,
      items: NightclubRoundDraft[],
      operationId: string = crypto.randomUUID(),
      customerId: string | null = null,
      serviceStaffId?: string
    ) => {
      void repository.addRound({
        operationId,
        accountId,
        items,
        customerId,
        serviceStaffId,
      })
    },

    onSettleRound: (
      accountId: string,
      items: NightclubRoundDraft[],
      payment: NightclubPaymentDraft,
      operationId: string = crypto.randomUUID()
    ) => {
      void repository.settleRound({
        operationId,
        accountId,
        items,
        payment,
      })
    },

    onRequestBill: (accountId: string) => {
      const operationId = crypto.randomUUID()
      void repository.requestBill({ operationId, accountId })
    },

    onReopenBill: (accountId: string) => {
      const operationId = crypto.randomUUID()
      void repository.reopenBill({ operationId, accountId })
    },

    onRecordPayment: (accountId: string, payment: NightclubPaymentDraft) => {
      const operationId = crypto.randomUUID()
      const cashAmount = payment.method === 'cash' ? payment.amount : payment.method === 'mixed' ? payment.cashAmount : 0
      const qrAmount = payment.method === 'qr' ? payment.amount : payment.method === 'mixed' ? payment.qrAmount : 0
      const cardAmount = payment.method === 'card' ? payment.amount : payment.method === 'mixed' ? payment.cardAmount : 0
      void repository.recordPayment({
        operationId,
        accountId,
        amount: payment.amount ?? 0,
        method: payment.method,
        cashAmount,
        qrAmount,
        cardAmount,
        received: payment.received,
      })
      return true
    },

    onAdvanceRound: (accountId: string, roundId: string) => {
      const operationId = crypto.randomUUID()
      void repository.advanceRound({ operationId, accountId, roundId })
    },

    onDeliverRound: (accountId: string, roundId: string) => {
      const operationId = crypto.randomUUID()
      void repository.deliverRound({ operationId, accountId, roundId })
    },

    onFinishAccount: (accountId: string) => {
      const operationId = crypto.randomUUID()
      void repository.finishOccupancy({ operationId, accountId })
    },

    onRefundRound: (accountId: string, roundId: string, reason: string) => {
      const operationId = crypto.randomUUID()
      void repository.refundRound({ operationId, accountId, roundId, reason })
    },

    onExchangePaidProduct: () => {},

    onCancelRound: (_accountId: string, roundId: string, reason: string) => {
      const operationId = crypto.randomUUID()
      void repository.cancelRound({ operationId, roundId, reason })
    },

    onStartShift: (openingFloat: number) => {
      const operationId = crypto.randomUUID()
      void repository.openShift({ operationId, openingFloat })
    },

    onCloseShift: (countedCash: number) => {
      if (!shift?.id) return
      const operationId = crypto.randomUUID()
      void repository.closeShift({ operationId, shiftId: shift.id, countedCash })
    },

    onCashMovement: () => {},

    onAdjustInventory: (
      inventoryId: string,
      quantity: number,
      type: Exclude<NightclubInventoryMovementType, 'sale' | 'reversal'> = 'adjustment',
      reason = 'Conteo físico'
    ) => {
      const operationId = crypto.randomUUID()
      void repository.recordInventoryMovement({
        operationId,
        inventoryId,
        quantity,
        type,
        reason,
      })
    },

    onOpenBottle: () => {},
    onOpenBottleExit: () => {},
    onSaveBottleInventory: () => {},
    onSaveSimpleInventoryProduct: () => {},

    onSaveInventory: (item: NightclubInventoryItem) => {
      const operationId = crypto.randomUUID()
      void repository.saveInventory({ operationId, item })
    },

    onSaveProduct: (product: NightclubProduct) => {
      const operationId = crypto.randomUUID()
      void repository.saveProduct({ operationId, product })
    },

    onSaveCustomer: (customer: NightclubCustomer) => {
      const operationId = crypto.randomUUID()
      void repository.saveCustomer({ operationId, customer })
      void reloadCustomers()
    },

    onSetCustomerStatus: () => {},
    onSaveCustomerIncident: () => {},
    onDeleteCustomerIncident: () => {},
    onAssignCustomer: () => {},

    // Tenant Staff Management (Connected directly via tenantGateway)
    onSaveStaff: (user: NightclubStaff) => {
      const existing = staff.some(item => item.id === user.id)
      if (existing && user.id === uid) throw new Error('No puedes modificar tu propio acceso.')
      if (existing) {
        void gateway('tenantGateway', {
          action: 'updateMember',
          tenantId,
          uid: user.id,
          displayName: user.name,
          roleId: user.role,
          active: user.active,
          nightclubPermissions: user.permissions,
        }).then(reloadStaff)
      } else {
        void gateway('tenantGateway', {
          action: 'createMember',
          tenantId,
          operationId: user.id,
          displayName: user.name,
          email: user.email,
          roleId: user.role,
          nightclubPermissions: user.permissions,
        }).then(reloadStaff)
      }
    },

    onDeleteStaff: (id: string) => {
      if (id === uid) throw new Error('No puedes retirar tu propio acceso.')
      void gateway('tenantGateway', {
        action: 'deleteMember',
        tenantId,
        uid: id,
      }).then(reloadStaff)
    },

    onSaveUserRolePreset: (roleId: NightclubUserRole, permissions: string[]) => {
      void gateway('tenantGateway', {
        action: 'saveNightclubRolePreset',
        tenantId,
        roleId,
        nightclubPermissions: permissions,
      }).then(reloadStaff)
    },

    onSaveCustomRole: () => {},
    onDeleteCustomRole: () => {},
    onPayCommissions: () => {},
    onSaveMember: () => {},
    onRegisterCourtesy: () => {},
    onCancelCourtesy: () => {},
    onSavePromoterEvent: () => {},
    onSavePromoter: () => {},
    onDeletePromoter: () => {},
    onSavePromoterSale: () => {},
    onSavePromoterLoungeSale: () => {},
    onMarkPromoterLoungePaid: () => {},
    onSavePromoterConsumption: () => {},
  }
}
