import { createNightclubDataset } from '../../../demo/datasets/nightclub/nightclubDatasets'
import { NightclubExperience } from './NightclubExperience'
import { useNightclubController } from './useNightclubController'

export function NightclubApp({ companyName, logoUrl, userName, role, onSignOut }: { tenantId: string; companyName: string; logoUrl?: string; uid: string; userName: string; role: string; onSignOut: () => Promise<void> }) {
  const controller = useNightclubController(() => createNightclubDataset('full'), userName)
  return <NightclubExperience companyName={companyName} logoUrl={logoUrl} userName={userName} role={role} {...controller} onSignOut={onSignOut} />
}
