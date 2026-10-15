// @ts-expect-error Node test types are intentionally absent from the browser tsconfig.
import assert from 'node:assert/strict'
// @ts-expect-error Node test types are intentionally absent from the browser tsconfig.
import test from 'node:test'
import { createNightclubDataset } from '../../../../demo/datasets/nightclub/nightclubDatasets.ts'
import { deleteNightclubPromoter, markNightclubLoungeSalePaid, nightclubLoungeChangeHistory, nightclubLoungeSpaces, nightclubReservableTables, nightclubPromoterConsumptionTotals, nightclubPromoterRanking, nightclubWeekendStart, saveNightclubLoungeSale, saveNightclubPromoter, saveNightclubPromoterEvent, saveNightclubPromoterConsumption, saveNightclubTicketSale } from '../nightclubPromoters.ts'

const at = '2026-10-08T12:00:00Z'
const actor = 'Admin'
const third = { id: 'third', name: 'Tercera Persona', phone: '70003003', joinedAt: '2026-10-08', birthday: '1998-02-28', document: 'CI 123', active: true }
const sale = { id: 'sale-1', operationId: 'op-1', promoterId: 'third', eventName: 'Noche A', eventDate: '2026-10-09', ticketType: 'General', quantity: 2, unitPrice: 25.50, status: 'pending' as const }

test('demo inicia con dos relacionadores, permite tercero, edición y reinicio limpio', () => {
  const demo = createNightclubDataset('full')
  assert.equal(demo.promoters?.length, 2)
  assert.equal(createNightclubDataset('empty').promoters?.length, 0)
  let data = saveNightclubPromoter(demo, third, actor, 'admin', at)
  assert.equal(data.promoters?.length, 3)
  data = saveNightclubPromoter(data, { ...third, name: 'Nombre corregido', active: false }, actor, 'admin', at)
  assert.equal(data.promoters?.find(item => item.id === third.id)?.name, 'Nombre corregido')
  assert.equal(data.promoters?.find(item => item.id === third.id)?.active, false)
  assert.equal(JSON.parse(JSON.stringify(data)).promoters.length, 3)
  assert.equal(createNightclubDataset('full').promoters?.length, 2)
  assert.throws(() => saveNightclubPromoter(data, { ...third, birthday: '2026-02-30' }, actor, 'admin'), /fecha/)
  assert.throws(() => saveNightclubPromoter(data, third, actor, 'bar'), /Administración/)
  data = deleteNightclubPromoter(data, 'third', actor, 'admin', at)
  assert.equal(data.promoters?.length, 2)
})

test('ventas pendientes, pagadas y anuladas conservan correcciones y no duplican', () => {
  let data = saveNightclubPromoter(createNightclubDataset('empty'), third, actor, 'admin', at)
  const originalCash = JSON.stringify({ accounts: data.accounts, shift: data.shift, cashMovements: data.cashMovements, inventory: data.inventory })
  data = saveNightclubTicketSale(data, sale, actor, 'admin', at)
  assert.equal(data.promoterTicketSales?.[0].total, 51)
  assert.equal(nightclubPromoterRanking(data, { scope: 'all' })[0].tickets, 0)
  assert.equal(saveNightclubTicketSale(data, sale, actor, 'admin', at), data)
  assert.throws(() => saveNightclubTicketSale(data, { ...sale, operationId: 'op-2', id: 'duplicate' }, actor, 'admin', at), /duplicada/)
  assert.throws(() => saveNightclubTicketSale(data, { ...sale, status: 'paid' }, actor, 'admin', at), /operación ya/)
  assert.throws(() => saveNightclubTicketSale(data, { ...sale, operationId: 'op-2', status: 'paid' }, actor, 'admin', at), /motivo/)
  data = saveNightclubTicketSale(data, { ...sale, operationId: 'op-2', status: 'paid', correctionReason: 'Pago confirmado' }, actor, 'admin', at)
  assert.equal(nightclubPromoterRanking(data, { scope: 'all' })[0].tickets, 2)
  assert.equal(nightclubPromoterRanking(data, { scope: 'all' })[0].revenue, 51)
  assert.equal(data.promoterTicketSales?.[0].corrections?.[0].previous.status, 'pending')
  data = saveNightclubTicketSale(data, { ...sale, operationId: 'op-3', status: 'cancelled', correctionReason: 'Entrada anulada' }, actor, 'admin', at)
  assert.equal(nightclubPromoterRanking(data, { scope: 'all' })[0].tickets, 0)
  assert.equal(data.promoterTicketSales?.[0].corrections?.length, 2)
  assert.throws(() => deleteNightclubPromoter(data, 'third', actor, 'admin'), /Desactívalo/)
  assert.equal(JSON.stringify({ accounts: data.accounts, shift: data.shift, cashMovements: data.cashMovements, inventory: data.inventory }), originalCash)
})

