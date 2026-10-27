export interface ProductImageValidationResult {
  ok: boolean
  error?: string
}

export interface ProductImageAdapter {
  isSupported: boolean
  notice?: string
  validateImage?: (file: File) => ProductImageValidationResult
  processImage?: (file: File) => Promise<{ ok: boolean; dataUrl?: string; error?: string }>
}

export const DISABLED_PRODUCT_IMAGE_ADAPTER: ProductImageAdapter = {
  isSupported: false,
  notice: 'Almacenamiento de fotografías empresariales deshabilitado (requiere canal Cloud Storage corporativo).',
}
