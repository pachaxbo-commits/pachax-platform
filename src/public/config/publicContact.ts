/**
 * Configuración centralizada de datos de contacto comercial público.
 *
 * NOTA:
 * Actualmente no existe un número de WhatsApp oficial asignado.
 * Si whatsappNumber o email están vacíos, la interfaz ofrece 'Copiar requerimiento'
 * y 'Abrir WhatsApp' de forma honesta, sin simular que el mensaje llegó directamente
 * a un asesor hasta que se defina la vía de contacto comercial.
 */
export interface PublicContactConfig {
  whatsappNumber: string
  email: string
}

export const publicContact: PublicContactConfig = {
  whatsappNumber: '',
  email: '',
}

export function getWhatsAppUrl(text: string): string {
  if (publicContact.whatsappNumber) {
    return `https://wa.me/${publicContact.whatsappNumber}?text=${encodeURIComponent(text)}`
  }
  return `https://wa.me/?text=${encodeURIComponent(text)}`
}
