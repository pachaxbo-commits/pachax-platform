const { createHash, createHmac } = require('node:crypto');
const { HttpsError } = require('firebase-functions/v2/https');
const { FieldPath, FieldValue, Timestamp } = require('firebase-admin/firestore');
const { authenticated, id } = require('./authorization.cjs');
const { PUBLIC_TEMPLATES } = require('./generated/publicTemplates.js');
const { platformActor, cleanText, auditPlatform } = require('./platformAuthorization.cjs');

const MAX_PUBLIC_CATALOG_TEMPLATES = 20;
const MAX_PUBLIC_CATALOG_PLANS = 50;
const MAX_PUBLIC_CATALOG_EXTRAS = 100;

function publicString(value, max = 240) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function publicStringList(value, maxItems = 20, maxLength = 240) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, maxItems).map(item => publicString(item, maxLength)).filter(Boolean);
}

function safePublicTemplate(idValue, value) {
  const definition = PUBLIC_TEMPLATES.find(item => item.id === idValue);
  if (!definition || idValue === 'custom' || value.status !== 'published') return null;
  const availability = value.commercialAvailability === 'available' ? 'available' : 'coming_soon';
  const implementationPrice = Number(value.implementationBasePriceUSD);
  return {
    id: idValue,
    canonicalTemplateId: definition.id,
    commercialName: publicString(value.commercialName, 100),
    cardSubtitle: publicString(value.cardSubtitle, 180),
    thumbnailUrl: publicString(value.thumbnailUrl, 500),
    thumbnailAlt: publicString(value.thumbnailAlt, 180),
    thumbnailFocalPoint: publicString(value.thumbnailFocalPoint, 40),
    accent: publicString(value.accent, 40),
    description: publicString(value.description, 500),
    detailDescription: publicString(value.detailDescription, 1200),
    targetAudience: publicString(value.targetAudience, 500),
    problemSolved: publicString(value.problemSolved, 500),
    bullets: publicStringList(value.bullets, 12, 180),
    features: publicStringList(value.features, 20, 180),
    demoRoute: definition.demoPath,
    demoPath: definition.demoPath,
    demoEnabled: Boolean(value.demoEnabled && definition.demoPath),
    detailAnchor: publicString(value.detailAnchor, 80),
    badge: publicString(value.badge, 80),
    status: 'published',
    commercialAvailability: availability,
    commercialMode: value.commercialMode === 'specialized' ? 'specialized' : 'self_service',
    implementationBasePriceUSD: Number.isFinite(implementationPrice) && implementationPrice >= 0 ? implementationPrice : null,
    diagnosticTitle: publicString(value.diagnosticTitle, 120),
    diagnosticDescription: publicString(value.diagnosticDescription, 500),
    implementationTitle: publicString(value.implementationTitle, 120),
    implementationDescription: publicString(value.implementationDescription, 500),
    order: Number.isFinite(Number(value.order)) ? Number(value.order) : 0,
    primaryActionLabel: publicString(value.primaryActionLabel, 80),
    iconType: publicString(value.iconType, 40),
    visualSlot: {
      accentColor: publicString(value.visualSlot?.accentColor, 40),
      glowColor: publicString(value.visualSlot?.glowColor, 40),
      gradientClass: publicString(value.visualSlot?.gradientClass, 100),
      pillBgClass: publicString(value.visualSlot?.pillBgClass, 100),
    },
  };
}

