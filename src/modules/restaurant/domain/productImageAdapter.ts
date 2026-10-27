export interface ProductImageValidationResult {
  ok: boolean
  error?: string
}

export interface ProductImageAdapter {
  isSupported: boolean
  notice?: string
  driver?: 'indexeddb' | 'memory' | 'disabled'
  validateImage?: (file: File) => ProductImageValidationResult
  processImage?: (file: File) => Promise<{ ok: boolean; dataUrl?: string; error?: string }>
}

export const DISABLED_PRODUCT_IMAGE_ADAPTER: ProductImageAdapter = {
  isSupported: false,
  driver: 'disabled',
  notice: 'Almacenamiento de fotografías empresariales deshabilitado (requiere canal Cloud Storage corporativo).',
}
