import { useEffect, useState } from 'react'
import type { DemoDatasetMode } from '../datasets/types'
import { createNightclubDataset } from '../datasets/nightclub/nightclubDatasets'
import { addNightclubRound, closeNightclubAccount, openNightclubAccount, openNightclubShift, requestNightclubBill, type NightclubDataset, type NightclubRoundDraft } from '../../modules/nightclub/domain/nightclubAccounts'
import { NightclubExperience } from '../../modules/nightclub/views/NightclubExperience'

export function NightclubDemo({ datasetMode = 'full', resetKey = 0, simulatedRole = 'admin', logoUrl, companyName }: { datasetMode?: DemoDatasetMode; resetKey?: number; simulatedRole?: string; logoUrl?: string; companyName?: string }) {
  const [data, setData] = useState<NightclubDataset>(() => createNightclubDataset(datasetMode))
  useEffect(() => setData(createNightclubDataset(datasetMode)), [datasetMode, resetKey])
  return <NightclubExperience companyName={companyName || 'Nocturna Demo'} logoUrl={logoUrl} userName="Equipo Demo" role={simulatedRole} data={data} onOpenAccount={tableId => setData(current => openNightclubAccount(current, tableId, 'Equipo Demo'))} onAddRound={(accountId: string, items: NightclubRoundDraft[]) => setData(current => addNightclubRound(current, accountId, items))} onRequestBill={accountId => setData(current => requestNightclubBill(current, accountId))} onCloseAccount={accountId => setData(current => closeNightclubAccount(current, accountId))} onStartShift={openingFloat => setData(current => openNightclubShift(current, 'Equipo Demo', openingFloat))} />
}
