const { HttpsError } = require('firebase-functions/v2/https')
const validId = value => typeof value === 'string' && /^[A-Za-z0-9:_-]{1,160}$/.test(value)
const canonicalUnit = unit => unit === 'l' ? 'ml' : unit === 'kg' ? 'g' : unit
const unitFactor = unit => unit === 'l' || unit === 'kg' ? 1000 : 1
const optionalText = (value, max) => {
  if (value === undefined || value === null || value === '') return undefined
  if (typeof value !== 'string' || value.trim().length > max) throw new HttpsError('invalid-argument', 'Texto invalido.')
  return value.trim() || undefined
}
const amount = value => { const parsed = Number(value); if (!Number.isFinite(parsed) || parsed < 0) throw new HttpsError('invalid-argument', 'Monto invï¿½lido.'); return Math.round((parsed + Number.EPSILON) * 1000) / 1000 }
const canUseCashbox = (actor, cashboxId) => {
  const roleId = actor.membership?.roleId
  if (roleId === 'owner' || roleId === 'admin') return true
  if (actor.membership?.cashboxIds === undefined) return true
  return Array.isArray(actor.membership?.cashboxIds) && actor.membership.cashboxIds.includes(cashboxId)
}
const requireCashboxAccess = (actor, cashboxId) => {
  if (!canUseCashbox(actor, cashboxId)) throw new HttpsError('permission-denied', 'No tienes acceso a esta caja.')
}
const transferLines = value => {
  if (!Array.isArray(value) || !value.length) throw new HttpsError('invalid-argument', 'La transferencia no tiene lï¿½neas.')
  return value.map(line => {
    if (!validId(line.inventoryId) || !Number.isFinite(Number(line.quantity)) || Number(line.quantity) <= 0 || !['unit','ml','g'].includes(line.unit) || !Array.isArray(line.lotAllocations) || !line.lotAllocations.length) throw new HttpsError('invalid-argument', 'Lï¿½nea de transferencia invï¿½lida.')
    const allocations = line.lotAllocations.map(allocation => { if (!validId(allocation.lotId) || amount(allocation.quantity) <= 0 || amount(allocation.unitCost) < 0) throw new HttpsError('invalid-argument', 'Lote invï¿½lido.'); return { lotId: allocation.lotId, quantity: amount(allocation.quantity), unitCost: amount(allocation.unitCost) } })
    if (Math.round(allocations.reduce((sum, item) => sum + item.quantity, 0) * 1000) !== Math.round(Number(line.quantity) * 1000)) throw new HttpsError('invalid-argument', 'Los lotes no coinciden con la cantidad.')
    return { inventoryId: line.inventoryId, quantity: amount(line.quantity), unit: line.unit, lotAllocations: allocations }
  })
}
const transferRequestLines = value => {
  if (!Array.isArray(value) || !value.length) throw new HttpsError('invalid-argument', 'La solicitud necesita al menos un producto.')
  const inventoryIds = new Set()
  return value.map(line => {
    if (!validId(line?.inventoryId) || inventoryIds.has(line.inventoryId) || !['unit', 'ml', 'g'].includes(line?.unit) || !Number.isFinite(Number(line.quantity)) || Number(line.quantity) <= 0) throw new HttpsError('invalid-argument', 'LÃ­nea de solicitud invÃ¡lida.')
    inventoryIds.add(line.inventoryId)
    return { inventoryId: line.inventoryId, quantity: amount(line.quantity), unit: line.unit, lotAllocations: [] }
  })
}
const receiptLines = value => {
  if (!Array.isArray(value) || !value.length || value.length > 100) throw new HttpsError('invalid-argument', 'La recepcion necesita al menos un producto.')
  const inventoryIds = new Set()
  return value.map((line, index) => {
    if (!validId(line?.inventoryId) || !['unit', 'ml', 'l', 'g', 'kg'].includes(line?.unit)) throw new HttpsError('invalid-argument', 'Linea de recepcion invalida.')
    if (inventoryIds.has(line.inventoryId)) throw new HttpsError('invalid-argument', 'Un producto solo puede aparecer una vez por recepcion.')
    inventoryIds.add(line.inventoryId)
    const inputQuantity = amount(line.quantity)
    const inputUnitCost = amount(line.unitCost)
    if (inputQuantity <= 0) throw new HttpsError('invalid-argument', 'La cantidad debe ser mayor a cero.')
    if (inputUnitCost <= 0) throw new HttpsError('invalid-argument', 'El costo unitario debe ser mayor a cero.')
    const factor = unitFactor(line.unit)
    const quantity = amount(inputQuantity * factor)
    const unitCost = amount(inputUnitCost / factor)
    const totalCost = amount(inputQuantity * inputUnitCost)
    if (line.totalCost !== undefined && Math.round(amount(line.totalCost) * 100) !== Math.round(totalCost * 100)) throw new HttpsError('invalid-argument', 'El costo total no coincide con cantidad y costo unitario.')
    return { index, inventoryId: line.inventoryId, inputQuantity, inputUnit: line.unit, quantity, unit: canonicalUnit(line.unit), inputUnitCost, unitCost, totalCost }
  })
}
async function applyNightclubMultiCashboxCommand({ tx, root, actor, branchId, operationId, type, payload, now }) {
  if (type === 'receiveWarehouseIntake') {
    const receipt = payload.receipt || {}
    const lines = receiptLines(receipt.lines)
    const supplier = optionalText(receipt.supplier, 160)
    const reference = optionalText(receipt.reference, 120)
    const notes = optionalText(receipt.notes, 500)
    const sourceDocumentDate = optionalText(receipt.receivedDate, 40)
    if (sourceDocumentDate && Number.isNaN(Date.parse(sourceDocumentDate))) throw new HttpsError('invalid-argument', 'La fecha de recepcion no es valida.')

    const warehouseRef = root.collection('nightclubLocations').doc('warehouse-general')
    const inventoryRefs = lines.map(line => root.collection('nightclubInventory').doc(line.inventoryId))
    const balanceRefs = lines.map(line => root.collection('nightclubInventoryBalances').doc(`warehouse-general:${line.inventoryId}`))
    const [warehouseSnap, ...documents] = await Promise.all([tx.get(warehouseRef), ...inventoryRefs.map(ref => tx.get(ref)), ...balanceRefs.map(ref => tx.get(ref))])
    if (!warehouseSnap.exists || warehouseSnap.data().branchId !== branchId || warehouseSnap.data().type !== 'warehouse' || warehouseSnap.data().active === false) throw new HttpsError('failed-precondition', 'El deposito general no esta disponible.')
    const inventories = documents.slice(0, lines.length)
    const balances = documents.slice(lines.length)
    lines.forEach((line, index) => {
      const inventory = inventories[index]
      if (!inventory.exists || inventory.data().branchId !== branchId) throw new HttpsError('not-found', 'Producto de inventario no disponible.')
      if (canonicalUnit(inventory.data().unit || 'unit') !== line.unit) throw new HttpsError('invalid-argument', 'La unidad no coincide con el producto de inventario.')
    })

    const resultLines = []
    lines.forEach((line, index) => {
      const balanceRef = balanceRefs[index]
      const existing = balances[index].exists ? balances[index].data() : { availableQuantity: 0, reservedQuantity: 0, inTransitQuantity: 0, minimumQuantity: 0, unit: line.unit }
      const previous = amount(existing.availableQuantity || 0)
      const current = amount(previous + line.quantity)
      const lotId = `receiptlot_${operationId}_${line.index}`
      const movementId = `receipt_${operationId}_${line.index}`
      tx.set(balanceRef, { id: balanceRef.id, tenantId: actor.tenantId, branchId, locationId: 'warehouse-general', inventoryId: line.inventoryId, availableQuantity: current, reservedQuantity: amount(existing.reservedQuantity || 0), inTransitQuantity: amount(existing.inTransitQuantity || 0), minimumQuantity: amount(existing.minimumQuantity || 0), unit: line.unit, updatedAt: now }, { merge: true })
      tx.create(root.collection('nightclubInventoryLots').doc(lotId), { id: lotId, tenantId: actor.tenantId, branchId, inventoryId: line.inventoryId, locationId: 'warehouse-general', receivedQuantity: line.quantity, remainingQuantity: line.quantity, unitCost: line.unitCost, receivedAt: now, sourceType: 'purchase', sourceReferenceId: operationId, status: 'available', inputQuantity: line.inputQuantity, inputUnit: line.inputUnit, inputUnitCost: line.inputUnitCost, totalCost: line.totalCost, ...(supplier ? { supplier } : {}), ...(reference ? { reference } : {}), ...(sourceDocumentDate ? { sourceDocumentDate } : {}) })
      tx.create(root.collection('nightclubInventoryMovements').doc(movementId), { id: movementId, operationId, tenantId: actor.tenantId, branchId, locationId: 'warehouse-general', inventoryId: line.inventoryId, quantity: line.quantity, unit: line.unit, previous, current, type: 'restock', reason: reference || 'Entrada de mercaderia al deposito general', actor: actor.uid, actorUid: actor.uid, at: now, createdAt: now, lotAllocations: [{ lotId, quantity: line.quantity, unitCost: line.unitCost }], unitCost: line.unitCost, costAmount: line.totalCost, ...(supplier ? { supplier } : {}), ...(reference ? { reference } : {}), ...(notes ? { notes } : {}), ...(sourceDocumentDate ? { sourceDocumentDate } : {}) })
      resultLines.push({ inventoryId: line.inventoryId, quantity: line.quantity, unit: line.unit, lotId, totalCost: line.totalCost })
    })
    return { locationId: 'warehouse-general', receivedAt: now, lines: resultLines, totalCost: amount(lines.reduce((sum, line) => sum + line.totalCost, 0)) }
  }
  if (type === 'confirmPhysicalCount') {
    const count = payload.count || {}, lines = count.lines
    const reason = optionalText(count.reason, 240)
    const notes = optionalText(count.notes, 500)
    if (!reason) throw new HttpsError('invalid-argument', 'El ajuste requiere un motivo.')
    if (!Array.isArray(lines) || !lines.length || lines.length > 100) throw new HttpsError('invalid-argument', 'El conteo necesita al menos un producto.')
    const ids = new Set()
    const normalized = lines.map((line, index) => {
      if (!validId(line?.inventoryId) || ids.has(line.inventoryId) || !['unit', 'ml', 'g'].includes(line?.unit)) throw new HttpsError('invalid-argument', 'Línea de conteo inválida.')
      ids.add(line.inventoryId)
      const countedQuantity = amount(line.countedQuantity)
      const unitCost = line.unitCost === undefined || line.unitCost === '' ? undefined : amount(line.unitCost)
      return { index, inventoryId: line.inventoryId, unit: line.unit, countedQuantity, unitCost, expectedUpdatedAt: optionalText(line.expectedUpdatedAt, 80) }
    })
    const requestedLocationId = count.locationId === undefined ? null : String(count.locationId)
    const contextRef = root.collection('nightclubOperatorContexts').doc(actor.uid)
    const [context, ...locations] = await Promise.all([tx.get(contextRef), ...(requestedLocationId ? [tx.get(root.collection('nightclubLocations').doc(requestedLocationId))] : [])])
    const locationId = requestedLocationId || context.data()?.locationId
    const location = requestedLocationId ? locations[0] : await tx.get(root.collection('nightclubLocations').doc(locationId || ''))
    if (!locationId || !location.exists || location.data().branchId !== branchId || location.data().active === false) throw new HttpsError('not-found', 'Ubicación no disponible.')
    if (location.data().type === 'cashbox' && (!context.exists || context.data().branchId !== branchId || context.data().locationId !== locationId)) throw new HttpsError('permission-denied', 'Solo puedes contar la caja activa asignada.')
    if (location.data().type !== 'warehouse' && location.data().type !== 'cashbox') throw new HttpsError('invalid-argument', 'Tipo de ubicación inválido.')
    const inventoryRefs = normalized.map(line => root.collection('nightclubInventory').doc(line.inventoryId))
    const balanceRefs = normalized.map(line => root.collection('nightclubInventoryBalances').doc(`${locationId}:${line.inventoryId}`))
    const [inventories, balances, lots] = await Promise.all([
      Promise.all(inventoryRefs.map(ref => tx.get(ref))),
      Promise.all(balanceRefs.map(ref => tx.get(ref))),
      Promise.all(normalized.map(line => tx.get(root.collection('nightclubInventoryLots').where('locationId', '==', locationId).where('inventoryId', '==', line.inventoryId).where('status', '==', 'available')))),
    ])
    const planned = normalized.map((line, index) => {
      const inventory = inventories[index], balance = balances[index]
      if (!inventory.exists || inventory.data().branchId !== branchId || canonicalUnit(inventory.data().unit || 'unit') !== line.unit) throw new HttpsError('invalid-argument', 'Producto o unidad no disponible.')
      if (!balance.exists) throw new HttpsError('failed-precondition', 'No existe saldo para esta ubicación.')
      if (line.expectedUpdatedAt && balance.data().updatedAt !== line.expectedUpdatedAt) throw new HttpsError('aborted', 'El inventario cambió desde que inició el conteo. Revisa y confirma nuevamente.')
      const previous = amount(balance.data().availableQuantity || 0), difference = Math.round((line.countedQuantity - previous + Number.EPSILON) * 1000) / 1000
      const allocations = []
      if (difference < 0) {
        let pending = amount(-difference)
        for (const lot of lots[index].docs.slice().sort((a, b) => String(a.data().receivedAt).localeCompare(String(b.data().receivedAt)) || a.id.localeCompare(b.id))) {
          if (pending <= 0) break
          const quantity = Math.min(pending, Number(lot.data().remainingQuantity || 0))
          if (quantity > 0) { allocations.push({ lotId: lot.id, quantity: amount(quantity), unitCost: amount(lot.data().unitCost || 0), ref: lot.ref, data: lot.data() }); pending = amount(pending - quantity) }
        }
        if (pending > 0) throw new HttpsError('failed-precondition', 'El faltante supera los lotes FIFO disponibles.')
      }
      if (difference > 0 && (!Number.isFinite(line.unitCost) || line.unitCost <= 0)) throw new HttpsError('invalid-argument', 'Un sobrante requiere costo unitario para crear su lote de ajuste.')
      return { ...line, previous, difference, allocations }
    })
    const countId = `count_${operationId}`
    planned.forEach(line => {
      const balanceRef = root.collection('nightclubInventoryBalances').doc(`${locationId}:${line.inventoryId}`)
      if (line.difference < 0) line.allocations.forEach(allocation => { const remainingQuantity = amount(Number(allocation.data.remainingQuantity || 0) - allocation.quantity); tx.update(allocation.ref, { remainingQuantity, status: remainingQuantity === 0 ? 'consumed' : 'available', updatedAt: now }) })
      if (line.difference > 0) tx.create(root.collection('nightclubInventoryLots').doc(`adjustlot_${operationId}_${line.index}`), { id: `adjustlot_${operationId}_${line.index}`, tenantId: actor.tenantId, branchId, inventoryId: line.inventoryId, locationId, receivedQuantity: line.difference, remainingQuantity: line.difference, unitCost: line.unitCost, receivedAt: now, sourceType: 'adjustment', sourceReferenceId: countId, status: 'available' })
      tx.update(balanceRef, { availableQuantity: line.countedQuantity, updatedAt: now })
      const movementRef = root.collection('nightclubInventoryMovements').doc(`count_${operationId}_${line.index}`)
      tx.create(movementRef, { id: movementRef.id, operationId, tenantId: actor.tenantId, branchId, locationId, inventoryId: line.inventoryId, quantity: line.difference, previous: line.previous, current: line.countedQuantity, countedQuantity: line.countedQuantity, type: 'adjustment', reason, ...(notes ? { notes } : {}), actor: actor.uid, actorUid: actor.uid, at: now, createdAt: now, lotAllocations: line.allocations.map(({ lotId, quantity, unitCost }) => ({ lotId, quantity, unitCost })), ...(line.difference > 0 ? { unitCost: line.unitCost, costAmount: amount(line.difference * line.unitCost) } : { costAmount: amount(line.allocations.reduce((sum, allocation) => sum + allocation.quantity * allocation.unitCost, 0)) }) })
    })
    tx.create(root.collection('nightclubPhysicalCounts').doc(countId), { id: countId, operationId, tenantId: actor.tenantId, branchId, locationId, reason, ...(notes ? { notes } : {}), countedBy: actor.uid, confirmedBy: actor.uid, createdAt: now, lines: planned.map(line => ({ inventoryId: line.inventoryId, unit: line.unit, previous: line.previous, countedQuantity: line.countedQuantity, difference: line.difference, lotAllocations: line.allocations.map(({ lotId, quantity, unitCost }) => ({ lotId, quantity, unitCost })) })) })
    return { countId, locationId, lines: planned.map(line => ({ inventoryId: line.inventoryId, previous: line.previous, countedQuantity: line.countedQuantity, difference: line.difference })) }
  }
  if (type === 'selectCashbox') {
    const cashboxId = payload.cashboxId; if (!validId(cashboxId)) throw new HttpsError('invalid-argument', 'Caja invï¿½lida.')
    requireCashboxAccess(actor, cashboxId)
    const cashboxRef = root.collection('nightclubCashboxes').doc(cashboxId), cashbox = await tx.get(cashboxRef)
    if (!cashbox.exists || cashbox.data().branchId !== branchId || cashbox.data().active === false) throw new HttpsError('not-found', 'Caja no disponible.')
    const currentRef = root.collection('nightclubOperatorContexts').doc(actor.uid), current = await tx.get(currentRef)
    const previous = current.data(); if (previous?.activeShiftId && previous.cashboxId !== cashboxId && !payload.confirmPending) throw new HttpsError('failed-precondition', 'Confirma el cambio de caja con un turno pendiente.')
    const open = await tx.get(root.collection('nightclubShifts').where('cashboxId','==',cashboxId).where('status','==','open').limit(1))
    tx.set(currentRef, { id: actor.uid, tenantId: actor.tenantId, branchId, userId: actor.uid, cashboxId, locationId: cashbox.data().locationId, activeShiftId: open.docs[0]?.id || null, selectedAt: now, selectedBy: actor.uid, ...(previous?.cashboxId && previous.cashboxId !== cashboxId ? { changedFromCashboxId: previous.cashboxId } : {}) })
    return { cashboxId, locationId: cashbox.data().locationId, activeShiftId: open.docs[0]?.id || null }
  }
  if (type === 'openCashboxShift') {
    const cashboxId = payload.cashboxId; const openingFloat = amount(payload.openingFloat); if (!validId(cashboxId)) throw new HttpsError('invalid-argument', 'Caja invï¿½lida.')
    requireCashboxAccess(actor, cashboxId)
    const cashbox = await tx.get(root.collection('nightclubCashboxes').doc(cashboxId)); if (!cashbox.exists || cashbox.data().branchId !== branchId || cashbox.data().active === false) throw new HttpsError('not-found', 'Caja no disponible.')
    const open = await tx.get(root.collection('nightclubShifts').where('cashboxId','==',cashboxId).where('status','==','open').limit(1)); if (!open.empty) throw new HttpsError('failed-precondition', 'La caja ya tiene un turno abierto.')
    const shiftId = `shift_${operationId}`; tx.create(root.collection('nightclubShifts').doc(shiftId), { id: shiftId, tenantId: actor.tenantId, branchId, cashboxId, locationId: cashbox.data().locationId, status: 'open', openingFloat, openedAt: now, openedBy: actor.uid }); tx.set(root.collection('nightclubOperatorContexts').doc(actor.uid), { id: actor.uid, tenantId: actor.tenantId, branchId, userId: actor.uid, cashboxId, locationId: cashbox.data().locationId, activeShiftId: shiftId, selectedAt: now, selectedBy: actor.uid }, { merge: true }); return { shiftId, cashboxId }
  }
  if (type === 'dispatchTransfer') {
    const transferId = payload.transferId; if (!validId(transferId)) throw new HttpsError('invalid-argument', 'Transferencia inválida.')
    const transferRef = root.collection('nightclubTransfers').doc(transferId), transferSnap = await tx.get(transferRef); const transfer = transferSnap.data()
    if (!transferSnap.exists || transfer.branchId !== branchId || transfer.status !== 'requested') throw new HttpsError('failed-precondition', 'La transferencia no está disponible para entrega.')
    const sourceLotQueries = await Promise.all(transfer.lines.map(line => line.lotAllocations?.length ? null : tx.get(root.collection('nightclubInventoryLots').where('locationId', '==', transfer.sourceLocationId).where('inventoryId', '==', line.inventoryId).where('status', '==', 'available'))))
    const dispatchedLines = transfer.lines.map((line, lineIndex) => {
      const allocations = line.lotAllocations?.length ? line.lotAllocations : (() => {
        let remaining = line.quantity; const selected = []
        for (const lot of sourceLotQueries[lineIndex].docs.slice().sort((a, b) => String(a.data().receivedAt).localeCompare(String(b.data().receivedAt)) || a.id.localeCompare(b.id))) {
          if (remaining <= 0) break
          const quantity = Math.min(remaining, Number(lot.data().remainingQuantity || 0))
          if (quantity > 0) { selected.push({ lotId: lot.id, quantity: amount(quantity), unitCost: amount(lot.data().unitCost || 0) }); remaining = amount(remaining - quantity) }
        }
        if (remaining > 0) throw new HttpsError('aborted', 'No hay lotes FIFO suficientes en el depósito.')
        return selected
      })()
      return { ...line, lotAllocations: allocations }
    })
    const balanceSnaps = await Promise.all(dispatchedLines.flatMap(line => [tx.get(root.collection('nightclubInventoryBalances').doc(`${transfer.sourceLocationId}:${line.inventoryId}`)), tx.get(root.collection('nightclubInventoryBalances').doc(`${transfer.destinationLocationId}:${line.inventoryId}`))]))
    const lotSnaps = await Promise.all(dispatchedLines.map(line => Promise.all(line.lotAllocations.map(allocation => tx.get(root.collection('nightclubInventoryLots').doc(allocation.lotId))))))
    const isImmediate = transfer.mode === 'immediate'
    dispatchedLines.forEach((line, lineIndex) => {
      const sourceRef = root.collection('nightclubInventoryBalances').doc(`${transfer.sourceLocationId}:${line.inventoryId}`), destinationRef = root.collection('nightclubInventoryBalances').doc(`${transfer.destinationLocationId}:${line.inventoryId}`)
      const sourceSnap = balanceSnaps[lineIndex * 2], destinationSnap = balanceSnaps[lineIndex * 2 + 1], lineLotSnaps = lotSnaps[lineIndex]
      if (!sourceSnap.exists || Number(sourceSnap.data().availableQuantity) < line.quantity) throw new HttpsError('aborted', 'Stock insuficiente en origen.')
      lineLotSnaps.forEach((lotSnap, index) => { const allocation = line.lotAllocations[index]; if (!lotSnap.exists || lotSnap.data().locationId !== transfer.sourceLocationId || lotSnap.data().status !== 'available' || Number(lotSnap.data().remainingQuantity) < allocation.quantity) throw new HttpsError('aborted', 'Un lote FIFO ya no tiene saldo suficiente.') })
      tx.update(sourceRef, { availableQuantity: amount(Number(sourceSnap.data().availableQuantity) - line.quantity), updatedAt: now })
      const destination = destinationSnap.exists ? destinationSnap.data() : { availableQuantity: 0, inTransitQuantity: 0, reservedQuantity: 0, minimumQuantity: 0, unit: line.unit }
      tx.set(destinationRef, {
        id: destinationRef.id,
        tenantId: actor.tenantId,
        branchId,
        locationId: transfer.destinationLocationId,
        inventoryId: line.inventoryId,
        ...destination,
        availableQuantity: isImmediate ? amount(Number(destination.availableQuantity || 0) + line.quantity) : Number(destination.availableQuantity || 0),
        inTransitQuantity: isImmediate ? Number(destination.inTransitQuantity || 0) : amount(Number(destination.inTransitQuantity || 0) + line.quantity),
        updatedAt: now,
      }, { merge: true })
      line.lotAllocations.forEach((allocation, allocationIndex) => {
        const lot = lineLotSnaps[allocationIndex].data()
        const remainingQuantity = amount(Number(lot.remainingQuantity) - allocation.quantity)
        tx.update(lineLotSnaps[allocationIndex].ref, { remainingQuantity, status: remainingQuantity === 0 ? 'consumed' : 'available', updatedAt: now })
        const destinationLotId = `transferlot_${operationId}_${lineIndex}_${allocationIndex}_${line.inventoryId}`
        tx.create(root.collection('nightclubInventoryLots').doc(destinationLotId), {
          id: destinationLotId,
          tenantId: actor.tenantId,
          branchId,
          inventoryId: line.inventoryId,
          locationId: transfer.destinationLocationId,
          receivedQuantity: allocation.quantity,
          remainingQuantity: allocation.quantity,
          unitCost: allocation.unitCost,
          receivedAt: now,
          sourceType: 'transfer',
          sourceReferenceId: transferId,
          status: isImmediate ? 'available' : 'in_transit',
        })
      })
    })
    const finalStatus = isImmediate ? 'received' : 'in_transit'
    tx.update(transferRef, {
      lines: dispatchedLines,
      status: finalStatus,
      preparedBy: actor.uid,
      handedOverBy: actor.uid,
      dispatchedAt: now,
      ...(isImmediate ? { receivedBy: actor.uid, receivedAt: now } : {}),
    })
    return { transferId, status: finalStatus }
  }
  if (type === 'receiveTransfer') {
    const transferId = payload.transferId; if (!validId(transferId)) throw new HttpsError('invalid-argument', 'Transferencia invÃ¡lida.')
    const transferRef = root.collection('nightclubTransfers').doc(transferId), transferSnap = await tx.get(transferRef); const transfer = transferSnap.data()
    if (!transferSnap.exists || transfer.branchId !== branchId || transfer.status !== 'in_transit') throw new HttpsError('failed-precondition', 'La transferencia no estÃ¡ pendiente de recepciÃ³n.')
    const context = await tx.get(root.collection('nightclubOperatorContexts').doc(actor.uid))
    if (!context.exists || context.data().branchId !== branchId || context.data().locationId !== transfer.destinationLocationId || !canUseCashbox(actor, context.data().cashboxId)) throw new HttpsError('permission-denied', 'La transferencia pertenece a otra caja.')
    const transitLots = await tx.get(root.collection('nightclubInventoryLots').where('sourceReferenceId', '==', transferId).where('status', '==', 'in_transit'))
    const destinationRefs = transfer.lines.map(line => root.collection('nightclubInventoryBalances').doc(`${transfer.destinationLocationId}:${line.inventoryId}`))
    const destinationSnaps = await Promise.all(destinationRefs.map(ref => tx.get(ref)))
    destinationSnaps.forEach((snap, index) => { if (!snap.exists || Number(snap.data().inTransitQuantity) < transfer.lines[index].quantity) throw new HttpsError('aborted', 'El trÃ¡nsito no coincide con la transferencia.') })
    destinationSnaps.forEach((snap, index) => { const line = transfer.lines[index]; tx.update(destinationRefs[index], { inTransitQuantity: amount(Number(snap.data().inTransitQuantity) - line.quantity), availableQuantity: amount(Number(snap.data().availableQuantity || 0) + line.quantity), updatedAt: now }) })
    transitLots.docs.forEach(lot => tx.update(lot.ref, { status: 'available', receivedAt: now, updatedAt: now })); tx.update(transferRef, { status: 'received', receivedBy: actor.uid, receivedAt: now }); return { transferId, status: 'received' }
  }
  if (type === 'requestTransfer') {
    const draft = payload.transfer || {}
    if (draft.mode !== 'pending_receipt' && draft.mode !== 'immediate') throw new HttpsError('invalid-argument', 'Las reposiciones de caja requieren recepción pendiente.')
    let lines, sourceLocationId, destinationLocationId
    if (draft.mode === 'immediate') {
      lines = transferLines(draft.lines)
      sourceLocationId = draft.sourceLocationId || 'warehouse-general'
      destinationLocationId = draft.destinationLocationId
    } else {
      lines = transferRequestLines(draft.lines)
      const context = await tx.get(root.collection('nightclubOperatorContexts').doc(actor.uid))
      if (!context.exists || context.data().branchId !== branchId || !validId(context.data().locationId) || context.data().locationId === 'warehouse-general' || !canUseCashbox(actor, context.data().cashboxId)) throw new HttpsError('failed-precondition', 'Selecciona una caja activa antes de solicitar reposición.')
      sourceLocationId = 'warehouse-general'
      destinationLocationId = context.data().locationId
    }
    const [source, destination, ...inventory] = await Promise.all([tx.get(root.collection('nightclubLocations').doc(sourceLocationId)), tx.get(root.collection('nightclubLocations').doc(destinationLocationId)), ...lines.map(line => tx.get(root.collection('nightclubInventory').doc(line.inventoryId)))])
    if (!source.exists || !destination.exists || source.data().branchId !== branchId || destination.data().branchId !== branchId || source.data().type !== 'warehouse' || destination.data().type !== 'cashbox') throw new HttpsError('not-found', 'Ubicación no disponible.')
    lines.forEach((line, index) => { if (!inventory[index].exists || inventory[index].data().branchId !== branchId || canonicalUnit(inventory[index].data().unit || 'unit') !== line.unit) throw new HttpsError('invalid-argument', 'Producto o unidad no disponibles.') })
    const transferId = `transfer_${operationId}`
    tx.create(root.collection('nightclubTransfers').doc(transferId), { id: transferId, tenantId: actor.tenantId, branchId, sourceLocationId, destinationLocationId, mode: draft.mode, lines, status: 'requested', requestedBy: actor.uid, createdAt: now })
    return { transferId, destinationLocationId }
  }
  throw new HttpsError('invalid-argument', 'Comando de caja no reconocido.')
}
module.exports = { applyNightclubMultiCashboxCommand, canUseCashbox }