test('ranking filtra evento, fin de semana y mes, ordena y escala a 90 fichas', () => {
  let data = createNightclubDataset('empty')
  for (let i = 0; i < 90; i++) data = saveNightclubPromoter(data, { id: 'p-' + i, name: 'Relacionador ' + i, phone: String(i), joinedAt: '2026-10-01', active: true }, actor, 'admin', at)
  const add = (id: string, promoterId: string, eventName: string, eventDate: string, quantity: number, price: number, status: 'paid' | 'pending' | 'cancelled' = 'paid') => {
    data = saveNightclubTicketSale(data, { id, operationId: id, promoterId, eventName, eventDate, ticketType: 'General', quantity, unitPrice: price, status }, actor, 'admin', at)
  }
  add('fri', 'p-1', 'Noche A', '2026-10-09', 3, 20)
  add('sat', 'p-1', 'Noche B', '2026-10-10', 2, 30)
  add('next', 'p-2', 'Noche A', '2026-10-17', 10, 10)
  add('sept', 'p-2', 'Noche A', '2026-09-26', 1, 100)
  add('pending', 'p-2', 'Noche B', '2026-10-10', 100, 100, 'pending')
  assert.equal(data.promoters?.length, 90)
  assert.equal(nightclubWeekendStart('2026-10-11'), '2026-10-09')
  assert.equal(nightclubPromoterRanking(data, { scope: 'weekend', date: '2026-10-11' })[0].promoter.id, 'p-1')
  assert.equal(nightclubPromoterRanking(data, { scope: 'month', date: '2026-10-15' })[0].promoter.id, 'p-2')
  assert.equal(nightclubPromoterRanking(data, { scope: 'event', eventId: '__legacy__' })[0].tickets, 11)
  assert.equal(nightclubPromoterRanking(data, { scope: 'all', sort: 'revenue' })[0].promoter.id, 'p-2')
  assert.equal(nightclubPromoterRanking(data, { scope: 'all', search: 'Relacionador 1' }).length, 11)
})

test('consumos separan cortesías y compras propias sin tocar Caja ni ventas', () => {
  let data = saveNightclubPromoter(createNightclubDataset('empty'), third, actor, 'admin', at)
  const before = JSON.stringify({ accounts: data.accounts, shift: data.shift, cashMovements: data.cashMovements, inventory: data.inventory })
  data = saveNightclubPromoterConsumption(data, { id: 'c1', promoterId: 'third', date: '2026-10-09', concept: 'Bebida', amount: 12.50, kind: 'courtesy', notes: 'Asignada' }, actor, 'admin', at)
  data = saveNightclubPromoterConsumption(data, { id: 'c2', promoterId: 'third', date: '2026-10-10', concept: 'Cena', amount: 30, kind: 'own_purchase' }, actor, 'admin', at)
  data = saveNightclubPromoterConsumption(data, { id: 'c3', promoterId: 'third', date: '2026-10-17', concept: 'Bebida', amount: 10, kind: 'courtesy' }, actor, 'admin', at)
  assert.deepEqual(nightclubPromoterConsumptionTotals(data, 'third', { scope: 'weekend', date: '2026-10-11' }), { courtesy: 12.5, ownPurchase: 30 })
  assert.deepEqual(nightclubPromoterConsumptionTotals(data, 'third', { scope: 'all' }), { courtesy: 22.5, ownPurchase: 30 })
  assert.equal(nightclubPromoterRanking(data, { scope: 'all' })[0].revenue, 0)
  assert.equal(JSON.stringify({ accounts: data.accounts, shift: data.shift, cashMovements: data.cashMovements, inventory: data.inventory }), before)
  assert.throws(() => saveNightclubPromoterConsumption(data, { id: 'c1', promoterId: 'third', date: '2026-10-09', concept: 'Bebida', amount: 12.5, kind: 'courtesy' }, actor, 'admin'), /ya existe/)
  assert.throws(() => saveNightclubPromoterConsumption(data, { id: 'c4', promoterId: 'third', date: '2026-10-09', concept: 'Bebida', amount: 0.001, kind: 'courtesy' }, actor, 'admin'), /monto/)
})

