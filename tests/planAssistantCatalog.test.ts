import test from 'node:test'
import assert from 'node:assert/strict'
import { PLANS_BY_TEMPLATE } from '../src/public/config/pricingConfig.ts'
import {
  buildVerifiedFeatureBullets,
  detectUnsupportedPlanClaims,
  generatePlanLimitsLabel,
} from '../src/admin/domain/planAssistantCatalog.ts'
import { defaultCapabilities } from '../src/admin/domain/planCapabilityDefaults.ts'

test('all default seed plans across 5 templates are draft, empty technicalEntitlements, and pass unsupported-claim checks', () => {
  for (const [templateId, plans] of Object.entries(PLANS_BY_TEMPLATE)) {
    assert.ok(plans.length >= 3, `${templateId} must preserve 3 tier plans`)
    for (const plan of plans) {
      assert.equal(plan.status, 'draft', `${plan.id} must remain draft`)
      assert.deepEqual(plan.technicalEntitlements, [], `${plan.id} must keep technicalEntitlements empty`)
      const issues = detectUnsupportedPlanClaims(plan)
      assert.deepEqual(issues, [], `${plan.id} contains unsupported claims: ${issues.join('; ')}`)
    }
  }
  const hamb = PLANS_BY_TEMPLATE.hamburger
  assert.deepEqual(hamb.map((p) => p.monthlyPriceUSD), [24, 49, 89])
})

test('detectUnsupportedPlanClaims rejects multi-branch, ERP, kiosk, and unlimited resource claims', () => {
  const caps = defaultCapabilities('retail', 'paid')
  const issues = detectUnsupportedPlanClaims({
    templateId: 'retail',
    name: 'Cadena Retail Multi-sucursal',
    clientProfile: 'Franquicias con conexión API ERP',
    limitsLabel: 'Usuarios ilimitados · Hasta 3 sucursales',
    includedFeatures: ['Soporte para kioskos de autopedido', 'Reportes básicos'],
    technicalEntitlements: ['retail_multibranch'],
    capabilitiesV1: { ...caps, limits: { activeUsers: 5, activeProducts: 20, activeBranches: 3 } },
  })
  assert.ok(issues.length >= 4)
  assert.equal(generatePlanLimitsLabel(caps), '1 sucursal · hasta 1 usuario · hasta 10 productos')

  const restaurantCaps = {
    ...defaultCapabilities('restaurant', 'paid'),
    features: {
      reports: { basic: true, detailed: true, export: true },
      receipts: { digital: true },
      printing: { manual: true, kitchenAutomatic: false },
      adsRequired: false,
    },
  }
  const bullets = buildVerifiedFeatureBullets('restaurant', restaurantCaps)
  assert.ok(bullets.some((b) => b.includes('Exportación de informes')))
  assert.equal(detectUnsupportedPlanClaims({
    templateId: 'restaurant',
    name: 'Restaurante Pro',
    clientProfile: 'Restaurante de 1 sucursal con salón y cocina KDS',
    limitsLabel: generatePlanLimitsLabel(restaurantCaps),
    includedFeatures: bullets,
    technicalEntitlements: [],
    capabilitiesV1: restaurantCaps,
  }).length, 0)
})
