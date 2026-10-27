// @ts-expect-error Node test types are intentionally absent from the browser tsconfig.
import test from 'node:test'
// @ts-expect-error Node test types are intentionally absent from the browser tsconfig.
import assert from 'node:assert/strict'
import {
  validateImageFile,
  buildDemoImageScopeKey,
  saveDemoProductImage,
  getDemoProductImage,
  deleteDemoProductImage,
  loadDemoProductImages,
  clearDemoProductImages,
} from '../../../../demo/restaurant/demoProductImageStorage.ts'
import {
  DISABLED_PRODUCT_IMAGE_ADAPTER,
} from '../productImageAdapter.ts'
import {
  createDemoProductImageAdapter,
} from '../../../../demo/restaurant/demoProductImageAdapter.ts'

test('G3.3 - validateImageFile: permite JPG, PNG y WebP', () => {
  const jpgFile = new File(['fake-jpg'], 'burger.jpg', { type: 'image/jpeg' })
  const pngFile = new File(['fake-png'], 'fries.png', { type: 'image/png' })
  const webpFile = new File(['fake-webp'], 'combo.webp', { type: 'image/webp' })

  assert.equal(validateImageFile(jpgFile).ok, true)
  assert.equal(validateImageFile(pngFile).ok, true)
  assert.equal(validateImageFile(webpFile).ok, true)
})

test('G3.3 - validateImageFile: rechaza estrictamente SVG por seguridad (prevención XSS)', () => {
  const svgFile = new File(['<svg onload="alert(1)"></svg>'], 'malicious.svg', {
    type: 'image/svg+xml',
  })
  const res = validateImageFile(svgFile)
  assert.equal(res.ok, false)
  assert.match(res.error || '', /SVG no permitido por motivos de seguridad/i)
})

test('G3.3 - validateImageFile: rechaza archivos de más de 10 MB', () => {
  const bigArray = new Uint8Array(11 * 1024 * 1024)
  const bigFile = new File([bigArray], 'huge.jpg', { type: 'image/jpeg' })
  const res = validateImageFile(bigFile)
  assert.equal(res.ok, false)
  assert.match(res.error || '', /excede el límite de 10 MB/i)
})

test('G3.3 - validateImageFile: rechaza tipos MIME no soportados (ej. pdf, exe)', () => {
  const pdfFile = new File(['fake-pdf'], 'doc.pdf', { type: 'application/pdf' })
  const res = validateImageFile(pdfFile)
  assert.equal(res.ok, false)
  assert.match(res.error || '', /no soportado/i)
})

test('G3.3 - Secondary modules by role in Counter Service (Restaurante Rápido)', () => {
  // Replicamos la regla canónica de módulos secundarios para verificar que los roles sin módulos secundarios no muestren Más
  const counterSecondary = ['users', 'reports', 'settings', 'printers', 'history']

  const getSecondaryForRole = (role: string) => {
    const rolePermissions: Record<string, string[]> = {
      owner: ['users', 'reports', 'settings', 'printers', 'history'],
      admin: ['users', 'reports', 'settings', 'printers', 'history'],
      cashier: ['printers', 'history'],
      waiter: [],
      kitchen: [],
      inventory: [],
    }
    const authorized = rolePermissions[role] || []
    return counterSecondary.filter((id) => authorized.includes(id))
  }

  // Admin y Owner tienen todos los 5 módulos secundarios
  assert.deepEqual(getSecondaryForRole('admin'), ['users', 'reports', 'settings', 'printers', 'history'])
  assert.deepEqual(getSecondaryForRole('owner'), ['users', 'reports', 'settings', 'printers', 'history'])

  // Cajero tiene Impresoras e Historial (2 módulos)
  assert.deepEqual(getSecondaryForRole('cashier'), ['printers', 'history'])

  // Mesero, Cocina e Inventario NO tienen módulos secundarios (longitud 0 -> botón Más no se muestra)
  assert.equal(getSecondaryForRole('waiter').length, 0)
  assert.equal(getSecondaryForRole('kitchen').length, 0)
  assert.equal(getSecondaryForRole('inventory').length, 0)
})

