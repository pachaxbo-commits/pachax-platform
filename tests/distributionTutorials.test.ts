import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  PROFILE_METADATA,
  buildProfileProducts,
  buildProfileCustomers,
  buildProfileDataset,
} from '../src/demo/datasets/distribution/profileDatasets.ts'
import type { DistributionIndustryProfile } from '../src/modules/distribution/types.ts'
import {
  createDistributionTutorialPlans,
  loadTutorialProgress,
  saveTutorialProgress,
  getDistributionTutorialProgressKey,
} from '../src/modules/distribution/tutorials/distributionTutorials.ts'
import { calculateTutorialCardPlacement } from '../src/modules/distribution/tutorials/tutorialLayout.ts'
import { DemoDistributionRepository } from '../src/demo/distribution/demoDistributionRepository.ts'
import { hasPermission } from '../src/services/permissionService.ts'
import type { ModuleId } from '../src/config/businessTypes.ts'

const ALL_PROFILES: DistributionIndustryProfile[] = [
  'food',
  'beverages',
  'cleaning',
  'hardware',
  'pharmacy',
  'pets',
  'stationery',
  'spare_parts',
  'mixed',
]

test('G2.1 — Industry Profiles Catalog: all 9 industry profiles are fully defined with authentic metadata', () => {
  for (const profile of ALL_PROFILES) {
    const meta = PROFILE_METADATA[profile]
    assert.ok(meta, `Metadata for profile ${profile} must exist`)
    assert.ok(meta.commercialName.length > 3, `Commercial name for ${profile} must be descriptive`)
    assert.ok(meta.companyName.length > 3, `Company name for ${profile} must be descriptive`)
    assert.ok(meta.taxId.length > 5, `Tax ID for ${profile} must be defined`)
    assert.ok(meta.categories.length >= 2, `Profile ${profile} must have at least 2 categories`)
    assert.ok(meta.sampleProducts.length >= 3, `Profile ${profile} must have at least 3 sample products`)
    assert.ok(meta.sampleCustomers.length >= 2, `Profile ${profile} must have at least 2 sample customers`)
    assert.ok(meta.primaryUnitHint.length >= 3, `Profile ${profile} must specify primaryUnitHint`)
  }
})

test('G2.2 — Deterministic Seed Datasets: all 9 profiles generate authentic products, customers and ledger balances', () => {
  for (const profile of ALL_PROFILES) {
    const products = buildProfileProducts(profile)
    assert.ok(products.length >= 3, `Profile ${profile} must generate at least 3 products`)
    for (const p of products) {
      assert.ok(p.id.length > 3, `Product ID must be valid`)
      assert.ok(p.name.length > 2, `Product name must be valid`)
      assert.ok(p.referencePrice > 0, `Product price must be positive`)
      assert.ok(['kg', 'unit', 'package'].includes(p.unitType), `Unit type must be canonical`)
    }

    const customers = buildProfileCustomers(profile)
    assert.ok(customers.length >= 3, `Profile ${profile} must generate at least 3 customers`)
    for (const c of customers) {
      assert.ok(c.id.startsWith(`c-`), `Customer ID must be prefixed with c-`)
      assert.equal(c.routeId, 'route-norte', `Customer must be assigned to route-norte`)
    }

    const fullDataset = buildProfileDataset(profile)
    assert.ok(fullDataset.products.length >= 3)
    assert.ok(fullDataset.customers.length >= 3)
    assert.ok(fullDataset.routes.length >= 2)
    assert.ok(fullDataset.warehouses.length >= 1)
    assert.ok(fullDataset.balances.length >= 3, 'Must seed initial inventory balances')
    assert.ok(fullDataset.openDispatches.length >= 1, 'Must seed an open dispatch for route-norte')
    assert.ok(fullDataset.sales.length >= 1, 'Must seed initial sales operations')
    assert.ok(fullDataset.receivables.length >= 1, 'Must seed initial credit receivables')
    assert.ok(fullDataset.collections.length >= 1, 'Must seed initial collections')
    assert.ok(fullDataset.expenses.length >= 1, 'Must seed initial expenses')
  }
})

