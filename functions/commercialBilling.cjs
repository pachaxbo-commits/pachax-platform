const { createHash } = require('node:crypto');
const { HttpsError } = require('firebase-functions/v2/https');
const { FieldValue, Timestamp } = require('firebase-admin/firestore');
const { platformActor, cleanText, auditPlatform } = require('./platformAuthorization.cjs');
const { PUBLIC_TEMPLATES, isTemplateProvisioningAvailable } = require('./generated/publicTemplates.js');
const { BILLING_GRACE_PERIOD_DAYS, billingAccessUntil: billingAccessUntilMillis } = require('./billingPolicy.cjs');

const BILLING_STATUSES = Object.freeze(['pending', 'active', 'overdue', 'suspended', 'cancelled']);
const addGracePeriod = periodEnd => Timestamp.fromMillis(billingAccessUntilMillis(periodEnd.toMillis()));
const moneyMinor = (value, label, { allowZero = true } = {}) => {
  const raw = typeof value === 'string' ? value.trim() : String(value);
  const match = /^(0|[1-9]\d{0,8})(?:\.(\d{1,2}))?$/.exec(raw);
  if (!match) throw new HttpsError('invalid-argument', `${label} debe ser un importe con hasta dos decimales.`);
  const minor = Number(match[1]) * 100 + Number((match[2] || '').padEnd(2, '0'));
  if (!Number.isSafeInteger(minor) || minor > 100_000_000 || (!allowZero && minor <= 0)) {
    throw new HttpsError('invalid-argument', `${label} está fuera del límite permitido.`);
  }
  return minor;
};
const currencyCode = value => {
  if (!['BOB', 'USD'].includes(value)) throw new HttpsError('invalid-argument', 'Moneda no válida.');
  return value;
};
const digest = value => createHash('sha256').update(value).digest('hex');
const requestKey = (actor, action, requestId) => digest(`${actor.uid}:${action}:${requestId}`);
const requestUuid = value => {
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    throw new HttpsError('invalid-argument', 'Identificador de operación inválido.');
  }
  return value;
};
function requirePermission(actor, permission) {
  if (!actor.permissions.includes(permission)) throw new HttpsError('permission-denied', 'El operador no tiene permiso para esta acción.');
}
function templateFor(id) {
  const template = PUBLIC_TEMPLATES.find(item => item.id === id);
  if (!template) throw new HttpsError('invalid-argument', 'Plantilla comercial no reconocida.');
  return template;
}
function safeEmail(value) {
  const email = cleanText(value, 'Correo de contacto', 3, 160).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new HttpsError('invalid-argument', 'Correo de contacto inválido.');
  return email;
}
function validateDueAt(value) {
  const millis = typeof value === 'string' ? Date.parse(value) : NaN;
  if (!Number.isFinite(millis) || millis < Date.now() - 86_400_000 || millis > Date.now() + 366 * 86_400_000) {
    throw new HttpsError('invalid-argument', 'La fecha de vencimiento debe estar entre hoy y los próximos 12 meses.');
  }
  return Timestamp.fromMillis(millis);
}
function audit(db, tx, actor, action, resource, metadata = {}) {
  auditPlatform(db, tx, actor, action, { resource, reason: 'Operación de facturación comercial manual.', metadata });
}

async function createManualCommercialIntent(db, request) {
  const actor = await platformActor(db, request, 'plans.manage');
  const input = request.data || {};
  const operationId = requestUuid(input.requestId);
  const template = templateFor(input.templateId);
  const contactName = cleanText(input.contactName, 'Nombre de contacto', 2, 100);
  const companyName = cleanText(input.companyName, 'Nombre de empresa', 2, 120);
  const email = safeEmail(input.email);
  const contactPhone = cleanText(input.contactPhone, 'Teléfono de contacto', 5, 40);
  const needs = input.needs ? cleanText(input.needs, 'Notas de solicitud', 1, 1500) : '';
  const planId = input.planId ? cleanText(input.planId, 'Plan', 1, 100) : null;
  const extraIds = Array.isArray(input.extraIds) ? input.extraIds.map(id => cleanText(id, 'Extra', 1, 100)) : [];
  if (extraIds.length > 20 || new Set(extraIds).size !== extraIds.length) throw new HttpsError('invalid-argument', 'La solicitud admite hasta 20 extras distintos.');
  const billingCycle = input.billingCycle === 'annual' ? 'annual' : 'monthly';
  const operationRef = db.doc(`platformCommercialOperations/${requestKey(actor, 'intent.create', operationId)}`);
  const intentId = `lead_${requestKey(actor, 'intent', operationId)}`;
  const intentRef = db.doc(`platformCommercialIntents/${intentId}`);
  const planRef = planId ? db.doc(`platformPlans/${planId}`) : null;
  const fingerprint = digest(JSON.stringify({ contactName, companyName, email, contactPhone, templateId: template.id, needs, planId, extraIds, billingCycle }));
  return db.runTransaction(async tx => {
    const [operationSnap, intentSnap, ...catalogSnaps] = await Promise.all([
      tx.get(operationRef), tx.get(intentRef),
      ...(planRef ? [tx.get(planRef)] : []),
      ...extraIds.map(id => tx.get(db.doc(`platformExtras/${id}`))),
    ]);
    const planSnap = planRef ? catalogSnaps[0] : null;
    const extraSnaps = catalogSnaps.slice(planRef ? 1 : 0);
    if (operationSnap.exists) {
      if (operationSnap.data().intentId !== intentId || operationSnap.data().fingerprint !== fingerprint) throw new HttpsError('already-exists', 'El identificador ya se utilizó con otros datos.');
      return { success: true, intentId, idempotent: true };
    }
    if (intentSnap.exists) throw new HttpsError('already-exists', 'La solicitud ya existe.');
    let planSnapshot = null;
    if (planRef) {
      const plan = planSnap.data();
      if (!planSnap.exists || plan.status !== 'published' || plan.priceApproval !== 'approved'
        || plan.templateId !== template.id || (plan.technicalEntitlements || []).length) {
        throw new HttpsError('failed-precondition', 'El plan no está publicado y aprobado para esta plantilla. Puedes continuar como cotización a medida.');
      }
      planSnapshot = {
        planId, name: cleanText(plan.name, 'Plan', 1, 120),
        version: Number(plan.commercialVersion) || 1, currency: currencyCode(plan.currency),
        monthlyPrice: Number(plan.monthlyPriceUSD), annualPrice: Number(plan.annualPriceUSD),
        includedFeatures: Array.isArray(plan.includedFeatures) ? plan.includedFeatures.filter(x => typeof x === 'string').slice(0, 100) : [],
        technicalEntitlements: [],
      };
    }
    if (extraSnaps.some(snap => !snap.exists || snap.data().status !== 'published'
      || (snap.data().applicableTemplates !== 'all' && !snap.data().applicableTemplates?.includes(template.id)))) {
      throw new HttpsError('failed-precondition', 'Uno o más extras no están publicados para esta plantilla.');
    }
    const requestedExtraSnapshots = extraSnaps.map((snap, index) => ({
      id: extraIds[index], title: cleanText(snap.data().title, 'Extra', 1, 120),
      pricingType: snap.data().pricingType, commercialVersion: Number(snap.data().commercialVersion) || 1,
    }));
    const now = FieldValue.serverTimestamp();
    tx.create(intentRef, {
      uid: null, email, contactName, companyName, contactPhone,
      templateId: template.id, businessType: template.businessType,
      needs, branchCount: null, planSnapshot, requestedExtraSnapshots, requestedBillingCycle: billingCycle,
      source: 'admin_whatsapp', createdBy: actor.uid,
      status: 'new', tenantId: null, subscriptionStatus: null, entitlements: null,
      createdAt: now, updatedAt: now,
    });
    tx.create(operationRef, { action: 'intent.create', intentId, fingerprint, actorUid: actor.uid, createdAt: now });
    audit(db, tx, actor, 'billing.intent.create_manual', intentRef.path, { templateId: template.id });
    return { success: true, intentId, idempotent: false };
  });
}

