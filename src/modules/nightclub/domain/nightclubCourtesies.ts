import { nightclubProductAvailability } from './nightclubAccounts.ts'
import type { NightclubCourtesy, NightclubCourtesyDraft, NightclubDataset, NightclubMember } from './nightclubAccounts.ts'

const DAY = 86_400_000
const round = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100

export function courtesyPeriod(member: NightclubMember, at: string) {
  const anchor = Date.parse(member.policy.anchorAt)
  const time = Date.parse(at)
  const { repeatDays, windowDays } = member.policy
  if (!Number.isFinite(anchor) || !Number.isFinite(time) || !Number.isInteger(repeatDays) || !Number.isInteger(windowDays) || repeatDays < 1 || windowDays < 1 || windowDays > repeatDays) throw new Error('Configura un período válido para el socio.')
  const cycle = Math.floor((time - anchor) / (repeatDays * DAY))
  const start = anchor + cycle * repeatDays * DAY
  const end = start + windowDays * DAY
  return { start: new Date(start).toISOString(), end: new Date(end).toISOString(), active: cycle >= 0 && time >= start && time < end }
}

export function courtesyBalance(dataset: NightclubDataset, member: NightclubMember, at = new Date().toISOString()) {
  const period = courtesyPeriod(member, at)
  const used = (dataset.courtesies || []).filter(item => item.memberId === member.id && item.status === 'active' && item.periodStart === period.start).reduce((sum, item) => sum + item.quantity, 0)
  return { ...period, quota: member.quota, used, available: Math.max(0, member.quota - used) }
}

export function saveNightclubMember(dataset: NightclubDataset, member: NightclubMember, actor: string, at = new Date().toISOString()): NightclubDataset {
  if (!member.name.trim() || !Number.isInteger(member.quota) || member.quota < 0 || member.quota > 100_000) throw new Error('Nombre y cupo válidos son obligatorios.')
  courtesyPeriod(member, at)
  const next = structuredClone(dataset)
  const index = (next.members || []).findIndex(item => item.id === member.id)
  const previous = index >= 0 ? next.members?.[index] : undefined
  if (previous && (next.courtesies || []).some(item => item.memberId === member.id) && JSON.stringify(previous.policy) !== JSON.stringify(member.policy)) throw new Error('La política de un socio con historial no puede cambiarse sin una transición de período auditada.')
  const used = courtesyBalance(next, member, at).used
  if (member.quota < used) throw new Error(`El cupo no puede ser menor a ${used} cortesías ya utilizadas.`)
  next.members ||= []
  next.courtesies ||= []
  if (index < 0) next.members.push(structuredClone(member))
  else next.members[index] = structuredClone(member)
  next.audit = [...(next.audit || []), { id: crypto.randomUUID(), type: index < 0 ? 'member_created' : 'member_updated', at, actor, details: { memberId: member.id, quota: member.quota } }]
  return next
}

