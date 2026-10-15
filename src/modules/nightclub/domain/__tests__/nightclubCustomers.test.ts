// @ts-expect-error Node test types are intentionally absent from the browser tsconfig.
import assert from 'node:assert/strict'
// @ts-expect-error Node test types are intentionally absent from the browser tsconfig.
import test from 'node:test'
import { createNightclubDataset } from '../../../../demo/datasets/nightclub/nightclubDatasets.ts'
import { formatNightclubBirthday, nightclubBirthdayMonthDay, normalizeNightclubBirthday, saveNightclubCustomer } from '../nightclubCustomers.ts'

const customer = { id: 'ana', name: 'Ana', phone: '70000111', visits: 0, totalSpent: 0, active: true }

test('crear cliente con cumpleaños conserva fecha de calendario y permite consultar día/mes', () => {
  const initial = createNightclubDataset('empty')
  const saved = saveNightclubCustomer(initial, { ...customer, birthday: '2000-02-29' })
  assert.equal(initial.customers.length, 0)
  assert.equal(saved.customers[0].birthday, '2000-02-29')
  assert.equal(formatNightclubBirthday(saved.customers[0].birthday), '29/02/2000')
  assert.equal(nightclubBirthdayMonthDay(saved.customers[0].birthday), '02-29')
  const restored = JSON.parse(JSON.stringify(saved)) as typeof saved
  assert.equal(restored.customers[0].birthday, '2000-02-29')
})

test('editar cliente permite cambiar o quitar cumpleaños sin perder identidad ni datos previos', () => {
  const initial = createNightclubDataset('empty')
  const created = saveNightclubCustomer(initial, { ...customer, birthday: '1995-07-10' })
  const edited = saveNightclubCustomer(created, { ...created.customers[0], name: 'Ana María', birthday: '1995-08-11' })
  assert.equal(edited.customers.length, 1)
  assert.equal(edited.customers[0].id, 'ana')
  assert.equal(edited.customers[0].name, 'Ana María')
  assert.equal(edited.customers[0].birthday, '1995-08-11')
  assert.equal(created.customers[0].birthday, '1995-07-10')
  const cleared = saveNightclubCustomer(edited, { ...edited.customers[0], birthday: undefined })
  assert.equal(cleared.customers[0].birthday, undefined)
  assert.equal('birthday' in cleared.customers[0], false)
})

test('clientes anteriores sin cumpleaños siguen siendo válidos y el campo no es obligatorio', () => {
  const initial = createNightclubDataset('empty')
  initial.customers.push({ ...customer })
  const edited = saveNightclubCustomer(initial, { ...initial.customers[0], phone: '70000222' })
  assert.equal(edited.customers[0].phone, '70000222')
  assert.equal(edited.customers[0].birthday, undefined)
  assert.equal(formatNightclubBirthday(edited.customers[0].birthday), 'No registrada')
  assert.equal(nightclubBirthdayMonthDay(edited.customers[0].birthday), null)
})

test('fechas inválidas se rechazan sin desplazar días por zona horaria', () => {
  for (const value of ['2001-02-29', '2026-04-31', '2026-13-01', '2026-2-03', '0000-01-01', '2026-01-00']) {
    assert.throws(() => normalizeNightclubBirthday(value), /fecha de cumpleaños válida/)
    assert.throws(() => saveNightclubCustomer(createNightclubDataset('empty'), { ...customer, birthday: value }), /fecha de cumpleaños válida/)
  }
  assert.equal(normalizeNightclubBirthday('2000-02-29'), '2000-02-29')
})