test('permisos separan administración, caja y otros roles', () => {
  const data = saveNightclubPromoter(createNightclubDataset('empty'), third, actor, 'owner', at)
  assert.throws(() => deleteNightclubPromoter(data, third.id, actor, 'cashier'), /Administración/)
  assert.throws(() => saveNightclubTicketSale(data, sale, actor, 'bar', at), /permiso/)
  assert.equal(saveNightclubTicketSale(data, sale, 'Caja', 'cashier', at).promoterTicketSales?.length, 1)
  assert.throws(() => saveNightclubPromoterConsumption(data, { id: 'c1', promoterId: third.id, date: '2026-10-09', concept: 'Bebida', amount: 10, kind: 'courtesy' }, 'Caja', 'cashier', at), /Administración/)
})


test('jornadas mantienen ventas anteriores sin inventar asociaciones y filtran por ID estable', () => {
  let data = saveNightclubPromoter(createNightclubDataset('empty'), third, actor, 'admin', at)
  data = saveNightclubTicketSale(data, { ...sale, status: 'paid' }, actor, 'admin', at)
  assert.equal(data.promoterTicketSales?.[0].eventId, undefined)
  assert.equal(nightclubPromoterRanking(data, { scope: 'event', eventId: '__legacy__' })[0].tickets, 2)
  data = saveNightclubPromoterEvent(data, { id: 'night-1', name: 'Viernes', date: '2026-10-09', status: 'open' }, actor, 'admin', at)
  assert.equal(nightclubPromoterRanking(data, { scope: 'event', eventId: 'night-1' })[0].tickets, 0)
  data = saveNightclubTicketSale(data, { ...sale, id: 'new-sale', operationId: 'new-op', eventId: 'night-1', eventName: 'Nombre manipulado', quantity: 3, status: 'paid' }, actor, 'admin', at)
  assert.equal(data.promoterTicketSales?.[1].eventName, 'Viernes')
  assert.equal(nightclubPromoterRanking(data, { scope: 'event', eventId: 'night-1' })[0].tickets, 3)
  assert.equal(nightclubPromoterRanking(data, { scope: 'all' })[0].tickets, 5)
  data = saveNightclubPromoterEvent(data, { id: 'night-1', name: 'Viernes corregido', date: '2026-10-09', status: 'closed' }, actor, 'admin', at)
  assert.equal(data.promoterTicketSales?.[1].eventName, 'Viernes corregido')
  assert.equal(data.promoterTicketSales?.[0].eventName, 'Noche A')
  assert.equal(nightclubPromoterRanking(data, { scope: 'event', eventId: 'night-1' })[0].tickets, 3)
  assert.throws(() => saveNightclubTicketSale(data, { ...sale, id: 'closed-sale', operationId: 'closed-op', eventId: 'night-1', status: 'paid' }, actor, 'admin', at), /cerrada/)
  assert.throws(() => saveNightclubPromoterEvent(data, { id: 'night-2', name: 'Viernes corregido', date: '2026-10-09', status: 'open' }, actor, 'admin', at), /existe/)
  assert.throws(() => saveNightclubPromoterEvent(data, { id: 'night-2', name: 'Otra', date: '2026-10-10', status: 'open' }, actor, 'cashier', at), /Administración/)
})

test('ranking omite operaciones duplicadas en datos históricos y mantiene pendientes y anuladas fuera del podio', () => {
  let data = saveNightclubPromoter(createNightclubDataset('empty'), third, actor, 'admin', at)
  data = saveNightclubTicketSale(data, { ...sale, status: 'paid' }, actor, 'admin', at)
  data.promoterTicketSales?.push({ ...data.promoterTicketSales[0], id: 'imported-duplicate' })
  data.promoterTicketSales?.push({ ...data.promoterTicketSales[0], id: 'pending-copy', operationId: 'pending-op', status: 'pending' })
  data.promoterTicketSales?.push({ ...data.promoterTicketSales[0], id: 'cancelled-copy', operationId: 'cancelled-op', status: 'cancelled' })
  assert.equal(nightclubPromoterRanking(data, { scope: 'all' })[0].tickets, 2)
  assert.equal(nightclubPromoterRanking(data, { scope: 'all' })[0].revenue, 51)
})



