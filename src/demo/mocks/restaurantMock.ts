import type { CatalogCategory, Order, OrderItem, Product, ProductExtra } from '../../types'

export interface RestaurantTable {
  id: string
  number: number
  name: string
  capacity: number
  status: 'available' | 'occupied' | 'bill_requested' | 'reserved'
  openedBy?: string
  activeOrderId?: string
  diners?: number
  openedAt?: string
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

export interface RestaurantCustomer {
  id: string
  name: string
  phone: string
  email?: string
  visits: number
  totalSpent: number
  notes?: string
}

export const RESTAURANT_CATEGORIES: CatalogCategory[] = [
  { id: 'cat-entradas', name: 'Entradas', emoji: '🥗', sortOrder: 1, isVisible: true, isActive: true },
  { id: 'cat-fuertes', name: 'Platos Principales', emoji: '🥩', sortOrder: 2, isVisible: true, isActive: true },
  { id: 'cat-bebidas', name: 'Bebidas', emoji: '🍷', sortOrder: 3, isVisible: true, isActive: true },
  { id: 'cat-postres', name: 'Postres', emoji: '🍰', sortOrder: 4, isVisible: true, isActive: true },
]

export const RESTAURANT_PRODUCTS: Product[] = [
  {
    id: 'prod-1',
    categoryId: 'cat-fuertes',
    name: 'Lomo a la Pimienta',
    description: 'Medallón de lomo fino 280g con salsa pimienta negra y puré rústico',
    price: 58,
    image: '',
    availability: 'available',
    sortOrder: 1,
    isVisible: true,
    isActive: true,
  },
  {
    id: 'prod-2',
    categoryId: 'cat-fuertes',
    name: 'Hamburguesa Artesanal',
    description: 'Carne madurada 200g, queso cheddar inglés, cebolla caramelizada y papas',
    price: 42,
    image: '',
    availability: 'available',
    sortOrder: 2,
    isVisible: true,
    isActive: true,
  },
  {
    id: 'prod-3',
    categoryId: 'cat-entradas',
    name: 'Bruschettas Mediterráneas',
    description: 'Pan de masa madre tostado, tomates confitados, albahaca y aceite de oliva',
    price: 24,
    image: '',
    availability: 'available',
    sortOrder: 3,
    isVisible: true,
    isActive: true,
  },
  {
    id: 'prod-4',
    categoryId: 'cat-bebidas',
    name: 'Limonada Menta & Jengibre',
    description: 'Zumo de limón fresco, infusión de menta y rodajas de jengibre',
    price: 15,
    image: '',
    availability: 'available',
    sortOrder: 4,
    isVisible: true,
    isActive: true,
  },
  {
    id: 'prod-5',
    categoryId: 'cat-bebidas',
    name: 'Copa de Vino Tinto Reserva',
    description: 'Varietal Cabernet Sauvignon del valle central',
    price: 28,
    image: '',
    availability: 'available',
    sortOrder: 5,
    isVisible: true,
    isActive: true,
  },
  {
    id: 'prod-6',
    categoryId: 'cat-postres',
    name: 'Tiramisú Tradicional',
    description: 'Capas de bizcocho café espresso y crema mascarpone',
    price: 22,
    image: '',
    availability: 'available',
    sortOrder: 6,
    isVisible: true,
    isActive: true,
  },
]

export const RESTAURANT_EXTRAS: ProductExtra[] = [
  { id: 'ext-1', name: 'Papas rústicas extra', price: 10 },
  { id: 'ext-2', name: 'Queso fundido extra', price: 8 },
  { id: 'ext-3', name: 'Salsa tártara artesanal', price: 5 },
]

export const INITIAL_TABLES: RestaurantTable[] = [
  { id: 't1', number: 1, name: 'Mesa 1', capacity: 2, status: 'occupied', activeOrderId: 'ord-101', diners: 2, openedAt: '13:10' },
  { id: 't2', number: 2, name: 'Mesa 2', capacity: 4, status: 'available' },
  { id: 't3', number: 3, name: 'Mesa 3', capacity: 4, status: 'bill_requested', activeOrderId: 'ord-102', diners: 3, openedAt: '12:45' },
  { id: 't4', number: 4, name: 'Mesa 4', capacity: 6, status: 'occupied', activeOrderId: 'ord-103', diners: 5, openedAt: '13:20' },
  { id: 't5', number: 5, name: 'Mesa 5', capacity: 2, status: 'available' },
  { id: 't6', number: 6, name: 'Mesa 6', capacity: 2, status: 'reserved' },
  { id: 't7', number: 7, name: 'Mesa 7', capacity: 4, status: 'available' },
  { id: 't8', number: 8, name: 'Mesa 8', capacity: 4, status: 'available' },
  { id: 't9', number: 9, name: 'Mesa 9', capacity: 8, status: 'available' },
  { id: 't10', number: 10, name: 'Mesa 10 (Terraza)', capacity: 4, status: 'occupied', activeOrderId: 'ord-104', diners: 2, openedAt: '13:30' },
  { id: 't11', number: 11, name: 'Mesa 11 (Terraza)', capacity: 4, status: 'available' },
  { id: 't12', number: 12, name: 'Mesa 12 (Barra)', capacity: 2, status: 'available' },
]

const emptyModifiers = { extras: [], options: [], note: '' }

function makeItem(id: string, productId: string, name: string, basePrice: number, quantity: number): OrderItem {
  return {
    id,
    productId,
    name,
    basePrice,
    quantity,
    lineTotal: basePrice * quantity,
    modifiers: emptyModifiers,
  }
}

export const INITIAL_RESTAURANT_ORDERS: Order[] = [
  {
    id: 'ord-101',
    sequence: 42,
    displayNumber: '042',
    status: 'preparing',
    orderSource: 'local',
    fulfillmentType: 'table',
    tableInfo: 'Mesa 1',
    customerName: 'Carlos Mendizábal',
    total: 144,
    productSubtotal: 144,
    paymentStatus: 'pending',
    paymentMethod: null,
    expectedPaymentMethod: 'cash',
    payment: { method: 'cash', cashAmount: 144, qrAmount: 0, cashReceived: 144, change: 0 },
    items: [
      makeItem('l1', 'prod-1', 'Lomo a la Pimienta', 58, 2),
      makeItem('l2', 'prod-4', 'Limonada Menta & Jengibre', 15, 2),
    ],
    createdAt: new Date(Date.now() - 25 * 60000).toISOString(),
    createdBy: 'Mesero Ana',
  },
  {
    id: 'ord-102',
    sequence: 40,
    displayNumber: '040',
    status: 'ready',
    orderSource: 'local',
    fulfillmentType: 'table',
    tableInfo: 'Mesa 3',
    customerName: 'Valeria Torrico',
    total: 108,
    productSubtotal: 108,
    paymentStatus: 'pending',
    paymentMethod: 'cash',
    expectedPaymentMethod: 'cash',
    payment: { method: 'cash', cashAmount: 108, qrAmount: 0, cashReceived: 108, change: 0 },
    items: [
      makeItem('l3', 'prod-2', 'Hamburguesa Artesanal', 42, 2),
      makeItem('l4', 'prod-3', 'Bruschettas Mediterráneas', 24, 1),
    ],
    createdAt: new Date(Date.now() - 45 * 60000).toISOString(),
    createdBy: 'Mesero Ana',
  },
  {
    id: 'ord-103',
    sequence: 43,
    displayNumber: '043',
    status: 'pending',
    orderSource: 'local',
    fulfillmentType: 'table',
    tableInfo: 'Mesa 4',
    customerName: 'Mauricio Paz',
    total: 198,
    productSubtotal: 198,
    paymentStatus: 'pending',
    paymentMethod: null,
    expectedPaymentMethod: 'qr',
    payment: { method: 'qr', cashAmount: 0, qrAmount: 198, cashReceived: 0, change: 0 },
    items: [
      makeItem('l5', 'prod-1', 'Lomo a la Pimienta', 58, 3),
      makeItem('l6', 'prod-3', 'Bruschettas Mediterráneas', 24, 1),
    ],
    createdAt: new Date(Date.now() - 10 * 60000).toISOString(),
    createdBy: 'Mesero Luis',
  },
  {
    id: 'ord-104',
    sequence: 44,
    displayNumber: '044',
    status: 'preparing',
    orderSource: 'local',
    fulfillmentType: 'table',
    tableInfo: 'Mesa 10 (Terraza)',
    customerName: 'Alejandra Ríos',
    total: 78,
    productSubtotal: 78,
    paymentStatus: 'pending',
    paymentMethod: null,
    expectedPaymentMethod: 'cash',
    payment: { method: 'cash', cashAmount: 78, qrAmount: 0, cashReceived: 78, change: 0 },
    items: [
      makeItem('l7', 'prod-2', 'Hamburguesa Artesanal', 42, 1),
      makeItem('l8', 'prod-5', 'Copa de Vino Tinto Reserva', 28, 1),
      makeItem('l9', 'ext-1', 'Papas rústicas extra', 8, 1),
    ],
    createdAt: new Date(Date.now() - 15 * 60000).toISOString(),
    createdBy: 'Mesero Ana',
  },
]

export const RESTAURANT_INGREDIENTS: RestaurantIngredient[] = [
  { id: 'ing-1', name: 'Lomo Fino Vacuno', category: 'Carnes', unit: 'kg', currentStock: 18.5, minStock: 10, unitCost: 42 },
  { id: 'ing-2', name: 'Papas Rústicas Holandesa', category: 'Verduras', unit: 'kg', currentStock: 45, minStock: 25, unitCost: 4 },
  { id: 'ing-3', name: 'Queso Mascarpone Italiano', category: 'Lácteos', unit: 'kg', currentStock: 6.2, minStock: 4, unitCost: 65 },
  { id: 'ing-4', name: 'Vino Tinto Cabernet Sauvignon', category: 'Bebidas', unit: 'botella', currentStock: 24, minStock: 12, unitCost: 35 },
  { id: 'ing-5', name: 'Café Grano Tostado Especial', category: 'Café', unit: 'kg', currentStock: 8, minStock: 5, unitCost: 55 },
  { id: 'ing-6', name: 'Pan Brioche Artesanal', category: 'Panadería', unit: 'unidad', currentStock: 32, minStock: 20, unitCost: 2.5 },
]

export const RESTAURANT_CUSTOMERS: RestaurantCustomer[] = [
  { id: 'c1', name: 'Carlos Mendizábal', phone: '70112233', email: 'carlos.m@example.test', visits: 12, totalSpent: 1420, notes: 'Prefiere mesa en terraza' },
  { id: 'c2', name: 'Valeria Torrico', phone: '71223344', email: 'valeria.t@example.test', visits: 8, totalSpent: 960, notes: 'Cliente frecuente mediodía' },
  { id: 'c3', name: 'Mauricio Paz', phone: '72334455', visits: 5, totalSpent: 750 },
  { id: 'c4', name: 'Alejandra Ríos', phone: '73445566', email: 'ale.rios@example.test', visits: 15, totalSpent: 2180, notes: 'Membresía corporativa' },
]

export const RESTAURANT_STAFF = [
  { id: 'u1', name: 'Fernando Suárez', email: 'fernando@bistrodemo.test', role: 'owner', roleName: 'Dueño', active: true },
  { id: 'u2', name: 'Camila Morales', email: 'camila@bistrodemo.test', role: 'admin', roleName: 'Administración', active: true },
  { id: 'u3', name: 'Roberto Vaca', email: 'roberto@bistrodemo.test', role: 'cashier', roleName: 'Caja', active: true },
  { id: 'u4', name: 'Ana Beltrán', email: 'ana@bistrodemo.test', role: 'waiter', roleName: 'Mesero', active: true },
  { id: 'u5', name: 'Chef Mario', email: 'mario@bistrodemo.test', role: 'kitchen', roleName: 'Cocina', active: true },
  { id: 'u6', name: 'Hugo Almacén', email: 'hugo@bistrodemo.test', role: 'inventory', roleName: 'Inventario', active: true },
]
