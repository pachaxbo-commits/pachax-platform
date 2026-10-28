import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import { PUBLIC_TEMPLATES } from '../src/core/publicTemplates.ts'
import { createFullParcelDataset, createEmptyParcelDataset } from '../src/demo/datasets/parcel/parcelDatasets.ts'
import { DemoParcelController } from '../src/demo/parcel/demoParcelController.ts'

test('1. PUBLIC_TEMPLATES preserves exactly 5 public templates (zero public catalog leakage)', () => {
  assert.equal(PUBLIC_TEMPLATES.length, 5)
  assert.deepEqual(
    PUBLIC_TEMPLATES.map(item => item.id),
    ['restaurant', 'hamburger', 'distribution', 'retail', 'nightclub']
  )
  assert.ok(!PUBLIC_TEMPLATES.some(item => (item.id as string) === 'parcel'))
})

test('2. Studio Home exposes PACHAX Encomiendas as an internal admin template only', () => {
  const studioHomeCode = readFileSync(new URL('../src/studio/StudioHome.tsx', import.meta.url), 'utf8')
  assert.match(studioHomeCode, /id: 'parcel'/)
  assert.match(studioHomeCode, /title: 'PACHAX Encomiendas'/)
  assert.match(studioHomeCode, /Interno Admin/)
  assert.match(studioHomeCode, /isInternal: true/)
})

test('3. ParcelDemo enforces fail-closed Platform Operator authentication guard in production', () => {
  const demoCode = readFileSync(new URL('../src/demo/parcel/ParcelDemo.tsx', import.meta.url), 'utf8')
  assert.match(demoCode, /useAdminAuth/)
  assert.match(demoCode, /!import\.meta\.env\.DEV && !isAuthenticated/)
  assert.match(demoCode, /Acceso Exclusivo PACHAX Admin \/ Studio/)
  assert.doesNotMatch(demoCode, /tenantGateway|platformGateway|firebase\/firestore/)
})

test('4. DemoParcelController operates in pure isolated local state without cloud mutations', () => {
  const controllerCode = readFileSync(new URL('../src/demo/parcel/demoParcelController.ts', import.meta.url), 'utf8')
  assert.match(controllerCode, /pachax:parcel-studio/)
  assert.doesNotMatch(controllerCode, /firestore|tenantGateway|platformGateway|firebaseAuth/)
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
