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
import type { DistributionIndustryProfile } from '../../modules/distribution/types'
import { PROFILE_METADATA } from '../datasets/distribution/profileDatasets'

export function DistributionDemo({
  simulatedRole = 'admin',
  logoUrl,
  companyName,
  datasetMode = 'full',
  resetKey = 0,
  initialProfile,
}: {
  mode?: 'team' | 'simulated_role'
  simulatedRole?: string
  onSelectRole?: (roleId: string) => void
  logoUrl?: string
  companyName?: string
  datasetMode?: DemoDatasetMode
  resetKey?: number
  initialProfile?: DistributionIndustryProfile
}) {
  const searchParams = useMemo(() => {
    if (typeof window === 'undefined') return new URLSearchParams()
    return new URLSearchParams(window.location.search)
  }, [])

  const rawProfile = searchParams.get('profile')
  const validProfiles: readonly DistributionIndustryProfile[] = [
    'food',
    'beverages',
    'cleaning',
    'hardware',
    'pharmacy',
    'pets',
    'stationery',
    'spare_parts',
    'mixed',
  ]
  const initialProfileParam =
    initialProfile ||
    (validProfiles.includes(rawProfile as DistributionIndustryProfile)
      ? (rawProfile as DistributionIndustryProfile)
      : 'food')
  const tourParam = searchParams.get('tour')
  const shouldOpenTour = tourParam === 'start' || tourParam === '1' || tourParam === 'true'

  const [activeProfile, setActiveProfile] = useState<DistributionIndustryProfile>(initialProfileParam)
  const [isPrinterOpen, setIsPrinterOpen] = useState(false)
  const repoRef = useRef<DemoDistributionRepository | null>(null)
  if (!repoRef.current) {
    repoRef.current = new DemoDistributionRepository(datasetMode, activeProfile)
  }

  const [currentData, setCurrentData] = useState(() => repoRef.current!.getData())

  const prevResetRef = useRef(`${datasetMode}:${resetKey}`)
  if (prevResetRef.current !== `${datasetMode}:${resetKey}`) {
    prevResetRef.current = `${datasetMode}:${resetKey}`
    repoRef.current.reset(datasetMode, activeProfile)
    setCurrentData(repoRef.current.getData())
  }

  useEffect(() => {
    enterDemoMode('route_distribution')
    const repo = repoRef.current || new DemoDistributionRepository(datasetMode, activeProfile)
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
  }, [datasetMode, resetKey, activeProfile])

  const [dayKeys, setDayKeys] = useState<string[]>(() => {
    return [new Date().toISOString().slice(0, 10)]
  })

  const role = (simulatedRole as UserRole) || 'admin'
  const can = useMemo(() => (permission: Permission) => hasPermission(role, permission), [role])

  const profileMeta = PROFILE_METADATA[activeProfile] || PROFILE_METADATA.food
  const effectiveCompanyName = companyName || profileMeta.commercialName

  const session: DistributionSession = {
    tenantId: 'preview-distribution',
    restaurantName: effectiveCompanyName,
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

  const handleSelectProfile = (newProfile: DistributionIndustryProfile) => {
    setActiveProfile(newProfile)
    if (typeof window !== 'undefined' && window.history?.replaceState) {
      const url = new URL(window.location.href)
      url.searchParams.set('profile', newProfile)
      window.history.replaceState({}, '', url.toString())
    }
    repoRef.current?.switchProfile(newProfile)
    if (repoRef.current) {
      setCurrentData({ ...repoRef.current.getData() })
    }
  }

  const handleResetPractice = () => {
    repoRef.current?.reset(datasetMode, activeProfile)
    if (repoRef.current) {
      setCurrentData({ ...repoRef.current.getData() })
    }
  }

  return (
    <>
      <DistributionExperience
        session={session}
        data={currentData}
        syncState={syncState}
        logoUrl={logoUrl}
        companyName={effectiveCompanyName}
        activeProfile={activeProfile}
        onSelectProfile={handleSelectProfile}
        onResetPractice={handleResetPractice}
        initialOpenTour={shouldOpenTour}
        isDemo={true}
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
