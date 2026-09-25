import type { BusinessTemplate, BusinessType, Capability, ModuleDefinition, Permission, RolePreset } from './platform.ts'

const allPermissions: readonly Permission[] = [
  'sales.read', 'sales.create', 'orders.read', 'orders.manage', 'inventory.read', 'inventory.manage',
  'products.manage', 'customers.read', 'customers.manage', 'credits.read', 'credits.collect',
  'reports.read', 'users.manage', 'settings.manage', 'dispatch.create', 'route.close', 'cash.close',
]
const owner: RolePreset = { id: 'owner', name: 'Dueño', permissions: allPermissions }
const admin: RolePreset = { id: 'admin', name: 'Administración', permissions: allPermissions }
const cashier: RolePreset = { id: 'cashier', name: 'Caja', permissions: ['sales.read', 'sales.create', 'orders.read', 'customers.read', 'cash.close'] }
const inventory: RolePreset = { id: 'inventory', name: 'Inventario', permissions: ['inventory.read', 'inventory.manage', 'products.manage'] }
const common: ModuleDefinition[] = [
  { id: 'sales', name: 'Ventas', capability: 'sales', permission: 'sales.read' },
  { id: 'sell', name: 'Nueva venta', capability: 'sales', permission: 'sales.create' },
  { id: 'inventory', name: 'Inventario', capability: 'inventory', permission: 'inventory.read' },
  { id: 'products', name: 'Productos', capability: 'inventory', permission: 'products.manage' },
  { id: 'customers', name: 'Clientes', capability: 'customers', permission: 'customers.read' },
  { id: 'reports', name: 'Reportes', capability: 'reports', permission: 'reports.read' },
  { id: 'users', name: 'Usuarios', capability: 'users', permission: 'users.manage' },
  { id: 'settings', name: 'Configuración', capability: 'settings', permission: 'settings.manage' },
]
const cash: ModuleDefinition = { id: 'cash', name: 'Caja', capability: 'cash', permission: 'cash.close' }
const commonCapabilities: Capability[] = ['sales', 'inventory', 'customers', 'reports', 'users', 'settings']
function defaults(capabilities: Capability[]): BusinessTemplate['defaults'] {
  return {
    currency: 'BOB', currencySymbol: 'Bs', timezone: 'America/La_Paz',
    features: { ...Object.fromEntries(capabilities.map(capability => [capability, true])), aiAssistant: false },
    trackStock: true, allowNegativeStock: false, ticketWidth: 58, paymentMethods: ['cash', 'qr', 'mixed'],
  }
}
const restaurantCapabilities: Capability[] = [...commonCapabilities, 'orders', 'cash', 'kitchen', 'tables', 'unitSales']
const distributionCapabilities: Capability[] = [...commonCapabilities, 'credits', 'dispatch', 'routes']
const gelateriaCapabilities: Capability[] = [...commonCapabilities, 'cash', 'weightSales', 'unitSales']
const nightclubCapabilities: Capability[] = [...commonCapabilities, 'orders', 'cash', 'kitchen', 'tables', 'unitSales']

export const BusinessTemplateRegistry: Readonly<Record<BusinessType, BusinessTemplate>> = {
  restaurant_pos: {
    businessType: 'restaurant_pos', name: 'Restaurante', description: 'Ventas, pedidos, caja e inventario.', icon: 'restaurant', version: 1,
    capabilities: restaurantCapabilities, defaults: defaults(restaurantCapabilities),
    modules: [...common, cash, { id: 'orders', name: 'Pedidos', capability: 'orders', permission: 'orders.read' }, { id: 'kitchen', name: 'Cocina', capability: 'kitchen', permission: 'orders.manage' }],
    roles: [owner, admin, cashier, { id: 'waiter', name: 'Mesero', permissions: ['orders.read', 'orders.manage', 'sales.create'] }, { id: 'kitchen', name: 'Cocina', permissions: ['orders.read', 'orders.manage'] }, inventory],
    units: ['unit'], pos: 'orders', inventory: 'commercial', offlineOperations: [], reports: ['sales', 'cash'],
  },
  route_distribution: {
    businessType: 'route_distribution', name: 'Distribuidora', description: 'Despachos, rutas, ventas, créditos y retornos.', icon: 'truck', version: 1,
    capabilities: distributionCapabilities, defaults: defaults(distributionCapabilities),
    modules: [...common, { id: 'credits', name: 'Créditos', capability: 'credits', permission: 'credits.read' }, { id: 'dispatch', name: 'Despachos', capability: 'dispatch', permission: 'dispatch.create' }, { id: 'routes', name: 'Cierre de ruta', capability: 'routes', permission: 'route.close' }],
    roles: [owner, admin, { id: 'warehouse', name: 'Almacén', permissions: ['inventory.read', 'inventory.manage', 'dispatch.create', 'route.close'] }, { id: 'distributor', name: 'Distribuidor', permissions: ['sales.read', 'sales.create', 'inventory.read', 'customers.read', 'customers.manage', 'credits.read', 'credits.collect', 'route.close'] }],
    units: ['kg', 'g', 'unit', 'package', 'box', 'liter'], pos: 'route', inventory: 'lots-and-routes',
    // Validation of the migrated adapter is required before advertising these in the new tenant shell.
    offlineOperations: [], reports: ['sales', 'receivables', 'routeClosures'],
  },
  gelateria_weight_cafe: {
    businessType: 'gelateria_weight_cafe', name: 'Comercio / Venta rápida',
    description: 'Venta por peso y unidad, caja e inventario. Útil para heladerías, cafeterías de mostrador, panaderías, reposterías, tiendas a granel, dulcerías y negocios que vendan por peso y/o unidad.',
    icon: 'ice-cream', version: 1,
    capabilities: gelateriaCapabilities, defaults: defaults(gelateriaCapabilities), modules: [...common, cash],
    roles: [owner, admin, cashier, { id: 'sales', name: 'Atención y ventas', permissions: ['sales.read', 'sales.create', 'customers.read'] }, inventory],
    units: ['kg', 'g', 'unit'], pos: 'mixed-weight', inventory: 'commercial', offlineOperations: [], reports: ['sales', 'weight', 'cash'],
  },
  nightclub_lounge: {
    businessType: 'nightclub_lounge', name: 'Club nocturno / Lounge',
    description: 'Mesas, rondas, barra, cuentas abiertas, caja e inventario para operación nocturna.',
    icon: 'music', version: 1,
    capabilities: nightclubCapabilities, defaults: defaults(nightclubCapabilities),
    modules: [...common, cash, { id: 'orders', name: 'Cuentas abiertas', capability: 'orders', permission: 'orders.read' }, { id: 'bar', name: 'Barra / preparación', capability: 'kitchen', permission: 'orders.manage' }],
    roles: [owner, admin, cashier, { id: 'waiter', name: 'Servicio', permissions: ['orders.read', 'orders.manage', 'sales.create', 'customers.read'] }, { id: 'bar', name: 'Barra', permissions: ['orders.read', 'orders.manage'] }, inventory],
    units: ['unit', 'ml'], pos: 'orders', inventory: 'commercial', offlineOperations: [], reports: ['sales', 'cash', 'openTabs'],
  },
}

export function getTemplate(businessType: string): BusinessTemplate {
  if (!Object.hasOwn(BusinessTemplateRegistry, businessType)) throw new Error('Plantilla de negocio no reconocida.')
  // Return a private copy: tenant configuration must never mutate global presets.
  return structuredClone(BusinessTemplateRegistry[businessType as BusinessType])
}
