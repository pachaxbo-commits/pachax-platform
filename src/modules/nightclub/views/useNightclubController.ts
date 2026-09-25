import { useEffect, useRef, useState } from 'react'
import { addNightclubRound, adjustNightclubInventory, advanceNightclubRound, closeNightclubAccount, closeNightclubShift, nightclubProductAvailability, openNightclubAccount, openNightclubShift, recordNightclubCashMovement, reopenNightclubBill, requestNightclubBill } from '../domain/nightclubAccounts'
import type { NightclubCashMovement, NightclubCustomer, NightclubDataset, NightclubInventoryItem, NightclubPaymentDraft, NightclubProduct, NightclubRoundDraft, NightclubStaff } from '../domain/nightclubAccounts'

export function useNightclubController(initial: () => NightclubDataset, actor: string, storageKey?: string, datasetMode?: string) {
  const [data, setData] = useState<NightclubDataset>(() => {
    if (!storageKey) return initial()
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) || 'null') as { version: number; mode: string; data: NightclubDataset } | null
      if (saved?.version === 2 && saved.mode === datasetMode && Array.isArray(saved.data?.inventoryMovements)) return saved.data
    } catch { /* Corrupt demo data falls back to the fixture. */ }
    return initial()
  })
  const current = useRef(data)
  useEffect(() => { if (storageKey) try { localStorage.setItem(storageKey, JSON.stringify({ version: 2, mode: datasetMode, data })) } catch { /* Storage is optional in the demo. */ } }, [data, datasetMode, storageKey])
  useEffect(() => {
    if (!storageKey) return
    const sync = (event: StorageEvent) => {
      if (event.key !== storageKey || !event.newValue) return
      try {
        const saved = JSON.parse(event.newValue) as { version: number; mode: string; data: NightclubDataset }
        if (saved.version === 2 && saved.mode === datasetMode && Array.isArray(saved.data?.inventoryMovements)) {
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
    onOpenAccount: (tableId: string) => apply(state => openNightclubAccount(state, tableId, actor)),
    onAddRound: (accountId: string, items: NightclubRoundDraft[]) => apply(state => addNightclubRound(state, accountId, items, actor)),
    onAdvanceRound: (accountId: string, roundId: string) => apply(state => advanceNightclubRound(state, accountId, roundId, actor)),
    onRequestBill: (accountId: string) => apply(state => requestNightclubBill(state, accountId, actor)),
    onReopenBill: (accountId: string) => apply(state => reopenNightclubBill(state, accountId, actor)),
    onCloseAccount: (accountId: string, draft: NightclubPaymentDraft) => apply(state => closeNightclubAccount(state, accountId, draft, actor)),
    onStartShift: (openingFloat: number) => apply(state => openNightclubShift(state, actor, openingFloat)),
    onCloseShift: (countedCash: number) => apply(state => closeNightclubShift(state, actor, countedCash)),
    onCashMovement: (draft: Omit<NightclubCashMovement, 'id' | 'shiftId' | 'at' | 'actor'>) => apply(state => recordNightclubCashMovement(state, draft, actor)),
    onAdjustInventory: (id: string, stock: number) => apply(state => adjustNightclubInventory(state, id, stock, actor)),
    onSaveInventory: (item: NightclubInventoryItem) => apply(state => {
      if (!item.name.trim() || !Number.isFinite(item.current) || item.current < 0 || !Number.isFinite(item.minimum) || item.minimum < 0) throw new Error('Revisa los datos del insumo.')
      const next = structuredClone(state); const index = next.inventory.findIndex(entry => entry.id === item.id)
      if (index >= 0) next.inventory[index] = item; else next.inventory.push(item)
      for (const product of next.products) product.stockUnits = nightclubProductAvailability(product, next.inventory)
      return next
    }),
    onSaveProduct: (product: NightclubProduct) => apply(state => {
      if (!product.name.trim() || !Number.isFinite(product.price) || product.price < 0 || !product.recipe?.length || product.recipe.some(line => !state.inventory.some(item => item.id === line.inventoryId) || !Number.isFinite(line.quantity) || line.quantity <= 0)) throw new Error('Configura una receta válida para vender el producto.')
      const next = structuredClone(state); const saved = { ...product, stockUnits: nightclubProductAvailability(product, next.inventory) }; const index = next.products.findIndex(item => item.id === product.id)
      if (index >= 0) next.products[index] = saved; else next.products.push(saved)
      return next
    }),
    onSaveCustomer: (customer: NightclubCustomer) => apply(state => { const next = structuredClone(state); const index = next.customers.findIndex(item => item.id === customer.id); if (index >= 0) next.customers[index] = customer; else next.customers.push(customer); return next }),
    onAssignCustomer: (accountId: string, customerId: string) => apply(state => { const next = structuredClone(state); const account = next.accounts.find(item => item.id === accountId); if (!account || account.status === 'closed') throw new Error('La cuenta está cerrada.'); account.customerId = customerId || undefined; return next }),
    onSaveStaff: (staff: NightclubStaff) => apply(state => { const next = structuredClone(state); const index = (next.staff || []).findIndex(item => item.id === staff.id); next.staff ||= []; if (index >= 0) next.staff[index] = staff; else next.staff.push(staff); return next }),
  }
}
