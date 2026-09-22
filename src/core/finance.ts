/** PACHAX revenue is separate from tenants' commercial sales. No computed mock revenue. */
export interface SubscriptionRecord {
  tenantId: string
  planKey: string | null
  currency: string
  monthlyPriceMinor: number | null
  status: 'trial' | 'active' | 'past_due' | 'suspended' | 'cancelled'
  nextPaymentAt: string | null
  trialEndsAt: string | null
  discountMinor: number | null
  source: 'manual' | 'provider'
}
export interface CustomDevelopment {
  id: string; tenantId: string; title: string; description: string
  status: 'requested' | 'reviewing' | 'quoted' | 'approved' | 'development' | 'delivered' | 'cancelled'
  currency: string; quotedMinor: number | null; approvedMinor: number | null
  createdAt: string; createdBy: string
}
export interface PlatformMetrics {
  asOf: string
  tenantsTotal: number
  activeTenants: number
  source: 'server-aggregate'
}
export interface TenantHealth {
  tenantId: string; schemaVersion: number; templateVersion: number
  lastAccessAt: string | null; lastSaleAt: string | null; lastSyncAt: string | null
  pendingOperations: number | null; appVersion: string | null
}
export const financialConnection = Object.freeze({
  connected: false,
  billingMessage: 'Billing no configurado',
  financeMessage: 'Sin datos financieros conectados',
  infrastructureMessage: 'No conectado a métricas de infraestructura',
  telemetryMessage: 'Telemetría no disponible',
})
