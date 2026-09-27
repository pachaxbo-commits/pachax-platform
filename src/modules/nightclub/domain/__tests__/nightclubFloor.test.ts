/* eslint-disable @typescript-eslint/ban-ts-comment -- Node runs TypeScript outside the browser project. */
// @ts-nocheck
import assert from 'node:assert/strict'
import test from 'node:test'
import { createNightclubDataset } from '../../../../demo/datasets/nightclub/nightclubDatasets.ts'
import { arriveNightclubReservation, cancelNightclubReservation, deleteNightclubTable, deleteNightclubZone, saveNightclubBranding, saveNightclubReservation, saveNightclubTable, saveNightclubZone } from '../nightclubFloor.ts'

const actor = 'Administración'

test('reserva una mesa libre y confirmar llegada abre una cuenta trazable', () => {
  let data = createNightclubDataset('empty')
  data.shift = { id: 'shift', status: 'open', openedAt: '2026-09-27T20:00:00Z', openingFloat: 0, openedBy: actor }
  const table = data.tables[0]
  data = saveNightclubReservation(data, { id: '', tableId: table.id, customerName: 'Ana Pérez', time: '22:30', guests: 3 }, actor)
  assert.equal(data.tables[0].status, 'reserved')
  assert.equal(data.tables[0].reservationName, 'Ana Pérez')
  data = arriveNightclubReservation(data, data.reservations[0].id, actor)
  assert.equal(data.reservations[0].status, 'arrived')
  assert.equal(data.tables[0].status, 'occupied')
  assert.equal(data.accounts.length, 1)
  assert.equal(data.tables[0].activeAccountId, data.accounts[0].id)
})

test('cancelar reserva libera la mesa sin borrar auditoría', () => {
  let data = createNightclubDataset('empty')
  data = saveNightclubReservation(data, { id: '', tableId: data.tables[0].id, customerName: 'Luis', time: '21:00', guests: 2 }, actor)
  data = cancelNightclubReservation(data, data.reservations[0].id, actor)
  assert.equal(data.tables[0].status, 'available')
  assert.equal(data.reservations[0].status, 'cancelled')
  assert.ok(data.audit?.some(event => event.type === 'reservation_cancelled'))
})

test('CRUD de zonas y mesas protege relaciones activas', () => {
  let data = createNightclubDataset('empty')
  data = saveNightclubZone(data, { id: '', name: 'Mezzanine' }, actor)
  const zone = data.zones.at(-1)
  data = saveNightclubTable(data, { id: '', name: 'MZ 1', zoneId: zone.id, capacity: 6, status: 'available' }, actor)
  const table = data.tables.at(-1)
  assert.throws(() => deleteNightclubZone(data, zone.id, actor), /mesas/)
  data = deleteNightclubTable(data, table.id, actor)
  data = deleteNightclubZone(data, zone.id, actor)
  assert.equal(data.zones.some(item => item.id === zone.id), false)
  assert.ok(data.audit?.some(event => event.type === 'table_deleted'))
})

test('branding valida identidad y colores antes de persistir', () => {
  const data = createNightclubDataset('empty')
  assert.throws(() => saveNightclubBranding(data, { ...data.branding, businessName: '', subtitle: 'Lounge' }, actor), /nombre/)
  const next = saveNightclubBranding(data, { ...data.branding, businessName: 'Órbita', subtitle: 'Lounge premium', primaryColor: '#c99b45' }, actor)
  assert.equal(next.branding?.businessName, 'Órbita')
  assert.equal(next.branding?.primaryColor, '#c99b45')
})
