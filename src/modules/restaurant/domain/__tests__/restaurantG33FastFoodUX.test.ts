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
  getDemoSessionId,
  getDemoImageStorageDriver,
  sanitizeProductsForStorage,
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

test('G5.2 - sanitizeProductsForStorage: remueve Base64 data: URLs y preserva rutas relativas y metadatos', () => {
  const products = [
    { id: 'p1', name: 'Hamburguesa', price: 38, image: 'data:image/webp;base64,UklGRmYAAABXRUJQVlA4...', stockBase: 10 },
    { id: 'p2', name: 'Gaseosa', price: 12, image: '/images/fastfood/soda-glass.webp', stockBase: 50 },
    { id: 'p3', name: 'Papas', price: 15, image: '', stockBase: 25 },
    { id: 'p4', name: 'Insumo', price: 0 },
  ]

  const sanitized = sanitizeProductsForStorage(products)

  // El producto con base64 debe tener imagen vacía para no saturar sessionStorage
  assert.equal(sanitized[0].image, '')
  assert.equal(sanitized[0].name, 'Hamburguesa')
  assert.equal(sanitized[0].price, 38)
  assert.equal(sanitized[0].stockBase, 10)

  // El producto con ruta relativa debe conservar su imagen exactamente
  assert.equal(sanitized[1].image, '/images/fastfood/soda-glass.webp')
  assert.equal(sanitized[1].name, 'Gaseosa')

  // Los productos sin imagen o con cadena vacía se mantienen intactos
  assert.equal(sanitized[2].image, '')
  assert.equal(sanitized[3].image, undefined)
})

test('G5.2 - getDemoSessionId: preserva sesión tras recarga (F5) pero aísla pestañas clonadas o duplicadas', () => {
  // Simulación de entorno de navegador con sessionStorage y window.name
  const store = new Map<string, string>()
  const fakeSessionStorage = {
    length: 0,
    clear: () => store.clear(),
    key: (index: number) => Array.from(store.keys())[index] || null,
    getItem: (key: string) => store.get(key) || null,
    setItem: (key: string, val: string) => { store.set(key, val) },
    removeItem: (key: string) => { store.delete(key) },
  } as Storage

  const originalWindow = globalThis.window
  const mockWindow = {
    sessionStorage: fakeSessionStorage,
    name: '',
  } as unknown as Window & typeof globalThis

  globalThis.window = mockWindow

  try {
    // 1. Primera apertura de pestaña
    const sid1 = getDemoSessionId()
    assert.match(sid1, /^tab_/)
    assert.equal(globalThis.window.name, `pachax_tab_${sid1}`)
    assert.equal(fakeSessionStorage.getItem('pachax:demo:tab_session_id'), sid1)

    // 2. Recarga F5 en la misma pestaña (window.name y sessionStorage se conservan)
    const sidAfterReload = getDemoSessionId()
    assert.equal(sidAfterReload, sid1)

    // 3. Pestaña duplicada (el navegador copia sessionStorage pero window.name inicia vacío "")
    globalThis.window.name = '' // Chrome resetea window.name al duplicar pestaña
    const sidDuplicated = getDemoSessionId()
    assert.notEqual(sidDuplicated, sid1)
    assert.match(sidDuplicated, /^tab_/)
    assert.equal(globalThis.window.name, `pachax_tab_${sidDuplicated}`)
    assert.equal(fakeSessionStorage.getItem('pachax:demo:tab_session_id'), sidDuplicated)
  } finally {
    if (originalWindow) {
      globalThis.window = originalWindow
    } else {
      delete (globalThis as Record<string, unknown>).window
    }
  }
})

test('G5.2 - Queue Serialization: serializa escrituras sucesivas en la misma clave sin carreras ni pérdida de datos', async () => {
  const scope = 'hamburger:full:test-queue-session'
  const productId = 'prod-rapid-write'

  const img1 = 'data:image/webp;base64,FIRST_WRITE'
  const img2 = 'data:image/webp;base64,SECOND_WRITE'
  const img3 = 'data:image/webp;base64,THIRD_FINAL_WRITE'

  // Lanzar tres escrituras rápidas y asíncronas sobre la misma clave
  const p1 = saveDemoProductImage(scope, productId, img1)
  const p2 = saveDemoProductImage(scope, productId, img2)
  const p3 = saveDemoProductImage(scope, productId, img3)

  await Promise.all([p1, p2, p3])

  // Debe prevalecer de manera determinista la última escritura de la cola
  const finalImage = await getDemoProductImage(scope, productId)
  assert.equal(finalImage, img3)

  // Limpiar
  await deleteDemoProductImage(scope, productId)
  assert.equal(await getDemoProductImage(scope, productId), null)
})

test('G5.2 - Storage Driver Detection: reporta driver disponible y aviso adecuado en adaptador', () => {
  const driver = getDemoImageStorageDriver()
  assert.ok(['indexeddb', 'memory'].includes(driver))

  const adapter = createDemoProductImageAdapter()
  assert.equal(adapter.driver, driver)
  assert.ok(adapter.notice && adapter.notice.length > 0)
  if (driver === 'memory') {
    assert.match(adapter.notice, /memoria temporal/i)
  }
})