test('lounge real: reserva, pago, corrección y cancelación sin mover Zonas, Caja ni cuentas', () => {
  let data = createNightclubDataset('full')
  const spaces = nightclubLoungeSpaces(data)
  assert.equal(spaces.length, 2)
  const availableLounge = spaces.find(item => item.status === 'available')!
  assert(availableLounge)
  assert.equal(data.promoters?.length, 2)
  const promoterId = data.promoters![0].id
  const buyer = data.customers[0]
  data = saveNightclubPromoterEvent(data, { id: 'event-a', name: 'Jornada A', date: '2026-10-09', status: 'open' }, actor, 'admin', at)
  const untouched = JSON.stringify({ zones: data.zones, tables: data.tables, accounts: data.accounts, customers: data.customers, cashMovements: data.cashMovements, shift: data.shift, inventory: data.inventory })
  const draft = { id: 'lounge-sale-1', operationId: 'lounge-op-1', promoterId, eventId: 'event-a', reservationDate: '2026-10-09', loungeId: availableLounge.id, customerId: buyer.id, agreedPrice: 300, status: 'reserved' as const }
  data = saveNightclubLoungeSale(data, draft, actor, 'admin', at)
  assert.equal(data.promoterLoungeSales?.[0].customerName, buyer.name)
  assert.equal(nightclubPromoterRanking(data, { scope: 'all' })[0].lounges, 0)
  assert.equal(saveNightclubLoungeSale(data, draft, actor, 'admin', at), data)
  assert.throws(() => saveNightclubLoungeSale(data, { ...draft, id: 'duplicate', operationId: 'new-op', promoterId: data.promoters![1].id }, actor, 'admin', at), /no está disponible|ya está reservada/)
  assert.throws(() => saveNightclubLoungeSale(data, { ...draft, id: 'invalid', operationId: 'invalid-op', loungeId: 'nonexistent' }, actor, 'admin', at), /mesa existente/)
  assert.throws(() => saveNightclubLoungeSale(data, { ...draft, id: 'invalid-customer', operationId: 'invalid-customer-op', customerId: 'missing' }, actor, 'admin', at), /cliente/)
  assert.throws(() => saveNightclubLoungeSale(data, { ...draft, id: 'invalid-money', operationId: 'invalid-money-op', agreedPrice: 0.001 }, actor, 'admin', at), /precio/)
  assert.throws(() => saveNightclubLoungeSale(data, { ...draft, operationId: 'op-2', status: 'paid' }, actor, 'admin', at), /motivo/)
  data = saveNightclubLoungeSale(data, { ...draft, operationId: 'op-2', status: 'paid', correctionReason: 'Pago informado' }, actor, 'admin', at)
  let row = nightclubPromoterRanking(data, { scope: 'event', eventId: 'event-a' })[0]
  assert.equal(row.lounges, 1)
  assert.equal(row.loungeValue, 300)
  assert.equal(row.totalValue, 300)
  assert.equal(data.promoterLoungeSales?.[0].corrections?.[0].previous.status, 'reserved')
  assert.equal(JSON.stringify({ zones: data.zones, tables: data.tables, accounts: data.accounts, customers: data.customers, cashMovements: data.cashMovements, shift: data.shift, inventory: data.inventory }), untouched)
  data = saveNightclubLoungeSale(data, { ...draft, operationId: 'op-3', status: 'cancelled', correctionReason: 'Reserva cancelada' }, actor, 'admin', at)
  row = nightclubPromoterRanking(data, { scope: 'all' })[0]
  assert.equal(row.lounges, 0)
  assert.equal(row.totalValue, 0)
  assert.equal(data.promoterLoungeSales?.[0].corrections?.length, 2)
  data = saveNightclubLoungeSale(data, { ...draft, id: 'replacement', operationId: 'replacement-op', promoterId: data.promoters![1].id }, actor, 'admin', at)
  assert.equal(data.promoterLoungeSales?.length, 2)
  assert.throws(() => deleteNightclubPromoter(data, promoterId, actor, 'admin', at), /Desactívalo/)
})

