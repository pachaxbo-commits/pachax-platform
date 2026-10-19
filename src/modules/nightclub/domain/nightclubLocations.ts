import type {
  NightclubCashbox,
  NightclubDataset,
  NightclubInventoryMovement,
  NightclubOperatorContext,
  NightclubShift,
  NightclubTransfer,
  NightclubTransferLine,
} from './nightclubAccounts'

export const WAREHOUSE_LOCATION_ID = 'warehouse-general'
export const NIGHTCLUB_CASHBOX_IDS = ['cashbox-1', 'cashbox-2', 'cashbox-3', 'cashbox-4'] as const

type BaseUnit = 'unit' | 'ml' | 'g'
const clone = <T>(value: T): T => structuredClone(value)
const id = () => crypto.randomUUID()
const round = (value: number) => Math.round((value + Number.EPSILON) * 1000) / 1000
const inventoryUnit = (dataset: NightclubDataset, inventoryId: string): BaseUnit => {
  const unit = dataset.inventory.find(item => item.id === inventoryId)?.unit
  return unit === 'l' ? 'ml' : unit === 'kg' ? 'g' : unit || 'unit'
}
const requireLocation = (dataset: NightclubDataset, locationId: string) => {
  const location = dataset.locations?.find(item => item.id === locationId && item.active)
  if (!location) throw new Error('La ubicaci�n seleccionada no est� disponible.')
  return location
}
const balanceKey = (locationId: string, inventoryId: string) => `${locationId}:${inventoryId}`
const getBalance = (dataset: NightclubDataset, locationId: string, inventoryId: string) => {
  dataset.inventoryBalances ||= []
  let balance = dataset.inventoryBalances.find(item => item.id === balanceKey(locationId, inventoryId))
  if (!balance) {
    balance = { id: balanceKey(locationId, inventoryId), locationId, inventoryId, availableQuantity: 0, reservedQuantity: 0, inTransitQuantity: 0, minimumQuantity: 0, unit: inventoryUnit(dataset, inventoryId), updatedAt: new Date().toISOString() }
    dataset.inventoryBalances.push(balance)
  }
  return balance
}
const assertPositive = (value: number, message: string) => {
  if (!Number.isFinite(value) || value <= 0) throw new Error(message)
}

export function createDefaultNightclubLocations(branchId: string, now = new Date().toISOString()) {
  const warehouse = { id: WAREHOUSE_LOCATION_ID, branchId, type: 'warehouse' as const, name: 'Almac�n general', active: true, createdAt: now, updatedAt: now }
  const cashboxes: NightclubCashbox[] = NIGHTCLUB_CASHBOX_IDS.map((cashboxId, index) => ({ id: cashboxId, branchId, locationId: cashboxId, name: `Caja ${index + 1}`, active: true, createdAt: now, updatedAt: now }))
  const locations = [warehouse, ...cashboxes.map(cashbox => ({ id: cashbox.locationId, branchId, type: 'cashbox' as const, name: cashbox.name, linkedCashboxId: cashbox.id, active: true, createdAt: now, updatedAt: now }))]
  return { locations, cashboxes }
}