function safePublicPlan(idValue, value) {
  if (value.status !== 'published' || value.priceApproval !== 'approved'
    || !PUBLIC_TEMPLATES.some(item => item.id === value.templateId)
    || !Array.isArray(value.technicalEntitlements) || value.technicalEntitlements.length !== 0) return null;
  const monthly = Number(value.monthlyPriceUSD);
  const annual = Number(value.annualPriceUSD);
  if (!['USD', 'BOB'].includes(value.currency) || !Number.isFinite(monthly) || !Number.isFinite(annual)) return null;
  if (value.planKind === 'free') {
    if (monthly !== 0 || annual !== 0 || value.adsRequired !== true) return null;
  } else if (value.planKind !== 'paid' || monthly <= 0 || annual <= 0) return null;
  const includedFeatures = publicStringList(value.includedFeatures, 30, 180);
  if (!publicString(value.name, 100) || includedFeatures.length === 0) return null;
  return {
    id: idValue,
    templateId: value.templateId,
    name: publicString(value.name, 100),
    planKind: value.planKind,
    tierLevel: [1, 2, 3].includes(Number(value.tierLevel)) ? Number(value.tierLevel) : null,
    monthlyPriceUSD: monthly,
    annualPriceUSD: annual,
    currency: value.currency,
    // These are safe normalized contract flags, not the administrator's raw
    // entitlement configuration. The public client revalidates the projection.
    priceApproval: 'approved',
    technicalEntitlements: [],
    badge: publicString(value.badge, 80),
    isPopular: value.isPopular === true,
    adsRequired: value.planKind === 'free',
    clientProfile: publicString(value.clientProfile, 500),
    limitsLabel: publicString(value.limitsLabel, 180),
    includedFeatures,
    ctaLabel: publicString(value.ctaLabel, 80),
    status: 'published',
    order: Number.isFinite(Number(value.order)) ? Number(value.order) : 0,
  };
}

function safePublicExtra(idValue, value) {
  if (value.status !== 'published') return null;
  const title = publicString(value.title, 120);
  const shortDescription = publicString(value.shortDescription, 360);
  const applicableTemplates = value.applicableTemplates === 'all'
    ? 'all'
    : Array.isArray(value.applicableTemplates)
      ? [...new Set(value.applicableTemplates.filter(templateId => PUBLIC_TEMPLATES.some(item => item.id === templateId)))].slice(0, 5)
      : [];
  if (!title || !shortDescription || !['recurring', 'one_time', 'custom_quote'].includes(value.pricingType)
    || (applicableTemplates !== 'all' && applicableTemplates.length === 0)) return null;
  return {
    id: idValue,
    title,
    category: publicString(value.category, 40),
    shortDescription,
    referencePriceLabel: publicString(value.referencePriceLabel, 120),
    pricingType: value.pricingType,
    iconKey: publicString(value.iconKey, 40),
    applicableTemplates,
    status: 'published',
    order: Number.isFinite(Number(value.order)) ? Number(value.order) : 0,
  };
}

function safePublicLandingContent(value = {}) {
  const fallback = {
    heroTagline: 'PLATAFORMA INTEGRAL DE GESTIÓN OPERATIVA',
    heroTitle: 'El sistema operativo para negocios con flujos reales de venta',
    heroSubtitle: 'Cada rubro opera con su propio motor canónico.',
    heroCtaPrimary: 'Explorar soluciones',
    heroCtaSecondary: 'Solicitar información',
    officialWhatsAppNumber: '',
    officialWhatsAppDisplay: '',
    defaultCustomDevMessage: '',
    valueStripMetrics: [],
    sectionTitles: {},
  };
  const metrics = Array.isArray(value.valueStripMetrics) ? value.valueStripMetrics.slice(0, 8).map(item => ({
    label: publicString(item?.label, 80), value: publicString(item?.value, 120), detail: publicString(item?.detail, 240),
  })).filter(item => item.label && item.value) : fallback.valueStripMetrics;
  const sectionKeys = ['catalog', 'catalogSubtitle', 'pricing', 'pricingSubtitle', 'onboarding', 'onboardingSubtitle', 'tutorials', 'tutorialsSubtitle', 'extras', 'extrasSubtitle'];
  const sectionTitles = Object.fromEntries(sectionKeys.map(key => [key, publicString(value.sectionTitles?.[key], 260)]));
  return {
    heroTagline: publicString(value.heroTagline, 120) || fallback.heroTagline,
    heroTitle: publicString(value.heroTitle, 220) || fallback.heroTitle,
    heroSubtitle: publicString(value.heroSubtitle, 500) || fallback.heroSubtitle,
    heroCtaPrimary: publicString(value.heroCtaPrimary, 100) || fallback.heroCtaPrimary,
    heroCtaSecondary: publicString(value.heroCtaSecondary, 100) || fallback.heroCtaSecondary,
    officialWhatsAppNumber: publicString(value.officialWhatsAppNumber, 20),
    officialWhatsAppDisplay: publicString(value.officialWhatsAppDisplay, 30),
    defaultCustomDevMessage: publicString(value.defaultCustomDevMessage, 500),
    valueStripMetrics: metrics,
    sectionTitles,
  };
}

