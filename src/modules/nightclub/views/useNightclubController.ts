import { useEffect, useRef, useState } from 'react'
import { addNightclubRound, advanceNightclubRound, cancelNightclubRound, closeNightclubShift, nightclubProductAvailability, openNightclubAccount, openNightclubShift, recordNightclubCashMovement, recordNightclubInventoryMovement, recordNightclubPayment, reopenNightclubBill, requestNightclubBill } from '../domain/nightclubAccounts'
import type { NightclubCashMovement, NightclubCustomer, NightclubDataset, NightclubInventoryItem, NightclubInventoryMovementType, NightclubPaymentDraft, NightclubProduct, NightclubRoundDraft, NightclubServiceTarget, NightclubStaff } from '../domain/nightclubAccounts'
import { saveNightclubTable, saveNightclubZone } from '../domain/nightclubFloor'
import type { TableDraft, ZoneDraft } from '../domain/nightclubFloor'

export function useNightclubController(initial: () => NightclubDataset, actor: string, storageKey?: string, datasetMode?: string, resetKey = 0) {
  const initialRef = useRef(initial)
  const hasMounted = useRef(false)
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
    if (!hasMounted.current) {
      hasMounted.current = true
      return
    }
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
    onOpenAccount: (target: string | NightclubServiceTarget) => apply(state => openNightclubAccount(state, target, actor)),
    onAddRound: (accountId: string, items: NightclubRoundDraft[]) => apply(state => addNightclubRound(state, accountId, items, actor)),
    onAdvanceRound: (accountId: string, roundId: string) => apply(state => advanceNightclubRound(state, accountId, roundId, actor)),
    onCancelRound: (accountId: string, roundId: string, reason: string) => apply(state => cancelNightclubRound(state, accountId, roundId, actor, reason)),
    onRequestBill: (accountId: string) => apply(state => requestNightclubBill(state, accountId, actor)),
    onReopenBill: (accountId: string) => apply(state => reopenNightclubBill(state, accountId, actor)),
    onCloseAccount: (accountId: string, draft: NightclubPaymentDraft) => apply(state => recordNightclubPayment(state, accountId, draft, actor)),
    onStartShift: (openingFloat: number) => apply(state => openNightclubShift(state, actor, openingFloat)),
    onCloseShift: (countedCash: number) => apply(state => closeNightclubShift(state, actor, countedCash)),
    onCashMovement: (draft: Omit<NightclubCashMovement, 'id' | 'shiftId' | 'at' | 'actor'>) => apply(state => recordNightclubCashMovement(state, draft, actor)),
    onAdjustInventory: (id: string, quantity: number, type: Exclude<NightclubInventoryMovementType, 'sale' | 'reversal'> = 'adjustment', reason = 'Conteo físico') => apply(state => recordNightclubInventoryMovement(state, id, quantity, type, reason, actor)),
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
  }
}
