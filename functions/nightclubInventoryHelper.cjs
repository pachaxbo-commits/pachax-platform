const { HttpsError } = require('firebase-functions/v2/https')

const roundMoney = value => Math.round((Number(value) + Number.EPSILON) * 100) / 100

function fail(message) {
  throw new HttpsError('failed-precondition', message)
}

function invalid(message) {
  throw new HttpsError('invalid-argument', message)
}

/**
 * Normaliza y agrega los requerimientos de inventario por insumo conservando su unidad (unit, ml, etc.)
 */
function planNightclubInventoryConsumption(productsMap, drafts, branchId) {
  const requirementsMap = new Map()

  for (const draft of drafts) {
    const product = productsMap.get(draft.productId)
    if (!product || product.branchId !== branchId || product.active === false || !Number.isFinite(product.price) || product.price < 0) {
      invalid('Producto inválido o sin precio configurado.')
    }

    let recipe = []
    if (product.inventoryMode === 'none') {
      recipe = []
    } else if (Array.isArray(product.recipe) && product.recipe.length > 0) {
      recipe = product.recipe
    } else if (product.bottlePresentation?.inventoryId) {
      const kind = product.bottlePresentation.kind
      recipe = [{
        inventoryId: product.bottlePresentation.inventoryId,
        quantity: kind === 'pour' ? (product.bottlePresentation.millilitres || 50) : 1,
        unit: kind === 'pour' ? 'ml' : 'unit',
      }]
    } else if (product.inventoryId) {
      recipe = [{ inventoryId: product.inventoryId, quantity: 1, unit: 'unit' }]
    } else if (product.inventoryMode !== 'none') {
      fail('El producto necesita inventario configurado.')
    }

    for (const part of recipe) {
      if (!Number.isFinite(part.quantity) || part.quantity <= 0) {
        invalid('Receta inválida.')
      }
      const inventoryId = String(part.inventoryId).trim()
      if (!inventoryId) invalid('Insumo no especificado en receta.')

      let unit = part.unit
      if (!unit) {
        if (product.bottlePresentation?.kind === 'pour') unit = 'ml'
        else unit = 'unit'
      }

      if (!requirementsMap.has(inventoryId)) {
        requirementsMap.set(inventoryId, {
          unitsNeeded: 0,
          mlNeeded: 0,
          otherNeeded: 0,
          otherUnit: null,
        })
      }

      const req = requirementsMap.get(inventoryId)
      const qtyNeeded = roundMoney(part.quantity * draft.quantity)

      if (unit === 'unit') {
        req.unitsNeeded = roundMoney(req.unitsNeeded + qtyNeeded)
      } else if (unit === 'ml') {
        req.mlNeeded = roundMoney(req.mlNeeded + qtyNeeded)
      } else {
        if (req.otherUnit && req.otherUnit !== unit) {
          invalid(`Unidades incompatibles en la receta para el insumo ${inventoryId}: ${req.otherUnit} y ${unit}.`)
        }
        req.otherUnit = unit
        req.otherNeeded = roundMoney(req.otherNeeded + qtyNeeded)
      }
    }
  }

  return requirementsMap
}

/**
 * Calcula las actualizaciones físicas exactas (before/after) para cada insumo requerido.
 */
