const { createHash } = require('node:crypto');
const { HttpsError } = require('firebase-functions/v2/https');
const { FieldPath, FieldValue, Timestamp } = require('firebase-admin/firestore');
const { authenticated, id } = require('./authorization.cjs');
const { PUBLIC_TEMPLATES } = require('./generated/publicTemplates.js');
const { platformActor, cleanText, auditPlatform } = require('./platformAuthorization.cjs');

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

module.exports = { submitCommercialInterest, listCommercialIntents, prepareCommercialProposal };
