const { HttpsError } = require('firebase-functions/v2/https')

const NIGHTCLUB_BASE_INFRASTRUCTURE = Object.freeze({
  warehouseId: 'warehouse-general',
  cashboxId: 'cashbox-1',
  warehouseName: 'Almacén general',
  cashboxName: 'Caja principal',
})

async function readNightclubBaseInfrastructure(tx, root) {
  const { warehouseId, cashboxId } = NIGHTCLUB_BASE_INFRASTRUCTURE
  const [warehouse, location, cashbox] = await Promise.all([
    tx.get(root.collection('nightclubLocations').doc(warehouseId)),
    tx.get(root.collection('nightclubLocations').doc(cashboxId)),
    tx.get(root.collection('nightclubCashboxes').doc(cashboxId)),
  ])
  return { warehouse, location, cashbox }
}

function isCompleteNightclubBaseInfrastructure(snapshots, tenantId) {
  const { warehouseId, cashboxId } = NIGHTCLUB_BASE_INFRASTRUCTURE
  const { warehouse, location, cashbox } = snapshots
  if (!warehouse.exists || !location.exists || !cashbox.exists) return false
  const warehouseData = warehouse.data()
  const locationData = location.data()
  const cashboxData = cashbox.data()
  return warehouseData.tenantId === tenantId
    && warehouseData.branchId === 'main'
    && warehouseData.type === 'warehouse'
    && warehouseData.active === true
    && locationData.tenantId === tenantId
    && locationData.branchId === 'main'
    && locationData.type === 'cashbox'
    && locationData.linkedCashboxId === cashboxId
    && locationData.active === true
    && cashboxData.tenantId === tenantId
    && cashboxData.branchId === 'main'
    && cashboxData.locationId === cashboxId
    && cashboxData.active === true
}

function isAbsentNightclubBaseInfrastructure(snapshots) {
  return !snapshots.warehouse.exists && !snapshots.location.exists && !snapshots.cashbox.exists
}

function assertNightclubBaseInfrastructureState(snapshots, tenantId) {
  if (isAbsentNightclubBaseInfrastructure(snapshots)) return 'absent'
  if (isCompleteNightclubBaseInfrastructure(snapshots, tenantId)) return 'complete'
  throw new HttpsError(
    'failed-precondition',
    'La configuración inicial de Nightclub está incompleta o es inconsistente. No se modificó ningún documento; solicita una revisión administrativa.'
  )
}

function createNightclubBaseInfrastructure(tx, root, tenantId, now) {
  const { warehouseId, cashboxId, warehouseName, cashboxName } = NIGHTCLUB_BASE_INFRASTRUCTURE
  tx.create(root.collection('nightclubLocations').doc(warehouseId), {
    id: warehouseId, tenantId, branchId: 'main', type: 'warehouse', name: warehouseName,
    active: true, createdAt: now, updatedAt: now,
  })
  tx.create(root.collection('nightclubLocations').doc(cashboxId), {
    id: cashboxId, tenantId, branchId: 'main', type: 'cashbox', name: cashboxName,
    linkedCashboxId: cashboxId, active: true, createdAt: now, updatedAt: now,
  })
  tx.create(root.collection('nightclubCashboxes').doc(cashboxId), {
    id: cashboxId, tenantId, branchId: 'main', locationId: cashboxId, name: cashboxName,
    active: true, createdAt: now, updatedAt: now,
  })
}

async function assertNightclubCashboxLinks(tx, root, tenantId, branchId) {
  const [locationSnapshot, cashboxSnapshot] = await Promise.all([
    tx.get(root.collection('nightclubLocations')),
    tx.get(root.collection('nightclubCashboxes')),
  ])
  const relevantLocations = locationSnapshot.docs.filter(snapshot => !snapshot.data().branchId || snapshot.data().branchId === branchId)
  const relevantCashboxes = cashboxSnapshot.docs.filter(snapshot => !snapshot.data().branchId || snapshot.data().branchId === branchId)
  const locations = new Map(relevantLocations.map(snapshot => [snapshot.id, snapshot.data()]))
  const cashboxes = new Map(relevantCashboxes.map(snapshot => [snapshot.id, snapshot.data()]))
  if (relevantLocations.some(snapshot => !snapshot.data().branchId) || relevantCashboxes.some(snapshot => !snapshot.data().branchId)) {
    throw new HttpsError('failed-precondition', 'Hay ubicaciones o cajas sin sucursal asignada. No se modificó ningún documento.')
  }
  for (const [cashboxId, cashbox] of cashboxes) {
    const location = locations.get(cashbox.locationId)
    if (cashbox.tenantId !== tenantId || cashbox.branchId !== branchId || !location
      || cashbox.locationId !== cashboxId || location.id !== cashboxId
      || location.tenantId !== tenantId || location.branchId !== branchId
      || location.type !== 'cashbox' || location.linkedCashboxId !== cashboxId
      || location.active !== cashbox.active) {
      throw new HttpsError('failed-precondition', 'Hay una caja o ubicación vinculada de forma incompleta o inconsistente. No se modificó ningún documento.')
    }
  }
  for (const [locationId, location] of locations) {
    if (location.type !== 'cashbox') continue
    const cashbox = cashboxes.get(location.linkedCashboxId)
    if (location.tenantId !== tenantId || location.branchId !== branchId || location.id !== locationId
      || location.linkedCashboxId !== locationId || !cashbox || cashbox.locationId !== locationId) {
      throw new HttpsError('failed-precondition', 'Hay una ubicación de caja sin una caja vinculada. No se modificó ningún documento.')
    }
  }
  return { locations, cashboxes }
}

async function assertNoExistingNightclubInfrastructure(tx, root, branchId) {
  const [locations, cashboxes] = await Promise.all([
    tx.get(root.collection('nightclubLocations')),
    tx.get(root.collection('nightclubCashboxes')),
  ])
  const hasRelevant = [...locations.docs, ...cashboxes.docs].some(snapshot => !snapshot.data().branchId || snapshot.data().branchId === branchId)
  if (hasRelevant) {
    throw new HttpsError('failed-precondition', 'Hay ubicaciones o cajas existentes fuera de la configuración inicial. Se requiere revisión antes de inicializar.')
  }
}

module.exports = {
  NIGHTCLUB_BASE_INFRASTRUCTURE,
  readNightclubBaseInfrastructure,
  isCompleteNightclubBaseInfrastructure,
  isAbsentNightclubBaseInfrastructure,
  assertNightclubBaseInfrastructureState,
  createNightclubBaseInfrastructure,
  assertNightclubCashboxLinks,
  assertNoExistingNightclubInfrastructure,
}
