import { useCallback, useEffect, useMemo, useState } from 'react'
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
import type { RestaurantSector, RestaurantTable } from '../types'
import type { RestaurantCustomer } from '../domain/restaurantCustomers'
import type { InventoryMovement } from '../domain/inventoryEngine'
import type { CashMovement } from '../domain/cashEngine'
import type { RestaurantMember } from '../components/RestaurantUsers'
import { getActiveTenant } from '../../../store/activeTenant'
import { BusinessTemplateRegistry } from '../../../core/templates'

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
  subscribeCashMovements,
  recordCashMovement,
  cancelCashMovement,
  updateCashMovement,
  archiveProduct,
  deleteProduct,
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
import { PrintEngineService } from '../../../services/printing/printEngineService'
import {
  initializePrinting,
  getActiveReceiptPrinter,
} from '../../../services/printing/printerBootstrap'
import type { KitchenTicketJob } from '../domain/kitchenPrint'
import type { PrintJobPayload } from '../../../types/printing'
import {
  type BusinessIdentity,
  buildBusinessDocumentContext,
} from '../../../core/businessIdentity'
import {
  uploadTenantLogoToFirebase,
  updateTenantBusinessIdentity,
} from '../../../lib/firebase'

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
  businessIdentity,
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
  businessIdentity?: BusinessIdentity
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
  const [cashMovements, setCashMovements] = useState<CashMovement[]>([])
  const [syncError, setSyncError] = useState<string | null>(null)
  const [kitchenPrintJobs, setKitchenPrintJobs] = useState<KitchenTicketJob[]>([])
  const [lastPrintedComanda, setLastPrintedComanda] = useState<PrintJobPayload | null>(null)
  const [customIdentity, setCustomIdentity] = useState<BusinessIdentity | null>(null)
  const activeIdentity = customIdentity || businessIdentity

  const handleSaveBusinessIdentity = async (newIdentity: BusinessIdentity) => {
    await updateTenantBusinessIdentity(tenantId, newIdentity)
    setCustomIdentity(newIdentity)
    if (newIdentity.primaryColor && newIdentity.accentColor) {
      setThemeColors({
        primary: newIdentity.primaryColor,
        accent: newIdentity.accentColor,
      })
    }
  }

  const handleUploadLogo = async (file: File) => {
    return await uploadTenantLogoToFirebase(file, tenantId)
  }

  const documentContext = useMemo(
    () =>
      buildBusinessDocumentContext(activeIdentity, {
        companyName: activeIdentity?.tradeName || companyName || restaurantName || 'PACHAX Restaurante',
        logoUrl: activeIdentity?.showLogo !== false ? (activeIdentity?.logoUrl || logoUrl) : undefined,
        branchName: 'Principal',
      }),
    [activeIdentity, companyName, restaurantName, logoUrl]
  )

  useEffect(() => {
    applyTenantTheme(definition.theme)
  }, [definition.theme])

  useEffect(() => {
    if (tenantId) {
      initializePrinting(tenantId, 'main')
    }
  }, [tenantId])

  const can = useCallback((perm: string) => {
    const activeTenant = getActiveTenant()
    const perms: readonly string[] = activeTenant?.permissions ?? (
      BusinessTemplateRegistry.restaurant_pos.roles.find(r => r.id === role)?.permissions ?? []
    )
    return perms.includes(perm)
  }, [role])

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

    const unsubs: Array<(() => void) | undefined> = []

    // 1. Estado operativo: roles con orders.read o cash.close
    if (can('orders.read') || can('cash.close')) {
      unsubs.push(subscribeOperationalState(tenantId, 'main', setOperationalState, handleSyncError('estado operativo')))
    }

    // 2. Historial de turnos: roles con cash.close o settings.manage
    if (can('cash.close') || can('settings.manage')) {
      unsubs.push(subscribeShiftHistory(tenantId, 'main', setShiftHistory, handleSyncError('historial de turnos')))
    }

    // 3. Mesas y sectores: roles con orders.read o settings.manage
    if (can('orders.read') || can('settings.manage')) {
      unsubs.push(subscribeTables(tenantId, 'main', setTables, handleSyncError('mesas')))
      unsubs.push(subscribeSectors(tenantId, setSectors, handleSyncError('sectores')))
    }

    // 4. Pedidos: roles con orders.read, cash.close o sales.read
    if (can('orders.read') || can('cash.close') || can('sales.read')) {
      unsubs.push(subscribeOrders(tenantId, 'main', setOrders, handleSyncError('pedidos')))
    }

    // 5. Catálogo de productos: permitido para miembros activos del tenant
    unsubs.push(subscribeProducts(tenantId, setProducts, handleSyncError('productos')))

    // 6. Clientes CRM: solo si tiene customers.read o customers.manage o settings.manage
    if (can('customers.read') || can('customers.manage') || can('settings.manage')) {
      unsubs.push(subscribeCustomers(tenantId, setCustomers, handleSyncError('clientes')))
    }

    // 7. Movimientos de inventario: solo inventory.read o settings.manage
    if (can('inventory.read') || can('settings.manage')) {
      unsubs.push(subscribeInventoryMovements(tenantId, 'main', setStockMovements, handleSyncError('inventario')))
    }

    // 8. Personal / Members: solo users.manage
    if (can('users.manage')) {
      unsubs.push(subscribeMembers(tenantId, setMembers, handleSyncError('personal')))
    }

    return () => {
      unsubs.forEach(unsub => unsub?.())
    }
  }, [tenantId, role, can])

  // Subscribe to active shift whenever activeShiftId changes (only if cash.close or settings.manage)
  useEffect(() => {
    if (!tenantId || !operationalState.activeShiftId || (!can('cash.close') && !can('settings.manage'))) {
      return
    }

    return subscribeActiveShift(tenantId, operationalState.activeShiftId, setShift, (err: Error) => {
      console.warn('[RestaurantApp] Error al consultar turno activo:', err.message)
    })
  }, [tenantId, operationalState.activeShiftId, role, can])

  // Subscribe to cash movements whenever activeShiftId changes (only if cash.close or settings.manage)
  useEffect(() => {
    if (!tenantId || !operationalState.activeShiftId || (!can('cash.close') && !can('settings.manage'))) {
      return
    }

    return subscribeCashMovements(
      tenantId,
      'main',
      operationalState.activeShiftId,
      setCashMovements,
      (err: Error) => {
        console.warn('[RestaurantApp] Error al consultar movimientos de caja:', err.message)
      }
    )
  }, [tenantId, operationalState.activeShiftId, role, can])

  const isShiftOpen = Boolean(operationalState.activeShiftId)
  const activeShift = (can('cash.close') || can('settings.manage')) && operationalState.activeShiftId ? shift : null
  const activeCashMovements = (can('cash.close') || can('settings.manage')) && operationalState.activeShiftId ? cashMovements : []

  const session: RestaurantSession = {
    tenantId,
    restaurantName,
    uid,
    userName,
    role,
    can,
  }


  const handlePrintBatch = async (orderId: string): Promise<boolean> => {
    const currentOrder = orders.find((o) => o.id === orderId)
    if (!currentOrder) {
      window.alert('No se encontró el pedido a comandar.')
      return false
    }

    const existingBatches = (currentOrder.submittedBatches as Array<{ itemIds: string[] }> | undefined) || []
    const lockedIds = new Set(existingBatches.flatMap((b) => b.itemIds))
    const lines = currentOrder.items.filter((item) => item.quantity > 0 && !lockedIds.has(item.id))
    if (!lines.length) {
      window.alert('Todos los productos de esta mesa ya fueron comandados a cocina.')
      return false
    }

    const engine = PrintEngineService.getInstance()
    const activePrinters = engine.listPrinterProfiles(tenantId).filter((p) => p.isActive)
    if (!activePrinters.length) {
      window.alert('No hay ninguna impresora configurada. Ve a Más > Impresoras para agregar una impresora de cocina.')
      return false
    }

    const now = new Date().toISOString()
    const sequence = existingBatches.length + 1
    const payload: PrintJobPayload = {
      payloadSchemaVersion: 1,
      templateVersion: 'v1.0',
      restaurantName: companyName || restaurantName || 'PACHAX Restaurante',
      branchName: 'Principal',
      orderId: currentOrder.id,
      displayNumber: currentOrder.displayNumber || currentOrder.sequence?.toString() || currentOrder.id.slice(-4),
      tableInfo: currentOrder.tableInfo || 'MESA',
      customerName: currentOrder.customerName,
      fulfillmentType: currentOrder.fulfillmentType || 'table',
      items: lines.map((item) => ({
        name: item.name,
        basePrice: 0,
        quantity: item.quantity,
        lineTotal: 0,
        modifiersText: item.modifiers ? Object.values(item.modifiers).filter((v) => typeof v === 'string' && v !== item.modifiers?.note) as string[] : undefined,
        note: item.modifiers?.note,
      })),
      subtotal: 0,
      discountTotal: 0,
      taxTotal: 0,
      deliveryFee: 0,
      grandTotal: 0,
      isCopy: false,
      copies: 1,
      createdIso: now,
    }

    try {
      const job = await engine.submitPrintRequest({
        targetType: 'kitchen_ticket',
        orderId: currentOrder.id,
        idempotencyKey: `kitchen:${currentOrder.id}:${sequence}:${Date.now()}`,
        payload,
      })

      if (job.status === 'failed' || Boolean(job.lastError)) {
        throw new Error(job.lastError || 'Fallo de transmisión al enviar a impresora.')
      }

      setLastPrintedComanda(payload)
      setKitchenPrintJobs((prev) => [
        {
          id: job.id,
          idempotencyKey: job.idempotencyKey,
          orderId: currentOrder.id,
          batchId: `batch-${sequence}`,
          sequence,
          kind: 'new',
          status: 'sent',
          text: '',
          createdAt: now,
          sentAt: now,
          retries: 0,
          createdBy: uid || 'cashier',
        },
        ...prev,
      ])

      return true
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al imprimir la comanda.'
      window.alert(`Error de impresión: ${msg}`)
      return false
    }
  }

  const handleReprintLatestKitchenTicket = async () => {
    let payloadToReprint = lastPrintedComanda
    if (!payloadToReprint) {
      const lastOrderWithItems = orders.find((o) => o.items && o.items.length > 0)
      if (lastOrderWithItems) {
        payloadToReprint = {
          payloadSchemaVersion: 1,
          templateVersion: 'v1.0',
          restaurantName: companyName || restaurantName || 'PACHAX Restaurante',
          branchName: 'Principal',
          orderId: lastOrderWithItems.id,
          displayNumber: lastOrderWithItems.displayNumber || lastOrderWithItems.id.slice(-4),
          tableInfo: lastOrderWithItems.tableInfo || 'MESA',
          customerName: lastOrderWithItems.customerName,
          fulfillmentType: lastOrderWithItems.fulfillmentType || 'table',
          items: lastOrderWithItems.items.map((item) => ({
            name: item.name,
            basePrice: 0,
            quantity: item.quantity,
            lineTotal: 0,
            modifiersText: item.modifiers ? Object.values(item.modifiers).filter((v) => typeof v === 'string' && v !== item.modifiers?.note) as string[] : undefined,
            note: item.modifiers?.note,
          })),
          subtotal: 0,
          discountTotal: 0,
          taxTotal: 0,
          deliveryFee: 0,
          grandTotal: 0,
          isCopy: true,
          copies: 1,
          createdIso: new Date().toISOString(),
        }
      }
    }

    if (!payloadToReprint) {
      window.alert('No hay ninguna comanda previa para reimprimir.')
      return
    }

    const engine = PrintEngineService.getInstance()
    const activePrinters = engine.listPrinterProfiles(tenantId).filter((p) => p.isActive)
    if (!activePrinters.length) {
      window.alert('No hay ninguna impresora configurada. Ve a Más > Impresoras para configurarla.')
      return
    }

    try {
      const job = await engine.submitPrintRequest({
        targetType: 'kitchen_ticket',
        idempotencyKey: `reprint:${Date.now()}`,
        payload: {
          ...payloadToReprint,
          isCopy: true,
          createdIso: new Date().toISOString(),
        },
      })
      if (job.status === 'failed' || Boolean(job.lastError)) {
        throw new Error(job.lastError || 'Fallo de transmisión al reimprimir.')
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al reimprimir comanda.'
      window.alert(`Error de reimpresión: ${msg}`)
    }
  }

  const handlePrintKitchenTest = async () => {
    const engine = PrintEngineService.getInstance()
    const activePrinters = engine.listPrinterProfiles(tenantId).filter((p) => p.isActive)
    if (!activePrinters.length) {
      window.alert('No hay ninguna impresora configurada para probar. Ve a Más > Impresoras para configurarla.')
      return
    }

    try {
      const testPayload: PrintJobPayload = {
        payloadSchemaVersion: 1,
        templateVersion: 'v1.0',
        restaurantName: companyName || restaurantName || 'PACHAX Restaurante',
        branchName: 'Principal',
        displayNumber: 'PRUEBA',
        tableInfo: 'MESA TEST',
        items: [{ name: 'Ticket de prueba', basePrice: 0, quantity: 1, lineTotal: 0 }],
        subtotal: 0,
        discountTotal: 0,
        taxTotal: 0,
        deliveryFee: 0,
        grandTotal: 0,
        isCopy: false,
        copies: 1,
        createdIso: new Date().toISOString(),
      }

      const job = await engine.submitPrintRequest({
        targetType: 'test',
        payload: testPayload,
      })
      if (job.status === 'failed' || Boolean(job.lastError)) {
        throw new Error(job.lastError || 'Fallo de transmisión al dispositivo.')
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al probar impresora.'
      window.alert(`Error de prueba: ${msg}`)
    }
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
        isShiftOpen={isShiftOpen}
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
        onArchiveProduct={async (productId) => {
          try {
            await archiveProduct(tenantId, 'main', productId)
          } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : 'Error al archivar producto.'
            window.alert(msg)
            throw err
          }
        }}
        onDeleteProduct={async (productId) => {
          try {
            await deleteProduct(tenantId, 'main', productId)
          } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : 'Error al eliminar producto.'
            window.alert(msg)
            throw err
          }
        }}
        cashMovements={activeCashMovements}
        onCreateCashMovement={async (mov) => {
          try {
            await recordCashMovement(tenantId, 'main', mov)
          } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : 'Error al registrar movimiento de caja.'
            window.alert(msg)
            throw err
          }
        }}
        onCancelCashMovement={async (movementId, reason) => {
          try {
            await cancelCashMovement(tenantId, 'main', movementId, reason)
          } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : 'Error al anular movimiento de caja.'
            window.alert(msg)
            throw err
          }
        }}
        onUpdateCashMovement={async (movementId, updates) => {
          try {
            await updateCashMovement(tenantId, 'main', movementId, updates)
          } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : 'Error al actualizar movimiento de caja.'
            window.alert(msg)
            throw err
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
          } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : 'Error al registrar pedido.'
            window.alert(msg)
            return false
          }

          try {
            const engine = PrintEngineService.getInstance()
            const autoKitchenPrinters = engine
              .listPrinterProfiles(tenantId)
              .filter((p) => p.isActive && p.autoPrintOnOrderCreated && (p.role === 'kitchen' || p.role === 'bar'))

            if (autoKitchenPrinters.length > 0 && order.items && order.items.length > 0) {
              const now = new Date().toISOString()
              const tableDestination =
                order.tableInfo ||
                (order.fulfillmentType === 'pickup'
                  ? 'PARA LLEVAR'
                  : order.fulfillmentType === 'delivery'
                  ? 'DELIVERY'
                  : 'MOSTRADOR')
              const payload: PrintJobPayload = {
                payloadSchemaVersion: 1,
                templateVersion: 'v1.0',
                restaurantName: companyName || restaurantName || 'PACHAX Restaurante',
                branchName: 'Principal',
                orderId: order.id,
                displayNumber: order.displayNumber || order.sequence?.toString() || order.id.slice(-4),
                tableInfo: tableDestination,
                customerName: order.customerName,
                fulfillmentType: order.fulfillmentType || 'pickup',
                items: order.items.map((item) => ({
                  name: item.name,
                  basePrice: 0,
                  quantity: item.quantity,
                  lineTotal: 0,
                  modifiersText: item.modifiers ? Object.values(item.modifiers).filter((v) => typeof v === 'string' && v !== item.modifiers?.note) as string[] : undefined,
                  note: item.modifiers?.note,
                })),
                subtotal: 0,
                discountTotal: 0,
                taxTotal: 0,
                deliveryFee: 0,
                grandTotal: 0,
                isCopy: false,
                copies: 1,
                createdIso: now,
              }
              const job = await engine.submitPrintRequest({
                targetType: 'kitchen_ticket',
                orderId: order.id,
                idempotencyKey: `auto-kitchen:${order.id}:${Date.now()}`,
                payload,
              })
              if (job.status !== 'failed' && !job.lastError) {
                setLastPrintedComanda(payload)
              } else {
                console.warn('Auto-print kitchen job notice:', job.lastError)
                window.alert(`El pedido se guardó correctamente, pero la impresora reportó: ${job.lastError || 'Fallo de transmisión'}. Puedes reimprimir desde Pedidos.`)
              }
            }
          } catch (printErr: unknown) {
            console.warn('Auto-print exception:', printErr)
            const msg = printErr instanceof Error ? printErr.message : 'Error al imprimir'
            window.alert(`El pedido se guardó correctamente, pero falló la impresión automática: ${msg}. Puedes reimprimir desde Pedidos.`)
          }

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
            // La venta y el cobro SIEMPRE se guardan antes de imprimir
            await recordPayment(tenantId, 'main', orderId, input)

            // Si hay impresora de recibos con auto-impresión activa, emitir ticket
            const receiptPrinter = getActiveReceiptPrinter(tenantId, 'main')
            const paidOrder = orders.find((o) => o.id === orderId)
            if (receiptPrinter && receiptPrinter.autoPrintOnOrderPaid && paidOrder) {
              try {
                await PrintEngineService.getInstance().submitPrintRequest({
                  targetType: 'receipt',
                  printerProfileId: receiptPrinter.id,
                  payload: {
                    payloadSchemaVersion: 1,
                    templateVersion: 'v1.0',
                    restaurantName: documentContext.companyName,
                    branchName: documentContext.branchName || 'Principal',
                    branchAddress: documentContext.address,
                    branchPhone: documentContext.phone,
                    logoUrl: documentContext.logoUrl,
                    headerDetails: documentContext.formattedHeaderLines,
                    displayNumber: paidOrder.displayNumber || paidOrder.id.slice(-4),
                    tableInfo: paidOrder.tableInfo || 'MOSTRADOR',
                    customerName: paidOrder.customerName,
                    customerPhone: paidOrder.customerPhone,
                    fulfillmentType: paidOrder.fulfillmentType || 'table',
                    items: paidOrder.items.map((item) => ({
                      name: item.name,
                      basePrice: item.basePrice,
                      quantity: item.quantity,
                      lineTotal: item.lineTotal,
                    })),
                    subtotal: paidOrder.total,
                    discountTotal: 0,
                    taxTotal: 0,
                    deliveryFee: 0,
                    grandTotal: paidOrder.total,
                    paymentMethod: input.method === 'cash' ? 'EFECTIVO' : input.method === 'qr' ? 'QR' : input.method === 'card' ? 'TARJETA' : 'MIXTO',
                    footerMessage: documentContext.receiptFooter,
                    showManagedBy: documentContext.showManagedBy,
                    isCopy: false,
                    copies: 1,
                    createdIso: new Date().toISOString(),
                  },
                })
              } catch (printErr) {
                console.warn('[RestaurantApp] Fallo de impresión de recibo tras cobro exitoso:', printErr)
              }
            }
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
            // Si hay impresora de recibos configurada, emitir pre-cuenta de mesa
            const receiptPrinter = getActiveReceiptPrinter(tenantId, 'main')
            const targetTable = tables.find((t) => t.id === tableId)
            const targetOrder = orders.find((o) => o.id === targetTable?.activeOrderId)
            if (receiptPrinter && targetOrder) {
              try {
                await PrintEngineService.getInstance().submitPrintRequest({
                  targetType: 'receipt',
                  printerProfileId: receiptPrinter.id,
                  payload: {
                    payloadSchemaVersion: 1,
                    templateVersion: 'v1.0',
                    restaurantName: documentContext.companyName,
                    branchName: documentContext.branchName || 'Principal',
                    branchAddress: documentContext.address,
                    branchPhone: documentContext.phone,
                    logoUrl: documentContext.logoUrl,
                    headerDetails: documentContext.formattedHeaderLines,
                    displayNumber: targetOrder.displayNumber || targetOrder.id.slice(-4),
                    tableInfo: targetTable?.name || 'MESA',
                    customerName: targetOrder.customerName,
                    customerPhone: targetOrder.customerPhone,
                    fulfillmentType: 'table',
                    items: targetOrder.items.map((item) => ({
                      name: item.name,
                      basePrice: item.basePrice,
                      quantity: item.quantity,
                      lineTotal: item.lineTotal,
                    })),
                    subtotal: targetOrder.total,
                    discountTotal: 0,
                    taxTotal: 0,
                    deliveryFee: 0,
                    grandTotal: targetOrder.total,
                    customMessage: 'PRE-CUENTA DE MESA (NO VALIDO COMO FACTURA)',
                    footerMessage: documentContext.receiptFooter,
                    showManagedBy: documentContext.showManagedBy,
                    isCopy: false,
                    copies: 1,
                    createdIso: new Date().toISOString(),
                  },
                })
              } catch (printErr) {
                console.warn('[RestaurantApp] Fallo de impresión de pre-cuenta (no bloqueante):', printErr)
              }
            }
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
        onPrintBatch={handlePrintBatch}
        onReprintLatestKitchenTicket={handleReprintLatestKitchenTicket}
        onPrintKitchenTest={handlePrintKitchenTest}
        kitchenPrintJobs={kitchenPrintJobs}
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
        businessIdentity={activeIdentity}
        onSaveBusinessIdentity={handleSaveBusinessIdentity}
        onUploadLogo={handleUploadLogo}
      />
    </>
  )
}
