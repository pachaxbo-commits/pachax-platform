const { HttpsError } = require('firebase-functions/v2/https')
const { createHash } = require('node:crypto')
const { tenantActor, hasPermission, id } = require('./authorization.cjs')
const { applyPaidRoundCommand } = require('./nightclubPaidRounds.cjs')

const permissions = {
  openShift: 'cash.close',
  closeShift: 'cash.close',
  openAccount: 'orders.manage',
  addRound: 'orders.manage',
  settleRound: 'sales.create',
  advanceRound: 'orders.manage',
  deliverRound: 'orders.manage',
  requestBill: 'orders.manage',
  reopenBill: 'orders.manage',
  recordPayment: 'sales.create',
  finishOccupancy: 'orders.manage',
  refundRound: 'settings.manage',
  cancelRound: 'orders.manage',
  inventoryMovement: 'inventory.manage',
  saveZone: 'orders.manage',
  deleteZone: 'orders.manage',
  saveTable: 'orders.manage',
  deleteTable: 'orders.manage',
  saveProduct: 'products.manage',
  saveInventory: 'inventory.manage',
  saveCustomer: 'customers.read',
  saveReservation: 'orders.read',
  cancelReservation: 'orders.read',
  arriveReservation: 'orders.read',
  savePromoter: 'settings.manage',
  deletePromoter: 'settings.manage',
  savePromoterEvent: 'settings.manage',
  saveTicketSale: 'sales.create',
  saveLoungeSale: 'sales.create',
  markLoungePaid: 'sales.create',
  savePromoterConsumption: 'settings.manage',
}

const money = value => Math.round((value + Number.EPSILON) * 100) / 100
const cents = value => Math.round(value * 100)
const amount = value => {
  const number = Number(value)
  if (!Number.isFinite(number) || number < 0) throw new HttpsError('invalid-argument', 'Monto inválido.')
  return money(number)
}
const text = (value, max = 200) => {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max) throw new HttpsError('invalid-argument', 'Texto inválido.')
  return value.trim()
}
const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value
const fingerprint = value => createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex')

async function executeNightclubCommand(db, request) {
  const input = request.data || {}, type = input.commandType || input.action, permission = permissions[type]
  if (!permission) throw new HttpsError('invalid-argument', 'Comando Nightclub no reconocido.')
  const operationId = id(input.operationId), actor = await tenantActor(db, request, permission)
  if (actor.tenant.businessType !== 'nightclub_lounge') throw new HttpsError('failed-precondition', 'La empresa no usa la plantilla Nightclub.')
  const branchId = id(input.branchId), payload = input.payload || {}, requestHash = fingerprint({ type, branchId, payload })
  const root = actor.root, operationRef = root.collection('nightclubOperations').doc(operationId), now = new Date().toISOString()
  return db.runTransaction(async tx => {
    const [stored, tenant, member] = await Promise.all([tx.get(operationRef), tx.get(root), tx.get(root.collection('members').doc(actor.uid))])
    if (stored.exists) {
      const previous = stored.data()
      if (previous.actorUid !== actor.uid || previous.requestHash !== requestHash) throw new HttpsError('already-exists', 'operationId ya pertenece a otra solicitud.')
      return previous.result
    }
    if (!hasPermission(tenant.data(), member.data(), permission)) throw new HttpsError('permission-denied', 'Permiso revocado.')
    if (!member.data().branchIds?.includes(branchId)) throw new HttpsError('permission-denied', 'Sucursal no autorizada.')

    // Validaciones estrictas por rol según especificación
    if (type === 'advanceRound' && !['owner', 'admin', 'bar'].includes(member.data().roleId)) {
      throw new HttpsError('permission-denied', 'Solo Barra puede preparar pedidos.')
    }
    if (type === 'deliverRound' && !['owner', 'admin', 'waiter', 'service'].includes(member.data().roleId)) {
      throw new HttpsError('permission-denied', 'Solo Servicio puede entregar pedidos.')
    }
    if (type === 'finishOccupancy' && !['owner', 'admin', 'waiter', 'service'].includes(member.data().roleId)) {
      throw new HttpsError('permission-denied', 'Solo Servicio puede cerrar mesas.')
    }
    if (type === 'refundRound' && !['owner', 'admin'].includes(member.data().roleId)) {
      throw new HttpsError('permission-denied', 'Solo Administración puede reembolsar.')
    }
    if (type === 'recordPayment' && !['owner', 'admin', 'cashier'].includes(member.data().roleId)) {
      throw new HttpsError('permission-denied', 'Solo Caja o Administración pueden registrar pagos.')
    }
    if (type === 'reopenBill' && !['owner', 'admin', 'cashier'].includes(member.data().roleId)) {
      throw new HttpsError('permission-denied', 'Solo Caja o Administración pueden reabrir la cuenta.')
    }
    if (['saveZone', 'deleteZone', 'saveTable', 'deleteTable'].includes(type) && !['owner', 'admin'].includes(member.data().roleId)) {
      throw new HttpsError('permission-denied', 'Solo Administración puede configurar zonas y mesas.')
    }
    if (['saveProduct', 'saveInventory', 'inventoryMovement'].includes(type) && !['owner', 'admin', 'inventory'].includes(member.data().roleId)) {
      throw new HttpsError('permission-denied', 'Solo Inventario o Administración pueden gestionar productos e insumos.')
    }
    if (['openShift', 'closeShift'].includes(type) && !['owner', 'admin', 'cashier'].includes(member.data().roleId)) {
      throw new HttpsError('permission-denied', 'Solo Caja o Administración pueden gestionar turnos.')
    }
    if (type === 'saveReservation' && !['owner', 'admin', 'cashier', 'waiter', 'service'].includes(member.data().roleId)) {
      throw new HttpsError('permission-denied', 'No tienes permiso para gestionar reservas.')
    }
    if (type === 'cancelReservation' && !['owner', 'admin', 'cashier'].includes(member.data().roleId)) {
      throw new HttpsError('permission-denied', 'Solo Administración o Caja pueden cancelar reservas.')
    }
    if (type === 'arriveReservation' && !['owner', 'admin', 'waiter', 'service', 'cashier'].includes(member.data().roleId)) {
      throw new HttpsError('permission-denied', 'No tienes permiso para registrar la llegada de reservas.')
    }
    if (['savePromoter', 'deletePromoter', 'savePromoterEvent', 'savePromoterConsumption'].includes(type) && !['owner', 'admin'].includes(member.data().roleId)) {
      throw new HttpsError('permission-denied', 'Solo Administración puede gestionar relacionadores.')
    }
    if (['saveTicketSale', 'saveLoungeSale', 'markLoungePaid'].includes(type) && !['owner', 'admin', 'cashier'].includes(member.data().roleId)) {
      throw new HttpsError('permission-denied', 'Solo Administración o Caja pueden registrar ventas de relacionadores.')
    }

    const result = await applyCommand({ db, tx, root, actor, branchId, operationId, type, payload, now })
    tx.create(operationRef, { operationId, tenantId: actor.tenantId, branchId, actorUid: actor.uid, type, requestHash, status: 'confirmed', createdAt: now, result })
    tx.create(root.collection('nightclubAudit').doc(), { operationId, tenantId: actor.tenantId, branchId, actorUid: actor.uid, type, resourceId: result.accountId || result.roundId || result.shiftId || result.movementId || result.zoneId || result.tableId || result.productId || result.customerId || result.reservationId || result.promoterId || result.eventId || result.saleId || result.consumptionId || null, createdAt: now })
    return result
  })
}

