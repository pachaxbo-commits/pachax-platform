import assert from 'node:assert/strict'
import test from 'node:test'
import {
  advanceNightclubRound,
  closeNightclubShift,
  deliverNightclubRound,
  finishNightclubOccupancy,
  nightclubBalance,
  nightclubCashSummary,
  nightclubPaidTotal,
  nightclubProfitSummary,
  openNightclubAccount,
  openNightclubShift,
  recordNightclubPayment,
  requestNightclubBill,
  sendNightclubRound,
} from '../src/modules/nightclub/domain/nightclubAccounts.ts'
import type { NightclubDataset } from '../src/modules/nightclub/domain/nightclubAccounts.ts'
import {
  arriveNightclubReservation,
  saveNightclubBranding,
  saveNightclubReservation,
  saveNightclubTable,
  saveNightclubZone,
} from '../src/modules/nightclub/domain/nightclubFloor.ts'
import { nightclubAccountTimeline } from '../src/modules/nightclub/domain/nightclubHistory.ts'

function createEmptyQAState(): NightclubDataset {
  return {
    accounts: [],
    tables: [],
    zones: [],
    products: [],
    inventory: [],
    inventoryMovements: [],
    customers: [],
    members: [],
    reservations: [],
    cashMovements: [],
    courtesyPolicies: [],
    courtesyApplications: [],
    audit: [],
    branding: {
      companyName: 'WE ON THE NIGHT QA',
      primaryColor: '#8b5cf6',
      accentColor: '#ec4899',
    },
    shift: undefined,
  }
}