async function saveCommercialQuote(db, request) {
  const actor = await platformActor(db, request, 'plans.manage');
  const input = request.data || {};
  const operationId = requestUuid(input.requestId);
  const intentId = cleanText(input.intentId, 'Solicitud', 1, 120);
  const currency = currencyCode(input.currency);
  const cycle = input.billingCycle;
  if (!['monthly', 'annual'].includes(cycle)) throw new HttpsError('invalid-argument', 'Selecciona ciclo mensual o anual.');
  const implementationMinor = moneyMinor(input.implementation, 'Implementación');
  const monthlyMinor = moneyMinor(input.monthly, 'Mensualidad');
  const annualMinor = moneyMinor(input.annual, 'Anualidad');
  const discountMinor = moneyMinor(input.discount ?? '0', 'Descuento');
  if (discountMinor && actor.operator.role !== 'platform_owner') throw new HttpsError('permission-denied', 'Solo Platform Owner puede autorizar descuentos comerciales.');
  const discountReason = discountMinor ? cleanText(input.discountReason, 'Motivo del descuento', 8, 500) : '';
  const items = Array.isArray(input.extras) ? input.extras : [];
  if (items.length > 20) throw new HttpsError('invalid-argument', 'La cotización admite hasta 20 extras.');
  const normalized = items.map(item => ({
    id: cleanText(item?.id, 'Extra', 1, 100),
    oneTimeMinor: moneyMinor(item?.oneTime ?? '0', 'Importe único'),
    monthlyMinor: moneyMinor(item?.monthly ?? '0', 'Extra mensual'),
    annualMinor: moneyMinor(item?.annual ?? '0', 'Extra anual'),
  }));
  if (new Set(normalized.map(item => item.id)).size !== normalized.length) throw new HttpsError('invalid-argument', 'No repitas extras.');
  const intentRef = db.doc(`platformCommercialIntents/${intentId}`);
  const operationRef = intentRef.collection('quoteOperations').doc(requestKey(actor, 'quote.save', operationId));
  return db.runTransaction(async tx => {
    const [intentSnap, operationSnap, ...extraSnaps] = await Promise.all([
      tx.get(intentRef), tx.get(operationRef), ...normalized.map(item => tx.get(db.doc(`platformExtras/${item.id}`))),
    ]);
    if (!intentSnap.exists) throw new HttpsError('not-found', 'Solicitud comercial no encontrada.');
    const intent = intentSnap.data();
    if (intent.contractId || intent.acceptance) throw new HttpsError('failed-precondition', 'La solicitud ya fue aceptada o contratada; no se puede cambiar la cotización.');
    const fingerprint = digest(JSON.stringify({ intentId, currency, cycle, implementationMinor, monthlyMinor, annualMinor, discountMinor, discountReason, extras: normalized }));
    if (operationSnap.exists) {
      if (operationSnap.data().fingerprint !== fingerprint) throw new HttpsError('already-exists', 'El identificador de cotización ya se usó con otros datos.');
      return { success: true, quoteVersion: operationSnap.data().quoteVersion, idempotent: true };
    }
    if (extraSnaps.some((snap, index) => !snap.exists || snap.data().status !== 'published'
      || (snap.data().applicableTemplates !== 'all' && !snap.data().applicableTemplates?.includes(intent.templateId)))) {
      throw new HttpsError('failed-precondition', 'Uno o más extras no están publicados para esta plantilla.');
    }
    const extraLines = extraSnaps.map((snap, index) => ({
      id: normalized[index].id, title: cleanText(snap.data().title, 'Extra', 1, 120),
      pricingType: snap.data().pricingType,
      oneTimeMinor: normalized[index].oneTimeMinor,
      monthlyMinor: normalized[index].monthlyMinor,
      annualMinor: normalized[index].annualMinor,
    }));
    for (const line of extraLines) {
      if (!['recurring', 'one_time', 'custom_quote'].includes(line.pricingType)) throw new HttpsError('failed-precondition', 'Un extra tiene una modalidad de cobro no reconocida.');
      if (line.pricingType === 'recurring' && line.oneTimeMinor !== 0) throw new HttpsError('invalid-argument', 'Un extra recurrente no puede cotizarse como importe único.');
      if (line.pricingType !== 'recurring' && (line.monthlyMinor !== 0 || line.annualMinor !== 0)) throw new HttpsError('invalid-argument', 'Un extra de pago único no puede incluir mensualidad.');
    }
    const recurring = cycle === 'annual' ? annualMinor : monthlyMinor;
    const recurringExtras = extraLines.reduce((sum, line) => sum + (cycle === 'annual' ? line.annualMinor : line.monthlyMinor), 0);
    const initialDueMinor = implementationMinor + recurring + recurringExtras + extraLines.reduce((sum, line) => sum + line.oneTimeMinor, 0) - discountMinor;
    if (!Number.isSafeInteger(initialDueMinor) || initialDueMinor < 0) throw new HttpsError('invalid-argument', 'El descuento supera el importe inicial de la cotización.');
    if (monthlyMinor <= 0 || annualMinor <= 0) throw new HttpsError('failed-precondition', 'Una cotización comercial requiere mensualidad y anualidad mayores que cero.');
    const quoteVersion = (Number(intent.quote?.version) || 0) + 1;
    if (intent.quote?.status === 'offered') throw new HttpsError('failed-precondition', 'Retira la oferta anterior antes de guardar una nueva versión.');
    const quote = {
      version: quoteVersion, status: 'draft', currency, billingCycle: cycle,
      implementationMinor, monthlyMinor, annualMinor, discountMinor, discountReason,
      extras: extraLines, initialDueMinor, recurringMinor: recurring + recurringExtras,
      sourcePlanSnapshot: intent.planSnapshot || null, technicalEntitlements: [],
      preparedBy: actor.uid, preparedAt: FieldValue.serverTimestamp(),
    };
    tx.update(intentRef, { quote, proposal: { status: 'draft', commercialVersion: quoteVersion }, updatedAt: FieldValue.serverTimestamp() });
    tx.create(operationRef, { fingerprint, quoteVersion, createdAt: FieldValue.serverTimestamp() });
    audit(db, tx, actor, 'billing.quote.save', intentRef.path, { quoteVersion, currency, billingCycle: cycle, initialDueMinor });
    return { success: true, quoteVersion, initialDueMinor, idempotent: false };
  });
}

