import type { DemoDatasetMode } from '../datasets/types'
import { createNightclubDataset } from '../datasets/nightclub/nightclubDatasets'
import { NightclubExperience } from '../../modules/nightclub/views/NightclubExperience'
import { useNightclubController } from '../../modules/nightclub/views/useNightclubController'

export function NightclubDemo({ datasetMode = 'full', resetKey = 0, simulatedRole = 'admin', logoUrl, companyName }: { datasetMode?: DemoDatasetMode; resetKey?: number; simulatedRole?: string; logoUrl?: string; companyName?: string }) {
  const controller = useNightclubController(() => createNightclubDataset(datasetMode), 'Equipo Demo', 'pachax:nightclub-demo:operations:v3', datasetMode, resetKey)
  return <NightclubExperience companyName={companyName || 'Nocturna Demo'} logoUrl={logoUrl} userName="Equipo Demo" role={simulatedRole} {...controller} />
}
