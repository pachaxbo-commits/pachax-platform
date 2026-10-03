/**
 * CATÁLOGO COMERCIAL CENTRALIZADO DE PLANTILLAS Y SHOWCASE
 * 
 * ÚNICA FUENTE DE VERDAD para:
 * - Coverflow 3D Hero
 * - Detalle de Plantilla Activa
 * - Sección 2: Plantillas en detalle
 * - Mapeo de Precios y Módulos
 * 
 * PREPARADO PARA FUTURO ADMIN PANEL:
 * El modelo soporta edición de nombres, miniaturas, descripciones, focal points,
 * orden y visibilidad ('published' | 'draft').
 */

export type CommercialTemplateId = 'restaurant' | 'distribution' | 'nightclub' | 'retail' | 'custom'

export interface CommercialTemplateItem {
  id: CommercialTemplateId
  templateId: CommercialTemplateId
  canonicalTemplateId: 'restaurant' | 'distribution' | 'nightclub' | 'retail' | null
  commercialName: string
  cardSubtitle: string
  thumbnailUrl: string
  thumbnailAlt: string
  thumbnailFocalPoint: string
  accent: string
  description: string
  detailDescription: string
  targetAudience: string
  problemSolved: string
  bullets: string[]
  features: string[]
  demoRoute: string
  demoPath: string
  detailAnchor: string
  badge?: string
  status: 'published' | 'draft'
  order: number
  primaryActionLabel: string
  iconType: 'utensils' | 'truck' | 'glass' | 'shopping-bag' | 'settings'
  visualSlot: {
    accentColor: string
    glowColor: string
    gradientClass: string
    pillBgClass: string
  }
}

