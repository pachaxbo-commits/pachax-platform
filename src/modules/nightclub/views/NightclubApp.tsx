import { useState, useEffect } from 'react'
import { NightclubExperience } from './NightclubExperience'
import { useTenantNightclubController } from '../application/useTenantNightclubController'
import type { BusinessIdentity } from '../../../core/businessIdentity'
import { updateTenantBusinessIdentity, uploadTenantLogoToFirebase } from '../../../lib/firebase'
import { initializePrinting } from '../../../services/printing/printerBootstrap'

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

  const controller = useTenantNightclubController({
    tenantId: props.tenantId,
    uid: props.uid,
    userName: props.userName,
    role: props.role,
    companyName: activeIdentity?.tradeName || props.companyName,
    logoUrl: activeIdentity?.showLogo !== false ? (activeIdentity?.logoUrl || props.logoUrl) : undefined,
  })

  return (
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
      onSaveBusinessIdentity={handleSaveBusinessIdentity}
      onUploadLogo={handleUploadLogo}
      {...controller}
    />
  )
}