async function getPublicCommercialCatalog(db) {
  const [templates, plans, extras, media, landing] = await Promise.all([
    db.collection('platformTemplates').where('status', '==', 'published').limit(MAX_PUBLIC_CATALOG_TEMPLATES + 1).get(),
    db.collection('platformPlans').where('status', '==', 'published').limit(MAX_PUBLIC_CATALOG_PLANS + 1).get(),
    db.collection('platformExtras').where('status', '==', 'published').limit(MAX_PUBLIC_CATALOG_EXTRAS + 1).get(),
    db.collection('platformMedia').where('status', '==', 'published').limit(51).get(),
    db.doc('platformConfig/publicLanding').get(),
  ]);
  if (templates.size > MAX_PUBLIC_CATALOG_TEMPLATES || plans.size > MAX_PUBLIC_CATALOG_PLANS || extras.size > MAX_PUBLIC_CATALOG_EXTRAS || media.size > 50) {
    throw new HttpsError('resource-exhausted', 'El catálogo comercial supera el límite seguro de publicación.');
  }
  const publicTemplates = templates.docs.map(snapshot => safePublicTemplate(snapshot.id, snapshot.data())).filter(Boolean);
  const publicPlans = plans.docs.map(snapshot => safePublicPlan(snapshot.id, snapshot.data())).filter(Boolean);
  const publicExtras = extras.docs.map(snapshot => safePublicExtra(snapshot.id, snapshot.data())).filter(Boolean);
  const publicMedia = media.docs.map(snapshot => ({
    id: snapshot.id,
    name: publicString(snapshot.data().name, 120),
    url: publicString(snapshot.data().url, 500),
    category: publicString(snapshot.data().category, 40),
    recommendedTemplate: publicString(snapshot.data().recommendedTemplate, 50),
    focalPointDefault: publicString(snapshot.data().focalPointDefault, 40),
  })).filter(asset => asset.name && asset.url);
  return {
    templates: publicTemplates.sort((a, b) => a.order - b.order),
    plans: publicPlans.sort((a, b) => a.order - b.order),
    extras: publicExtras.sort((a, b) => a.order - b.order),
    mediaAssets: publicMedia,
    landingContent: safePublicLandingContent(landing.exists && landing.data().status === 'published' ? landing.data() : {}),
    fetchedAt: new Date().toISOString(),
  };
}

function rateLimitDigest(secret, kind, value) {
  return createHmac('sha256', secret).update(`${kind}:${value}`).digest('hex');
}

function publicRequestDigest(input) {
  return createHash('sha256').update(JSON.stringify({
    contactName: input.contactName,
    companyName: input.companyName,
    email: input.email,
    contactPhone: input.contactPhone,
    templateId: input.templateId,
    businessType: input.businessType,
    needs: input.needs,
    branchCount: input.branchCount,
    planId: input.planId,
    consent: input.consent,
  })).digest('hex');
}