export function registerNightclubCourtesy(dataset: NightclubDataset, draft: NightclubCourtesyDraft, actor: string, at = new Date().toISOString()): NightclubDataset {
  if (!Number.isInteger(draft.quantity) || draft.quantity <= 0) throw new Error('La cantidad debe ser un entero positivo.')
  const next = structuredClone(dataset)
  const member = (next.members || []).find(item => item.id === draft.memberId)
  if (!member || !member.active) throw new Error('El socio no existe o está inactivo.')
  const balance = courtesyBalance(next, member, at)
  if (!balance.active) throw new Error('El período de cortesías del socio no está activo.')
  if (draft.quantity > balance.available) throw new Error(`Cupo insuficiente. ${member.name} tiene ${balance.available} botella(s) disponible(s).`)
  const product = next.products.find(item => item.id === draft.productId && item.active !== false)
  if (!product || product.category !== 'Botellas' || !product.recipe?.length) throw new Error('Selecciona una botella activa con receta de inventario.')
  const account = draft.accountId ? next.accounts.find(item => item.id === draft.accountId && item.status === 'open') : undefined
  if (draft.accountId && !account) throw new Error('La cuenta de la mesa no acepta cortesías.')
  if (next.shift?.status !== 'open') throw new Error('Abre un turno antes de registrar cortesías.')
  const requirements = new Map<string, number>()
  for (const line of product.recipe) {
    if (!Number.isFinite(line.quantity) || line.quantity <= 0) throw new Error('La receta de la botella es inválida.')
    requirements.set(line.inventoryId, (requirements.get(line.inventoryId) || 0) + line.quantity * draft.quantity)
  }
  let cost = 0
  let hasCost = true
  for (const [inventoryId, quantity] of requirements) {
    const stock = next.inventory.find(item => item.id === inventoryId)
    if (!stock || stock.current < quantity) throw new Error(`Stock insuficiente para ${stock?.name || inventoryId}.`)
    if (stock.unitCost === undefined) hasCost = false
    else cost += quantity * stock.unitCost
  }
  const courtesyId = crypto.randomUUID()
  const roundId = account ? crypto.randomUUID() : undefined
  for (const [inventoryId, quantity] of requirements) {
    const stock = next.inventory.find(item => item.id === inventoryId)!
    const previous = stock.current
    stock.current = round(previous - quantity)
    next.inventoryMovements = [...(next.inventoryMovements || []), { id: crypto.randomUUID(), operationId: `courtesy:${courtesyId}:${inventoryId}`, inventoryId, quantity: -quantity, previous, current: stock.current, type: 'member_courtesy', at, actor, accountId: account?.id, roundId, courtesyId, memberId: member.id }]
  }
  if (account && roundId) account.rounds.push({ id: roundId, sequence: account.rounds.length + 1, createdAt: at, sentAt: at, status: product.preparationArea === 'Barra' ? 'pending' : 'ready', readyAt: product.preparationArea === 'Directo' ? at : undefined, authorization: 'courtesy', courtesyId, sentBy: actor, items: [{ id: crypto.randomUUID(), productId: product.id, name: product.name, category: product.category, quantity: draft.quantity, unitPrice: 0, lineTotal: 0, commercialValue: round(product.price * draft.quantity), kind: 'courtesy', preparationArea: product.preparationArea, courtesyId, memberName: member.name }] })
  const courtesy: NightclubCourtesy = { id: courtesyId, memberId: member.id, productId: product.id, productName: product.name, quantity: draft.quantity, beneficiary: draft.beneficiary?.trim() || undefined, note: draft.note?.trim() || undefined, accountId: account?.id, tableId: account?.tableId, roundId, actor, at, periodStart: balance.start, periodEnd: balance.end, status: 'active', cost: hasCost ? round(cost) : undefined }
  next.courtesies = [...(next.courtesies || []), courtesy]
  for (const item of next.products) item.stockUnits = nightclubProductAvailability(item, next.inventory)
  next.audit = [...(next.audit || []), { id: crypto.randomUUID(), type: 'member_courtesy_registered', at, actor, accountId: account?.id, details: { courtesyId, memberId: member.id, productId: product.id, quantity: draft.quantity } }]
  return next
}

export function cancelNightclubCourtesy(dataset: NightclubDataset, courtesyId: string, actor: string, at = new Date().toISOString()): NightclubDataset {
  const next = structuredClone(dataset)
  const courtesy = (next.courtesies || []).find(item => item.id === courtesyId)
  if (!courtesy || courtesy.status !== 'active') throw new Error('La cortesía ya fue anulada o no existe.')
  const account = courtesy.accountId ? next.accounts.find(item => item.id === courtesy.accountId) : undefined
  if (account?.status === 'closed' || account?.rounds.find(item => item.id === courtesy.roundId)?.status === 'delivered') throw new Error('Una cortesía ya entregada o de una mesa cerrada requiere revisión física antes de anularse.')
  const movements = (next.inventoryMovements || []).filter(item => item.courtesyId === courtesyId && item.type === 'member_courtesy')
  if (!movements.length) throw new Error('Falta el movimiento original de inventario; requiere revisión manual.')
  for (const original of movements) {
    const stock = next.inventory.find(item => item.id === original.inventoryId)
    if (!stock) throw new Error('Falta un insumo original; requiere revisión manual.')
    const previous = stock.current
    stock.current = round(previous - original.quantity)
    next.inventoryMovements = [...(next.inventoryMovements || []), { id: crypto.randomUUID(), operationId: `courtesy-reversal:${courtesyId}:${stock.id}`, inventoryId: stock.id, quantity: -original.quantity, previous, current: stock.current, type: 'courtesy_reversal', at, actor, accountId: courtesy.accountId, roundId: courtesy.roundId, courtesyId, memberId: courtesy.memberId }]
  }
  courtesy.status = 'cancelled'; courtesy.cancelledAt = at; courtesy.cancelledBy = actor
  if (account) {
    const batch = account.rounds.find(item => item.id === courtesy.roundId)
    if (batch) { batch.status = 'cancelled'; batch.cancelledAt = at; batch.cancelledBy = actor; batch.cancellationReason = 'Cortesía anulada' }
  }
  for (const item of next.products) item.stockUnits = nightclubProductAvailability(item, next.inventory)
  next.audit = [...(next.audit || []), { id: crypto.randomUUID(), type: 'member_courtesy_cancelled', at, actor, accountId: courtesy.accountId, details: { courtesyId, memberId: courtesy.memberId } }]
  return next
}
