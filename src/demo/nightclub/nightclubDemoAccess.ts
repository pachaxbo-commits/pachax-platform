import type { NightclubDataset, NightclubModuleId, NightclubStaff } from '../../modules/nightclub/domain/nightclubAccounts'
import { nightclubUserPermissions } from '../../modules/nightclub/domain/nightclubUsers.ts'

type Action = 'create' | 'edit' | 'delete'
type Grant = { section: NightclubModuleId; action: Action; special?: string; collection?: keyof NightclubDataset }
const grants: Record<string, Grant> = {
  onSaveZone: { section: 'floor', action: 'create', collection: 'zones' }, onSaveTable: { section: 'floor', action: 'create', collection: 'tables' },
  onDeleteZone: { section: 'floor', action: 'delete' }, onDeleteTable: { section: 'floor', action: 'delete' },
  onSaveReservation: { section: 'floor', action: 'create', collection: 'reservations' }, onCancelReservation: { section: 'floor', action: 'delete' }, onArriveReservation: { section: 'floor', action: 'edit' },
  onSaveBranding: { section: 'settings', action: 'edit' }, onOpenAccount: { section: 'accounts', action: 'create' },
  onSettleRound: { section: 'pos', action: 'create', special: 'cash.create' }, onSendRound: { section: 'pos', action: 'create' },
  onRequestBill: { section: 'accounts', action: 'edit' }, onReopenBill: { section: 'accounts', action: 'edit' },
  onRecordPayment: { section: 'cash', action: 'create' }, onAdvanceRound: { section: 'bar', action: 'edit' },
  onDeliverRound: { section: 'accounts', action: 'edit' }, onFinishAccount: { section: 'accounts', action: 'edit' },
  onRefundRound: { section: 'accounts', action: 'delete', special: 'special.approveOperations' },
  onExchangePaidProduct: { section: 'accounts', action: 'edit', special: 'special.approveOperations' },
  onCancelRound: { section: 'pos', action: 'delete' }, onStartShift: { section: 'cash', action: 'create' },
  onCloseShift: { section: 'cash', action: 'edit', special: 'special.closeCash' }, onCashMovement: { section: 'cash', action: 'create' },
  onAdjustInventory: { section: 'inventory', action: 'edit' }, onOpenBottle: { section: 'inventory', action: 'edit' },
  onOpenBottleExit: { section: 'inventory', action: 'edit' }, onSaveBottleInventory: { section: 'inventory', action: 'create', collection: 'inventory' },
  onSaveSimpleInventoryProduct: { section: 'inventory', action: 'create', collection: 'inventory' }, onSaveInventory: { section: 'inventory', action: 'create', collection: 'inventory' },
  onSaveProduct: { section: 'products', action: 'create', collection: 'products' },
  onSavePromoterEvent: { section: 'promoters', action: 'create', collection: 'promoterEvents' },
  onSavePromoter: { section: 'promoters', action: 'create', collection: 'promoters' }, onDeletePromoter: { section: 'promoters', action: 'delete' },
  onSavePromoterSale: { section: 'promoters', action: 'create', collection: 'promoterTicketSales' },
  onSavePromoterLoungeSale: { section: 'promoters', action: 'create', collection: 'promoterLoungeSales' },
  onMarkPromoterLoungePaid: { section: 'promoters', action: 'edit' }, onSavePromoterConsumption: { section: 'promoters', action: 'create', collection: 'promoterConsumptions' },
  onSaveCustomer: { section: 'customers', action: 'create', collection: 'customers' },
  onSetCustomerStatus: { section: 'customers', action: 'edit' }, onSaveCustomerIncident: { section: 'customers', action: 'create', collection: 'customerIncidents' },
  onDeleteCustomerIncident: { section: 'customers', action: 'delete' }, onAssignCustomer: { section: 'accounts', action: 'edit' },
  onSaveStaff: { section: 'users', action: 'create', special: 'special.manageUsers', collection: 'staff' },
  onDeleteStaff: { section: 'users', action: 'delete', special: 'special.manageUsers' },
  onSaveUserRolePreset: { section: 'users', action: 'edit', special: 'special.manageUsers' },
  onSaveCustomRole: { section: 'users', action: 'create', special: 'special.manageUsers', collection: 'customRoles' },
  onDeleteCustomRole: { section: 'users', action: 'delete', special: 'special.manageUsers' },
  onPayCommissions: { section: 'users', action: 'edit', special: 'special.approveOperations' },
  onSaveMember: { section: 'members', action: 'create', collection: 'members' },
  onRegisterCourtesy: { section: 'members', action: 'create' }, onCancelCourtesy: { section: 'members', action: 'delete' },
}
export function demoPermissionSet(data: NightclubDataset, user: NightclubStaff | null, selectedId: string): ReadonlySet<string> | null {
  if (!selectedId) return null
  if (!user?.active) return new Set()
  return new Set(nightclubUserPermissions(data, user))
}
export function demoCan(permissions: ReadonlySet<string> | null, section: NightclubModuleId, action: 'view' | Action = 'view') {
  return permissions === null || permissions.has(section + '.' + action)
}
export function guardNightclubDemoController<T extends { data: NightclubDataset }>(controller: T, permissions: ReadonlySet<string> | null, user: NightclubStaff | null): T {
  if (permissions === null) return controller
  return new Proxy(controller, { get(target, key, receiver) {
    const value = Reflect.get(target, key, receiver)
    if (typeof key !== 'string' || !key.startsWith('on') || typeof value !== 'function') return value
    return (...args: unknown[]) => {
      const grant = grants[key]
      if (!grant) throw new Error('Acción no autorizada en la simulación.')
      const first = args[0] as { id?: string } | undefined
      const collection = grant.collection && controller.data[grant.collection]
      const requested = first?.id && Array.isArray(collection) && (collection as unknown[]).some(item => typeof item === 'object' && item !== null && 'id' in item && item.id === first.id) ? 'edit' : grant.action
      if (!demoCan(permissions, grant.section, requested) || (grant.special && !permissions.has(grant.special))) throw new Error('El usuario simulado no tiene permiso para esta acción.')
      if (user && ['waiter', 'service'].includes(user.role) && typeof args[0] === 'string' && ['onSendRound', 'onRequestBill', 'onDeliverRound', 'onFinishAccount', 'onAssignCustomer'].includes(key)) {
        const account = controller.data.accounts.find(item => item.id === args[0])
        if (account && account.openedBy !== user.name && account.waiterName !== user.name && account.rounds.some(round => round.serviceStaffId && round.serviceStaffId !== user.id) && !account.rounds.some(round => round.serviceStaffId === user.id)) throw new Error('Este pedido pertenece a otro responsable.')
      }
      if (user && ['waiter', 'service'].includes(user.role) && key === 'onOpenAccount') {
        const tableId = typeof args[0] === 'string' ? args[0] : args[0] && typeof args[0] === 'object' && 'tableId' in args[0] ? String(args[0].tableId) : ''
        const table = controller.data.tables.find(item => item.id === tableId)
        const account = controller.data.accounts.find(item => item.id === table?.activeAccountId)
        if (account && account.openedBy !== user.name && account.waiterName !== user.name && account.rounds.some(round => round.serviceStaffId && round.serviceStaffId !== user.id) && !account.rounds.some(round => round.serviceStaffId === user.id)) throw new Error('Esta mesa está a cargo de otro responsable.')
      }
      if (user && ['waiter', 'service'].includes(user.role) && key === 'onSendRound') args[4] = user.id
      if (key === 'onPayCommissions' && user?.role !== 'admin') throw new Error('Solo Administración puede pagar comisiones.')
      if (user?.role === 'waiter' && key === 'onSettleRound') args[4] = user.id
      if (user?.role === 'service' && key === 'onSettleRound') args[4] = undefined
      return Reflect.apply(value, target, args)
    }
  } })
}