async function offerCommercialQuote(db, request) {
  const actor = await platformActor(db, request, 'plans.manage');
  const intentId = cleanText(request.data?.intentId, 'Solicitud', 1, 120);
  const requestId = requestUuid(request.data?.requestId);
  const ref = db.doc(`platformCommercialIntents/${intentId}`);
  const op = ref.collection('quoteOfferOperations').doc(requestKey(actor, 'quote.offer', requestId));
  return db.runTransaction(async tx => {
    const [intent, operation] = await Promise.all([tx.get(ref), tx.get(op)]);
    if (!intent.exists) throw new HttpsError('not-found', 'Solicitud no encontrada.');
    if (operation.exists) {
      if (operation.data().quoteVersion !== intent.data().quote?.version) throw new HttpsError('already-exists', 'El identificador de oferta ya pertenece a otra versión de cotización.');
      return { success: true, idempotent: true };
    }
    const quote = intent.data().quote;
    if (!quote || quote.status !== 'draft' || !Number.isSafeInteger(quote.initialDueMinor)) throw new HttpsError('failed-precondition', 'Guarda primero una cotización válida.');
    const now = FieldValue.serverTimestamp();
    tx.update(ref, { quote: { ...quote, status: 'offered', offeredBy: actor.uid, offeredAt: now }, updatedAt: now });
    tx.create(op, { quoteVersion: quote.version, createdAt: now });
    audit(db, tx, actor, 'billing.quote.offer', ref.path, { quoteVersion: quote.version });
    return { success: true, idempotent: false };
  });
}

async function withdrawCommercialQuote(db, request) {
  const actor = await platformActor(db, request, 'plans.manage');
  const intentId = cleanText(request.data?.intentId, 'Solicitud', 1, 120);
  const requestId = requestUuid(request.data?.requestId);
  const ref = db.doc(`platformCommercialIntents/${intentId}`);
  const op = ref.collection('quoteWithdrawOperations').doc(requestKey(actor, 'quote.withdraw', requestId));
  const fingerprint = digest(intentId);
  return db.runTransaction(async tx => {
    const [intent, operation] = await Promise.all([tx.get(ref), tx.get(op)]);
    if (!intent.exists) throw new HttpsError('not-found', 'Solicitud no encontrada.');
    if (operation.exists) {
      if (operation.data().fingerprint !== fingerprint) throw new HttpsError('already-exists', 'El identificador de retiro ya se usó con otros datos.');
      return { success: true, idempotent: true };
    }
    const quote = intent.data().quote;
    if (intent.data().acceptance || intent.data().contractId || !quote || quote.status !== 'offered') {
      throw new HttpsError('failed-precondition', 'Solo se puede retirar una oferta todavía no aceptada ni contratada.');
    }
    const now = FieldValue.serverTimestamp();
    tx.update(ref, { quote: { ...quote, status: 'withdrawn', withdrawnBy: actor.uid, withdrawnAt: now }, updatedAt: now });
    tx.create(op, { fingerprint, quoteVersion: quote.version, createdAt: now });
    audit(db, tx, actor, 'billing.quote.withdraw', ref.path, { quoteVersion: quote.version });
    return { success: true, idempotent: false };
  });
}

async function recordCommercialAcceptance(db, request) {
  const actor = await platformActor(db, request, 'plans.manage');
  const intentId = cleanText(request.data?.intentId, 'Solicitud', 1, 120);
  const requestId = requestUuid(request.data?.requestId);
  const channel = request.data?.channel;
  if (!['whatsapp', 'email', 'signed_document', 'in_person'].includes(channel)) throw new HttpsError('invalid-argument', 'Canal de aceptación no válido.');
  const reference = cleanText(request.data?.reference, 'Referencia de aceptación', 4, 300);
  const ref = db.doc(`platformCommercialIntents/${intentId}`);
  const op = ref.collection('acceptanceOperations').doc(requestKey(actor, 'acceptance.record', requestId));
  const fingerprint = digest(JSON.stringify({ intentId, channel, reference }));
  return db.runTransaction(async tx => {
    const [intent, operation] = await Promise.all([tx.get(ref), tx.get(op)]);
    if (!intent.exists) throw new HttpsError('not-found', 'Solicitud no encontrada.');
    if (operation.exists) {
      if (operation.data().fingerprint !== fingerprint) throw new HttpsError('already-exists', 'El identificador de aceptación ya se utilizó con otros datos.');
      return { success: true, idempotent: true };
    }
    const data = intent.data();
    if (!data.quote || data.quote.status !== 'offered' || data.acceptance) throw new HttpsError('failed-precondition', 'Solo se puede registrar una aceptación para una cotización ofrecida sin contrato previo.');
    const acceptance = { quoteVersion: data.quote.version, channel, reference, recordedBy: actor.uid, recordedAt: FieldValue.serverTimestamp() };
    tx.update(ref, { acceptance, updatedAt: FieldValue.serverTimestamp() });
    tx.create(op, { fingerprint, createdAt: FieldValue.serverTimestamp() });
    audit(db, tx, actor, 'billing.contract.acceptance.record', ref.path, { channel, quoteVersion: data.quote.version });
    return { success: true, idempotent: false };
  });
}

