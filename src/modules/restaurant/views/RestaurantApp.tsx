import { useEffect } from 'react'
import { getBusinessTypeDefinition } from '../../../config/businessTypes'
import { applyTenantTheme } from '../../../lib/tenantTheme'
import {
  RestaurantExperience,
  type RestaurantSession,
} from './RestaurantExperience'
import {
  RESTAURANT_CATEGORIES,
  RESTAURANT_EXTRAS,
  INITIAL_TABLES,
  INITIAL_RESTAURANT_ORDERS,
  RESTAURANT_PRODUCTS,
} from '../../../demo/mocks/restaurantMock'

export function RestaurantApp({
  tenantId,
  restaurantName,
  uid,
  userName,
  role,
  logoUrl,
  companyName,
  onSignOut,
  onOpenPrinterSettings,
}: {
  tenantId: string
  restaurantName: string
  uid: string
  userName: string
  role: string
  logoUrl?: string
  companyName?: string
  onSignOut: () => Promise<void>
  onOpenPrinterSettings?: () => void
}) {
  const definition = getBusinessTypeDefinition('restaurant')

  useEffect(() => {
    applyTenantTheme(definition.theme)
  }, [definition.theme])

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
      orders={INITIAL_RESTAURANT_ORDERS}
      tables={INITIAL_TABLES}
      products={RESTAURANT_PRODUCTS}
      shift={null}
      categories={RESTAURANT_CATEGORIES}
      quickExtras={RESTAURANT_EXTRAS}
      onStartShift={() => {}}
      onCloseShift={() => true}
      onAddOrder={() => false}
      onAdvanceStatus={async () => true}
      onCancelOrder={async () => true}
      onPayment={() => {}}
      onOpenTableOrder={() => {}}
      onUpdateTableStatus={() => {}}
      onRequestBill={() => {}}
      onReopenBill={() => {}}
      onAddProduct={() => {}}
      onPrintBatch={() => {}}
      onCreateProduct={() => {}}
      onSignOut={onSignOut}
      onOpenPrinterSettings={onOpenPrinterSettings}
    />
  )
}
