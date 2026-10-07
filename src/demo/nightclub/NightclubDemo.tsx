import type { DemoDatasetMode } from '../datasets/types'
import { createNightclubDataset, createPristineNightclubDataset } from '../datasets/nightclub/nightclubDatasets'
import { NightclubExperience } from '../../modules/nightclub/views/NightclubExperience'
import { useNightclubController } from '../../modules/nightclub/views/useNightclubController'

export function NightclubDemo({ datasetMode = 'full', resetKey = 0, simulatedRole = 'admin', logoUrl, companyName, isStudio = false }: { datasetMode?: DemoDatasetMode; resetKey?: number; simulatedRole?: string; logoUrl?: string; companyName?: string; isStudio?: boolean }) {
  const controller = useNightclubController(() => isStudio && datasetMode === 'empty' ? createPristineNightclubDataset() : createNightclubDataset(datasetMode), 'Equipo Demo', isStudio ? 'pachax:nightclub-studio:operations:v3' : 'pachax:nightclub-demo:operations:v3', datasetMode, resetKey, simulatedRole)
  return <NightclubExperience companyName={companyName || 'Nocturna Demo'} logoUrl={logoUrl} userName="Equipo Demo" role={simulatedRole} {...controller} />
}