async function createCommercialContract(db, request) {
  const actor = await platformActor(db, request, 'plans.manage');
  const intentId = cleanText(request.data?.intentId, 'Solicitud', 1, 120);
  const requestId = requestUuid(request.data?.requestId);
  const dueAt = validateDueAt(request.data?.dueAt);
  const ref = db.doc(`platformCommercialIntents/${intentId}`);
  const op = ref.collection('contractOperations').doc(requestKey(actor, 'contract.create', requestId));
  const operationFingerprint = digest(JSON.stringify({ intentId, dueAt: dueAt.toMillis() }));
  return db.runTransaction(async tx => {
    const [intentSnap, operationSnap] = await Promise.all([tx.get(ref), tx.get(op)]);
    if (!intentSnap.exists) throw new HttpsError('not-found', 'Solicitud no encontrada.');
    if (operationSnap.exists) {
      if (operationSnap.data().fingerprint !== operationFingerprint) throw new HttpsError('already-exists', 'El identificador de contrato ya se utilizó con otros datos.');
      return { success: true, contractId: operationSnap.data().contractId, idempotent: true };
    }
    const intent = intentSnap.data();
    if (!intent.quote || !Number.isSafeInteger(intent.quote.initialDueMinor) || !Number.isSafeInteger(intent.quote.recurringMinor)) {
      throw new HttpsError('failed-precondition', 'La solicitud no tiene una cotización válida para contratar.');
    }
    if (intent.contractId) throw new HttpsError('already-exists', 'La solicitud ya tiene un contrato asociado.');
    if (!isTemplateProvisioningAvailable(intent.businessType)) throw new HttpsError('failed-precondition', 'No se puede contratar esta plantilla hasta habilitar y probar su aprovisionamiento.');
    if (intent.quote.initialDueMinor <= 0 || intent.quote.recurringMinor <= 0) throw new HttpsError('failed-precondition', 'No se emiten contratos sin importe inicial y recurrente cobrable.');
    if (!intent.acceptance || intent.acceptance.quoteVersion !== intent.quote?.version || intent.quote?.status !== 'offered') {
      throw new HttpsError('failed-precondition', 'Registra la aceptación de la cotización vigente antes de crear el contrato.');
    }
    const contractId = `ct_${digest(`${intentId}:${intent.quote.version}`).slice(0, 40)}`;
    const contractRef = db.doc(`platformContracts/${contractId}`);
    const chargeId = `ch_${digest(`${contractId}:initial`).slice(0, 40)}`;
    const chargeRef = db.doc(`platformBillingCharges/${chargeId}`);
    const subscriptionRef = db.doc(`platformSubscriptions/${contractId}`);
    const [contractSnap, chargeSnap, subscriptionSnap] = await Promise.all([tx.get(contractRef), tx.get(chargeRef), tx.get(subscriptionRef)]);
    if (contractSnap.exists || chargeSnap.exists || subscriptionSnap.exists) throw new HttpsError('already-exists', 'Se detectó un registro comercial previo; requiere revisión.');
    const now = FieldValue.serverTimestamp();
    const terms = Object.freeze({
      version: intent.quote.version, templateId: intent.templateId, businessType: intent.businessType,
      companyName: intent.companyName, ownerEmail: intent.email, ownerName: intent.contactName,
      plan: intent.planSnapshot || null, extras: intent.quote.extras,
      currency: intent.quote.currency, billingCycle: intent.quote.billingCycle,
      implementationMinor: intent.quote.implementationMinor, monthlyMinor: intent.quote.monthlyMinor,
      annualMinor: intent.quote.annualMinor, discountMinor: intent.quote.discountMinor,
      discountReason: intent.quote.discountReason, initialDueMinor: intent.quote.initialDueMinor,
      recurringMinor: intent.quote.recurringMinor, features: intent.quote.sourcePlanSnapshot?.includedFeatures || [],
      technicalEntitlements: [], acceptance: intent.acceptance,
    });
    tx.create(contractRef, {
      contractId, intentId, customer: { companyName: intent.companyName, email: intent.email, contactName: intent.contactName, phone: intent.contactPhone },
      businessType: intent.businessType, templateId: intent.templateId, status: 'pending_payment', terms,
      initialChargeId: chargeId,
      acceptedAt: intent.acceptance.recordedAt, acceptedBy: intent.acceptance.recordedBy,
      createdBy: actor.uid, createdAt: now, updatedAt: now,
    });
    tx.create(chargeRef, {
      chargeId, contractId, tenantId: null, kind: 'initial', currency: terms.currency,
      amountMinor: terms.initialDueMinor, paidMinor: 0, pendingMinor: 0, status: 'due', dueAt,
      cycle: terms.billingCycle, periodStart: null, periodEnd: null,
      lineItems: [
        { kind: 'implementation', amountMinor: terms.implementationMinor },
        { kind: 'subscription', amountMinor: terms.billingCycle === 'annual' ? terms.annualMinor : terms.monthlyMinor },
        ...terms.extras.map(item => ({ kind: 'extra', extraId: item.id, title: item.title, amountMinor: item.oneTimeMinor + (terms.billingCycle === 'annual' ? item.annualMinor : item.monthlyMinor) })),
        ...(terms.discountMinor ? [{ kind: 'discount', amountMinor: -terms.discountMinor, reason: terms.discountReason }] : []),
      ], createdBy: actor.uid, createdAt: now, updatedAt: now,
    });
    tx.create(subscriptionRef, {
      subscriptionId: contractId, contractId, tenantId: null, status: 'pending',
      planKey: terms.plan?.planId || null, planSnapshot: terms.plan, templateId: terms.templateId,
      recurringMinor: terms.recurringMinor, billingCycle: terms.billingCycle, currency: terms.currency,
      currentPeriodStart: null, currentPeriodEnd: null, nextRenewalAt: null,
      createdAt: now, updatedAt: now,
    });
    tx.update(ref, { contractId, status: 'contracted', updatedAt: now });
    tx.create(op, { contractId, fingerprint: operationFingerprint, createdAt: now });
    audit(db, tx, actor, 'billing.contract.create', contractRef.path, { intentId, chargeId, amountMinor: terms.initialDueMinor });
    return { success: true, contractId, chargeId, idempotent: false };
  });
}