function calculateNightclubStockUpdates(stocksMap, requirementsMap, branchId) {
  const updates = []

  for (const [inventoryId, req] of requirementsMap.entries()) {
    const stockSnap = stocksMap.get(inventoryId)
    if (!stockSnap || !stockSnap.exists || stockSnap.data()?.branchId !== branchId) {
      fail(`Insumo no encontrado o no configurado en esta sucursal: ${inventoryId}.`)
    }
    const stock = stockSnap.data()
    const isBottled = Boolean(stock.bottleCapacityMl && Number(stock.bottleCapacityMl) > 0)

    if (isBottled) {
      if (req.otherNeeded > 0) {
        invalid(`El insumo embotellado ${stock.name || inventoryId} no admite la unidad '${req.otherUnit}'.`)
      }

      const capacity = Number(stock.bottleCapacityMl)
      const currentClosedBefore = Number(stock.current) || 0
      const openBottleMlBefore = Number(stock.openBottleMl) || 0

      // Paso 1: Consumo de botellas cerradas completas (unit)
      if (req.unitsNeeded > 0 && currentClosedBefore < req.unitsNeeded) {
        fail(`Stock insuficiente de botellas cerradas para ${stock.name || inventoryId}. Disponibles: ${currentClosedBefore}, requeridas: ${req.unitsNeeded}.`)
      }
      let closedAfter = currentClosedBefore - req.unitsNeeded
      let openMlAfter = openBottleMlBefore

      // Paso 2: Consumo por mililitros (ml)
      if (req.mlNeeded > 0) {
        if (openMlAfter >= req.mlNeeded) {
          openMlAfter = roundMoney(openMlAfter - req.mlNeeded)
        } else {
          const neededFromClosed = roundMoney(req.mlNeeded - openMlAfter)
          const bottlesToOpen = Math.ceil(neededFromClosed / capacity)
          if (closedAfter < bottlesToOpen) {
            fail(`Stock insuficiente para ${stock.name || inventoryId}. Contenido abierto: ${openMlAfter} ml, requeridos: ${req.mlNeeded} ml, botellas disponibles para abrir: ${closedAfter}.`)
          }
          closedAfter = closedAfter - bottlesToOpen
          const openedVolume = bottlesToOpen * capacity
          openMlAfter = roundMoney(openedVolume - neededFromClosed)
        }
      }

      const consumedQuantity = req.unitsNeeded > 0 ? (req.mlNeeded > 0 ? roundMoney(req.unitsNeeded + req.mlNeeded / capacity) : req.unitsNeeded) : req.mlNeeded
      const consumedUnit = req.unitsNeeded > 0 ? (req.mlNeeded > 0 ? 'mixed' : 'unit') : 'ml'

      updates.push({
        inventoryId,
        ref: stockSnap.ref,
        name: stock.name || inventoryId,
        isBottled: true,
        bottleCapacityMl: capacity,
        closedBottlesBefore: currentClosedBefore,
        closedBottlesAfter: closedAfter,
        openBottleMlBefore,
        openBottleMlAfter: openMlAfter,
        currentBefore: currentClosedBefore,
        currentAfter: closedAfter,
        unitsConsumed: req.unitsNeeded,
        mlConsumed: req.mlNeeded,
        consumedQuantity,
        consumedUnit,
      })
    } else {
      // Insumo regular (no embotellado)
      if (req.mlNeeded > 0) {
        invalid(`El insumo ${stock.name || inventoryId} no es embotellado y no admite consumo en ml.`)
      }
      const totalNeeded = roundMoney(req.unitsNeeded + req.otherNeeded)
      const currentBefore = Number(stock.current) || 0
      if (currentBefore < totalNeeded) {
        fail(`Stock insuficiente para ${stock.name || inventoryId}. Disponible: ${currentBefore}, requerido: ${totalNeeded}.`)
      }
      const currentAfter = roundMoney(currentBefore - totalNeeded)
      const consumedUnit = req.otherUnit || stock.unit || 'unit'

      updates.push({
        inventoryId,
        ref: stockSnap.ref,
        name: stock.name || inventoryId,
        isBottled: false,
        bottleCapacityMl: null,
        closedBottlesBefore: null,
        closedBottlesAfter: null,
        openBottleMlBefore: null,
        openBottleMlAfter: null,
        currentBefore,
        currentAfter,
        unitsConsumed: req.unitsNeeded,
        mlConsumed: 0,
        consumedQuantity: totalNeeded,
        consumedUnit,
      })
    }
  }

  return updates
}

/**
 * Aplica en la transacción Firestore las actualizaciones de inventario y registra los movimientos de venta.
 */
