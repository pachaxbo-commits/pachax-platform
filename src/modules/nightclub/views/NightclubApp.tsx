import { useState } from 'react'
import { createNightclubDataset } from '../../../demo/datasets/nightclub/nightclubDatasets'
import { addNightclubRound, closeNightclubAccount, openNightclubAccount, openNightclubShift, requestNightclubBill, type NightclubRoundDraft } from '../domain/nightclubAccounts'
import { NightclubExperience } from './NightclubExperience'

export function NightclubApp({ companyName, logoUrl, userName, role, onSignOut }: { tenantId: string; companyName: string; logoUrl?: string; uid: string; userName: string; role: string; onSignOut: () => Promise<void> }) {
  const [data, setData] = useState(() => createNightclubDataset('full'))
  return <NightclubExperience companyName={companyName} logoUrl={logoUrl} userName={userName} role={role} data={data} onOpenAccount={tableId => setData(current => openNightclubAccount(current, tableId, userName))} onAddRound={(accountId: string, items: NightclubRoundDraft[]) => setData(current => addNightclubRound(current, accountId, items))} onRequestBill={accountId => setData(current => requestNightclubBill(current, accountId))} onCloseAccount={accountId => setData(current => closeNightclubAccount(current, accountId))} onStartShift={openingFloat => setData(current => openNightclubShift(current, userName, openingFloat))} onSignOut={onSignOut} />
}
