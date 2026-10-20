/**
 * Resolución de la caja de trabajo visible en Caja.
 *
 * La única fuente de verdad es el contexto de operador confirmado por el
 * servidor (`nightclubOperatorContexts/{uid}.cashboxId`). Nunca se infiere una
 * caja por defecto (por ejemplo, la primera de la lista): si el servidor aún no
 * confirmó una caja válida, no hay caja seleccionada.
 */
export function resolveSelectedCashboxId(
  cashboxes: ReadonlyArray<{ id: string }> | undefined,
  activeCashboxId: string | null | undefined,
): string {
  if (!activeCashboxId) return ''
  return cashboxes?.some(cashbox => cashbox.id === activeCashboxId) ? activeCashboxId : ''
}

/**
 * Indica si la vista de Caja debe bloquear la operación financiera hasta que el
 * operador seleccione (y el servidor confirme) una caja de trabajo.
 * Tenants legacy sin cajas configuradas nunca quedan bloqueados.
 */
export function requiresCashboxSelection(
  cashboxes: ReadonlyArray<{ id: string }> | undefined,
  activeCashboxId: string | null | undefined,
): boolean {
  return Boolean(cashboxes && cashboxes.length > 0) && !resolveSelectedCashboxId(cashboxes, activeCashboxId)
}