export const COMMERCIAL_TEMPLATES: readonly CommercialTemplateItem[] = Object.freeze([
  {
    id: 'restaurant',
    templateId: 'restaurant',
    canonicalTemplateId: 'restaurant',
    commercialName: 'Restaurante',
    cardSubtitle: 'Gestión contemporánea de salón, cocina y caja',
    thumbnailUrl: '/brand/showcase/restaurant-concept.webp',
    thumbnailAlt: 'Ambiente de restaurante gastronómico premium con plato gourmet y servicio en salón',
    thumbnailFocalPoint: '50% 60%',
    accent: '#0066FF',
    description: 'Control de mesas en vivo, pedidos de mozos, pantalla KDS de cocina, cobros múltiples y cierre de caja ciego.',
    detailDescription: 'Gestiona mesas, pedidos, cocina en tiempo real, reservas y facturación. Todo lo que tu restaurante necesita en una sola plataforma operativa.',
    targetAudience: 'Restaurantes contemporáneos, bistrós, cafeterías, bares gastronómicos y pizzerías.',
    problemSolved: 'Elimina pérdidas de comandas entre salón y cocina, agiliza la rotación de mesas y asegura cuadratura perfecta de caja.',
    bullets: ['POS Salón & Kiosk', 'Cocina KDS en vivo', 'Mesas y sectores', 'Comandas móviles', 'Cuentas divididas', 'Caja ciega'],
    features: [
      'Punto de venta táctil con mapa de mesas y sectores en vivo',
      'Monitor KDS en cocina con tiempos de preparación y despachos',
      'Comandas móviles para mozos con modificadores y notas a cocina',
      'Cobros flexibles: Efectivo con cambio exacto, QR simple y tarjetas',
      'Arqueo y cierre de caja ciego sin descuadres al final del turno',
      'Inventario por recetas con descuento automático de gramos y botellas',
    ],
    demoRoute: '/demo/restaurant',
    demoPath: '/demo/restaurant',
    detailAnchor: '#plantilla-restaurante',
    badge: 'Más popular',
    status: 'published',
    order: 1,
    primaryActionLabel: 'Probar demo en vivo',
    iconType: 'utensils',
    visualSlot: {
      accentColor: '#0066FF',
      glowColor: 'rgba(0, 102, 255, 0.45)',
      gradientClass: 'from-[#071322] via-[#0d2038] to-[#040b15]',
      pillBgClass: 'bg-blue-500/15 text-blue-300 border-blue-500/30',
    },
  },
  {
    id: 'distribution',
    templateId: 'distribution',
    canonicalTemplateId: 'distribution',
    commercialName: 'Distribuidora',
    cardSubtitle: 'Logística de camiones, almacén y cobranzas en ruta',
    thumbnailUrl: '/brand/showcase/distribution-concept.webp',
    thumbnailAlt: 'Centro de distribución y logística moderna con camiones de reparto y almacén organizado',
    thumbnailFocalPoint: '50% 50%',
    accent: '#0284C7',
    description: 'Carga de camiones, control de kilos/lotes, liquidación contra retorno físico y cobranzas mayoristas.',
    detailDescription: 'Control de inventario en almacén central, despacho de camiones en ruta, liquidación ciega contra retorno físico y cobranza mayorista.',
    targetAudience: 'Empresas productoras, distribuidoras de alimentos, bebidas, embutidos y logística mayorista.',
    problemSolved: 'Detiene faltantes de producto en camiones y garantiza que cada kilo despachado se justifique en dinero o retorno.',
    bullets: ['Despacho por rutas', 'Control de kilos/peso', 'Liquidación de chofer', 'Cobranza de cartera', 'Stock por lotes', 'Auditoría ciega'],
    features: [
      'Despacho y asignación de carga de camión con control estricto de peso',
      'Registro de aumentos y mermas durante la jornada de distribución',
      'Liquidación de chofer contra retorno físico con cálculo de faltante/sobrante',
      'Gestión de cobranzas: pagos en efectivo, cartera a crédito y QR',
      'Control de almacén central con auditoría de lotes y fechas de vencimiento',
      'Reporte consolidado de ventas y rendimiento comercial por vendedor',
    ],
    demoRoute: '/demo/distribution',
    demoPath: '/demo/distribution',
    detailAnchor: '#plantilla-distribuidora',
    status: 'published',
    order: 2,
    primaryActionLabel: 'Probar demo en vivo',
    iconType: 'truck',
    visualSlot: {
      accentColor: '#0284C7',
      glowColor: 'rgba(2, 132, 199, 0.45)',
      gradientClass: 'from-[#061424] via-[#0b223d] to-[#030c17]',
      pillBgClass: 'bg-sky-500/15 text-sky-300 border-sky-500/30',
    },
  },
  {
    id: 'nightclub',
    templateId: 'nightclub',
    canonicalTemplateId: 'nightclub',
    commercialName: 'Nightclub & Lounge',
    cardSubtitle: 'Cuentas de barra de alta velocidad y control de botellas',
    thumbnailUrl: '/brand/showcase/nightclub-concept.webp',
    thumbnailAlt: 'Interior elegante de club nocturno y lounge VIP con iluminación arquitectónica en índigo y violeta',
    thumbnailFocalPoint: '50% 50%',
    accent: '#6366F1',
    description: 'Cuentas abiertas por pulsera o mesa VIP, control de botellas en mililitros y arqueo por barra.',
    detailDescription: 'Control de barras de alta velocidad, comandas rápidas, inventario de botellas por mililitro, zonas VIP y cuentas abiertas durante la noche.',
    targetAudience: 'Discotecas, clubes nocturnos, lounges premium y bares de coctelería con múltiples estaciones.',
    problemSolved: 'Evita fugas de licor en barras de alto volumen y agiliza el cobro en segundos sin bloquear el servicio.',
    bullets: ['Mesas VIP & Lounge', 'Cuentas por pulsera', 'Botellas por ml', 'Cajas independientes', 'Arqueo por barra', 'Atención veloz'],
    features: [
      'Cuentas abiertas asociadas a pulseras, tarjetas de barra o mesas VIP',
      'Comandero optimizado para despacho de tragos en menos de 15 segundos',
      'Control riguroso de inventario de botellas cerradas y consumo en mililitros',
      'Cajas y terminales independientes por barra con cierre ciego por turno',
      'Historial de consumo detallado por cliente o grupo durante la noche',
      'Apertura y cierre rápido de comandas sin congelamiento del sistema',
    ],
    demoRoute: '/demo/nightclub',
    demoPath: '/demo/nightclub',
    detailAnchor: '#plantilla-nightclub',
    status: 'published',
    order: 3,
    primaryActionLabel: 'Probar demo en vivo',
    iconType: 'glass',
    visualSlot: {
      accentColor: '#6366F1',
      glowColor: 'rgba(99, 102, 241, 0.45)',
      gradientClass: 'from-[#0a0f24] via-[#12163b] to-[#050814]',
      pillBgClass: 'bg-indigo-500/15 text-indigo-300 border-indigo-500/30',
    },
  },
  {
    id: 'retail',
    templateId: 'retail',
    canonicalTemplateId: 'retail',
    commercialName: 'Ventas Express',
    cardSubtitle: 'Venta rápida de mostrador y cobro por báscula o unidad',
    thumbnailUrl: '/brand/showcase/retail-concept.webp',
    thumbnailAlt: 'Mostrador ágil de comercio boutique y tienda specialty con atención rápida y cobro digital',
    thumbnailFocalPoint: '50% 50%',
    accent: '#0D9488',
    description: 'Punto de venta táctil, conexión con báscula por peso, catálogo simple y tickets instantáneos.',
    detailDescription: 'Punto de venta táctil para mostrador, ventas ágiles por unidad o peso conectadas a báscula, tickets al instante y control de caja.',
    targetAudience: 'Heladerías, cafeterías al paso, panaderías, tiendas de conveniencia y fiambrerías boutique.',
    problemSolved: 'Elimina colas de cobro en horas pico y automatiza el pesado y tarifado sin errores manuales.',
    bullets: ['Cobro en 1 click', 'Conexión a báscula', 'Venta por peso (kg)', 'Botonera táctil', 'Ticket instantáneo', 'Caja diaria'],
    features: [
      'Botonera táctil ágil con categorías rápidas de alta rotación',
      'Lectura directa de peso desde báscula digital con tarifación por gramo/kilo',
      'Emisión ágil de tickets térmicos o recibos digitales por WhatsApp',
      'Gestión de turnos de caja con control de efectivo y QR inmediato',
      'Control de catálogo de productos por código de barras o selección visual',
      'Sincronización cloud continua para operación sin interrupciones',
    ],
    demoRoute: '/demo/retail',
    demoPath: '/demo/retail',
    detailAnchor: '#plantilla-retail',
    status: 'published',
    order: 4,
    primaryActionLabel: 'Probar demo en vivo',
    iconType: 'shopping-bag',
    visualSlot: {
      accentColor: '#0D9488',
      glowColor: 'rgba(13, 148, 136, 0.45)',
      gradientClass: 'from-[#041616] via-[#082424] to-[#020d0d]',
      pillBgClass: 'bg-teal-500/15 text-teal-300 border-teal-500/30',
    },
  },
  {
    id: 'custom',
    templateId: 'custom',
    canonicalTemplateId: null,
    commercialName: 'Solución a medida',
    cardSubtitle: 'Desarrollo especializado con mantenimiento mensual incluido',
    thumbnailUrl: '/brand/showcase/custom-concept.webp',
    thumbnailAlt: 'Estudio de arquitectura de software profesional con ingenieros construyendo soluciones a medida',
    thumbnailFocalPoint: '50% 50%',
    accent: '#0066FF',
    description: 'Diseño e implementación de una plantilla exclusiva para tu operativa con soporte mensual garantizado.',
    detailDescription: 'Diseñamos e implementamos una plantilla exclusiva para tu operación diaria con arquitectura dedicada, soporte continuo y evolución mensual garantizada.',
    targetAudience: 'Empresas con flujos operativos no convencionales, franquicias o modelos de negocio propietarios.',
    problemSolved: 'Desarrolla el software exactamente adaptado a tu empresa sin forzar tus procesos a un sistema rígido.',
    bullets: ['Flujos a medida', 'Integración ERP/API', 'Tenant dedicado', 'Acompañamiento', 'Mantenimiento mensual', 'Evolución continua'],
    features: [
      'Levantamiento de requerimientos y diseño de experiencia de usuario exclusiva',
      'Programación de reglas de negocio y validaciones propietarias de la empresa',
      'Integración con hardware especial, básculas industriales o facturación local',
      'Mantenimiento evolutivo mensual: mejoras, seguridad y soporte garantizado',
      'Canal VIP directo con los ingenieros y capacitación personalizada a tu equipo',
      'Infraestructura aislada de alta disponibilidad con copias de seguridad continuas',
    ],
    demoRoute: 'https://wa.me/59177987776?text=Hola%2C%20quiero%20informaci%C3%B3n%20sobre%20un%20desarrollo%20a%20medida%20en%20PACHAX%20Platform.',
    demoPath: 'https://wa.me/59177987776?text=Hola%2C%20quiero%20informaci%C3%B3n%20sobre%20un%20desarrollo%20a%20medida%20en%20PACHAX%20Platform.',
    detailAnchor: '#plantilla-custom',
    status: 'published',
    order: 5,
    primaryActionLabel: 'Solicitar propuesta',
    iconType: 'settings',
    visualSlot: {
      accentColor: '#38BDF8',
      glowColor: 'rgba(56, 189, 248, 0.45)',
      gradientClass: 'from-[#08121e] via-[#0d1e33] to-[#040910]',
      pillBgClass: 'bg-sky-500/15 text-sky-300 border-sky-500/30',
    },
  },
])
