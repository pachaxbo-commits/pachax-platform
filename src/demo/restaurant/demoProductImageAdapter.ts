import type { ProductImageAdapter } from '../../modules/restaurant/domain/productImageAdapter.ts'
import {
  validateImageFile,
  compressProductImage,
  getDemoImageStorageDriver,
} from './demoProductImageStorage.ts'

/**
 * Adaptador de demostración local para fotografías de productos.
 * Utiliza compresión canvas y almacenamiento cliente, protegiendo
 * a entornos reales de subir base64 o depender de Firebase Storage.
 */
export function createDemoProductImageAdapter(): ProductImageAdapter {
  const driver = getDemoImageStorageDriver()
  const notice =
    driver === 'memory'
      ? 'Almacenamiento en memoria temporal (IndexedDB no disponible en este entorno: no persistirá tras recargar).'
      : 'Almacenamiento de demostración en cliente (IndexedDB / Canvas)'

  return {
    isSupported: true,
    driver,
    notice,
    validateImage: (file: File) => validateImageFile(file),
    processImage: async (file: File) => {
      const validation = validateImageFile(file)
      if (!validation.ok) {
        return { ok: false, error: validation.error }
      }
      try {
        const dataUrl = await compressProductImage(file, 800, 0.82)
        return { ok: true, dataUrl }
      } catch (err) {
        return {
          ok: false,
          error: err instanceof Error ? err.message : 'Error al comprimir fotografía.',
        }
      }
    },
  }
}
