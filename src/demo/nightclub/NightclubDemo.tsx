import type { DemoDatasetMode } from '../datasets/types'
import { createNightclubDataset, createPristineNightclubDataset } from '../datasets/nightclub/nightclubDatasets'
import { NightclubExperience } from '../../modules/nightclub/views/NightclubExperience'
import { useNightclubController } from '../../modules/nightclub/views/useNightclubController'
import type { StudioBranding } from '../../studio/branding/brandingTypes'

export function NightclubDemo({ datasetMode = 'full', resetKey = 0, simulatedRole = 'admin', logoUrl, companyName, studioBranding, isStudio = false }: { datasetMode?: DemoDatasetMode; resetKey?: number; simulatedRole?: string; logoUrl?: string; companyName?: string; studioBranding?: StudioBranding | null; isStudio?: boolean }) {
  const controller = useNightclubController(() => isStudio && datasetMode === 'empty' ? createPristineNightclubDataset() : createNightclubDataset(datasetMode), 'Equipo Demo', isStudio ? 'pachax:nightclub-studio:operations:v3' : 'pachax:nightclub-demo:operations:v3', datasetMode, resetKey, simulatedRole)
  const onSaveBranding = (value: Parameters<typeof controller.onSaveBranding>[0]) => {
    controller.onSaveBranding(value)
    if (isStudio) window.parent.postMessage({ type: 'PACHAX_STUDIO_BRANDING', templateId: 'nightclub', branding: { companyName: value.businessName, logoUrl: value.logoDataUrl, primaryColor: value.primaryColor, accentColor: value.accentColor, surfaceColor: value.surfaceColor } }, window.location.origin)
  }
  return <NightclubExperience companyName={companyName || 'Nocturna Demo'} logoUrl={logoUrl} studioBranding={studioBranding} userName="Equipo Demo" role={simulatedRole} {...controller} onSaveBranding={onSaveBranding} />
}
