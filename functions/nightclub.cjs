const { HttpsError } = require('firebase-functions/v2/https')
const { createHash } = require('node:crypto')
const { tenantActor, hasPermission } = require('./authorization.cjs')
const { applyPaidRoundCommand } = require('./nightclubPaidRounds.cjs')
const {
  planNightclubInventoryConsumption,
  calculateNightclubStockUpdates,
  applyNightclubStockUpdates,
  prepareNightclubInventoryReversal,
  applyNightclubInventoryReversal,
} = require('./nightclubInventoryHelper.cjs')

const id = value => {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_:-]{1,128}$/.test(value)) {
    throw new HttpsError('invalid-argument', 'Identificador inválido.')
  }
  return value
}

const CANONICAL_EXPENSE_CATEGORIES = [
  'supplies',
  'inventory_purchase',
  'payroll',
  'commissions',
  'services',
  'rent',
  'maintenance',
  'transport',
  'advertising',
  'cleaning',
  'security',
  'administrative',
  'other',
]

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
  saveCustomer: 'sales.create',
  saveReservation: 'sales.create',
  cancelReservation: 'sales.create',
  arriveReservation: 'sales.create',
  savePromoter: 'settings.manage',
  deletePromoter: 'settings.manage',
  savePromoterEvent: 'settings.manage',
  saveTicketSale: 'sales.create',
  saveLoungeSale: 'sales.create',
  markLoungePaid: 'sales.create',
  savePromoterConsumption: 'settings.manage',
  recordCashMovement: 'cash.close',
  saveBottleInventory: 'inventory.manage',
  openBottle: 'orders.manage',
  bottleExit: 'orders.manage',
  saveMember: 'settings.manage',
  registerCourtesy: 'orders.manage',
  cancelCourtesy: 'settings.manage',
  payCommissions: 'settings.manage',
  setCustomerStatus: 'settings.manage',
  saveCustomerIncident: 'settings.manage',
  deleteCustomerIncident: 'settings.manage',
  assignCustomer: 'orders.manage',
}

