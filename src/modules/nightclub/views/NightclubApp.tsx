import { LogOut } from 'lucide-react'
import type { BusinessIdentity } from '../../../core/businessIdentity'
import { getActiveTenant } from '../../../store/activeTenant'
import { NightclubExperience } from './NightclubExperience'
import { useNightclubController } from './useNightclubController'
import { useNightclubFirestoreDataset } from '../data/useNightclubFirestoreDataset'
import { createPristineNightclubDataset } from '../../../demo/datasets/nightclub/nightclubDatasets'

interface NightclubAppProps { tenantId: string; companyName: string; logoUrl?: string; uid: string; userName: string; role: string; onSignOut: () => Promise<void>; businessIdentity?: BusinessIdentity }
/** Production reader: Firestore is the source of truth; only refundRound is connected for administration. */
export function NightclubApp(props: NightclubAppProps) {
  const branchId = getActiveTenant()?.branchId || 'main'
  const canReadInventory = ['owner', 'admin', 'inventory'].includes(props.role)
  const canManageInventory = ['owner', 'admin', 'inventory'].includes(props.role)
  const canReadOperations = !['restricted', 'inventory', 'promoter'].includes(props.role)
  const canSelectCashbox = ['owner', 'admin', 'cashier'].includes(props.role)
  const canCreatePendingOrders = ['owner', 'admin', 'cashier'].includes(props.role)
  const remote = useNightclubFirestoreDataset(props.tenantId, branchId, canReadInventory, canReadOperations || canReadInventory, { operatorUid: props.uid, includeCashboxContext: canSelectCashbox })
  const controller = useNightclubController(
    createPristineNightclubDataset,
    props.uid,
    undefined,
    'production',
    0,
    props.role,
    null,
    remote.data || undefined,
    true,
    { canRefund: ['owner', 'admin'].includes(props.role), canCreatePendingOrders, canReceiveWarehouseIntake: canManageInventory, canManageTransfers: canManageInventory, canSelectCashbox, tenantId: props.tenantId, branchId },
  )
  if ((!canReadOperations && !canReadInventory) || remote.error?.kind === 'permission') return <main className="grid min-h-screen place-items-center bg-slate-950 p-5 text-slate-100"><section className="max-w-lg rounded-2xl border border-amber-300/30 bg-slate-900 p-6"><h1 className="font-black">Acceso restringido</h1><p className="mt-2 text-sm text-slate-300">No tienes permisos para consultar el inventario de esta sucursal. Si necesitas acceso, comunícate con el administrador del negocio.</p><button onClick={() => void props.onSignOut()} className="mt-5 inline-flex items-center gap-2 rounded-xl border border-slate-700 px-4 py-2"><LogOut size={15}/>Cerrar sesión</button></section></main>
  if (remote.loading) return <main className="grid min-h-screen place-items-center bg-slate-950 text-slate-100">Cargando operación Nightclub…</main>
  if (remote.error) return <main className="grid min-h-screen place-items-center bg-slate-950 p-5 text-slate-100"><section className="max-w-lg rounded-2xl border border-red-400/30 bg-slate-900 p-6"><h1 className="font-black">No se pudo conectar con la operación</h1><p className="mt-2 text-sm text-slate-300">Verifica tu conexión e inténtalo nuevamente.</p><button onClick={() => void props.onSignOut()} className="mt-5 inline-flex items-center gap-2 rounded-xl border border-slate-700 px-4 py-2"><LogOut size={15}/>Cerrar sesión</button></section></main>
  return <><div className="fixed inset-x-0 top-0 z-[200] bg-amber-300 px-4 py-2 text-center text-sm font-bold text-slate-950">Modo productivo seguro. Puedes registrar pedidos pendientes; los cobros y el consumo de inventario continúan bloqueados hasta su próxima fase.</div><div className="pt-10"><NightclubExperience companyName={props.companyName} logoUrl={props.logoUrl} userName={props.userName} role={props.role} onSignOut={props.onSignOut} readOnly capabilities={{ canRefund: ['owner', 'admin'].includes(props.role), canCreatePendingOrders, canReadInventory, canManageInventory, canManageTransfers: canManageInventory, canSelectCashbox, authorizedCashboxIds: remote.authorizedCashboxIds }} {...controller} /></div></>
}
