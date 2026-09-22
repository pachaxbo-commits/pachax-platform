import type { SaleProduct, SaleLine } from '../../core/sales'
import { createSaleLine } from '../../core/sales'

export interface RetailProduct extends SaleProduct {
  category: string
  sku: string
  currentStock: number // grams or units
  minStock: number
}

export interface RetailCustomer {
  id: string
  name: string
  phone: string
  nitCi?: string
  purchasesCount: number
  totalSpentMinor: number
}

export interface CompletedRetailSale {
  id: string
  receiptNumber: string
  timestamp: string
  lines: SaleLine[]
  totalMinor: number
  paymentKind: 'cash' | 'qr' | 'mixed'
  cashMinor: number
  qrMinor: number
  customerName?: string
  cashierName: string
}

export const INITIAL_RETAIL_PRODUCTS: RetailProduct[] = [
  {
    id: 'ret-1',
    name: 'Helado artesanal',
    category: 'Heladería',
    soldBy: 'weight',
    priceMinor: 6000, // Bs 60.00 / kg
    trackStock: true,
    stockUnit: 'g',
    sku: 'HLD-ART-01',
    currentStock: 12500, // 12.5 kg in grams
    minStock: 3000,
  },
  {
    id: 'ret-2',
    name: 'Café Latte',
    category: 'Cafetería',
    soldBy: 'unit',
    priceMinor: 1800, // Bs 18.00
    trackStock: true,
    stockUnit: 'unit',
    sku: 'CAF-LAT-01',
    currentStock: 48,
    minStock: 15,
  },
  {
    id: 'ret-3',
    name: 'Café Americano',
    category: 'Cafetería',
    soldBy: 'unit',
    priceMinor: 1400, // Bs 14.00
    trackStock: true,
    stockUnit: 'unit',
    sku: 'CAF-AME-01',
    currentStock: 60,
    minStock: 20,
  },
  {
    id: 'ret-4',
    name: 'Té verde en hebras a granel',
    category: 'A granel',
    soldBy: 'weight',
    priceMinor: 8000, // Bs 80.00 / kg
    trackStock: true,
    stockUnit: 'g',
    sku: 'TE-VRD-GRN',
    currentStock: 4800, // 4.8 kg
    minStock: 1000,
  },
  {
    id: 'ret-5',
    name: 'Croissant de Almendras',
    category: 'Repostería',
    soldBy: 'unit',
    priceMinor: 1600, // Bs 16.00
    trackStock: true,
    stockUnit: 'unit',
    sku: 'REP-CRO-01',
    currentStock: 18,
    minStock: 6,
  },
  {
    id: 'ret-6',
    name: 'Galletas surtidas al peso',
    category: 'A granel',
    soldBy: 'weight',
    priceMinor: 4500, // Bs 45.00 / kg
    trackStock: true,
    stockUnit: 'g',
    sku: 'GAL-SRT-GRN',
    currentStock: 8200,
    minStock: 2000,
  },
  {
    id: 'ret-7',
    name: 'Torta de Zanahoria (Porción)',
    category: 'Repostería',
    soldBy: 'unit',
    priceMinor: 2000, // Bs 20.00
    trackStock: true,
    stockUnit: 'unit',
    sku: 'REP-TRT-ZAN',
    currentStock: 12,
    minStock: 4,
  },
]

export const INITIAL_RETAIL_CUSTOMERS: RetailCustomer[] = [
  { id: 'rc-1', name: 'Mariana Zalles', phone: '70554433', nitCi: '4829102', purchasesCount: 14, totalSpentMinor: 46800 },
  { id: 'rc-2', name: 'Javier Andrade', phone: '71665544', nitCi: '3920193', purchasesCount: 9, totalSpentMinor: 28400 },
  { id: 'rc-3', name: 'Patricia Claure', phone: '72776655', purchasesCount: 5, totalSpentMinor: 16200 },
]

export const INITIAL_RETAIL_SALES: CompletedRetailSale[] = [
  {
    id: 'sale-1',
    receiptNumber: 'TCK-00101',
    timestamp: new Date(Date.now() - 40 * 60000).toISOString(),
    lines: [
      createSaleLine(INITIAL_RETAIL_PRODUCTS[0], 325), // 325g helado = 1950 minor (Bs 19.50)
      createSaleLine(INITIAL_RETAIL_PRODUCTS[1], 1),   // 1 café latte = 1800 minor (Bs 18.00)
    ],
    totalMinor: 3750, // Bs 37.50
    paymentKind: 'cash',
    cashMinor: 3750,
    qrMinor: 0,
    customerName: 'Mariana Zalles',
    cashierName: 'Caja 1',
  },
  {
    id: 'sale-2',
    receiptNumber: 'TCK-00102',
    timestamp: new Date(Date.now() - 25 * 60000).toISOString(),
    lines: [
      createSaleLine(INITIAL_RETAIL_PRODUCTS[3], 250), // 250g té verde = 2000 minor (Bs 20.00)
      createSaleLine(INITIAL_RETAIL_PRODUCTS[4], 2),   // 2 croissant = 3200 minor (Bs 32.00)
    ],
    totalMinor: 5200, // Bs 52.00
    paymentKind: 'qr',
    cashMinor: 0,
    qrMinor: 5200,
    customerName: 'Javier Andrade',
    cashierName: 'Caja 1',
  },
  {
    id: 'sale-3',
    receiptNumber: 'TCK-00103',
    timestamp: new Date(Date.now() - 10 * 60000).toISOString(),
    lines: [
      createSaleLine(INITIAL_RETAIL_PRODUCTS[0], 250), // 250g helado = 1500 minor (Bs 15.00)
      createSaleLine(INITIAL_RETAIL_PRODUCTS[1], 1),   // 1 café latte = 1800 minor (Bs 18.00)
      createSaleLine(INITIAL_RETAIL_PRODUCTS[6], 1),   // 1 torta zanahoria = 2000 minor (Bs 20.00)
    ],
    totalMinor: 5300, // Bs 53.00
    paymentKind: 'mixed',
    cashMinor: 2300,
    qrMinor: 3000,
    cashierName: 'Caja 1',
  },
]

export const RETAIL_STAFF = [
  { id: 'ru-1', name: 'Laura Pacheco', email: 'laura@amapolademo.test', role: 'owner', roleName: 'Dueño', active: true },
  { id: 'ru-2', name: 'David Meneses', email: 'david@amapolademo.test', role: 'admin', roleName: 'Administración', active: true },
  { id: 'ru-3', name: 'Andrea Soliz', email: 'andrea@amapolademo.test', role: 'cashier', roleName: 'Caja', active: true },
  { id: 'ru-4', name: 'Lucas Vega', email: 'lucas@amapolademo.test', role: 'sales', roleName: 'Atención / Ventas', active: true },
  { id: 'ru-5', name: 'Paola Mercado', email: 'paola@amapolademo.test', role: 'inventory', roleName: 'Inventario', active: true },
]