test('G2.3 — Role-Based Tutorial Tracks: permissions strictly gate available tracks per role', () => {
  const ALL_DIST_MODULES: ModuleId[] = [
    'dist.dashboard',
    'dist.sales',
    'dist.inventory',
    'dist.dispatches',
    'dist.credits',
    'dist.collections',
    'dist.customers',
    'dist.expenses',
    'dist.closure',
    'dist.products',
    'dist.reports',
    'dist.users',
    'dist.support',
    'dist.claims',
    'dist.qr',
    'dist.warehouses',
  ]

  // 1. OWNER / ADMIN has full access to all tracks
  const ownerPlans = createDistributionTutorialPlans({
    role: 'owner',
    profile: 'beverages',
    can: (perm) => hasPermission('owner', perm),
    modules: ALL_DIST_MODULES,
  })
  assert.ok(ownerPlans.length >= 5, 'Owner must have at least 5-6 tracks')
  const ownerTrackIds = ownerPlans.map((p) => p.trackId)
  assert.ok(ownerTrackIds.includes('onboarding'))
  assert.ok(ownerTrackIds.includes('inventory'))
  assert.ok(ownerTrackIds.includes('routes'))
  assert.ok(ownerTrackIds.includes('sales'))
  assert.ok(ownerTrackIds.includes('closures'))
  assert.ok(ownerTrackIds.includes('admin'))

  // 2. DISTRIBUTOR only has operational road tracks
  const distributorModules: ModuleId[] = ['dist.dashboard', 'dist.sales', 'dist.credits', 'dist.closure']
  const distributorPlans = createDistributionTutorialPlans({
    role: 'distributor',
    profile: 'hardware',
    can: (perm) => hasPermission('distributor', perm),
    modules: distributorModules,
  })
  const distTrackIds = distributorPlans.map((p) => p.trackId)
  assert.ok(distTrackIds.includes('onboarding'))
  assert.ok(distTrackIds.includes('sales'))
  assert.ok(distTrackIds.includes('closures'))
  assert.ok(!distTrackIds.includes('inventory'), 'Distributor must NOT have warehouse inventory track')
  assert.ok(!distTrackIds.includes('admin'), 'Distributor must NOT have admin reports track')

  // 3. WAREHOUSE only has physical warehouse tracks
  const warehouseModules: ModuleId[] = ['dist.dashboard', 'dist.inventory', 'dist.dispatches', 'dist.closure', 'dist.warehouses']
  const warehousePlans = createDistributionTutorialPlans({
    role: 'warehouse',
    profile: 'cleaning',
    can: (perm) => hasPermission('warehouse', perm),
    modules: warehouseModules,
  })
  const whTrackIds = warehousePlans.map((p) => p.trackId)
  assert.ok(whTrackIds.includes('onboarding'))
  assert.ok(whTrackIds.includes('inventory'))
  assert.ok(whTrackIds.includes('routes'))
  assert.ok(whTrackIds.includes('closures'))
  assert.ok(!whTrackIds.includes('sales'), 'Warehouse must NOT have sales track')
  assert.ok(!whTrackIds.includes('admin'), 'Warehouse must NOT have admin financial reports track')
})

