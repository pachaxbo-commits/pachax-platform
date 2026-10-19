import { useState, useMemo, useEffect, useRef } from 'react'
import type { DemoDatasetMode } from '../datasets/types'
import { DistributionPrinterModal } from '../../modules/distribution/views/DistributionPrinterModal'
import {
  DistributionExperience,
  type DistributionSession,
  type DistributionSyncState,
} from '../../modules/distribution/views/DistributionExperience'
import { hasPermission } from '../../services/permissionService'
import type { UserRole, Permission } from '../../types'
import { DemoDistributionRepository } from './demoDistributionRepository'
import { setDistributionRepositoryAdapter } from '../../modules/distribution/data/distributionRepository'
import { enterDemoMode, exitDemoMode } from '../core/demoContext'

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
  const repoRef = useRef<DemoDistributionRepository | null>(null)
  if (!repoRef.current) {
    repoRef.current = new DemoDistributionRepository(datasetMode)
  }

  const [currentData, setCurrentData] = useState(() => repoRef.current!.getData())

  const prevResetRef = useRef(`${datasetMode}:${resetKey}`)
  if (prevResetRef.current !== `${datasetMode}:${resetKey}`) {
    prevResetRef.current = `${datasetMode}:${resetKey}`
    repoRef.current.reset(datasetMode)
    setCurrentData(repoRef.current.getData())
  }

  useEffect(() => {
    enterDemoMode('route_distribution')
    const repo = repoRef.current || new DemoDistributionRepository(datasetMode)
    repoRef.current = repo
    setDistributionRepositoryAdapter(repo)

    const unsub = repo.subscribeAll((data) => {
      setCurrentData({ ...data })
    })

    return () => {
      unsub()
      setDistributionRepositoryAdapter(null)
      exitDemoMode()
    }
  }, [datasetMode, resetKey])

  const [dayKeys, setDayKeys] = useState<string[]>(() => {
    return [new Date().toISOString().slice(0, 10)]
  })

  const role = (simulatedRole as UserRole) || 'admin'
  const can = useMemo(() => (permission: Permission) => hasPermission(role, permission), [role])

  const session: DistributionSession = {
    tenantId: 'preview-distribution',
    restaurantName: companyName || 'Distribuidora Demo',
    uid:
      role === 'distributor'
        ? 'v1'
        : role === 'warehouse'
        ? 'w1'
        : role === 'support'
        ? 's1'
        : role === 'accountant'
        ? 'acc1'
        : role === 'owner'
        ? 'owner-preview-uid'
        : 'admin-preview-uid',
    userName:
      role === 'distributor'
        ? 'Hugo Distribuidor'
        : role === 'warehouse'
        ? 'Almacén Central'
        : role === 'support'
        ? 'Soporte Técnico'
        : role === 'accountant'
        ? 'Contador Demo'
        : role === 'owner'
        ? 'Propietario Demo'
        : 'Administrador Demo',
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
          window.location.assign('/')
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
