/**
 * Construye enlaces comerciales desde la configuración pública aprobada.
 * El número propuesto se mantiene solo como referencia de revisión administrativa;
 * nunca se usa automáticamente como destino de un CTA.
 */
export const PROPOSED_WHATSAPP_NUMBER_FOR_OWNER_REVIEW = '59177987776'

export function normalizeWhatsAppNumber(value: string | null | undefined): string {
  return (value ?? '').replace(/\D/g, '')
}

export function hasWhatsAppContact(value: string | null | undefined): boolean {
  return normalizeWhatsAppNumber(value).length >= 8
}

export function getWhatsAppUrl(text: string, configuredNumber: string | null | undefined): string | null {
  const number = normalizeWhatsAppNumber(configuredNumber)
  if (!hasWhatsAppContact(number)) return null
  return `https://wa.me/${number}?text=${encodeURIComponent(text)}`
}
