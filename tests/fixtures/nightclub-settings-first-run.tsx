import React, { useState } from 'react'
import { createRoot } from 'react-dom/client'
import type { NightclubDataset, NightclubLocation, NightclubCashbox } from '../../src/modules/nightclub/domain/nightclubAccounts'
import { createEmptyNightclubDataset } from '../../src/modules/nightclub/domain/nightclubDatasets'
import { NightclubSettings } from '../../src/modules/nightclub/views/NightclubSettings'

declare global { interface Window { __nightclubCalls: Array<{ type: string; name?: string; operationId: string }> } }
window.__nightclubCalls = []

export function TestApp() {
  const [data, setData] = useState<NightclubDataset>(createEmptyNightclubDataset())
  const initialize = async (operationId: string) => {
    window.__nightclubCalls.push({ type: 'initialize', operationId })
    const locations: NightclubLocation[] = [
      { id: 'warehouse-general', tenantId: 'qa', branchId: 'main', type: 'warehouse', name: 'Almacén general', active: true },
      { id: 'cashbox-1', tenantId: 'qa', branchId: 'main', type: 'cashbox', name: 'Caja principal', linkedCashboxId: 'cashbox-1', active: true },
    ]
    const cashboxes: NightclubCashbox[] = [{ id: 'cashbox-1', tenantId: 'qa', branchId: 'main', locationId: 'cashbox-1', name: 'Caja principal', active: true }]
    setData(previous => ({ ...previous, locations, cashboxes }))
    return { status: 'initialized' }
  }
  const createCashbox = async (name: string, operationId: string) => {
    window.__nightclubCalls.push({ type: 'create', name, operationId })
    setData(previous => ({
      ...previous,
      cashboxes: [...(previous.cashboxes || []), { id: 'cashbox-2', tenantId: 'qa', branchId: 'main', locationId: 'cashbox-2', name, active: true }],
      locations: [...(previous.locations || []), { id: 'cashbox-2', tenantId: 'qa', branchId: 'main', type: 'cashbox', name, linkedCashboxId: 'cashbox-2', active: true }],
    }))
    return { cashboxId: 'cashbox-2', locationId: 'cashbox-2' }
  }
  return <NightclubSettings
    data={data} fallbackName="QA Nightclub" mode="tenant" tenantId="qa" branchId="main"
    canManageSettings onInitializeNightclubInfrastructure={initialize} onCreateNightclubCashbox={createCashbox}
    onSaveBranding={async () => true} onSaveZone={async () => true} onSaveTable={async () => true}
    onDeleteZone={async () => true} onDeleteTable={async () => true}
  />
}

createRoot(document.getElementById('root')!).render(<TestApp />)