async function recordManualPaymentReference(db, request) {
  const actor = await platformActor(db, request, 'billing.payments.confirm');
  const input = request.data || {};
  const operationId = requestUuid(input.requestId);
  const chargeId = cleanText(input.chargeId, 'Cargo', 1, 120);
  const amountMinor = moneyMinor(input.amount, 'Importe del pago', { allowZero: false });
  const method = input.method;
  if (!['bank_transfer', 'bank_qr'].includes(method)) throw new HttpsError('invalid-argument', 'Método de pago manual no válido.');
  const reference = cleanText(input.bankReference, 'Referencia bancaria', 4, 120).replace(/\s+/g, ' ').toUpperCase();
  const referenceHash = digest(reference);
  const chargeRef = db.doc(`platformBillingCharges/${chargeId}`);
  const paymentId = `pay_${requestKey(actor, 'payment.record', operationId).slice(0, 40)}`;
  const paymentRef = db.doc(`platformBillingPayments/${paymentId}`);
  const claimRef = db.doc(`platformPaymentReferenceClaims/${referenceHash}`);
  const operationRef = db.doc(`platformBillingOperations/${requestKey(actor, 'payment.record', operationId)}`);
  const fingerprint = digest(JSON.stringify({ chargeId, amountMinor, method, referenceHash }));
  return db.runTransaction(async tx => {
    const [chargeSnap, paymentSnap, claimSnap, operationSnap] = await Promise.all([tx.get(chargeRef), tx.get(paymentRef), tx.get(claimRef), tx.get(operationRef)]);
    if (!chargeSnap.exists) throw new HttpsError('not-found', 'Cargo no encontrado.');
    if (operationSnap.exists) {
      if (operationSnap.data().fingerprint !== fingerprint) throw new HttpsError('already-exists', 'El identificador de pago ya se utilizó con otros datos.');
      return { success: true, paymentId: operationSnap.data().paymentId, idempotent: true };
    }
    const charge = chargeSnap.data();
    if (paymentSnap.exists || claimSnap.exists) throw new HttpsError('already-exists', 'La referencia bancaria ya está registrada; revisa el historial antes de reintentar.');
    if (charge.status === 'paid' || charge.status === 'cancelled' || charge.paidMinor + charge.pendingMinor + amountMinor > charge.amountMinor) {
      throw new HttpsError('failed-precondition', 'El importe supera el saldo pendiente del cargo.');
    }
    const now = FieldValue.serverTimestamp();
    tx.create(paymentRef, {
      paymentId, chargeId, contractId: charge.contractId, tenantId: charge.tenantId || null,
      amountMinor, currency: charge.currency, method, bankReference: reference,
      referenceHash, status: 'pending_review', recordedBy: actor.uid,
      recordedAt: now, confirmedAt: null,
    });
    tx.create(claimRef, { paymentId, chargeId, status: 'pending_review', createdAt: now });
    tx.update(chargeRef, { pendingMinor: charge.pendingMinor + amountMinor, status: 'under_review', updatedAt: now });
    tx.create(operationRef, { actorUid: actor.uid, paymentId, fingerprint, createdAt: now });
    audit(db, tx, actor, 'billing.payment.reference.record', paymentRef.path, { chargeId, amountMinor, method });
    return { success: true, paymentId, idempotent: false };
  });
}

async function confirmManualPayment(db, request) {
  const actor = await platformActor(db, request, 'billing.payments.confirm');
  const paymentId = cleanText(request.data?.paymentId, 'Pago', 1, 120);
  const requestId = requestUuid(request.data?.requestId);
  const paymentRef = db.doc(`platformBillingPayments/${paymentId}`);
  const operationRef = db.doc(`platformBillingOperations/${requestKey(actor, 'payment.confirm', requestId)}`);
  const fingerprint = digest(paymentId);
  return db.runTransaction(async tx => {
    const paymentBefore = await tx.get(paymentRef);
    if (!paymentBefore.exists) throw new HttpsError('not-found', 'Pago no encontrado.');
    const data = paymentBefore.data();
    const chargeRef = db.doc(`platformBillingCharges/${data.chargeId}`);
    const contractRef = db.doc(`platformContracts/${data.contractId}`);
    const subscriptionRef = db.doc(`platformSubscriptions/${data.contractId}`);
    const claimRef = db.doc(`platformPaymentReferenceClaims/${data.referenceHash}`);
    const [operation, chargeSnap, contractSnap, subscriptionSnap, claimSnap] = await Promise.all([
      tx.get(operationRef), tx.get(chargeRef), tx.get(contractRef), tx.get(subscriptionRef), tx.get(claimRef),
    ]);
    if (operation.exists) {
      if (operation.data().fingerprint !== fingerprint) throw new HttpsError('already-exists', 'El identificador de confirmación ya se utilizó.');
      return { success: true, idempotent: true, status: operation.data().status };
    }
    if (data.status !== 'pending_review' || !chargeSnap.exists || !contractSnap.exists || !subscriptionSnap.exists || !claimSnap.exists
      || claimSnap.data().paymentId !== paymentId || claimSnap.data().status !== 'pending_review') {
      throw new HttpsError('failed-precondition', 'El pago no está pendiente de verificación o perdió su vínculo de integridad.');
    }
    const charge = chargeSnap.data();
    if (charge.kind === 'initial' && (contractSnap.data().status !== 'pending_payment'
      || contractSnap.data().initialChargeId !== charge.chargeId || subscriptionSnap.data().status !== 'pending')) {
      throw new HttpsError('failed-precondition', 'El cargo inicial no corresponde a un contrato pendiente de pago.');
    }
    if (charge.kind === 'renewal' && !['active', 'overdue', 'suspended', 'cancelled'].includes(subscriptionSnap.data().status)) {
      throw new HttpsError('failed-precondition', 'La suscripción no admite conciliación para este cargo.');
    }
    if (charge.paidMinor + data.amountMinor > charge.amountMinor || charge.pendingMinor < data.amountMinor) {
      throw new HttpsError('failed-precondition', 'El saldo del cargo cambió; revisa el pago antes de confirmarlo.');
    }
    const paidMinor = charge.paidMinor + data.amountMinor;
    const pendingMinor = charge.pendingMinor - data.amountMinor;
    const isPaid = paidMinor === charge.amountMinor;
    const now = FieldValue.serverTimestamp();
    tx.update(paymentRef, { status: 'confirmed', confirmedBy: actor.uid, confirmedAt: now });
    tx.update(claimRef, { status: 'confirmed', confirmedBy: actor.uid, confirmedAt: now });
    tx.update(chargeRef, { paidMinor, pendingMinor, status: isPaid ? 'paid' : pendingMinor ? 'under_review' : 'partial', updatedAt: now });
    if (isPaid && charge.kind === 'initial') {
      tx.update(contractRef, { status: 'ready_for_activation', initialChargePaidAt: now, updatedAt: now });
      tx.update(subscriptionRef, { status: 'pending', updatedAt: now });
    }
    if (isPaid && charge.kind === 'renewal') {
      const subscription = subscriptionSnap.data();
      if (['active', 'overdue'].includes(subscription.status)) {
        const start = charge.periodStart || Timestamp.fromMillis(Math.max(Date.now(), subscription.currentPeriodEnd?.toMillis?.() || Date.now()));
        const end = charge.periodEnd || start;
        const billingAccessUntil = addGracePeriod(end);
        const pendingPlanChange = subscription.pendingPlanChange || null;
        tx.update(subscriptionRef, {
          status: 'active', currentPeriodStart: start, currentPeriodEnd: end, nextRenewalAt: end, billingAccessUntil,
          pendingRenewalChargeId: FieldValue.delete(),
          ...(pendingPlanChange ? {
            planKey: pendingPlanChange.planSnapshot.planId,
            planSnapshot: pendingPlanChange.planSnapshot,
            recurringMinor: pendingPlanChange.recurringMinor,
            billingCycle: pendingPlanChange.billingCycle,
            currency: pendingPlanChange.currency,
            pendingPlanChange: FieldValue.delete(),
          } : {}),
          updatedAt: now,
        });
        if (subscription.tenantId) tx.update(db.doc(`tenants/${subscription.tenantId}`), {
          subscriptionStatus: 'active', status: 'active', billingAccessUntil, updatedAt: now,
          ...(pendingPlanChange ? { planKey: pendingPlanChange.planSnapshot.planId } : {}),
        });
      } else {
        // El ingreso se registra, pero el pago de una suscripción cancelada o suspendida
        // no reactiva el acceso automáticamente.
        tx.update(subscriptionRef, { pendingRenewalChargeId: FieldValue.delete(), updatedAt: now });
      }
    }
    tx.create(operationRef, { actorUid: actor.uid, status: isPaid ? 'confirmed' : 'partial', paymentId, fingerprint, createdAt: now });
    audit(db, tx, actor, 'billing.payment.confirm', paymentRef.path, { chargeId: data.chargeId, amountMinor: data.amountMinor, chargePaidMinor: paidMinor });
    return { success: true, status: isPaid ? 'confirmed' : 'partial', idempotent: false };
  });
}

