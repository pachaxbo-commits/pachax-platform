import type { DemoDatasetMode } from '../types'
import { nightclubProductAvailability } from '../../../modules/nightclub/domain/nightclubAccounts.ts'
import type { NightclubAccount, NightclubDataset, NightclubProduct, NightclubTable, NightclubZone } from '../../../modules/nightclub/domain/nightclubAccounts'

const zones: NightclubZone[] = ['General', 'VIP', 'Lounge', 'Barra', 'Terraza'].map((name, index) => ({ id: `zone-${name.toLowerCase()}`, name, sortOrder: index }))
const tables: NightclubTable[] = zones.flatMap((zone, zoneIndex) => [1, 2].map((number, index) => ({ id: `night-table-${zone.name.toLowerCase()}-${number}`, name: zone.name === 'VIP' ? `VIP ${number}` : zone.name === 'Barra' ? `Barra ${number}` : `Mesa ${zoneIndex * 2 + number}`, zoneId: zone.id, capacity: zone.name === 'VIP' ? 8 : zone.name === 'Barra' ? 2 : 4 + index * 2, status: 'available' as const })))
const products: NightclubProduct[] = [
  { id: 'bottle-1', category: 'Botellas', name: 'Vodka premium 750 ml', price: 420, preparationArea: 'Barra', stockUnits: 18, recipe: [{ inventoryId: 'vodka-ml', quantity: 750 }] },
  { id: 'cocktail-1', category: 'Tragos / Cócteles', name: 'Cóctel de la casa', price: 48, preparationArea: 'Barra', stockUnits: 80, recipe: [{ inventoryId: 'vodka-ml', quantity: 60 }, { inventoryId: 'mixer-ml', quantity: 140 }] },
  { id: 'beer-1', category: 'Cervezas', name: 'Cerveza lager', price: 28, preparationArea: 'Directo', stockUnits: 96, recipe: [{ inventoryId: 'beer-unit', quantity: 1 }] },
  { id: 'mixer-1', category: 'Mixers / Energizantes', name: 'Energizante', price: 32, preparationArea: 'Directo', stockUnits: 72, recipe: [{ inventoryId: 'mixer-can', quantity: 1 }] },
  { id: 'combo-1', category: 'Combos', name: 'Botella + 6 mixers', price: 560, preparationArea: 'Barra', stockUnits: 12, recipe: [{ inventoryId: 'vodka-ml', quantity: 750 }, { inventoryId: 'mixer-can', quantity: 6 }] },
  { id: 'snack-1', category: 'Snacks', name: 'Tabla snack', price: 65, preparationArea: 'Barra', stockUnits: 24, recipe: [{ inventoryId: 'snack-unit', quantity: 1 }] },
  { id: 'courtesy-1', category: 'Cortesías', name: 'Cortesía de la casa', price: 0, preparationArea: 'Directo', stockUnits: 20, recipe: [{ inventoryId: 'courtesy-unit', quantity: 1 }] },
]

const inventory = [
  { id: 'vodka-ml', name: 'Vodka premium', unit: 'ml' as const, current: 18000, minimum: 4500 },
  { id: 'mixer-ml', name: 'Base para cócteles', unit: 'ml' as const, current: 15000, minimum: 3000 },
  { id: 'beer-unit', name: 'Cerveza lager', unit: 'unit' as const, current: 96, minimum: 24 },
  { id: 'mixer-can', name: 'Energizante en lata', unit: 'unit' as const, current: 72, minimum: 18 },
  { id: 'snack-unit', name: 'Tabla snack', unit: 'unit' as const, current: 24, minimum: 6 },
  { id: 'courtesy-unit', name: 'Cortesía de la casa', unit: 'unit' as const, current: 20, minimum: 5 },
]

export function createEmptyNightclubDataset(): NightclubDataset {
  return { zones: structuredClone(zones), tables: structuredClone(tables), products: [], accounts: [], shift: null, customers: [], reservations: [], inventory: [], inventoryMovements: [], cashMovements: [], audit: [], staff: [] }
}

