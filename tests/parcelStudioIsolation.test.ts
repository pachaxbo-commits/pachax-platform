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

test('2. Studio Home exposes PACHAX Encomiendas as a single internal template with selector Estándar / Sindicato', () => {
  const studioHomeCode = readFileSync(new URL('../src/studio/StudioHome.tsx', import.meta.url), 'utf8')
  assert.match(studioHomeCode, /id: 'parcel'/)
  assert.match(studioHomeCode, /isInternal: true/)
  assert.match(studioHomeCode, /Estándar \/ Sindicato/)
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

test('8. StudioShell opens parcel as an internal template without requiring PUBLIC_TEMPLATES', () => {
  const shellCode = readFileSync(new URL('../src/studio/StudioShell.tsx', import.meta.url), 'utf8')
  assert.match(shellCode, /const isParcel = templateId === 'parcel'/)
  assert.match(shellCode, /isParcel\s*\?\s*'PACHAX Encomiendas'/)
  assert.match(shellCode, /isParcel \? \(/)
  assert.match(shellCode, /<ParcelDemo/)
})

test('9. Studio Parcel Experience supports switching between Standard and Syndicate editions', () => {
  const demoCode = readFileSync(new URL('../src/demo/parcel/ParcelDemo.tsx', import.meta.url), 'utf8')
  assert.match(demoCode, /allowEditionSwitch={!isPublic}/)
  assert.match(demoCode, /storageScope = isPublic \? 'demo' : 'studio'/)

  const expCode = readFileSync(new URL('../src/modules/parcel/views/ParcelExperience.tsx', import.meta.url), 'utf8')
  assert.match(expCode, /allowEditionSwitch &&/)
  assert.match(expCode, /isSyndicate && \(/)
})

test('10. StudioShell synchronizes team/simulated_role mode with DemoRuntime via PACHAX_STUDIO_SYNC', () => {
  const shellCode = readFileSync(new URL('../src/studio/StudioShell.tsx', import.meta.url), 'utf8')
  assert.match(shellCode, /mode:\s*isTeamMode\s*\?\s*'team'\s*:\s*'simulated_role'/)
  assert.match(shellCode, /isTeamMode,/)
  assert.match(shellCode, /\[templateId,\s*currentRole,\s*isTeamMode,\s*branding,\s*datasetMode,\s*datasetResetKey\]/)

  const runtimeCode = readFileSync(new URL('../src/demo/DemoRuntime.tsx', import.meta.url), 'utf8')
  assert.match(runtimeCode, /const \[currentMode,\s*setCurrentMode\] = useState<DemoMode>/)
  assert.match(runtimeCode, /payload\.mode === 'team' \|\| payload\.mode === 'simulated_role'/)
  assert.match(runtimeCode, /setCurrentMode\(payload\.mode\)/)
  assert.match(runtimeCode, /<RestaurantDemo[\s\S]*?mode={currentMode}/)
  assert.match(runtimeCode, /<QuickRetailDemo[\s\S]*?mode={currentMode}/)
})

test('11. Studio hides role simulation controls for Encomiendas while preserving interactive Standard / Syndicate selector', () => {
  const shellCode = readFileSync(new URL('../src/studio/StudioShell.tsx', import.meta.url), 'utf8')
  assert.match(shellCode, /{!isParcel && \(/)
  assert.match(shellCode, /{!isParcel && \([\s\S]*?Equipo[\s\S]*?!isTeamMode && \(/)
})