async function rejectManualPayment(db, request) {
  const actor = await platformActor(db, request, 'billing.payments.confirm');
  const paymentId = cleanText(request.data?.paymentId, 'Pago', 1, 120);
  const requestId = requestUuid(request.data?.requestId);
  const reason = cleanText(request.data?.reason, 'Motivo de rechazo', 8, 500);
  const paymentRef = db.doc(`platformBillingPayments/${paymentId}`);
  const op = db.doc(`platformBillingOperations/${requestKey(actor, 'payment.reject', requestId)}`);
  const fingerprint = digest(JSON.stringify({ paymentId, reason }));
  return db.runTransaction(async tx => {
    const paymentSnap = await tx.get(paymentRef);
    if (!paymentSnap.exists) throw new HttpsError('not-found', 'Pago no encontrado.');
    const payment = paymentSnap.data();
    const chargeRef = db.doc(`platformBillingCharges/${payment.chargeId}`);
    const claimRef = db.doc(`platformPaymentReferenceClaims/${payment.referenceHash}`);
    const [operation, chargeSnap, claimSnap] = await Promise.all([tx.get(op), tx.get(chargeRef), tx.get(claimRef)]);
    if (operation.exists) {
      if (operation.data().fingerprint !== fingerprint) throw new HttpsError('already-exists', 'El identificador de rechazo ya se utilizó con otros datos.');
      return { success: true, idempotent: true };
    }
    if (payment.status !== 'pending_review' || !chargeSnap.exists || !claimSnap.exists || claimSnap.data().paymentId !== paymentId) throw new HttpsError('failed-precondition', 'El pago no puede rechazarse en su estado actual.');
    const charge = chargeSnap.data();
    const pendingMinor = Math.max(0, charge.pendingMinor - payment.amountMinor);
    const now = FieldValue.serverTimestamp();
    tx.update(paymentRef, { status: 'rejected', rejectedBy: actor.uid, rejectionReason: reason, rejectedAt: now });
    tx.update(claimRef, { status: 'rejected', rejectedBy: actor.uid, rejectedAt: now });
    tx.update(chargeRef, { pendingMinor, status: pendingMinor ? 'under_review' : charge.paidMinor ? 'partial' : 'due', updatedAt: now });
    tx.create(op, { actorUid: actor.uid, fingerprint, createdAt: now });
    audit(db, tx, actor, 'billing.payment.reject', paymentRef.path, { chargeId: payment.chargeId, amountMinor: payment.amountMinor, reason });
    return { success: true, idempotent: false };
  });
}

