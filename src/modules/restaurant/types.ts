export interface RestaurantTable {
  id: string
  number?: number
  name: string
  capacity: number
  status: 'available' | 'occupied' | 'bill_requested' | 'reserved'
  sectorId?: string
  shape?: 'square' | 'rectangle' | 'round'
  sortOrder?: number
  active?: boolean
  createdAt?: string
  updatedAt?: string
  archivedAt?: string
  openedBy?: string
  activeOrderId?: string
  diners?: number
  openedAt?: string
}

export interface RestaurantSector {
  id: string
  name: string
  description?: string
  sortOrder: number
  active: boolean
  createdAt: string
  updatedAt: string
}

export const DEFAULT_RESTAURANT_SECTORS: RestaurantSector[] = [
  { id: 'sector-salon', name: 'Salón principal', sortOrder: 0, active: true, createdAt: '2026-09-01T00:00:00Z', updatedAt: '2026-09-01T00:00:00Z' },
  { id: 'sector-terraza', name: 'Terraza', sortOrder: 1, active: true, createdAt: '2026-09-01T00:00:00Z', updatedAt: '2026-09-01T00:00:00Z' },
  { id: 'sector-barra', name: 'Barra', sortOrder: 2, active: true, createdAt: '2026-09-01T00:00:00Z', updatedAt: '2026-09-01T00:00:00Z' },
]

export type RestaurantRole = 'owner' | 'admin' | 'cashier' | 'waiter' | 'kitchen' | 'inventory'

export interface RestaurantMember {
  id: string
  name: string
  email: string
  role: RestaurantRole
  roleName?: string
  active: boolean
}

export interface RestaurantCustomer {
  id: string
  name: string
  phone: string
  email?: string
  visits: number
  totalSpent: number
  notes?: string
}

export interface RestaurantIngredient {
  id: string
  name: string
  category: string
  unit: string
  currentStock: number
  minStock: number
  unitCost: number
}
