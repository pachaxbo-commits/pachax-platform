import { collection, doc, onSnapshot, query, where, type Firestore } from 'firebase/firestore'
import type { NightclubAccount, NightclubCashbox, NightclubDataset, NightclubInventoryBalance, NightclubInventoryItem, NightclubInventoryLot, NightclubInventoryMovement, NightclubLocation, NightclubOpenBottle, NightclubOperatorContext, NightclubPayment, NightclubRound, NightclubShift, NightclubTransfer } from '../domain/nightclubAccounts'

type FirestoreAccount = Omit<NightclubAccount, 'rounds' | 'payments' | 'payment'> & { branchId?: string }
type FirestoreRound = NightclubRound & { accountId: string; branchId?: string }
type FirestorePayment = NightclubPayment & { accountId: string; branchId?: string }

export interface NightclubFirestoreDatasetSource {
  accounts: Iterable<FirestoreAccount>
  rounds: Iterable<FirestoreRound>
  payments?: Iterable<FirestorePayment>
  locations?: Iterable<NightclubLocation>
  cashboxes?: Iterable<NightclubCashbox>
  inventory?: Iterable<NightclubInventoryItem>
  inventoryBalances?: Iterable<NightclubInventoryBalance>
  inventoryLots?: Iterable<NightclubInventoryLot>
  inventoryMovements?: Iterable<NightclubInventoryMovement>
  openBottles?: Iterable<NightclubOpenBottle>
  transfers?: Iterable<NightclubTransfer>
  operatorContexts?: Iterable<NightclubOperatorContext>
  cashboxShifts?: Iterable<NightclubShift>
}

export interface NightclubFirestoreDatasetOptions {
  includeInventory?: boolean
  operatorUid?: string
  includeCashboxContext?: boolean
}

/** Maps production documents to the shared experience without demo accounts or rounds. */
export function toNightclubFirestoreDataset(source: NightclubFirestoreDatasetSource): NightclubDataset {
  const base: NightclubDataset = {
    zones: [], tables: [], products: [], accounts: [], shift: null,
    customers: [], reservations: [], inventory: [], inventoryMovements: [],
    cashMovements: [], audit: [], staff: [],
    branding: { businessName: 'Operacion Nightclub', subtitle: '', primaryColor: '#0d1720', accentColor: '#d8a84e', surfaceColor: '#0d1720' },
  }
  const roundsByAccount = new Map<string, NightclubRound[]>()
  const paymentsByAccount = new Map<string, NightclubPayment[]>()
  for (const round of source.rounds) {
    const accountRounds = roundsByAccount.get(round.accountId) || []
    accountRounds.push(round)
    roundsByAccount.set(round.accountId, accountRounds)
  }
  for (const payment of source.payments || []) {
    const accountPayments = paymentsByAccount.get(payment.accountId) || []
    accountPayments.push(payment)
    paymentsByAccount.set(payment.accountId, accountPayments)
  }
  const operatorContexts = source.operatorContexts ? [...source.operatorContexts] : []
  const cashboxShifts = source.cashboxShifts ? [...source.cashboxShifts] : []
  return {
    ...base,
    locations: source.locations ? [...source.locations] : [],
    cashboxes: source.cashboxes ? [...source.cashboxes] : [],
    inventory: source.inventory ? [...source.inventory] : [],
    inventoryBalances: source.inventoryBalances ? [...source.inventoryBalances] : [],
    inventoryLots: source.inventoryLots ? [...source.inventoryLots] : [],
    inventoryMovements: source.inventoryMovements ? [...source.inventoryMovements] : [],
    openBottles: source.openBottles ? [...source.openBottles] : [],
    transfers: source.transfers ? [...source.transfers] : [],
    operatorContexts,
    cashboxShifts,
    shift: cashboxShifts.find(shift => shift.id === operatorContexts[0]?.activeShiftId) || null,
    accounts: [...source.accounts].map(account => ({
      ...account,
      rounds: roundsByAccount.get(account.id) || [],
      payments: paymentsByAccount.get(account.id) || [],
    })),
  }
}

export interface NightclubFirestoreDatasetSubscription { unsubscribe: () => void }

