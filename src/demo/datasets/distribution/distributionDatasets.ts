import type { DemoDatasetMode, DistributionDataset } from '../types'
import type { DistributionData } from '../../../modules/distribution/state/useDistributionStore'

const now = new Date().toISOString()
const dayKey = now.slice(0, 10)

const photoViena = 'https://images.unsplash.com/photo-1597692493666-bfac4f82c4aa?w=500&auto=format&fit=crop&q=80'
const photoChorizo = 'https://images.unsplash.com/photo-1544025162-d76694265947?w=500&auto=format&fit=crop&q=80'
const photoSalchicha = 'https://images.unsplash.com/photo-1585325701165-351af916e581?w=500&auto=format&fit=crop&q=80'

/**
 * Minimum viable tenant state for a freshly created distribution tenant:
 * - Almacén Central base
 * - Ruta Norte principal
 * - 0 productos en catálogo
 * - 0 inventario operativo
 * - 0 despachos, 0 ventas, 0 clientes
 */
export function createEmptyDistributionDataset(): DistributionDataset {
  const data: DistributionData = {
    supportSettings: {
      companyName: 'Distribuidora Demo',
      taxId: '1029384756',
      address: 'Parque Industrial Mz 12',
      phone: '3-3456789',
      receiptHeader: 'Distribuidora Demo',
      receiptFooter: 'Gracias por su preferencia',
      expiryAlertDays: 14,
      creditBlockDays: 7,
      requireQrVerification: true,
      defaultPaperWidth: '80mm',
    },
    products: [],
    routes: [
      { id: 'route-norte', name: 'Ruta Principal', kind: 'route', active: true, tenantId: 'preview-distribution', createdAt: now },
    ],
    warehouses: [
      { id: 'central', name: 'Almacén Central', active: true, tenantId: 'preview-distribution' },
    ],
    customers: [],
    balances: [],
    openDispatches: [],
    sales: [],
    transfers: [],
    lots: [],
    operations: [],
    movements: [],
    claims: [],
    creditStatus: [],
    qrVerifications: [],
    collections: [],
    expenses: [],
    receivables: [],
    closures: [],
    isLoading: false,
    error: null,
  }

  return { data }
}

/**
 * Rich, fully populated operational dataset of an ongoing distribution company.
 * Reflects exact operational source facts verified by distributionEngine:
 * - Viena: 20 kg inicial + 5 kg aumento = 25 kg total despachado
 * - Chorizo: 10 kg despachado
 * - Vendido Viena = 6 kg (retorno esperado 19 kg)
 * - Vendido Chorizo = 3 kg (retorno esperado 7 kg)
 * - Retorno físico Viena = 18.5 kg -> variance -0.5 kg (FALTANTE)
 * - Retorno físico Chorizo = 7.0 kg -> variance 0.0 kg (CUADRADO)
 * - Ventas efectivo: Bs 288
 * - Cobro cartera: Bs 100
 * - Gastos ruta: Bs 20
 * - Efectivo esperado: Bs 368
 */
