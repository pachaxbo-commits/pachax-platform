import { useState, useMemo } from 'react'
import { previewData } from '../../preview-data'
import { DistributionPrinterModal } from '../../modules/distribution/views/DistributionPrinterModal'
import {
  DistributionExperience,
  type DistributionSession,
  type DistributionSyncState,
} from '../../modules/distribution/views/DistributionExperience'
import { hasPermission } from '../../services/permissionService'
import type { UserRole, Permission } from '../../types'

export function DistributionDemo({
  simulatedRole = 'admin',
  logoUrl,
  companyName,
}: {
  mode?: 'team' | 'simulated_role'
  simulatedRole?: string
  onSelectRole?: (roleId: string) => void
  logoUrl?: string
  companyName?: string
}) {
  const [isPrinterOpen, setIsPrinterOpen] = useState(false)
  const [dayKeys, setDayKeys] = useState<string[]>(['2026-09-08'])

  const role = (simulatedRole as UserRole) || 'admin'
  const can = useMemo(() => (permission: Permission) => hasPermission(role, permission), [role])

  const session: DistributionSession = {
    tenantId: 'preview-distribution',
    restaurantName: companyName || 'Distribuidora Demo',
    uid: role === 'distributor' ? 'v1' : 'admin-preview-uid',
    userName:
      role === 'distributor'
        ? 'Hugo Distribuidor'
        : role === 'warehouse'
        ? 'Almacén Central'
        : 'Administrador',
    role,
    warehouseId: 'central',
    routeId: role === 'distributor' ? 'route-norte' : null,
    can,
    dayKeys,
    setDayKeys,
  }

  const syncState: DistributionSyncState = {
    isOnline: true,
    pending: 0,
    hasUnsyncedWrites: false,
    lastSyncedAt: new Date().toISOString(),
    lastError: null,
  }

  return (
    <>
      <DistributionExperience
        session={session}
        data={previewData}
        syncState={syncState}
        logoUrl={logoUrl}
        companyName={companyName || 'Distribuidora Demo'}
        onSignOut={() => {
          // Acción simulada en modo demo
        }}
        onOpenPrinterSettings={() => setIsPrinterOpen(true)}
      />
      {isPrinterOpen && (
        <DistributionPrinterModal
          tenantId="preview-distribution"
          onClose={() => setIsPrinterOpen(false)}
        />
      )}
    </>
  )
}
