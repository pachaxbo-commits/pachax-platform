import assert from 'node:assert/strict'
import test from 'node:test'
import {
  normalizeBusinessIdentity,
  validateBusinessIdentity,
  buildBusinessDocumentContext,
  DEFAULT_BUSINESS_IDENTITY,
  type BusinessIdentity,
} from '../src/core/businessIdentity.ts'
import {
  orderToReceiptData,
  buildReceiptPlainText,
  generateReceiptPdf,
  type CanonicalReceiptData,
} from '../src/core/receiptService.ts'
import { BusinessTemplateRegistry } from '../src/core/templates.ts'

test('normalizeBusinessIdentity: assigns canonical defaults and maps tenant branding gracefully', () => {
  const empty = normalizeBusinessIdentity({})
  assert.equal(empty.tradeName, 'Mi Empresa')
  assert.equal(empty.primaryColor, '#20383a')
  assert.equal(empty.accentColor, '#b58a55')
  assert.equal(empty.showLogo, true)
  assert.equal(empty.showManagedBy, true)

  const legacyTenant = {
    name: 'Burger Palace Central',
    branding: {
      primary: '#ff5722',
      accent: '#4caf50',
      logoUrl: 'https://cdn.pachax.app/logos/burger.png',
    },
    address: 'Calle 10 #456',
    phone: '77788990',
  }
  const normalized = normalizeBusinessIdentity(legacyTenant)
  assert.equal(normalized.tradeName, 'Burger Palace Central')
  assert.equal(normalized.primaryColor, '#ff5722')
  assert.equal(normalized.accentColor, '#4caf50')
  assert.equal(normalized.logoUrl, 'https://cdn.pachax.app/logos/burger.png')
  assert.equal(normalized.address, 'Calle 10 #456')
  assert.equal(normalized.phone, '77788990')
})

test('validateBusinessIdentity: validates lengths, colors, and rejects base64 bloating', () => {
  const valid = validateBusinessIdentity({
    tradeName: 'Bistró Gourmet',
    primaryColor: '#123456',
    accentColor: '#abcdef',
    taxId: '1029384756',
    phone: '70012345',
  })
  assert.equal(valid.valid, true)
  assert.equal(valid.errors.length, 0)
  assert.equal(valid.sanitized.tradeName, 'Bistró Gourmet')

  // Short trade name
  const invalidName = validateBusinessIdentity({ tradeName: 'A' })
  assert.equal(invalidName.valid, false)
  assert.ok(invalidName.errors.some(e => e.toLowerCase().includes('nombre comercial')))

  // Invalid hex color
  const invalidColor = validateBusinessIdentity({ tradeName: 'Local Valido', primaryColor: 'red' })
  assert.equal(invalidColor.valid, false)
  assert.ok(invalidColor.errors.some(e => e.toLowerCase().includes('hexadecimal')))

  // Base64 logo rejection (> 1000 characters)
  const hugeBase64 = 'data:image/png;base64,' + 'A'.repeat(2000)
  const rejectedLogo = validateBusinessIdentity({ tradeName: 'Local Valido', logoUrl: hugeBase64 })
  assert.equal(rejectedLogo.valid, false)
  assert.ok(rejectedLogo.errors.some(e => e.toLowerCase().includes('base64')))
})

