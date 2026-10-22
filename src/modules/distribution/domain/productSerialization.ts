import type { DistProduct } from '../types.ts'

type ProductInput = Omit<DistProduct, 'tenantId' | 'createdAt'> & { createdAt?: string }

const OPTIONAL_PRODUCT_FIELDS = [
  'photoDataUrl',
  'presentation',
  'productionCost',
  'minimumStock',
  'approximateWeightKg',
  'sku',
  'saleUnitLabel',
  'presentationContent',
  'deleted',
  'deletedAt',
  'deletedBy',
] as const satisfies readonly (keyof ProductInput)[]

/**
 * Produces a plain, undefined-free product document and an explicit list of
 * optional fields to remove from an existing Firestore document.
 */
export function serializeProductForSave(product: ProductInput) {
  const emptyOptionalStrings = new Set<string>([
    'photoDataUrl',
    'presentation',
    'sku',
    'saleUnitLabel',
  ] as const)
  const shouldDelete = (field: typeof OPTIONAL_PRODUCT_FIELDS[number]) => {
    const value = product[field]
    return value === undefined || (emptyOptionalStrings.has(field) && value === '')
  }
  const deleteFields = OPTIONAL_PRODUCT_FIELDS.filter(shouldDelete)
  const deleted = new Set<string>(deleteFields)
  const values = Object.fromEntries(
    Object.entries(product).filter(([field, value]) => value !== undefined && !deleted.has(field)),
  ) as Partial<ProductInput>

  return {
    values,
    deleteFields,
  }
}