/** Local, non destructive compatibility migration. Server migrations are explicit admin commands. */
export function prepareLegacyNightclubLocations(dataset: NightclubDataset, branchId = 'main', now = new Date().toISOString()): NightclubDataset {
  const next = clone(dataset)
  const defaults = createDefaultNightclubLocations(branchId, now)
  next.locations = next.locations?.length ? next.locations : defaults.locations
  next.cashboxes = next.cashboxes?.length ? next.cashboxes : defaults.cashboxes
  next.cashboxShifts ||= next.shift ? [{ ...next.shift, cashboxId: next.shift.cashboxId || 'cashbox-1', locationId: next.shift.locationId || 'cashbox-1' }] : []
  next.operatorContexts ||= []
  next.openBottles ||= []
  next.transfers ||= []
  if (!next.inventoryBalances?.length) {
    next.inventoryBalances = next.inventory.map(item => ({ id: balanceKey(WAREHOUSE_LOCATION_ID, item.id), locationId: WAREHOUSE_LOCATION_ID, inventoryId: item.id, availableQuantity: item.current, reservedQuantity: 0, inTransitQuantity: 0, minimumQuantity: item.minimum, unit: inventoryUnit(next, item.id), updatedAt: now }))
  }
  if (!next.inventoryLots?.length) {
    next.inventoryLots = next.inventory.filter(item => item.current > 0).map(item => ({ id: `migration-lot:${item.id}`, inventoryId: item.id, locationId: WAREHOUSE_LOCATION_ID, receivedQuantity: item.current, remainingQuantity: item.current, unitCost: item.unitCost || 0, receivedAt: now, sourceType: 'migration' as const, sourceReferenceId: 'legacy-inventory', status: 'available' as const }))
  }
  next.inventoryMovements = (next.inventoryMovements || []).map(movement => movement.locationId ? movement : { ...movement, locationId: 'unknown' as const })
  return next
}

export function selectNightclubCashbox(dataset: NightclubDataset, input: { userId: string; cashboxId: string; actor: string; confirmPending?: boolean; at?: string }): NightclubDataset {
  const next = prepareLegacyNightclubLocations(dataset, 'main', input.at)
  const cashbox = next.cashboxes!.find(item => item.id === input.cashboxId && item.active)
  if (!cashbox) throw new Error('La caja seleccionada no est� disponible.')
  const previous = next.operatorContexts!.find(item => item.userId === input.userId)
  const pending = previous?.activeShiftId && previous.cashboxId !== cashbox.id && next.cashboxShifts!.some(shift => shift.id === previous.activeShiftId && shift.status === 'open')
  if (pending && !input.confirmPending) throw new Error('Tienes un turno abierto en otra caja. Confirma el cambio de caja o cierra ese turno.')
  const at = input.at || new Date().toISOString()
  const context: NightclubOperatorContext = { id: previous?.id || `operator:${input.userId}`, userId: input.userId, branchId: cashbox.branchId, cashboxId: cashbox.id, locationId: cashbox.locationId, activeShiftId: next.cashboxShifts!.find(shift => shift.cashboxId === cashbox.id && shift.status === 'open')?.id, selectedAt: at, selectedBy: input.actor, ...(previous?.cashboxId && previous.cashboxId !== cashbox.id ? { changedFromCashboxId: previous.cashboxId } : {}) }
  next.operatorContexts = [...next.operatorContexts!.filter(item => item.userId !== input.userId), context]
  return next
}

export function openNightclubCashboxShift(dataset: NightclubDataset, input: { userId: string; cashboxId: string; actor: string; openingFloat: number; at?: string }): NightclubDataset {
  assertPositive(input.openingFloat + Number.EPSILON, 'Ingresa un fondo inicial v�lido.')
  const next = selectNightclubCashbox(dataset, { ...input, confirmPending: true })
  if (next.cashboxShifts!.some(shift => shift.cashboxId === input.cashboxId && shift.status === 'open')) throw new Error('Esta caja ya tiene un turno abierto.')
  const cashbox = next.cashboxes!.find(item => item.id === input.cashboxId)!
  const at = input.at || new Date().toISOString()
  const shift: NightclubShift = { id: id(), status: 'open', openedAt: at, openingFloat: round(input.openingFloat), openedBy: input.actor, cashboxId: cashbox.id, locationId: cashbox.locationId }
  next.cashboxShifts = [...next.cashboxShifts!, shift]
  next.operatorContexts = next.operatorContexts!.map(context => context.userId === input.userId ? { ...context, activeShiftId: shift.id, selectedAt: at } : context)
  return next
}