async function submitPublicCommercialInterest(db, request, rateLimitSecret, options = {}) {
  const input = request.data || {};
  const allowed = new Set(['action', 'requestId', 'contactName', 'companyName', 'email', 'contactPhone', 'templateId', 'businessType', 'needs', 'branchCount', 'planId', 'consent', 'website']);
  if (Object.keys(input).some(key => !allowed.has(key)) || Buffer.byteLength(JSON.stringify(input)) > 8192) {
    throw new HttpsError('invalid-argument', 'La solicitud contiene campos no permitidos o supera el tamaño máximo.');
  }
  if (input.website) return { success: true, status: 'accepted', idempotent: false };
  if (input.consent !== true) throw new HttpsError('invalid-argument', 'Debes aceptar que PACHAX te contacte.');
  if (typeof rateLimitSecret !== 'string' || rateLimitSecret.length < 32) {
    throw new HttpsError('failed-precondition', 'El formulario de contacto no está configurado. Utiliza el canal de contacto alternativo.');
  }
  const requestId = cleanText(input.requestId, 'Solicitud', 16, 100);
  const contactName = cleanText(input.contactName, 'Nombre de contacto', 2, 80);
  const companyName = cleanText(input.companyName, 'Negocio', 2, 100);
  const templateId = cleanText(input.templateId, 'Plantilla', 1, 50);
  const template = PUBLIC_TEMPLATES.find(item => item.id === templateId);
  if (!template) throw new HttpsError('invalid-argument', 'Plantilla comercial no reconocida.');
  const businessType = cleanText(input.businessType, 'Tipo de negocio', 2, 80);
  const needs = input.needs ? cleanText(input.needs, 'Necesidad', 1, 1000) : '';
  const email = input.email ? cleanText(input.email, 'Correo', 3, 160).toLowerCase() : '';
  const contactPhone = input.contactPhone ? cleanText(input.contactPhone, 'Teléfono', 5, 40) : '';
  if (!email && !contactPhone) throw new HttpsError('invalid-argument', 'Indica un correo o teléfono para contactarte.');
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new HttpsError('invalid-argument', 'Escribe un correo válido.');
  const branchCount = input.branchCount === undefined || input.branchCount === null || input.branchCount === '' ? null : Number(input.branchCount);
  if (branchCount !== null && (!Number.isInteger(branchCount) || branchCount < 1 || branchCount > 1000)) {
    throw new HttpsError('invalid-argument', 'El número de sucursales debe estar entre 1 y 1.000.');
  }
  const planId = input.planId ? cleanText(input.planId, 'Plan', 1, 100) : null;
  const ip = publicString(request.rawRequest?.ip, 100);
  if (!ip && options.emulator !== true) throw new HttpsError('failed-precondition', 'No se pudo verificar el origen de la solicitud.');
  const normalizedIp = ip || 'emulator-local';
  const day = new Date().toISOString().slice(0, 10);
  const ipKey = rateLimitDigest(rateLimitSecret, 'ip', normalizedIp);
  const intentKey = rateLimitDigest(rateLimitSecret, 'request', `${requestId}:${email || contactPhone}`);
  const digest = publicRequestDigest({ contactName, companyName, email, contactPhone, templateId, businessType, needs, branchCount, planId, consent: true });
  const intentRef = db.doc(`platformCommercialIntents/${intentKey}`);
  const rateLimitRef = db.doc(`platformCommercialRateLimits/${ipKey}`);
  const planRef = planId ? db.doc(`platformPlans/${planId}`) : null;
  const expiresAt = Timestamp.fromMillis(Date.now() + 30 * 24 * 60 * 60 * 1000);

  return db.runTransaction(async tx => {
    const refs = await Promise.all([tx.get(intentRef), tx.get(rateLimitRef), ...(planRef ? [tx.get(planRef)] : [])]);
    const [intentSnap, limitSnap, planSnap] = refs;
    if (intentSnap.exists) {
      if (intentSnap.data().requestDigest !== digest) throw new HttpsError('already-exists', 'Este intento de envío ya fue utilizado. Actualiza la página antes de enviar otra solicitud.');
      return { success: true, status: 'accepted', idempotent: true };
    }
    const previous = limitSnap.data() || {};
    const count = previous.day === day ? Number(previous.count || 0) : 0;
    if (count >= 8) throw new HttpsError('resource-exhausted', 'Se alcanzó el límite diario de solicitudes. Inténtalo mañana o utiliza WhatsApp.');

    let planSnapshot = null;
    if (planRef) {
      const plan = planSnap.data();
      const safePlan = planSnap.exists ? safePublicPlan(planId, plan) : null;
      if (!safePlan || safePlan.templateId !== templateId) throw new HttpsError('failed-precondition', 'El plan ya no está disponible para esta plantilla.');
      planSnapshot = { planId: safePlan.id, name: safePlan.name, planKind: safePlan.planKind, monthlyPrice: safePlan.monthlyPriceUSD, annualPrice: safePlan.annualPriceUSD, currency: safePlan.currency };
    }

    const now = FieldValue.serverTimestamp();
    tx.create(intentRef, {
      uid: null,
      email,
      contactName,
      companyName,
      contactPhone,
      templateId,
      businessType,
      needs,
      branchCount,
      planSnapshot,
      consent: true,
      consentAt: now,
      source: 'public_landing',
      requestDigest: digest,
      status: 'new',
      tenantId: null,
      subscriptionStatus: null,
      entitlements: null,
      createdAt: now,
      updatedAt: now,
    });
    tx.set(rateLimitRef, { day, count: count + 1, expiresAt, updatedAt: now }, { merge: true });
    return { success: true, status: 'accepted', idempotent: false };
  });
}

