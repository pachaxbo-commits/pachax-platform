import type {
  NightclubCustomer,
  NightclubCustomerStatus,
  NightclubInventoryItem,
  NightclubInventoryMovementType,
  NightclubPaymentDraft,
  NightclubProduct,
  NightclubRoundDraft,
  NightclubServiceTarget,
  NightclubShift,
  NightclubStaff,
} from '../domain/nightclubAccounts.ts'
import type { TableDraft, ZoneDraft, ReservationDraft } from '../domain/nightclubFloor.ts'
import type { NightclubUserRole } from '../domain/nightclubUsers.ts'
import type {
  NightclubConsumptionDraft,
  NightclubLoungeSaleDraft,
  NightclubPromoter,
  NightclubPromoterEvent,
  NightclubSaleDraft,
} from '../domain/nightclubPromoters.ts'

export interface TenantNightclubActionsDeps {
  tenantId: string
  branchId?: string
  uid: string
  userName: string
  role: string
  staff: NightclubStaff[]
  shift?: NightclubShift | null
  reloadStaff: () => Promise<void>
  reloadCustomers: () => Promise<void>
  repository: {
    saveZone: (payload: any) => Promise<any>
    saveTable: (payload: any) => Promise<any>
    deleteZone: (payload: any) => Promise<any>
    deleteTable: (payload: any) => Promise<any>
    openAccount: (payload: any) => Promise<{ accountId: string }>
    addRound: (payload: any) => Promise<any>
    settleRound: (payload: any) => Promise<any>
    requestBill: (payload: any) => Promise<any>
    reopenBill: (payload: any) => Promise<any>
    recordPayment: (payload: any) => Promise<any>
    advanceRound: (payload: any) => Promise<any>
    deliverRound: (payload: any) => Promise<any>
    finishOccupancy: (payload: any) => Promise<any>
    refundRound: (payload: any) => Promise<any>
    cancelRound: (payload: any) => Promise<any>
    openShift: (payload: any) => Promise<any>
    closeShift: (payload: any) => Promise<any>
    recordInventoryMovement: (payload: any) => Promise<any>
    saveInventory: (payload: any) => Promise<any>
    saveProduct: (payload: any) => Promise<any>
    saveCustomer: (payload: any) => Promise<any>
    getRoundById?: (roundId: string) => Promise<any>
    saveReservation?: (payload: any) => Promise<any>
    cancelReservation?: (payload: any) => Promise<any>
    arriveReservation?: (payload: any) => Promise<any>
    savePromoter?: (payload: any) => Promise<any>
    deletePromoter?: (payload: any) => Promise<any>
    savePromoterEvent?: (payload: any) => Promise<any>
    saveTicketSale?: (payload: any) => Promise<any>
    saveLoungeSale?: (payload: any) => Promise<any>
    markLoungePaid?: (payload: any) => Promise<any>
    savePromoterConsumption?: (payload: any) => Promise<any>
    recordCashMovement?: (payload: any) => Promise<any>
    saveBottleInventory?: (payload: any) => Promise<any>
    openBottle?: (payload: any) => Promise<any>
    bottleExit?: (payload: any) => Promise<any>
    saveMember?: (payload: any) => Promise<any>
    registerCourtesy?: (payload: any) => Promise<any>
    cancelCourtesy?: (payload: any) => Promise<any>
    payCommissions?: (payload: any) => Promise<any>
    setCustomerStatus?: (payload: any) => Promise<any>
    saveCustomerIncident?: (payload: any) => Promise<any>
    deleteCustomerIncident?: (payload: any) => Promise<any>
    assignCustomer?: (payload: any) => Promise<any>
    selectCashbox?: (payload: any) => Promise<any>
    initializeNightclubInfrastructure?: (payload: { operationId: string }) => Promise<{ status: string; warehouseId: string; cashboxId: string }>
    createNightclubCashbox?: (payload: { operationId: string; name: string }) => Promise<{ status: string; cashboxId: string; locationId: string; name: string }>
    openCashboxShift?: (payload: any) => Promise<any>
    closeCashboxShift?: (payload: any) => Promise<any>
    receiveWarehouseIntake?: (payload: any) => Promise<any>
    confirmPhysicalCount?: (payload: any) => Promise<any>
    requestTransfer?: (payload: any) => Promise<any>
    dispatchTransfer?: (payload: any) => Promise<any>
    receiveTransfer?: (payload: any) => Promise<any>
  }
  cashboxShifts?: NightclubShift[]
  gatewayFn: (name: 'tenantGateway' | 'platformGateway', payload: Record<string, unknown>) => Promise<any>
}

