import React, { useState } from 'react'
import { createRoot } from 'react-dom/client'
import type { NightclubCashbox, NightclubDataset } from '../../src/modules/nightclub/domain/nightclubAccounts'
import { createEmptyNightclubDataset } from '../../src/modules/nightclub/domain/nightclubDatasets'
import { NightclubCash } from '../../src/modules/nightclub/views/NightclubCash'

export function TestApp() {
  const [data, setData] = useState<NightclubDataset>(createEmptyNightclubDataset())
  const [required, setRequired] = useState(true)
  const [activeCashboxId, setActiveCashboxId] = useState<string | undefined>()
  const installCashbox = () => {
    const cashbox: NightclubCashbox = { id: 'cashbox-1', tenantId: 'qa', branchId: 'main', locationId: 'cashbox-1', name: 'Caja principal', active: true }
    setData(previous => ({ ...previous, cashboxes: [cashbox] }))
  }
  return <>
    <div className="flex gap-2 p-2">
      <button id="configure" onClick={installCashbox}>Configurar</button>
      <button id="confirm" onClick={() => setActiveCashboxId('cashbox-1')}>Confirmar caja</button>
      <button id="empty" onClick={() => { setData(previous => ({ ...previous, cashboxes: [] })); setActiveCashboxId(undefined) }}>Vaciar cajas</button>
      <button id="legacy" onClick={() => { setRequired(false); setData(createEmptyNightclubDataset()); setActiveCashboxId(undefined) }}>Tenant legacy</button>
    </div>
    <NightclubCash
      data={data} requireCashboxConfiguration={required} activeCashboxId={activeCashboxId}
      onStartShift={() => undefined} onCloseShift={() => undefined} onCashMovement={() => true}
      onRecordPayment={() => true} onSelectCashbox={id => setActiveCashboxId(id)}
      onStartCashboxShift={() => undefined} onCloseCashboxShift={() => undefined}
    />
  </>
}

createRoot(document.getElementById('root')!).render(<TestApp />)
