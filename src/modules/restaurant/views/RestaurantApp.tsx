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
  const [syncError, setSyncError] = useState<string | null>(null)

  useEffect(() => {
    applyTenantTheme(definition.theme)
  }, [definition.theme])

  // Subscriptions to real-time Firestore collections with error handling
  useEffect(() => {
    if (!tenantId) return

    const handleSyncError = (colName: string) => (err: Error) => {
      console.warn(`[RestaurantApp] Error de sincronización en ${colName}:`, err.message)
      if (err.message.includes('permission-denied') || (err as { code?: string }).code === 'permission-denied') {
        setSyncError(`Permiso denegado para consultar ${colName}. Verifica los roles asignados a tu usuario.`)
      } else {
        setSyncError(`Problema de conexión al sincronizar ${colName}. Reintentando automáticamente...`)
      }
    }

    const unsubOpState = subscribeOperationalState(tenantId, 'main', setOperationalState, handleSyncError('estado operativo'))
    const unsubHistory = subscribeShiftHistory(tenantId, 'main', setShiftHistory, handleSyncError('historial de turnos'))
    const unsubTables = subscribeTables(tenantId, 'main', setTables, handleSyncError('mesas'))
    const unsubSectors = subscribeSectors(tenantId, setSectors, handleSyncError('sectores'))
    const unsubOrders = subscribeOrders(tenantId, 'main', setOrders, handleSyncError('pedidos'))
    const unsubProducts = subscribeProducts(tenantId, setProducts, handleSyncError('productos'))
    const unsubCustomers = subscribeCustomers(tenantId, setCustomers, handleSyncError('clientes'))
    const unsubMovements = subscribeInventoryMovements(tenantId, 'main', setStockMovements, handleSyncError('inventario'))
    const unsubMembers = subscribeMembers(tenantId, setMembers, handleSyncError('personal'))

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

    return subscribeActiveShift(tenantId, operationalState.activeShiftId, setShift, (err: Error) => {
      console.warn('[RestaurantApp] Error al consultar turno activo:', err.message)
    })
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
    <>
      {syncError && (
        <div role="alert" className="sticky top-0 z-[200] border-b border-amber-200 bg-amber-50 px-4 py-2 text-xs font-semibold text-amber-900 flex items-center justify-between">
          <span>{syncError}</span>
          <button type="button" onClick={() => setSyncError(null)} className="text-amber-700 hover:text-amber-950 underline ml-2 cursor-pointer">Cerrar</button>
        </div>
      )}
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
        onSaveCustomer={async (draft, id) => {
          try {
            const res = await saveCustomer(tenantId, 'main', draft, id)
            return res.customer as RestaurantCustomer
          } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : 'Error al guardar cliente.'
            window.alert(msg)
            return null
          }
        }}
        onArchiveCustomer={async (id) => {
          try {
            await archiveCustomer(tenantId, 'main', id)
          } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : 'Error al archivar cliente.'
            window.alert(msg)
          }
        }}
        onAssignCustomer={async (orderId, customerId) => {
          try {
            await assignCustomer(tenantId, 'main', orderId, customerId)
          } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : 'Error al asignar cliente.'
            window.alert(msg)
          }
        }}
        onSaveProducts={async (nextProducts) => {
          try {
            await saveProducts(tenantId, 'main', nextProducts)
          } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : 'Error al guardar productos.'
            window.alert(msg)
          }
        }}
        stockMovements={stockMovements}
        onInventoryMovement={async (productId, nextStock, type, reason) => {
          try {
            await recordInventoryMovement(tenantId, 'main', productId, nextStock, type, reason)
            return { ok: true }
          } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : 'Error al registrar movimiento de stock.'
            window.alert(msg)
            return { ok: false, error: msg }
          }
        }}
        onCountInventoryItem={async (productId, physical, note) => {
          try {
            await countInventoryItem(tenantId, 'main', productId, physical, note)
          } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : 'Error al registrar conteo.'
            window.alert(msg)
          }
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
        onStartShift={async (amount) => {
          try {
            await openShift(tenantId, 'main', amount)
          } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : 'Error al iniciar turno.'
            window.alert(msg)
            throw err
          }
        }}
        onCloseShift={async (countedCash) => {
          if (!shift) return false
          try {
            await closeShift(tenantId, 'main', shift.id, countedCash ?? 0)
            return true
          } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : 'Error al cerrar caja.'
            window.alert(msg)
            return false
          }
        }}
        onAddOrder={async (order) => {
          try {
            await addOrder(tenantId, 'main', order)
            return true
          } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : 'Error al registrar pedido.'
            window.alert(msg)
            return false
          }
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
        onCancelOrderItem={async (orderId, itemId, quantity) => {
          try {
            await cancelOrderItem(tenantId, 'main', orderId, itemId, quantity)
            return true
          } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : 'Error al anular ítem.'
            window.alert(msg)
            return false
          }
        }}
        onPayment={async (orderId, input) => {
          try {
            await recordPayment(tenantId, 'main', orderId, input)
          } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : 'Error al registrar pago.'
            window.alert(msg)
            throw err
          }
        }}
        onOpenTableOrder={async (table) => {
          try {
            await openTableOrder(tenantId, 'main', table)
          } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : 'Error al abrir mesa.'
            window.alert(msg)
            throw err
          }
        }}
        onUpdateTableStatus={async (tableId, status) => {
          try {
            await updateTableStatus(tenantId, 'main', tableId, status)
          } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : 'Error al actualizar estado de la mesa.'
            window.alert(msg)
          }
        }}
        onRequestBill={async (tableId) => {
          try {
            await requestBill(tenantId, 'main', tableId)
          } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : 'Error al pedir cuenta.'
            window.alert(msg)
          }
        }}
        onReopenBill={async (tableId) => {
          try {
            await reopenBill(tenantId, 'main', tableId)
          } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : 'Error al reabrir cuenta.'
            window.alert(msg)
          }
        }}
        onAddProduct={async (orderId, input) => {
          try {
            await addProduct(tenantId, 'main', orderId, input)
          } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : 'Error al añadir producto.'
            window.alert(msg)
          }
        }}
        onPrintBatch={() => true}
        onCreateProduct={async (_tableId, input) => {
          try {
            await createProduct(tenantId, 'main', input)
          } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : 'Error al crear producto.'
            window.alert(msg)
          }
        }}
        onFloorAction={async (action) => {
          return await floorAction(tenantId, 'main', action)
        }}
        onSignOut={onSignOut}
        onOpenPrinterSettings={onOpenPrinterSettings}
        profile={profile}
      />
    </>
  )
}