type CollectionMaps = {
  accounts: Map<string, FirestoreAccount>
  rounds: Map<string, FirestoreRound>
  payments: Map<string, FirestorePayment>
  locations: Map<string, NightclubLocation>
  cashboxes: Map<string, NightclubCashbox>
  inventory: Map<string, NightclubInventoryItem>
  inventoryBalances: Map<string, NightclubInventoryBalance>
  inventoryLots: Map<string, NightclubInventoryLot>
  inventoryMovements: Map<string, NightclubInventoryMovement>
  openBottles: Map<string, NightclubOpenBottle>
  transfers: Map<string, NightclubTransfer>
  operatorContexts: Map<string, NightclubOperatorContext>
  cashboxShifts: Map<string, NightclubShift>
}

function replaceSnapshot<T>(target: Map<string, T>, docs: Iterable<{ id: string; data: () => unknown }>) {
  target.clear()
  for (const item of docs) target.set(item.id, { ...(item.data() as T), id: item.id })
}

/** Subscribes only to one tenant branch and publishes the transformed dataset. */
export function subscribeToNightclubFirestoreDataset(
  db: Firestore,
  tenantId: string,
  branchId: string,
  onData: (dataset: NightclubDataset) => void,
  onError: (error: Error) => void,
  options: NightclubFirestoreDatasetOptions = {},
): NightclubFirestoreDatasetSubscription {
  const data: CollectionMaps = {
    accounts: new Map(), rounds: new Map(), payments: new Map(), locations: new Map(), cashboxes: new Map(), inventory: new Map(), inventoryBalances: new Map(), inventoryLots: new Map(), inventoryMovements: new Map(), openBottles: new Map(), transfers: new Map(), operatorContexts: new Map(), cashboxShifts: new Map(),
  }
  const publish = () => onData(toNightclubFirestoreDataset({
    accounts: data.accounts.values(), rounds: data.rounds.values(), payments: data.payments.values(), locations: data.locations.values(), cashboxes: data.cashboxes.values(), inventory: data.inventory.values(), inventoryBalances: data.inventoryBalances.values(), inventoryLots: data.inventoryLots.values(), inventoryMovements: data.inventoryMovements.values(), openBottles: data.openBottles.values(), transfers: data.transfers.values(), operatorContexts: data.operatorContexts.values(), cashboxShifts: data.cashboxShifts.values(),
  }))
  const subscribe = <T>(name: keyof CollectionMaps, path: string) => onSnapshot(
    query(collection(db, 'tenants', tenantId, path), where('branchId', '==', branchId)),
    snapshot => { replaceSnapshot(data[name] as Map<string, T>, snapshot.docs); publish() },
    onError,
  )
  const stops = [subscribe<FirestoreAccount>('accounts', 'nightclubAccounts'), subscribe<FirestoreRound>('rounds', 'nightclubRounds'), subscribe<FirestorePayment>('payments', 'nightclubPayments')]
  if (options.includeInventory) stops.push(
    subscribe<NightclubLocation>('locations', 'nightclubLocations'), subscribe<NightclubCashbox>('cashboxes', 'nightclubCashboxes'), subscribe<NightclubInventoryItem>('inventory', 'nightclubInventory'), subscribe<NightclubInventoryBalance>('inventoryBalances', 'nightclubInventoryBalances'), subscribe<NightclubInventoryLot>('inventoryLots', 'nightclubInventoryLots'), subscribe<NightclubInventoryMovement>('inventoryMovements', 'nightclubInventoryMovements'), subscribe<NightclubOpenBottle>('openBottles', 'nightclubOpenBottles'), subscribe<NightclubTransfer>('transfers', 'nightclubTransfers'),
  )
  if (options.operatorUid) stops.push(onSnapshot(
    doc(db, 'tenants', tenantId, 'nightclubOperatorContexts', options.operatorUid),
    snapshot => {
      data.operatorContexts.clear()
      const context = snapshot.data() as NightclubOperatorContext | undefined
      if (snapshot.exists() && context?.branchId === branchId) data.operatorContexts.set(snapshot.id, { ...context, id: snapshot.id })
      publish()
    },
    onError,
  ))
  if (options.includeCashboxContext && !options.includeInventory) stops.push(subscribe<NightclubCashbox>('cashboxes', 'nightclubCashboxes'))
  if (options.includeCashboxContext) stops.push(subscribe<NightclubShift>('cashboxShifts', 'nightclubShifts'))
  return { unsubscribe: () => stops.forEach(stop => stop()) }
}
