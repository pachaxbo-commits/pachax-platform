import type { NightclubCustomerIncident, NightclubCustomerStatus, NightclubDataset } from './nightclubAccounts'
import { normalizeNightclubBirthday } from './nightclubCustomers.ts'

const requireAdmin = (role: string) => { if (role !== 'admin' && role !== 'owner') throw new Error('Solo Administración puede gestionar convivencia e incidentes.') }

export function setNightclubCustomerStatus(dataset: NightclubDataset, customerId: string, status: NightclubCustomerStatus, actor: string, role: string): NightclubDataset {
  requireAdmin(role)
  if (!['green', 'yellow', 'red'].includes(status)) throw new Error('Estado inválido.')
  const next = structuredClone(dataset)
  const customer = next.customers.find(item => item.id === customerId)
  if (!customer) throw new Error('Cliente no encontrado.')
  customer.convivenciaStatus = status
  next.audit = [...(next.audit || []), { id: crypto.randomUUID(), type: 'customer_status_changed', actor, at: new Date().toISOString(), details: { customerId, status } }]
  return next
}

export function listNightclubCustomerIncidents(dataset: NightclubDataset, customerId: string, role: string): NightclubCustomerIncident[] {
  requireAdmin(role)
  return (dataset.customerIncidents || []).filter(item => item.customerId === customerId).sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt))
}

export interface NightclubIncidentIdentity { uid: string; displayName: string }
export type NightclubIncidentDraft = Pick<NightclubCustomerIncident, 'id' | 'customerId' | 'date' | 'severity' | 'description'>
export function saveNightclubCustomerIncident(dataset: NightclubDataset, input: NightclubIncidentDraft, identity: NightclubIncidentIdentity | null, role: string, at = new Date().toISOString()): NightclubDataset {
  requireAdmin(role)
  if (!dataset.customers.some(item => item.id === input.customerId)) throw new Error('Cliente no encontrado.')
  try { normalizeNightclubBirthday(input.date) } catch { throw new Error('Fecha de incidente inválida.') }
  if (!['low', 'medium', 'high'].includes(input.severity)) throw new Error('Gravedad inválida.')
  const description = input.description.trim()
  if (!description) throw new Error('La descripción es obligatoria.')
  if (identity && (!identity.uid.trim() || !identity.displayName.trim())) throw new Error('La identidad del responsable es inválida.')
  const actor = identity?.uid || 'demo'
  const next = structuredClone(dataset)
  next.customerIncidents ||= []
  const index = next.customerIncidents.findIndex(item => item.id === input.id)
  const previous = index >= 0 ? next.customerIncidents[index] : undefined
  if (previous && previous.customerId !== input.customerId) throw new Error('El incidente pertenece a otro cliente.')
  const incident: NightclubCustomerIncident = { id: input.id, customerId: input.customerId, date: input.date, severity: input.severity, description, responsible: identity?.uid, responsibleName: identity?.displayName || 'Usuario demo', createdBy: previous?.createdBy || actor, createdAt: previous?.createdAt || at, ...(previous ? { updatedBy: actor, updatedAt: at } : {}) }
  if (index >= 0) next.customerIncidents[index] = incident
  else next.customerIncidents.push(incident)
  next.audit = [...(next.audit || []), { id: crypto.randomUUID(), type: previous ? 'customer_incident_updated' : 'customer_incident_created', actor, at, details: { customerId: input.customerId, incidentId: input.id } }]
  return next
}

export function deleteNightclubCustomerIncident(dataset: NightclubDataset, customerId: string, incidentId: string, actor: string, role: string): NightclubDataset {
  requireAdmin(role)
  if (!(dataset.customerIncidents || []).some(item => item.id === incidentId && item.customerId === customerId)) throw new Error('Incidente no encontrado.')
  const next = structuredClone(dataset)
  next.customerIncidents = (next.customerIncidents || []).filter(item => item.id !== incidentId)
  next.audit = [...(next.audit || []), { id: crypto.randomUUID(), type: 'customer_incident_deleted', actor, at: new Date().toISOString(), details: { customerId, incidentId } }]
  return next
}