async function applyCommand(context) {
  const { tx, root, actor, branchId, operationId, type, payload, now } = context
  const stateRef = root.collection('nightclubOperationalState').doc(branchId)

  // 1. Apertura de Turno
  if (type === 'openShift') {
    const state = await tx.get(stateRef)
    if (state.data()?.activeShiftId) throw new HttpsError('failed-precondition', 'Ya existe un turno abierto.')
    const shiftId = `shift_${operationId}`, openingFloat = amount(payload.openingFloat), ref = root.collection('nightclubShifts').doc(shiftId)
    tx.create(ref, { id: shiftId, tenantId: actor.tenantId, branchId, status: 'open', openingFloat, openedAt: now, openedBy: actor.uid })
    tx.set(stateRef, { activeShiftId: shiftId, updatedAt: now }, { merge: true })
    return { shiftId }
  }

  // 2. Operaciones que no requieren turno activo (CRUD de configuración básica)
  if (type === 'saveZone') {
    const zone = payload.zone || payload
    const zoneId = id(zone.id || `zone_${operationId}`)
    const zoneRef = root.collection('nightclubZones').doc(zoneId)
    const data = {
      id: zoneId,
      tenantId: actor.tenantId,
      branchId,
      name: text(zone.name, 100),
      sortOrder: Number(zone.sortOrder) || 0,
      updatedAt: now,
    }
    tx.set(zoneRef, data, { merge: true })
    return { zoneId, zone: data }
  }

  if (type === 'deleteZone') {
    const zoneId = id(payload.id)
    const tables = await tx.get(root.collection('nightclubTables').where('zoneId', '==', zoneId))
    if (!tables.empty) throw new HttpsError('failed-precondition', 'No se puede eliminar una zona con mesas asignadas.')
    tx.delete(root.collection('nightclubZones').doc(zoneId))
    return { zoneId }
  }

  if (type === 'saveTable') {
    const table = payload.table || payload
    const tableId = id(table.id || `table_${operationId}`)
    const tableRef = root.collection('nightclubTables').doc(tableId)
    const existing = await tx.get(tableRef)
    const data = {
      id: tableId,
      tenantId: actor.tenantId,
      branchId,
      name: text(table.name, 100),
      zoneId: id(table.zoneId || 'general'),
      capacity: Number(table.capacity) || 4,
      status: existing.exists ? existing.data().status : (table.status || 'available'),
      activeAccountId: existing.exists ? (existing.data().activeAccountId || null) : null,
      updatedAt: now,
    }
    tx.set(tableRef, data, { merge: true })
    return { tableId, table: data }
  }

  if (type === 'deleteTable') {
    const tableId = id(payload.id)
    const tableRef = root.collection('nightclubTables').doc(tableId)
    const table = await tx.get(tableRef)
    if (table.exists && table.data().activeAccountId) {
      throw new HttpsError('failed-precondition', 'No se puede eliminar una mesa ocupada.')
    }
    tx.delete(tableRef)
    return { tableId }
  }

  if (type === 'saveProduct') {
    const p = payload.product || payload
    const productId = id(p.id || `prod_${operationId}`)
    const productRef = root.collection('nightclubProducts').doc(productId)
    const data = {
      id: productId,
      tenantId: actor.tenantId,
      branchId,
      name: text(p.name, 100),
      category: text(p.category || 'General', 50),
      price: amount(p.price),
      preparationArea: p.preparationArea === 'Directo' ? 'Directo' : 'Barra',
      stockUnits: Number(p.stockUnits) || 0,
      inventoryMode: ['unit', 'recipe', 'none'].includes(p.inventoryMode) ? p.inventoryMode : 'recipe',
      active: p.active !== false,
      ...(p.inventoryId ? { inventoryId: id(p.inventoryId) } : {}),
      ...(Array.isArray(p.recipe) ? { recipe: p.recipe } : {}),
      ...(p.bottlePresentation ? { bottlePresentation: p.bottlePresentation } : {}),
      ...(p.commission ? { commission: p.commission } : {}),
      updatedAt: now,
    }
    tx.set(productRef, data, { merge: true })
    return { productId, product: data }
  }

  if (type === 'saveInventory') {
    const item = payload.item || payload
    const inventoryId = id(item.id || `inv_${operationId}`)
    const invRef = root.collection('nightclubInventory').doc(inventoryId)
    const existing = await tx.get(invRef)
    const current = item.current !== undefined ? amount(item.current) : (existing.exists ? existing.data().current : 0)
    const data = {
      id: inventoryId,
      tenantId: actor.tenantId,
      branchId,
      name: text(item.name, 100),
      unit: ['unit', 'ml', 'g', 'l', 'kg'].includes(item.unit) ? item.unit : 'unit',
      displayUnit: item.displayUnit || item.unit || 'unit',
      current,
      minimum: Number(item.minimum) || 0,
      unitCost: Number(item.unitCost) || 0,
      category: item.category || 'Insumos',
      bottleCapacityMl: Number(item.bottleCapacityMl) || 0,
      openBottleMl: Number(item.openBottleMl) || 0,
      linkedProductIds: Array.isArray(item.linkedProductIds) ? item.linkedProductIds : [],
      updatedAt: now,
    }
    tx.set(invRef, data, { merge: true })
    return { inventoryId, item: data }
  }

  if (type === 'saveCustomer') {
    const c = payload.customer || payload
    const customerId = id(c.id || `cust_${operationId}`)
    const custRef = root.collection('nightclubCustomers').doc(customerId)
    const existing = await tx.get(custRef)
    const data = {
      id: customerId,
      tenantId: actor.tenantId,
      branchId,
      name: text(c.name, 100),
      phone: typeof c.phone === 'string' ? c.phone.trim() : '',
      birthday: typeof c.birthday === 'string' ? c.birthday.trim() : '',
      notes: typeof c.notes === 'string' ? c.notes.trim() : '',
      active: c.active !== false,
      visits: existing.exists ? (existing.data().visits || 0) : (Number(c.visits) || 0),
      totalSpent: existing.exists ? (existing.data().totalSpent || 0) : (Number(c.totalSpent) || 0),
      updatedAt: now,
    }
    tx.set(custRef, data, { merge: true })
    return { customerId, customer: data }
  }

  if (type === 'saveReservation') {
    const r = payload.reservation || payload.draft || payload
    const reservationId = id(r.id || `res_${operationId}`)
    const tableId = id(r.tableId)
    const tableRef = root.collection('nightclubTables').doc(tableId)
    const tableSnap = await tx.get(tableRef)
    if (!tableSnap.exists || tableSnap.data().branchId !== branchId) {
      throw new HttpsError('not-found', 'La mesa seleccionada no existe.')
    }
    const table = tableSnap.data()
    const reservationDate = text(r.reservationDate, 10)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(reservationDate)) {
      throw new HttpsError('invalid-argument', 'Fecha de reserva inválida (YYYY-MM-DD).')
    }
    const time = text(r.time, 5)
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) {
      throw new HttpsError('invalid-argument', 'Hora de reserva inválida (HH:mm).')
    }
    const customerName = text(r.customerName, 100)
    const guests = Number(r.guests)
    if (!Number.isInteger(guests) || guests < 1 || guests > (table.capacity || 100)) {
      throw new HttpsError('invalid-argument', `La reserva admite entre 1 y ${table.capacity || 100} personas.`)
    }

    const existingResQuery = await tx.get(
      root.collection('nightclubReservations')
        .where('tableId', '==', tableId)
        .where('branchId', '==', branchId)
    )
    const duplicateRes = existingResQuery.docs.find(doc => {
      if (doc.id === reservationId) return false
      const data = doc.data()
      return data.status === 'confirmed' && data.reservationDate === reservationDate
    })
    if (duplicateRes) {
      throw new HttpsError('failed-precondition', 'La mesa ya tiene una reserva confirmada para esa fecha.')
    }

    const existingLounges = await tx.get(
      root.collection('nightclubPromoterLoungeSales')
        .where('loungeId', '==', tableId)
        .where('branchId', '==', branchId)
    )
    const duplicateLounge = existingLounges.docs.find(doc => {
      const data = doc.data()
      const lDate = data.reservationDate || data.eventDate
      return lDate === reservationDate && ['reserved', 'paid'].includes(data.status)
    })
    if (duplicateLounge) {
      throw new HttpsError('failed-precondition', 'La mesa ya está reservada o vendida para esa fecha.')
    }

    if (table.activeAccountId || table.status === 'occupied' || table.status === 'bill_requested') {
      throw new HttpsError('failed-precondition', 'La mesa ya tiene una cuenta activa.')
    }

    const resRef = root.collection('nightclubReservations').doc(reservationId)
    const prevRes = await tx.get(resRef)
    const resData = {
      id: reservationId,
      tenantId: actor.tenantId,
      branchId,
      tableId,
      customerName,
      reservationDate,
      time,
      guests,
      status: 'confirmed',
      phone: typeof r.phone === 'string' ? r.phone.trim() : '',
      notes: typeof r.notes === 'string' ? r.notes.trim() : '',
      ...(r.customerId ? { customerId: id(r.customerId) } : {}),
      createdAt: prevRes.exists ? prevRes.data().createdAt : now,
      updatedAt: now,
    }
    tx.set(resRef, resData, { merge: true })
    if (table.status === 'available') {
      tx.update(tableRef, { status: 'reserved', reservationName: customerName, updatedAt: now })
    }
    return { reservationId, reservation: resData }
  }

  if (type === 'cancelReservation') {
    const reservationId = id(payload.id || payload.reservationId)
    const resRef = root.collection('nightclubReservations').doc(reservationId)
    const resSnap = await tx.get(resRef)
    if (!resSnap.exists || resSnap.data().branchId !== branchId) {
      throw new HttpsError('not-found', 'Reserva no encontrada.')
    }
    const resData = resSnap.data()
    if (resData.status !== 'confirmed') {
      throw new HttpsError('failed-precondition', 'La reserva ya no está activa.')
    }
    tx.update(resRef, { status: 'cancelled', cancelledAt: now, cancelledBy: actor.uid, updatedAt: now })
    const tableRef = root.collection('nightclubTables').doc(resData.tableId)
    const tableSnap = await tx.get(tableRef)
    if (tableSnap.exists && !tableSnap.data().activeAccountId && tableSnap.data().status === 'reserved') {
      tx.update(tableRef, { status: 'available', reservationName: null, updatedAt: now })
    }
    return { reservationId, status: 'cancelled' }
  }

  if (type === 'savePromoter') {
    const p = payload.promoter || payload
    const promoterId = id(p.id || `promoter_${operationId}`)
    const name = text(p.name, 120)
    const phone = typeof p.phone === 'string' ? p.phone.trim() : ''
    if (phone.length > 40) throw new HttpsError('invalid-argument', 'Teléfono demasiado largo.')
    const joinedAt = text(p.joinedAt, 10)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(joinedAt)) throw new HttpsError('invalid-argument', 'Fecha de ingreso inválida.')
    const birthday = typeof p.birthday === 'string' && p.birthday.trim() ? p.birthday.trim() : null
    const document = typeof p.document === 'string' && p.document.trim() ? p.document.trim() : null
    const active = p.active !== false

    const allPromoters = await tx.get(
      root.collection('nightclubPromoters')
        .where('branchId', '==', branchId)
    )
    const duplicate = allPromoters.docs.find(doc => {
      if (doc.id === promoterId) return false
      const data = doc.data()
      return data.name.toLowerCase() === name.toLowerCase() && phone && data.phone === phone
    })
    if (duplicate) throw new HttpsError('already-exists', 'Ya existe un relacionador con ese nombre y teléfono.')

    const promRef = root.collection('nightclubPromoters').doc(promoterId)
    const prev = await tx.get(promRef)
    const promData = {
      id: promoterId,
      tenantId: actor.tenantId,
      branchId,
      name,
      phone,
      joinedAt,
      active,
      ...(birthday ? { birthday } : {}),
      ...(document ? { document } : {}),
      createdAt: prev.exists ? prev.data().createdAt : now,
      updatedAt: now,
    }
    tx.set(promRef, promData, { merge: true })
    return { promoterId, promoter: promData }
  }

  if (type === 'deletePromoter') {
    const promoterId = id(payload.id || payload.promoterId)
    const promRef = root.collection('nightclubPromoters').doc(promoterId)
    const promSnap = await tx.get(promRef)
    if (!promSnap.exists || promSnap.data().branchId !== branchId) {
      throw new HttpsError('not-found', 'Relacionador no encontrado.')
    }
    const [ticketSales, loungeSales, consumptions] = await Promise.all([
      tx.get(root.collection('nightclubPromoterTicketSales').where('promoterId', '==', promoterId).where('branchId', '==', branchId).limit(1)),
      tx.get(root.collection('nightclubPromoterLoungeSales').where('promoterId', '==', promoterId).where('branchId', '==', branchId).limit(1)),
      tx.get(root.collection('nightclubPromoterConsumptions').where('promoterId', '==', promoterId).where('branchId', '==', branchId).limit(1)),
    ])
    if (!ticketSales.empty || !loungeSales.empty || !consumptions.empty) {
      throw new HttpsError('failed-precondition', 'Tiene movimientos. Desactívalo para conservar la trazabilidad.')
    }
    tx.delete(promRef)
    return { promoterId }
  }

  if (type === 'savePromoterEvent') {
    const ev = payload.event || payload
    const eventId = id(ev.id || `event_${operationId}`)
    const name = text(ev.name, 120)
    const date = text(ev.date, 10)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new HttpsError('invalid-argument', 'Fecha de evento inválida.')
    const status = ev.status
    if (!['planned', 'open', 'closed'].includes(status)) throw new HttpsError('invalid-argument', 'Estado de evento inválido.')

    const allEvents = await tx.get(
      root.collection('nightclubPromoterEvents')
        .where('branchId', '==', branchId)
    )
    const duplicate = allEvents.docs.find(doc => doc.id !== eventId && doc.data().date === date && doc.data().name.toLowerCase() === name.toLowerCase())
    if (duplicate) throw new HttpsError('already-exists', 'Ya existe una jornada con ese nombre y fecha.')

    const evRef = root.collection('nightclubPromoterEvents').doc(eventId)
    const prev = await tx.get(evRef)
    const evData = {
      id: eventId,
      tenantId: actor.tenantId,
      branchId,
      name,
      date,
      status,
      createdAt: prev.exists ? prev.data().createdAt : now,
      updatedAt: now,
    }
    tx.set(evRef, evData, { merge: true })
    return { eventId, event: evData }
  }

  if (type === 'saveTicketSale') {
    const s = payload.sale || payload
    const saleId = id(s.id || `sale_${operationId}`)
    const promoterId = id(s.promoterId)
    const promRef = root.collection('nightclubPromoters').doc(promoterId)
    const promSnap = await tx.get(promRef)
    if (!promSnap.exists || promSnap.data().branchId !== branchId) {
      throw new HttpsError('not-found', 'Relacionador no encontrado.')
    }
    const saleRef = root.collection('nightclubPromoterTicketSales').doc(saleId)
    const prevSale = await tx.get(saleRef)
    if (!prevSale.exists && !promSnap.data().active) {
      throw new HttpsError('failed-precondition', 'El relacionador está inactivo.')
    }

    let linkedEvent = null
    if (s.eventId) {
      const eventSnap = await tx.get(root.collection('nightclubPromoterEvents').doc(id(s.eventId)))
      if (!eventSnap.exists || eventSnap.data().branchId !== branchId) {
        throw new HttpsError('not-found', 'La jornada seleccionada no existe.')
      }
      linkedEvent = eventSnap.data()
      if (!prevSale.exists && linkedEvent.status === 'closed') {
        throw new HttpsError('failed-precondition', 'La jornada está cerrada.')
      }
    }
    const eventDate = linkedEvent?.date || text(s.eventDate, 10)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(eventDate)) throw new HttpsError('invalid-argument', 'Fecha de evento inválida.')
    const eventName = linkedEvent?.name || (s.eventName ? text(s.eventName, 120) : null)
    const ticketType = text(s.ticketType, 60)
    const quantity = Number(s.quantity)
    const unitPrice = Number(s.unitPrice)
    if (!Number.isInteger(quantity) || quantity <= 0 || quantity > 10000 || !Number.isFinite(unitPrice) || unitPrice < 0) {
      throw new HttpsError('invalid-argument', 'Revisa tipo, cantidad y precio de entradas.')
    }
    const status = s.status
    if (!['pending', 'paid', 'cancelled'].includes(status)) throw new HttpsError('invalid-argument', 'Estado de venta inválido.')
    const total = money(quantity * unitPrice)

    let corrections = prevSale.exists ? (prevSale.data().corrections || []) : []
    if (prevSale.exists) {
      const reason = typeof s.correctionReason === 'string' ? s.correctionReason.trim() : ''
      if (reason.length < 4) throw new HttpsError('invalid-argument', 'Indica el motivo de la corrección.')
      const prevData = prevSale.data()
      corrections = [...corrections, {
        at: now,
        actor: actor.uid,
        reason,
        previous: {
          eventId: prevData.eventId || null,
          eventName: prevData.eventName || null,
          eventDate: prevData.eventDate,
          ticketType: prevData.ticketType,
          quantity: prevData.quantity,
          unitPrice: prevData.unitPrice,
          total: prevData.total,
          status: prevData.status,
        }
      }]
    }

    const saleData = {
      id: saleId,
      tenantId: actor.tenantId,
      branchId,
      promoterId,
      ...(s.eventId ? { eventId: id(s.eventId) } : {}),
      ...(eventName ? { eventName } : {}),
      eventDate,
      ticketType,
      quantity,
      unitPrice: money(unitPrice),
      total,
      status,
      operationId,
      createdAt: prevSale.exists ? prevSale.data().createdAt : now,
      createdBy: prevSale.exists ? prevSale.data().createdBy : actor.uid,
      ...(prevSale.exists ? { updatedAt: now, updatedBy: actor.uid, corrections } : {}),
    }
    tx.set(saleRef, saleData, { merge: true })
    return { saleId, total, status }
  }

  if (type === 'saveLoungeSale') {
    const s = payload.loungeSale || payload.sale || payload
    const saleId = id(s.id || `lounge_${operationId}`)
    const promoterId = id(s.promoterId)
    const promRef = root.collection('nightclubPromoters').doc(promoterId)
    const promSnap = await tx.get(promRef)
    if (!promSnap.exists || promSnap.data().branchId !== branchId) {
      throw new HttpsError('not-found', 'Relacionador no encontrado.')
    }
    const saleRef = root.collection('nightclubPromoterLoungeSales').doc(saleId)
    const prevSale = await tx.get(saleRef)
    if (!prevSale.exists && !promSnap.data().active) {
      throw new HttpsError('failed-precondition', 'El relacionador está inactivo.')
    }
    if (prevSale.exists && prevSale.data().promoterId !== promoterId) {
      throw new HttpsError('failed-precondition', 'No puedes cambiar el relacionador de una venta registrada.')
    }
    const reservationDate = text(s.reservationDate, 10)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(reservationDate)) throw new HttpsError('invalid-argument', 'Fecha de reserva inválida.')
    const loungeId = id(s.loungeId)
    const tableRef = root.collection('nightclubTables').doc(loungeId)
    const tableSnap = await tx.get(tableRef)
    if (!tableSnap.exists || tableSnap.data().branchId !== branchId) {
      throw new HttpsError('not-found', 'Selecciona una mesa existente en Zonas.')
    }
    const table = tableSnap.data()
    const price = Number(s.agreedPrice)
    if (!Number.isFinite(price) || price < 0) throw new HttpsError('invalid-argument', 'Ingresa un precio acordado válido.')
    const status = s.status
    if (!['reserved', 'paid', 'cancelled'].includes(status)) throw new HttpsError('invalid-argument', 'Estado de lounge inválido.')

    if (status !== 'cancelled') {
      const otherLounges = await tx.get(
        root.collection('nightclubPromoterLoungeSales')
          .where('loungeId', '==', loungeId)
          .where('branchId', '==', branchId)
      )
      const duplicateLounge = otherLounges.docs.find(doc => {
        if (doc.id === saleId) return false
        const d = doc.data()
        const lDate = d.reservationDate || d.eventDate
        return lDate === reservationDate && ['reserved', 'paid'].includes(d.status)
      })
      if (duplicateLounge) {
        throw new HttpsError('failed-precondition', 'Esta mesa ya está reservada o vendida para la fecha.')
      }

      const otherReservations = await tx.get(
        root.collection('nightclubReservations')
          .where('tableId', '==', loungeId)
          .where('branchId', '==', branchId)
      )
      const duplicateRes = otherReservations.docs.find(doc => doc.data().status === 'confirmed' && doc.data().reservationDate === reservationDate)
      if (duplicateRes) {
        throw new HttpsError('failed-precondition', 'La mesa no está disponible para esta fecha.')
      }

      if (table.activeAccountId || table.status === 'occupied' || table.status === 'bill_requested') {
        throw new HttpsError('failed-precondition', 'La mesa no está disponible para esta fecha.')
      }
    }

    let customerName = null
    if (s.customerId) {
      const custSnap = await tx.get(root.collection('nightclubCustomers').doc(id(s.customerId)))
      if (custSnap.exists) customerName = custSnap.data().name
    }

    let corrections = prevSale.exists ? (prevSale.data().corrections || []) : []
    if (prevSale.exists) {
      const reason = typeof s.correctionReason === 'string' ? s.correctionReason.trim() : ''
      if (reason.length < 4) throw new HttpsError('invalid-argument', 'Indica el motivo de la corrección.')
      const prevData = prevSale.data()
      corrections = [...corrections, {
        at: now,
        actor: actor.uid,
        reason,
        kind: 'correction',
        previous: {
          eventId: prevData.eventId || null,
          eventDate: prevData.eventDate || null,
          reservationDate: prevData.reservationDate || prevData.eventDate,
          loungeId: prevData.loungeId,
          loungeName: prevData.loungeName,
          customerId: prevData.customerId || null,
          customerName: prevData.customerName || null,
          agreedPrice: prevData.agreedPrice,
          status: prevData.status,
        }
      }]
    }

    const loungeData = {
      id: saleId,
      tenantId: actor.tenantId,
      branchId,
      promoterId,
      ...(s.eventId ? { eventId: id(s.eventId) } : {}),
      eventDate: reservationDate,
      reservationDate,
      loungeId: table.id,
      loungeName: table.name,
      ...(s.customerId ? { customerId: id(s.customerId) } : {}),
      ...(customerName ? { customerName } : {}),
      agreedPrice: money(price),
      status,
      operationId,
      createdAt: prevSale.exists ? prevSale.data().createdAt : now,
      createdBy: prevSale.exists ? prevSale.data().createdBy : actor.uid,
      ...(prevSale.exists ? { updatedAt: now, updatedBy: actor.uid, corrections } : {}),
    }
    tx.set(saleRef, loungeData, { merge: true })
    if (status !== 'cancelled' && table.status === 'available') {
      tx.update(tableRef, { status: 'reserved', reservationName: promSnap.data().name, updatedAt: now })
    }
    return { saleId, loungeSaleId: saleId, status }
  }

  if (type === 'markLoungePaid') {
    const saleId = id(payload.saleId || payload.id || payload.loungeSaleId)
    const saleRef = root.collection('nightclubPromoterLoungeSales').doc(saleId)
    const saleSnap = await tx.get(saleRef)
    if (!saleSnap.exists || saleSnap.data().branchId !== branchId) {
      throw new HttpsError('not-found', 'La reserva no existe.')
    }
    const current = saleSnap.data()
    if (current.status === 'paid') throw new HttpsError('failed-precondition', 'El lounge ya se encuentra pagado.')
    if (current.status !== 'reserved') throw new HttpsError('failed-precondition', 'Solo una reserva pendiente puede marcarse como pagada.')

    const rDate = current.reservationDate || current.eventDate
    const otherLounges = await tx.get(
      root.collection('nightclubPromoterLoungeSales')
        .where('loungeId', '==', current.loungeId)
        .where('branchId', '==', branchId)
    )
    const duplicate = otherLounges.docs.find(doc => doc.id !== saleId && (doc.data().reservationDate || doc.data().eventDate) === rDate && doc.data().status !== 'cancelled')
    if (duplicate) throw new HttpsError('failed-precondition', 'Esta mesa ya tiene otra reserva para la fecha.')

    const previous = {
      eventId: current.eventId || null,
      eventDate: current.eventDate,
      reservationDate: current.reservationDate,
      loungeId: current.loungeId,
      loungeName: current.loungeName,
      customerId: current.customerId || null,
      customerName: current.customerName || null,
      agreedPrice: current.agreedPrice,
      status: current.status,
    }
    const corrections = [...(current.corrections || []), { at: now, actor: actor.uid, reason: '', kind: 'payment', previous }]
    tx.update(saleRef, { status: 'paid', paidAt: now, updatedAt: now, updatedBy: actor.uid, corrections })
    return { saleId, status: 'paid' }
  }

  if (type === 'savePromoterConsumption') {
    const c = payload.consumption || payload
    const consumptionId = id(c.id || `prom_cons_${operationId}`)
    const promoterId = id(c.promoterId)
    const promRef = root.collection('nightclubPromoters').doc(promoterId)
    const promSnap = await tx.get(promRef)
    if (!promSnap.exists || promSnap.data().branchId !== branchId) {
      throw new HttpsError('not-found', 'Relacionador no encontrado.')
    }
    if (!promSnap.data().active) throw new HttpsError('failed-precondition', 'El relacionador está inactivo.')
    const day = text(c.date, 10)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new HttpsError('invalid-argument', 'Fecha de consumo inválida.')
    const concept = text(c.concept, 150)
    const amt = Number(c.amount)
    if (!Number.isFinite(amt) || amt < 0) throw new HttpsError('invalid-argument', 'Monto de consumo inválido.')
    const kind = c.kind
    if (!['courtesy', 'own_purchase'].includes(kind)) throw new HttpsError('invalid-argument', 'Tipo de consumo inválido.')

    const consRef = root.collection('nightclubPromoterConsumptions').doc(consumptionId)
    const consData = {
      id: consumptionId,
      tenantId: actor.tenantId,
      branchId,
      promoterId,
      date: day,
      concept,
      amount: money(amt),
      kind,
      ...(c.notes ? { notes: text(c.notes, 200) } : {}),
      createdAt: now,
      createdBy: actor.uid,
    }
    tx.set(consRef, consData, { merge: true })
    return { consumptionId, consumption: consData }
  }

  // 3. Operaciones que requieren turno activo
  const state = await tx.get(stateRef), activeShiftId = state.data()?.activeShiftId
  if (!activeShiftId) throw new HttpsError('failed-precondition', 'No hay turno activo.')

  // Rondas cobradas de barra inmediata y reembolsos
  if (['settleRound', 'refundRound'].includes(type)) {
    return applyPaidRoundCommand({ ...context, activeShiftId })
  }

  // Apertura de Cuenta (Mesa o Barra)
  if (type === 'openAccount') {
    const target = payload.target
    if (!target || !['table', 'customer', 'bar'].includes(target.type)) throw new HttpsError('invalid-argument', 'Destino inválido.')
    let tableRef, storedTarget = target
    if (target.type === 'table') {
      tableRef = root.collection('nightclubTables').doc(id(target.tableId))
      const table = await tx.get(tableRef)
      if (!table.exists || table.data().branchId !== branchId || table.data().activeAccountId || table.data().status !== 'available') {
        throw new HttpsError('aborted', 'La mesa ya no está disponible.')
      }
    } else {
      if ('tableId' in target || (target.displayName !== undefined && (typeof target.displayName !== 'string' || target.displayName.trim().length > 100))) {
        throw new HttpsError('invalid-argument', 'Un pedido en barra no puede incluir una mesa ni un nombre inválido.')
      }
      storedTarget = { type: 'bar', ...(target.displayName?.trim() ? { displayName: target.displayName.trim() } : {}), ...(target.customerId ? { customerId: id(target.customerId) } : {}) }
    }
    const accountId = `account_${operationId}`, ref = root.collection('nightclubAccounts').doc(accountId)
    const value = { id: accountId, tenantId: actor.tenantId, branchId, shiftId: activeShiftId, serviceTarget: storedTarget, orderType: storedTarget.type === 'table' ? 'TABLE' : 'BAR', status: 'open', subtotal: 0, paidTotal: 0, balance: 0, roundCount: 0, openedAt: now, openedBy: actor.uid }
    tx.create(ref, value)
    if (tableRef) tx.update(tableRef, { activeAccountId: accountId, status: 'occupied', updatedAt: now })
    return { accountId }
  }

  // Llegada de Reserva (Transición atómica a cuenta y mesa ocupada)
  if (type === 'arriveReservation') {
    const reservationId = id(payload.id || payload.reservationId)
    const resRef = root.collection('nightclubReservations').doc(reservationId)
    const resSnap = await tx.get(resRef)
    if (!resSnap.exists || resSnap.data().branchId !== branchId) {
      throw new HttpsError('not-found', 'Reserva no encontrada.')
    }
    const resData = resSnap.data()
    if (resData.status !== 'confirmed') {
      throw new HttpsError('failed-precondition', 'La reserva ya no está activa o ya llegó.')
    }
    const tableRef = root.collection('nightclubTables').doc(resData.tableId)
    const tableSnap = await tx.get(tableRef)
    if (!tableSnap.exists || tableSnap.data().branchId !== branchId) {
      throw new HttpsError('not-found', 'La mesa de la reserva ya no existe.')
    }
    const table = tableSnap.data()
    if (table.activeAccountId || table.status === 'occupied' || table.status === 'bill_requested') {
      throw new HttpsError('failed-precondition', 'La mesa ya tiene una cuenta activa.')
    }
    const accountId = `account_${operationId}`
    const accountRef = root.collection('nightclubAccounts').doc(accountId)
    const storedTarget = { type: 'table', tableId: table.id }
    const accountValue = {
      id: accountId,
      tenantId: actor.tenantId,
      branchId,
      shiftId: activeShiftId,
      tableId: table.id,
      serviceTarget: storedTarget,
      orderType: 'TABLE',
      status: 'open',
      subtotal: 0,
      paidTotal: 0,
      balance: 0,
      roundCount: 0,
      openedAt: now,
      openedBy: actor.uid,
      customerDisplayName: resData.customerName,
      tableNameSnapshot: table.name,
      guestCount: resData.guests || 2,
      ...(resData.customerId ? { customerId: resData.customerId } : {}),
    }
    tx.create(accountRef, accountValue)
    tx.update(tableRef, { activeAccountId: accountId, status: 'occupied', reservationName: null, updatedAt: now })
    tx.update(resRef, { status: 'arrived', arrivedAt: now, arrivedBy: actor.uid, accountId, updatedAt: now })
    return { reservationId, accountId }
  }


  // Flujo Canónico: Agregar Ronda sin exigir pago inmediato
  if (type === 'addRound') {
    const accountId = id(payload.accountId), accountRef = root.collection('nightclubAccounts').doc(accountId)
    const accountSnap = await tx.get(accountRef)
    if (!accountSnap.exists || accountSnap.data().branchId !== branchId) throw new HttpsError('not-found', 'Cuenta no encontrada.')
    const account = accountSnap.data()
    if (account.status !== 'open') throw new HttpsError('aborted', 'La cuenta ya no acepta rondas.')
    const drafts = payload.items
    if (!Array.isArray(drafts) || !drafts.length || drafts.length > 50 || drafts.some(item => !Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 999)) {
      throw new HttpsError('invalid-argument', 'Pedido inválido.')
    }
    const productIds = [...new Set(drafts.map(item => id(item.productId)))]
    const productSnaps = await Promise.all(productIds.map(productId => tx.get(root.collection('nightclubProducts').doc(productId))))
    const products = new Map(productSnaps.map((snap, index) => [productIds[index], snap.data()]))
    const requirements = new Map()
    let total = 0
    const lines = drafts.map((draft, index) => {
      const product = products.get(draft.productId)
      if (!product || product.branchId !== branchId || product.active === false || !Number.isFinite(product.price) || product.price < 0) {
        throw new HttpsError('invalid-argument', 'Producto inválido o sin precio configurado.')
      }
      const recipe = product.inventoryMode === 'none' ? [] : (product.recipe?.length ? product.recipe : (product.inventoryId ? [{ inventoryId: product.inventoryId, quantity: 1 }] : (product.bottlePresentation?.inventoryId ? [{ inventoryId: product.bottlePresentation.inventoryId, quantity: 1 }] : [])))
      for (const part of recipe) {
        if (!Number.isFinite(part.quantity) || part.quantity <= 0) throw new HttpsError('invalid-argument', 'Receta inválida.')
        const inventoryId = id(part.inventoryId)
        requirements.set(inventoryId, (requirements.get(inventoryId) || 0) + part.quantity * draft.quantity)
      }
      const lineTotal = money(product.price * draft.quantity)
      total += lineTotal
      return {
        id: `${operationId}_${index}`,
        productId: draft.productId,
        name: product.name,
        quantity: draft.quantity,
        unitPrice: product.price,
        lineTotal,
        preparationArea: product.preparationArea || 'Barra',
      }
    })
    total = money(total)
    const inventoryIds = [...requirements.keys()]
    const inventoryRefs = inventoryIds.map(inventoryId => root.collection('nightclubInventory').doc(inventoryId))
    const stocks = await Promise.all(inventoryRefs.map(ref => tx.get(ref)))
    stocks.forEach((snap, index) => {
      if (!snap.exists || snap.data().branchId !== branchId || !Number.isFinite(snap.data().current) || snap.data().current < requirements.get(inventoryIds[index])) {
        throw new HttpsError('aborted', `Stock insuficiente o insumo no configurado: ${snap.data()?.name || inventoryIds[index]}.`)
      }
    })
    const roundId = `round_${operationId}`
    const hasBar = lines.some(item => item.preparationArea !== 'Directo')
    const status = hasBar ? 'pending' : 'ready'
    const consumption = []
    stocks.forEach((snap, index) => {
      const inventoryId = inventoryIds[index]
      const quantity = requirements.get(inventoryId)
      const previous = snap.data().current
      const current = money(previous - quantity)
      tx.update(inventoryRefs[index], { current, updatedAt: now })
      tx.create(root.collection('nightclubInventoryMovements').doc(`${operationId}_${inventoryId}`), {
        id: `${operationId}_${inventoryId}`,
        operationId,
        tenantId: actor.tenantId,
        branchId,
        shiftId: activeShiftId,
        accountId,
        roundId,
        inventoryId,
        quantity: -quantity,
        previous,
        current,
        type: 'sale',
        actorUid: actor.uid,
        createdAt: now,
      })
      consumption.push({ inventoryId, quantity })
    })
    tx.create(root.collection('nightclubRounds').doc(roundId), {
      id: roundId,
      operationId,
      tenantId: actor.tenantId,
      branchId,
      shiftId: activeShiftId,
      accountId,
      tableId: account.serviceTarget?.type === 'table' ? account.serviceTarget.tableId : null,
      sequence: (account.roundCount || 0) + 1,
      items: lines,
      consumption,
      total,
      status,
      authorization: 'account_charge',
      createdAt: now,
      sentAt: now,
      readyAt: hasBar ? null : now,
      createdBy: actor.uid,
      customerId: payload.customerId || null,
      serviceStaffId: payload.serviceStaffId || null,
    })
    tx.update(accountRef, {
      subtotal: money((account.subtotal || 0) + total),
      balance: money((account.balance || 0) + total),
      roundCount: (account.roundCount || 0) + 1,
      updatedAt: now,
    })
    return { accountId, roundId, total, status }
  }

  // Barra: Pendiente -> Preparando -> Listo
  if (type === 'advanceRound') {
    const accountId = id(payload.accountId), roundId = id(payload.roundId)
    const ref = root.collection('nightclubRounds').doc(roundId)
    const round = await tx.get(ref)
    if (!round.exists || round.data().branchId !== branchId || round.data().accountId !== accountId) {
      throw new HttpsError('aborted', 'Ronda no encontrada en esta cuenta.')
    }
    const r = round.data()
    if (!['payment', 'account_charge', 'courtesy'].includes(r.authorization) || !['pending', 'preparing'].includes(r.status)) {
      throw new HttpsError('failed-precondition', 'Solo se preparan pedidos autorizados pendientes o en preparación.')
    }
    const next = r.status === 'pending' ? 'preparing' : 'ready'
    tx.update(ref, {
      status: next,
      [next === 'preparing' ? 'startedAt' : 'readyAt']: now,
      [next === 'preparing' ? 'startedBy' : 'readyBy']: actor.uid,
      updatedAt: now,
    })
    return { accountId, roundId, status: next }
  }

  // Servicio: Listo -> Entregado
  if (type === 'deliverRound') {
    const accountId = id(payload.accountId), roundId = id(payload.roundId)
    const ref = root.collection('nightclubRounds').doc(roundId)
    const round = await tx.get(ref)
    if (!round.exists || round.data().branchId !== branchId || round.data().accountId !== accountId) {
      throw new HttpsError('aborted', 'Ronda no encontrada en esta cuenta.')
    }
    const r = round.data()
    if (!['payment', 'account_charge', 'courtesy'].includes(r.authorization) || r.status !== 'ready') {
      throw new HttpsError('failed-precondition', 'El pedido todavía no está listo para entrega.')
    }
    tx.update(ref, {
      status: 'delivered',
      deliveredAt: now,
      deliveredBy: actor.uid,
      updatedAt: now,
    })
    return { accountId, roundId, status: 'delivered' }
  }

  // Solicitar o Reabrir Cuenta
  if (type === 'requestBill' || type === 'reopenBill') {
    const accountId = id(payload.accountId), ref = root.collection('nightclubAccounts').doc(accountId)
    const snap = await tx.get(ref)
    const expected = type === 'requestBill' ? 'open' : 'bill_requested'
    if (!snap.exists || snap.data().branchId !== branchId || snap.data().status !== expected) {
      throw new HttpsError('aborted', 'La cuenta cambió de estado.')
    }
    const status = type === 'requestBill' ? 'bill_requested' : 'open'
    tx.update(ref, { status, updatedAt: now })
    const target = snap.data().serviceTarget
    if (target?.type === 'table') {
      tx.update(root.collection('nightclubTables').doc(id(target.tableId)), { status: status === 'open' ? 'occupied' : 'bill_requested', updatedAt: now })
    }
    return { accountId, status }
  }

  // Registro de Pagos (Parciales o Totales) en Caja
  if (type === 'recordPayment') {
    const accountId = id(payload.accountId)
    const ref = root.collection('nightclubAccounts').doc(accountId)
    const snap = await tx.get(ref)
    if (!snap.exists || snap.data().branchId !== branchId) throw new HttpsError('not-found', 'Cuenta no encontrada.')
    if (snap.data().status !== 'bill_requested') throw new HttpsError('aborted', 'La cuenta no está por cobrar.')
    const balance = amount(snap.data().balance)
    if (balance <= 0) throw new HttpsError('failed-precondition', 'La cuenta no tiene saldo pendiente.')
    const paid = amount(payload.amount)
    const method = text(payload.method, 20)
    if (paid <= 0 || paid > balance || !['cash', 'qr', 'card', 'mixed'].includes(method)) {
      throw new HttpsError('invalid-argument', 'Pago inválido.')
    }
    const cashAmount = amount(method === 'cash' ? paid : method === 'mixed' ? payload.cashAmount || 0 : 0)
    const qrAmount = amount(method === 'qr' ? paid : method === 'mixed' ? payload.qrAmount || 0 : 0)
    const cardAmount = amount(method === 'card' ? paid : method === 'mixed' ? payload.cardAmount || 0 : 0)
    if (money(cashAmount + qrAmount + cardAmount) !== paid) {
      throw new HttpsError('invalid-argument', 'El desglose del pago no coincide.')
    }
    const received = amount(payload.received ?? cashAmount)
    if (received < cashAmount) throw new HttpsError('invalid-argument', 'Efectivo recibido insuficiente.')
    const remaining = money(balance - paid)
    const paymentId = `payment_${operationId}`
    tx.create(root.collection('nightclubPayments').doc(paymentId), {
      id: paymentId,
      operationId,
      tenantId: actor.tenantId,
      branchId,
      shiftId: activeShiftId,
      accountId,
      status: 'confirmed',
      method,
      amount: paid,
      cashAmount,
      qrAmount,
      cardAmount,
      received,
      change: money(received - cashAmount),
      createdAt: now,
      actorUid: actor.uid,
    })
    if (cashAmount > 0) {
      const movementId = `cash_${operationId}`
      tx.create(root.collection('nightclubCashMovements').doc(movementId), {
        id: movementId,
        operationId,
        tenantId: actor.tenantId,
        branchId,
        shiftId: activeShiftId,
        accountId,
        type: 'sale',
        amount: cashAmount,
        actorUid: actor.uid,
        createdAt: now,
      })
    }
    tx.update(ref, {
      paidTotal: money((snap.data().paidTotal || 0) + paid),
      balance: remaining,
      updatedAt: now,
    })
    return { accountId, paymentId, amount: paid, balance: remaining }
  }

  // Finalizar Ocupación: saldo 0 + rondas entregadas/anuladas -> liberar mesa
  if (type === 'finishOccupancy') {
    const accountId = id(payload.accountId)
    const accountRef = root.collection('nightclubAccounts').doc(accountId)
    const account = await tx.get(accountRef)
    if (!account.exists || account.data().branchId !== branchId) {
      throw new HttpsError('aborted', 'Cuenta no encontrada.')
    }
    const acc = account.data()
    if (!['open', 'bill_requested'].includes(acc.status) || cents(acc.balance || 0) !== 0) {
      throw new HttpsError('failed-precondition', 'La mesa tiene saldo o ya está cerrada.')
    }
    const rounds = await tx.get(root.collection('nightclubRounds').where('accountId', '==', accountId))
    if (rounds.docs.some(snap => !['delivered', 'cancelled'].includes(snap.data().status))) {
      throw new HttpsError('failed-precondition', 'Hay pedidos pendientes de entrega.')
    }
    const target = acc.serviceTarget
    if (target?.type === 'table') {
      const tableRef = root.collection('nightclubTables').doc(id(target.tableId))
      const table = await tx.get(tableRef)
      if (table.data()?.activeAccountId !== accountId) {
        throw new HttpsError('failed-precondition', 'La mesa no coincide con la ocupación.')
      }
      tx.update(tableRef, { status: 'available', activeAccountId: null, updatedAt: now })
    }
    tx.update(accountRef, { status: 'closed', closedAt: now, closedBy: actor.uid, updatedAt: now })
    return { accountId, status: 'closed' }
  }

  // Anulación de Ronda No Cobrada
  if (type === 'cancelRound') {
    const roundId = id(payload.roundId)
    const ref = root.collection('nightclubRounds').doc(roundId)
    const round = await tx.get(ref)
    if (!round.exists || round.data().branchId !== branchId) throw new HttpsError('not-found', 'Ronda no encontrada.')
    if (round.data().status === 'cancelled') return { roundId, status: 'cancelled' }
    text(payload.reason, 200)
    const accountRef = root.collection('nightclubAccounts').doc(round.data().accountId)
    const account = await tx.get(accountRef)
    if ((account.data()?.paidTotal || 0) > 0 && account.data()?.balance < round.data().total) {
      throw new HttpsError('failed-precondition', 'No se anula directamente una ronda ya cobrada. Usa reembolso.')
    }
    const refs = (round.data().consumption || []).map(row => root.collection('nightclubInventory').doc(row.inventoryId))
    const stocks = await Promise.all(refs.map(r => tx.get(r)))
    refs.forEach((stockRef, index) => {
      const consumed = round.data().consumption[index]
      const before = stocks[index].data().current
      const current = money(before + consumed.quantity)
      tx.update(stockRef, { current, updatedAt: now })
      tx.create(root.collection('nightclubInventoryMovements').doc(`${operationId}_${stockRef.id}`), {
        operationId,
        inventoryId: stockRef.id,
        quantity: consumed.quantity,
        previous: before,
        current,
        type: 'reversal',
        reason: payload.reason,
        actorUid: actor.uid,
        createdAt: now,
        tenantId: actor.tenantId,
        branchId,
      })
    })
    const total = money(round.data().total || round.data().items.reduce((sum, row) => sum + row.lineTotal, 0))
    tx.update(ref, {
      status: 'cancelled',
      cancelledAt: now,
      cancelledBy: actor.uid,
      cancellationReason: payload.reason,
      updatedAt: now,
    })
    tx.update(accountRef, {
      subtotal: money(Math.max(0, (account.data().subtotal || 0) - total)),
      balance: money(Math.max(0, (account.data().balance || 0) - total)),
      updatedAt: now,
    })
    return { roundId, status: 'cancelled' }
  }

  // Movimiento Manual de Inventario
  if (type === 'inventoryMovement') {
    const inventoryId = id(payload.inventoryId), ref = root.collection('nightclubInventory').doc(inventoryId)
    const snap = await tx.get(ref), quantity = Number(payload.quantity)
    if (!snap.exists || snap.data().branchId !== branchId || !Number.isFinite(quantity) || quantity === 0 || snap.data().current + quantity < 0) {
      throw new HttpsError('invalid-argument', 'Movimiento inválido.')
    }
    const current = money(snap.data().current + quantity), movementId = `movement_${operationId}`
    tx.update(ref, { current, updatedAt: now })
    tx.create(root.collection('nightclubInventoryMovements').doc(movementId), {
      id: movementId,
      operationId,
      tenantId: actor.tenantId,
      branchId,
      inventoryId,
      quantity,
      previous: snap.data().current,
      current,
      type: text(payload.movementType, 30),
      reason: text(payload.reason, 200),
      actorUid: actor.uid,
      createdAt: now,
    })
    return { movementId, current }
  }

  // Cierre de Turno Ciego
  if (type === 'closeShift') {
    const shiftId = id(payload.shiftId)
    if (shiftId !== activeShiftId) throw new HttpsError('aborted', 'El turno cambió.')
    const open = await tx.get(root.collection('nightclubAccounts').where('shiftId', '==', shiftId).where('status', 'in', ['open', 'bill_requested']))
    if (!open.empty) throw new HttpsError('failed-precondition', 'Existen cuentas con saldo.')
    if (payload.countedCash === '' || payload.countedCash == null) throw new HttpsError('invalid-argument', 'Ingresa el efectivo contado.')
    const countedCash = amount(payload.countedCash)
    const shiftRef = root.collection('nightclubShifts').doc(shiftId)
    const [shift, movements, payments] = await Promise.all([
      tx.get(shiftRef),
      tx.get(root.collection('nightclubCashMovements').where('shiftId', '==', shiftId)),
      tx.get(root.collection('nightclubPayments').where('shiftId', '==', shiftId)),
    ])
    if (!shift.exists || shift.data().status !== 'open' || shift.data().branchId !== branchId) throw new HttpsError('aborted', 'El turno cambió.')
    const expectedCents = Math.round((amount(shift.data().openingFloat) + Number.EPSILON) * 100) + movements.docs.reduce((tot, doc) => {
      const movement = doc.data()
      if (movement.method && movement.method !== 'cash') return tot
      const value = Number(movement.amount)
      if (!Number.isFinite(value)) throw new HttpsError('failed-precondition', 'Existe un movimiento de caja inválido.')
      const c = Math.round((Math.abs(value) + Number.EPSILON) * 100)
      return tot + (movement.type === 'expense' ? -c : movement.type === 'refund' ? -c : movement.type === 'sale' || movement.type === 'income' ? c : 0)
    }, 0)
    const differenceCents = Math.round((countedCash + Number.EPSILON) * 100) - expectedCents
    if (differenceCents < 0) throw new HttpsError('failed-precondition', `La caja tiene un faltante de Bs ${(Math.abs(differenceCents) / 100).toFixed(2)}. Corrige el arqueo antes de cerrar.`)
    const cashSales = money(payments.docs.filter(doc => doc.data().status !== 'refunded').reduce((sum, doc) => sum + amount(doc.data().cashAmount || 0), 0))
    const qrSales = money(payments.docs.filter(doc => doc.data().status !== 'refunded').reduce((sum, doc) => sum + amount(doc.data().qrAmount || 0), 0))
    const cardSales = money(payments.docs.filter(doc => doc.data().status !== 'refunded').reduce((sum, doc) => sum + amount(doc.data().cardAmount || 0), 0))
    const incomeTotal = money(movements.docs.filter(doc => doc.data().type === 'income').reduce((sum, doc) => sum + amount(doc.data().amount), 0))
    const expenseTotal = money(movements.docs.filter(doc => doc.data().type === 'expense').reduce((sum, doc) => sum + amount(doc.data().amount), 0))
    const cashIncome = money(movements.docs.filter(doc => (doc.data().type === 'income' || doc.data().type === 'sale') && (!doc.data().method || doc.data().method === 'cash')).reduce((sum, doc) => sum + amount(doc.data().amount), 0))
    const cashOutflow = money(movements.docs.filter(doc => doc.data().type === 'expense' && (!doc.data().method || doc.data().method === 'cash')).reduce((sum, doc) => sum + amount(doc.data().amount), 0))
    const totalSales = money(payments.docs.filter(doc => doc.data().status !== 'refunded').reduce((sum, doc) => sum + amount(doc.data().amount), 0))
    const difference = differenceCents / 100
    tx.update(shiftRef, { status: 'closed', countedCash, expectedCash: expectedCents / 100, difference, reconciliationStatus: differenceCents === 0 ? 'balanced' : 'surplus', totalSales, cashSales, qrSales, cardSales, incomeTotal, expenseTotal, cashIncome, cashOutflow, closedAt: now, closedBy: actor.uid })
    tx.set(stateRef, { activeShiftId: null, updatedAt: now }, { merge: true })
    return { shiftId, countedCash, expectedCash: expectedCents / 100, difference, openingFloat: shift.data().openingFloat }
  }

  throw new HttpsError('failed-precondition', 'Comando no implementado o sin política habilitada.')
}

module.exports = { executeNightclubCommand }