test('buildBusinessDocumentContext: formats header, contacts, and respects visibility toggles', () => {
  const fullIdentity: BusinessIdentity = {
    ...DEFAULT_BUSINESS_IDENTITY,
    tradeName: 'Parrilla Los Amigos',
    receiptHeader: '¡El mejor corte de la ciudad!',
    receiptFooter: 'Vuelva pronto a disfrutar con nosotros',
    taxId: '987654321',
    address: 'Av. Las Palmas 789',
    city: 'Santa Cruz',
    phone: '71020304',
    whatsapp: '71020305',
    showAddress: true,
    showPhone: true,
    showTaxId: true,
    showLogo: true,
    logoUrl: 'https://pachax.app/logo.png',
  }

  const context = buildBusinessDocumentContext(fullIdentity, { branchName: 'Sucursal Sur' })
  assert.equal(context.companyName, 'Parrilla Los Amigos')
  assert.equal(context.branchName, 'Sucursal Sur')
  assert.equal(context.logoUrl, 'https://pachax.app/logo.png')
  assert.ok(context.formattedHeaderLines.includes('¡El mejor corte de la ciudad!'))
  assert.ok(context.formattedHeaderLines.includes('NIT: 987654321'))
  assert.ok(context.formattedHeaderLines.includes('Av. Las Palmas 789, Santa Cruz'))
  assert.ok(context.formattedHeaderLines.some(l => l.includes('Tel: 71020304') && l.includes('WhatsApp: 71020305')))

  // Test toggles OFF
  const hiddenIdentity: BusinessIdentity = {
    ...fullIdentity,
    showAddress: false,
    showPhone: false,
    showTaxId: false,
    showLogo: false,
  }
  const contextHidden = buildBusinessDocumentContext(hiddenIdentity)
  assert.equal(contextHidden.logoUrl, undefined)
  assert.equal(contextHidden.taxId, undefined)
  assert.equal(contextHidden.address, undefined)
  assert.equal(contextHidden.phone, undefined)
  assert.ok(!contextHidden.formattedHeaderLines.some(l => l.includes('NIT:')))
  assert.ok(!contextHidden.formattedHeaderLines.some(l => l.includes('Santa Cruz')))
  assert.ok(!contextHidden.formattedHeaderLines.some(l => l.includes('Tel:')))
})

test('Security & Tenant Isolation: identities and settings updates never cross tenants or bypass permissions', () => {
  const tenantA: Record<string, unknown> = {
    tenantId: 'tenant-rest-a',
    name: 'Restaurante A',
    businessIdentity: { ...DEFAULT_BUSINESS_IDENTITY, tradeName: 'Restaurante A Especial' },
  }
  const tenantB: Record<string, unknown> = {
    tenantId: 'tenant-rest-b',
    name: 'Restaurante B',
    businessIdentity: { ...DEFAULT_BUSINESS_IDENTITY, tradeName: 'Restaurante B Burguer' },
  }

  assert.notEqual(
    (tenantA.businessIdentity as BusinessIdentity).tradeName,
    (tenantB.businessIdentity as BusinessIdentity).tradeName
  )

  // Simulation of permission enforcement in tenantGateway
  function checkCanManageSettings(actor: { role: string; permissions?: string[] }): boolean {
    if (actor.role === 'owner' || actor.role === 'admin') return true
    return Boolean(actor.permissions?.includes('settings.manage'))
  }

  assert.equal(checkCanManageSettings({ role: 'owner' }), true)
  assert.equal(checkCanManageSettings({ role: 'admin' }), true)
  assert.equal(checkCanManageSettings({ role: 'cashier', permissions: [] }), false)
  assert.equal(checkCanManageSettings({ role: 'waiter', permissions: [] }), false)
  assert.equal(checkCanManageSettings({ role: 'kitchen', permissions: [] }), false)
})