function applyNightclubStockUpdates(tx, root, actor, branchId, shiftId, accountId, roundId, operationId, now, updates) {
  for (const update of updates) {
    const updateData = {
      current: update.currentAfter,
      updatedAt: now,
    }
    if (update.isBottled) {
      updateData.openBottleMl = update.openBottleMlAfter
    }
    tx.update(update.ref, updateData)

    const movId = `${operationId}_${update.inventoryId}`
    tx.create(root.collection('nightclubInventoryMovements').doc(movId), {
      id: movId,
      operationId,
      tenantId: actor.tenantId,
      branchId,
      shiftId: shiftId || null,
      accountId: accountId || null,
      roundId,
      inventoryId: update.inventoryId,
      quantity: -update.consumedQuantity,
      unit: update.consumedUnit,
      previous: update.currentBefore,
      current: update.currentAfter,
      closedBottlesBefore: update.closedBottlesBefore,
      closedBottlesAfter: update.closedBottlesAfter,
      openBottleMlBefore: update.openBottleMlBefore,
      openBottleMlAfter: update.openBottleMlAfter,
      unitsConsumed: update.unitsConsumed,
      mlConsumed: update.mlConsumed,
      consumedQuantity: update.consumedQuantity,
      consumedUnit: update.consumedUnit,
      type: 'sale',
      actorUid: actor.uid,
      createdAt: now,
    })
  }

  return updates.map(u => ({
    inventoryId: u.inventoryId,
    isBottled: u.isBottled,
    closedBottlesBefore: u.closedBottlesBefore,
    closedBottlesAfter: u.closedBottlesAfter,
    openBottleMlBefore: u.openBottleMlBefore,
    openBottleMlAfter: u.openBottleMlAfter,
    currentBefore: u.currentBefore,
    currentAfter: u.currentAfter,
    previous: u.currentBefore,
    current: u.currentAfter,
    quantity: u.consumedQuantity,
    unit: u.consumedUnit,
    consumedQuantity: u.consumedQuantity,
    consumedUnit: u.consumedUnit,
    unitsConsumed: u.unitsConsumed,
    mlConsumed: u.mlConsumed,
  }))
}

/**
 * Fase de lectura de reversión: Valida que ningún insumo haya tenido movimientos posteriores incompatibles
 * y prepara las actualizaciones de reversión exacta.
 */
