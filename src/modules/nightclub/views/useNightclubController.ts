import { useEffect, useRef, useState } from 'react'
import { advanceNightclubRound, cancelNightclubRound, closeNightclubShift, deliverNightclubRound, exchangeNightclubPaidProduct, finishNightclubOccupancy, nightclubProductAvailability, openNightclubAccount, openNightclubBottle, openNightclubShift, recordNightclubCashMovement, recordNightclubInventoryMovement, recordNightclubOpenBottleExit, recordNightclubPayment, reopenNightclubBill, requestNightclubBill, refundNightclubRound, sendNightclubRound, settleNightclubRound } from '../domain/nightclubAccounts'
import type { NightclubBranding, NightclubCashMovement, NightclubCourtesyDraft, NightclubCustomer, NightclubDataset, NightclubInventoryItem, NightclubInventoryMovementType, NightclubMember, NightclubPaymentDraft, NightclubProduct, NightclubProductExchangeDraft, NightclubRoundDraft, NightclubServiceTarget, NightclubStaff } from '../domain/nightclubAccounts'
import { cancelNightclubCourtesy, registerNightclubCourtesy, saveNightclubMember } from '../domain/nightclubCourtesies'
import { arriveNightclubReservation, cancelNightclubReservation, deleteNightclubTable, deleteNightclubZone, saveNightclubBranding, saveNightclubReservation, saveNightclubTable, saveNightclubZone } from '../domain/nightclubFloor'
import type { ReservationDraft, TableDraft, ZoneDraft } from '../domain/nightclubFloor'