test('G2.4 — Step Content Dynamic Adaptation: profile examples reflect real industry terminology', () => {
  const allModules: ModuleId[] = ['dist.dashboard', 'dist.sales', 'dist.inventory', 'dist.dispatches', 'dist.closure', 'dist.reports']
  const bevPlans = createDistributionTutorialPlans({
    role: 'admin',
    profile: 'beverages',
    can: () => true,
    modules: allModules,
  })
  const bevOnboardingPlan = bevPlans.find((p) => p.trackId === 'onboarding')
  assert.ok(bevOnboardingPlan)
  const bevText = JSON.stringify(bevOnboardingPlan.steps)
  assert.ok(bevText.includes('Distribuidora Refrescos del Valle') || bevText.includes('Bebidas'))

  const hardPlans = createDistributionTutorialPlans({
    role: 'admin',
    profile: 'hardware',
    can: () => true,
    modules: allModules,
  })
  const hardOnboardingPlan = hardPlans.find((p) => p.trackId === 'onboarding')
  assert.ok(hardOnboardingPlan)
  const hardText = JSON.stringify(hardOnboardingPlan.steps)
  assert.ok(hardText.includes('Distribuidora FerreMax') || hardText.includes('Ferretería'))
})

test('G2.5 — Smart Layout Card Placement: card flips safely and protects touch targets', () => {
  const viewportMobile = { width: 390, height: 844 }

  // Target in upper half -> card placed BELOW target
  const upperTarget = { top: 80, left: 20, width: 200, height: 40 }
  const placementBelow = calculateTutorialCardPlacement(upperTarget, viewportMobile, { width: 340, height: 220 })
  assert.equal(placementBelow.side, 'below')
  assert.ok(placementBelow.top > upperTarget.top + upperTarget.height, 'Card must be below target')

  // Target in lower half -> card placed ABOVE target
  const lowerTarget = { top: 600, left: 20, width: 350, height: 50 }
  const placementAbove = calculateTutorialCardPlacement(lowerTarget, viewportMobile, { width: 340, height: 220 })
  assert.equal(placementAbove.side, 'above')
  assert.ok(placementAbove.top < lowerTarget.top, 'Card must be above target')
})

test('G2.6 — Repository Profile Switching: dynamically seeds new profile without leaking old state', () => {
  const repo = new DemoDistributionRepository('full', 'pharmacy')
  const pharmData = repo.getData()
  assert.ok(pharmData.products.some((p) => p.name.toLowerCase().includes('alcohol') || p.name.toLowerCase().includes('venda')))

  // Switch to pets
  repo.switchProfile('pets')
  const petsData = repo.getData()
  assert.ok(petsData.products.some((p) => p.name.toLowerCase().includes('perro') || p.name.toLowerCase().includes('gato')))
  assert.ok(!petsData.products.some((p) => p.name.toLowerCase().includes('alcohol')), 'Old pharmacy products must not leak into pets profile')

  // Switch to food (default legacy compatibility)
  repo.switchProfile('food')
  const foodData = repo.getData()
  assert.ok(foodData.products.some((p) => p.name.toLowerCase().includes('arroz') || p.name.toLowerCase().includes('aceite') || p.name.toLowerCase().includes('frijol')))
})

test('G2.7 — Storage Isolation: progress keys isolate role and industry profile', () => {
  const key1 = getDistributionTutorialProgressKey('distributor', 'food', 'track_sales')
  const key2 = getDistributionTutorialProgressKey('distributor', 'hardware', 'track_sales')
  const key3 = getDistributionTutorialProgressKey('admin', 'food', 'track_sales')

  assert.notEqual(key1, key2, 'Progress keys must be isolated by industry profile')
  assert.notEqual(key1, key3, 'Progress keys must be isolated by actor role')

  saveTutorialProgress('distributor', 'food', 'track_sales', {
    status: 'in_progress',
    stepIndex: 2,
    lastUpdated: new Date().toISOString(),
  })

  const loadedFood = loadTutorialProgress('distributor', 'food')
  assert.equal(loadedFood['track_sales']?.status, 'in_progress')
  assert.equal(loadedFood['track_sales']?.stepIndex, 2)

  const loadedHardware = loadTutorialProgress('distributor', 'hardware')
  assert.equal(loadedHardware['track_sales'], undefined, 'Hardware progress must not have food progress')
})