function requestDigest(input) {
  const canonical = JSON.stringify({
    templateId: input.templateId,
    companyName: input.companyName,
    contactPhone: input.contactPhone || '',
    needs: input.needs || '',
    planId: input.planId || null,
  });
  return createHash('sha256').update(canonical).digest('hex');
}

function commercialIntentId(uid, requestId) {
  return createHash('sha256').update(`${uid}:${requestId}`).digest('hex');
}

function validateMoney(value, field) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount < 0 || amount > 1000000) {
    throw new HttpsError('invalid-argument', `${field} debe ser un importe entre 0 y 1.000.000.`);
  }
  return Math.round(amount * 100) / 100;
}

async function submitCommercialInterest(db, request) {
  const uid = authenticated(request);
  const input = request.data || {};
  const allowed = new Set(['action', 'requestId', 'templateId', 'companyName', 'contactPhone', 'needs', 'planId']);
  if (Object.keys(input).some(key => !allowed.has(key))) {
    throw new HttpsError('invalid-argument', 'La solicitud comercial contiene campos no permitidos.');
  }
  const requestId = id(input.requestId);
  const templateId = cleanText(input.templateId, 'Plantilla', 1, 50);
  const template = PUBLIC_TEMPLATES.find(item => item.id === templateId);
  if (!template) throw new HttpsError('invalid-argument', 'Plantilla comercial no reconocida.');
  const companyName = cleanText(input.companyName, 'Nombre del negocio', 2, 100);
  const contactPhone = input.contactPhone ? cleanText(input.contactPhone, 'Teléfono', 5, 40) : '';
  const needs = input.needs ? cleanText(input.needs, 'Necesidades', 1, 1200) : '';
  const planId = input.planId ? cleanText(input.planId, 'Plan', 1, 100) : null;
  const digest = requestDigest({ templateId, companyName, contactPhone, needs, planId });
  const intentRef = db.doc(`platformCommercialIntents/${commercialIntentId(uid, requestId)}`);
  const operatorRef = db.doc(`platformOperators/${uid}`);
  const planRef = planId ? db.doc(`platformPlans/${planId}`) : null;

  return db.runTransaction(async tx => {
    const refs = await Promise.all([tx.get(operatorRef), tx.get(intentRef), ...(planRef ? [tx.get(planRef)] : [])]);
    const [operatorSnap, intentSnap, planSnap] = refs;
    if (operatorSnap.data()?.active === true) throw new HttpsError('permission-denied', 'Una cuenta Platform no puede registrar una solicitud comercial tenant.');
    if (intentSnap.exists) {
      const existing = intentSnap.data();
      if (existing.uid !== uid || existing.requestDigest !== digest) {
        throw new HttpsError('already-exists', 'Este identificador de solicitud ya fue utilizado con otros datos.');
      }
      return { success: true, intentId: intentSnap.id, status: existing.status, idempotent: true };
    }

    let planSnapshot = null;
    if (planRef) {
      const plan = planSnap.data();
      if (!planSnap.exists || plan.status !== 'published' || plan.templateId !== templateId
        || plan.priceApproval !== 'approved' || plan.technicalEntitlements?.length) {
        throw new HttpsError('failed-precondition', 'El plan ya no está disponible para esta plantilla.');
      }
      const monthlyPrice = Number(plan.monthlyPriceUSD);
      const annualPrice = Number(plan.annualPriceUSD);
      const isFree = plan.planKind === 'free';
      if (!['USD', 'BOB'].includes(plan.currency) || !Number.isFinite(monthlyPrice) || !Number.isFinite(annualPrice)
        || (isFree && (monthlyPrice !== 0 || annualPrice !== 0 || plan.adsRequired !== true))
        || (!isFree && (monthlyPrice <= 0 || annualPrice <= 0))
        || !Array.isArray(plan.includedFeatures) || plan.includedFeatures.length === 0
        || plan.includedFeatures.some(feature => typeof feature !== 'string' || !feature.trim())) {
        throw new HttpsError('failed-precondition', 'El plan publicado no cumple el contrato comercial vigente.');
      }
      planSnapshot = {
        planId,
        name: plan.name,
        version: Number(plan.commercialVersion) || 1,
        planKind: plan.planKind === 'free' ? 'free' : 'paid',
        monthlyPrice,
        annualPrice,
        currency: plan.currency === 'BOB' ? 'BOB' : 'USD',
      };
    }
    const now = FieldValue.serverTimestamp();
    tx.create(intentRef, {
      uid,
      email: typeof request.auth.token?.email === 'string' ? request.auth.token.email : '',
      requestId,
      requestDigest: digest,
      templateId,
      businessType: template.businessType,
      companyName,
      contactPhone,
      needs,
      planSnapshot,
      status: 'new',
      tenantId: null,
      subscriptionStatus: null,
      entitlements: null,
      createdAt: now,
      updatedAt: now,
    });
    return { success: true, intentId: intentRef.id, status: 'new', idempotent: false };
  });
}

