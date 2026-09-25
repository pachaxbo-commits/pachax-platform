import type { DemoDatasetMode } from '../types'
import type { NightclubAccount, NightclubDataset, NightclubProduct, NightclubTable, NightclubZone } from '../../../modules/nightclub/domain/nightclubAccounts'

const zones: NightclubZone[] = ['General', 'VIP', 'Lounge', 'Barra', 'Terraza'].map((name, index) => ({ id: `zone-${name.toLowerCase()}`, name, sortOrder: index }))
const tables: NightclubTable[] = zones.flatMap((zone, zoneIndex) => [1, 2].map((number, index) => ({ id: `night-table-${zone.name.toLowerCase()}-${number}`, name: zone.name === 'VIP' ? `VIP ${number}` : zone.name === 'Barra' ? `Barra ${number}` : `Mesa ${zoneIndex * 2 + number}`, zoneId: zone.id, capacity: zone.name === 'VIP' ? 8 : zone.name === 'Barra' ? 2 : 4 + index * 2, status: 'available' as const })))
const products: NightclubProduct[] = [
  ['bottle-1', 'Botellas', 'Vodka premium 750 ml', 420, 'Barra', 18],
  ['cocktail-1', 'Tragos / Cócteles', 'Cóctel de la casa', 48, 'Barra', 80],
  ['beer-1', 'Cervezas', 'Cerveza lager', 28, 'Directo', 96],
  ['mixer-1', 'Mixers / Energizantes', 'Energizante', 32, 'Directo', 72],
  ['combo-1', 'Combos', 'Botella + 6 mixers', 560, 'Barra', 12],
  ['snack-1', 'Snacks', 'Tabla snack', 65, 'Barra', 24],
  ['courtesy-1', 'Cortesías', 'Cortesía de la casa', 0, 'Directo', 20],
].map(([id, category, name, price, preparationArea, stockUnits]) => ({ id, category, name, price, preparationArea, stockUnits } as NightclubProduct))

export function createEmptyNightclubDataset(): NightclubDataset {
  return { zones: structuredClone(zones), tables: structuredClone(tables), products: [], accounts: [], shift: null, customers: [], reservations: [], inventory: [] }
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
  return {
    zones: structuredClone(zones), tables: fullTables, products: structuredClone(products), accounts: [accountOne, accountTwo],
    shift: { id: 'night-shift-01', status: 'open', openedAt: '2026-09-25T19:30:00Z', openingFloat: 1000, openedBy: 'Caja Nocturna' },
    customers: [{ id: 'night-customer-1', name: 'Diego Arce', phone: '70001122', visits: 9, totalSpent: 4850 }, { id: 'night-customer-2', name: 'Andrea Salvatierra', phone: '71112233', visits: 4, totalSpent: 2140 }],
    reservations: [{ id: 'reservation-vip-2', tableId: reserved.id, customerName: 'Andrea Salvatierra', time: '22:30', guests: 8, status: 'confirmed' }],
    inventory: products.map(item => ({ id: `inventory-${item.id}`, name: item.name, unit: 'unit' as const, current: item.stockUnits, minimum: item.category === 'Botellas' ? 6 : 12 })),
  }
}

export function createNightclubDataset(mode: DemoDatasetMode = 'full'): NightclubDataset {
  return mode === 'empty' ? createEmptyNightclubDataset() : createFullNightclubDataset()
}
