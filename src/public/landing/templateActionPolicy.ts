import { OFFICIAL_WHATSAPP } from '../config/pricingConfig.ts'

export type TemplateSecondaryAction =
  | { kind: 'quote'; label: 'Cotizar a medida' }
  | { kind: 'contact'; label: 'Solicitar información' | 'Solicitar implementación' }
  | { kind: 'register'; label: 'Comenzar' }
  | { kind: 'unavailable'; label: 'Próximamente' }

/** Keep public contact distinct from tenant provisioning and commercial status. */
export function getTemplateSecondaryAction(
  templateId: string,
  provisioningAvailable: boolean,
  selfServiceCreationEnabled: boolean,
): TemplateSecondaryAction {
  if (templateId === 'custom') return { kind: 'quote', label: 'Cotizar a medida' }
  if (!selfServiceCreationEnabled) {
    return {
      kind: 'contact',
      label: templateId === 'nightclub' || templateId === 'retail'
        ? 'Solicitar implementación'
        : 'Solicitar información',
    }
  }
  if (provisioningAvailable) return { kind: 'register', label: 'Comenzar' }
  return { kind: 'unavailable', label: 'Próximamente' }
}

export function getTemplateContactUrl(templateName: string, action: TemplateSecondaryAction): string {
  if (action.kind === 'quote') return OFFICIAL_WHATSAPP.buildUrl(OFFICIAL_WHATSAPP.defaultCustomDevMessage)

  const message = action.label === 'Solicitar implementación'
    ? `Hola, quiero solicitar una implementación de ${templateName} en PACHAX.`
    : `Hola, quiero recibir información sobre ${templateName} en PACHAX.`
  return OFFICIAL_WHATSAPP.buildUrl(message)
}
