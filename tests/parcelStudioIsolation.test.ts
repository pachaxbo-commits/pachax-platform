import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import { PUBLIC_TEMPLATES } from '../src/core/publicTemplates.ts'
import { createFullParcelDataset, createEmptyParcelDataset } from '../src/demo/datasets/parcel/parcelDatasets.ts'
import { DemoParcelController } from '../src/demo/parcel/demoParcelController.ts'

test('1. PUBLIC_TEMPLATES includes PACHAX Encomiendas as an approved public template', () => {
  assert.equal(PUBLIC_TEMPLATES.length, 6)
  assert.deepEqual(
    PUBLIC_TEMPLATES.map(item => item.id),
    ['restaurant', 'hamburger', 'distribution', 'retail', 'nightclub', 'parcel']
  )
  const parcel = PUBLIC_TEMPLATES.find(item => item.id === 'parcel')
  assert.ok(parcel)
  assert.equal(parcel.demoPath, '/demo/parcel')
  assert.equal(parcel.demoStatus, 'available')
  assert.equal(parcel.title, 'PACHAX Encomiendas')
})

test('2. Studio Home exposes both canonical public templates and the internal Syndicate edition for operator validation', () => {
  const studioHomeCode = readFileSync(new URL('../src/studio/StudioHome.tsx', import.meta.url), 'utf8')
  assert.match(studioHomeCode, /id: 'parcel'/)
  assert.match(studioHomeCode, /Edición Sindicato/)
  assert.match(studioHomeCode, /isInternal: true/)
})

test('3. ParcelDemo enforces fail-closed Platform Operator authentication guard for syndicate edition in production', () => {
  const demoCode = readFileSync(new URL('../src/demo/parcel/ParcelDemo.tsx', import.meta.url), 'utf8')
  assert.match(demoCode, /useAdminAuth/)
  assert.match(demoCode, /currentEdition === 'sindicato' && !import\.meta\.env\.DEV && !isAuthenticated/)
  assert.match(demoCode, /Acceso Exclusivo PACHAX Admin \/ Studio/)
  assert.doesNotMatch(demoCode, /tenantGateway|platformGateway|firebase\/firestore/)
})

test('4. DemoParcelController operates in pure isolated local state with studio and demo storage scopes', () => {
  const controllerCode = readFileSync(new URL('../src/demo/parcel/demoParcelController.ts', import.meta.url), 'utf8')
  assert.match(controllerCode, /pachax:parcel-studio/)
  assert.match(controllerCode, /pachax:parcel-demo/)
  assert.doesNotMatch(controllerCode, /firestore|tenantGateway|platformGateway|firebaseAuth/)

  // Verify separate scopes don't collide
  const studioCtrl = new DemoParcelController('standard', 'full', 'studio')
  const demoCtrl = new DemoParcelController('standard', 'full', 'demo')
  assert.equal(studioCtrl.getStorageKey(), 'pachax:parcel-studio:standard:full:v1')
  assert.equal(demoCtrl.getStorageKey(), 'pachax:parcel-demo:standard:full:v1')
})

test('5. Parcel Datasets: full dataset has preloaded operational fixtures, empty dataset is pristine', () => {
  const full = createFullParcelDataset('sindicato')
  assert.ok(full.branches.length >= 4)
  assert.ok(full.shipments.length >= 4)
  assert.ok(full.members.length >= 4)
  assert.ok(full.dues.length >= 4)
  assert.ok(full.workers.length >= 3)
  assert.ok(full.activeShift !== null)

  const empty = createEmptyParcelDataset('standard')
  assert.ok(empty.branches.length >= 4, 'Standard branches must exist even in empty mode for agency routing')
  assert.equal(empty.shipments.length, 0)
  assert.equal(empty.manifests.length, 0)
  assert.equal(empty.members.length, 0)
  assert.equal(empty.dues.length, 0)
  assert.equal(empty.workers.length, 0)
  assert.equal(empty.workerPayments.length, 0)
  assert.equal(empty.unionExpenses.length, 0)
  assert.equal(empty.activeShift, null)
  assert.equal(empty.cashMovements.length, 0)
})

test('6. Dynamic Edition Switcher in DemoParcelController toggles standard vs sindicato', () => {
  const controller = new DemoParcelController('sindicato', 'full')
  assert.equal(controller.getEdition(), 'sindicato')
  assert.ok(controller.getState().members.length > 0)

  // Switch to standard
  controller.setEdition('standard')
  assert.equal(controller.getEdition(), 'standard')
  assert.equal(controller.getState().edition, 'standard')

  // Switch back to sindicato
  controller.setEdition('sindicato')
  assert.equal(controller.getEdition(), 'sindicato')
  assert.equal(controller.getState().edition, 'sindicato')
})

test('7. Edition switching purges syndicate state in controller to prevent cross-profile leakage', () => {
  const controller = new DemoParcelController('sindicato', 'full')
  assert.ok(controller.getState().members.length > 0)
  assert.ok(controller.getState().dues.length > 0)

  controller.setEdition('standard')
  assert.equal(controller.getState().edition, 'standard')
  assert.equal(controller.getState().members.length, 0)
  assert.equal(controller.getState().dues.length, 0)
  assert.equal(controller.getState().workers.length, 0)
  assert.equal(controller.getState().workerPayments.length, 0)
  assert.equal(controller.getState().unionExpenses.length, 0)

  // Exclusive syndicate method throws when standard is active
  assert.throws(() => {
    controller.addWorker({
      fullName: 'No Permitido',
      ci: '123',
      phone: '000',
      role: 'Chofer',
      paymentModality: 'monthly',
      agreedAmount: 100,
      status: 'active',
      joinedAt: '2026-10-28',
    })
  }, /Operación no permitida: Esta función es exclusiva de la edición Sindicato/i)
})

test('8. Public demo enforces standard edition and isolates UI from syndicate modules', () => {
  const demoCode = readFileSync(new URL('../src/demo/parcel/ParcelDemo.tsx', import.meta.url), 'utf8')
  assert.match(demoCode, /if \(isPublic\) return 'standard'/)
  assert.match(demoCode, /allowEditionSwitch={!isPublic}/)

  const expCode = readFileSync(new URL('../src/modules/parcel/views/ParcelExperience.tsx', import.meta.url), 'utf8')
  assert.match(expCode, /allowEditionSwitch &&/)
  assert.match(expCode, /isSyndicate && \(/)
})
