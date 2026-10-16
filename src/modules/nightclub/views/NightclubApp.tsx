import { NightclubExperience } from './NightclubExperience'
import { useTenantNightclubController } from '../application/useTenantNightclubController'

interface NightclubAppProps {
  tenantId: string
  companyName: string
  logoUrl?: string
  uid: string
  userName: string
  role: string
  onSignOut: () => Promise<void>
}

/** Production Nightclub Experience connected to real multi-tenant Firestore & Functions. */
export function NightclubApp(props: NightclubAppProps) {
  const controller = useTenantNightclubController({
    tenantId: props.tenantId,
    uid: props.uid,
    userName: props.userName,
    role: props.role,
    companyName: props.companyName,
    logoUrl: props.logoUrl,
  })

  return (
    <NightclubExperience
      companyName={props.companyName}
      logoUrl={props.logoUrl}
      userName={props.userName}
      role={props.role}
      onSignOut={props.onSignOut}
      {...controller}
    />
  )
}
