import { useEffect, useRef, useState } from 'react'
import { advanceNightclubRound, cancelNightclubRound, closeNightclubShift, deliverNightclubRound, exchangeNightclubPaidProduct, finishNightclubOccupancy, nightclubProductAvailability, openNightclubAccount, openNightclubBottle, openNightclubShift, recordNightclubCashMovement, recordNightclubInventoryMovement, recordNightclubOpenBottleExit, recordNightclubPayment, reopenNightclubBill, requestNightclubBill, refundNightclubRound, sendNightclubRound, settleNightclubRound } from '../domain/nightclubAccounts'
import type { NightclubBranding, NightclubCashMovement, NightclubCourtesyDraft, NightclubCustomer, NightclubCustomerStatus, NightclubDataset, NightclubInventoryItem, NightclubInventoryMovementType, NightclubMember, NightclubPaymentDraft, NightclubCommissionPaymentDraft, NightclubProduct, NightclubProductExchangeDraft, NightclubRoundDraft, NightclubServiceTarget, NightclubStaff } from '../domain/nightclubAccounts'
import { payNightclubCommissions } from '../domain/nightclubCommissions'
import { cancelNightclubCourtesy, registerNightclubCourtesy, saveNightclubMember } from '../domain/nightclubCourtesies'
import { saveNightclubCustomer } from '../domain/nightclubCustomers'
import { deleteNightclubPromoter, markNightclubLoungeSalePaid, saveNightclubPromoter, saveNightclubPromoterConsumption, saveNightclubPromoterEvent, saveNightclubLoungeSale, saveNightclubTicketSale } from '../domain/nightclubPromoters'
import type { NightclubConsumptionDraft, NightclubPromoter, NightclubPromoterEvent, NightclubLoungeSaleDraft, NightclubSaleDraft } from '../domain/nightclubPromoters'
import { deleteNightclubCustomerIncident, saveNightclubCustomerIncident, setNightclubCustomerStatus } from '../domain/nightclubCustomerIncidents'
import type { NightclubIncidentDraft, NightclubIncidentIdentity } from '../domain/nightclubCustomerIncidents'
import { arriveNightclubReservation, cancelNightclubReservation, deleteNightclubTable, deleteNightclubZone, saveNightclubBranding, saveNightclubReservation, saveNightclubTable, saveNightclubZone } from '../domain/nightclubFloor'
import type { ReservationDraft, TableDraft, ZoneDraft } from '../domain/nightclubFloor'
import { closeNightclubCashboxShift, createNightclubTransfer, dispatchNightclubTransfer, openNightclubCashboxShift, prepareLegacyNightclubLocations, receiveNightclubTransfer, recordNightclubLocationMovement, selectNightclubCashbox } from '../domain/nightclubLocations'
import type { NightclubTransfer } from '../domain/nightclubAccounts'
import { confirmNightclubPhysicalCountThroughGateway, createNightclubPendingRoundThroughGateway, dispatchNightclubTransferThroughGateway, openNightclubAccountThroughGateway, receiveNightclubTransferThroughGateway, receiveNightclubWarehouseIntakeThroughGateway, refundNightclubRoundThroughGateway, requestNightclubTransferThroughGateway, selectNightclubCashboxThroughGateway } from '../data/nightclubGateway'

const hydratePromoters = (saved: NightclubDataset, seed: () => NightclubDataset): NightclubDataset => {
  if (saved.promoters && saved.promoterEvents && saved.promoterTicketSales && saved.promoterLoungeSales && saved.promoterConsumptions) return prepareLegacyNightclubLocations(saved)
  const fallback = seed()
  return prepareLegacyNightclubLocations({ ...saved, promoters: saved.promoters ?? fallback.promoters ?? [], promoterEvents: saved.promoterEvents ?? [], promoterTicketSales: saved.promoterTicketSales ?? [], promoterLoungeSales: saved.promoterLoungeSales ?? [], promoterConsumptions: saved.promoterConsumptions ?? [] })
}

export interface NightclubOperationalCapabilities {
  canRefund?: boolean
  canCreatePendingOrders?: boolean
  canReceiveWarehouseIntake?: boolean
  canManageTransfers?: boolean
  canSelectCashbox?: boolean
  tenantId?: string
  branchId?: string
}