test('ranking combina entradas y lounges pagados, filtra por período y evita lounges duplicados', () => {
  let data = createNightclubDataset('full')
  const [first, second] = data.promoters!
  const available = data.tables.filter(table => table.status === 'available' && !table.activeAccountId && !data.reservations.some(reservation => reservation.tableId === table.id && reservation.status === 'confirmed'))
  const loungeOne = available[0]
  const loungeTwo = available.find(table => table.zoneId !== loungeOne.zoneId) || available[1]
  assert(loungeOne && loungeTwo)
  data = saveNightclubPromoterEvent(data, { id: 'event-a', name: 'Viernes', date: '2026-10-09', status: 'open' }, actor, 'admin', at)
  data = saveNightclubPromoterEvent(data, { id: 'event-b', name: 'Sábado siguiente', date: '2026-10-17', status: 'open' }, actor, 'admin', at)
  const lounge = (id: string, promoterId: string, eventId: string, loungeId: string, agreedPrice: number, status: 'reserved' | 'paid' | 'cancelled') =>
    data = saveNightclubLoungeSale(data, { id, operationId: id, promoterId, eventId, reservationDate: eventId === 'event-a' ? '2026-10-09' : '2026-10-17', loungeId, agreedPrice, status }, actor, 'admin', at)
  lounge('paid-a', first.id, 'event-a', loungeOne.id, 300, 'paid')
  lounge('reserved-a', first.id, 'event-a', loungeTwo.id, 900, 'reserved')
  lounge('paid-b', second.id, 'event-b', loungeOne.id, 500, 'paid')
  data = saveNightclubTicketSale(data, { id: 'ticket-a', operationId: 'ticket-a', promoterId: first.id, eventId: 'event-a', eventDate: '2026-10-09', ticketType: 'General', quantity: 2, unitPrice: 25, status: 'paid' }, actor, 'admin', at)
  data = saveNightclubTicketSale(data, { id: 'ticket-pending', operationId: 'ticket-pending', promoterId: second.id, eventId: 'event-b', eventDate: '2026-10-17', ticketType: 'General', quantity: 20, unitPrice: 50, status: 'pending' }, actor, 'admin', at)
  assert.deepEqual(nightclubPromoterRanking(data, { scope: 'event', eventId: 'event-a' }).find(row => row.promoter.id === first.id)?.totalValue, 350)
  assert.equal(nightclubPromoterRanking(data, { scope: 'weekend', date: '2026-10-11' }).find(row => row.promoter.id === second.id)?.lounges, 0)
  assert.equal(nightclubPromoterRanking(data, { scope: 'month', date: '2026-10-15', sort: 'lounges' })[0].promoter.id, second.id)
  assert.equal(nightclubPromoterRanking(data, { scope: 'all', sort: 'totalValue' })[0].promoter.id, second.id)
  assert.equal(nightclubPromoterRanking(data, { scope: 'all', sort: 'tickets' })[0].promoter.id, first.id)
  assert.equal(nightclubPromoterRanking(data, { scope: 'all' }).find(row => row.promoter.id === first.id)?.entryValue, 50)
  data.promoterLoungeSales?.push({ ...data.promoterLoungeSales[0], id: 'imported-duplicate', promoterId: second.id })
  assert.equal(nightclubPromoterRanking(data, { scope: 'all' }).find(row => row.promoter.id === first.id)?.lounges, 1)
  assert.equal(nightclubPromoterRanking(data, { scope: 'all' }).find(row => row.promoter.id === second.id)?.lounges, 1)
  assert.throws(() => saveNightclubLoungeSale(data, { id: 'forbidden', operationId: 'forbidden', promoterId: first.id, eventId: 'event-a', reservationDate: '2026-10-09', loungeId: loungeOne.id, agreedPrice: 100, status: 'paid' }, actor, 'bar', at), /permiso/)
})


