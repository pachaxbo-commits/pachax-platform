import type { ProductImageAdapter } from '../../modules/restaurant/domain/productImageAdapter.ts'
import { validateImageFile, compressProductImage } from './demoProductImageStorage.ts'

/**
 * Adaptador de demostración local para fotografías de productos.
 * Utiliza compresión canvas y almacenamiento cliente, protegiendo
 * a entornos reales de subir base64 o depender de Firebase Storage.
 */
export function createDemoProductImageAdapter(): ProductImageAdapter {
  return {
    isSupported: true,
    notice: 'Almacenamiento de demostración en cliente (IndexedDB / Canvas)',
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