async function createRenewalCharge(db, request) {
  const actor = await platformActor(db, request, 'plans.manage');
  const contractId = cleanText(request.data?.contractId, 'Contrato', 1, 120);
  const requestId = requestUuid(request.data?.requestId);
  const dueAt = validateDueAt(request.data?.dueAt);
  const contractRef = db.doc(`platformContracts/${contractId}`);
  const subscriptionRef = db.doc(`platformSubscriptions/${contractId}`);
  const opRef = db.doc(`platformBillingOperations/${requestKey(actor, 'renewal.create', requestId)}`);
  const fingerprint = digest(JSON.stringify({ contractId, dueAt: dueAt.toMillis() }));
  return db.runTransaction(async tx => {
    const [contract, subscription, operation] = await Promise.all([tx.get(contractRef), tx.get(subscriptionRef), tx.get(opRef)]);
    if (!contract.exists || !subscription.exists) throw new HttpsError('not-found', 'Suscripción no encontrada.');
    if (operation.exists) {
      if (operation.data().fingerprint !== fingerprint) throw new HttpsError('already-exists', 'El identificador de renovación ya se utilizó con otros datos.');
      return { success: true, chargeId: operation.data().chargeId, idempotent: true };
    }
    const current = subscription.data();
    if (!['active', 'overdue'].includes(current.status) || !current.tenantId) throw new HttpsError('failed-precondition', 'Solo una suscripción activa o vencida con empresa puede renovarse.');
    if (current.currentPeriodEnd?.toMillis?.() > Date.now() + 31 * 86_400_000) throw new HttpsError('failed-precondition', 'La renovación puede emitirse dentro de los 30 días previos al vencimiento.');
    const pendingPlanChange = current.pendingPlanChange || null;
    const amountMinor = pendingPlanChange?.recurringMinor || current.recurringMinor || contract.data().terms.recurringMinor;
    if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0) throw new HttpsError('failed-precondition', 'El contrato no tiene un importe recurrente válido.');
    if (current.pendingRenewalChargeId) {
      const existingChargeRef = db.doc(`platformBillingCharges/${current.pendingRenewalChargeId}`);
      const existingCharge = await tx.get(existingChargeRef);
      if (existingCharge.exists && ['due', 'partial', 'under_review'].includes(existingCharge.data().status)) {
        tx.create(opRef, { actorUid: actor.uid, chargeId: existingCharge.id, fingerprint, createdAt: FieldValue.serverTimestamp() });
        return { success: true, chargeId: existingCharge.id, idempotent: false, reusedPendingCharge: true };
      }
    }
    const chargeId = `ch_${requestKey(actor, 'renewal', requestId).slice(0, 40)}`;
    const chargeRef = db.doc(`platformBillingCharges/${chargeId}`);
    const existing = await tx.get(chargeRef);
    if (existing.exists) throw new HttpsError('already-exists', 'Ya existe el cargo para esta operación.');
    const startMillis = Math.max(Date.now(), current.currentPeriodEnd?.toMillis?.() || Date.now());
    const periodStart = Timestamp.fromMillis(startMillis);
    const endDate = new Date(startMillis);
    endDate.setUTCMonth(endDate.getUTCMonth() + ((pendingPlanChange?.billingCycle || current.billingCycle) === 'annual' ? 12 : 1));
    const periodEnd = Timestamp.fromDate(endDate);
    const chargeCycle = pendingPlanChange?.billingCycle || current.billingCycle;
    const chargeCurrency = pendingPlanChange?.currency || current.currency;
    const now = FieldValue.serverTimestamp();
    tx.create(chargeRef, {
      chargeId, contractId, tenantId: current.tenantId, kind: 'renewal', currency: chargeCurrency,
      amountMinor, paidMinor: 0, pendingMinor: 0, status: 'due', dueAt,
      cycle: chargeCycle, periodStart, periodEnd, planSnapshot: pendingPlanChange?.planSnapshot || current.planSnapshot || null,
      lineItems: [{ kind: 'subscription', amountMinor, planId: pendingPlanChange?.planSnapshot?.planId || current.planKey || null }],
      createdBy: actor.uid, createdAt: now, updatedAt: now,
    });
    tx.update(subscriptionRef, { pendingRenewalChargeId: chargeId, updatedAt: now });
    tx.create(opRef, { actorUid: actor.uid, chargeId, fingerprint, createdAt: now });
    audit(db, tx, actor, 'billing.renewal.charge.create', chargeRef.path, { contractId, amountMinor });
    return { success: true, chargeId, idempotent: false };
  });
}

async function listPublishedBillingPlans(db, request) {
  await platformActor(db, request, 'plans.manage');
  const snapshot = await db.collection('platformPlans').where('status', '==', 'published').limit(100).get();
  return { plans: snapshot.docs.flatMap(document => {
    const plan = document.data();
    if (plan.priceApproval !== 'approved' || plan.planKind === 'free'
      || !Array.isArray(plan.technicalEntitlements) || plan.technicalEntitlements.length !== 0) return [];
    try {
      const monthlyMinor = moneyMinor(Number(plan.monthlyPriceUSD).toFixed(2), 'Mensualidad', { allowZero: false });
      const annualMinor = moneyMinor(Number(plan.annualPriceUSD).toFixed(2), 'Anualidad', { allowZero: false });
      return [{ id: document.id, name: cleanText(plan.name, 'Plan', 1, 120), templateId: plan.templateId,
        version: Number(plan.commercialVersion) || 1, currency: currencyCode(plan.currency), monthlyMinor, annualMinor,
        includedFeatures: Array.isArray(plan.includedFeatures) ? plan.includedFeatures.filter(value => typeof value === 'string').slice(0, 50) : [] }];
    } catch { return []; }
  }) };
}

async function requestSubscriptionPlanChange(db, request) {
  const actor = await platformActor(db, request, 'plans.manage');
  const contractId = cleanText(request.data?.contractId, 'Contrato', 1, 120);
  const planId = cleanText(request.data?.planId, 'Plan', 1, 120);
  const cycle = request.data?.billingCycle;
  if (!['monthly', 'annual'].includes(cycle)) throw new HttpsError('invalid-argument', 'Selecciona el nuevo ciclo mensual o anual.');
  const requestId = requestUuid(request.data?.requestId);
  const contractRef = db.doc(`platformContracts/${contractId}`);
  const subscriptionRef = db.doc(`platformSubscriptions/${contractId}`);
  const planRef = db.doc(`platformPlans/${planId}`);
  const operationRef = db.doc(`platformBillingOperations/${requestKey(actor, 'subscription.plan-change', requestId)}`);
  return db.runTransaction(async tx => {
    const [contractSnap, subscriptionSnap, planSnap, operationSnap] = await Promise.all([
      tx.get(contractRef), tx.get(subscriptionRef), tx.get(planRef), tx.get(operationRef),
    ]);
    if (!contractSnap.exists || !subscriptionSnap.exists) throw new HttpsError('not-found', 'Suscripción no encontrada.');
    if (!planSnap.exists) throw new HttpsError('not-found', 'Plan publicado no encontrado.');
    const contract = contractSnap.data();
    const subscription = subscriptionSnap.data();
    const plan = planSnap.data();
    const monthlyMinor = moneyMinor(Number(plan.monthlyPriceUSD).toFixed(2), 'Mensualidad', { allowZero: false });
    const annualMinor = moneyMinor(Number(plan.annualPriceUSD).toFixed(2), 'Anualidad', { allowZero: false });
    const planSnapshot = {
      planId, name: cleanText(plan.name, 'Plan', 1, 120), version: Number(plan.commercialVersion) || 1,
      templateId: plan.templateId, currency: currencyCode(plan.currency), monthlyMinor, annualMinor,
      includedFeatures: Array.isArray(plan.includedFeatures) ? plan.includedFeatures.filter(value => typeof value === 'string').slice(0, 50) : [],
      technicalEntitlements: [],
    };
    const extrasRecurring = (contract.terms?.extras || []).reduce((sum, extra) => sum + (cycle === 'annual' ? extra.annualMinor : extra.monthlyMinor), 0);
    const recurringMinor = (cycle === 'annual' ? annualMinor : monthlyMinor) + extrasRecurring;
    const fingerprint = digest(JSON.stringify({ contractId, planId, version: planSnapshot.version, cycle }));
    if (operationSnap.exists) {
      if (operationSnap.data().fingerprint !== fingerprint) throw new HttpsError('already-exists', 'El identificador de cambio de plan ya se usó con otros datos.');
      return { success: true, idempotent: true, effectiveAt: operationSnap.data().effectiveAt || null };
    }
    if (contract.status !== 'active' || subscription.status !== 'active' || !subscription.tenantId) throw new HttpsError('failed-precondition', 'Solo una suscripción activa puede programar un cambio de plan.');
    if (subscription.pendingRenewalChargeId) throw new HttpsError('failed-precondition', 'Ya existe un cargo de renovación pendiente; concílialo antes de cambiar el plan.');
    if (plan.status !== 'published' || plan.priceApproval !== 'approved' || plan.planKind === 'free'
      || plan.templateId !== contract.templateId || !Array.isArray(plan.technicalEntitlements) || plan.technicalEntitlements.length !== 0
      || !Number.isSafeInteger(recurringMinor) || recurringMinor <= 0) {
      throw new HttpsError('failed-precondition', 'El plan no es una oferta pagada aprobada para la plantilla contratada.');
    }
    if (planSnapshot.currency !== contract.terms.currency) throw new HttpsError('failed-precondition', 'El cambio de plan requiere conservar la moneda del contrato.');
    const effectiveAt = subscription.currentPeriodEnd || null;
    const now = FieldValue.serverTimestamp();
    tx.update(subscriptionRef, { pendingPlanChange: { planSnapshot, billingCycle: cycle, currency: planSnapshot.currency, recurringMinor, effectiveAt, requestedBy: actor.uid, requestedAt: now }, updatedAt: now });
    tx.create(operationRef, { actorUid: actor.uid, fingerprint, contractId, planId, planVersion: planSnapshot.version, effectiveAt, createdAt: now });
    audit(db, tx, actor, 'billing.subscription.plan_change.schedule', subscriptionRef.path, { planId, planVersion: planSnapshot.version, billingCycle: cycle });
    return { success: true, idempotent: false, effectiveAt };
  });
}

