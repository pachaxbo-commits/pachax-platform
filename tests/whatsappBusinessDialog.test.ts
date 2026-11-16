import assert from 'node:assert/strict'
import test from 'node:test'
import {
  BUSINESS_TYPE_OPTIONS,
  buildWhatsAppBusinessMessage,
  buildWhatsAppBusinessUrl,
  isValidWhatsAppPhone,
  mapTemplateIdToBusinessType,
  normalizeWhatsAppPhone,
} from '../src/public/landing/whatsappBusinessContact.ts'

test('WhatsApp business dialog exposes all 6 official business options', () => {
  assert.deepEqual(
    BUSINESS_TYPE_OPTIONS.map((item) => item.id),
    ['restaurant', 'hamburger', 'distribution', 'nightclub', 'retail', 'other'],
  )
  assert.deepEqual(
    BUSINESS_TYPE_OPTIONS.map((item) => item.label),
    [
      'Restaurante con salón',
      'Restaurante Rápido',
      'Producción y Distribución',
      'Nightclub & Lounge',
      'Comercio / Venta rápida',
      'Otro tipo de negocio',
    ],
  )
})

test('mapTemplateIdToBusinessType maps official template IDs and custom service', () => {
  assert.equal(mapTemplateIdToBusinessType('restaurant'), 'restaurant')
  assert.equal(mapTemplateIdToBusinessType('hamburger'), 'hamburger')
  assert.equal(mapTemplateIdToBusinessType('distribution'), 'distribution')
  assert.equal(mapTemplateIdToBusinessType('nightclub'), 'nightclub')
  assert.equal(mapTemplateIdToBusinessType('retail'), 'retail')
  assert.equal(mapTemplateIdToBusinessType('custom'), 'other')
  assert.equal(mapTemplateIdToBusinessType('unknown'), null)
})

test('buildWhatsAppBusinessMessage generates personalized messages for all 6 options', () => {
  assert.equal(
    buildWhatsAppBusinessMessage('restaurant'),
    'Hola, equipo PACHAX. Tengo un restaurante con salón y estoy interesado en implementar su sistema. Quisiera conocer los planes disponibles, precios, costo de implementación y requisitos para comenzar. ¿Podrían brindarme más información?',
  )
  assert.match(buildWhatsAppBusinessMessage('hamburger'), /servicio rápido/i)
  assert.match(buildWhatsAppBusinessMessage('distribution'), /producción, inventario, distribución/i)
  assert.match(buildWhatsAppBusinessMessage('nightclub'), /mesas, consumos, rondas, barra y cuentas/i)
  assert.match(buildWhatsAppBusinessMessage('retail'), /ventas, inventario y control de caja/i)
  assert.match(
    buildWhatsAppBusinessMessage('other', '  Farmacia con 2 sucursales  '),
    /otro tipo de negocio: Farmacia con 2 sucursales\./,
  )
})

test('buildWhatsAppBusinessUrl validates phone numbers and encodes WhatsApp URLs', () => {
  assert.equal(normalizeWhatsAppPhone('+591 7798-7776'), '59177987776')
  assert.equal(isValidWhatsAppPhone('+591 7798-7776'), true)
  assert.equal(isValidWhatsAppPhone(''), false)
  assert.equal(isValidWhatsAppPhone('12345'), false)

  const url = buildWhatsAppBusinessUrl('+591 7798-7776', 'nightclub')
  assert.ok(url?.startsWith('https://wa.me/59177987776?text='))
  const parsed = new URL(url!)
  assert.match(parsed.searchParams.get('text') || '', /mesas, consumos, rondas, barra y cuentas/i)

  assert.equal(buildWhatsAppBusinessUrl('', 'restaurant'), null)
})