export function useNightclubController(initial: () => NightclubDataset, actor: string, storageKey?: string, datasetMode?: string, resetKey = 0, role = 'admin', incidentIdentity: NightclubIncidentIdentity | null = null, externalData?: NightclubDataset, readOnly = false, capabilities: NightclubOperationalCapabilities = {}) {
  const initialRef = useRef(initial)
  const refundOperations = useRef(new Map<string, string>())
  const pendingRefunds = useRef(new Set<string>())
  const accountOpenOperations = useRef(new Map<string, string>())
  const pendingAccountOpens = useRef(new Set<string>())
  const pendingWarehouseIntakes = useRef(new Set<string>())
  const pendingTransfers = useRef(new Set<string>())
  const pendingPhysicalCounts = useRef(new Set<string>())
  const pendingCashboxSelections = useRef(new Set<string>())
  const initializedFor = useRef({ datasetMode, resetKey })
  const [data, setData] = useState<NightclubDataset>(() => {
    if (!storageKey) return initial()
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) || 'null') as { version: number; mode: string; data: NightclubDataset } | null
      if ((saved?.version === 3 || saved?.version === 4) && saved.mode === datasetMode && Array.isArray(saved.data?.inventoryMovements)) return hydratePromoters(saved.data, initial)
    } catch { /* Corrupt demo data falls back to the fixture. */ }
    return initial()
  })
  const activeContext = (state: NightclubDataset) => state.operatorContexts?.find(context => context.userId === actor)
  const attachCashboxToAccount = (state: NightclubDataset, accountId: string) => {
    const context = activeContext(state)
    if (!context) return state
    return { ...state, accounts: state.accounts.map(account => account.id === accountId ? { ...account, cashboxId: context.cashboxId, locationId: context.locationId, shiftId: context.activeShiftId || account.shiftId, rounds: account.rounds.map(round => round.cashboxId ? round : { ...round, cashboxId: context.cashboxId, locationId: context.locationId }) } : account) }
  }
  useEffect(() => {
    if (initializedFor.current.datasetMode === datasetMode && initializedFor.current.resetKey === resetKey) return
    initializedFor.current = { datasetMode, resetKey }
    const next = initialRef.current()
    setData(next)
    if (storageKey) localStorage.removeItem(storageKey)
  }, [datasetMode, resetKey, storageKey])
  useEffect(() => { if (storageKey) try { localStorage.setItem(storageKey, JSON.stringify({ version: 4, mode: datasetMode, data })) } catch { /* Storage is optional in the demo. */ } }, [data, datasetMode, storageKey])
  useEffect(() => {
    if (!storageKey) return
    const sync = (event: StorageEvent) => {
      if (event.key !== storageKey || !event.newValue) return
      try {
        const saved = JSON.parse(event.newValue) as { version: number; mode: string; data: NightclubDataset }
        if ((saved.version === 3 || saved.version === 4) && saved.mode === datasetMode && Array.isArray(saved.data?.inventoryMovements)) {
          const next = hydratePromoters(saved.data, initialRef.current)
          setData(next)
        }
      } catch { /* Keep the current operation if another tab has invalid data. */ }
    }
    window.addEventListener('storage', sync)
    return () => window.removeEventListener('storage', sync)
  }, [datasetMode, storageKey])
  const apply = (change: (dataset: NightclubDataset) => NightclubDataset) => {
    if (readOnly) throw new Error('Esta operaciÃ³n productiva estÃ¡ en modo de solo lectura.')
    setData(previous => change(previous))
  }
  const visibleData = externalData || data
  return {
    data: visibleData,
    activeCashboxId: activeContext(visibleData)?.cashboxId || visibleData.shift?.cashboxId || (readOnly ? '' : 'cashbox-1'),
    incidentResponsibleLabel: incidentIdentity?.displayName || 'Usuario demo',
    onSaveZone: (draft: ZoneDraft) => apply(state => saveNightclubZone(state, draft, actor)),
    onSaveTable: (draft: TableDraft) => apply(state => saveNightclubTable(state, draft, actor)),
    onDeleteZone: (id: string) => apply(state => deleteNightclubZone(state, id, actor)),
    onDeleteTable: (id: string) => apply(state => deleteNightclubTable(state, id, actor)),
    onSaveReservation: (draft: ReservationDraft) => apply(state => saveNightclubReservation(state, draft, actor)),
    onCancelReservation: (id: string) => apply(state => cancelNightclubReservation(state, id, actor)),
    onArriveReservation: (id: string) => {
      let openedId = ''
      apply(state => {
        const previousIds = new Set(state.accounts.map(account => account.id))
        const next = arriveNightclubReservation(state, id, actor)
        openedId = next.accounts.find(account => !previousIds.has(account.id))?.id || ''
        return attachCashboxToAccount(next, openedId)
      })
      return openedId
    },
    onSaveBranding: (branding: NightclubBranding) => apply(state => saveNightclubBranding(state, branding, actor)),
    onOpenAccount: (target: string | NightclubServiceTarget) => {
      if (capabilities.canCreatePendingOrders) {
        if (!capabilities.tenantId || !capabilities.branchId || typeof target === 'string') throw new Error('La apertura de cuenta productiva requiere un destino válido.')
        const operationKey = JSON.stringify(target)
        if (pendingAccountOpens.current.has(operationKey)) throw new Error('La cuenta ya se está confirmando.')
        const operationId = accountOpenOperations.current.get(operationKey) || crypto.randomUUID()
        accountOpenOperations.current.set(operationKey, operationId)
        pendingAccountOpens.current.add(operationKey)
        return openNightclubAccountThroughGateway({ tenantId: capabilities.tenantId, branchId: capabilities.branchId, operationId, target })
          .then(result => { accountOpenOperations.current.delete(operationKey); return result.accountId })
          .finally(() => pendingAccountOpens.current.delete(operationKey))
      }
      let openedId = ''
      apply(state => {
        const previousIds = new Set(state.accounts.map(account => account.id))
        const next = openNightclubAccount(state, target, actor)
        openedId = next.accounts.find(account => !previousIds.has(account.id))?.id || ''
        return attachCashboxToAccount(next, openedId)
      })
      return openedId
    },    onSettleRound: (accountId: string, items: NightclubRoundDraft[], payment: NightclubPaymentDraft, operationId: string) => { if (!['owner', 'admin', 'cashier', 'waiter', 'service'].includes(role)) throw new Error('No tienes permiso para cobrar pedidos.'); apply(state => attachCashboxToAccount(settleNightclubRound(state, accountId, items, payment, actor, new Date().toISOString(), operationId), accountId)) },
    onSendRound: (accountId: string, items: NightclubRoundDraft[], operationId: string, customerId: string | null = null, serviceStaffId?: string) => {
      if (!['owner', 'admin', 'cashier', 'waiter', 'service'].includes(role)) throw new Error('No tienes permiso para enviar pedidos.')
      if (capabilities.canCreatePendingOrders) {
        if (!capabilities.tenantId || !capabilities.branchId) throw new Error('El pedido productivo no está autorizado.')
        return createNightclubPendingRoundThroughGateway({ tenantId: capabilities.tenantId, branchId: capabilities.branchId, operationId, accountId, items }).then(() => true)
      }
      apply(state => attachCashboxToAccount(sendNightclubRound(state, accountId, items, actor, new Date().toISOString(), operationId, customerId, serviceStaffId), accountId))
      return true
    },
    onRequestBill: (accountId: string) => { if (!['owner', 'admin', 'cashier', 'waiter', 'service'].includes(role)) throw new Error('No tienes permiso para solicitar cobro.'); apply(state => requestNightclubBill(state, accountId, actor)) },
    onReopenBill: (accountId: string) => { if (!['owner', 'admin', 'cashier'].includes(role)) throw new Error('Solo Caja o AdministraciÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â³n pueden reabrir la cuenta.'); apply(state => reopenNightclubBill(state, accountId, actor)) },
    onRecordPayment: (accountId: string, payment: NightclubPaymentDraft) => { if (!['owner', 'admin', 'cashier'].includes(role)) throw new Error('Solo Caja puede registrar pagos.'); apply(state => {
      const next = recordNightclubPayment(state, accountId, payment, actor); const context = activeContext(next)
      if (!context) return next
      return { ...next, accounts: next.accounts.map(account => account.id !== accountId ? account : { ...account, cashboxId: context.cashboxId, locationId: context.locationId, shiftId: context.activeShiftId || account.shiftId, payments: account.payments?.map((entry, index, all) => index === all.length - 1 ? { ...entry, cashboxId: context.cashboxId, locationId: context.locationId } : entry) }) }
    }) },
    onAdvanceRound: (accountId: string, roundId: string) => { if (!['owner', 'admin', 'bar'].includes(role)) throw new Error('Solo Barra puede preparar pedidos.'); apply(state => advanceNightclubRound(state, accountId, roundId, actor)) },
    onDeliverRound: (accountId: string, roundId: string) => { if (!['owner', 'admin', 'waiter', 'service'].includes(role)) throw new Error('Solo Servicio puede entregar pedidos.'); apply(state => deliverNightclubRound(state, accountId, roundId, actor)); if (storageKey) try { localStorage.setItem(storageKey, JSON.stringify({ version: 4, mode: datasetMode, data: externalData || data })) } catch { /* Storage is optional in the demo. */ } },
    onFinishAccount: (accountId: string) => { if (!['owner', 'admin', 'waiter', 'service'].includes(role)) throw new Error('No tienes permiso para cerrar mesas.'); apply(state => finishNightclubOccupancy(state, accountId, actor)) },
    onRefundRound: async (accountId: string, roundId: string, reason: string, returnToStock = false, items?: Array<{ itemId: string; quantity: number; returnToStock: boolean }>) => {
      if (!['owner', 'admin'].includes(role)) throw new Error('Solo Administración puede reembolsar pedidos.')
      if (capabilities.canRefund) {
        if (!capabilities.tenantId || !capabilities.branchId || !items?.length) throw new Error('Selecciona al menos un producto para devolver.')
        const operationKey = JSON.stringify({ accountId, roundId, reason, returnToStock, items })
        if (pendingRefunds.current.has(operationKey)) throw new Error('La devolución ya se está confirmando.')
        const operationId = refundOperations.current.get(operationKey) || crypto.randomUUID()
        refundOperations.current.set(operationKey, operationId)
        pendingRefunds.current.add(operationKey)
        try {
          await refundNightclubRoundThroughGateway({
            tenantId: capabilities.tenantId,
            branchId: capabilities.branchId,
            operationId,
            accountId,
            roundId,
            reason,
            returnToStock,
            items,
          })
          refundOperations.current.delete(operationKey)
        } finally {
          pendingRefunds.current.delete(operationKey)
        }
        return
      }
      if (readOnly) throw new Error('Esta operación productiva todavía no está conectada.')
      const source = externalData || data
      const round = source.accounts.find(account => account.id === accountId)?.rounds.find(value => value.id === roundId)
      const isFullRefund = !!items?.length && !!round && items.length === round.items.length && items.every(item => item.quantity === round.items.find(value => value.id === item.itemId)?.quantity)
      if (returnToStock || items?.length && !isFullRefund) throw new Error('Las devoluciones parciales requieren el gateway Firestore.')
      apply(state => refundNightclubRound(state, accountId, roundId, actor, reason))
    },
    onReceiveWarehouseIntake: async (receipt: { lines: Array<{ inventoryId: string; quantity: number; unit: 'unit' | 'ml' | 'l' | 'g' | 'kg'; unitCost: number }>; supplier?: string; reference?: string; receivedDate?: string; notes?: string }, operationId: string) => {
      if (!capabilities.canReceiveWarehouseIntake || !capabilities.tenantId || !capabilities.branchId) throw new Error('Esta entrada de depósito no está autorizada.')
      if (pendingWarehouseIntakes.current.has(operationId)) throw new Error('La entrada ya se está confirmando.')
      pendingWarehouseIntakes.current.add(operationId)
      try {
        return await receiveNightclubWarehouseIntakeThroughGateway({ tenantId: capabilities.tenantId, branchId: capabilities.branchId, operationId, receipt })
      } finally {
        pendingWarehouseIntakes.current.delete(operationId)
      }
    },
    onConfirmPhysicalCount: async (count: { locationId: string; reason: string; notes?: string; lines: Array<{ inventoryId: string; countedQuantity: number; unit: 'unit' | 'ml' | 'g'; expectedUpdatedAt?: string; unitCost?: number }> }, operationId: string) => {
      if (!capabilities.canManageTransfers || !capabilities.tenantId || !capabilities.branchId) throw new Error('Este conteo físico no está autorizado.')
      if (pendingPhysicalCounts.current.has(operationId)) throw new Error('El conteo ya se está confirmando.')
      pendingPhysicalCounts.current.add(operationId)
      try { return await confirmNightclubPhysicalCountThroughGateway({ tenantId: capabilities.tenantId, branchId: capabilities.branchId, operationId, count }) } finally { pendingPhysicalCounts.current.delete(operationId) }
    },
    onRequestWarehouseTransfer: async (lines: Array<{ inventoryId: string; quantity: number; unit: 'unit' | 'ml' | 'g' }>, operationId: string) => {
      if (!capabilities.canManageTransfers || !capabilities.tenantId || !capabilities.branchId) throw new Error('Esta solicitud de reposición no está autorizada.')
      if (pendingTransfers.current.has(operationId)) throw new Error('La solicitud ya se está confirmando.')
      pendingTransfers.current.add(operationId)
      try { return await requestNightclubTransferThroughGateway({ tenantId: capabilities.tenantId, branchId: capabilities.branchId, operationId, lines }) } finally { pendingTransfers.current.delete(operationId) }
    },
    onDispatchWarehouseTransfer: async (transferId: string, operationId: string) => {
      if (!capabilities.canManageTransfers || !capabilities.tenantId || !capabilities.branchId) throw new Error('Este despacho no está autorizado.')
      if (pendingTransfers.current.has(operationId)) throw new Error('El despacho ya se está confirmando.')
      pendingTransfers.current.add(operationId)
      try { return await dispatchNightclubTransferThroughGateway({ tenantId: capabilities.tenantId, branchId: capabilities.branchId, operationId, transferId }) } finally { pendingTransfers.current.delete(operationId) }
    },
    onReceiveWarehouseTransfer: async (transferId: string, operationId: string) => {
      if (!capabilities.canManageTransfers || !capabilities.tenantId || !capabilities.branchId) throw new Error('Esta recepción no está autorizada.')
      if (pendingTransfers.current.has(operationId)) throw new Error('La recepción ya se está confirmando.')
      pendingTransfers.current.add(operationId)
      try { return await receiveNightclubTransferThroughGateway({ tenantId: capabilities.tenantId, branchId: capabilities.branchId, operationId, transferId }) } finally { pendingTransfers.current.delete(operationId) }
    },
    onExchangePaidProduct: (draft: NightclubProductExchangeDraft) => { if (!['owner', 'admin'].includes(role)) throw new Error('Solo Administraci?n puede autorizar cambios de productos pagados.'); apply(state => exchangeNightclubPaidProduct(state, draft, actor, new Date().toISOString(), role)) },
    onCancelRound: (accountId: string, roundId: string, reason: string) => apply(state => cancelNightclubRound(state, accountId, roundId, actor, reason)),
    onStartShift: (openingFloat: number) => apply(state => openNightclubShift(state, actor, openingFloat)),
    onCloseShift: (countedCash: number) => apply(state => closeNightclubShift(state, actor, countedCash)),
    onSelectCashbox: async (cashboxId: string, confirmPending = false) => {
      if (capabilities.canSelectCashbox) {
        if (!capabilities.tenantId || !capabilities.branchId) throw new Error('La selecci?n de caja no est? autorizada.')
        const operationId = crypto.randomUUID()
        if (pendingCashboxSelections.current.has(operationId)) throw new Error('La caja ya se est? seleccionando.')
        pendingCashboxSelections.current.add(operationId)
        try {
          await selectNightclubCashboxThroughGateway({ tenantId: capabilities.tenantId, branchId: capabilities.branchId, operationId, cashboxId, confirmPending })
        } finally {
          pendingCashboxSelections.current.delete(operationId)
        }
        return
      }
      apply(state => selectNightclubCashbox(state, { userId: actor, cashboxId, actor, confirmPending }))
    },
    onStartCashboxShift: (cashboxId: string, openingFloat: number) => apply(state => openNightclubCashboxShift(state, { userId: actor, cashboxId, actor, openingFloat })),
    onCloseCashboxShift: (cashboxId: string, countedCash: number, expectedCash: number) => apply(state => closeNightclubCashboxShift(state, { userId: actor, cashboxId, actor, countedCash, expectedCash })),
    onRequestInventoryTransfer: (draft: Omit<NightclubTransfer, 'id' | 'status' | 'createdAt'>) => apply(state => ({ ...state, transfers: [...(state.transfers || []), createNightclubTransfer({ ...draft, requestedBy: actor })] })),
    onDispatchInventoryTransfer: (transferId: string) => apply(state => dispatchNightclubTransfer(state, transferId, actor)),
    onReceiveInventoryTransfer: (transferId: string) => apply(state => receiveNightclubTransfer(state, transferId, actor)),
    onCashMovement: (draft: Omit<NightclubCashMovement, 'id' | 'shiftId' | 'at' | 'actor'>) => apply(state => recordNightclubCashMovement(state, draft, actor)),
    onAdjustInventory: (id: string, quantity: number, type: Exclude<NightclubInventoryMovementType, 'sale' | 'reversal'> = 'adjustment', reason = 'Conteo fÃƒÆ’Ã‚Â­sico') => apply(state => { const context = activeContext(state); return context ? recordNightclubLocationMovement(state, { locationId: context.locationId, inventoryId: id, quantity, type, reason, actor }) : recordNightclubInventoryMovement(state, id, quantity, type, reason, actor) }),
    onOpenBottle: (id: string) => apply(state => openNightclubBottle(state, id, actor)),
    onOpenBottleExit: (id: string, millilitres: number, type: 'waste' | 'courtesy' | 'internal_consumption', reason: string) => apply(state => recordNightclubOpenBottleExit(state, id, millilitres, type, reason, actor)),
    onSaveBottleInventory: (draft: { id?: string; name: string; category: string; closedBottles: number; minimum: number; capacityMl: number; cost: number; sellBottle: boolean; bottlePrice: number; sellPour: boolean; pourMl: number; pourPrice: number; bottleCommissionEnabled?: boolean; bottleCommissionType?: 'percentage' | 'fixed'; bottleCommissionValue?: number }) => apply(state => {
      if (!draft.name.trim() || !Number.isFinite(draft.closedBottles) || draft.closedBottles < 0 || !Number.isFinite(draft.capacityMl) || draft.capacityMl <= 0 || !Number.isFinite(draft.cost) || draft.cost < 0) throw new Error('Revisa nombre, stock, contenido y costo.')
      if (!draft.sellBottle && !draft.sellPour && !draft.id) throw new Error('Selecciona una presentaciÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â³n o guarda solo como inventario.')
      if ((draft.sellBottle && (!Number.isFinite(draft.bottlePrice) || draft.bottlePrice <= 0)) || (draft.sellPour && (!Number.isFinite(draft.pourPrice) || draft.pourPrice <= 0))) throw new Error('Ingresa un precio para vender esta presentaciÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â³n.')
      const next = structuredClone(state); const id = draft.id || crypto.randomUUID(); const existing = next.inventory.find(item => item.id === id)
      const item = { id, name: draft.name.trim(), category: draft.category.trim() || 'Licores', unit: 'unit' as const, current: draft.closedBottles, minimum: draft.minimum, unitCost: draft.cost, bottleCapacityMl: draft.capacityMl, openBottleMl: existing?.openBottleMl || 0, linkedProductIds: existing?.linkedProductIds || [] }
      const index = next.inventory.findIndex(entry => entry.id === id); if (index >= 0) next.inventory[index] = item; else next.inventory.push(item)
      const savePresentation = (kind: 'bottle' | 'pour', active: boolean, price: number, millilitres?: number) => {
        const key = `presentation:${id}:${kind}`
        const product = { id: key, name: `${item.name} - ${kind === 'bottle' ? 'Botella' : item.category === 'Refrescos' ? 'Jarra' : 'Vaso'}`, category: item.category || 'Licores', price, preparationArea: 'Barra' as const, stockUnits: 0, inventoryMode: 'recipe' as const, recipe: [], active, bottlePresentation: { inventoryId: id, kind, ...(millilitres ? { millilitres } : {}) }, ...(kind === 'bottle' && draft.bottleCommissionEnabled && (draft.bottleCommissionValue || 0) > 0 ? { commission: { enabled: true, type: draft.bottleCommissionType || 'percentage', value: Number(draft.bottleCommissionValue) } } : {}) }
        const at = next.products.findIndex(entry => entry.id === key); if (at >= 0) next.products[at] = { ...next.products[at], ...product }; else next.products.push(product)
        if (!item.linkedProductIds.includes(key)) item.linkedProductIds.push(key)
      }
      savePresentation('bottle', draft.sellBottle, draft.bottlePrice)
      savePresentation('pour', draft.sellPour, draft.pourPrice, draft.pourMl)
      for (const product of next.products) product.stockUnits = nightclubProductAvailability(product, next.inventory)
      return next
    }),
    onSaveSimpleInventoryProduct: (draft: { name: string; category: string; quantity: number; minimum: number; unit: 'unit' | 'ml' | 'g' | 'l' | 'kg'; cost: number; price: number; presentation: string; sell: boolean }) => apply(state => {
      if (!draft.name.trim() || !Number.isFinite(draft.quantity) || draft.quantity < 0 || !Number.isFinite(draft.cost) || draft.cost < 0 || !Number.isFinite(draft.price) || draft.price < 0) throw new Error('Revisa nombre, cantidad, costo y precio.')
      const next = structuredClone(state); const id = crypto.randomUUID(); const scale = draft.unit === 'kg' || draft.unit === 'l' ? 1000 : 1; const baseUnit = draft.unit === 'kg' ? 'g' : draft.unit === 'l' ? 'ml' : draft.unit; const item = { id, name: draft.name.trim(), category: draft.category, unit: baseUnit, displayUnit: draft.unit, current: draft.quantity * scale, minimum: draft.minimum * scale, unitCost: draft.cost / scale, linkedProductIds: [] as string[] }
      next.inventory.push(item)
      if (draft.sell) { const productId = `presentation:${id}:unit`; next.products.push({ id: productId, name: `${item.name} - ${draft.presentation}`, category: draft.category, price: draft.price, preparationArea: 'Barra', stockUnits: 0, inventoryMode: 'recipe', recipe: [{ inventoryId: id, quantity: 1 }], active: true }); item.linkedProductIds.push(productId) }
      for (const product of next.products) product.stockUnits = nightclubProductAvailability(product, next.inventory)
      return next
    }),
    onSaveInventory: (item: NightclubInventoryItem) => apply(state => {
      if (!item.name.trim() || !Number.isFinite(item.current) || item.current < 0 || !Number.isFinite(item.minimum) || item.minimum < 0) throw new Error('Revisa los datos del insumo.')
      const next = structuredClone(state); const index = next.inventory.findIndex(entry => entry.id === item.id)
      if (index >= 0) next.inventory[index] = item; else next.inventory.push(item)
      for (const product of next.products) product.stockUnits = nightclubProductAvailability(product, next.inventory)
      return next
    }),
    onSaveProduct: (product: NightclubProduct) => apply(state => {
      if (!product.name.trim() || !Number.isFinite(product.price) || product.price < 0) throw new Error('Revisa el nombre y el precio de venta.')
      const next = structuredClone(state)
      const normalized = structuredClone(product)
      if (normalized.inventoryMode === 'unit') {
        const inventoryId = normalized.inventoryId || `inventory-${normalized.id}`
        normalized.inventoryId = inventoryId
        normalized.recipe = [{ inventoryId, quantity: 1 }]
        if (!next.inventory.some(item => item.id === inventoryId)) next.inventory.push({ id: inventoryId, name: normalized.name, unit: 'unit', current: Math.max(0, normalized.stockUnits || 0), minimum: 0 })
      } else if (normalized.inventoryMode === 'recipe' && (!normalized.recipe?.length || normalized.recipe.some(line => !state.inventory.some(item => item.id === line.inventoryId) || !Number.isFinite(line.quantity) || line.quantity <= 0))) throw new Error('Configura una composiciÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â³n vÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¡lida.')
      else if (normalized.inventoryMode === 'none') normalized.recipe = []
      const saved = { ...normalized, stockUnits: nightclubProductAvailability(normalized, next.inventory) }; const index = next.products.findIndex(item => item.id === product.id)
      if (index >= 0) next.products[index] = saved; else next.products.push(saved)
      return next
    }),
    onSavePromoterEvent: (event: Pick<NightclubPromoterEvent, 'id' | 'name' | 'date' | 'status'>) => apply(state => saveNightclubPromoterEvent(state, event, actor, role)),
    onSavePromoter: (promoter: NightclubPromoter) => apply(state => saveNightclubPromoter(state, promoter, actor, role)),
    onDeletePromoter: (id: string) => apply(state => deleteNightclubPromoter(state, id, actor, role)),
    onSavePromoterSale: (sale: NightclubSaleDraft) => apply(state => saveNightclubTicketSale(state, sale, actor, role)),
    onSavePromoterLoungeSale: (sale: NightclubLoungeSaleDraft) => apply(state => saveNightclubLoungeSale(state, sale, actor, role)),
    onMarkPromoterLoungePaid: (id: string) => apply(state => markNightclubLoungeSalePaid(state, id, actor, role)),
    onSavePromoterConsumption: (consumption: NightclubConsumptionDraft) => apply(state => saveNightclubPromoterConsumption(state, consumption, actor, role)),
    onSaveCustomer: (customer: NightclubCustomer) => apply(state => saveNightclubCustomer(state, customer)),
    onSetCustomerStatus: (customerId: string, status: NightclubCustomerStatus) => apply(state => setNightclubCustomerStatus(state, customerId, status, incidentIdentity?.uid || 'demo', role)),
    onSaveCustomerIncident: (incident: NightclubIncidentDraft) => apply(state => saveNightclubCustomerIncident(state, incident, incidentIdentity, role)),
    onDeleteCustomerIncident: (customerId: string, incidentId: string) => apply(state => deleteNightclubCustomerIncident(state, customerId, incidentId, incidentIdentity?.uid || 'demo', role)),
    onAssignCustomer: (accountId: string, customerId: string) => apply(state => { const next = structuredClone(state); const account = next.accounts.find(item => item.id === accountId); if (!account || account.status === 'closed') throw new Error('La cuenta estÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¡ cerrada.'); account.customerId = customerId || undefined; return next }),
    onSaveStaff: (staff: NightclubStaff) => apply(state => { const next = structuredClone(state); const index = (next.staff || []).findIndex(item => item.id === staff.id); next.staff ||= []; if (index >= 0) next.staff[index] = staff; else next.staff.push(staff); return next }),
    onPayCommissions: (draft: NightclubCommissionPaymentDraft) => { if (!['owner', 'admin'].includes(role)) throw new Error('Solo Administracion puede pagar comisiones.'); apply(state => payNightclubCommissions(state, draft, actor)) },
    onSaveMember: (member: NightclubMember) => { if (!['owner', 'admin'].includes(role)) throw new Error('Solo AdministraciÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â³n puede gestionar cupos.'); apply(state => saveNightclubMember(state, member, actor)) },
    onRegisterCourtesy: (draft: NightclubCourtesyDraft) => { if (!['owner', 'admin', 'cashier', 'waiter', 'service'].includes(role)) throw new Error('No tienes permiso para registrar cortesÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â­as.'); apply(state => registerNightclubCourtesy(state, draft, actor)) },
    onCancelCourtesy: (id: string) => { if (!['owner', 'admin'].includes(role)) throw new Error('Solo AdministraciÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â³n puede anular cortesÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â­as.'); apply(state => cancelNightclubCourtesy(state, id, actor)) },
  }
}
