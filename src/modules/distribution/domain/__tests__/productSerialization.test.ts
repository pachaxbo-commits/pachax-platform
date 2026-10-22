import { serializeProductForSave } from '../productSerialization.ts'
import { getInventoryCapabilities } from '../inventoryPermissions.ts'
import type { DistProduct } from '../../types.ts'
import type { Permission } from '../../../../types.ts'

const assert = (condition: unknown, message: string) => { if (!condition) throw new Error(message) }

const base: Omit<DistProduct, 'tenantId' | 'createdAt'> = {
  id: 'sku-qa', name: 'Agua QA', category: 'Bebidas', presentation: '', unitType: 'package',
  productionCost: 4, minimumStock: 0, referencePrice: 8, active: true, sortOrder: 0,
}

const created = serializeProductForSave(base)
assert(!Object.hasOwn(created.values, 'approximateWeightKg'), 'peso vacío no se serializa como undefined')
assert(!Object.hasOwn(created.values, 'sku'), 'SKU vacío no se serializa como undefined')
assert(!Object.hasOwn(created.values, 'presentationContent'), 'contenido vacío no se serializa como undefined')
assert(created.deleteFields.includes('approximateWeightKg') && created.deleteFields.includes('sku'), 'la creación identifica opcionales ausentes')
assert(!Object.hasOwn(created.values, 'presentation') && created.deleteFields.includes('presentation'), 'presentación vacía se omite')

const existing: DistProduct = {
  ...base, tenantId: 'tenant', createdAt: '2026-01-01', approximateWeightKg: 0.6,
  sku: 'SKU-OLD', saleUnitLabel: 'botella', presentationContent: { amount: 600, unit: 'ml' },
}
const cleared = serializeProductForSave({ ...existing, photoDataUrl: '', presentation: '', approximateWeightKg: undefined, sku: undefined, saleUnitLabel: undefined, presentationContent: undefined })
assert(cleared.deleteFields.includes('approximateWeightKg'), 'editar limpia peso aproximado')
assert(cleared.deleteFields.includes('sku'), 'editar limpia SKU')
assert(cleared.deleteFields.includes('saleUnitLabel'), 'editar limpia unidad comercial')
assert(cleared.deleteFields.includes('presentationContent'), 'editar limpia contenido descriptivo')
assert(cleared.deleteFields.includes('photoDataUrl') && cleared.deleteFields.includes('presentation'), 'editar limpia valores opcionales vacíos')
assert(cleared.values.referencePrice === 8 && cleared.values.unitType === 'package', 'edición conserva precio y unidad transaccional')

const allow = (...permissions: Permission[]) => (permission: Permission) => permissions.includes(permission)
for (const role of ['owner', 'admin']) {
  const caps = getInventoryCapabilities(allow('dist.inventory.adjust', 'dist.users.manage'), role, 'warehouse-2')
  assert(caps.warehouseId === 'warehouse-2' && caps.canSelectWarehouse, `${role} selecciona almacén`)
  assert(!caps.canIntake && caps.canAdjust, `${role} ajusta el almacén seleccionado; intake queda limitado a central`)
  const central = getInventoryCapabilities(allow('dist.inventory.adjust', 'dist.users.manage'), role, 'central')
  assert(central.canIntake && central.canAdjust, `${role} ingresa y ajusta inventario central`)
}
const warehouse = getInventoryCapabilities(allow('dist.inventory.adjust'), 'warehouse', 'warehouse-2', 'central')
assert(warehouse.canIntake && warehouse.canAdjust && !warehouse.canSelectWarehouse, 'almacén conserva permisos propios sin seleccionar otras ubicaciones')
const distributor = getInventoryCapabilities(allow('dist.inventory.view'), 'distributor', 'central', 'central')
assert(!distributor.canIntake && !distributor.canAdjust && !distributor.canSelectWarehouse, 'distribuidor no recibe controles administrativos')

console.log('Distribution product serialization and inventory permissions: PASS')
