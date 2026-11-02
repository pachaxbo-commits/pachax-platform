import type { NightclubCashMovement } from './nightclubAccounts'

/** Converts persisted movement variants to the UI contract without changing stored history. */
export function normalizeNightclubCashMovement(id: string, shiftId: string, data: Record<string, unknown>): NightclubCashMovement {
  const storedType = String(data.type || '')
  const storedAmount = Number(data.amount || 0)
  const type: NightclubCashMovement['type'] = ['sale', 'income', 'expense', 'refund'].includes(storedType) ? storedType as NightclubCashMovement['type'] : 'correction'
  return {
    id,
    shiftId,
    type,
    method: (['cash', 'qr', 'card'].includes(String(data.method)) ? data.method : 'cash') as NightclubCashMovement['method'],
    amount: Number.isFinite(storedAmount) ? storedAmount : 0,
    description: typeof data.description === 'string' ? data.description : `Movimiento ${id}`,
    at: typeof data.createdAt === 'string' ? data.createdAt : new Date().toISOString(),
    actor: typeof data.actorUid === 'string' ? data.actorUid : 'Caja',
    ...(typeof data.category === 'string' ? { category: data.category as NightclubCashMovement['category'] } : {}),
    ...(typeof data.commissionPaymentId === 'string' ? { commissionPaymentId: data.commissionPaymentId } : {}),
    ...(typeof data.notes === 'string' ? { notes: data.notes } : {}),
    ...(typeof data.cashboxId === 'string' ? { cashboxId: data.cashboxId } : {}),
    ...(typeof data.locationId === 'string' ? { locationId: data.locationId } : {}),
  }
}

/** Sign used only for presentation; persisted amount and reconciliation are unchanged. */
export function signedNightclubCashMovementAmount(movement: Pick<NightclubCashMovement, 'type' | 'amount'>) {
  if (movement.type === 'sale' || movement.type === 'income') return Math.abs(movement.amount)
  if (movement.type === 'expense' || movement.type === 'refund') return -Math.abs(movement.amount)
  return movement.amount
}
