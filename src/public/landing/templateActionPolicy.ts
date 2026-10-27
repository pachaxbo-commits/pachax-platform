import { OFFICIAL_WHATSAPP } from '../config/pricingConfig.ts'

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

export function getTemplateContactUrl(templateName: string, action: TemplateSecondaryAction): string {
  if (action.kind === 'quote') return OFFICIAL_WHATSAPP.buildUrl(OFFICIAL_WHATSAPP.defaultCustomDevMessage)

  const message = `Hola, quiero solicitar una implementación de ${templateName} en PACHAX.`
  return OFFICIAL_WHATSAPP.buildUrl(message)
}