async function prepareNightclubInventoryReversal(tx, root, branchId, roundId) {
  const saleMovsSnap = await tx.get(
    root.collection('nightclubInventoryMovements')
      .where('roundId', '==', roundId)
      .where('type', '==', 'sale')
  )

  if (saleMovsSnap.empty) {
    return []
  }

  const items = []
  for (const doc of saleMovsSnap.docs) {
    const mov = doc.data()
    const invId = mov.inventoryId
    const stockRef = root.collection('nightclubInventory').doc(invId)
    const [stockSnap, invMovsSnap] = await Promise.all([
      tx.get(stockRef),
      tx.get(root.collection('nightclubInventoryMovements').where('inventoryId', '==', invId)),
    ])

    if (!stockSnap.exists || stockSnap.data()?.branchId !== branchId) {
      fail('Falta un insumo; requiere revisión manual.')
    }
    const stock = stockSnap.data()
    const isBottled = Boolean(stock.bottleCapacityMl && Number(stock.bottleCapacityMl) > 0)

    // 1. Verificar si el estado físico actual coincide exactamente con el snapshot post-venta
    if (isBottled) {
      const currentClosed = Number(stock.current) || 0
      const currentOpenMl = Number(stock.openBottleMl) || 0
      if (
        (mov.closedBottlesAfter !== undefined && currentClosed !== Number(mov.closedBottlesAfter)) ||
        (mov.openBottleMlAfter !== undefined && currentOpenMl !== Number(mov.openBottleMlAfter))
      ) {
        fail('El inventario tuvo movimientos posteriores; requiere revisión manual.')
      }
    } else {
      const currentBefore = Number(stock.current) || 0
      if (mov.current !== undefined && currentBefore !== Number(mov.current)) {
        fail('El inventario tuvo movimientos posteriores; requiere revisión manual.')
      }
    }

    // 2. Verificar si existen ventas o salidas posteriores que sigan activas (no revertidas)
    const posteriorSales = invMovsSnap.docs.filter(d =>
      d.id !== doc.id &&
      d.data().roundId !== roundId &&
      d.data().createdAt > mov.createdAt &&
      (d.data().type === 'sale' || d.data().type === 'waste' || d.data().type === 'withdrawal')
    )
    if (posteriorSales.length > 0) {
      const reversedRoundIds = new Set(
        invMovsSnap.docs
          .filter(d => d.data().type === 'reversal' && d.data().roundId)
          .map(d => d.data().roundId)
      )
      const hasUnreversedPosterior = posteriorSales.some(d => !reversedRoundIds.has(d.data().roundId))
      if (hasUnreversedPosterior) {
        fail('El inventario tuvo movimientos posteriores; requiere revisión manual.')
      }
    }

    if (isBottled) {
      const currentClosed = Number(stock.current) || 0
      const currentOpenMl = Number(stock.openBottleMl) || 0
      items.push({
        inventoryId: invId,
        stockRef,
        isBottled: true,
        closedBottlesRestored: mov.closedBottlesBefore !== undefined ? Number(mov.closedBottlesBefore) : currentClosed,
        openBottleMlRestored: mov.openBottleMlBefore !== undefined ? Number(mov.openBottleMlBefore) : currentOpenMl,
        currentRestored: mov.closedBottlesBefore !== undefined ? Number(mov.closedBottlesBefore) : currentClosed,
        currentBefore: currentClosed,
        openBottleMlBefore: currentOpenMl,
        consumedQuantity: Math.abs(mov.consumedQuantity || mov.quantity || 0),
        consumedUnit: mov.consumedUnit || mov.unit || 'unit',
        originalMovement: mov,
      })
    } else {
      const currentBefore = Number(stock.current) || 0
      const currentRestored = mov.previous !== undefined ? Number(mov.previous) : roundMoney(currentBefore + Math.abs(mov.quantity || 0))

      items.push({
        inventoryId: invId,
        stockRef,
        isBottled: false,
        closedBottlesRestored: null,
        openBottleMlRestored: null,
        currentRestored,
        currentBefore,
        openBottleMlBefore: null,
        consumedQuantity: Math.abs(mov.consumedQuantity || mov.quantity || 0),
        consumedUnit: mov.consumedUnit || mov.unit || 'unit',
        originalMovement: mov,
      })
    }
  }

  return items
}

/**
 * Fase de escritura de reversión: Restaura exactamente el snapshot y crea los movimientos de tipo 'reversal'.
 */
function applyNightclubInventoryReversal(tx, root, actor, branchId, shiftId, accountId, roundId, operationId, now, reason, itemsToRevert) {
  for (const item of itemsToRevert) {
    const updateData = {
      current: item.currentRestored,
      updatedAt: now,
    }
    if (item.isBottled) {
      updateData.openBottleMl = item.openBottleMlRestored
    }
    tx.update(item.stockRef, updateData)

    const movId = `reversal_${operationId}_${item.inventoryId}`
    tx.create(root.collection('nightclubInventoryMovements').doc(movId), {
      id: movId,
      operationId,
      tenantId: actor.tenantId,
      branchId,
      shiftId: shiftId || null,
      accountId: accountId || null,
      roundId,
      inventoryId: item.inventoryId,
      quantity: item.consumedQuantity,
      unit: item.consumedUnit,
      previous: item.currentBefore,
      current: item.currentRestored,
      closedBottlesBefore: item.currentBefore,
      closedBottlesAfter: item.closedBottlesRestored,
      openBottleMlBefore: item.openBottleMlBefore,
      openBottleMlAfter: item.openBottleMlRestored,
      type: 'reversal',
      reason: reason || 'Anulación o reembolso de ronda',
      actorUid: actor.uid,
      createdAt: now,
    })
  }
}

module.exports = {
  roundMoney,
  planNightclubInventoryConsumption,
  calculateNightclubStockUpdates,
  applyNightclubStockUpdates,
  prepareNightclubInventoryReversal,
  applyNightclubInventoryReversal,
}
