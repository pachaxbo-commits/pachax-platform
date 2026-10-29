/**
 * Definición Editorial Oficial para PACHAX Encomiendas Estándar
 * 
 * LÍMITE ARQUITECTÓNICO ESTRICTO CON CODEX:
 * - Codex es responsable de PACHAX Planes y Capacidades Core (Billing Core).
 * - Esta definición contiene exclusivamente la presentación editorial, bullets y rutas de demostración.
 * - NO inventa planes ni precios comerciales.
 * - NO modifica los esquemas de facturación ni subscripción de Billing Core.
 */

import type { CommercialTemplateItem } from './commercialShowcase.ts'

export interface ParcelEditorialShowcaseItem extends Omit<CommercialTemplateItem, 'id' | 'templateId' | 'canonicalTemplateId'> {
  id: 'parcel'
  templateId: 'parcel'
  canonicalTemplateId: null
}

export const PARCEL_EDITORIAL_SHOWCASE_ITEM: ParcelEditorialShowcaseItem = Object.freeze({
  id: 'parcel',
  templateId: 'parcel',
  canonicalTemplateId: null,
  commercialName: 'PACHAX Encomiendas',
  cardSubtitle: 'Transporte de encomiendas, guías con QR, manifiestos y entrega con firma',
  thumbnailUrl: '/brand/showcase/distribution-concept.webp',
  thumbnailAlt: 'Operación ágil de recepción y despacho de encomiendas en agencia de transporte',
  thumbnailFocalPoint: '50% 50%',
  accent: '#14B8A6',
  description: 'Recepción ágil en mostrador, cálculo automático por peso y destino, guías con QR, manifiestos de ruta, cobro en destino (COD) y constancia de entrega con firma digital.',
  detailDescription: 'Gestiona la paquetería de tus rutas y agencias: recepción en balanza, rotulado con código QR, manifiestos de despacho para conductores, cobro contra entrega y verificación de identidad con firma digital en pantalla.',
  targetAudience: 'Empresas de transporte interdepartamental, agencias de encomiendas, couriers y operadores logísticos de paquetería.',
  problemSolved: 'Elimina extravíos de paquetes, agiliza la atención en mostrador con guías impresas instantáneas y garantiza trazabilidad total desde la recepción hasta la firma de entrega.',
  bullets: [
    'Guías con QR & Ticket',
    'Manifiestos de despacho',
    'Cobro contraentrega (COD)',
    'Firma digital en entrega',
    'Arqueo de turnos',
    'Reportes operativos',
  ],
  features: [
    'Recepción ágil con tarifación automática por peso base y kilos adicionales',
    'Generación inmediata de comprobantes y guías con código QR de rastreo',
    'Confección de manifiestos de despacho agrupados por ruta, conductor y placa',
    'Gestión de cobro en origen o cobro en destino (Cash on Delivery / COD)',
    'Entrega segura con captura de firma digital y registro de documento de identidad',
    'Arqueo de caja por turno y reportes detallados de carga por fecha y agencia',
  ],
  demoRoute: '/demo/parcel?data=full',
  demoPath: '/demo/parcel',
  demoEnabled: true,
  detailAnchor: '#plantilla-encomiendas',
  badge: 'Nuevo',
  status: 'published',
  order: 5,
  primaryActionLabel: 'Ver demostración interactiva',
  iconType: 'truck',
  visualSlot: {
    accentColor: '#14B8A6',
    glowColor: 'rgba(20, 184, 166, 0.45)',
    gradientClass: 'from-[#051c18] via-[#092923] to-[#03120f]',
    pillBgClass: 'bg-teal-500/15 text-teal-300 border-teal-500/30',
  },
})