export function createFullNightclubDataset(): NightclubDataset {
  const fullTables = structuredClone(tables)
  const accountOne: NightclubAccount = { id: 'night-account-vip-1', tableId: 'night-table-vip-1', customerId: 'night-customer-1', openedAt: '2026-09-25T21:10:00Z', openedBy: 'Servicio Valeria', status: 'open', subtotal: 680, rounds: [
    { id: 'round-vip-1', sequence: 1, createdAt: '2026-09-25T21:12:00Z', status: 'ready', items: [{ id: 'ri-1', productId: 'bottle-1', name: 'Vodka premium 750 ml', quantity: 1, unitPrice: 420, lineTotal: 420 }, { id: 'ri-2', productId: 'mixer-1', name: 'Energizante', quantity: 4, unitPrice: 32, lineTotal: 128 }] },
    { id: 'round-vip-2', sequence: 2, createdAt: '2026-09-25T22:05:00Z', status: 'preparing', items: [{ id: 'ri-3', productId: 'cocktail-1', name: 'Cóctel de la casa', quantity: 2, unitPrice: 48, lineTotal: 96 }, { id: 'ri-4', productId: 'beer-1', name: 'Cerveza lager', quantity: 1, unitPrice: 28, lineTotal: 28 }, { id: 'ri-5', productId: 'courtesy-1', name: 'Cortesía de la casa', quantity: 2, unitPrice: 0, lineTotal: 0 }, { id: 'ri-6', productId: 'snack-1', name: 'Tabla snack', quantity: 1, unitPrice: 8, lineTotal: 8 }] },
  ] }
  const accountTwo: NightclubAccount = { id: 'night-account-lounge-1', tableId: 'night-table-lounge-1', openedAt: '2026-09-25T21:45:00Z', openedBy: 'Servicio Marco', status: 'open', subtotal: 245, rounds: [{ id: 'round-lounge-1', sequence: 1, createdAt: '2026-09-25T21:48:00Z', status: 'preparing', items: [{ id: 'ri-7', productId: 'cocktail-1', name: 'Cóctel de la casa', quantity: 3, unitPrice: 48, lineTotal: 144 }, { id: 'ri-8', productId: 'beer-1', name: 'Cerveza lager', quantity: 2, unitPrice: 28, lineTotal: 56 }, { id: 'ri-9', productId: 'snack-1', name: 'Tabla snack', quantity: 1, unitPrice: 45, lineTotal: 45 }] }] }
  for (const account of [accountOne, accountTwo]) { const table = fullTables.find(item => item.id === account.tableId)!; table.status = 'occupied'; table.activeAccountId = account.id }
  const reserved = fullTables.find(item => item.id === 'night-table-vip-2')!; reserved.status = 'reserved'; reserved.reservationName = 'Andrea Salvatierra'
  const fullInventory = structuredClone(inventory)
  const inventoryMovements = [] as NonNullable<NightclubDataset['inventoryMovements']>
  for (const account of [accountOne, accountTwo]) for (const batch of account.rounds) for (const item of batch.items) {
    const product = products.find(entry => entry.id === item.productId)!
    for (const ingredient of product.recipe || []) {
      const stock = fullInventory.find(entry => entry.id === ingredient.inventoryId)!
      const previous = stock.current
      stock.current -= ingredient.quantity * item.quantity
      inventoryMovements.push({ id: `fixture-${batch.id}-${item.id}-${stock.id}`, operationId: `round:${batch.id}:${stock.id}:${item.id}`, inventoryId: stock.id, quantity: -ingredient.quantity * item.quantity, previous, current: stock.current, type: 'sale', at: batch.createdAt, actor: account.openedBy, accountId: account.id, roundId: batch.id })
    }
  }
  for (const account of [accountOne, accountTwo]) account.shiftId = 'night-shift-01'
  return {
    zones: structuredClone(zones), tables: fullTables, products: products.map(product => ({ ...structuredClone(product), stockUnits: nightclubProductAvailability(product, fullInventory) })), accounts: [accountOne, accountTwo],
    shift: { id: 'night-shift-01', status: 'open', openedAt: '2026-09-25T19:30:00Z', openingFloat: 1000, openedBy: 'Caja Nocturna' },
    customers: [{ id: 'night-customer-1', name: 'Diego Arce', phone: '70001122', visits: 9, totalSpent: 4850 }, { id: 'night-customer-2', name: 'Andrea Salvatierra', phone: '71112233', visits: 4, totalSpent: 2140 }],
    reservations: [{ id: 'reservation-vip-2', tableId: reserved.id, customerName: 'Andrea Salvatierra', time: '22:30', guests: 8, status: 'confirmed' }],
    inventory: fullInventory, inventoryMovements, cashMovements: [], audit: [],
    staff: [{ id: 'night-staff-1', name: 'Valeria', role: 'service', active: true }, { id: 'night-staff-2', name: 'Marco', role: 'service', active: true }, { id: 'night-staff-3', name: 'Caja Nocturna', role: 'cashier', active: true }],
  }
}

export function createNightclubDataset(mode: DemoDatasetMode = 'full'): NightclubDataset {
  return mode === 'empty' ? createEmptyNightclubDataset() : createFullNightclubDataset()
}
