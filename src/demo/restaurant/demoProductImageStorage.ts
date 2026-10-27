/**
 * Almacenamiento local aislado en IndexedDB para fotografías de productos en el entorno demo.
 *
 * Principios de seguridad y aislamiento:
 * 1. Zero Firebase Storage / Zero servicios de red: las imágenes permanecen 100% en el cliente.
 * 2. Sanatización y validación estricta: rechazo de SVG, scripts y formatos ejecutables (prevención XSS).
 * 3. Compresión local vía Canvas a WebP/JPEG optimizado (máx 800px, calidad 0.82).
 * 4. Aislamiento estricto por escenario: clave compuesta por plantilla, datasetMode (full/empty),
 *    sesión de pestaña (sessionStorage) y productId.
 * 5. Pestañas aisladas: IndexedDB almacena registros con clave de sesión única por pestaña.
 * 6. Prevención de concurrencia: cola de escrituras serializada y confirmación transaccional.
 * 7. Purgado seguro: al reiniciar demo solo se purgan las imágenes del alcance específico.
 */

const DB_NAME = 'pachax_demo_media_v1'
const STORE_NAME = 'product_images'
const DB_VERSION = 2

const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp']
const MAX_RAW_FILE_SIZE = 10 * 1024 * 1024 // 10 MB máx antes de comprimir

export interface ImageValidationResult {
  ok: boolean
  error?: string
}

export interface DemoImageScope {
  template: 'hamburger' | 'restaurant' | 'retail' | string
  datasetMode: 'full' | 'empty' | string
  sessionId?: string
}

/**
 * Obtiene o crea un identificador de sesión estable y único para la pestaña actual.
 *
 * Mecanismo de aislamiento robusto frente a duplicación de pestañas y recargas F5:
 * 1. En recarga F5 dentro de la misma pestaña: window.name ('pachax_tab_<id>') coincide
 *    con el valor almacenado en sessionStorage. Se conserva el mismo sessionId para restaurar
 *    fotografías.
 * 2. En nueva pestaña o pestaña duplicada: los navegadores clonan sessionStorage hacia la
 *    nueva pestaña, pero window.name se inicializa vacío ('').
 *    Al detectar discrepancia entre window.name y sessionStorage, se reconoce de inmediato
 *    que se trata de una pestaña clonada o duplicada.
 * 3. En ese caso se genera un sessionId completamente nuevo y fresco, se asigna a window.name
 *    y se actualiza sessionStorage, garantizando aislamiento estricto y evitando
 *    cualquier colisión o sobreescritura entre pestañas abiertas simultáneamente.
 */
export function getDemoSessionId(): string {
  if (typeof window === 'undefined') return 'server_session'
  try {
    const SESSION_KEY = 'pachax:demo:tab_session_id'
    const NAME_PREFIX = 'pachax_tab_'
    const storedSid = window.sessionStorage.getItem(SESSION_KEY)
    const currentName = typeof window.name === 'string' ? window.name : ''

    // Caso 1: Recarga (F5) en la misma pestaña -> window.name coincide con sessionStorage
    if (storedSid && currentName === `${NAME_PREFIX}${storedSid}`) {
      return storedSid
    }

    // Caso 2: Pestaña nueva, pestaña duplicada (clonada) o sesión sin inicializar.
    // Generar un sessionId nuevo e independiente para garantizar aislamiento total.
    const newSid = 'tab_' + Math.random().toString(36).slice(2, 9) + '_' + Date.now().toString(36)
    try {
      window.name = `${NAME_PREFIX}${newSid}`
      window.sessionStorage.setItem(SESSION_KEY, newSid)
    } catch {
      // Ignorar si el modo privado restringe escrituras
    }
    return newSid
  } catch {
    return 'fallback_session'
  }
}

/**
 * Construye la clave de ámbito para aislar fotografías por plantilla, modo (full/empty) y sesión de pestaña.
 */
export function buildDemoImageScopeKey(scope: DemoImageScope | string): string {
  if (typeof scope === 'string') {
    // Si ya viene con formato compuesto de 3 partes o prefijo conocido
    if (scope.includes(':')) {
      return scope
    }
    return `${scope}:full:${getDemoSessionId()}`
  }
  const template = scope.template || 'hamburger'
  const mode = scope.datasetMode || 'full'
  const sessionId = scope.sessionId || getDemoSessionId()
  return `${template}:${mode}:${sessionId}`
}

