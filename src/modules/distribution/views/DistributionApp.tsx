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
import type { BusinessIdentity } from '../../../core/businessIdentity'
import { loadSupportSettings } from '../data/supportMaintenance'
import { resolveDistributionBusinessIdentity } from '../data/distributionReceiptService'
import { updateTenantBusinessIdentity, uploadTenantLogoToFirebase } from '../../../lib/firebase'
import { initializePrinting } from '../../../services/printing/printerBootstrap'

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
  businessIdentity: initialBusinessIdentity,
  companyName,
  logoUrl,
  primaryColor,
  accentColor,
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
  businessIdentity?: BusinessIdentity
  companyName?: string
  logoUrl?: string
  primaryColor?: string
  accentColor?: string
}) {
  const definition = getBusinessTypeDefinition('mobile_distribution')

  const [activeIdentity, setActiveIdentity] = useState<BusinessIdentity | undefined>(initialBusinessIdentity)

  useEffect(() => {
    initializePrinting(tenantId, 'main')
  }, [tenantId])

  useEffect(() => {
    if (initialBusinessIdentity) {
      setActiveIdentity(initialBusinessIdentity)
      return
    }
    let isMounted = true
    void loadSupportSettings().then((settings) => {
      if (isMounted) {
        const resolved = resolveDistributionBusinessIdentity(initialBusinessIdentity, settings, restaurantName)
        setActiveIdentity(resolved)
      }
    })
    return () => {
      isMounted = false
    }
  }, [tenantId, initialBusinessIdentity, restaurantName])

  useEffect(() => {
    const effectivePrimary = activeIdentity?.primaryColor || primaryColor || definition.theme.primary
    const effectiveAccent = activeIdentity?.accentColor || accentColor || definition.theme.accent
    applyTenantTheme({
      ...definition.theme,
      primary: effectivePrimary,
      accent: effectiveAccent,
    })
  }, [activeIdentity?.primaryColor, activeIdentity?.accentColor, primaryColor, accentColor, definition.theme])

  const handleSaveBusinessIdentity = async (newIdentity: BusinessIdentity) => {
    await updateTenantBusinessIdentity(tenantId, newIdentity)
    setActiveIdentity(newIdentity)
  }

  const handleUploadLogo = async (file: File) => {
    return await uploadTenantLogoToFirebase(file, tenantId)
  }

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
      logoUrl={activeIdentity?.logoUrl || logoUrl}
      companyName={activeIdentity?.tradeName || companyName}
      businessIdentity={activeIdentity}
      onSaveBusinessIdentity={handleSaveBusinessIdentity}
      onUploadLogo={handleUploadLogo}
    />
  )
}

export { buildDayRange }
