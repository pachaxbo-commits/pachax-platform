import { demoProductsForProfile, DISTRIBUTION_PROFILES, mergeProfileCategories, profileSuggestions, validateCatalogProduct } from '../catalog.ts'

const assert = (condition: unknown, message: string) => { if (!condition) throw new Error(message) }
assert(DISTRIBUTION_PROFILES.length === 9, 'incluye nueve rubros sugeridos')
for (const profile of DISTRIBUTION_PROFILES) assert(profileSuggestions(profile.id).length > 0, `sugerencias ${profile.id}`)
assert(validateCatalogProduct({ name: 'Refresco', category: 'Gaseosas', unitType: 'package', presentationContent: { amount: 12, unit: 'unit' } }) === null, 'caja de 12 se administra como SKU de caja')
assert(validateCatalogProduct({ name: 'Detergente', category: 'Limpieza', unitType: 'package', presentationContent: { amount: 1, unit: 'l' } }) === null, 'contenido volumétrico es descriptivo')
assert(validateCatalogProduct({ name: 'Arroz', category: 'Granos', unitType: 'package', presentationContent: { amount: 5, unit: 'kg' } }) === null, 'contenido de masa se conserva sin conversión')
assert(validateCatalogProduct({ name: '', category: 'Otros', unitType: 'unit' }) !== null, 'nombre requerido')
assert(validateCatalogProduct({ name: 'Tornillo', category: 'Otros', unitType: 'unit', saleUnitLabel: '<script>' }) !== null, 'unidad no permite markup')
assert(validateCatalogProduct({ name: 'Arroz a granel', category: 'Granos', unitType: 'kg', saleUnitLabel: 'saco' }) !== null, 'producto vendido por peso conserva kg como unidad operativa')
for (const profile of ['food', 'beverages', 'cleaning', 'hardware', 'pharmacy'] as const) {
  const products = demoProductsForProfile(profile)
  assert(products.length === 3 && products.every(product => product.sku && product.presentationContent && product.unitType === 'package'), `muestras SKU seguras para ${profile}`)
}
const oldCategory = [{ id: 'legacy', name: 'Embutidos', active: false }]
const changed = mergeProfileCategories(oldCategory, 'pets')
assert(changed.some(category => category.id === 'legacy' && category.name === 'Embutidos' && !category.active), 'cambio de rubro conserva categorías e historial')
console.log('Distribution catalog: PASS (rubro, categories, safe SKU presentation)')