export function validateImageFile(file: File): ImageValidationResult {
  if (!file) {
    return { ok: false, error: 'No se seleccionó ningún archivo.' }
  }

  // Rechazo explícito de SVG para evitar inyecciones XSS / SVG activo
  const lowerName = file.name.toLowerCase()
  if (lowerName.endsWith('.svg') || file.type.includes('svg')) {
    return {
      ok: false,
      error: 'Formato SVG no permitido por motivos de seguridad. Utiliza imágenes JPG, PNG o WebP.',
    }
  }

  if (!ALLOWED_MIME_TYPES.includes(file.type)) {
    return {
      ok: false,
      error: 'Formato de imagen no soportado. Se admiten únicamente fotografías en JPG, PNG o WebP.',
    }
  }

  if (file.size > MAX_RAW_FILE_SIZE) {
    return {
      ok: false,
      error: 'La imagen excede el límite de 10 MB. Selecciona una fotografía más liviana.',
    }
  }

  return { ok: true }
}

/**
 * Comprime y redimensiona una imagen en el cliente usando HTML5 Canvas.
 * Genera un Data URL WebP (o JPEG como fallback) optimizado para catálogo POS.
 */
export async function compressProductImage(
  file: File,
  maxDimension = 800,
  quality = 0.82
): Promise<string> {
  const validation = validateImageFile(file)
  if (!validation.ok) {
    throw new Error(validation.error || 'Archivo inválido')
  }

  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('Error al leer el archivo de imagen local.'))
    reader.onload = () => {
      const img = new Image()
      img.onerror = () => reject(new Error('No se pudo decodificar la imagen seleccionada.'))
      img.onload = () => {
        try {
          let { width, height } = img

          if (width > maxDimension || height > maxDimension) {
            if (width > height) {
              height = Math.round((height * maxDimension) / width)
              width = maxDimension
            } else {
              width = Math.round((width * maxDimension) / height)
              height = maxDimension
            }
          }

          const canvas = document.createElement('canvas')
          canvas.width = Math.max(1, width)
          canvas.height = Math.max(1, height)

          const ctx = canvas.getContext('2d')
          if (!ctx) {
            reject(new Error('No se pudo inicializar el contexto 2D de canvas.'))
            return
          }

          ctx.drawImage(img, 0, 0, canvas.width, canvas.height)

          let dataUrl = canvas.toDataURL('image/webp', quality)
          if (!dataUrl.startsWith('data:image/webp')) {
            dataUrl = canvas.toDataURL('image/jpeg', quality)
          }

          resolve(dataUrl)
        } catch (err) {
          reject(err instanceof Error ? err : new Error('Fallo durante la compresión de la imagen.'))
        }
      }
      img.src = reader.result as string
    }
    reader.readAsDataURL(file)
  })
}

// Inicialización diferida de IndexedDB con soporte SSR seguro y purga de claves legacy
let dbInstancePromise: Promise<IDBDatabase | null> | null = null
let hasIndexedDBFailed = false

export function isDemoIndexedDBAvailable(): boolean {
  if (typeof window === 'undefined') return false
  if (hasIndexedDBFailed) return false
  try {
    return 'indexedDB' in window && window.indexedDB !== null
  } catch {
    return false
  }
}

export function getDemoImageStorageDriver(): 'indexeddb' | 'memory' {
  return isDemoIndexedDBAvailable() ? 'indexeddb' : 'memory'
}

function openDatabase(): Promise<IDBDatabase | null> {
  if (typeof window === 'undefined' || !('indexedDB' in window)) {
    return Promise.resolve(null)
  }

  if (dbInstancePromise) return dbInstancePromise

  dbInstancePromise = new Promise((resolve) => {
    try {
      const request = indexedDB.open(DB_NAME, DB_VERSION)

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'key' })
        }
      }

      request.onsuccess = () => {
        const db = request.result
        // Purgar registros huérfanos legacy que no tengan formato aislado
        purgeLegacyRecords(db).finally(() => resolve(db))
      }

      request.onerror = () => {
        hasIndexedDBFailed = true
        console.warn('IndexedDB no está disponible en este navegador o modo privado. Operando en memoria.')
        resolve(null)
      }
    } catch {
      hasIndexedDBFailed = true
      resolve(null)
    }
  })

  return dbInstancePromise
}