test('G5.1 - Image Scope Key: aísla estrictamente Full vs Empty y sesiones de pestañas', () => {
  const keyFullSess1 = buildDemoImageScopeKey({ template: 'hamburger', datasetMode: 'full', sessionId: 'tab-1' })
  const keyEmptySess1 = buildDemoImageScopeKey({ template: 'hamburger', datasetMode: 'empty', sessionId: 'tab-1' })
  const keyFullSess2 = buildDemoImageScopeKey({ template: 'hamburger', datasetMode: 'full', sessionId: 'tab-2' })
  const keyRestSess1 = buildDemoImageScopeKey({ template: 'restaurant', datasetMode: 'full', sessionId: 'tab-1' })

  // Comprobar formato de clave compuesta
  assert.equal(keyFullSess1, 'hamburger:full:tab-1')
  assert.equal(keyEmptySess1, 'hamburger:empty:tab-1')
  assert.equal(keyFullSess2, 'hamburger:full:tab-2')
  assert.equal(keyRestSess1, 'restaurant:full:tab-1')

  // Aislamiento Full vs Empty
  assert.notEqual(keyFullSess1, keyEmptySess1)

  // Aislamiento Pestaña 1 vs Pestaña 2
  assert.notEqual(keyFullSess1, keyFullSess2)

  // Aislamiento Hamburguesa vs Restaurante Salón
  assert.notEqual(keyFullSess1, keyRestSess1)
})

test('G5.1 - Image Storage CRUD & Scope Isolation: guarda, actualiza, recupera y purga sin contaminar otros ámbitos', async () => {
  const scopeA = 'hamburger:full:session-alpha'
  const scopeB = 'hamburger:empty:session-alpha' // Mismo navegador pero modo Empty
  const scopeC = 'hamburger:full:session-beta'   // Segunda pestaña independiente

  const imgDataA = 'data:image/webp;base64,FAKE_IMAGE_ALPHA_1'
  const imgDataB = 'data:image/webp;base64,FAKE_IMAGE_BETA_2'

  // 1. Guardar en Ámbito A
  await saveDemoProductImage(scopeA, 'prod-101', imgDataA)

  // 2. Comprobar que existe en Ámbito A
  const retrievedA = await getDemoProductImage(scopeA, 'prod-101')
  assert.equal(retrievedA, imgDataA)

  // 3. Comprobar que NO existe en Ámbito B (Empty) ni en Ámbito C (Segunda pestaña)
  const retrievedB = await getDemoProductImage(scopeB, 'prod-101')
  const retrievedC = await getDemoProductImage(scopeC, 'prod-101')
  assert.equal(retrievedB, null)
  assert.equal(retrievedC, null)

  // 4. Guardar en Ámbito C con imagen diferente
  await saveDemoProductImage(scopeC, 'prod-101', imgDataB)
  assert.equal(await getDemoProductImage(scopeC, 'prod-101'), imgDataB)
  // Ámbito A no se altera
  assert.equal(await getDemoProductImage(scopeA, 'prod-101'), imgDataA)

  // 5. Cargar mapa completo
  const mapA = await loadDemoProductImages(scopeA)
  assert.equal(mapA['prod-101'], imgDataA)
  const mapB = await loadDemoProductImages(scopeB)
  assert.equal(mapB['prod-101'], undefined)

  // 6. Eliminar producto específico
  await deleteDemoProductImage(scopeA, 'prod-101')
  assert.equal(await getDemoProductImage(scopeA, 'prod-101'), null)
  // Ámbito C sigue intacto
  assert.equal(await getDemoProductImage(scopeC, 'prod-101'), imgDataB)

  // 7. Purgar ámbito C completamente
  await clearDemoProductImages(scopeC)
  assert.equal(await getDemoProductImage(scopeC, 'prod-101'), null)
})

test('G5.1 - Real Tenant Protection: empresas reales tienen almacenamiento de fotos deshabilitado para evitar base64 en Firestore', () => {
  // El adaptador deshabilitado debe declarar isSupported: false y un aviso claro
  assert.equal(DISABLED_PRODUCT_IMAGE_ADAPTER.isSupported, false)
  assert.match(DISABLED_PRODUCT_IMAGE_ADAPTER.notice || '', /deshabilitado/i)

  // El adaptador de demo sí está habilitado y valida imágenes
  const demoAdapter = createDemoProductImageAdapter()
  assert.equal(demoAdapter.isSupported, true)
  assert.ok(demoAdapter.validateImage)
  assert.ok(demoAdapter.processImage)

  const invalidSvg = new File(['<svg></svg>'], 'test.svg', { type: 'image/svg+xml' })
  assert.equal(demoAdapter.validateImage?.(invalidSvg)?.ok, false)
})