async function listCommercialIntents(db, request) {
  const actor = await platformActor(db, request, 'plans.manage');
  const requestedLimit = Number(request.data?.limit ?? 25);
  if (!Number.isInteger(requestedLimit) || requestedLimit < 1 || requestedLimit > 50) {
    throw new HttpsError('invalid-argument', 'El límite debe estar entre 1 y 50.');
  }
  let query = db.collection('platformCommercialIntents')
    .orderBy('createdAt', 'desc').orderBy(FieldPath.documentId(), 'desc').limit(requestedLimit);
  if (request.data?.cursor) {
    let cursor;
    try { cursor = JSON.parse(Buffer.from(String(request.data.cursor), 'base64url').toString('utf8')); }
    catch { throw new HttpsError('invalid-argument', 'Cursor comercial inválido.'); }
    if (!cursor || !Number.isFinite(cursor.createdAt) || typeof cursor.id !== 'string' || !cursor.id) {
      throw new HttpsError('invalid-argument', 'Cursor comercial inválido.');
    }
    query = query.startAfter(Timestamp.fromMillis(cursor.createdAt), cursor.id);
  }
  const snapshot = await query.get();
  const last = snapshot.docs.at(-1);
  const createdAt = last?.data().createdAt;
  const nextCursor = snapshot.size === requestedLimit && createdAt?.toMillis
    ? Buffer.from(JSON.stringify({ createdAt: createdAt.toMillis(), id: last.id })).toString('base64url')
    : null;
  return { intents: snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })), nextCursor };
}