export function createFullDistributionDataset(): DistributionDataset {
  const data: DistributionData = {
    supportSettings: {
      companyName: 'Distribuidora Demo',
      taxId: '1029384756',
      address: 'Parque Industrial Mz 12',
      phone: '3-3456789',
      receiptHeader: 'Distribuidora Demo',
      receiptFooter: 'Gracias por su preferencia • Comprobante de Entrega',
      expiryAlertDays: 14,
      creditBlockDays: 7,
      requireQrVerification: true,
      defaultPaperWidth: '80mm',
    },
    products: [
      {
        id: 'p-viena',
        name: 'Viena Especial',
        photoDataUrl: photoViena,
        category: 'Embutidos',
        presentation: 'A granel por kilogramo',
        unitType: 'kg',
        productionCost: 28,
        minimumStock: 50,
        referencePrice: 42,
        active: true,
        sortOrder: 1,
        tenantId: 'preview-distribution',
        createdAt: now,
      },
      {
        id: 'p-chorizo',
        name: 'Chorizo Parrillero',
        photoDataUrl: photoChorizo,
        category: 'Embutidos',
        presentation: 'A granel por kilogramo',
        unitType: 'kg',
        productionCost: 32,
        minimumStock: 30,
        referencePrice: 48,
        active: true,
        sortOrder: 2,
        tenantId: 'preview-distribution',
        createdAt: now,
      },
      {
        id: 'p-salchicha',
        name: 'Salchicha Frankfurt',
        photoDataUrl: photoSalchicha,
        category: 'Paquetes',
        presentation: 'Paquete 12 unidades (aprox. 500 g)',
        unitType: 'package',
        productionCost: 20,
        minimumStock: 40,
        referencePrice: 32,
        active: true,
        sortOrder: 3,
        tenantId: 'preview-distribution',
        createdAt: now,
      },
    ],
    routes: [
      { id: 'route-norte', name: 'Ruta Norte #2', kind: 'route', active: true, tenantId: 'preview-distribution', createdAt: now },
      { id: 'route-sur', name: 'Ruta Sur Express', kind: 'route', active: true, tenantId: 'preview-distribution', createdAt: now },
    ],
    warehouses: [
      { id: 'central', name: 'Almacén Central', active: true, tenantId: 'preview-distribution' },
    ],
    customers: [
      {
        id: 'c-martha',
        name: 'Tienda Doña Martha',
        identityNumber: '8392019',
        customerCode: 'CLI-001',
        phone: '70012345',
        routeId: 'route-norte',
        active: true,
        tenantId: 'preview-distribution',
        createdAt: now,
        createdBy: 'admin',
      },
      {
        id: 'c-sol',
        name: 'Minimarket El Sol',
        identityNumber: '4839201',
        customerCode: 'CLI-002',
        phone: '70098765',
        routeId: 'route-norte',
        active: true,
        tenantId: 'preview-distribution',
        createdAt: now,
        createdBy: 'admin',
      },
      {
        id: 'c-central',
        name: 'Abarrotes Central',
        identityNumber: '9201823',
        customerCode: 'CLI-003',
        phone: '71122334',
        routeId: 'route-norte',
        active: true,
        tenantId: 'preview-distribution',
        createdAt: now,
        createdBy: 'admin',
      },
    ],
    balances: [
      {
        id: 'central__p-viena',
        warehouseId: 'central',
        locationKind: 'central',
        productId: 'p-viena',
        productName: 'Viena Especial',
        unitType: 'kg',
        quantity: 180,
        availableQuantity: 180,
        tenantId: 'preview-distribution',
        updatedAt: now,
      },
      {
        id: 'central__p-chorizo',
        warehouseId: 'central',
        locationKind: 'central',
        productId: 'p-chorizo',
        productName: 'Chorizo Parrillero',
        unitType: 'kg',
        quantity: 95,
        availableQuantity: 95,
        tenantId: 'preview-distribution',
        updatedAt: now,
      },
      {
        id: 'central__p-salchicha',
        warehouseId: 'central',
        locationKind: 'central',
        productId: 'p-salchicha',
        productName: 'Salchicha Frankfurt',
        unitType: 'package',
        quantity: 120,
        availableQuantity: 120,
        tenantId: 'preview-distribution',
        updatedAt: now,
      },
    ],
    openDispatches: [
      {
        id: 'disp-01',
        tenantId: 'preview-distribution',
        branchId: 'main',
        createdAt: now,
        createdBy: 'admin',
        dayKey,
        schemaVersion: 1,
        routeId: 'route-norte',
        routeName: 'Ruta Norte #2',
        distributorUid: 'v1',
        distributorName: 'Hugo Distribuidor',
        status: 'open',
        lines: [
          { productId: 'p-viena', productName: 'Viena Especial', unitType: 'kg', quantity: 20 },
          { productId: 'p-chorizo', productName: 'Chorizo Parrillero', unitType: 'kg', quantity: 10 },
        ],
        additions: [
          {
            id: 'add-01',
            createdAt: now,
            createdBy: 'admin',
            createdByName: 'Administrador',
            note: 'Aumento en ruta por alta demanda',
            quantityByProduct: [{ productId: 'p-viena', productName: 'Viena Especial', unitType: 'kg', quantity: 5 }],
          },
        ],
      },
    ],
    sales: [
      {
        id: 'sale-01',
        operationId: 'op-s1',
        tenantId: 'preview-distribution',
        branchId: 'main',
        createdAt: now,
        createdBy: 'v1',
        dayKey,
        schemaVersion: 1,
        sourceLocation: 'route',
        routeId: 'route-norte',
        routeName: 'Ruta Norte #2',
        sellerUid: 'v1',
        sellerName: 'Hugo Distribuidor',
        dispatchId: 'disp-01',
        customerId: 'c-martha',
        customerName: 'Tienda Doña Martha',
        customerCode: 'CLI-001',
        lines: [
          {
            productId: 'p-viena',
            productNameSnapshot: 'Viena Especial',
            quantity: 6,
            unitType: 'kg',
            actualUnitPrice: 42,
            subtotal: 252,
          },
          {
            productId: 'p-chorizo',
            productNameSnapshot: 'Chorizo Parrillero',
            quantity: 3,
            unitType: 'kg',
            actualUnitPrice: 65,
            subtotal: 195,
          },
        ],
        total: 447,
        paymentKind: 'mixed',
        cashAmount: 288,
        qrAmount: 0,
        creditAmount: 159,
      },
    ],
    transfers: [],
    lots: [],
    operations: [],
    movements: [],
    claims: [],
    creditStatus: [],
    qrVerifications: [],
    collections: [
      {
        id: 'col-01',
        operationId: 'op-col1',
        tenantId: 'preview-distribution',
        branchId: 'main',
        createdAt: now,
        createdBy: 'v1',
        dayKey,
        schemaVersion: 2,
        receivableId: 'rec-01',
        customerId: 'c-sol',
        customerName: 'Minimarket El Sol',
        routeId: 'route-norte',
        collectedByUid: 'v1',
        collectedByName: 'Hugo Distribuidor',
        amount: 100,
        method: 'cash',
      },
    ],
    expenses: [
      {
        id: 'exp-01',
        operationId: 'op-exp1',
        tenantId: 'preview-distribution',
        branchId: 'main',
        createdAt: now,
        createdBy: 'v1',
        dayKey,
        schemaVersion: 2,
        concept: 'Combustible camión ruta norte',
        amount: 20,
        routeId: 'route-norte',
        routeName: 'Ruta Norte #2',
        registeredByUid: 'v1',
        registeredByName: 'Hugo Distribuidor',
      },
    ],
    receivables: [
      {
        id: 'rec-01',
        tenantId: 'preview-distribution',
        branchId: 'main',
        createdAt: now,
        createdBy: 'v1',
        dayKey,
        schemaVersion: 2,
        saleId: 'sale-01',
        customerId: 'c-martha',
        customerName: 'Tienda Doña Martha',
        routeId: 'route-norte',
        distributorUid: 'v1',
        distributorName: 'Hugo Distribuidor',
        originalAmount: 159,
        paidAmount: 0,
        balance: 159,
        status: 'OPEN',
        saleLines: [],
      },
    ],
    closures: [],
    isLoading: false,
    error: null,
  }

  return { data }
}

export function createDistributionDataset(mode: DemoDatasetMode = 'full'): DistributionDataset {
  return mode === 'empty' ? createEmptyDistributionDataset() : createFullDistributionDataset()
}
