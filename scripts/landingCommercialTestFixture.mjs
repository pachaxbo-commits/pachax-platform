/**
 * Test-only fixtures for the public catalog callable contract.
 * These values are injected by browser-test CDP before app code executes;
 * they are never imported by application source or included in Vite builds.
 */

export const LANDING_TEST_CONTACT = Object.freeze({
  number: '12025550100',
  display: 'TEST · número reservado',
  message: 'PACHAX QA fixture; this is not a commercial request.',
})

const OFFICIAL_TEMPLATES = Object.freeze([
  { id: 'restaurant', name: 'Restaurante con salón', mode: 'specialized', order: 1 },
  { id: 'distribution', name: 'Producción y Distribución', mode: 'specialized', order: 2 },
  { id: 'nightclub', name: 'Nightclub & Lounge', mode: 'specialized', order: 3 },
  { id: 'hamburger', name: 'Restaurante Rápido', mode: 'self_service', order: 4 },
  { id: 'retail', name: 'Comercio / Venta rápida', mode: 'self_service', order: 5 },
  { id: 'custom', name: 'Solución a medida', mode: 'specialized', order: 6 },
])

const demoConfiguration = Object.freeze(OFFICIAL_TEMPLATES
  .filter(template => template.id !== 'custom')
  .map(({ id }) => ({ id, demoEnabled: false, demoEnabledConfigured: false })))

const thumbnailByTemplate = Object.freeze({
  restaurant: '/brand/showcase/restaurant-concept.webp',
  distribution: '/brand/showcase/distribution-concept.webp',
  nightclub: '/brand/showcase/nightclub-concept.webp',
  hamburger: '/brand/showcase/hamburger-counter.webp',
  retail: '/brand/showcase/retail-concept.webp',
  custom: '/brand/showcase/custom-concept.webp',
})

function publicTemplate({ id, name, mode, order }) {
  const custom = id === 'custom'
  return {
    id,
    canonicalTemplateId: custom ? null : id,
    commercialName: name,
    cardSubtitle: `Metadatos QA sintéticos · ${name}`,
    thumbnailUrl: thumbnailByTemplate[id],
    thumbnailAlt: `Imagen de prueba para ${name}`,
    thumbnailFocalPoint: '50% 50%',
    accent: 'cyan',
    description: `Ficha sintética de prueba para verificar la presentación de ${name}.`,
    detailDescription: `Metadatos de QA. Esta ficha no habilita contratación para ${name}.`,
    targetAudience: `Texto de prueba para el público de ${name}.`,
    problemSolved: `Texto de prueba para validar los detalles de ${name}.`,
    bullets: [`Capacidad editorial de prueba para ${name}.`],
    features: [`Función de muestra de ${name}.`],
    demoRoute: custom ? '' : `/demo/${id}`,
    demoPath: custom ? '' : `/demo/${id}`,
    demoEnabled: false,
    demoEnabledConfigured: false,
    detailAnchor: '',
    badge: 'SOLO QA · SIN OFERTA',
    status: 'published',
    commercialAvailability: 'coming_soon',
    commercialMode: mode,
    implementationBasePriceUSD: null,
    diagnosticTitle: 'Diagnóstico sujeto a confirmación',
    diagnosticDescription: 'Metadatos sintéticos; no representa una cotización.',
    implementationTitle: 'Implementación no disponible en este fixture',
    implementationDescription: 'Este escenario valida la interfaz y no inicia contratación.',
    order,
    primaryActionLabel: custom ? 'Cotizar a medida' : mode === 'specialized' ? 'Solicitar implementación' : 'Ver planes',
    iconType: '',
    visualSlot: { accentColor: '', glowColor: '', gradientClass: '', pillBgClass: '' },
  }
}

function landingContent(withTestContact) {
  return {
    heroTagline: 'PLATAFORMA INTEGRAL DE GESTIÓN OPERATIVA',
    heroTitle: 'El sistema operativo para negocios con flujos reales de venta',
    heroSubtitle: 'Cada rubro opera con su propio motor canónico.',
    heroCtaPrimary: 'Explorar soluciones',
    heroCtaSecondary: 'Solicitar información',
    officialWhatsAppNumber: withTestContact ? LANDING_TEST_CONTACT.number : '',
    officialWhatsAppDisplay: withTestContact ? LANDING_TEST_CONTACT.display : '',
    defaultCustomDevMessage: withTestContact ? LANDING_TEST_CONTACT.message : '',
    valueStripMetrics: [],
    sectionTitles: {},
  }
}