export function closeNightclubCashboxShift(dataset: NightclubDataset, input: { userId: string; cashboxId: string; actor: string; countedCash: number; expectedCash: number; at?: string }): NightclubDataset {
  if (!Number.isFinite(input.countedCash) || input.countedCash < 0) throw new Error('Ingresa el efectivo contado v�lido.')
  const next = prepareLegacyNightclubLocations(dataset, 'main', input.at)
  const shift = next.cashboxShifts!.find(item => item.cashboxId === input.cashboxId && item.status === 'open')
  if (!shift) throw new Error('No existe un turno abierto para esta caja.')
  const at = input.at || new Date().toISOString()
  const difference = round(input.countedCash - input.expectedCash)
  next.cashboxShifts = next.cashboxShifts!.map(item => item.id === shift.id ? { ...item, status: 'closed', closedAt: at, closedBy: input.actor, countedCash: round(input.countedCash), expectedCash: round(input.expectedCash), difference, reconciliationStatus: difference === 0 ? 'balanced' : 'surplus' } : item)
  next.operatorContexts = next.operatorContexts!.map(context => context.userId === input.userId && context.activeShiftId === shift.id ? { ...context, activeShiftId: undefined, selectedAt: at } : context)
  return next
}

export function assertTransferDraft(sourceLocationId: string, destinationLocationId: string, lines: NightclubTransferLine[]) {
  if (!sourceLocationId || !destinationLocationId || sourceLocationId === destinationLocationId) throw new Error('Selecciona dos ubicaciones distintas.')
  if (!lines.length) throw new Error('Agrega al menos un producto a la transferencia.')
  for (const line of lines) {
    assertPositive(line.quantity, 'La cantidad transferida debe ser mayor a cero.')
    if (!line.lotAllocations.length) throw new Error('Selecciona los lotes FIFO para cada producto.')
    if (round(line.lotAllocations.reduce((sum, allocation) => sum + allocation.quantity, 0)) !== round(line.quantity)) throw new Error('La suma de lotes no coincide con la cantidad transferida.')
  }
}

export function createNightclubTransfer(input: Omit<NightclubTransfer, 'id' | 'status' | 'createdAt'> & Partial<Pick<NightclubTransfer, 'id' | 'status' | 'createdAt'>>): NightclubTransfer {
  assertTransferDraft(input.sourceLocationId, input.destinationLocationId, input.lines)
  return { ...input, id: input.id || id(), status: input.status || 'requested', createdAt: input.createdAt || new Date().toISOString() }
}

export function dispatchNightclubTransfer(dataset: NightclubDataset, transferId: string, actor: string, at = new Date().toISOString()): NightclubDataset {
  const next = prepareLegacyNightclubLocations(dataset, 'main', at)
  const transfer = next.transfers!.find(item => item.id === transferId)
  if (!transfer || transfer.status !== 'requested') throw new Error('La transferencia ya no est� disponible para entrega.')
  requireLocation(next, transfer.sourceLocationId); requireLocation(next, transfer.destinationLocationId)
  for (const line of transfer.lines) {
    const source = getBalance(next, transfer.sourceLocationId, line.inventoryId)
    if (source.availableQuantity < line.quantity) throw new Error('No hay stock suficiente en la ubicaci�n de origen.')
    for (const allocation of line.lotAllocations) {
      const lot = next.inventoryLots!.find(item => item.id === allocation.lotId && item.locationId === transfer.sourceLocationId && item.status === 'available')
      if (!lot || lot.remainingQuantity < allocation.quantity) throw new Error('Un lote FIFO ya no tiene saldo suficiente.')
      lot.remainingQuantity = round(lot.remainingQuantity - allocation.quantity)
      if (lot.remainingQuantity === 0) lot.status = 'consumed'
    }
    source.availableQuantity = round(source.availableQuantity - line.quantity); source.updatedAt = at
    const destination = getBalance(next, transfer.destinationLocationId, line.inventoryId)
    if (transfer.mode === 'pending_receipt') destination.inTransitQuantity = round(destination.inTransitQuantity + line.quantity)
    else destination.availableQuantity = round(destination.availableQuantity + line.quantity)
    destination.updatedAt = at
    for (const allocation of line.lotAllocations) next.inventoryLots!.push({ id: id(), inventoryId: line.inventoryId, locationId: transfer.destinationLocationId, receivedQuantity: allocation.quantity, remainingQuantity: allocation.quantity, unitCost: allocation.unitCost, receivedAt: at, sourceType: 'transfer', sourceReferenceId: transfer.id, status: transfer.mode === 'pending_receipt' ? 'in_transit' : 'available' })
  }
  next.transfers = next.transfers!.map(item => item.id === transfer.id ? { ...item, status: transfer.mode === 'pending_receipt' ? 'in_transit' : 'received', preparedBy: actor, handedOverBy: actor, dispatchedAt: at, ...(transfer.mode === 'immediate' ? { receivedBy: actor, receivedAt: at } : {}) } : item)
  return next
}

