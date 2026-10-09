import { useState } from 'react'
import { demoPermissionSet, guardNightclubDemoController } from './nightclubDemoAccess'
import type { DemoDatasetMode } from '../datasets/types'
import { createNightclubDataset, createPristineNightclubDataset } from '../datasets/nightclub/nightclubDatasets'
import { NightclubExperience } from '../../modules/nightclub/views/NightclubExperience'
import { useNightclubController } from '../../modules/nightclub/views/useNightclubController'
import type { StudioBranding } from '../../studio/branding/brandingTypes'

export function NightclubDemo({ datasetMode = 'full', resetKey = 0, simulatedRole = 'admin', logoUrl, companyName, studioBranding, isStudio = false }: { datasetMode?: DemoDatasetMode; resetKey?: number; simulatedRole?: string; logoUrl?: string; companyName?: string; studioBranding?: StudioBranding | null; isStudio?: boolean }) {
  const [selectedUserId, setSelectedUserId] = useState('')
  const [selectedName, setSelectedName] = useState('Equipo Demo')
  const controller = useNightclubController(() => isStudio && datasetMode === 'empty' ? createPristineNightclubDataset() : createNightclubDataset(datasetMode), selectedName, isStudio ? 'pachax:nightclub-studio:operations:v3' : 'pachax:nightclub-demo:operations:v3', datasetMode, resetKey, isStudio ? simulatedRole : 'admin')
  const selectedUser = controller.data.staff?.find(user => user.id === selectedUserId && user.active) || null
  const permissions = isStudio ? null : demoPermissionSet(controller.data, selectedUser, selectedUserId)
  const guarded = guardNightclubDemoController(controller, permissions, selectedUser)
  const selectUser = (id: string) => { const user = controller.data.staff?.find(item => item.id === id && item.active); if (id && !user) return; setSelectedUserId(id); setSelectedName(user?.name || 'Equipo Demo') }
  const onSaveBranding = (value: Parameters<typeof controller.onSaveBranding>[0]) => {
    guarded.onSaveBranding(value)
    if (isStudio) window.parent.postMessage({ type: 'PACHAX_STUDIO_BRANDING', templateId: 'nightclub', branding: { companyName: value.businessName, logoUrl: value.logoDataUrl, primaryColor: value.primaryColor, accentColor: value.accentColor, surfaceColor: value.surfaceColor } }, window.location.origin)
  }
  return <NightclubExperience companyName={companyName || 'Nocturna Demo'} logoUrl={logoUrl} studioBranding={studioBranding} userName={selectedUser?.name || (selectedUserId ? 'Usuario inactivo' : 'Equipo Demo')} role={selectedUser?.role || (selectedUserId ? 'restricted' : simulatedRole)} {...guarded} demoPermissions={isStudio ? undefined : permissions} demoUserId={selectedUserId} onSelectDemoUser={isStudio ? undefined : selectUser} onSaveBranding={onSaveBranding} />
}