const money = value => Math.round((value + Number.EPSILON) * 100) / 100
const cents = value => Math.round(value * 100)
const amount = value => {
  const number = Number(value)
  if (!Number.isFinite(number) || number < 0) throw new HttpsError('invalid-argument', 'Monto inválido.')
  if (Math.abs(Math.round(number * 100) - number * 100) > 0.001) throw new HttpsError('invalid-argument', 'Centavos inválidos.')
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
    const roleId = member.data().roleId
    const ncPerms = Array.isArray(member.data().nightclubPermissions) ? member.data().nightclubPermissions : []
    const hasNc = perm => ncPerms.includes(perm)

    if (type === 'advanceRound' && !['owner', 'admin', 'bar'].includes(roleId) && !hasNc('bar.edit')) {
      throw new HttpsError('permission-denied', 'Solo Barra puede preparar pedidos.')
    }
    if (type === 'deliverRound' && !['owner', 'admin', 'waiter', 'service'].includes(roleId) && !hasNc('accounts.edit')) {
      throw new HttpsError('permission-denied', 'Solo Servicio puede entregar pedidos.')
    }
    if (type === 'finishOccupancy' && !['owner', 'admin', 'waiter', 'service'].includes(roleId) && !hasNc('accounts.edit')) {
      throw new HttpsError('permission-denied', 'Solo Servicio puede cerrar mesas.')
    }
    if (type === 'refundRound' && !['owner', 'admin'].includes(roleId) && !hasNc('special.approveOperations')) {
      throw new HttpsError('permission-denied', 'Solo Administración puede reembolsar.')
    }
    if (type === 'recordPayment' && !['owner', 'admin', 'cashier'].includes(roleId) && !hasNc('cash.create')) {
      throw new HttpsError('permission-denied', 'Solo Caja o Administración pueden registrar pagos.')
    }
    if (type === 'reopenBill' && !['owner', 'admin', 'cashier'].includes(roleId) && !hasNc('accounts.edit')) {
      throw new HttpsError('permission-denied', 'Solo Caja o Administración pueden reabrir la cuenta.')
    }
    if (['saveZone', 'deleteZone', 'saveTable', 'deleteTable'].includes(type) && !['owner', 'admin'].includes(roleId) && !hasNc('floor.create') && !hasNc('floor.delete')) {
      throw new HttpsError('permission-denied', 'Solo Administración puede configurar zonas y mesas.')
    }
    if (['saveProduct', 'saveInventory', 'inventoryMovement'].includes(type) && !['owner', 'admin', 'inventory'].includes(roleId) && !hasNc('inventory.edit') && !hasNc('products.create')) {
      throw new HttpsError('permission-denied', 'Solo Inventario o Administración pueden gestionar productos e insumos.')
    }
    if (['openShift', 'closeShift'].includes(type) && !['owner', 'admin', 'cashier'].includes(roleId) && !hasNc('special.closeCash')) {
      throw new HttpsError('permission-denied', 'Solo Caja o Administración pueden gestionar turnos.')
    }
    if (type === 'saveReservation' && !['owner', 'admin', 'cashier', 'waiter', 'service'].includes(roleId) && !hasNc('floor.create')) {
      throw new HttpsError('permission-denied', 'No tienes permiso para gestionar reservas.')
    }
    if (type === 'cancelReservation' && !['owner', 'admin', 'cashier'].includes(roleId) && !hasNc('floor.delete') && !hasNc('special.approveOperations')) {
      throw new HttpsError('permission-denied', 'Solo Administración o Caja pueden cancelar reservas.')
    }
    if (type === 'arriveReservation' && !['owner', 'admin', 'waiter', 'service', 'cashier'].includes(roleId) && !hasNc('floor.edit')) {
      throw new HttpsError('permission-denied', 'No tienes permiso para registrar la llegada de reservas.')
    }
    if (['savePromoter', 'deletePromoter', 'savePromoterEvent', 'savePromoterConsumption'].includes(type) && !['owner', 'admin'].includes(roleId) && !hasNc('promoters.edit')) {
      throw new HttpsError('permission-denied', 'Solo Administración puede gestionar relacionadores.')
    }
    if (['saveTicketSale', 'saveLoungeSale', 'markLoungePaid'].includes(type) && !['owner', 'admin', 'cashier'].includes(roleId) && !hasNc('promoters.create')) {
      throw new HttpsError('permission-denied', 'Solo Administración o Caja pueden registrar ventas de relacionadores.')
    }
    if (type === 'recordCashMovement' && !['owner', 'admin', 'cashier'].includes(roleId) && !hasNc('cash.create')) {
      throw new HttpsError('permission-denied', 'Solo Caja o Administración pueden registrar movimientos de caja.')
    }
    if (type === 'saveBottleInventory' && !['owner', 'admin', 'inventory'].includes(roleId) && !hasNc('inventory.create')) {
      throw new HttpsError('permission-denied', 'Solo Inventario o Administración pueden registrar botellas.')
    }
    if (['openBottle', 'bottleExit'].includes(type) && !['owner', 'admin', 'inventory', 'bar'].includes(roleId) && !hasNc('inventory.edit')) {
      throw new HttpsError('permission-denied', 'Solo Barra o Inventario pueden gestionar botellas abiertas.')
    }
    if (type === 'saveMember' && !['owner', 'admin'].includes(roleId) && !hasNc('members.create') && !hasNc('members.edit')) {
      throw new HttpsError('permission-denied', 'Solo Administración puede gestionar socios.')
    }
    if (type === 'registerCourtesy' && !['owner', 'admin', 'cashier', 'waiter', 'service'].includes(roleId) && !hasNc('members.create')) {
      throw new HttpsError('permission-denied', 'No tienes permiso para registrar cortesías.')
    }
    if (type === 'cancelCourtesy' && !['owner', 'admin'].includes(roleId) && !hasNc('members.delete')) {
      throw new HttpsError('permission-denied', 'Solo Administración puede anular cortesías.')
    }
    if (type === 'payCommissions' && !['owner', 'admin'].includes(roleId) && !hasNc('special.approveOperations')) {
      throw new HttpsError('permission-denied', 'Solo Administración puede pagar comisiones.')
    }
    if (['setCustomerStatus', 'saveCustomerIncident', 'deleteCustomerIncident'].includes(type) && !['owner', 'admin'].includes(roleId) && !hasNc('customers.delete')) {
      throw new HttpsError('permission-denied', 'Solo Administración puede gestionar incidentes y estado de clientes.')
    }
    if (type === 'assignCustomer' && !['owner', 'admin', 'waiter', 'service', 'cashier'].includes(roleId) && !hasNc('accounts.edit')) {
      throw new HttpsError('permission-denied', 'No tienes permiso para asignar clientes.')
    }

    const result = await applyCommand({ db, tx, root, actor, branchId, operationId, type, payload, now, member })
    tx.create(operationRef, { operationId, tenantId: actor.tenantId, branchId, actorUid: actor.uid, type, requestHash, status: 'confirmed', createdAt: now, result })
    tx.create(root.collection('nightclubAudit').doc(), { operationId, tenantId: actor.tenantId, branchId, actorUid: actor.uid, type, resourceId: result.accountId || result.roundId || result.shiftId || result.movementId || result.zoneId || result.tableId || result.productId || result.customerId || result.reservationId || result.promoterId || result.eventId || result.saleId || result.consumptionId || result.inventoryId || result.memberId || result.courtesyId || result.paymentId || result.incidentId || null, createdAt: now })
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
    if (existing.exists && existing.data().branchId !== branchId) throw new HttpsError('not-found', 'Cliente no encontrado en esta sucursal.')
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

  // 2b. N3B Operaciones de clientes, socios e inventario de botellas
  if (type === 'setCustomerStatus') {
    const customerId = id(payload.customerId || payload.id)
    const status = payload.status
    if (!['green', 'yellow', 'red'].includes(status)) throw new HttpsError('invalid-argument', 'Estado de convivencia inválido.')
    const custRef = root.collection('nightclubCustomers').doc(customerId)
    const custSnap = await tx.get(custRef)
    if (!custSnap.exists || custSnap.data().branchId !== branchId) throw new HttpsError('not-found', 'Cliente no encontrado en esta sucursal.')
    tx.update(custRef, { convivenciaStatus: status, updatedAt: now })
    return { customerId, status }
  }

  if (type === 'saveCustomerIncident') {
    const inc = payload.incident || payload
    const incidentId = id(inc.id || `incident_${operationId}`)
    const customerId = id(inc.customerId)
    const custRef = root.collection('nightclubCustomers').doc(customerId)
    const custSnap = await tx.get(custRef)
    if (!custSnap.exists || custSnap.data().branchId !== branchId) throw new HttpsError('not-found', 'Cliente no encontrado en esta sucursal.')
    const date = text(inc.date, 10)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new HttpsError('invalid-argument', 'Fecha de incidente inválida.')
    const severity = inc.severity
    if (!['low', 'medium', 'high'].includes(severity)) throw new HttpsError('invalid-argument', 'Gravedad inválida.')
    const description = text(inc.description, 1000)
    const incRef = root.collection('nightclubCustomerIncidents').doc(incidentId)
    const prevInc = await tx.get(incRef)
    const incData = {
      id: incidentId,
      tenantId: actor.tenantId,
      branchId,
      customerId,
      date,
      severity,
      description,
      responsibleUid: actor.uid,
      responsibleNameSnapshot: (context.member?.data()?.displayName) || actor.uid,
      createdAt: prevInc.exists ? prevInc.data().createdAt : now,
      updatedAt: now,
    }
    tx.set(incRef, incData, { merge: true })
    return { incidentId, incident: incData }
  }

  if (type === 'deleteCustomerIncident') {
    const incidentId = id(payload.incidentId || payload.id)
    const incRef = root.collection('nightclubCustomerIncidents').doc(incidentId)
    const incSnap = await tx.get(incRef)
    if (!incSnap.exists || incSnap.data().branchId !== branchId) throw new HttpsError('not-found', 'Incidente no encontrado.')
    tx.delete(incRef)
    return { incidentId }
  }

  if (type === 'saveMember') {
    const m = payload.member || payload
    const memberId = id(m.id || `member_${operationId}`)
    const name = text(m.name, 120)
    const quota = Number(m.quota)
    if (!Number.isInteger(quota) || quota < 0 || quota > 100000) throw new HttpsError('invalid-argument', 'Cupo de cortesías inválido.')
    const active = m.active !== false
    const policy = m.policy || {}
    const anchorAt = policy.anchorAt ? text(policy.anchorAt, 40) : (m.anchorAt ? text(m.anchorAt, 40) : now)
    const repeatDays = Number(policy.repeatDays ?? m.repeatDays ?? 7)
    const windowDays = Number(policy.windowDays ?? m.windowDays ?? 7)
    if (!Number.isInteger(repeatDays) || !Number.isInteger(windowDays) || repeatDays < 1 || windowDays < 1 || windowDays > repeatDays) {
      throw new HttpsError('invalid-argument', 'Período de cortesías inválido.')
    }
    const memRef = root.collection('nightclubMembers').doc(memberId)
    const prevSnap = await tx.get(memRef)
    const phone = typeof m.phone === 'string' ? m.phone.trim() : null
    const notes = typeof m.notes === 'string' ? m.notes.trim() : null
    const memberData = {
      id: memberId,
      tenantId: actor.tenantId,
      branchId,
      name,
      active,
      quota,
      phone: phone || null,
      notes: notes || null,
      policy: {
        anchorAt,
        repeatDays,
        windowDays,
      },
      createdAt: prevSnap.exists ? prevSnap.data().createdAt : now,
      updatedAt: now,
    }
    tx.set(memRef, memberData, { merge: true })
    return { memberId, member: memberData }
  }

  if (type === 'saveBottleInventory') {
    const draft = payload.draft || payload
    const invId = id(draft.id || `inv_${operationId}`)
    const name = text(draft.name, 120)
    const category = text(draft.category || 'Licores', 50)
    const closedBottles = Number(draft.closedBottles ?? draft.quantity ?? 0)
    if (!Number.isFinite(closedBottles) || closedBottles < 0) throw new HttpsError('invalid-argument', 'Cantidad de botellas inválida.')
    const minimum = Number(draft.minimum || 0)
    const cost = Number(draft.cost ?? draft.unitCost ?? 0)
    if (!Number.isFinite(cost) || cost < 0) throw new HttpsError('invalid-argument', 'Costo inválido.')
    const capacityMl = Number(draft.capacityMl || draft.bottleCapacityMl || 750)
    if (!Number.isFinite(capacityMl) || capacityMl <= 0) throw new HttpsError('invalid-argument', 'Contenido por botella inválido.')
    const sellBottle = draft.sellBottle === true
    const sellPour = draft.sellPour === true
    if (sellBottle && (!Number.isFinite(Number(draft.bottlePrice)) || Number(draft.bottlePrice) <= 0)) {
      throw new HttpsError('invalid-argument', 'Ingresa un precio para la botella.')
    }
    if (sellPour && (!Number.isFinite(Number(draft.pourPrice)) || Number(draft.pourPrice) <= 0)) {
      throw new HttpsError('invalid-argument', 'Ingresa un precio para el vaso.')
    }
    const invRef = root.collection('nightclubInventory').doc(invId)
    const prevSnap = await tx.get(invRef)
    const openBottleMl = prevSnap.exists ? (prevSnap.data().openBottleMl || 0) : 0
    let linkedProductIds = prevSnap.exists ? (prevSnap.data().linkedProductIds || []) : []

    const itemData = {
      id: invId,
      tenantId: actor.tenantId,
      branchId,
      name,
      category,
      unit: 'unit',
      current: closedBottles,
      minimum,
      unitCost: cost,
      bottleCapacityMl: capacityMl,
      openBottleMl,
      linkedProductIds,
      createdAt: prevSnap.exists ? prevSnap.data().createdAt : now,
      updatedAt: now,
    }

    if (sellBottle) {
      const bottleProdId = `presentation:${invId}:bottle`
      const bottleProd = {
        id: bottleProdId,
        tenantId: actor.tenantId,
        branchId,
        name: `${name} - Botella`,
        category,
        price: Number(draft.bottlePrice),
        preparationArea: 'Barra',
        stockUnits: closedBottles,
        inventoryMode: 'recipe',
        recipe: [{ inventoryId: invId, quantity: 1, unit: 'unit' }],
        active: true,
        bottlePresentation: { inventoryId: invId, kind: 'bottle' },
        ...(draft.bottleCommissionEnabled && Number(draft.bottleCommissionValue) > 0 ? {
          commission: {
            enabled: true,
            type: draft.bottleCommissionType || 'percentage',
            value: Number(draft.bottleCommissionValue),
          }
        } : {}),
        updatedAt: now,
      }
      tx.set(root.collection('nightclubProducts').doc(bottleProdId), bottleProd, { merge: true })
      if (!linkedProductIds.includes(bottleProdId)) linkedProductIds.push(bottleProdId)
    }

    if (sellPour) {
      const pourProdId = `presentation:${invId}:pour`
      const pourMl = Number(draft.pourMl || 50)
      const pourProd = {
        id: pourProdId,
        tenantId: actor.tenantId,
        branchId,
        name: `${name} - ${category === 'Refrescos' ? 'Jarra' : 'Vaso'}`,
        category,
        price: Number(draft.pourPrice),
        preparationArea: 'Barra',
        stockUnits: 0,
        inventoryMode: 'recipe',
        recipe: [{ inventoryId: invId, quantity: pourMl, unit: 'ml' }],
        active: true,
        bottlePresentation: { inventoryId: invId, kind: 'pour', millilitres: pourMl },
        updatedAt: now,
      }
      tx.set(root.collection('nightclubProducts').doc(pourProdId), pourProd, { merge: true })
      if (!linkedProductIds.includes(pourProdId)) linkedProductIds.push(pourProdId)
    }

    itemData.linkedProductIds = linkedProductIds
    tx.set(invRef, itemData, { merge: true })
    return { inventoryId: invId, item: itemData }
  }

  if (type === 'openBottle') {
    const inventoryId = id(payload.inventoryId || payload.id)
    const invRef = root.collection('nightclubInventory').doc(inventoryId)
    const snap = await tx.get(invRef)
    if (!snap.exists || snap.data().branchId !== branchId) throw new HttpsError('not-found', 'Botella no encontrada.')
    const stock = snap.data()
    if (!stock.bottleCapacityMl || stock.current < 1) throw new HttpsError('failed-precondition', 'No hay botellas cerradas disponibles.')
    if ((stock.openBottleMl || 0) > 0) throw new HttpsError('failed-precondition', 'Ya existe una botella abierta; registra primero su salida o consumo.')
    const previous = stock.current
    const current = money(previous - 1)
    const openBottleMl = stock.bottleCapacityMl
    tx.update(invRef, { current, openBottleMl, updatedAt: now })
    const movementId = `bottle_open_${operationId}`
    tx.create(root.collection('nightclubInventoryMovements').doc(movementId), {
      id: movementId,
      operationId,
      tenantId: actor.tenantId,
      branchId,
      inventoryId,
      quantity: -1,
      previous,
      current,
      type: 'bottle_opened',
      reason: 'Apertura manual de botella',
      openBottleMlBefore: 0,
      openBottleMlAfter: openBottleMl,
      actorUid: actor.uid,
      createdAt: now,
    })
    return { inventoryId, current, openBottleMl }
  }

  if (type === 'bottleExit') {
    const inventoryId = id(payload.inventoryId || payload.id)
    const ml = Number(payload.millilitres ?? payload.ml)
    if (!Number.isFinite(ml) || ml <= 0) throw new HttpsError('invalid-argument', 'Mililitros inválidos.')
    const exitType = payload.exitType || payload.type || 'waste'
    if (!['waste', 'courtesy', 'internal_consumption'].includes(exitType)) throw new HttpsError('invalid-argument', 'Tipo de salida inválido.')
    const reason = text(payload.reason || 'Salida registrada', 200)
    const invRef = root.collection('nightclubInventory').doc(inventoryId)
    const snap = await tx.get(invRef)
    if (!snap.exists || snap.data().branchId !== branchId) throw new HttpsError('not-found', 'Botella no encontrada.')
    const stock = snap.data()
    if (!stock.bottleCapacityMl || (stock.openBottleMl || 0) < ml) throw new HttpsError('failed-precondition', 'No hay contenido abierto suficiente para registrar la salida.')
    const before = stock.openBottleMl || 0
    const openBottleMl = money(before - ml)
    tx.update(invRef, { openBottleMl, updatedAt: now })
    const movementId = `bottle_exit_${operationId}`
    tx.create(root.collection('nightclubInventoryMovements').doc(movementId), {
      id: movementId,
      operationId,
      tenantId: actor.tenantId,
      branchId,
      inventoryId,
      quantity: -ml,
      previous: stock.current,
      current: stock.current,
      type: exitType,
      reason,
      openBottleMlBefore: before,
      openBottleMlAfter: openBottleMl,
      actorUid: actor.uid,
      createdAt: now,
    })
    return { inventoryId, openBottleMl }
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
    for (let i = 0; i < productSnaps.length; i++) {
      const snap = productSnaps[i]
      if (!snap.exists) {
        throw new HttpsError('not-found', `Producto ${productIds[i]} no encontrado.`)
      }
      const pData = snap.data()
      if (pData.active === false || pData.isActive === false) {
        throw new HttpsError('failed-precondition', `El producto ${pData.name || productIds[i]} no está activo.`)
      }
    }
    const products = new Map(productSnaps.map((snap, index) => [productIds[index], snap.data()]))

    let sellerStaffId = payload.sellerStaffId || payload.serviceStaffId || null
    if (sellerStaffId) {
      sellerStaffId = id(sellerStaffId)
      const staffSnap = await tx.get(root.collection('members').doc(sellerStaffId))
      if (!staffSnap.exists || staffSnap.data().status !== 'active' || !['waiter', 'service'].includes(staffSnap.data().roleId || staffSnap.data().role)) {
        throw new HttpsError('failed-precondition', 'El mesero especificado no está activo o no es válido.')
      }
    }

    const requirementsMap = planNightclubInventoryConsumption(products, drafts, branchId)
    const inventoryIds = [...requirementsMap.keys()]
    const inventoryRefs = inventoryIds.map(inventoryId => root.collection('nightclubInventory').doc(inventoryId))
    const stocks = await Promise.all(inventoryRefs.map(ref => tx.get(ref)))
    const stocksMap = new Map(inventoryIds.map((invId, idx) => [invId, stocks[idx]]))
    const stockUpdates = calculateNightclubStockUpdates(stocksMap, requirementsMap, branchId)

    let total = 0
    const commissionCreations = []
    const lines = drafts.map((draft, index) => {
      const product = products.get(draft.productId)
      const lineTotal = money(product.price * draft.quantity)
      total += lineTotal

      let commissionSnapshot = null
      if (sellerStaffId && product.commission?.enabled && Number(product.commission.value) > 0) {
        commissionSnapshot = {
          type: product.commission.type || 'percentage',
          value: Number(product.commission.value),
        }
      }

      const itemId = draft.id || `item_${index}`
      if (commissionSnapshot) {
        const commAmount = money(commissionSnapshot.type === 'percentage' ? lineTotal * commissionSnapshot.value / 100 : commissionSnapshot.value * draft.quantity)
        commissionCreations.push({
          itemId,
          productId: product.id,
          productName: product.name,
          staffId: sellerStaffId,
          quantity: draft.quantity,
          saleAmount: lineTotal,
          type: commissionSnapshot.type,
          value: commissionSnapshot.value,
          amount: commAmount,
        })
      }

      return {
        id: itemId,
        productId: draft.productId,
        name: product.name,
        quantity: draft.quantity,
        unitPrice: product.price,
        lineTotal,
        preparationArea: product.preparationArea || 'Barra',
        ...(commissionSnapshot ? { commissionSnapshot } : {}),
      }
    })
    total = money(total)
    const roundId = `round_${operationId}`
    const hasBar = lines.some(item => item.preparationArea !== 'Directo')
    const status = hasBar ? 'pending' : 'ready'
    const consumption = applyNightclubStockUpdates(
      tx,
      root,
      actor,
      branchId,
      activeShiftId,
      accountId,
      roundId,
      operationId,
      now,
      stockUpdates
    )
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
      sellerStaffId,
    })
    for (const comm of commissionCreations) {
      const commId = `commission:${roundId}:${comm.itemId}`
      tx.create(root.collection('nightclubCommissions').doc(commId), {
        id: commId,
        tenantId: actor.tenantId,
        branchId,
        accountId,
        roundId,
        itemId: comm.itemId,
        productId: comm.productId,
        productName: comm.productName,
        staffId: comm.staffId,
        quantity: comm.quantity,
        saleAmount: comm.saleAmount,
        type: comm.type,
        value: comm.value,
        amount: comm.amount,
        paidAmount: 0,
        status: 'pending',
        shiftId: activeShiftId,
        createdAt: now,
      })
    }
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
    let pendingCommsDocs = []
    if (remaining === 0) {
      const commsSnap = await tx.get(
        root.collection('nightclubCommissions')
          .where('accountId', '==', accountId)
          .where('branchId', '==', branchId)
      )
      pendingCommsDocs = commsSnap.docs.filter(d => d.data().status === 'pending')
    }
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
    for (const cDoc of pendingCommsDocs) {
      tx.update(cDoc.ref, { status: 'earned', earnedAt: now, updatedAt: now })
    }
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
    const itemsToRevert = await prepareNightclubInventoryReversal(tx, root, branchId, roundId)
    const roundComms = await tx.get(
      root.collection('nightclubCommissions')
        .where('roundId', '==', roundId)
        .where('branchId', '==', branchId)
    )
    applyNightclubInventoryReversal(
      tx,
      root,
      actor,
      branchId,
      account.data().shiftId,
      round.data().accountId,
      roundId,
      operationId,
      now,
      payload.reason,
      itemsToRevert
    )
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
    for (const cDoc of roundComms.docs) {
      const c = cDoc.data()
      if (c.status !== 'paid') {
        tx.update(cDoc.ref, { status: 'void', voidedAt: now, voidReason: payload.reason || 'Ronda cancelada', updatedAt: now })
      }
    }
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

  // 3b. N3B Operaciones de caja, clientes, cortesías y comisiones vinculadas al turno
  if (type === 'recordCashMovement') {
    const mov = payload.movement || payload
    const amt = amount(mov.amount)
    if (amt <= 0) throw new HttpsError('invalid-argument', 'El monto debe ser mayor a cero.')
    const movType = mov.type
    if (!['income', 'expense'].includes(movType)) throw new HttpsError('invalid-argument', 'Tipo de movimiento inválido.')
    const method = mov.method
    if (!method || !['cash', 'qr', 'card', 'other'].includes(method)) throw new HttpsError('invalid-argument', 'Método de pago inválido.')
    const description = text(mov.description, 200)
    const category = mov.category ? text(mov.category, 50) : null
    if (movType === 'expense' && (!category || !CANONICAL_EXPENSE_CATEGORIES.includes(category))) {
      throw new HttpsError('invalid-argument', 'Categoría de gasto inválida.')
    }
    const notes = mov.notes ? text(mov.notes, 200) : null
    const movementId = id(mov.id || `cash_mov_${operationId}`)
    const movRef = root.collection('nightclubCashMovements').doc(movementId)
    const movData = {
      id: movementId,
      tenantId: actor.tenantId,
      branchId,
      shiftId: activeShiftId,
      type: movType,
      method,
      amount: amt,
      description,
      ...(category ? { category } : {}),
      ...(notes ? { notes } : {}),
      actorUid: actor.uid,
      operationId,
      createdAt: now,
    }
    tx.create(movRef, movData)
    return { movementId, movement: movData }
  }

  if (type === 'assignCustomer') {
    const accountId = id(payload.accountId)
    const accRef = root.collection('nightclubAccounts').doc(accountId)
    const accSnap = await tx.get(accRef)
    if (!accSnap.exists || accSnap.data().branchId !== branchId) throw new HttpsError('not-found', 'Cuenta no encontrada.')
    if (accSnap.data().status === 'closed') throw new HttpsError('failed-precondition', 'La cuenta ya está cerrada.')
    let customerId = null
    let customerDisplayName = null
    if (payload.customerId) {
      customerId = id(payload.customerId)
      const custSnap = await tx.get(root.collection('nightclubCustomers').doc(customerId))
      if (!custSnap.exists || custSnap.data().branchId !== branchId) throw new HttpsError('not-found', 'Cliente no encontrado en esta sucursal.')
      customerDisplayName = custSnap.data().name
    }
    tx.update(accRef, { customerId, customerDisplayName, updatedAt: now })
    return { accountId, customerId, customerDisplayName }
  }

  if (type === 'registerCourtesy') {
    const draft = payload.draft || payload
    const qty = Number(draft.quantity)
    if (!Number.isInteger(qty) || qty <= 0) throw new HttpsError('invalid-argument', 'Cantidad de cortesía inválida.')
    const memberId = id(draft.memberId)
    const memRef = root.collection('nightclubMembers').doc(memberId)
    const memSnap = await tx.get(memRef)
    if (!memSnap.exists || memSnap.data().branchId !== branchId) throw new HttpsError('not-found', 'Socio no encontrado.')
    const member = memSnap.data()
    if (!member.active) throw new HttpsError('failed-precondition', 'El socio está inactivo.')

    const DAY = 86400000
    const anchor = Date.parse(member.policy?.anchorAt)
    const time = Date.parse(now)
    const repeatDays = Number(member.policy?.repeatDays)
    const windowDays = Number(member.policy?.windowDays)
    if (!Number.isFinite(anchor) || !Number.isFinite(time) || !Number.isInteger(repeatDays) || !Number.isInteger(windowDays) || repeatDays < 1 || windowDays < 1 || windowDays > repeatDays) {
      throw new HttpsError('failed-precondition', 'Configura un período válido para el socio.')
    }
    const cycle = Math.floor((time - anchor) / (repeatDays * DAY))
    const start = anchor + cycle * repeatDays * DAY
    const end = start + windowDays * DAY
    const periodActive = cycle >= 0 && time >= start && time < end
    const periodStart = new Date(start).toISOString()
    const periodEnd = new Date(end).toISOString()
    if (!periodActive) throw new HttpsError('failed-precondition', 'El período de cortesías del socio no está activo.')

    const courtesiesSnap = await tx.get(
      root.collection('nightclubCourtesies')
        .where('memberId', '==', memberId)
        .where('branchId', '==', branchId)
        .where('status', '==', 'active')
        .where('periodStart', '==', periodStart)
    )
    const used = courtesiesSnap.docs.reduce((sum, d) => sum + (Number(d.data().quantity) || 0), 0)
    const available = Math.max(0, member.quota - used)
    if (qty > available) throw new HttpsError('failed-precondition', `Cupo de cortesías superado. ${member.name} tiene ${available} botella(s) disponible(s).`)

    const productId = id(draft.productId)
    const prodRef = root.collection('nightclubProducts').doc(productId)
    const prodSnap = await tx.get(prodRef)
    if (!prodSnap.exists || prodSnap.data().active === false) throw new HttpsError('not-found', 'Producto no encontrado o inactivo.')
    const product = prodSnap.data()
    if (!product.recipe?.length || (product.category !== 'Botellas' && product.bottlePresentation?.kind !== 'bottle')) throw new HttpsError('failed-precondition', 'Selecciona una botella activa con receta de inventario.')

    const inventoryUpdates = []
    for (const line of product.recipe) {
      const invId = id(line.inventoryId)
      const needed = Number(line.quantity) * qty
      const invRef = root.collection('nightclubInventory').doc(invId)
      const invSnap = await tx.get(invRef)
      if (!invSnap.exists || invSnap.data().branchId !== branchId) throw new HttpsError('failed-precondition', `Insumo no encontrado: ${invId}`)
      const stock = invSnap.data()
      if (stock.current < needed) throw new HttpsError('failed-precondition', `Stock insuficiente para ${stock.name || invId}.`)
      inventoryUpdates.push({ invRef, stock, needed, invId })
    }

    const courtesyId = id(draft.id || `courtesy_${operationId}`)
    let cost = 0
    let hasCost = true
    for (const update of inventoryUpdates) {
      const prevStock = update.stock.current
      const current = money(prevStock - update.needed)
      tx.update(update.invRef, { current, updatedAt: now })
      tx.create(root.collection('nightclubInventoryMovements').doc(`${operationId}_${update.invId}`), {
        id: `${operationId}_${update.invId}`,
        operationId,
        tenantId: actor.tenantId,
        branchId,
        shiftId: activeShiftId,
        courtesyId,
        memberId: member.id,
        inventoryId: update.invId,
        quantity: -update.needed,
        previous: prevStock,
        current,
        type: 'member_courtesy',
        actorUid: actor.uid,
        createdAt: now,
      })
      if (update.stock.unitCost === undefined) hasCost = false
      else cost += update.needed * update.stock.unitCost
    }

    let roundId = null
    let account = null
    if (draft.accountId) {
      const accRef = root.collection('nightclubAccounts').doc(id(draft.accountId))
      const accSnap = await tx.get(accRef)
      if (!accSnap.exists || accSnap.data().branchId !== branchId || accSnap.data().status !== 'open') {
        throw new HttpsError('failed-precondition', 'La cuenta de la mesa no acepta cortesías.')
      }
      account = accSnap.data()
      roundId = `round_${operationId}`
      const roundSeq = (account.roundCount || 0) + 1
      const isDirect = product.preparationArea === 'Directo'
      const status = isDirect ? 'ready' : 'pending'
      const roundItems = [{
        id: `${operationId}_0`,
        productId: product.id,
        name: product.name,
        category: product.category,
        quantity: qty,
        unitPrice: 0,
        lineTotal: 0,
        commercialValue: money(product.price * qty),
        kind: 'courtesy',
        preparationArea: product.preparationArea || 'Barra',
        courtesyId,
        memberName: member.name,
      }]
      tx.create(root.collection('nightclubRounds').doc(roundId), {
        id: roundId,
        operationId,
        tenantId: actor.tenantId,
        branchId,
        shiftId: activeShiftId,
        accountId: account.id,
        tableId: account.serviceTarget?.type === 'table' ? account.serviceTarget.tableId : null,
        sequence: roundSeq,
        items: roundItems,
        total: 0,
        status,
        authorization: 'courtesy',
        courtesyId,
        createdAt: now,
        sentAt: now,
        readyAt: isDirect ? now : null,
        createdBy: actor.uid,
      })
      tx.update(accRef, {
        roundCount: roundSeq,
        updatedAt: now,
      })
    }

    const courtesyData = {
      id: courtesyId,
      tenantId: actor.tenantId,
      branchId,
      memberId: member.id,
      productId: product.id,
      productName: product.name,
      quantity: qty,
      ...(draft.beneficiary ? { beneficiary: text(draft.beneficiary, 100) } : {}),
      ...(draft.note ? { note: text(draft.note, 200) } : {}),
      ...(account ? { accountId: account.id, tableId: account.serviceTarget?.type === 'table' ? account.serviceTarget.tableId : null, roundId } : {}),
      actor: (context.member?.data()?.displayName) || actor.uid,
      actorUid: actor.uid,
      at: now,
      periodStart,
      periodEnd,
      status: 'active',
      cost: hasCost ? money(cost) : null,
      createdAt: now,
      updatedAt: now,
    }
    tx.create(root.collection('nightclubCourtesies').doc(courtesyId), courtesyData)
    return { courtesyId, courtesy: courtesyData, used: used + qty, available: available - qty }
  }

  if (type === 'cancelCourtesy') {
    const courtesyId = id(payload.courtesyId || payload.id)
    const cRef = root.collection('nightclubCourtesies').doc(courtesyId)
    const cSnap = await tx.get(cRef)
    if (!cSnap.exists || cSnap.data().branchId !== branchId) throw new HttpsError('not-found', 'Cortesía no encontrada.')
    const courtesy = cSnap.data()
    if (courtesy.status !== 'active') throw new HttpsError('failed-precondition', 'Esta cortesía ya está anulada.')

    if (courtesy.accountId) {
      const accRef = root.collection('nightclubAccounts').doc(courtesy.accountId)
      const accSnap = await tx.get(accRef)
      if (accSnap.exists && accSnap.data().status === 'closed') {
        throw new HttpsError('failed-precondition', 'Una cortesía ya entregada o de una mesa cerrada requiere revisión física antes de anularse.')
      }
      if (courtesy.roundId) {
        const roundRef = root.collection('nightclubRounds').doc(courtesy.roundId)
        const roundSnap = await tx.get(roundRef)
        if (roundSnap.exists) {
          if (roundSnap.data().status === 'delivered') {
            throw new HttpsError('failed-precondition', 'Una cortesía ya entregada o de una mesa cerrada requiere revisión física antes de anularse.')
          }
        }
      }
    }

    const movsSnap = await tx.get(
      root.collection('nightclubInventoryMovements')
        .where('courtesyId', '==', courtesyId)
        .where('type', '==', 'member_courtesy')
    )
    const inventoryUpdates = []
    if (!movsSnap.empty) {
      for (const mDoc of movsSnap.docs) {
        const m = mDoc.data()
        const invRef = root.collection('nightclubInventory').doc(m.inventoryId)
        const invSnap = await tx.get(invRef)
        if (invSnap.exists) {
          const before = invSnap.data().current
          const current = money(before + Math.abs(m.quantity))
          inventoryUpdates.push({ invRef, m, before, current })
        }
      }
    }

    if (courtesy.roundId) {
      const roundRef = root.collection('nightclubRounds').doc(courtesy.roundId)
      tx.update(roundRef, { status: 'cancelled', cancelledAt: now, cancelledBy: actor.uid, cancellationReason: 'Anulación de cortesía', updatedAt: now })
    }
    for (const item of inventoryUpdates) {
      tx.update(item.invRef, { current: item.current, updatedAt: now })
      tx.create(root.collection('nightclubInventoryMovements').doc(`reversal_${operationId}_${item.m.inventoryId}`), {
        id: `reversal_${operationId}_${item.m.inventoryId}`,
        operationId,
        tenantId: actor.tenantId,
        branchId,
        shiftId: activeShiftId,
        courtesyId,
        memberId: courtesy.memberId,
        inventoryId: item.m.inventoryId,
        quantity: Math.abs(item.m.quantity),
        previous: item.before,
        current: item.current,
        type: 'courtesy_reversal',
        actorUid: actor.uid,
        createdAt: now,
      })
    }

    tx.update(cRef, {
      status: 'cancelled',
      cancelledAt: now,
      cancelledBy: actor.uid,
      cancellationReason: text(payload.reason || 'Anulación autorizada', 120),
      updatedAt: now,
    })
    return { courtesyId, status: 'cancelled' }
  }

  if (type === 'payCommissions') {
    const draft = payload.draft || payload
    const paymentId = id(draft.id || draft.operationId || `compay_${operationId}`)
    const staffId = id(draft.staffId)
    const payAmt = amount(draft.amount)
    if (payAmt <= 0) throw new HttpsError('invalid-argument', 'Monto de comisión inválido.')
    const method = draft.method || 'cash'
    if (!['cash', 'qr', 'card', 'other'].includes(method)) throw new HttpsError('invalid-argument', 'Método de pago inválido.')

    const staffSnap = await tx.get(root.collection('members').doc(staffId))
    if (!staffSnap.exists || staffSnap.data().roleId !== 'waiter') {
      throw new HttpsError('failed-precondition', 'Selecciona un mesero registrado.')
    }

    const commQuery = await tx.get(
      root.collection('nightclubCommissions')
        .where('staffId', '==', staffId)
        .where('branchId', '==', branchId)
    )
    const candidates = commQuery.docs
      .map(d => d.data())
      .filter(c => ['earned', 'paid'].includes(c.status) && (c.paidAmount || 0) < c.amount && (!draft.commissionIds?.length || draft.commissionIds.includes(c.id)))
      .sort((a, b) => (a.earnedAt || a.createdAt).localeCompare(b.earnedAt || b.createdAt))

    const totalPending = money(candidates.reduce((sum, c) => sum + (c.amount - (c.paidAmount || 0)), 0))
    if (payAmt > totalPending + 0.001) {
      throw new HttpsError('failed-precondition', 'El pago supera el saldo pendiente de comisiones.')
    }

    let remaining = payAmt
    const settled = []
    for (const c of candidates) {
      if (remaining <= 0) break
      const due = money(c.amount - (c.paidAmount || 0))
      const applied = Math.min(remaining, due)
      const nextPaid = money((c.paidAmount || 0) + applied)
      const nextStatus = nextPaid >= c.amount ? 'paid' : 'earned'
      const paymentIds = [...(c.paymentIds || []), paymentId]
      tx.update(root.collection('nightclubCommissions').doc(c.id), {
        paidAmount: nextPaid,
        status: nextStatus,
        paymentIds,
        updatedAt: now,
      })
      remaining = money(remaining - applied)
      settled.push(c.id)
    }

    const payData = {
      id: paymentId,
      tenantId: actor.tenantId,
      branchId,
      staffId,
      amount: payAmt,
      method,
      shiftId: activeShiftId,
      notes: draft.note ? text(draft.note, 200) : null,
      commissionIds: settled,
      actorUid: actor.uid,
      createdAt: now,
    }
    tx.create(root.collection('nightclubCommissionPayments').doc(paymentId), payData)

    if (method !== 'other') {
      const movId = `comm_${paymentId}`
      tx.create(root.collection('nightclubCashMovements').doc(movId), {
        id: movId,
        tenantId: actor.tenantId,
        branchId,
        shiftId: activeShiftId,
        type: 'expense',
        method,
        amount: payAmt,
        description: 'Pago de comisiones de personal',
        category: 'commissions',
        actorUid: actor.uid,
        commissionPaymentId: paymentId,
        createdAt: now,
      })
    }

    return { paymentId, payment: payData, settledCount: settled.length }
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