test('fecha independiente de jornadas: selector, bloqueo cruzado, fechas distintas y cancelación', () => {
  let data = createNightclubDataset('full')
  assert.equal(data.promoterEvents?.length, 0)
  assert.equal(nightclubReservableTables(data, '').length, 0)
  const futureDate = '2099-10-09'
  const otherDate = '2099-10-10'
  const available = nightclubReservableTables(data, futureDate)
  assert.equal(available.length, data.tables.length)
  assert(available.some(table => data.zones.find(zone => zone.id === table.zoneId)?.name === 'General'))
  assert(available.some(table => data.zones.find(zone => zone.id === table.zoneId)?.name === 'Lounge'))
  const table = available[0]
  const [first, second] = data.promoters!
  const draft = { id: 'date-sale', operationId: 'date-op', promoterId: first.id, reservationDate: futureDate, loungeId: table.id, agreedPrice: 100, status: 'reserved' as const }
  const before = JSON.stringify({ zones: data.zones, tables: data.tables, reservations: data.reservations, accounts: data.accounts, cashMovements: data.cashMovements })
  data = saveNightclubLoungeSale(data, draft, actor, 'admin', at)
  assert.equal(data.promoterLoungeSales?.[0].reservationDate, futureDate)
  assert.equal(JSON.parse(JSON.stringify(data)).promoterLoungeSales[0].reservationDate, futureDate)
  assert.equal(JSON.stringify({ zones: data.zones, tables: data.tables, reservations: data.reservations, accounts: data.accounts, cashMovements: data.cashMovements }), before)
  assert(!nightclubReservableTables(data, futureDate).some(item => item.id === table.id))
  assert(nightclubReservableTables(data, otherDate).some(item => item.id === table.id))
  assert(nightclubReservableTables(data, futureDate, draft.id).some(item => item.id === table.id))
  assert.throws(() => saveNightclubLoungeSale(data, { ...draft, id: 'other-person', operationId: 'other-op', promoterId: second.id, status: 'paid' }, actor, 'admin', at), /reservada|disponible/)
  data = saveNightclubLoungeSale(data, { ...draft, operationId: 'date-correction', reservationDate: otherDate, correctionReason: 'Cambio de fecha' }, actor, 'admin', at)
  assert.equal(data.promoterLoungeSales?.[0].corrections?.[0].previous.reservationDate, futureDate)
  assert(nightclubReservableTables(data, futureDate).some(item => item.id === table.id))
  assert(!nightclubReservableTables(data, otherDate).some(item => item.id === table.id))
  data = saveNightclubLoungeSale(data, { ...draft, operationId: 'date-cancel', reservationDate: otherDate, status: 'cancelled', correctionReason: 'Reserva cancelada' }, actor, 'admin', at)
  assert(nightclubReservableTables(data, otherDate).some(item => item.id === table.id))
  data = saveNightclubLoungeSale(data, { ...draft, id: 'second-person', operationId: 'second-op', promoterId: second.id, reservationDate: otherDate }, actor, 'admin', at)
  assert.equal(data.promoterLoungeSales?.length, 2)
})

test('reservas antiguas sin reservationDate mantienen su fecha y bloquean la mesa', () => {
  const data = createNightclubDataset('full')
  const table = data.tables[0]
  const promoterId = data.promoters![0].id
  data.promoterLoungeSales = [{
    id: 'legacy-sale', promoterId, eventId: 'old-event', eventName: 'Jornada anterior', eventDate: '2099-11-01',
    loungeId: table.id, loungeName: table.name, agreedPrice: 200, status: 'reserved', operationId: 'legacy-op',
    createdAt: at, createdBy: actor,
  }]
  assert.equal(nightclubReservableTables(data, '2099-11-01').some(item => item.id === table.id), false)
  assert.equal(nightclubReservableTables(data, '2099-11-02').some(item => item.id === table.id), true)
  const corrected = saveNightclubLoungeSale(data, { id: 'legacy-sale', promoterId, reservationDate: '2099-11-02', loungeId: table.id, agreedPrice: 200, status: 'reserved', operationId: 'legacy-correction', correctionReason: 'Fecha corregida' }, actor, 'admin', at)
  assert.equal(corrected.promoterLoungeSales?.[0].eventId, 'old-event')
  assert.equal(corrected.promoterLoungeSales?.[0].eventName, 'Jornada anterior')
  assert.equal(corrected.promoterLoungeSales?.[0].reservationDate, '2099-11-02')
  assert.equal(corrected.promoterLoungeSales?.[0].corrections?.[0].previous.eventDate, '2099-11-01')
})

