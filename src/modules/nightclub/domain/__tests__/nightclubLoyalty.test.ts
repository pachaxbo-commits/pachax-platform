// @ts-expect-error Node test types are intentionally absent from the browser tsconfig.
import assert from 'node:assert/strict'
// @ts-expect-error Node test types are intentionally absent from the browser tsconfig.
import test from 'node:test'
import { createNightclubDataset } from '../../../../demo/datasets/nightclub/nightclubDatasets.ts'
import type { NightclubAccount, NightclubPayment } from '../nightclubAccounts.ts'
import { saveNightclubCustomer } from '../nightclubCustomers.ts'
import { deleteNightclubCustomerIncident, listNightclubCustomerIncidents, saveNightclubCustomerIncident, setNightclubCustomerStatus } from '../nightclubCustomerIncidents.ts'
import { nightclubLoyaltyReport, upcomingNightclubBirthday } from '../nightclubLoyalty.ts'

const customer = { id: 'ana', name: 'Ana', phone: '', visits: 0, totalSpent: 0 }
const account = (id: string, shiftId: string | undefined, payments: NightclubPayment[], customerId: string | null = 'ana'): NightclubAccount => ({ id, shiftId, openedAt: '2026-10-01T00:00:00Z', openedBy: 'staff', status: 'closed', rounds: [{ id: `${id}_round`, sequence: 1, createdAt: '2026-10-01T00:00:00Z', status: 'delivered', customerId, items: [] }], subtotal: 0, payments })
const payment = (id: string, accountId: string, customerId: string | null, amount: number, paidAt = '2026-10-05T10:00:00Z'): NightclubPayment => ({ id, method: 'cash', amount, cashAmount: amount, qrAmount: 0, cardAmount: 0, received: amount, change: 0, paidAt, paidBy: 'cashier', status: 'confirmed', allocations: [{ roundId: `${accountId}_round`, customerId, amount }] })

test('convivencia solo cambia manualmente por administración; incidente no cambia semáforo', () => {
  const start = saveNightclubCustomer(createNightclubDataset('empty'), customer)
  assert.equal(start.customers[0].convivenciaStatus, 'green')
  assert.throws(() => setNightclubCustomerStatus(start, 'ana', 'red', 'Cajero', 'cashier'), /Administración/)
  const identity = { uid: 'uid-admin', displayName: 'Administradora real' }
  const incident = { id: 'incident-1', customerId: 'ana', date: '2026-10-07', severity: 'high' as const, description: '  Discusión en sala  ', responsible: 'forged-staff-id' }
  assert.throws(() => saveNightclubCustomerIncident(start, incident, null, 'cashier'), /Administración/)
  assert.throws(() => listNightclubCustomerIncidents(start, 'ana', 'service'), /Administración/)
  assert.throws(() => saveNightclubCustomerIncident(start, { ...incident, description: ' ' }, identity, 'admin'), /obligatoria/)
  const created = saveNightclubCustomerIncident(start, incident, identity, 'admin', '2026-10-07T12:00:00Z')
  assert.equal(created.customers[0].convivenciaStatus, 'green')
  assert.equal(created.customerIncidents?.[0].responsible, 'uid-admin')
  assert.equal(created.customerIncidents?.[0].responsibleName, 'Administradora real')
  assert.equal(listNightclubCustomerIncidents(created, 'ana', 'admin')[0].description, 'Discusión en sala')
  const yellow = setNightclubCustomerStatus(created, 'ana', 'yellow', 'Admin', 'admin')
  assert.equal(saveNightclubCustomer(yellow, { ...yellow.customers[0], convivenciaStatus: 'red' }).customers[0].convivenciaStatus, 'yellow')
  const editor = { uid: 'uid-editor', displayName: 'Supervisor real' }
  const edited = saveNightclubCustomerIncident(yellow, { ...incident, description: 'Aclarado', severity: 'low' }, editor, 'admin', '2026-10-08T12:00:00Z')
  assert.equal(edited.customers[0].convivenciaStatus, 'yellow')
  assert.equal(edited.customerIncidents?.[0].createdAt, '2026-10-07T12:00:00Z')
  assert.equal(edited.customerIncidents?.[0].createdBy, 'uid-admin')
  assert.equal(edited.customerIncidents?.[0].updatedBy, 'uid-editor')
  assert.equal(edited.customerIncidents?.[0].responsible, 'uid-editor')
  assert.equal(edited.customerIncidents?.[0].responsibleName, 'Supervisor real')
  assert.equal(JSON.parse(JSON.stringify(edited)).customerIncidents[0].description, 'Aclarado')
  assert.throws(() => deleteNightclubCustomerIncident(edited, 'ana', 'incident-1', 'Cajero', 'cashier'), /Administración/)
  const removed = deleteNightclubCustomerIncident(edited, 'ana', 'incident-1', 'Admin', 'admin')
  assert.equal(removed.customerIncidents?.length, 0)
  assert.equal(removed.customers[0].convivenciaStatus, 'yellow')
  assert.equal(removed.audit?.at(-1)?.type, 'customer_incident_deleted')
  const demo = saveNightclubCustomerIncident(start, { ...incident, id: 'demo-incident' }, null, 'admin')
  assert.equal(demo.customerIncidents?.[0].responsible, undefined)
  assert.equal(demo.customerIncidents?.[0].responsibleName, 'Usuario demo')
})

test('ranking usa pagos asociados, excluye anónimos, reembolsos, anulaciones y duplicados', () => {
  const dataset = saveNightclubCustomer(createNightclubDataset('empty'), customer)
  dataset.accounts = [
    account('a', 'shift-1', [payment('p1', 'a', 'ana', 40)]),
    account('b', 'shift-1', [payment('p2', 'b', 'ana', 20)]),
    account('c', 'shift-2', [payment('p3', 'c', null, 50)], null),
    account('d', 'shift-2', [{ ...payment('p4', 'd', 'ana', 25), status: 'refunded' }]),
    account('e', 'shift-2', [payment('p5', 'e', 'ana', 30)]),
    account('f', 'shift-3', [payment('p5', 'f', 'ana', 30)]),
    account('g', 'shift-3', [payment('p6', 'g', 'ana', 70, '2026-09-30T23:00:00Z')]),
  ]
  dataset.accounts[4].rounds[0].status = 'cancelled'
  const october = nightclubLoyaltyReport(dataset, 2026, 10)[0]
  assert.equal(october.monthSpent, 60)
  assert.equal(october.totalSpent, 130)
  assert.equal(october.monthVisits, 1)
  assert.equal(october.visits, 2)
  assert.equal(october.frequent, false)
  dataset.accounts.push(account('legacy', undefined, [payment('p7', 'legacy', 'ana', 10)]))
  assert.equal(nightclubLoyaltyReport(dataset, 2026, 10)[0].visits, null)
})

test('cumpleaños por calendario evita desplazamientos y cruza año, incluido 29 de febrero', () => {
  assert.equal(upcomingNightclubBirthday('2000-01-01', '2026-12-31'), 1)
  assert.equal(upcomingNightclubBirthday('2000-02-29', '2027-03-01'), 365)
  assert.equal(upcomingNightclubBirthday(undefined, '2026-10-07'), null)
})