async function prepareCommercialProposal(db, request) {
  const actor = await platformActor(db, request, 'plans.manage');
  const intentId = cleanText(request.data?.intentId, 'Solicitud', 1, 100);
  const requestId = id(request.data?.requestId);
  const implementationOneTime = validateMoney(request.data?.implementationOneTime, 'Implementación');
  const monthlyPrice = validateMoney(request.data?.monthlyPrice, 'Mensualidad');
  const annualPrice = validateMoney(request.data?.annualPrice, 'Anualidad');
  const currency = request.data?.currency || 'USD';
  if (!['USD', 'BOB'].includes(currency)) throw new HttpsError('invalid-argument', 'Moneda no válida.');
  const extraIds = request.data?.extraIds ?? [];
  if (!Array.isArray(extraIds) || extraIds.length > 20 || extraIds.some(value => typeof value !== 'string' || !value.trim())) {
    throw new HttpsError('invalid-argument', 'Lista de extras inválida.');
  }
  const intentRef = db.doc(`platformCommercialIntents/${intentId}`);
  const operationRef = intentRef.collection('proposalOperations').doc(createHash('sha256').update(`${actor.uid}:${requestId}`).digest('hex'));
  const extras = [...new Set(extraIds)];
  return db.runTransaction(async tx => {
    const [intentSnap, operationSnap, ...extraSnaps] = await Promise.all([
      tx.get(intentRef),
      tx.get(operationRef),
      ...extras.map(extraId => tx.get(db.doc(`platformExtras/${id(extraId)}`))),
    ]);
    if (!intentSnap.exists) throw new HttpsError('not-found', 'Solicitud comercial no encontrada.');
    const operationDigest = createHash('sha256').update(JSON.stringify({ intentId, implementationOneTime, monthlyPrice, annualPrice, currency, extraIds: extras })).digest('hex');
    if (operationSnap.exists) {
      if (operationSnap.data().digest !== operationDigest) throw new HttpsError('already-exists', 'El identificador de propuesta ya se utilizó con otros datos.');
      return { success: true, status: 'draft', commercialVersion: operationSnap.data().commercialVersion, idempotent: true };
    }
    if (extraSnaps.some(snapshot => !snapshot.exists || snapshot.data().status !== 'published'
      || (snapshot.data().applicableTemplates !== 'all'
        && !snapshot.data().applicableTemplates?.includes(intentSnap.data().templateId)))) {
      throw new HttpsError('failed-precondition', 'Uno o más extras no están publicados.');
    }
    const proposal = {
      status: 'draft',
      implementationOneTime,
      monthlyPrice,
      annualPrice,
      currency,
      extraIds: extras,
      preparedBy: actor.uid,
      preparedAt: FieldValue.serverTimestamp(),
      commercialVersion: (Number(intentSnap.data().proposal?.commercialVersion) || 0) + 1,
    };
    tx.update(intentRef, { proposal, updatedAt: FieldValue.serverTimestamp() });
    tx.create(operationRef, { digest: operationDigest, commercialVersion: proposal.commercialVersion, createdAt: FieldValue.serverTimestamp() });
    auditPlatform(db, tx, actor, 'commercial.intent.proposal.prepare', {
      resource: `platformCommercialIntents/${intentId}`,
      reason: 'Preparación de propuesta comercial en borrador',
      metadata: { templateId: intentSnap.data().templateId, currency, extraCount: extras.length },
    });
    return { success: true, status: 'draft', commercialVersion: proposal.commercialVersion, idempotent: false };
  });
}

async function updateCommercialIntentStatus(db, request) {
  const actor = await platformActor(db, request, 'plans.manage');
  const intentId = cleanText(request.data?.intentId, 'Solicitud', 1, 120);
  const requestId = id(request.data?.requestId);
  const status = request.data?.status;
  const allowedStatuses = new Set(['new', 'contacted', 'qualified', 'closed']);
  if (!allowedStatuses.has(status)) throw new HttpsError('invalid-argument', 'Estado comercial no válido.');
  const intentRef = db.doc(`platformCommercialIntents/${intentId}`);
  const operationRef = intentRef.collection('statusOperations').doc(createHash('sha256').update(`${actor.uid}:${requestId}`).digest('hex'));
  return db.runTransaction(async tx => {
    const [intentSnap, operationSnap] = await Promise.all([tx.get(intentRef), tx.get(operationRef)]);
    if (!intentSnap.exists) throw new HttpsError('not-found', 'Solicitud comercial no encontrada.');
    if (operationSnap.exists) {
      if (operationSnap.data().status !== status) throw new HttpsError('already-exists', 'El identificador de cambio ya fue utilizado con otro estado.');
      return { success: true, status, idempotent: true };
    }
    const previousStatus = intentSnap.data().status || 'new';
    if (previousStatus === status) {
      tx.create(operationRef, { status, createdAt: FieldValue.serverTimestamp() });
      return { success: true, status, idempotent: true };
    }
    tx.update(intentRef, { status, updatedAt: FieldValue.serverTimestamp(), statusUpdatedBy: actor.uid });
    tx.create(operationRef, { previousStatus, status, createdAt: FieldValue.serverTimestamp() });
    auditPlatform(db, tx, actor, 'commercial.intent.status.update', {
      resource: `platformCommercialIntents/${intentId}`,
      reason: 'Actualización administrativa del estado de una solicitud comercial',
      metadata: { previousStatus, status },
    });
    return { success: true, status, idempotent: false };
  });
}

module.exports = {
  getPublicCommercialCatalog,
  submitPublicCommercialInterest,
  submitCommercialInterest,
  listCommercialIntents,
  prepareCommercialProposal,
  updateCommercialIntentStatus,
  safePublicPlan,
};
