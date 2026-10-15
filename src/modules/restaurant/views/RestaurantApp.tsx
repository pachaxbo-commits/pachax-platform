import { useEffect, useState } from 'react'
import { getBusinessTypeDefinition } from '../../../config/businessTypes'
import { applyTenantTheme } from '../../../lib/tenantTheme'
import { updateRestaurantBranding } from '../../../lib/firebase'
import { DEFAULT_RESTAURANT_THEME, validRestaurantColor, type RestaurantThemeColors } from './restaurantTheme'
import {
  RestaurantExperience,
  type RestaurantSession,
  type RestaurantShift,
} from './RestaurantExperience'
import type { Order, Product } from '../../../types'
import type { RestaurantSector, RestaurantTable } from '../../../demo/mocks/restaurantMock'
import type { RestaurantCustomer } from '../domain/restaurantCustomers'
import type { InventoryMovement } from '../domain/inventoryEngine'
import type { RestaurantMember } from '../../../demo/restaurant/RestaurantUsers'
import {
  subscribeOperationalState,
  subscribeActiveShift,
  subscribeShiftHistory,
  subscribeTables,
  subscribeSectors,
  subscribeOrders,
  subscribeProducts,
  subscribeCustomers,
  subscribeInventoryMovements,
  subscribeMembers,
  openShift,
  closeShift,
  openTableOrder,
  addOrder,
  addProduct,
  advanceStatus,
  advanceItemStatus,
  cancelOrder,
  cancelOrderItem,
  updateTableStatus,
  requestBill,
  reopenBill,
  recordPayment,
  floorAction,
  createProduct,
  saveProducts,
  saveCustomer,
  archiveCustomer,
  assignCustomer,
  recordInventoryMovement,
  countInventoryItem,
  createTenantMember,
  updateTenantMember,
  deleteTenantMember,
  type RestaurantOperationalState,
} from '../data/restaurantRepository'