async function purgeLegacyRecords(db: IDBDatabase): Promise<void> {
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, 'readwrite')
      const store = tx.objectStore(STORE_NAME)
      const req = store.getAll()
      req.onsuccess = () => {
        const items = req.result || []
        for (const item of items) {
          if (item && item.key && (item.key.startsWith('pachax:hamburger-demo:operations:') || item.key.startsWith('retail:'))) {
            store.delete(item.key)
          }
        }
        resolve()
      }
      req.onerror = () => resolve()
    } catch {
      resolve()
    }
  })
}

export function makeRecordKey(scopeKey: string, productId: string): string {
  return `${scopeKey}:${productId}`
}

/**
 * Sanitiza productos antes de persistir en sessionStorage para prevenir QuotaExceededError (5MB).
 * Remueve cadenas Base64 (data: URLs) mientras preserva rutas de assets estáticos y campos de negocio.
 * Las fotografías reales se persisten y cargan desde IndexedDB bajo la clave de ámbito aislada.
 */
export function sanitizeProductsForStorage<T extends { image?: string }>(products: T[]): T[] {
  return products.map((product) => {
    if (product.image && product.image.startsWith('data:')) {
      return { ...product, image: '' }
    }
    return product
  })
}

// Cache en memoria para evitar reescrituras innecesarias idénticas
const memoryImageCache = new Map<string, string>()

// Cola de promesas serializadas por recordKey para garantizar orden estricto de operaciones
const keyQueues = new Map<string, Promise<void>>()

function enqueueKeyOperation(recordKey: string, op: () => Promise<void>): Promise<void> {
  const previous = keyQueues.get(recordKey) || Promise.resolve()
  const next = previous.catch(() => {}).then(op)
  keyQueues.set(recordKey, next)
  next.finally(() => {
    if (keyQueues.get(recordKey) === next) {
      keyQueues.delete(recordKey)
    }
  })
  return next
}

/**
 * Espera a que finalicen todas las escrituras en curso para un ámbito específico.
 */
export async function waitForPendingImageWrites(scopeKey: string): Promise<void> {
  const pending: Promise<void>[] = []
  for (const [key, promise] of keyQueues.entries()) {
    if (key.startsWith(scopeKey + ':') || key === scopeKey) {
      pending.push(promise)
    }
  }
  if (pending.length > 0) {
    await Promise.allSettled(pending)
  }
}

/**
 * Guarda o reemplaza la fotografía de un producto en IndexedDB.
 * Serializa operaciones sobre la misma clave y confirma la transacción
 * (tx.oncomplete) antes de resolver.
 */
export async function saveDemoProductImage(
  scopeInput: DemoImageScope | string,
  productId: string,
  dataUrl: string
): Promise<void> {
  const scopeKey = buildDemoImageScopeKey(scopeInput)
  const recordKey = makeRecordKey(scopeKey, productId)

  return enqueueKeyOperation(recordKey, async () => {
    // Evitar escrituras idénticas innecesarias
    if (memoryImageCache.get(recordKey) === dataUrl) {
      return
    }

    const db = await openDatabase()
    if (!db) {
      memoryImageCache.set(recordKey, dataUrl)
      return
    }

    return new Promise<void>((resolve, reject) => {
      try {
        const tx = db.transaction(STORE_NAME, 'readwrite')
        const store = tx.objectStore(STORE_NAME)
        const record = {
          key: recordKey,
          scopeKey,
          productId,
          dataUrl,
          updatedAt: Date.now(),
        }
        const req = store.put(record)

        tx.oncomplete = () => {
          memoryImageCache.set(recordKey, dataUrl)
          resolve()
        }
        tx.onerror = () => {
          reject(tx.error || new Error('Fallo transaccional al persistir fotografía'))
        }
        tx.onabort = () => {
          reject(new Error('Transacción abortada'))
        }
        req.onerror = () => {
          reject(req.error || new Error('Error al registrar fotografía en almacén'))
        }
      } catch (err) {
        reject(err)
      }
    })
  })
}

/**
 * Obtiene la fotografía de un producto específico desde IndexedDB o memoria.
 */
