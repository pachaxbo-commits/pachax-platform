/**
 * Almacenamiento local aislado en IndexedDB para fotografías de productos en el entorno demo.
 *
 * Principios de seguridad y aislamiento:
 * 1. Zero Firebase Storage / Zero servicios de red: las imágenes permanecen 100% en el cliente.
 * 2. Sanatización y validación estricta: rechazo de SVG, scripts y formatos ejecutables.
 * 3. Compresión local vía Canvas a WebP/JPEG optimizado (máx 800px, calidad 0.82).
 * 4. Persistencia aislada por prefijo de demo ('hamburger' o 'restaurant') y productId.
 * 5. Ciclo de vida: persiste tras recargas de sesión; se purga completamente al pulsar "Reiniciar demo".
 */

const DB_NAME = 'pachax_demo_media_v1'
const STORE_NAME = 'product_images'
const DB_VERSION = 1

const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp']
const MAX_RAW_FILE_SIZE = 10 * 1024 * 1024 // 10 MB máx antes de comprimir

export interface ImageValidationResult {
  ok: boolean
  error?: string
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

          // Intentar WebP primero; si el navegador no lo soporta, fallback a JPEG
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

// Inicialización diferida de IndexedDB con soporte SSR seguro
function openDatabase(): Promise<IDBDatabase | null> {
  if (typeof window === 'undefined' || !('indexedDB' in window)) {
    return Promise.resolve(null)
  }

  return new Promise((resolve) => {
    try {
      const request = indexedDB.open(DB_NAME, DB_VERSION)

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'key' })
        }
      }

      request.onsuccess = () => resolve(request.result)
      request.onerror = () => {
        console.warn('IndexedDB no está disponible en este navegador o modo privado. Operando en memoria.')
        resolve(null)
      }
    } catch {
      resolve(null)
    }
  })
}

function makeRecordKey(demoKey: string, productId: string): string {
  return `${demoKey}:${productId}`
}

/**
 * Guarda o reemplaza la fotografía de un producto en IndexedDB.
 */
export async function saveDemoProductImage(
  demoKey: string,
  productId: string,
  dataUrl: string
): Promise<void> {
  const db = await openDatabase()
  if (!db) return

  return new Promise((resolve, reject) => {
    try {
      const tx = db.transaction(STORE_NAME, 'readwrite')
      const store = tx.objectStore(STORE_NAME)
      const record = {
        key: makeRecordKey(demoKey, productId),
        demoKey,
        productId,
        dataUrl,
        updatedAt: Date.now(),
      }
      const req = store.put(record)
      req.onsuccess = () => resolve()
      req.onerror = () => reject(req.error)
    } catch (err) {
      reject(err)
    }
  })
}

/**
 * Obtiene la fotografía de un producto específico desde IndexedDB.
 */
export async function getDemoProductImage(
  demoKey: string,
  productId: string
): Promise<string | null> {
  const db = await openDatabase()
  if (!db) return null

  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, 'readonly')
      const store = tx.objectStore(STORE_NAME)
      const req = store.get(makeRecordKey(demoKey, productId))
      req.onsuccess = () => {
        resolve(req.result ? req.result.dataUrl : null)
      }
      req.onerror = () => resolve(null)
    } catch {
      resolve(null)
    }
  })
}

/**
 * Elimina la fotografía de un producto en IndexedDB.
 */
export async function deleteDemoProductImage(
  demoKey: string,
  productId: string
): Promise<void> {
  const db = await openDatabase()
  if (!db) return

  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, 'readwrite')
      const store = tx.objectStore(STORE_NAME)
      const req = store.delete(makeRecordKey(demoKey, productId))
      req.onsuccess = () => resolve()
      req.onerror = () => resolve()
    } catch {
      resolve()
    }
  })
}

/**
 * Carga un mapa completo de fotografías guardadas para una demo específica.
 */
export async function loadDemoProductImages(
  demoKey: string
): Promise<Record<string, string>> {
  const db = await openDatabase()
  if (!db) return {}

  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, 'readonly')
      const store = tx.objectStore(STORE_NAME)
      const req = store.getAll()
      req.onsuccess = () => {
        const results = req.result || []
        const map: Record<string, string> = {}
        for (const item of results) {
          if (item && item.demoKey === demoKey && item.productId && item.dataUrl) {
            map[item.productId] = item.dataUrl
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
 * Purga todas las imágenes asociadas a una demo al reiniciar los datos.
 */
export async function clearDemoProductImages(demoKey: string): Promise<void> {
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
          if (item && item.demoKey === demoKey) {
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