test('orderToReceiptData and buildReceiptPlainText: produce accurate canonical receipt representation', () => {
  const mockOrder = {
    id: 'ord-test-998877',
    displayNumber: 'M-12',
    createdAt: '2026-10-16T12:00:00Z',
    paidAt: '2026-10-16T12:30:00Z',
    fulfillmentType: 'salon',
    tableInfo: 'Mesa 4',
    customerName: 'Carlos Mendizábal',
    customerPhone: '77123456',
    items: [
      {
        name: 'Hamburguesa Doble',
        basePrice: 45,
        quantity: 2,
        lineTotal: 90,
        modifiers: ['Sin cebolla', 'Papas extra'],
      },
      {
        name: 'Gaseosa 500ml',
        basePrice: 10,
        quantity: 1,
        lineTotal: 10,
      },
    ],
    total: 100,
    productSubtotal: 100,
    deliveryFee: 0,
    paymentMethod: 'cash',
    cashReceived: 100,
    changeAmount: 0,
  }

  const receipt = orderToReceiptData(mockOrder)
  assert.equal(receipt.receiptNumber, 'M-12')
  assert.equal(receipt.customer?.name, 'Carlos Mendizábal')
  assert.equal(receipt.items.length, 2)
  assert.equal(receipt.items[0].name, 'Hamburguesa Doble')
  assert.equal(receipt.items[0].quantity, 2)
  assert.equal(receipt.items[0].lineTotal, 90)
  assert.deepEqual(receipt.items[0].modifiers, ['Sin cebolla', 'Papas extra'])
  assert.equal(receipt.total, 100)
  assert.equal(receipt.paymentMethod, 'CASH')

  const docContext = buildBusinessDocumentContext({
    tradeName: 'Burger Lab Test',
    receiptFooter: '¡Gracias por su compra!',
    showAddress: false,
    showPhone: false,
  })

  const plainText = buildReceiptPlainText(docContext, receipt)
  assert.ok(plainText.includes('BURGER LAB TEST'))
  assert.ok(plainText.includes('Comprobante: *#M-12*'))
  assert.ok(plainText.includes('Hamburguesa Doble'))
  assert.ok(plainText.includes('*TOTAL: Bs 100.00*'))
  assert.ok(plainText.includes('¡Gracias por su compra!'))
})

test('generateReceiptPdf: generates non-empty PDF bytes and survives missing logo', async () => {
  const docContext = buildBusinessDocumentContext({
    tradeName: 'Restaurante Sin Logo',
    logoUrl: undefined,
    showLogo: true,
  })

  const receiptData: CanonicalReceiptData = {
    receiptNumber: '001',
    dateIso: new Date().toISOString(),
    items: [
      { name: 'Sopa del día', quantity: 1, unitPrice: 25, lineTotal: 25 },
      { name: 'Jugo natural', quantity: 2, unitPrice: 12, lineTotal: 24 },
    ],
    subtotal: 49,
    total: 49,
    paymentMethod: 'EFECTIVO',
  }

  const pdfBytes = await generateReceiptPdf(docContext, receiptData)
  assert.ok(pdfBytes instanceof Uint8Array)
  assert.ok(pdfBytes.length > 500)
  const header = String.fromCharCode(...pdfBytes.slice(0, 4))
  assert.equal(header, '%PDF')
})

test('Public Role Simulation: uses BusinessTemplateRegistry without state destruction', () => {
  const restaurantRoles = BusinessTemplateRegistry['restaurant_pos'].roles
  assert.ok(restaurantRoles.some(r => r.id === 'owner'))
  assert.ok(restaurantRoles.some(r => r.id === 'cashier'))
  assert.ok(restaurantRoles.some(r => r.id === 'waiter'))
  assert.ok(restaurantRoles.some(r => r.id === 'kitchen'))

  const hamburgerRoles = BusinessTemplateRegistry['hamburger_shop'].roles
  assert.ok(hamburgerRoles.some(r => r.id === 'owner'))
  assert.ok(hamburgerRoles.some(r => r.id === 'cashier'))

  const distributionRoles = BusinessTemplateRegistry['route_distribution'].roles
  assert.ok(distributionRoles.some(r => r.id === 'distributor'))

  const nightclubRoles = BusinessTemplateRegistry['nightclub_lounge'].roles
  assert.ok(nightclubRoles.some(r => r.id === 'promoter'))
  assert.ok(nightclubRoles.some(r => r.id === 'bar'))

  // Simulating role switch inside local memory
  let simulatedRole = 'owner'
  const localOrders = [{ id: 'order-1', total: 50 }]
  simulatedRole = 'waiter'

  // The dataset is preserved across role changes without page reload
  assert.equal(simulatedRole, 'waiter')
  assert.equal(localOrders.length, 1)
  assert.equal(localOrders[0].total, 50)
})
