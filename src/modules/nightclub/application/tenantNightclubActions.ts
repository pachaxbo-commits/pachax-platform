import type {
  NightclubCustomer,
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
  }
  gatewayFn: (name: 'tenantGateway' | 'platformGateway', payload: Record<string, unknown>) => Promise<any>
}

export function createTenantNightclubActions(deps: TenantNightclubActionsDeps) {
  const {
    tenantId,
    uid,
    staff,
    shift,
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

    onRefundRound: async (accountId: string, roundId: string, reason: string): Promise<boolean> => {
      const operationId = crypto.randomUUID()
      await repository.refundRound({ operationId, accountId, roundId, reason })
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

    onCashMovement: async () => {
      throw new Error('Función no conectada en producción.')
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

    onOpenBottle: async () => {
      throw new Error('Función no conectada en producción.')
    },
    onOpenBottleExit: async () => {
      throw new Error('Función no conectada en producción.')
    },
    onSaveBottleInventory: async () => {
      throw new Error('Función no conectada en producción.')
    },
    onSaveSimpleInventoryProduct: async () => {
      throw new Error('Función no conectada en producción.')
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

    onSetCustomerStatus: async () => {
      throw new Error('Función no conectada en producción.')
    },
    onSaveCustomerIncident: async () => {
      throw new Error('Función no conectada en producción.')
    },
    onDeleteCustomerIncident: async () => {
      throw new Error('Función no conectada en producción.')
    },
    onAssignCustomer: async () => {
      throw new Error('Función no conectada en producción.')
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
    onPayCommissions: async () => {
      throw new Error('Función no conectada en producción.')
    },
    onSaveMember: async () => {
      throw new Error('Función no conectada en producción.')
    },
    onRegisterCourtesy: async () => {
      throw new Error('Función no conectada en producción.')
    },
    onCancelCourtesy: async () => {
      throw new Error('Función no conectada en producción.')
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
  }
}