export function RestaurantApp({
  tenantId,
  restaurantName,
  uid,
  userName,
  role,
  logoUrl,
  companyName,
  primaryColor,
  accentColor,
  onSignOut,
  onOpenPrinterSettings,
  profile = 'restaurant',
}: {
  tenantId: string
  restaurantName: string
  uid: string
  userName: string
  role: string
  logoUrl?: string
  companyName?: string
  primaryColor?: string
  accentColor?: string
  onSignOut: () => Promise<void>
  onOpenPrinterSettings?: () => void
  profile?: 'restaurant' | 'counter_service'
}) {
  const definition = getBusinessTypeDefinition('restaurant')
  const [themeColors, setThemeColors] = useState<RestaurantThemeColors>({
    primary: primaryColor && validRestaurantColor(primaryColor) ? primaryColor : DEFAULT_RESTAURANT_THEME.primary,
    accent: accentColor && validRestaurantColor(accentColor) ? accentColor : DEFAULT_RESTAURANT_THEME.accent,
  })

  const [operationalState, setOperationalState] = useState<RestaurantOperationalState>({ activeShiftId: null })
  const [shift, setShift] = useState<RestaurantShift | null>(null)
  const [shiftHistory, setShiftHistory] = useState<RestaurantShift[]>([])
  const [tables, setTables] = useState<RestaurantTable[]>([])
  const [sectors, setSectors] = useState<RestaurantSector[]>([])
  const [orders, setOrders] = useState<Order[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [customers, setCustomers] = useState<RestaurantCustomer[]>([])
  const [stockMovements, setStockMovements] = useState<InventoryMovement[]>([])
  const [members, setMembers] = useState<RestaurantMember[]>([])

  useEffect(() => {
    applyTenantTheme(definition.theme)
  }, [definition.theme])

  // Subscriptions to real-time Firestore collections
  useEffect(() => {
    if (!tenantId) return

    const unsubOpState = subscribeOperationalState(tenantId, 'main', setOperationalState)
    const unsubHistory = subscribeShiftHistory(tenantId, 'main', setShiftHistory)
    const unsubTables = subscribeTables(tenantId, 'main', setTables)
    const unsubSectors = subscribeSectors(tenantId, setSectors)
    const unsubOrders = subscribeOrders(tenantId, 'main', setOrders)
    const unsubProducts = subscribeProducts(tenantId, setProducts)
    const unsubCustomers = subscribeCustomers(tenantId, setCustomers)
    const unsubMovements = subscribeInventoryMovements(tenantId, 'main', setStockMovements)
    const unsubMembers = subscribeMembers(tenantId, setMembers)

    return () => {
      unsubOpState()
      unsubHistory()
      unsubTables()
      unsubSectors()
      unsubOrders()
      unsubProducts()
      unsubCustomers()
      unsubMovements()
      unsubMembers()
    }
  }, [tenantId])

  // Subscribe to active shift whenever activeShiftId changes
  useEffect(() => {
    if (!tenantId || !operationalState.activeShiftId) return

    return subscribeActiveShift(tenantId, operationalState.activeShiftId, setShift)
  }, [tenantId, operationalState.activeShiftId])

  const activeShift = operationalState.activeShiftId ? shift : null

  const session: RestaurantSession = {
    tenantId,
    restaurantName,
    uid,
    userName,
    role,
  }

  return (
    <RestaurantExperience
      session={session}
      logoUrl={logoUrl}
      companyName={companyName || restaurantName}
      themeColors={themeColors}
      onSaveTheme={async (colors) => {
        await updateRestaurantBranding(tenantId, { primaryColor: colors.primary, accentColor: colors.accent })
        setThemeColors(colors)
      }}
      orders={orders}
      tables={tables}
      sectors={sectors}
      products={products}
      customers={customers}
      onSaveCustomer={(draft, id) => {
        saveCustomer(tenantId, 'main', draft, id).catch((err: Error) => {
          window.alert(err.message || 'Error al guardar cliente.')
        })
        return null
      }}
      onArchiveCustomer={(id) => {
        archiveCustomer(tenantId, 'main', id).catch((err: Error) => {
          window.alert(err.message || 'Error al archivar cliente.')
        })
      }}
      onAssignCustomer={(orderId, customerId) => {
        assignCustomer(tenantId, 'main', orderId, customerId).catch((err: Error) => {
          window.alert(err.message || 'Error al asignar cliente.')
        })
      }}
      onSaveProducts={(nextProducts) => {
        saveProducts(tenantId, 'main', nextProducts).catch((err: Error) => {
          window.alert(err.message || 'Error al guardar productos.')
        })
      }}
      stockMovements={stockMovements}
      onInventoryMovement={(productId, nextStock, type, reason) => {
        recordInventoryMovement(tenantId, 'main', productId, nextStock, type, reason).catch((err: Error) => {
          window.alert(err.message || 'Error al registrar movimiento de stock.')
        })
        return { ok: true }
      }}
      onCountInventoryItem={(productId, physical, note) => {
        countInventoryItem(tenantId, 'main', productId, physical, note).catch((err: Error) => {
          window.alert(err.message || 'Error al registrar conteo.')
        })
      }}
      members={members}
      onCreateMember={async (data) => {
        await createTenantMember(tenantId, data)
      }}
      onUpdateMember={async (id, data) => {
        await updateTenantMember(tenantId, id, data)
      }}
      onDeleteMember={async (id) => {
        await deleteTenantMember(tenantId, id)
      }}
      shift={activeShift}
      shiftHistory={shiftHistory}
      onStartShift={(amount) => {
        openShift(tenantId, 'main', amount).catch((err: Error) => {
          window.alert(err.message || 'Error al iniciar turno.')
        })
      }}
      onCloseShift={(countedCash) => {
        if (!shift) return false
        closeShift(tenantId, 'main', shift.id, countedCash ?? 0).catch((err: Error) => {
          window.alert(err.message || 'Error al cerrar caja.')
        })
        return true
      }}
      onAddOrder={(order) => {
        addOrder(tenantId, 'main', order).catch((err: Error) => {
          window.alert(err.message || 'Error al registrar pedido.')
        })
        return true
      }}
      onAdvanceStatus={async (orderId, status) => {
        try {
          return await advanceStatus(tenantId, 'main', orderId, status)
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : 'Error al avanzar estado.'
          window.alert(msg)
          return false
        }
      }}
      onAdvanceItemStatus={async (orderId, itemId, status) => {
        try {
          return await advanceItemStatus(tenantId, 'main', orderId, itemId, status)
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : 'Error al avanzar estado del ítem.'
          window.alert(msg)
          return false
        }
      }}
      onCancelOrder={async (orderId) => {
        try {
          return await cancelOrder(tenantId, 'main', orderId)
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : 'Error al anular pedido.'
          window.alert(msg)
          return false
        }
      }}
      onCancelOrderItem={(orderId, itemId, quantity) => {
        cancelOrderItem(tenantId, 'main', orderId, itemId, quantity).catch((err: Error) => {
          window.alert(err.message || 'Error al anular ítem.')
        })
        return true
      }}
      onPayment={(orderId, input) => {
        recordPayment(tenantId, 'main', orderId, input).catch((err: Error) => {
          window.alert(err.message || 'Error al registrar pago.')
        })
      }}
      onOpenTableOrder={(table) => {
        openTableOrder(tenantId, 'main', table).catch((err: Error) => {
          window.alert(err.message || 'Error al abrir mesa.')
        })
      }}
      onUpdateTableStatus={(tableId, status) => {
        updateTableStatus(tenantId, 'main', tableId, status).catch((err: Error) => {
          window.alert(err.message || 'Error al actualizar estado de la mesa.')
        })
      }}
      onRequestBill={(tableId) => {
        requestBill(tenantId, 'main', tableId).catch((err: Error) => {
          window.alert(err.message || 'Error al pedir cuenta.')
        })
      }}
      onReopenBill={(tableId) => {
        reopenBill(tenantId, 'main', tableId).catch((err: Error) => {
          window.alert(err.message || 'Error al reabrir cuenta.')
        })
      }}
      onAddProduct={(orderId, input) => {
        addProduct(tenantId, 'main', orderId, input).catch((err: Error) => {
          window.alert(err.message || 'Error al añadir producto.')
        })
      }}
      onPrintBatch={() => true}
      onCreateProduct={(_tableId, input) => {
        createProduct(tenantId, 'main', input).catch((err: Error) => {
          window.alert(err.message || 'Error al crear producto.')
        })
      }}
      onFloorAction={(action) => {
        floorAction(tenantId, 'main', action).catch((err: Error) => {
          window.alert(err.message || 'Error al actualizar salón.')
        })
        return { ok: true }
      }}
      onSignOut={onSignOut}
      onOpenPrinterSettings={onOpenPrinterSettings}
      profile={profile}
    />
  )
}