test('Marcar como pagado registra responsable y hora una sola vez sin motivo ni cobro', () => {
  let data = createNightclubDataset('full')
  const promoterId = data.promoters![0].id
  const table = nightclubReservableTables(data, '2099-12-01')[0]
  const draft = { id: 'pay-lounge', operationId: 'create-lounge', promoterId, reservationDate: '2099-12-01', loungeId: table.id, agreedPrice: 200, status: 'reserved' as const }
  data = saveNightclubLoungeSale(data, draft, actor, 'admin', at)
  const untouched = JSON.stringify({ tables: data.tables, zones: data.zones, accounts: data.accounts, cashMovements: data.cashMovements, shift: data.shift })
  const duplicate = structuredClone(data)
  duplicate.promoterLoungeSales!.push({ ...duplicate.promoterLoungeSales![0], id: 'imported-conflict', promoterId: duplicate.promoters![1].id })
  assert.throws(() => markNightclubLoungeSalePaid(duplicate, draft.id, 'Caja real', 'cashier', at), /otra reserva/)
  const paidAt = '2026-10-08T18:35:00.000Z'
  assert.throws(() => markNightclubLoungeSalePaid(data, 'missing', 'Caja', 'cashier', paidAt), /no existe/)
  assert.throws(() => markNightclubLoungeSalePaid(data, draft.id, 'Caja', 'bar', paidAt), /permiso/)
  assert.throws(() => markNightclubLoungeSalePaid(data, draft.id, '', 'cashier', paidAt), /responsable/)
  data = markNightclubLoungeSalePaid(data, draft.id, 'Caja real', 'cashier', paidAt)
  const sale = data.promoterLoungeSales![0]
  assert.equal(sale.status, 'paid')
  assert.equal(sale.updatedAt, paidAt)
  assert.equal(sale.updatedBy, 'Caja real')
  assert.equal(sale.corrections?.length, 1)
  assert.equal(sale.corrections?.[0].kind, 'payment')
  assert.equal(sale.corrections?.[0].reason, '')
  assert.deepEqual(nightclubLoungeChangeHistory(sale).map(change => [change.from, change.to]), [[null, 'reserved'], ['reserved', 'paid']])
  assert.equal(nightclubLoungeChangeHistory(sale)[1].actor, 'Caja real')
  assert.equal(nightclubLoungeChangeHistory(sale)[1].at, paidAt)
  assert.equal(JSON.stringify({ tables: data.tables, zones: data.zones, accounts: data.accounts, cashMovements: data.cashMovements, shift: data.shift }), untouched)
  assert.equal(markNightclubLoungeSalePaid(data, draft.id, 'Caja real', 'cashier', paidAt), data)
  assert.equal(data.promoterLoungeSales?.[0].corrections?.length, 1)
  assert.throws(() => saveNightclubLoungeSale(data, { ...draft, status: 'cancelled', operationId: 'admin-edit' }, 'Admin', 'admin', paidAt), /motivo/)
  data = saveNightclubLoungeSale(data, { ...draft, status: 'cancelled', operationId: 'admin-edit', correctionReason: 'Cancelación solicitada' }, 'Admin', 'admin', paidAt)
  const history = nightclubLoungeChangeHistory(data.promoterLoungeSales![0])
  assert.deepEqual(history.map(change => [change.from, change.to]), [[null, 'reserved'], ['reserved', 'paid'], ['paid', 'cancelled']])
  assert.equal(history[2].reason, 'Cancelación solicitada')
  assert.throws(() => markNightclubLoungeSalePaid(data, draft.id, 'Caja real', 'cashier', paidAt), /reserva pendiente/)
})

test('historial anterior se consulta sin duplicar ni perder cambios de campos', () => {
  let data = createNightclubDataset('full')
  const promoterId = data.promoters![0].id
  const first = nightclubReservableTables(data, '2099-12-03')[0]
  const second = nightclubReservableTables(data, '2099-12-04').find(table => table.id !== first.id)!
  const draft = { id: 'history-lounge', operationId: 'history-create', promoterId, reservationDate: '2099-12-03', loungeId: first.id, agreedPrice: 100, status: 'reserved' as const }
  data = saveNightclubLoungeSale(data, draft, actor, 'admin', at)
  data = saveNightclubLoungeSale(data, { ...draft, operationId: 'history-correct', reservationDate: '2099-12-04', loungeId: second.id, agreedPrice: 150, correctionReason: 'Cambio solicitado' }, actor, 'admin', at)
  const old = data.promoterLoungeSales![0].corrections![0]
  delete old.kind
  delete old.previous.loungeName
  const before = JSON.stringify(data.promoterLoungeSales![0].corrections)
  const history = nightclubLoungeChangeHistory(data.promoterLoungeSales![0])
  assert.equal(history.length, 2)
  assert(history[1].fields.some(field => field.includes('Fecha de reserva')))
  assert(history[1].fields.some(field => field.includes('Mesa')))
  assert(history[1].fields.some(field => field.includes('Precio')))
  assert.equal(history[1].reason, 'Cambio solicitado')
  assert.equal(JSON.stringify(data.promoterLoungeSales![0].corrections), before)
})
