import type { DemoDatasetMode, RetailDataset } from '../types'
import {
  INITIAL_RETAIL_PRODUCTS,
  INITIAL_RETAIL_SALES,
  type RetailProduct,
  type CompletedRetailSale,
} from '../../mocks/retailMock'

/**
 * Minimum viable tenant state for a freshly created quick retail business:
 * - Empty catalogue (ready to register products by weight or unit)
 * - 0 historic sales
 * - Cashier ready to start first session
 */
export function createEmptyRetailDataset(): RetailDataset {
  return {
    products: [],
    sales: [],
  }
}

/**
 * Rich, fully populated operational dataset of an ongoing retail shop:
 * - Products sold by weight in grams (Helado artesanal, Queso criollo)
 * - Products sold by unit (Café Latte, Croissant, etc.)
 * - Completed sales with cash, QR and mixed settlements
 */
export function createFullRetailDataset(): RetailDataset {
  const products: RetailProduct[] = INITIAL_RETAIL_PRODUCTS.map((p) => ({ ...p }))
  const sales: CompletedRetailSale[] = INITIAL_RETAIL_SALES.map((s) => ({
    ...s,
    lines: s.lines.map((l) => ({ ...l })),
  }))

  return {
    products,
    sales,
  }
}

export function createRetailDataset(mode: DemoDatasetMode = 'full'): RetailDataset {
  return mode === 'empty' ? createEmptyRetailDataset() : createFullRetailDataset()
}
