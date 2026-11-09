import { getWhatsAppUrl } from '../config/publicContact.ts'

export type TemplateSecondaryAction =
  | { kind: 'quote'; label: 'Cotizar a medida' }
  | { kind: 'contact'; label: 'Solicitar implementación' }
  | { kind: 'view-plans'; label: 'Ver planes'; templateId: 'hamburger' | 'retail' }

/** Public CTAs remain informational; none of them starts tenant provisioning. */
export function getTemplateSecondaryAction(templateId: string): TemplateSecondaryAction {
  if (templateId === 'custom') return { kind: 'quote', label: 'Cotizar a medida' }
  if (templateId === 'hamburger' || templateId === 'retail') {
    return { kind: 'view-plans', label: 'Ver planes', templateId }
  }
  return { kind: 'contact', label: 'Solicitar implementación' }
}

export function getTemplateContactUrl(templateName: string, action: TemplateSecondaryAction, configuredNumber: string): string | null {
  if (action.kind === 'quote') return getWhatsAppUrl('Hola, quiero información sobre un desarrollo a medida en PACHAX Platform.', configuredNumber)

  const message = `Hola, quiero solicitar una implementación de ${templateName} en PACHAX.`
  return getWhatsAppUrl(message, configuredNumber)
}