export function receiveNightclubTransfer(dataset: NightclubDataset, transferId: string, actor: string, at = new Date().toISOString()): NightclubDataset {
  const next = prepareLegacyNightclubLocations(dataset, 'main', at)
  const transfer = next.transfers!.find(item => item.id === transferId)
  if (!transfer || transfer.status !== 'in_transit') throw new Error('La transferencia no est� pendiente de recepci�n.')
  for (const line of transfer.lines) {
    const balance = getBalance(next, transfer.destinationLocationId, line.inventoryId)
    if (balance.inTransitQuantity < line.quantity) throw new Error('El tr�nsito de inventario no coincide con la transferencia.')
    balance.inTransitQuantity = round(balance.inTransitQuantity - line.quantity); balance.availableQuantity = round(balance.availableQuantity + line.quantity); balance.updatedAt = at
  }
  next.inventoryLots = next.inventoryLots!.map(lot => lot.sourceReferenceId === transfer.id && lot.status === 'in_transit' ? { ...lot, status: 'available', receivedAt: at } : lot)
  next.transfers = next.transfers!.map(item => item.id === transfer.id ? { ...item, status: 'received', receivedBy: actor, receivedAt: at } : item)
  return next
}

export function consumeNightclubInventoryFifo(dataset: NightclubDataset, input: { locationId: string; inventoryId: string; quantity: number; actor: string; at?: string; reason?: string; operationId?: string }): { data: NightclubDataset; allocations: Array<{ lotId: string; quantity: number; unitCost: number }> } {
  const at = input.at || new Date().toISOString(); const next = prepareLegacyNightclubLocations(dataset, 'main', at)
  assertPositive(input.quantity, 'El consumo debe ser mayor a cero.'); requireLocation(next, input.locationId)
  const balance = getBalance(next, input.locationId, input.inventoryId)
  if (balance.availableQuantity < input.quantity) throw new Error('No hay existencias suficientes en esta ubicaci�n.')
  const lots = next.inventoryLots!.filter(lot => lot.locationId === input.locationId && lot.inventoryId === input.inventoryId && lot.status === 'available' && lot.remainingQuantity > 0).sort((a, b) => a.receivedAt.localeCompare(b.receivedAt) || a.id.localeCompare(b.id))
  let remaining = input.quantity; const allocations: Array<{ lotId: string; quantity: number; unitCost: number }> = []
  for (const lot of lots) { if (remaining <= 0) break; const quantity = Math.min(remaining, lot.remainingQuantity); lot.remainingQuantity = round(lot.remainingQuantity - quantity); if (lot.remainingQuantity === 0) lot.status = 'consumed'; allocations.push({ lotId: lot.id, quantity, unitCost: lot.unitCost }); remaining = round(remaining - quantity) }
  if (remaining > 0) throw new Error('No hay lotes FIFO disponibles para este consumo.')
  const previous = balance.availableQuantity; balance.availableQuantity = round(balance.availableQuantity - input.quantity); balance.updatedAt = at
  const movement: NightclubInventoryMovement = { id: id(), operationId: input.operationId || id(), inventoryId: input.inventoryId, quantity: -input.quantity, previous, current: balance.availableQuantity, type: 'sale', reason: input.reason || 'Consumo FIFO', at, actor: input.actor, locationId: input.locationId, lotAllocations: allocations }
  next.inventoryMovements = [...(next.inventoryMovements || []), movement]
  return { data: next, allocations }
}