export function useNightclubController(initial: () => NightclubDataset, actor: string, storageKey?: string, datasetMode?: string, resetKey = 0, role = 'admin') {
  const initialRef = useRef(initial)
  const initializedFor = useRef({ datasetMode, resetKey })
  const [data, setData] = useState<NightclubDataset>(() => {
    if (!storageKey) return initial()
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) || 'null') as { version: number; mode: string; data: NightclubDataset } | null
      if (saved?.version === 3 && saved.mode === datasetMode && Array.isArray(saved.data?.inventoryMovements)) return saved.data
    } catch { /* Corrupt demo data falls back to the fixture. */ }
    return initial()
  })
  const current = useRef(data)
  useEffect(() => {
    if (initializedFor.current.datasetMode === datasetMode && initializedFor.current.resetKey === resetKey) return
    initializedFor.current = { datasetMode, resetKey }
    const next = initialRef.current()
    current.current = next
    setData(next)
    if (storageKey) localStorage.removeItem(storageKey)
  }, [datasetMode, resetKey, storageKey])
  useEffect(() => { if (storageKey) try { localStorage.setItem(storageKey, JSON.stringify({ version: 3, mode: datasetMode, data })) } catch { /* Storage is optional in the demo. */ } }, [data, datasetMode, storageKey])
  useEffect(() => {
    if (!storageKey) return
    const sync = (event: StorageEvent) => {
      if (event.key !== storageKey || !event.newValue) return
      try {
        const saved = JSON.parse(event.newValue) as { version: number; mode: string; data: NightclubDataset }
        if (saved.version === 3 && saved.mode === datasetMode && Array.isArray(saved.data?.inventoryMovements)) {
          current.current = saved.data
          setData(saved.data)
        }
      } catch { /* Keep the current operation if another tab has invalid data. */ }
    }
    window.addEventListener('storage', sync)
    return () => window.removeEventListener('storage', sync)
  }, [datasetMode, storageKey])
  const apply = (change: (dataset: NightclubDataset) => NightclubDataset) => { const next = change(current.current); current.current = next; setData(next) }
  return {
    data,
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
        return next
      })
      return openedId
    },
    onSaveBranding: (branding: NightclubBranding) => apply(state => saveNightclubBranding(state, branding, actor)),
    onOpenAccount: (target: string | NightclubServiceTarget) => {
      let openedId = ''
      apply(state => {
        const previousIds = new Set(state.accounts.map(account => account.id))
        const next = openNightclubAccount(state, target, actor)
        openedId = next.accounts.find(account => !previousIds.has(account.id))?.id || ''
        return next
      })
      return openedId
    },
    onSettleRound: (accountId: string, items: NightclubRoundDraft[], payment: NightclubPaymentDraft, operationId: string) => { if (!['owner', 'admin', 'cashier', 'waiter', 'service'].includes(role)) throw new Error('No tienes permiso para cobrar pedidos.'); apply(state => settleNightclubRound(state, accountId, items, payment, actor, new Date().toISOString(), operationId)) },
    onSendRound: (accountId: string, items: NightclubRoundDraft[], operationId: string) => { if (!['owner', 'admin', 'cashier', 'waiter', 'service'].includes(role)) throw new Error('No tienes permiso para enviar pedidos.'); apply(state => sendNightclubRound(state, accountId, items, actor, new Date().toISOString(), operationId)) },
    onRequestBill: (accountId: string) => { if (!['owner', 'admin', 'cashier', 'waiter', 'service'].includes(role)) throw new Error('No tienes permiso para solicitar cobro.'); apply(state => requestNightclubBill(state, accountId, actor)) },
    onReopenBill: (accountId: string) => { if (!['owner', 'admin', 'cashier'].includes(role)) throw new Error('Solo Caja o Administración pueden reabrir la cuenta.'); apply(state => reopenNightclubBill(state, accountId, actor)) },
    onRecordPayment: (accountId: string, payment: NightclubPaymentDraft) => { if (!['owner', 'admin', 'cashier'].includes(role)) throw new Error('Solo Caja puede registrar pagos.'); apply(state => recordNightclubPayment(state, accountId, payment, actor)) },
    onAdvanceRound: (accountId: string, roundId: string) => { if (!['owner', 'admin', 'bar'].includes(role)) throw new Error('Solo Barra puede preparar pedidos.'); apply(state => advanceNightclubRound(state, accountId, roundId, actor)) },
    onDeliverRound: (accountId: string, roundId: string) => { if (!['owner', 'admin', 'waiter', 'service'].includes(role)) throw new Error('Solo Servicio puede entregar pedidos.'); apply(state => deliverNightclubRound(state, accountId, roundId, actor)); if (storageKey) try { localStorage.setItem(storageKey, JSON.stringify({ version: 3, mode: datasetMode, data: current.current })) } catch { /* Storage is optional in the demo. */ } },
    onFinishAccount: (accountId: string) => { if (!['owner', 'admin', 'waiter', 'service'].includes(role)) throw new Error('No tienes permiso para cerrar mesas.'); apply(state => finishNightclubOccupancy(state, accountId, actor)) },
    onRefundRound: (accountId: string, roundId: string, reason: string) => { if (!['owner', 'admin'].includes(role)) throw new Error('Solo Administración puede reembolsar pedidos.'); apply(state => refundNightclubRound(state, accountId, roundId, actor, reason)) },
    onExchangePaidProduct: (draft: NightclubProductExchangeDraft) => { if (!['owner', 'admin'].includes(role)) throw new Error('Solo Administraci?n puede autorizar cambios de productos pagados.'); apply(state => exchangeNightclubPaidProduct(state, draft, actor, new Date().toISOString(), role)) },
    onCancelRound: (accountId: string, roundId: string, reason: string) => apply(state => cancelNightclubRound(state, accountId, roundId, actor, reason)),
    onStartShift: (openingFloat: number) => apply(state => openNightclubShift(state, actor, openingFloat)),
    onCloseShift: (countedCash: number) => apply(state => closeNightclubShift(state, actor, countedCash)),
    onCashMovement: (draft: Omit<NightclubCashMovement, 'id' | 'shiftId' | 'at' | 'actor'>) => apply(state => recordNightclubCashMovement(state, draft, actor)),
    onAdjustInventory: (id: string, quantity: number, type: Exclude<NightclubInventoryMovementType, 'sale' | 'reversal'> = 'adjustment', reason = 'Conteo físico') => apply(state => recordNightclubInventoryMovement(state, id, quantity, type, reason, actor)),
    onOpenBottle: (id: string) => apply(state => openNightclubBottle(state, id, actor)),
    onOpenBottleExit: (id: string, millilitres: number, type: 'waste' | 'courtesy' | 'internal_consumption', reason: string) => apply(state => recordNightclubOpenBottleExit(state, id, millilitres, type, reason, actor)),
    onSaveBottleInventory: (draft: { id?: string; name: string; category: string; closedBottles: number; minimum: number; capacityMl: number; cost: number; sellBottle: boolean; bottlePrice: number; sellPour: boolean; pourMl: number; pourPrice: number }) => apply(state => {
      if (!draft.name.trim() || !Number.isFinite(draft.closedBottles) || draft.closedBottles < 0 || !Number.isFinite(draft.capacityMl) || draft.capacityMl <= 0 || !Number.isFinite(draft.cost) || draft.cost < 0) throw new Error('Revisa nombre, stock, contenido y costo.')
      if (!draft.sellBottle && !draft.sellPour && !draft.id) throw new Error('Selecciona una presentación o guarda solo como inventario.')
      if ((draft.sellBottle && (!Number.isFinite(draft.bottlePrice) || draft.bottlePrice <= 0)) || (draft.sellPour && (!Number.isFinite(draft.pourPrice) || draft.pourPrice <= 0))) throw new Error('Ingresa un precio para vender esta presentación.')
      const next = structuredClone(state); const id = draft.id || crypto.randomUUID(); const existing = next.inventory.find(item => item.id === id)
      const item = { id, name: draft.name.trim(), category: draft.category.trim() || 'Licores', unit: 'unit' as const, current: draft.closedBottles, minimum: draft.minimum, unitCost: draft.cost, bottleCapacityMl: draft.capacityMl, openBottleMl: existing?.openBottleMl || 0, linkedProductIds: existing?.linkedProductIds || [] }
      const index = next.inventory.findIndex(entry => entry.id === id); if (index >= 0) next.inventory[index] = item; else next.inventory.push(item)
      const savePresentation = (kind: 'bottle' | 'pour', active: boolean, price: number, millilitres?: number) => {
        const key = `presentation:${id}:${kind}`
        const product = { id: key, name: `${item.name} - ${kind === 'bottle' ? 'Botella' : item.category === 'Refrescos' ? 'Jarra' : 'Vaso'}`, category: item.category || 'Licores', price, preparationArea: 'Barra' as const, stockUnits: 0, inventoryMode: 'recipe' as const, recipe: [], active, bottlePresentation: { inventoryId: id, kind, ...(millilitres ? { millilitres } : {}) } }
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
      } else if (normalized.inventoryMode === 'recipe' && (!normalized.recipe?.length || normalized.recipe.some(line => !state.inventory.some(item => item.id === line.inventoryId) || !Number.isFinite(line.quantity) || line.quantity <= 0))) throw new Error('Configura una composición válida.')
      else if (normalized.inventoryMode === 'none') normalized.recipe = []
      const saved = { ...normalized, stockUnits: nightclubProductAvailability(normalized, next.inventory) }; const index = next.products.findIndex(item => item.id === product.id)
      if (index >= 0) next.products[index] = saved; else next.products.push(saved)
      return next
    }),
    onSaveCustomer: (customer: NightclubCustomer) => apply(state => { const next = structuredClone(state); const index = next.customers.findIndex(item => item.id === customer.id); if (index >= 0) next.customers[index] = customer; else next.customers.push(customer); return next }),
    onAssignCustomer: (accountId: string, customerId: string) => apply(state => { const next = structuredClone(state); const account = next.accounts.find(item => item.id === accountId); if (!account || account.status === 'closed') throw new Error('La cuenta está cerrada.'); account.customerId = customerId || undefined; return next }),
    onSaveStaff: (staff: NightclubStaff) => apply(state => { const next = structuredClone(state); const index = (next.staff || []).findIndex(item => item.id === staff.id); next.staff ||= []; if (index >= 0) next.staff[index] = staff; else next.staff.push(staff); return next }),
    onSaveMember: (member: NightclubMember) => { if (!['owner', 'admin'].includes(role)) throw new Error('Solo Administración puede gestionar cupos.'); apply(state => saveNightclubMember(state, member, actor)) },
    onRegisterCourtesy: (draft: NightclubCourtesyDraft) => { if (!['owner', 'admin', 'cashier', 'waiter', 'service'].includes(role)) throw new Error('No tienes permiso para registrar cortesías.'); apply(state => registerNightclubCourtesy(state, draft, actor)) },
    onCancelCourtesy: (id: string) => { if (!['owner', 'admin'].includes(role)) throw new Error('Solo Administración puede anular cortesías.'); apply(state => cancelNightclubCourtesy(state, id, actor)) },
  }
}
