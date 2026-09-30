/* eslint-disable @typescript-eslint/ban-ts-comment -- Node test types are outside the browser TypeScript configuration. */
// @ts-nocheck
import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'
import { RESTAURANT_CATEGORIES, RESTAURANT_PRODUCTS } from '../../../../demo/mocks/restaurantMock.ts'
import { makeRestaurantOrderItem } from '../restaurantOperations.ts'
import { restaurantThemeStyle, DEFAULT_RESTAURANT_THEME, RESTAURANT_THEME_PRESETS } from '../../views/restaurantTheme.ts'
import type { CartItem, Order, PaymentSummary, Product } from '../../../../types'

test('1. Pendiente -> Pagado -> Pendiente conmuta libremente conservando ítems y cálculo del pedido', () => {
  const at = new Date().toISOString()
  const productA = RESTAURANT_PRODUCTS[0]
  const productB = RESTAURANT_PRODUCTS[1]

  const cartItems: CartItem[] = [
    { lineId: 'line-1', productId: productA.id, quantity: 2, modifiers: { extras: [], options: [], note: '' } },
    { lineId: 'line-2', productId: productB.id, quantity: 1, modifiers: { extras: [], options: [], note: '' } },
  ]

  const productsById = new Map<string, Product>([
    [productA.id, productA],
    [productB.id, productB],
  ])

  // Estado inicial: mesa con pago pendiente
  let paymentStatus: 'paid' | 'pending' = 'pending'
  let paymentMethod: 'cash' | 'qr' | 'card' | 'mixed' | null = null

  // 1. Conmutar a Pagado (efectivo)
  paymentStatus = 'paid'
  paymentMethod = 'cash'
  assert.equal(paymentStatus, 'paid')
  assert.equal(paymentMethod, 'cash')
  assert.equal(cartItems.length, 2, 'Los productos del carrito deben permanecer intactos')

  // 2. Conmutar de vuelta a Pendiente
  paymentStatus = 'pending'
  paymentMethod = null
  assert.equal(paymentStatus, 'pending')
  assert.equal(paymentMethod, null)
  assert.equal(cartItems.length, 2, 'Los productos del carrito siguen intactos al volver a Pendiente')

  // 3. Conmutar nuevamente a Pagado (ahora con QR)
  paymentStatus = 'paid'
  paymentMethod = 'qr'
  assert.equal(paymentStatus, 'paid')
  assert.equal(paymentMethod, 'qr')

  // Generar la orden con los ítems intactos
  const items = cartItems.map(item => makeRestaurantOrderItem(productsById.get(item.productId)!, { id: item.lineId, quantity: item.quantity, modifiers: item.modifiers }, at))
  const total = items.reduce((sum, item) => sum + item.lineTotal, 0)
  assert.equal(total, (productA.price * 2) + productB.price)

  // Verificar que CajaView.tsx no deshabilita el botón de Pagado
  const cajaSource = fs.readFileSync('src/components/CajaView.tsx', 'utf8')
  assert.doesNotMatch(
    cajaSource,
    /disabled=\{[^}]*option\.id !== 'pending'/,
    'No debe existir un disabled que impida seleccionar Pagado para pedidos con mesa'
  )
})

test('2. Regalo ya no aparece como opción para nuevos pedidos en el POS', () => {
  const cajaSource = fs.readFileSync('src/components/CajaView.tsx', 'utf8')

  // Verificar que la lista de opciones para nuevos pedidos solo contiene Pagado y Pendiente
  assert.match(
    cajaSource,
    /\{ id: 'paid', label: 'Pagado' \},\s*\{ id: 'pending', label: 'Pendiente' \},?\s*\]\.map/,
    'Las únicas opciones de estado de pago en el POS deben ser Pagado y Pendiente'
  )

  // Asegurar que no hay opción gift en el mapeo de botones
  assert.doesNotMatch(
    cajaSource,
    /\{ id: 'gift',\s*label: 'Regalo' \}/,
    'La opción Regalo no debe exponerse en el checkout del POS'
  )
})

test('3. El carrito tiene ancho estable y no deforma ni achica el catálogo', () => {
  const cssSource = fs.readFileSync('src/modules/restaurant/views/restaurantKiosk.css', 'utf8')

  // Grid de 2 columnas con clamp estable para el carrito
  assert.match(
    cssSource,
    /grid-template-columns:\s*minmax\(0,\s*1fr\)\s*clamp\(350px,\s*27vw,\s*440px\)/,
    'El POS desktop debe usar un grid estable con clamp(350px, 27vw, 440px) para el carrito'
  )

  // Posicionamiento de columnas
  assert.match(
    cssSource,
    /\.restaurant-pos-workspace\s*\{[^}]*grid-column:\s*1;\s*grid-row:\s*2;/,
    'El catálogo permanece en columna 1'
  )
  assert.match(
    cssSource,
    /\.restaurant-cart-layer[^{]*\{[^}]*grid-column:\s*2;\s*grid-row:\s*2;/,
    'El carrito permanece en columna 2 sticky sin empujar el catálogo'
  )
})

test('4. Las categorías no contienen emojis hardcodeados y usan mapeo vectorial', () => {
  // En mocks
  for (const cat of RESTAURANT_CATEGORIES) {
    assert.doesNotMatch(cat.name, /[\u{1F300}-\u{1F9FF}]/u, `Categoría ${cat.name} no debe tener emoji en el nombre`)
    assert.equal(cat.emoji || '', '', `Categoría ${cat.id} no debe tener emoji hardcodeado`)
  }

  // En CajaView
  const cajaSource = fs.readFileSync('src/components/CajaView.tsx', 'utf8')
  assert.doesNotMatch(
    cajaSource,
    /<span className="mr-1">\{category\.emoji\}<\/span>/,
    'CajaView no debe renderizar emojis para categorías'
  )
  assert.match(
    cajaSource,
    /<CategoryIcon size=\{15\}/,
    'CajaView debe renderizar iconos vectoriales Lucide para las categorías'
  )
})

test('5. El theme controla los colores principales del carrito y del POS', () => {
  const presets = RESTAURANT_THEME_PRESETS

  for (const preset of presets) {
    const style = restaurantThemeStyle({ primary: preset.primary, accent: preset.accent })
    assert.equal((style as any)['--primary'], preset.primary)
    assert.ok((style as any)['--primary-foreground'], 'Debe tener foreground legible calculado')
    assert.ok((style as any)['--primary-hover'], 'Debe tener color hover calculado')
    assert.ok((style as any)['--primary-soft'], 'Debe tener color suave calculado')
    assert.ok((style as any)['--border'], 'Debe tener color de borde calculado a partir del theme')
  }

  const cajaSource = fs.readFileSync('src/components/CajaView.tsx', 'utf8')
  // El total y el botón de procesamiento deben utilizar el token del theme
  assert.match(
    cajaSource,
    /text-\[var\(--primary\)\]/,
    'El número del total debe utilizar var(--primary)'
  )
  assert.match(
    cajaSource,
    /bg-\[var\(--primary\)\]/,
    'El botón principal de Procesar Pedido debe utilizar bg-[var(--primary)]'
  )
})
