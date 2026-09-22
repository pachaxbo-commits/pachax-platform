import { useEffect, useMemo, useState } from 'react'
import { dismissSyncError } from '../data/distributionRepository'
import { acknowledgeOperation } from '../data/operationQueue'
import { getBusinessTypeDefinition } from '../../../config/businessTypes'
import { hasPermission } from '../../../services/permissionService'
import { applyTenantTheme } from '../../../lib/tenantTheme'
import { buildDayRange, useDistributionData, useSyncStatus } from '../state/useDistributionStore'
import { toDayKey } from '../domain/engine'
import {
  DistributionExperience,
  type DistributionSession,
  type DistributionViewProps,
} from './DistributionExperience'
import type { Permission, UserRole } from '../../../types'

export type { DistributionSession, DistributionViewProps }

export function DistributionApp({
  tenantId,
  restaurantName,
  uid,
  userName,
  role,
  routeId,
  warehouseId = 'central',
  onSignOut,
  onOpenPrinterSettings,
}: {
  tenantId: string
  restaurantName: string
  uid: string
  userName: string
  role: UserRole
  warehouseId?: string
  routeId: string | null
  onSignOut: () => Promise<void>
  onOpenPrinterSettings: () => void
}) {
  const definition = getBusinessTypeDefinition('mobile_distribution')

  useEffect(() => {
    applyTenantTheme(definition.theme)
  }, [definition.theme])

  const can = useMemo(() => (permission: Permission) => hasPermission(role, permission), [role])
  const [dayKeys, setDayKeys] = useState<string[]>([toDayKey(new Date())])

  // El distribuidor solo consulta su propia ruta y su propio día.
  const scopeRouteId = role === 'distributor' ? routeId : null
  const canReadFinance = can('dist.credit.view') || can('dist.credit.viewAll')
  const data = useDistributionData({
    routeId: scopeRouteId,
    distributorUid: role === 'distributor' ? uid : undefined,
    dayKeys: role === 'distributor' ? [toDayKey(new Date())] : dayKeys,
    enabled: role !== 'support',
    tenantId,
    warehouseId: role === 'warehouse' ? warehouseId : undefined,
    canReadFinance,
  })

  const syncState = useSyncStatus()

  const session: DistributionSession = {
    tenantId,
    restaurantName,
    uid,
    userName,
    role,
    routeId: scopeRouteId,
    warehouseId,
    can,
    dayKeys: role === 'distributor' ? [toDayKey(new Date())] : dayKeys,
    setDayKeys,
  }

  return (
    <DistributionExperience
      session={session}
      data={data}
      syncState={syncState}
      onSignOut={onSignOut}
      onOpenPrinterSettings={onOpenPrinterSettings}
      onDismissSyncError={dismissSyncError}
      onAcknowledgeOperation={acknowledgeOperation}
    />
  )
}

export { buildDayRange }
