export const RETAIL_PROFILES = [
  { id: 'neighborhood_store', label: 'Tienda de barrio', categories: ['Abarrotes', 'Bebidas', 'Limpieza', 'Hogar'] },
  { id: 'minimarket', label: 'Minimercado', categories: ['Abarrotes', 'Bebidas', 'Lácteos', 'Limpieza'] },
  { id: 'butcher', label: 'Carnicería', categories: ['Res', 'Pollo', 'Cerdo', 'Embutidos'] },
  { id: 'produce_bulk', label: 'Frutería y venta a granel', categories: ['Frutas', 'Verduras', 'Granos', 'A granel'] },
  { id: 'ice_cream', label: 'Heladería', categories: ['Helados', 'Conos y envases', 'Bebidas', 'Postres'] },
  { id: 'bakery', label: 'Panadería y repostería', categories: ['Pan', 'Repostería', 'Pasteles', 'Bebidas'] },
  { id: 'sweets', label: 'Dulcería', categories: ['Dulces', 'Chocolates', 'Snacks', 'Bebidas'] },
  { id: 'general_store', label: 'Comercio general', categories: ['General', 'Bebidas', 'Hogar', 'Otros'] },
] as const

export type RetailProfileId = typeof RETAIL_PROFILES[number]['id']

export function isRetailProfile(value: unknown): value is RetailProfileId {
  return typeof value === 'string' && RETAIL_PROFILES.some(profile => profile.id === value)
}
