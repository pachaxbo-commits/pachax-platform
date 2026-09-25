import type { DemoDatasetMode } from '../datasets/types'
import { createNightclubDataset } from '../datasets/nightclub/nightclubDatasets'
import { NightclubExperience } from '../../modules/nightclub/views/NightclubExperience'
import { useNightclubController } from '../../modules/nightclub/views/useNightclubController'

export function NightclubDemo({ datasetMode = 'full', simulatedRole = 'admin', logoUrl, companyName }: { datasetMode?: DemoDatasetMode; resetKey?: number; simulatedRole?: string; logoUrl?: string; companyName?: string }) {
  const controller = useNightclubController(() => createNightclubDataset(datasetMode), 'Equipo Demo', 'pachax:nightclub-demo:operations:v2', datasetMode)
  return <NightclubExperience companyName={companyName || 'Nocturna Demo'} logoUrl={logoUrl} userName="Equipo Demo" role={simulatedRole} {...controller} />
}