test('QA COMPLETO NIGHTCLUB: Empty -> Config -> Turno -> Reserva -> Ronda 62 -> Barra -> Cobro 40+22 -> Cierre -> Historial -> Reportes 62', () => {
  let state = createEmptyQAState()
  const now = '2026-10-07T20:00:00.000Z'

  // 1. Configurar Empresa, Zona, Mesa y Productos
  state = saveNightclubBranding(state, {
    businessName: 'WE ON THE NIGHT QA',
    subtitle: 'Nightclub & Lounge',
    primaryColor: '#8b5cf6',
    accentColor: '#ec4899',
    surfaceColor: '#0f172a',
  }, 'Owner', now)
  assert.equal(state.branding.businessName, 'WE ON THE NIGHT QA')

  state = saveNightclubZone(state, { name: 'VIP' })
  const vipZone = state.zones[0]
  assert.ok(vipZone)
  assert.equal(vipZone.name, 'VIP')

  state = saveNightclubTable(state, {
    name: 'VIP1',
    zoneId: vipZone.id,
    capacity: 6,
    shape: 'rectangle',
    status: 'available',
  })
  const vipTable = state.tables[0]
  assert.ok(vipTable)
  assert.equal(vipTable.name, 'VIP1')

  // Producto 1: Cerveza Bs 25 -> Barra
  // Producto 2: Agua Bs 12 -> Directo
  state.inventory = [
    { id: 'inv-cerveza', name: 'Cerveza', unit: 'unit', current: 50, minimum: 5, unitCost: 10 },
    { id: 'inv-agua', name: 'Agua', unit: 'unit', current: 30, minimum: 5, unitCost: 4 },
  ]
  state.products = [
    {
      id: 'prod-cerveza',
      name: 'Cerveza',
      category: 'Bebidas',
      price: 25,
      preparationArea: 'Barra',
      stockUnits: 50,
      inventoryMode: 'unit',
      recipe: [{ inventoryId: 'inv-cerveza', quantity: 1 }],
    },
    {
      id: 'prod-agua',
      name: 'Agua',
      category: 'Bebidas',
      price: 12,
      preparationArea: 'Directo',
      stockUnits: 30,
      inventoryMode: 'unit',
      recipe: [{ inventoryId: 'inv-agua', quantity: 1 }],
    },
  ]

  // 2. Abrir turno con fondo inicial Bs 200
  state = openNightclubShift(state, 'Owner', 200, now)
  assert.ok(state.shift)
  assert.equal(state.shift.status, 'open')
  assert.equal(state.shift.openingFloat, 200)

  // 3. Crear Reserva VIP1: Cliente Demo, 4 personas
  state = saveNightclubReservation(state, {
    tableId: vipTable.id,
    customerName: 'Cliente Demo',
    guests: 4,
    time: '21:00',
  }, 'Servicio', now)
  const resId = state.reservations[0].id
  assert.equal(state.reservations[0].customerName, 'Cliente Demo')

  // 4. Confirmar llegada de reserva -> Abre cuenta VIP1
  state = arriveNightclubReservation(state, resId, 'Servicio', now)
  const account = state.accounts[0]
  assert.ok(account)
  assert.equal(account.status, 'open')
  assert.equal(account.tableId, vipTable.id)
  assert.equal(account.tableNameSnapshot, 'VIP1')

  // 5. POS: Enviar ronda (2 Cervezas Bs 50 + 1 Agua Bs 12 = Bs 62)
  const roundDraft = [
    { productId: 'prod-cerveza', quantity: 2 },
    { productId: 'prod-agua', quantity: 1 },
  ]
  state = sendNightclubRound(state, account.id, roundDraft, 'Servicio', now, 'ronda-qa-1')
  const currentAcc = state.accounts[0]
  assert.equal(currentAcc.rounds.length, 1)
  assert.equal(currentAcc.subtotal, 62)
  assert.equal(nightclubBalance(currentAcc), 62)
  assert.equal(nightclubPaidTotal(currentAcc), 0)

  // 6. Barra: solo 2 Cervezas (el Agua es entrega directa y no debe ir a Barra)
  const round = currentAcc.rounds[0]
  const barItems = round.items.filter(item => item.preparationArea === 'Barra')
  const directItems = round.items.filter(item => item.preparationArea === 'Directo')
  assert.equal(barItems.length, 1)
  assert.equal(barItems[0].quantity, 2)
  assert.equal(barItems[0].name, 'Cerveza')
  assert.equal(directItems.length, 1)
  assert.equal(directItems[0].name, 'Agua')

  // Verificar descuento de inventario
  assert.equal(state.inventory.find(i => i.id === 'inv-cerveza')?.current, 48) // 50 - 2
  assert.equal(state.inventory.find(i => i.id === 'inv-agua')?.current, 29) // 30 - 1

  // 7. Barra avanza: Pendiente -> Preparando -> Listo -> Entregado
  state = advanceNightclubRound(state, currentAcc.id, round.id, 'Barra', now)
  assert.equal(state.accounts[0].rounds[0].status, 'preparing')
  state = advanceNightclubRound(state, currentAcc.id, round.id, 'Barra', now)
  assert.equal(state.accounts[0].rounds[0].status, 'ready')
  state = deliverNightclubRound(state, currentAcc.id, round.id, 'Servicio', now)
  assert.equal(state.accounts[0].rounds[0].status, 'delivered')

  // Cuenta sigue con total Bs 62, pagado 0, saldo 62
  assert.equal(state.accounts[0].subtotal, 62)
  assert.equal(nightclubBalance(state.accounts[0]), 62)

  // 8. Cuentas: solicitar cobro
  state = requestNightclubBill(state, currentAcc.id, 'Servicio', now)
  assert.equal(state.accounts[0].status, 'bill_requested')
  assert.equal(state.tables.find(t => t.id === vipTable.id)?.status, 'bill_requested')

  // 9. Caja: Primer pago parcial en Efectivo: Bs 40
  state = recordNightclubPayment(state, currentAcc.id, {
    method: 'cash',
    amount: 40,
    received: 50, // Paga con Bs 50
    operationId: 'pago-qa-1-efectivo-40',
  }, 'Caja', now)

  const accAfterP1 = state.accounts[0]
  assert.equal(accAfterP1.subtotal, 62)
  assert.equal(nightclubPaidTotal(accAfterP1), 40)
  assert.equal(nightclubBalance(accAfterP1), 22)
  assert.equal(accAfterP1.payments.length, 1)
  assert.equal(accAfterP1.payments[0].change, 10) // 50 - 40 = 10 de cambio
  assert.equal(accAfterP1.status, 'bill_requested') // Sigue por cobrar porque saldo > 0

  // Caja refleja exactamente el efectivo cobrado:
  // Fondo inicial (200) + Ventas Efectivo (40) = 240
  const cashSummaryP1 = nightclubCashSummary(state)
  assert.equal(cashSummaryP1.cashSales, 40)
  assert.equal(cashSummaryP1.expectedCash, 240)

  // 10. Probar idempotencia de pago mientras la cuenta sigue por cobrar
  const replayedP1 = recordNightclubPayment(state, currentAcc.id, {
    method: 'cash',
    amount: 40,
    received: 50,
    operationId: 'pago-qa-1-efectivo-40',
  }, 'Caja', now)
  assert.equal(replayedP1, state)
  assert.equal(replayedP1.accounts[0].payments.length, 1)

  // 11. Caja: Segundo pago restante por QR: Bs 22
  state = recordNightclubPayment(state, currentAcc.id, {
    method: 'qr',
    amount: 22,
    operationId: 'pago-qa-2-qr-22',
  }, 'Caja', now)

  const accAfterP2 = state.accounts[0]
  assert.equal(accAfterP2.subtotal, 62)
  assert.equal(nightclubPaidTotal(accAfterP2), 62)
  assert.equal(nightclubBalance(accAfterP2), 0)
  assert.equal(accAfterP2.payments.length, 2)
  // Como todos los pedidos ya estaban entregados y el saldo llegó a 0, la cuenta cierra automáticamente y libera la mesa
  assert.equal(accAfterP2.status, 'closed')

  // 12. Mesa VIP1 queda libre
  const tableEnd = state.tables.find(t => t.id === vipTable.id)
  assert.equal(tableEnd?.status, 'available')
  assert.equal(tableEnd?.activeAccountId, undefined)

  // 13. Historial refleja todos los pasos
  const timeline = nightclubAccountTimeline(accAfterP2, state)
  assert.ok(timeline.some(t => t.productName === 'Cerveza' && t.quantity === 2))
  assert.ok(timeline.some(t => t.productName === 'Agua' && t.quantity === 1))

  // 14. Reportes: Venta total cobrada exactamente Bs 62
  const profitReport = nightclubProfitSummary(state)
  assert.equal(profitReport.totalSales, 62, 'La venta total debe ser exactamente Bs 62 (no 102 ni 124)')
  assert.equal(profitReport.grossProfit, 62 - (2 * 10 + 1 * 4)) // 62 - 24 = 38
  const cashReport = nightclubCashSummary(state)
  assert.equal(cashReport.totalSales, 62)
  assert.equal(cashReport.cashSales, 40)
  assert.equal(cashReport.qrSales, 22)
  assert.equal(cashReport.cardSales, 0)
  assert.equal(cashReport.expectedCash, 240) // 200 + 40

  // 15. Protección contra cobros sobre cuenta ya cerrada
  assert.throws(() => {
    recordNightclubPayment(state, currentAcc.id, {
      method: 'qr',
      amount: 22,
      operationId: 'pago-qa-extra',
    }, 'Caja', now)
  }, /La cuenta debe estar por cobrar/)
})