export function createTenantNightclubActions(deps: TenantNightclubActionsDeps) {
  const {
    tenantId,
    uid,
    staff,
    shift,
    cashboxShifts,
    reloadStaff,
    reloadCustomers,
    repository,
    gatewayFn,
  } = deps

  return {
    onSaveZone: async (draft: ZoneDraft): Promise<boolean> => {
      const operationId = crypto.randomUUID()
      await repository.saveZone({ operationId, zone: draft })
      return true
    },
    onSaveTable: async (draft: TableDraft): Promise<boolean> => {
      const operationId = crypto.randomUUID()
      await repository.saveTable({ operationId, table: draft })
      return true
    },
    onDeleteZone: async (id: string): Promise<boolean> => {
      const operationId = crypto.randomUUID()
      await repository.deleteZone({ operationId, id })
      return true
    },
    onDeleteTable: async (id: string): Promise<boolean> => {
      const operationId = crypto.randomUUID()
      await repository.deleteTable({ operationId, id })
      return true
    },

    onSaveReservation: async (draft: ReservationDraft): Promise<boolean> => {
      const operationId = crypto.randomUUID()
      if (!repository.saveReservation) throw new Error('saveReservation no disponible en el repositorio.')
      await repository.saveReservation({ operationId, reservation: draft })
      return true
    },
    onCancelReservation: async (id: string): Promise<boolean> => {
      const operationId = crypto.randomUUID()
      if (!repository.cancelReservation) throw new Error('cancelReservation no disponible en el repositorio.')
      await repository.cancelReservation({ operationId, id })
      return true
    },
    onArriveReservation: async (id: string): Promise<string> => {
      const operationId = crypto.randomUUID()
      if (!repository.arriveReservation) throw new Error('arriveReservation no disponible en el repositorio.')
      const res = await repository.arriveReservation({ operationId, id })
      return res.accountId
    },
    onSaveBranding: async () => {
      throw new Error('Función no conectada en producción.')
    },

    onOpenAccount: async (target: string | NightclubServiceTarget): Promise<string> => {
      const operationId = crypto.randomUUID()
      const normalizedTarget: NightclubServiceTarget =
        typeof target === 'string'
          ? target.startsWith('table:')
            ? { type: 'table', tableId: target.slice(6) }
            : { type: 'bar', displayName: target }
          : target
      const result = await repository.openAccount({ operationId, target: normalizedTarget })
      return result.accountId
    },

    onSendRound: async (
      accountId: string,
      items: NightclubRoundDraft[],
      operationId: string = crypto.randomUUID(),
      customerId: string | null = null,
      serviceStaffId?: string
    ): Promise<any> => {
      const res = await repository.addRound({
        operationId,
        accountId,
        items,
        customerId,
        serviceStaffId,
      })
      return res || true
    },

    onSettleRound: async (
      accountId: string,
      items: NightclubRoundDraft[],
      payment: NightclubPaymentDraft,
      operationId: string = crypto.randomUUID()
    ): Promise<any> => {
      const res = await repository.settleRound({
        operationId,
        accountId,
        items,
        payment,
      })
      return res || true
    },

    onGetRound: async (roundId: string) => {
      if (repository.getRoundById) {
        return repository.getRoundById(roundId)
      }
      return null
    },

    onRequestBill: async (accountId: string): Promise<boolean> => {
      const operationId = crypto.randomUUID()
      await repository.requestBill({ operationId, accountId })
      return true
    },

    onReopenBill: async (accountId: string): Promise<boolean> => {
      const operationId = crypto.randomUUID()
      await repository.reopenBill({ operationId, accountId })
      return true
    },

    onRecordPayment: async (accountId: string, payment: NightclubPaymentDraft): Promise<boolean> => {
      const operationId = crypto.randomUUID()
      const cashAmount = payment.method === 'cash' ? payment.amount : payment.method === 'mixed' ? payment.cashAmount : 0
      const qrAmount = payment.method === 'qr' ? payment.amount : payment.method === 'mixed' ? payment.qrAmount : 0
      const cardAmount = payment.method === 'card' ? payment.amount : payment.method === 'mixed' ? payment.cardAmount : 0
      await repository.recordPayment({
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

    onAdvanceRound: async (accountId: string, roundId: string): Promise<boolean> => {
      const operationId = crypto.randomUUID()
      await repository.advanceRound({ operationId, accountId, roundId })
      return true
    },

    onDeliverRound: async (accountId: string, roundId: string): Promise<boolean> => {
      const operationId = crypto.randomUUID()
      await repository.deliverRound({ operationId, accountId, roundId })
      return true
    },

    onFinishAccount: async (accountId: string): Promise<boolean> => {
      const operationId = crypto.randomUUID()
      await repository.finishOccupancy({ operationId, accountId })
      return true
    },

    onRefundRound: async (
      accountId: string,
      roundId: string,
      reason: string,
      returnToStock?: boolean,
      items?: Array<{ itemId: string; quantity: number; returnToStock: boolean }>
    ): Promise<boolean> => {
      const operationId = crypto.randomUUID()
      await repository.refundRound({ operationId, accountId, roundId, reason, returnToStock, items })
      return true
    },

    onExchangePaidProduct: async () => {
      throw new Error('Función no conectada en producción.')
    },

    onCancelRound: async (_accountId: string, roundId: string, reason: string): Promise<boolean> => {
      const operationId = crypto.randomUUID()
      await repository.cancelRound({ operationId, roundId, reason })
      return true
    },

    onStartShift: async (openingFloat: number): Promise<boolean> => {
      const operationId = crypto.randomUUID()
      await repository.openShift({ operationId, openingFloat })
      return true
    },

    onCloseShift: async (countedCash: number): Promise<boolean> => {
      if (!shift?.id) throw new Error('No hay turno para cerrar.')
      const operationId = crypto.randomUUID()
      await repository.closeShift({ operationId, shiftId: shift.id, countedCash })
      return true
    },

    onCashMovement: async (draft: {
      type: 'income' | 'expense'
      method: 'cash' | 'qr' | 'card'
      amount: number
      description: string
      category?: string
      notes?: string
    }): Promise<boolean> => {
      const operationId = crypto.randomUUID()
      if (!repository.recordCashMovement) throw new Error('recordCashMovement no disponible en el repositorio.')
      await repository.recordCashMovement({
        operationId,
        type: draft.type,
        method: draft.method,
        amount: draft.amount,
        description: draft.description,
        category: draft.category,
        notes: draft.notes,
      })
      return true
    },

    onAdjustInventory: async (
      inventoryId: string,
      quantity: number,
      type: Exclude<NightclubInventoryMovementType, 'sale' | 'reversal'> = 'adjustment',
      reason = 'Conteo físico'
    ): Promise<boolean> => {
      const operationId = crypto.randomUUID()
      await repository.recordInventoryMovement({
        operationId,
        inventoryId,
        quantity,
        type,
        reason,
      })
      return true
    },

    onOpenBottle: async (inventoryId: string): Promise<boolean> => {
      const operationId = crypto.randomUUID()
      if (!repository.openBottle) throw new Error('openBottle no disponible en el repositorio.')
      await repository.openBottle({ operationId, inventoryId })
      return true
    },
    onOpenBottleExit: async (inventoryId: string, millilitres: number, exitType: 'waste' | 'courtesy' | 'internal_consumption', reason: string): Promise<boolean> => {
      const operationId = crypto.randomUUID()
      if (!repository.bottleExit) throw new Error('bottleExit no disponible en el repositorio.')
      await repository.bottleExit({ operationId, inventoryId, millilitres, exitType, reason })
      return true
    },
    onSaveBottleInventory: async (draft: any): Promise<boolean> => {
      const operationId = crypto.randomUUID()
      if (!repository.saveBottleInventory) throw new Error('saveBottleInventory no disponible en el repositorio.')
      await repository.saveBottleInventory({ operationId, draft })
      return true
    },
    onSaveSimpleInventoryProduct: async (draft: {
      name: string
      category: string
      quantity: number
      minimum?: number
      unit: string
      cost?: number
      price?: number
      presentation?: string
      sell?: boolean
    }): Promise<boolean> => {
      const inventoryId = `inv_${crypto.randomUUID().slice(0, 8)}`
      const operationId = crypto.randomUUID()
      await repository.saveInventory({
        operationId,
        item: {
          id: inventoryId,
          name: draft.name,
          category: draft.category,
          current: draft.quantity,
          minimum: draft.minimum || 0,
          unit: draft.unit || 'unit',
          cost: draft.cost || 0,
        },
      })
      if (draft.sell && Number(draft.price) > 0) {
        const prodOpId = crypto.randomUUID()
        await repository.saveProduct({
          operationId: prodOpId,
          product: {
            id: `prod_${crypto.randomUUID().slice(0, 8)}`,
            name: `${draft.name} - ${draft.presentation || 'Unidad'}`,
            category: draft.category,
            price: Number(draft.price),
            active: true,
            recipe: [{ inventoryId, quantity: 1 }],
          },
        })
      }
      return true
    },

    onSaveInventory: async (item: NightclubInventoryItem): Promise<boolean> => {
      const operationId = crypto.randomUUID()
      await repository.saveInventory({ operationId, item })
      return true
    },

    onSaveProduct: async (product: NightclubProduct): Promise<boolean> => {
      const operationId = crypto.randomUUID()
      await repository.saveProduct({ operationId, product })
      return true
    },

    onSaveCustomer: async (customer: NightclubCustomer): Promise<boolean> => {
      const operationId = crypto.randomUUID()
      await repository.saveCustomer({ operationId, customer })
      await reloadCustomers()
      return true
    },

    onSetCustomerStatus: async (customerId: string, status: NightclubCustomerStatus): Promise<boolean> => {
      const operationId = crypto.randomUUID()
      if (!repository.setCustomerStatus) throw new Error('setCustomerStatus no disponible en el repositorio.')
      await repository.setCustomerStatus({ operationId, customerId, status })
      await reloadCustomers()
      return true
    },
    onSaveCustomerIncident: async (incident: any): Promise<boolean> => {
      const operationId = crypto.randomUUID()
      if (!repository.saveCustomerIncident) throw new Error('saveCustomerIncident no disponible en el repositorio.')
      await repository.saveCustomerIncident({ operationId, incident })
      return true
    },
    onDeleteCustomerIncident: async (_customerId: string, incidentId: string): Promise<boolean> => {
      const operationId = crypto.randomUUID()
      if (!repository.deleteCustomerIncident) throw new Error('deleteCustomerIncident no disponible en el repositorio.')
      await repository.deleteCustomerIncident({ operationId, incidentId })
      return true
    },
    onAssignCustomer: async (accountId: string, customerId: string | null): Promise<boolean> => {
      const operationId = crypto.randomUUID()
      if (!repository.assignCustomer) throw new Error('assignCustomer no disponible en el repositorio.')
      await repository.assignCustomer({ operationId, accountId, customerId: customerId || null })
      return true
    },

    // Tenant Staff Management (Connected directly via tenantGateway)
    onSaveStaff: async (user: NightclubStaff, initialPassword?: string): Promise<boolean> => {
      const existing = staff.some(item => item.id === user.id)
      if (existing && user.id === uid) throw new Error('No puedes modificar tu propio acceso.')
      if (existing) {
        await gatewayFn('tenantGateway', {
          action: 'updateMember',
          tenantId,
          uid: user.id,
          displayName: user.name,
          roleId: user.role,
          active: user.active,
          nightclubPermissions: user.permissions,
          ...(user.cashboxIds !== undefined ? { cashboxIds: user.cashboxIds } : {}),
        })
        await reloadStaff()
        return true
      } else {
        if (!user.email || typeof initialPassword !== 'string' || initialPassword.length < 8 || initialPassword.length > 72) {
          throw new Error('Correo y contraseña inicial de al menos 8 caracteres son obligatorios.')
        }
        await gatewayFn('tenantGateway', {
          action: 'createMember',
          tenantId,
          operationId: crypto.randomUUID(),
          displayName: user.name,
          email: user.email,
          password: initialPassword,
          roleId: user.role,
          nightclubPermissions: user.permissions,
          ...(Array.isArray(user.cashboxIds) ? { cashboxIds: user.cashboxIds } : {}),
        })
        await reloadStaff()
        return true
      }
    },

    onDeleteStaff: async (id: string): Promise<boolean> => {
      if (id === uid) throw new Error('No puedes retirar tu propio acceso.')
      await gatewayFn('tenantGateway', {
        action: 'deleteMember',
        tenantId,
        uid: id,
      })
      await reloadStaff()
      return true
    },

    onSaveUserRolePreset: async (roleId: NightclubUserRole, permissions: string[]): Promise<boolean> => {
      await gatewayFn('tenantGateway', {
        action: 'saveNightclubRolePreset',
        tenantId,
        roleId,
        nightclubPermissions: permissions,
      })
      await reloadStaff()
      return true
    },

    onSaveCustomRole: async () => {
      throw new Error('Función no conectada en producción.')
    },
    onDeleteCustomRole: async () => {
      throw new Error('Función no conectada en producción.')
    },
    onPayCommissions: async (draft: any): Promise<boolean> => {
      const operationId = crypto.randomUUID()
      if (!repository.payCommissions) throw new Error('payCommissions no disponible en el repositorio.')
      await repository.payCommissions({ operationId, draft })
      return true
    },
    onSaveMember: async (member: any): Promise<boolean> => {
      const operationId = crypto.randomUUID()
      if (!repository.saveMember) throw new Error('saveMember no disponible en el repositorio.')
      await repository.saveMember({ operationId, member })
      return true
    },
    onRegisterCourtesy: async (draft: any): Promise<boolean> => {
      const operationId = crypto.randomUUID()
      if (!repository.registerCourtesy) throw new Error('registerCourtesy no disponible en el repositorio.')
      await repository.registerCourtesy({ operationId, draft })
      return true
    },
    onCancelCourtesy: async (courtesyId: string): Promise<boolean> => {
      const operationId = crypto.randomUUID()
      if (!repository.cancelCourtesy) throw new Error('cancelCourtesy no disponible en el repositorio.')
      await repository.cancelCourtesy({ operationId, courtesyId })
      return true
    },
    onSavePromoterEvent: async (event: Pick<NightclubPromoterEvent, 'id' | 'name' | 'date' | 'status'>): Promise<boolean> => {
      const operationId = crypto.randomUUID()
      if (!repository.savePromoterEvent) throw new Error('savePromoterEvent no disponible en el repositorio.')
      await repository.savePromoterEvent({ operationId, event })
      return true
    },
    onSavePromoter: async (promoter: NightclubPromoter): Promise<boolean> => {
      const operationId = crypto.randomUUID()
      if (!repository.savePromoter) throw new Error('savePromoter no disponible en el repositorio.')
      await repository.savePromoter({ operationId, promoter })
      return true
    },
    onDeletePromoter: async (id: string): Promise<boolean> => {
      const operationId = crypto.randomUUID()
      if (!repository.deletePromoter) throw new Error('deletePromoter no disponible en el repositorio.')
      await repository.deletePromoter({ operationId, id })
      return true
    },
    onSavePromoterSale: async (sale: NightclubSaleDraft): Promise<boolean> => {
      const operationId = sale.operationId || crypto.randomUUID()
      if (!repository.saveTicketSale) throw new Error('saveTicketSale no disponible en el repositorio.')
      await repository.saveTicketSale({ operationId, sale })
      return true
    },
    onSavePromoterLoungeSale: async (sale: NightclubLoungeSaleDraft): Promise<boolean> => {
      const operationId = sale.operationId || crypto.randomUUID()
      if (!repository.saveLoungeSale) throw new Error('saveLoungeSale no disponible en el repositorio.')
      await repository.saveLoungeSale({ operationId, sale })
      return true
    },
    onMarkPromoterLoungePaid: async (saleId: string): Promise<boolean> => {
      const operationId = crypto.randomUUID()
      if (!repository.markLoungePaid) throw new Error('markLoungePaid no disponible en el repositorio.')
      await repository.markLoungePaid({ operationId, saleId })
      return true
    },
    onSavePromoterConsumption: async (consumption: NightclubConsumptionDraft): Promise<boolean> => {
      const operationId = crypto.randomUUID()
      if (!repository.savePromoterConsumption) throw new Error('savePromoterConsumption no disponible en el repositorio.')
      await repository.savePromoterConsumption({ operationId, consumption })
      return true
    },
    onSelectCashbox: async (cashboxId: string, confirmPending?: boolean): Promise<boolean> => {
      const operationId = crypto.randomUUID()
      if (!repository.selectCashbox) throw new Error('selectCashbox no disponible en el repositorio.')
      await repository.selectCashbox({ operationId, cashboxId, confirmPending })
      return true
    },
    onInitializeNightclubInfrastructure: async (operationId: string): Promise<{ status: string }> => {
      if (!repository.initializeNightclubInfrastructure) throw new Error('Inicialización de infraestructura no disponible en el repositorio.')
      return repository.initializeNightclubInfrastructure({ operationId })
    },
    onCreateNightclubCashbox: async (name: string, operationId: string): Promise<{ cashboxId: string; locationId: string }> => {
      if (!repository.createNightclubCashbox) throw new Error('Creación de cajas no disponible en el repositorio.')
      return repository.createNightclubCashbox({ operationId, name })
    },
    onStartCashboxShift: async (cashboxId: string, openingFloat: number): Promise<boolean> => {
      const operationId = crypto.randomUUID()
      if (!repository.openCashboxShift) throw new Error('openCashboxShift no disponible en el repositorio.')
      await repository.openCashboxShift({ operationId, cashboxId, openingFloat })
      return true
    },
    onCloseCashboxShift: async (cashboxId: string, countedCash: number): Promise<boolean> => {
      const operationId = crypto.randomUUID()
      if (!repository.closeCashboxShift) throw new Error('closeCashboxShift no disponible en el repositorio.')
      const activeShift = cashboxShifts?.find(s => s.cashboxId === cashboxId && s.status === 'open') || shift
      if (!activeShift?.id) throw new Error('No hay turno abierto para esta caja.')
      await repository.closeCashboxShift({ operationId, cashboxId, shiftId: activeShift.id, countedCash })
      return true
    },
    onReceiveWarehouseIntake: async (receipt: unknown, opId?: string): Promise<unknown> => {
      const operationId = opId || crypto.randomUUID()
      if (!repository.receiveWarehouseIntake) throw new Error('receiveWarehouseIntake no disponible en el repositorio.')
      return await repository.receiveWarehouseIntake({ operationId, receipt: receipt as any })
    },
    onConfirmPhysicalCount: async (count: unknown, opId?: string): Promise<unknown> => {
      const operationId = opId || crypto.randomUUID()
      if (!repository.confirmPhysicalCount) throw new Error('confirmPhysicalCount no disponible en el repositorio.')
      return await repository.confirmPhysicalCount({ operationId, count: count as any })
    },
    onRequestInventoryTransfer: async (lines: unknown[], opId?: string): Promise<unknown> => {
      const operationId = opId || crypto.randomUUID()
      if (!repository.requestTransfer) throw new Error('requestTransfer no disponible en el repositorio.')
      return await repository.requestTransfer({ operationId, transfer: { lines } })
    },
    onDispatchInventoryTransfer: async (transferId: string, opId?: string): Promise<boolean> => {
      const operationId = opId || crypto.randomUUID()
      if (!repository.dispatchTransfer) throw new Error('dispatchTransfer no disponible en el repositorio.')
      await repository.dispatchTransfer({ operationId, transferId })
      return true
    },
    onReceiveInventoryTransfer: async (transferId: string, opId?: string): Promise<boolean> => {
      const operationId = opId || crypto.randomUUID()
      if (!repository.receiveTransfer) throw new Error('receiveTransfer no disponible en el repositorio.')
      await repository.receiveTransfer({ operationId, transferId })
      return true
    },
  }
}
