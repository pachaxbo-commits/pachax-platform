import { useState, useMemo, useRef } from 'react'
import { createDistributionDataset } from '../datasets'
import type { DemoDatasetMode } from '../datasets/types'
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
  datasetMode = 'full',
  resetKey = 0,
}: {
  mode?: 'team' | 'simulated_role'
  simulatedRole?: string
  onSelectRole?: (roleId: string) => void
  logoUrl?: string
  companyName?: string
  datasetMode?: DemoDatasetMode
  resetKey?: number
}) {
  const [isPrinterOpen, setIsPrinterOpen] = useState(false)
  const initialDataset = useRef(createDistributionDataset(datasetMode))
  const [currentData, setCurrentData] = useState(() => initialDataset.current.data)

  const prevResetRef = useRef(`${datasetMode}:${resetKey}`)
  if (prevResetRef.current !== `${datasetMode}:${resetKey}`) {
    prevResetRef.current = `${datasetMode}:${resetKey}`
    setCurrentData(createDistributionDataset(datasetMode).data)
  }

  const [dayKeys, setDayKeys] = useState<string[]>(() => {
    return [new Date().toISOString().slice(0, 10)]
  })

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
        data={currentData}
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