/** Records a manual count, purchase, waste or withdrawal against one physical location. */
export function recordNightclubLocationMovement(dataset: NightclubDataset, input: { locationId: string; inventoryId: string; quantity: number; type: Exclude<NightclubInventoryMovement['type'], 'sale' | 'reversal'>; reason: string; actor: string; at?: string }): NightclubDataset {
  const at = input.at || new Date().toISOString()
  if (!Number.isFinite(input.quantity) || input.quantity === 0) throw new Error('Ingresa una cantidad distinta de cero.')
  if (!input.reason.trim()) throw new Error('Describe el motivo del movimiento.')
  let next = prepareLegacyNightclubLocations(dataset, 'main', at)
  requireLocation(next, input.locationId)
  const stock = next.inventory.find(item => item.id === input.inventoryId)
  if (!stock) throw new Error('El producto de inventario no existe.')
  if (input.quantity < 0) {
    const consumed = consumeNightclubInventoryFifo(next, { locationId: input.locationId, inventoryId: input.inventoryId, quantity: Math.abs(input.quantity), actor: input.actor, at, reason: input.reason })
    next = consumed.data
    const movement = next.inventoryMovements!.at(-1)!
    movement.type = input.type
    movement.reason = input.reason
    return next
  }
  const balance = getBalance(next, input.locationId, input.inventoryId)
  const previous = balance.availableQuantity
  balance.availableQuantity = round(balance.availableQuantity + input.quantity)
  balance.updatedAt = at
  next.inventoryLots!.push({ id: id(), inventoryId: input.inventoryId, locationId: input.locationId, receivedQuantity: input.quantity, remainingQuantity: input.quantity, unitCost: stock.unitCost || 0, receivedAt: at, sourceType: 'purchase', status: 'available' })
  next.inventoryMovements = [...(next.inventoryMovements || []), { id: id(), operationId: id(), inventoryId: input.inventoryId, quantity: input.quantity, previous, current: balance.availableQuantity, type: input.type, reason: input.reason, at, actor: input.actor, locationId: input.locationId }]
  return next
}

export function consumeNightclubBottleMl(dataset: NightclubDataset, input: { locationId: string; inventoryId: string; millilitres: number; actor: string; at?: string }): NightclubDataset {
  const at = input.at || new Date().toISOString(); let next = prepareLegacyNightclubLocations(dataset, 'main', at); assertPositive(input.millilitres, 'Los mililitros deben ser mayores a cero.')
  const item = next.inventory.find(entry => entry.id === input.inventoryId)
  if (!item?.bottleCapacityMl) throw new Error('El producto no est� configurado como botella.')
  let remaining = input.millilitres
  while (remaining > 0) {
    let bottle = next.openBottles!.find(entry => entry.locationId === input.locationId && entry.inventoryId === input.inventoryId && entry.status === 'open' && entry.remainingMl > 0)
    if (!bottle) {
      const consumed = consumeNightclubInventoryFifo(next, { locationId: input.locationId, inventoryId: input.inventoryId, quantity: 1, actor: input.actor, at, reason: 'Apertura autom�tica de botella' })
      next = consumed.data
      bottle = { id: id(), locationId: input.locationId, inventoryId: input.inventoryId, lotId: consumed.allocations[0].lotId, capacityMl: item.bottleCapacityMl, remainingMl: item.bottleCapacityMl, openedAt: at, openedBy: input.actor, status: 'open' }
      next.openBottles!.push(bottle)
    }
    const quantity = Math.min(remaining, bottle.remainingMl); bottle.remainingMl = round(bottle.remainingMl - quantity); if (bottle.remainingMl === 0) bottle.status = 'empty'; remaining = round(remaining - quantity)
  }
  return next
}