async function changeSubscriptionStatus(db, request) {
  const actor = await platformActor(db, request, 'plans.manage');
  const contractId = cleanText(request.data?.contractId, 'Contrato', 1, 120);
  const requestId = requestUuid(request.data?.requestId);
  const status = request.data?.status;
  if (!['suspended', 'cancelled', 'overdue'].includes(status)) throw new HttpsError('invalid-argument', 'Estado de suscripción no válido.');
  const reason = cleanText(request.data?.reason, 'Motivo', 8, 500);
  const ref = db.doc(`platformSubscriptions/${contractId}`);
  const contractRef = db.doc(`platformContracts/${contractId}`);
  const op = db.doc(`platformBillingOperations/${requestKey(actor, 'subscription.status', requestId)}`);
  const fingerprint = digest(JSON.stringify({ contractId, status, reason }));
  return db.runTransaction(async tx => {
    const [subscription, contract, operation] = await Promise.all([tx.get(ref), tx.get(contractRef), tx.get(op)]);
    if (!subscription.exists || !contract.exists) throw new HttpsError('not-found', 'Suscripción no encontrada.');
    if (operation.exists) {
      if (operation.data().fingerprint !== fingerprint) throw new HttpsError('already-exists', 'El identificador de estado ya se utilizó con otros datos.');
      return { success: true, idempotent: true };
    }
    const oldStatus = subscription.data().status;
    if (oldStatus === 'cancelled' || status === oldStatus) throw new HttpsError('failed-precondition', 'La suscripción no admite ese cambio de estado.');
    const now = FieldValue.serverTimestamp();
    tx.update(ref, { status, statusChangedBy: actor.uid, statusReason: reason, updatedAt: now });
    tx.update(contractRef, { subscriptionStatus: status, updatedAt: now });
    if (subscription.data().tenantId) {
      tx.update(db.doc(`tenants/${subscription.data().tenantId}`), {
        status: status === 'cancelled' ? 'cancelled' : status === 'suspended' ? 'suspended' : 'active',
        subscriptionStatus: status, updatedAt: now,
      });
    }
    tx.create(op, { actorUid: actor.uid, fingerprint, createdAt: now });
    audit(db, tx, actor, 'billing.subscription.status.change', ref.path, { previousStatus: oldStatus, status, reason });
    return { success: true, idempotent: false };
  });
}

async function listBillingRecords(db, request) {
  const actor = await platformActor(db, request);
  if (!actor.permissions.some(permission => ['plans.manage', 'finance.read', 'billing.payments.confirm'].includes(permission))) throw new HttpsError('permission-denied', 'El operador no puede consultar facturación.');
  const kind = request.data?.kind;
  const collections = { contracts: 'platformContracts', charges: 'platformBillingCharges', payments: 'platformBillingPayments', subscriptions: 'platformSubscriptions' };
  if (!Object.hasOwn(collections, kind)) throw new HttpsError('invalid-argument', 'Tipo de registro inválido.');
  const limit = Number(request.data?.limit ?? 50);
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new HttpsError('invalid-argument', 'Límite inválido.');
  let query = db.collection(collections[kind]).orderBy('createdAt', 'desc').limit(limit);
  if (request.data?.status) query = query.where('status', '==', cleanText(request.data.status, 'Estado', 1, 40));
  const snapshot = await query.get();
  const now = Date.now();
  return { records: snapshot.docs.map(doc => {
    const record = { id: doc.id, ...doc.data() };
    if (kind !== 'subscriptions') return record;
    const currentPeriodEnd = record.currentPeriodEnd?.toMillis?.();
    const billingAccessUntil = record.billingAccessUntil?.toMillis?.();
    const effectiveStatus = ['suspended', 'cancelled', 'pending'].includes(record.status) ? record.status
      : billingAccessUntil == null || billingAccessUntil <= now ? 'expired'
        : currentPeriodEnd != null && currentPeriodEnd <= now ? 'grace'
          : record.status;
    return { ...record, effectiveStatus };
  }) };
}

module.exports = {
  BILLING_STATUSES, BILLING_GRACE_PERIOD_DAYS, moneyMinor,
  createManualCommercialIntent, saveCommercialQuote, offerCommercialQuote, withdrawCommercialQuote, recordCommercialAcceptance,
  createCommercialContract, recordManualPaymentReference, confirmManualPayment, rejectManualPayment,
  createRenewalCharge, requestSubscriptionPlanChange, listPublishedBillingPlans, changeSubscriptionStatus, listBillingRecords,
};