export async function getDemoProductImage(
  scopeInput: DemoImageScope | string,
  productId: string
): Promise<string | null> {
  const scopeKey = buildDemoImageScopeKey(scopeInput)
  const recordKey = makeRecordKey(scopeKey, productId)

  if (memoryImageCache.has(recordKey)) {
    return memoryImageCache.get(recordKey) || null
  }

  const db = await openDatabase()
  if (!db) return null

  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, 'readonly')
      const store = tx.objectStore(STORE_NAME)
      const req = store.get(recordKey)
      req.onsuccess = () => {
        const dataUrl = req.result ? req.result.dataUrl : null
        if (dataUrl) memoryImageCache.set(recordKey, dataUrl)
        resolve(dataUrl)
      }
      req.onerror = () => resolve(null)
    } catch {
      resolve(null)
    }
  })
}

/**
 * Elimina la fotografía de un producto en IndexedDB.
 * Serializa la operación y confirma el commit de la transacción antes de resolver.
 */
export async function deleteDemoProductImage(
  scopeInput: DemoImageScope | string,
  productId: string
): Promise<void> {
  const scopeKey = buildDemoImageScopeKey(scopeInput)
  const recordKey = makeRecordKey(scopeKey, productId)

  return enqueueKeyOperation(recordKey, async () => {
    memoryImageCache.delete(recordKey)

    const db = await openDatabase()
    if (!db) return

    return new Promise<void>((resolve, reject) => {
      try {
        const tx = db.transaction(STORE_NAME, 'readwrite')
        const store = tx.objectStore(STORE_NAME)
        const req = store.delete(recordKey)
        tx.oncomplete = () => resolve()
        tx.onerror = () => reject(tx.error || new Error('Fallo al eliminar fotografía'))
        tx.onabort = () => reject(new Error('Transacción abortada al eliminar'))
        req.onerror = () => reject(req.error || new Error('Error al eliminar registro'))
      } catch (err) {
        reject(err)
      }
    })
  })
}

/**
 * Carga un mapa completo de fotografías guardadas para un ámbito específico.
 */
export async function loadDemoProductImages(
  scopeInput: DemoImageScope | string
): Promise<Record<string, string>> {
  const scopeKey = buildDemoImageScopeKey(scopeInput)
  const db = await openDatabase()
  if (!db) {
    const map: Record<string, string> = {}
    for (const [key, value] of memoryImageCache.entries()) {
      if (key.startsWith(scopeKey + ':')) {
        const pid = key.slice(scopeKey.length + 1)
        map[pid] = value
      }
    }
    return map
  }

  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, 'readonly')
      const store = tx.objectStore(STORE_NAME)
      const req = store.getAll()
      req.onsuccess = () => {
        const results = req.result || []
        const map: Record<string, string> = {}
        for (const item of results) {
          if (item && item.key && item.key.startsWith(scopeKey + ':') && item.dataUrl) {
            const pid = item.productId || item.key.slice(scopeKey.length + 1)
            map[pid] = item.dataUrl
            memoryImageCache.set(item.key, item.dataUrl)
          }
        }
        resolve(map)
      }
      req.onerror = () => resolve({})
    } catch {
      resolve({})
    }
  })
}

/**
 * Purga todas las imágenes asociadas a un ámbito específico al reiniciar datos.
 * Awaita escrituras en curso para evitar que un guardado tardío reviva una imagen purgada.
 * Espera tx.oncomplete para asegurar persistencia del borrado en disco.
 */
export async function clearDemoProductImages(scopeInput: DemoImageScope | string): Promise<void> {
  const scopeKey = buildDemoImageScopeKey(scopeInput)

  // Asegurar que ninguna escritura pendiente compita con la purga
  await waitForPendingImageWrites(scopeKey)

  // Limpiar memoria
  for (const key of memoryImageCache.keys()) {
    if (key.startsWith(scopeKey + ':') || key === scopeKey) {
      memoryImageCache.delete(key)
    }
  }

  const db = await openDatabase()
  if (!db) return

  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, 'readwrite')
      const store = tx.objectStore(STORE_NAME)
      const req = store.getAll()
      req.onsuccess = () => {
        const items = req.result || []
        for (const item of items) {
          if (item && item.key && (item.key.startsWith(scopeKey + ':') || item.scopeKey === scopeKey)) {
            store.delete(item.key)
          }
        }
      }
      tx.oncomplete = () => resolve()
      tx.onerror = () => resolve()
      req.onerror = () => resolve()
    } catch {
      resolve()
    }
  })
}
