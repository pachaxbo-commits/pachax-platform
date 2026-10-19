import { useState, useEffect, useMemo } from 'react'
import { NightclubExperience } from './NightclubExperience'
import { useTenantNightclubController } from '../application/useTenantNightclubController'
import type { BusinessIdentity } from '../../../core/businessIdentity'
import { updateTenantBusinessIdentity, uploadTenantLogoToFirebase } from '../../../lib/firebase'
import { initializePrinting } from '../../../services/printing/printerBootstrap'
import { getActiveTenant } from '../../../store/activeTenant'
import { BusinessTemplateRegistry } from '../../../core/templates'
import { NIGHTCLUB_ROLE_DEFAULTS, type NightclubBuiltinRole } from '../domain/nightclubUsers'

interface NightclubAppProps {
  tenantId: string
  companyName: string
  logoUrl?: string
  uid: string
  userName: string
  role: string
  onSignOut: () => Promise<void>
  businessIdentity?: BusinessIdentity
}

/** Production Nightclub Experience connected to real multi-tenant Firestore & Functions. */
export function NightclubApp(props: NightclubAppProps) {
  const [activeIdentity, setActiveIdentity] = useState<BusinessIdentity | undefined>(props.businessIdentity)

  useEffect(() => {
    if (props.businessIdentity) {
      setActiveIdentity(props.businessIdentity)
    }
  }, [props.businessIdentity])

  useEffect(() => {
    if (props.tenantId) {
      initializePrinting(props.tenantId, 'main')
    }
  }, [props.tenantId])

  const handleSaveBusinessIdentity = async (newIdentity: BusinessIdentity) => {
    await updateTenantBusinessIdentity(props.tenantId, newIdentity)
    setActiveIdentity(newIdentity)
  }

  const handleUploadLogo = async (file: File) => {
    return await uploadTenantLogoToFirebase(file, props.tenantId)
  }

  const normalizedRole = props.role === 'owner' ? 'admin' : (props.role as NightclubBuiltinRole)

  const effectivePermissions = useMemo(() => {
    const activeTenant = getActiveTenant()
    const platformPerms = activeTenant?.permissions ?? (
      BusinessTemplateRegistry.nightclub_lounge.roles.find(r => r.id === props.role)?.permissions ?? []
    )
    const defaults = NIGHTCLUB_ROLE_DEFAULTS[normalizedRole] || []
    return new Set<string>([...platformPerms, ...defaults])
  }, [props.role, normalizedRole])

  const controller = useTenantNightclubController({
    tenantId: props.tenantId,
    uid: props.uid,
    userName: props.userName,
    role: props.role,
    companyName: activeIdentity?.tradeName || props.companyName,
    logoUrl: activeIdentity?.showLogo !== false ? (activeIdentity?.logoUrl || props.logoUrl) : undefined,
    permissions: effectivePermissions,
  })

  return (
    <>
      {controller.syncError && (
        <div role="alert" className="sticky top-0 z-[200] border-b border-amber-200 bg-amber-50 px-4 py-2 text-xs font-semibold text-amber-900 flex items-center justify-between">
          <span>{controller.syncError}</span>
          <button type="button" onClick={() => controller.setSyncError(null)} className="text-amber-700 hover:text-amber-950 underline ml-2 cursor-pointer">Cerrar</button>
        </div>
      )}
      <NightclubExperience
        companyName={activeIdentity?.tradeName || props.companyName}
        logoUrl={activeIdentity?.showLogo !== false ? (activeIdentity?.logoUrl || props.logoUrl) : undefined}
        userName={props.userName}
        role={props.role}
        onSignOut={props.onSignOut}
        mode="tenant"
        tenantId={props.tenantId}
        branchId="main"
        businessIdentity={activeIdentity}
        permissions={effectivePermissions}
        onSaveBusinessIdentity={handleSaveBusinessIdentity}
        onUploadLogo={handleUploadLogo}
        {...controller}
      />
    </>
  )
}