const common = {
  demoConfiguration,
  plans: [],
  extras: [],
  mediaAssets: [],
  fetchedAt: '2026-11-06T00:00:00.000Z',
}

export const EMPTY_PUBLIC_CATALOG_FIXTURE = Object.freeze({
  ...common,
  templates: [],
  landingContent: landingContent(false),
})

export const SYNTHETIC_PUBLIC_CATALOG_FIXTURE = Object.freeze({
  ...common,
  templates: OFFICIAL_TEMPLATES.map(publicTemplate),
  landingContent: landingContent(true),
})

export function getLandingCatalogFixture(scenario) {
  if (scenario === 'empty') return EMPTY_PUBLIC_CATALOG_FIXTURE
  if (scenario === 'synthetic') return SYNTHETIC_PUBLIC_CATALOG_FIXTURE
  throw new Error(`Escenario de catálogo desconocido: ${scenario}`)
}

/**
 * Install a fail-closed browser adapter for only the local callable catalog.
 * It blocks every other Firebase/Google callable attempt and never forwards
 * a request to an external host. The injected adapter runs only in test Chrome.
 */
export function createLandingCatalogAdapterScript({ scenario, fixture, functionsPort = 5101 }) {
  return `(() => {
    if (!(location.hostname === '127.0.0.1' || location.hostname === 'localhost') || location.protocol !== 'http:' || !['/', '/index.html'].includes(location.pathname)) return;
    const catalog = ${JSON.stringify(fixture)};
    const stats = window.__PACHAX_LANDING_TEST_CATALOG__ = { scenario: ${JSON.stringify(scenario)}, calls: 0, blocked: [], actions: [] };
    const nativeFetch = window.fetch.bind(window);
    window.fetch = async (input, init) => {
      const rawUrl = typeof input === 'string' || input instanceof URL ? String(input) : input?.url || '';
      let url;
      try { url = new URL(rawUrl, location.href); } catch { return nativeFetch(input, init); }
      const isCallable = /(?:^|\\/)publicCommercialGateway(?:$|[/?])/.test(url.pathname);
      const isFirebaseOrGoogle = /(?:firebase|googleapis|cloudfunctions|firebaseio)/i.test(url.hostname);
      if (!isCallable && !isFirebaseOrGoogle) return nativeFetch(input, init);
      const expectedPath = '/demo-pachax-platform/southamerica-west1/publicCommercialGateway';
      const expectedOrigin = 'http://' + location.hostname + ':' + ${JSON.stringify(String(functionsPort))};
      if (url.origin !== expectedOrigin || url.pathname !== expectedPath) {
        stats.blocked.push(url.href);
        return new Response(JSON.stringify({ error: { status: 'PERMISSION_DENIED', message: 'Blocked by local landing test adapter.' } }), { status: 403, headers: { 'content-type': 'application/json' } });
      }
      let payload;
      try {
        const request = new Request(input, init);
        payload = JSON.parse(await request.clone().text());
      } catch {
        stats.blocked.push('invalid-callable-payload');
        return new Response(JSON.stringify({ error: { status: 'INVALID_ARGUMENT', message: 'Invalid test callable request.' } }), { status: 400, headers: { 'content-type': 'application/json' } });
      }
      const action = payload?.data?.action;
      stats.actions.push(action || 'missing');
      if (action !== 'getCatalog') {
        stats.blocked.push('unsupported-action:' + String(action || 'missing'));
        return new Response(JSON.stringify({ error: { status: 'PERMISSION_DENIED', message: 'Only getCatalog is permitted in landing tests.' } }), { status: 403, headers: { 'content-type': 'application/json' } });
      }
      stats.calls += 1;
      return new Response(JSON.stringify({ result: catalog }), { status: 200, headers: { 'content-type': 'application/json' } });
    };
  })();`
}
