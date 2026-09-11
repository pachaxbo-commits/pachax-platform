import type { DistProduct, DistRoute } from '../types'
// Ejemplos opcionales: ningún catálogo comercial del cliente original.
type SeedProduct = Pick<DistProduct, 'id' | 'name' | 'category' | 'presentation' | 'unitType' | 'referencePrice' | 'approximateWeightKg'>
export const PACHAX_PRODUCTS: SeedProduct[] = [
 { id: 'demo-granel', name: 'Producto a granel de ejemplo', category: 'Granel', presentation: 'Venta por kg', unitType: 'kg', referencePrice: 10 },
 { id: 'demo-paquete', name: 'Producto en paquete de ejemplo', category: 'Paquetes', presentation: 'Paquete', unitType: 'package', referencePrice: 15 },
]
export const PACHAX_ROUTES: Pick<DistRoute, 'id' | 'name' | 'kind'>[] = [
 { id: 'route-demo', name: 'Ruta de ejemplo', kind: 'route' },
 { id: 'route-directa', name: 'Venta directa', kind: 'direct' },
]
export const PACHAX_SUGGESTED_DISTRIBUTORS = []
