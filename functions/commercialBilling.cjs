const { createHash } = require('node:crypto');
const { HttpsError } = require('firebase-functions/v2/https');
const { FieldPath, FieldValue, Timestamp } = require('firebase-admin/firestore');
const { platformActor, cleanText, auditPlatform } = require('./platformAuthorization.cjs');
const { authenticated } = require('./authorization.cjs');
const { PUBLIC_TEMPLATES, isTemplateProvisioningAvailable } = require('./generated/publicTemplates.js');
const {
  BILLING_GRACE_PERIOD_DAYS, billingAccessUntil: billingAccessUntilMillis,
  normalizePrepaidPeriods, addBillingPeriods,
  renewalPeriodStart, effectiveBillingStatus, daysUntilBillingDate,
} = require('./billingPolicy.cjs');
const { normalizeCapabilitiesV1, normalizeCapabilityAdjustments, applyCapabilityAdjustments } = require('./commercialCapabilities.cjs');

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
function prepaidPeriods(cycle, value = 1) {
  try { return normalizePrepaidPeriods(cycle, value); }
  catch (error) { throw new HttpsError('invalid-argument', error.message); }
}
function validatedChargeBalances(charge) {
  const { amountMinor, paidMinor, pendingMinor } = charge || {};
  if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0
    || !Number.isSafeInteger(paidMinor) || paidMinor < 0
    || !Number.isSafeInteger(pendingMinor) || pendingMinor < 0
    || paidMinor + pendingMinor > amountMinor) {
    throw new HttpsError('failed-precondition', 'El saldo del cargo tiene valores inconsistentes; requiere revisión manual.');
  }
  const expectedStatus = pendingMinor > 0 ? 'under_review'
    : paidMinor === amountMinor ? 'paid'
      : paidMinor > 0 ? 'partial' : 'due';
  if (charge.status !== expectedStatus && charge.status !== 'cancelled') {
    throw new HttpsError('failed-precondition', 'El estado del cargo no coincide con sus saldos; requiere revisión manual.');
  }
  return { amountMinor, paidMinor, pendingMinor };
}
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
  if (actor.operator) {
    auditPlatform(db, tx, actor, action, { tenantId: actor.tenantId || null, resource, reason: 'Operación de facturación comercial manual.', metadata });
    return;
  }
  tx.create(db.collection('platformAuditLogs').doc(), {
    operatorUid: actor.uid, operatorRole: 'tenant_owner', tenantId: actor.tenantId,
    action: cleanText(action, 'Acción', 1, 120), resource: cleanText(resource, 'Recurso', 1, 160),
    reason: 'El propietario registró una referencia de pago; no confirma el ingreso.', metadata,
    createdAt: FieldValue.serverTimestamp(),
  });
}

async function tenantBillingActor(db, request) {
  const uid = authenticated(request);
  const tenantId = cleanText(request.data?.tenantId, 'Empresa', 1, 128);
  const [tenantSnap, memberSnap, platformSnap] = await Promise.all([
    db.doc(`tenants/${tenantId}`).get(), db.doc(`tenants/${tenantId}/members/${uid}`).get(),
    db.doc(`platformOperators/${uid}`).get(),
  ]);
  if (platformSnap.data()?.active === true) throw new HttpsError('permission-denied', 'Utiliza el acceso de Administración de PACHAX.');
  const tenant = tenantSnap.data(), membership = memberSnap.data();
  if (!tenantSnap.exists || !memberSnap.exists || membership?.status !== 'active' || membership?.roleId !== 'owner') {
    throw new HttpsError('permission-denied', 'Solo el propietario activo puede consultar o regularizar la suscripción de esta empresa.');
  }
  if (tenant?.billingEnforcement !== true || typeof tenant.billingContractId !== 'string') {
    return { uid, tenantId, tenant, membership, contractId: null, actorType: 'tenant' };
  }
  return { uid, tenantId, tenant, membership, contractId: tenant.billingContractId, actorType: 'tenant' };
}

function sanitizeManualPaymentMethods(value = {}) {
  const qrImageUrl = typeof value.qrImageUrl === 'string' ? value.qrImageUrl.trim() : '';
  if (value.qrEnabled === true && !qrImageUrl) throw new HttpsError('invalid-argument', 'Agrega el QR oficial antes de habilitar pagos QR.');
  if (qrImageUrl) {
    let parsed;
    try { parsed = new URL(qrImageUrl); } catch { throw new HttpsError('invalid-argument', 'La URL del QR debe ser válida.'); }
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password) throw new HttpsError('invalid-argument', 'El QR debe usar una URL HTTPS sin credenciales.');
  }
  const whatsappNumber = typeof value.whatsappNumber === 'string' ? value.whatsappNumber.replace(/[^+\d]/g, '').trim() : '';
  if (whatsappNumber && !/^\+?[1-9]\d{7,14}$/.test(whatsappNumber)) throw new HttpsError('invalid-argument', 'El WhatsApp de cobranza debe usar formato internacional.');
  const methods = {
    qrEnabled: value.qrEnabled === true && Boolean(qrImageUrl),
    transferEnabled: value.transferEnabled === true,
    qrImageUrl,
    bankName: value.bankName ? cleanText(value.bankName, 'Banco', 2, 100) : '',
    accountHolder: value.accountHolder ? cleanText(value.accountHolder, 'Titular', 2, 120) : '',
    accountIdentifier: value.accountIdentifier ? cleanText(value.accountIdentifier, 'Dato de transferencia', 3, 120) : '',
    instructions: value.instructions ? cleanText(value.instructions, 'Instrucciones de pago', 2, 1000) : '',
    whatsappNumber,
    available: value.available === true,
  };
  if (methods.transferEnabled && (!methods.bankName || !methods.accountHolder || !methods.accountIdentifier)) {
    throw new HttpsError('invalid-argument', 'Completa banco, titular e identificador antes de habilitar transferencias.');
  }
  if (methods.available && !methods.qrEnabled && !methods.transferEnabled) throw new HttpsError('invalid-argument', 'Habilita al menos un método antes de activar la cobranza.');
  return methods;
}

async function getManualPaymentMethods(db, request) {
  const actor = await platformActor(db, request);
  if (!['platform_owner', 'platform_finance'].includes(actor.operator.role)) throw new HttpsError('permission-denied', 'El operador no puede consultar la configuración de cobros.');
  const snapshot = await db.doc('platformBillingConfig/manualMethods').get();
  return { methods: snapshot.exists ? snapshot.data() : { available: false, qrEnabled: false, transferEnabled: false, qrImageUrl: '', bankName: '', accountHolder: '', accountIdentifier: '', instructions: '', whatsappNumber: '' } };
}

async function saveManualPaymentMethods(db, request) {
  const actor = await platformActor(db, request);
  if (actor.operator.role !== 'platform_owner') throw new HttpsError('permission-denied', 'Solo Platform Owner puede cambiar los métodos oficiales de cobro.');
  const requestId = requestUuid(request.data?.requestId);
  const methods = sanitizeManualPaymentMethods(request.data?.methods || {});
  const fingerprint = digest(JSON.stringify(methods));
  const configRef = db.doc('platformBillingConfig/manualMethods');
  const opRef = db.doc(`platformBillingOperations/${requestKey(actor, 'payment-methods.save', requestId)}`);
  return db.runTransaction(async tx => {
    const [config, operation] = await Promise.all([tx.get(configRef), tx.get(opRef)]);
    if (operation.exists) {
      if (operation.data().fingerprint !== fingerprint) throw new HttpsError('already-exists', 'El identificador ya se utilizó con otra configuración.');
      return { success: true, idempotent: true, version: operation.data().version };
    }
    const version = (Number(config.data()?.version) || 0) + 1;
    const now = FieldValue.serverTimestamp();
    tx.set(configRef, { ...methods, version, updatedBy: actor.uid, updatedAt: now });
    tx.create(opRef, { fingerprint, version, actorUid: actor.uid, createdAt: now });
    audit(db, tx, actor, 'billing.payment_methods.update', configRef.path, { version, available: methods.available, qrEnabled: methods.qrEnabled, transferEnabled: methods.transferEnabled });
    return { success: true, version, idempotent: false };
  });
}

async function getTenantBillingOverview(db, request) {
  const actor = await tenantBillingActor(db, request);
  const methodsPromise = db.doc('platformBillingConfig/manualMethods').get();
  if (!actor.contractId) {
    const methods = await methodsPromise;
    return { enrolled: false, status: 'not_enrolled', subscription: null, charges: [], payments: [], paymentMethods: methods.exists && methods.data()?.available === true ? sanitizeClientPaymentMethods(methods.data()) : null };
  }
  const contractRef = db.doc(`platformContracts/${actor.contractId}`);
  const subscriptionRef = db.doc(`platformSubscriptions/${actor.contractId}`);
  const [contractSnap, subscriptionSnap, chargesSnap, paymentsSnap, methodsSnap] = await Promise.all([
    contractRef.get(), subscriptionRef.get(),
    db.collection('platformBillingCharges').where('contractId', '==', actor.contractId).orderBy('createdAt', 'desc').limit(50).get(),
    db.collection('platformBillingPayments').where('contractId', '==', actor.contractId).orderBy('recordedAt', 'desc').limit(100).get(),
    methodsPromise,
  ]);
  if (!contractSnap.exists || !subscriptionSnap.exists || subscriptionSnap.data()?.tenantId !== actor.tenantId) {
    throw new HttpsError('failed-precondition', 'La suscripción de esta empresa requiere revisión por PACHAX.');
  }
  const contract = contractSnap.data(), subscription = subscriptionSnap.data();
  const status = effectiveBillingStatus(subscription);
  const paymentMethods = methodsSnap.exists && methodsSnap.data()?.available === true ? sanitizeClientPaymentMethods(methodsSnap.data()) : null;
  const charges = chargesSnap.docs.map(document => {
    const charge = document.data();
    return { id: document.id, kind: charge.kind, currency: charge.currency, amountMinor: charge.amountMinor,
      paidMinor: charge.paidMinor, pendingMinor: charge.pendingMinor, status: charge.status, dueAt: charge.dueAt,
      cycle: charge.cycle, periodCount: charge.periodCount || 1, monthsCovered: charge.monthsCovered || (charge.cycle === 'annual' ? 12 : 1), createdAt: charge.createdAt };
  });
  const payments = paymentsSnap.docs.map(document => {
    const payment = document.data();
    return { id: document.id, chargeId: payment.chargeId, amountMinor: payment.amountMinor, currency: payment.currency,
      method: payment.method, bankReference: payment.bankReference, status: payment.status,
      rejectionReason: payment.rejectionReason || null, recordedAt: payment.recordedAt, confirmedAt: payment.confirmedAt };
  });
  const currentPeriodEnd = subscription.currentPeriodEnd?.toDate?.() || null;
  return {
    enrolled: true, status, daysRemaining: daysUntilBillingDate(currentPeriodEnd),
    subscription: { contractId: actor.contractId, tenantId: actor.tenantId, templateId: contract.templateId,
      companyName: actor.tenant.name, planName: subscription.planSnapshot?.name || contract.terms?.plan?.name || 'Acuerdo personalizado',
      currency: subscription.currency || contract.terms?.currency, recurringMinor: subscription.recurringMinor || contract.terms?.recurringMinor,
      billingCycle: subscription.billingCycle || contract.terms?.billingCycle, currentPeriodStart: subscription.currentPeriodStart || null,
      currentPeriodEnd: subscription.currentPeriodEnd || null, nextRenewalAt: subscription.nextRenewalAt || subscription.currentPeriodEnd || null,
      billingAccessUntil: subscription.billingAccessUntil || null, effectiveStatus: status,
      monthsCovered: subscription.monthsCovered || contract.terms?.monthsCovered || (subscription.billingCycle === 'annual' ? 12 : 1),
      gracePeriodDays: BILLING_GRACE_PERIOD_DAYS },
    charges, payments, paymentMethods,
    contactUrl: paymentMethods?.whatsappNumber ? `https://wa.me/${paymentMethods.whatsappNumber.replace('+', '')}` : null,
  };
}

function sanitizeClientPaymentMethods(methods) {
  return {
    qrEnabled: methods.qrEnabled === true, qrImageUrl: methods.qrEnabled === true ? methods.qrImageUrl : '',
    transferEnabled: methods.transferEnabled === true, bankName: methods.transferEnabled === true ? methods.bankName : '',
    accountHolder: methods.transferEnabled === true ? methods.accountHolder : '',
    accountIdentifier: methods.transferEnabled === true ? methods.accountIdentifier : '',
    instructions: methods.instructions || '', whatsappNumber: methods.whatsappNumber || '',
  };
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
        capabilitiesV1: normalizeCapabilitiesV1(plan.capabilitiesV1, template.businessType),
      };
    }
    if (extraSnaps.some(snap => !snap.exists || snap.data().status !== 'published'
      || (snap.data().applicableTemplates !== 'all' && !snap.data().applicableTemplates?.includes(template.id)))) {
      throw new HttpsError('failed-precondition', 'Uno o más extras no están publicados para esta plantilla.');
    }
    const requestedExtraSnapshots = extraSnaps.map((snap, index) => ({
      id: extraIds[index], title: cleanText(snap.data().title, 'Extra', 1, 120),
      pricingType: snap.data().pricingType, commercialVersion: Number(snap.data().commercialVersion) || 1,
      capabilityAdjustments: normalizeCapabilityAdjustments(snap.data().capabilityAdjustments),
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
  const periodCount = prepaidPeriods(cycle, input.periodCount ?? 1);
  const monthsCovered = periodCount * (cycle === 'annual' ? 12 : 1);
  const implementationMinor = moneyMinor(input.implementation, 'Implementación');
  const monthlyMinor = moneyMinor(input.monthly, 'Mensualidad');
  const annualInput = cycle === 'monthly' && (input.annual == null || (typeof input.annual === 'string' && input.annual.trim() === ''))
    ? '0'
    : input.annual;
  const annualMinor = moneyMinor(annualInput, 'Anualidad');
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
  const fingerprint = digest(JSON.stringify({
    intentId, currency, cycle, periodCount, implementationMinor, monthlyMinor, annualMinor, discountMinor, discountReason,
    extras: normalized, capabilitiesV1: input.capabilitiesV1 || null,
  }));
  const intentRef = db.doc(`platformCommercialIntents/${intentId}`);
  const operationRef = intentRef.collection('quoteOperations').doc(requestKey(actor, 'quote.save', operationId));
  return db.runTransaction(async tx => {
    const [intentSnap, operationSnap, ...extraSnaps] = await Promise.all([
      tx.get(intentRef), tx.get(operationRef), ...normalized.map(item => tx.get(db.doc(`platformExtras/${item.id}`))),
    ]);
    if (!intentSnap.exists) throw new HttpsError('not-found', 'Solicitud comercial no encontrada.');
    const intent = intentSnap.data();
    if (intent.contractId || intent.acceptance) throw new HttpsError('failed-precondition', 'La solicitud ya fue aceptada o contratada; no se puede cambiar la cotización.');
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
      capabilityAdjustments: normalizeCapabilityAdjustments(snap.data().capabilityAdjustments),
      oneTimeMinor: normalized[index].oneTimeMinor,
      monthlyMinor: normalized[index].monthlyMinor,
      annualMinor: normalized[index].annualMinor,
    }));
    const baseCapabilities = intent.planSnapshot?.capabilitiesV1
      ? normalizeCapabilitiesV1(intent.planSnapshot.capabilitiesV1, intent.businessType)
      : (input.capabilitiesV1 ? normalizeCapabilitiesV1(input.capabilitiesV1, intent.businessType) : null);
    if (!baseCapabilities) throw new HttpsError('failed-precondition', 'Define y revisa las capacidades V1 de esta cotización antes de ofrecerla.');
    const capabilitiesV1 = extraLines.reduce(
      (snapshot, line) => applyCapabilityAdjustments(snapshot, line.capabilityAdjustments),
      baseCapabilities,
    );
    for (const line of extraLines) {
      if (!['recurring', 'one_time', 'custom_quote'].includes(line.pricingType)) throw new HttpsError('failed-precondition', 'Un extra tiene una modalidad de cobro no reconocida.');
      if (line.pricingType === 'recurring' && line.oneTimeMinor !== 0) throw new HttpsError('invalid-argument', 'Un extra recurrente no puede cotizarse como importe único.');
      if (line.pricingType !== 'recurring' && (line.monthlyMinor !== 0 || line.annualMinor !== 0)) throw new HttpsError('invalid-argument', 'Un extra de pago único no puede incluir mensualidad.');
    }
    const recurringPerPeriod = cycle === 'annual' ? annualMinor : monthlyMinor;
    const recurringExtrasPerPeriod = extraLines.reduce((sum, line) => sum + (cycle === 'annual' ? line.annualMinor : line.monthlyMinor), 0);
    const recurring = recurringPerPeriod + recurringExtrasPerPeriod;
    const prepaidRecurring = recurring * periodCount;
    const initialDueMinor = implementationMinor + prepaidRecurring + extraLines.reduce((sum, line) => sum + line.oneTimeMinor, 0) - discountMinor;
    if (!Number.isSafeInteger(prepaidRecurring) || prepaidRecurring > 100_000_000 || !Number.isSafeInteger(initialDueMinor) || initialDueMinor < 0) throw new HttpsError('invalid-argument', 'El importe inicial supera el límite permitido o el descuento excede la cotización.');
    if (cycle === 'monthly' ? monthlyMinor <= 0 : annualMinor <= 0) {
      throw new HttpsError('failed-precondition', `La cotización ${cycle === 'monthly' ? 'mensual' : 'anual'} requiere un importe recurrente mayor que cero.`);
    }
    const quoteVersion = (Number(intent.quote?.version) || 0) + 1;
    if (intent.quote?.status === 'offered') throw new HttpsError('failed-precondition', 'Retira la oferta anterior antes de guardar una nueva versión.');
    const quote = {
      version: quoteVersion, status: 'draft', currency, billingCycle: cycle, periodCount, monthsCovered,
      implementationMinor, monthlyMinor, annualMinor, discountMinor, discountReason,
      extras: extraLines, initialDueMinor, recurringMinor: recurring,
      sourcePlanSnapshot: intent.planSnapshot || null, capabilitiesV1, technicalEntitlements: [],
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
      capabilitiesV1: normalizeCapabilitiesV1(intent.quote.capabilitiesV1, intent.businessType),
      currency: intent.quote.currency, billingCycle: intent.quote.billingCycle,
      periodCount: prepaidPeriods(intent.quote.billingCycle, intent.quote.periodCount || 1),
      monthsCovered: Number(intent.quote.monthsCovered) || (intent.quote.billingCycle === 'annual' ? 12 : 1),
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
      periodCount: terms.periodCount, monthsCovered: terms.monthsCovered,
      lineItems: [
        { kind: 'implementation', amountMinor: terms.implementationMinor },
        { kind: 'subscription', amountMinor: (terms.billingCycle === 'annual' ? terms.annualMinor : terms.monthlyMinor) * terms.periodCount, periodCount: terms.periodCount, monthsCovered: terms.monthsCovered },
        ...terms.extras.map(item => ({ kind: 'extra', extraId: item.id, title: item.title,
          amountMinor: item.oneTimeMinor + (terms.billingCycle === 'annual' ? item.annualMinor : item.monthlyMinor) * terms.periodCount })),
        ...(terms.discountMinor ? [{ kind: 'discount', amountMinor: -terms.discountMinor, reason: terms.discountReason }] : []),
      ], createdBy: actor.uid, createdAt: now, updatedAt: now,
    });
    tx.create(subscriptionRef, {
      subscriptionId: contractId, contractId, tenantId: null, status: 'pending',
      planKey: terms.plan?.planId || null, planSnapshot: terms.plan, templateId: terms.templateId,
      capabilitiesV1: terms.capabilitiesV1,
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
  const input = request.data || {};
  const actor = input.tenantId
    ? await tenantBillingActor(db, request)
    : await platformActor(db, request, 'billing.payments.confirm');
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
  const fingerprint = digest(JSON.stringify({ chargeId, amountMinor, method, referenceHash, tenantId: actor.tenantId || null }));
  return db.runTransaction(async tx => {
    const [chargeSnap, paymentSnap, claimSnap, operationSnap] = await Promise.all([tx.get(chargeRef), tx.get(paymentRef), tx.get(claimRef), tx.get(operationRef)]);
    if (!chargeSnap.exists) throw new HttpsError('not-found', 'Cargo no encontrado.');
    let methods = null;
    if (actor.actorType === 'tenant') {
      const [tenantSnap, memberSnap, platformSnap, methodsSnap] = await Promise.all([
        tx.get(db.doc(`tenants/${actor.tenantId}`)), tx.get(db.doc(`tenants/${actor.tenantId}/members/${actor.uid}`)),
        tx.get(db.doc(`platformOperators/${actor.uid}`)), tx.get(db.doc('platformBillingConfig/manualMethods')),
      ]);
      if (!tenantSnap.exists || tenantSnap.data()?.billingContractId !== actor.contractId
        || memberSnap.data()?.status !== 'active' || memberSnap.data()?.roleId !== 'owner' || platformSnap.data()?.active === true) {
        throw new HttpsError('permission-denied', 'El propietario ya no tiene acceso a la facturación de esta empresa.');
      }
      if (methodsSnap.exists && methodsSnap.data()?.available === true) methods = methodsSnap.data();
    }
    if (operationSnap.exists) {
      if (operationSnap.data().fingerprint !== fingerprint) throw new HttpsError('already-exists', 'El identificador de pago ya se utilizó con otros datos.');
      return { success: true, paymentId: operationSnap.data().paymentId, idempotent: true };
    }
    const charge = chargeSnap.data();
    if (actor.actorType === 'tenant') {
      if (charge.tenantId !== actor.tenantId || charge.contractId !== actor.contractId || charge.kind !== 'renewal') {
        throw new HttpsError('permission-denied', 'El cargo no pertenece a la suscripción de esta empresa.');
      }
      if (!methods || (method === 'bank_qr' && methods.qrEnabled !== true) || (method === 'bank_transfer' && methods.transferEnabled !== true)) {
        throw new HttpsError('failed-precondition', 'Este método de pago no está habilitado por PACHAX. Contacta a soporte.');
      }
    }
    if (paymentSnap.exists || claimSnap.exists) throw new HttpsError('already-exists', 'La referencia bancaria ya está registrada; revisa el historial antes de reintentar.');
    const balances = validatedChargeBalances(charge);
    const paidMinor = balances.paidMinor;
    const pendingMinor = balances.pendingMinor;
    if (charge.status === 'paid' || charge.status === 'cancelled' || paidMinor + pendingMinor + amountMinor > balances.amountMinor) {
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
    tx.update(chargeRef, { pendingMinor: pendingMinor + amountMinor, status: 'under_review', updatedAt: now });
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
    if (charge.kind === 'renewal') {
      const pendingPlanChange = subscriptionSnap.data().pendingPlanChange || null;
      const effectiveAt = pendingPlanChange?.effectiveAt?.toMillis?.()
        ?? subscriptionSnap.data().currentPeriodEnd?.toMillis?.();
      if (pendingPlanChange && Number.isFinite(effectiveAt) && effectiveAt > Date.now()) {
        throw new HttpsError('failed-precondition', 'La renovación con cambio de plan solo puede confirmarse desde la fecha contractual del cambio. La referencia permanece pendiente de conciliación.');
      }
    }
    if (charge.kind === 'renewal' && !['active', 'overdue', 'suspended', 'cancelled'].includes(subscriptionSnap.data().status)) {
      throw new HttpsError('failed-precondition', 'La suscripción no admite conciliación para este cargo.');
    }
    const balances = validatedChargeBalances(charge);
    if (!Number.isSafeInteger(data.amountMinor) || data.amountMinor <= 0
      || balances.paidMinor + data.amountMinor > balances.amountMinor || balances.pendingMinor < data.amountMinor) {
      throw new HttpsError('failed-precondition', 'El saldo del cargo cambió; revisa el pago antes de confirmarlo.');
    }
    const paidMinor = balances.paidMinor + data.amountMinor;
    const pendingMinor = balances.pendingMinor - data.amountMinor;
    const isPaid = paidMinor === charge.amountMinor;
    let renewalActivation = null;
    if (isPaid && charge.kind === 'renewal' && ['active', 'overdue'].includes(subscriptionSnap.data().status)) {
      if (charge.periodApplicationId) throw new HttpsError('failed-precondition', 'Este período de renovación ya fue aplicado; no se extenderá nuevamente.');
      const subscription = subscriptionSnap.data();
      const pendingPlanChange = subscription.pendingPlanChange || null;
      const cycle = pendingPlanChange?.billingCycle || charge.cycle || subscription.billingCycle;
      const periodCount = prepaidPeriods(cycle, charge.periodCount || 1);
      const { start, anchorDay } = renewalPeriodStart(subscription);
      const end = addBillingPeriods(start, cycle, periodCount, anchorDay);
      const startTimestamp = Timestamp.fromDate(start);
      const endTimestamp = Timestamp.fromDate(end);
      const tenantRef = db.doc(`tenants/${subscription.tenantId}`);
      const tenantSnap = await tx.get(tenantRef);
      if (!tenantSnap.exists || tenantSnap.data()?.billingEnforcement !== true || tenantSnap.data()?.billingContractId !== data.contractId) {
        throw new HttpsError('failed-precondition', 'La empresa vinculada a esta renovación requiere revisión; el cobro no actualizó el acceso.');
      }
      renewalActivation = { subscription, pendingPlanChange, cycle, periodCount, anchorDay, startTimestamp, endTimestamp,
        accessUntil: addGracePeriod(endTimestamp), tenantRef };
    }
    const now = FieldValue.serverTimestamp();
    tx.update(paymentRef, { status: 'confirmed', confirmedBy: actor.uid, confirmedAt: now });
    tx.update(claimRef, { status: 'confirmed', confirmedBy: actor.uid, confirmedAt: now });
    tx.update(chargeRef, { paidMinor, pendingMinor, status: isPaid ? 'paid' : pendingMinor ? 'under_review' : 'partial', ...(isPaid ? { paidAt: now } : {}), updatedAt: now });
    if (isPaid && charge.kind === 'initial') {
      tx.update(contractRef, { status: 'ready_for_activation', initialChargePaidAt: now, updatedAt: now });
      tx.update(subscriptionRef, { status: 'pending', updatedAt: now });
    }
    if (isPaid && charge.kind === 'renewal') {
      if (renewalActivation) {
        const { subscription, pendingPlanChange, cycle, periodCount, anchorDay, startTimestamp, endTimestamp, accessUntil, tenantRef } = renewalActivation;
        const billingCycle = pendingPlanChange?.billingCycle || cycle;
        const monthsCovered = periodCount * (billingCycle === 'annual' ? 12 : 1);
        tx.update(chargeRef, { periodStart: startTimestamp, periodEnd: endTimestamp, monthsCovered, billingAnchorDay: anchorDay,
          paidAt: now, periodApplicationId: `renewal:${charge.chargeId}`, periodAppliedAt: now, periodAppliedToContractId: data.contractId });
        tx.update(subscriptionRef, {
          status: 'active', currentPeriodStart: startTimestamp, currentPeriodEnd: endTimestamp, nextRenewalAt: endTimestamp, billingAccessUntil: accessUntil,
          periodCount, monthsCovered, billingAnchorDay: anchorDay,
          pendingRenewalChargeId: FieldValue.delete(),
          ...(pendingPlanChange ? {
            planKey: pendingPlanChange.planSnapshot.planId,
            commercialCapabilities: pendingPlanChange.planSnapshot.capabilitiesV1,
            planSnapshot: pendingPlanChange.planSnapshot,
            recurringMinor: pendingPlanChange.recurringMinor,
            billingCycle: pendingPlanChange.billingCycle,
            currency: pendingPlanChange.currency,
            pendingPlanChange: FieldValue.delete(),
          } : {}),
          updatedAt: now,
        });
        if (subscription.tenantId) tx.update(tenantRef, {
          subscriptionStatus: 'active', status: 'active', billingAccessUntil: accessUntil, updatedAt: now,
          ...(pendingPlanChange ? {
            planKey: pendingPlanChange.planSnapshot.planId,
            commercialCapabilities: pendingPlanChange.planSnapshot.capabilitiesV1,
          } : {}),
        });
      } else {
        // El ingreso de una cuenta suspendida/cancelada no recupera acceso automáticamente.
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
    const subscriptionRef = db.doc(`platformSubscriptions/${payment.contractId}`);
    const claimRef = db.doc(`platformPaymentReferenceClaims/${payment.referenceHash}`);
    const [operation, chargeSnap, subscriptionSnap, claimSnap] = await Promise.all([
      tx.get(op), tx.get(chargeRef), tx.get(subscriptionRef), tx.get(claimRef),
    ]);
    if (operation.exists) {
      if (operation.data().fingerprint !== fingerprint) throw new HttpsError('already-exists', 'El identificador de rechazo ya se utilizó con otros datos.');
      return { success: true, idempotent: true };
    }
    if (payment.status !== 'pending_review' || !chargeSnap.exists || !claimSnap.exists
      || claimSnap.data().paymentId !== paymentId || claimSnap.data().status !== 'pending_review'
      || claimSnap.data().chargeId !== payment.chargeId) throw new HttpsError('failed-precondition', 'El pago no puede rechazarse en su estado actual.');
    const charge = chargeSnap.data();
    const balances = validatedChargeBalances(charge);
    if (charge.contractId !== payment.contractId || !Number.isSafeInteger(payment.amountMinor) || payment.amountMinor <= 0
      || balances.pendingMinor < payment.amountMinor) {
      throw new HttpsError('failed-precondition', 'La referencia no coincide con el saldo reservado; requiere revisión manual.');
    }
    const pendingMinor = balances.pendingMinor - payment.amountMinor;
    if (balances.paidMinor + pendingMinor > balances.amountMinor) throw new HttpsError('failed-precondition', 'El saldo restante del cargo es inconsistente.');
    const now = FieldValue.serverTimestamp();
    tx.update(paymentRef, { status: 'rejected', rejectedBy: actor.uid, rejectionReason: reason, rejectedAt: now });
    tx.update(claimRef, { status: 'rejected', rejectedBy: actor.uid, rejectedAt: now });
    const chargeStatus = pendingMinor ? 'under_review' : balances.paidMinor ? 'partial' : 'due';
    tx.update(chargeRef, { pendingMinor, status: chargeStatus, updatedAt: now });
    // Keep the renewal pointer while any unpaid balance remains. A rejected
    // reference releases its reservation; it does not cancel the charge.
    if (subscriptionSnap.exists && subscriptionSnap.data().pendingRenewalChargeId === payment.chargeId
      && (chargeStatus === 'paid' || chargeStatus === 'cancelled')) {
      tx.update(subscriptionRef, { pendingRenewalChargeId: FieldValue.delete(), updatedAt: now });
    }
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
  const requestedPeriodCount = request.data?.periodCount ?? 1;
  const contractRef = db.doc(`platformContracts/${contractId}`);
  const subscriptionRef = db.doc(`platformSubscriptions/${contractId}`);
  const opRef = db.doc(`platformBillingOperations/${requestKey(actor, 'renewal.create', requestId)}`);
  const fingerprint = digest(JSON.stringify({ contractId, dueAt: dueAt.toMillis(), periodCount: requestedPeriodCount }));
  return db.runTransaction(async tx => {
    const [contract, subscription, operation] = await Promise.all([tx.get(contractRef), tx.get(subscriptionRef), tx.get(opRef)]);
    if (!contract.exists || !subscription.exists) throw new HttpsError('not-found', 'Suscripción no encontrada.');
    if (operation.exists) {
      if (operation.data().fingerprint !== fingerprint) throw new HttpsError('already-exists', 'El identificador de renovación ya se utilizó con otros datos.');
      return { success: true, chargeId: operation.data().chargeId, idempotent: true };
    }
    const current = subscription.data();
    if (!['active', 'overdue', 'suspended'].includes(current.status) || !current.tenantId) throw new HttpsError('failed-precondition', 'Solo una suscripción comercial con empresa puede renovarse. Las canceladas requieren un contrato nuevo.');
    const pendingPlanChange = current.pendingPlanChange || null;
    const chargeCycle = pendingPlanChange?.billingCycle || current.billingCycle || contract.data().terms.billingCycle;
    const periodCount = prepaidPeriods(chargeCycle, requestedPeriodCount);
    // A multi-cycle charge is an explicit advance prepayment selected by an
    // authorized Platform operator, for either monthly or annual contracts.
    // A scheduled plan change's price and capabilities come from its snapshot;
    // confirmManualPayment prevents those capabilities from applying early.
    const advancePrepayment = periodCount > 1;
    const renewalMode = advancePrepayment ? 'advance_prepayment' : 'ordinary';
    if (current.status !== 'suspended' && !advancePrepayment
      && current.currentPeriodEnd?.toMillis?.() > Date.now() + 31 * 86_400_000) {
      throw new HttpsError('failed-precondition', 'La renovación puede emitirse dentro de los 30 días previos al vencimiento.');
    }
    const recurringMinor = pendingPlanChange?.recurringMinor ?? current.recurringMinor ?? contract.data().terms.recurringMinor;
    if (!Number.isSafeInteger(recurringMinor) || recurringMinor <= 0) throw new HttpsError('failed-precondition', 'El precio contractual de renovación no es válido.');
    const amountMinor = recurringMinor * periodCount;
    if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0 || amountMinor > 100_000_000) throw new HttpsError('failed-precondition', 'El importe recurrente excede el límite comercial permitido.');
    if (current.pendingRenewalChargeId) {
      const existingChargeRef = db.doc(`platformBillingCharges/${current.pendingRenewalChargeId}`);
      const existingCharge = await tx.get(existingChargeRef);
      if (!existingCharge.exists) throw new HttpsError('failed-precondition', 'La suscripción apunta a un cargo de renovación inexistente; requiere revisión manual.');
      const existingData = existingCharge.data();
      if (existingData.contractId !== contractId || existingData.tenantId !== current.tenantId || existingData.kind !== 'renewal') {
        throw new HttpsError('failed-precondition', 'El cargo vinculado no corresponde a esta renovación; requiere revisión manual.');
      }
      validatedChargeBalances(existingData);
      if (['due', 'partial', 'under_review'].includes(existingData.status)) {
        if ((Number(existingCharge.data().periodCount) || 1) !== periodCount || existingCharge.data().cycle !== chargeCycle) {
          throw new HttpsError('failed-precondition', 'Ya existe un cargo pendiente con otro período. Concílialo o recházalo antes de cotizar una duración distinta.');
        }
        tx.create(opRef, { actorUid: actor.uid, chargeId: existingCharge.id, fingerprint, createdAt: FieldValue.serverTimestamp() });
        return { success: true, chargeId: existingCharge.id, renewalMode, idempotent: false, reusedPendingCharge: true };
      }
      throw new HttpsError('failed-precondition', 'La suscripción conserva un vínculo a un cargo ya finalizado; requiere revisión antes de otra renovación.');
    }
    const renewalHistory = await tx.get(db.collection('platformBillingCharges').where('contractId', '==', contractId));
    const orphanedActiveRenewals = renewalHistory.docs.filter(item => item.data().kind === 'renewal'
      && ['due', 'partial', 'under_review'].includes(item.data().status));
    if (orphanedActiveRenewals.length) {
      throw new HttpsError('failed-precondition', 'Hay un cargo de renovación abierto sin vínculo con la suscripción; concílialo antes de crear otro.');
    }
    const chargeId = `ch_${requestKey(actor, 'renewal', requestId).slice(0, 40)}`;
    const chargeRef = db.doc(`platformBillingCharges/${chargeId}`);
    const existing = await tx.get(chargeRef);
    if (existing.exists) throw new HttpsError('already-exists', 'Ya existe el cargo para esta operación.');
    const renewalStart = renewalPeriodStart(current);
    const periodStart = Timestamp.fromDate(renewalStart.start);
    const anchorDay = renewalStart.anchorDay;
    const endDate = addBillingPeriods(renewalStart.start, chargeCycle, periodCount, anchorDay);
    const periodEnd = Timestamp.fromDate(endDate);
    const chargeCurrency = pendingPlanChange?.currency || current.currency;
    const now = FieldValue.serverTimestamp();
    tx.create(chargeRef, {
      chargeId, contractId, tenantId: current.tenantId, kind: 'renewal', currency: chargeCurrency,
      amountMinor, paidMinor: 0, pendingMinor: 0, status: 'due', dueAt,
      renewalMode,
      cycle: chargeCycle, periodCount, monthsCovered: periodCount * (chargeCycle === 'annual' ? 12 : 1), periodStart, periodEnd,
      billingAnchorDay: anchorDay, planSnapshot: pendingPlanChange?.planSnapshot || current.planSnapshot || null,
      lineItems: [{ kind: 'subscription', amountMinor, periodCount, monthsCovered: periodCount * (chargeCycle === 'annual' ? 12 : 1), planId: pendingPlanChange?.planSnapshot?.planId || current.planKey || null }],
      createdBy: actor.uid, createdAt: now, updatedAt: now,
    });
    tx.update(subscriptionRef, { pendingRenewalChargeId: chargeId, updatedAt: now });
    tx.create(opRef, { actorUid: actor.uid, chargeId, fingerprint, createdAt: now });
    audit(db, tx, actor, 'billing.renewal.charge.create', chargeRef.path, { contractId, amountMinor, cycle: chargeCycle, periodCount, renewalMode });
    return { success: true, chargeId, renewalMode, idempotent: false };
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
      const template = templateFor(plan.templateId);
      const capabilitiesV1 = normalizeCapabilitiesV1(plan.capabilitiesV1, template.businessType);
      return [{ id: document.id, name: cleanText(plan.name, 'Plan', 1, 120), templateId: plan.templateId,
        version: Number(plan.commercialVersion) || 1, currency: currencyCode(plan.currency), monthlyMinor, annualMinor,
        includedFeatures: Array.isArray(plan.includedFeatures) ? plan.includedFeatures.filter(value => typeof value === 'string').slice(0, 50) : [],
        capabilitiesV1 }];
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
    const contractedCapabilities = contract.terms?.capabilitiesV1 || contract.terms?.plan?.capabilitiesV1;
    const contractedBusinessType = contractedCapabilities?.businessType;
    if (typeof contractedBusinessType !== 'string' || !contractedBusinessType) {
      throw new HttpsError('failed-precondition', 'El contrato no tiene una plantilla de capacidades verificable para programar el cambio de plan.');
    }
    const canonicalContractCapabilities = normalizeCapabilitiesV1(contractedCapabilities, contract.businessType || contractedBusinessType);
    if (templateFor(contract.templateId).businessType !== canonicalContractCapabilities.businessType
      || plan.templateId !== contract.templateId
      || templateFor(plan.templateId).businessType !== canonicalContractCapabilities.businessType) {
      throw new HttpsError('failed-precondition', 'El plan destino no corresponde a la plantilla y capacidades del contrato.');
    }
    const monthlyMinor = moneyMinor(Number(plan.monthlyPriceUSD).toFixed(2), 'Mensualidad', { allowZero: false });
    const annualMinor = moneyMinor(Number(plan.annualPriceUSD).toFixed(2), 'Anualidad', { allowZero: false });
    const planSnapshot = {
      planId, name: cleanText(plan.name, 'Plan', 1, 120), version: Number(plan.commercialVersion) || 1,
      templateId: plan.templateId, currency: currencyCode(plan.currency), monthlyMinor, annualMinor,
      includedFeatures: Array.isArray(plan.includedFeatures) ? plan.includedFeatures.filter(value => typeof value === 'string').slice(0, 50) : [],
      capabilitiesV1: (contract.terms?.extras || []).reduce(
        (current, extra) => applyCapabilityAdjustments(current, normalizeCapabilityAdjustments(extra.capabilityAdjustments)),
        normalizeCapabilitiesV1(plan.capabilitiesV1, contractedBusinessType),
      ),
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
      || !Array.isArray(plan.technicalEntitlements) || plan.technicalEntitlements.length !== 0
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

async function reactivateSuspendedSubscription(db, request) {
  const actor = await platformActor(db, request);
  if (actor.operator.role !== 'platform_owner') throw new HttpsError('permission-denied', 'Solo Platform Owner puede autorizar una reactivación excepcional.');
  const contractId = cleanText(request.data?.contractId, 'Contrato', 1, 120);
  const chargeId = cleanText(request.data?.chargeId, 'Cargo', 1, 120);
  const requestId = requestUuid(request.data?.requestId);
  const reason = cleanText(request.data?.reason, 'Motivo de reactivación', 12, 500);
  const contractRef = db.doc(`platformContracts/${contractId}`);
  const subscriptionRef = db.doc(`platformSubscriptions/${contractId}`);
  const chargeRef = db.doc(`platformBillingCharges/${chargeId}`);
  const opRef = db.doc(`platformBillingOperations/${requestKey(actor, 'subscription.reactivate', requestId)}`);
  const fingerprint = digest(JSON.stringify({ contractId, chargeId, reason }));
  return db.runTransaction(async tx => {
    const [contract, subscription, charge, operation] = await Promise.all([tx.get(contractRef), tx.get(subscriptionRef), tx.get(chargeRef), tx.get(opRef)]);
    if (operation.exists) {
      if (operation.data().fingerprint !== fingerprint) throw new HttpsError('already-exists', 'El identificador ya se utilizó para otra reactivación.');
      return { success: true, idempotent: true };
    }
    if (!contract.exists || !subscription.exists || !charge.exists) throw new HttpsError('not-found', 'No se encontró el contrato, suscripción o cargo.');
    const current = subscription.data(), paidCharge = charge.data();
    if (current.status !== 'suspended') throw new HttpsError('failed-precondition', 'Solo las suspensiones administrativas pueden reactivarse por este procedimiento. Las cancelaciones requieren un contrato nuevo.');
    const paidBalances = validatedChargeBalances(paidCharge);
    if (paidCharge.contractId !== contractId || paidCharge.tenantId !== current.tenantId || paidCharge.kind !== 'renewal'
      || paidCharge.status !== 'paid' || paidBalances.paidMinor !== paidBalances.amountMinor || paidBalances.pendingMinor !== 0) {
      throw new HttpsError('failed-precondition', 'La reactivación exige un cargo de renovación totalmente conciliado para esta empresa.');
    }
    const alreadyCoveredThrough = paidCharge.periodEnd?.toMillis?.();
    const currentCoveredThrough = current.currentPeriodEnd?.toMillis?.();
    if (paidCharge.periodApplicationId || paidCharge.periodAppliedAt || paidCharge.reactivatedAt
      || (Number.isFinite(alreadyCoveredThrough) && Number.isFinite(currentCoveredThrough) && alreadyCoveredThrough <= currentCoveredThrough)) {
      throw new HttpsError('failed-precondition', 'Los meses de este cargo ya fueron aplicados; no se pueden reutilizar para reactivar la suscripción.');
    }
    const tenantRef = db.doc(`tenants/${current.tenantId}`);
    const tenant = await tx.get(tenantRef);
    if (!tenant.exists || tenant.data()?.billingEnforcement !== true || tenant.data()?.billingContractId !== contractId || tenant.data()?.subscriptionStatus !== 'suspended') {
      throw new HttpsError('failed-precondition', 'El tenant no coincide con la suspensión registrada; no se cambió el acceso.');
    }
    const pendingPlanChange = current.pendingPlanChange || null;
    const cycle = pendingPlanChange?.billingCycle || paidCharge.cycle || current.billingCycle;
    const periodCount = prepaidPeriods(cycle, paidCharge.periodCount || 1);
    const paidAtMillis = paidCharge.paidAt?.toMillis?.() || Date.now();
    const renewalStart = renewalPeriodStart(current, Math.max(Date.now(), paidAtMillis));
    const start = renewalStart.start;
    const anchorDay = renewalStart.anchorDay;
    const end = addBillingPeriods(start, cycle, periodCount, anchorDay);
    const startTimestamp = Timestamp.fromDate(start), endTimestamp = Timestamp.fromDate(end);
    const accessUntil = addGracePeriod(endTimestamp);
    const now = FieldValue.serverTimestamp();
    const monthsCovered = periodCount * (cycle === 'annual' ? 12 : 1);
    tx.update(chargeRef, { periodStart: startTimestamp, periodEnd: endTimestamp, monthsCovered, billingAnchorDay: anchorDay,
      periodApplicationId: `renewal:${chargeId}`, periodAppliedAt: now, periodAppliedToContractId: contractId, reactivatedAt: now });
    tx.update(subscriptionRef, {
      status: 'active', currentPeriodStart: startTimestamp, currentPeriodEnd: endTimestamp, nextRenewalAt: endTimestamp,
      billingAccessUntil: accessUntil, periodCount, monthsCovered,
      billingAnchorDay: anchorDay, reactivatedBy: actor.uid, reactivatedAt: now, reactivationReason: reason,
      pendingRenewalChargeId: FieldValue.delete(),
      ...(pendingPlanChange ? { planKey: pendingPlanChange.planSnapshot.planId, planSnapshot: pendingPlanChange.planSnapshot,
        commercialCapabilities: pendingPlanChange.planSnapshot.capabilitiesV1, recurringMinor: pendingPlanChange.recurringMinor,
        billingCycle: pendingPlanChange.billingCycle, currency: pendingPlanChange.currency, pendingPlanChange: FieldValue.delete() } : {}),
      updatedAt: now,
    });
    tx.update(tenantRef, {
      status: 'active', subscriptionStatus: 'active', billingAccessUntil: accessUntil,
      ...(pendingPlanChange ? { planKey: pendingPlanChange.planSnapshot.planId, commercialCapabilities: pendingPlanChange.planSnapshot.capabilitiesV1 } : {}),
      updatedAt: now,
    });
    tx.update(contractRef, { subscriptionStatus: 'active', updatedAt: now });
    tx.create(opRef, { actorUid: actor.uid, contractId, chargeId, fingerprint, createdAt: now });
    audit(db, tx, actor, 'billing.subscription.reactivate', subscriptionRef.path, { chargeId, reason, periodCount, cycle });
    return { success: true, idempotent: false, currentPeriodEnd: endTimestamp };
  });
}

async function addBillingInternalNote(db, request) {
  const actor = await platformActor(db, request);
  requirePermission(actor, actor.permissions.includes('plans.manage') ? 'plans.manage' : 'finance.read');
  const contractId = cleanText(request.data?.contractId, 'Contrato', 1, 120);
  const note = cleanText(request.data?.note, 'Observación interna', 3, 1500);
  const requestId = requestUuid(request.data?.requestId);
  const contractRef = db.doc(`platformContracts/${contractId}`);
  const operationRef = db.doc(`platformBillingOperations/${requestKey(actor, 'billing.note.add', requestId)}`);
  const noteId = `bn_${requestKey(actor, 'billing.note.add', requestId).slice(0, 40)}`;
  const noteRef = db.doc(`platformBillingNotes/${noteId}`);
  const fingerprint = digest(JSON.stringify({ contractId, note }));
  return db.runTransaction(async tx => {
    const [contract, operation, existingNote] = await Promise.all([tx.get(contractRef), tx.get(operationRef), tx.get(noteRef)]);
    if (!contract.exists) throw new HttpsError('not-found', 'Contrato no encontrado.');
    if (operation.exists) {
      if (operation.data().fingerprint !== fingerprint) throw new HttpsError('already-exists', 'El identificador de observación ya se usó con otro contenido.');
      return { success: true, noteId: operation.data().noteId, idempotent: true };
    }
    if (existingNote.exists) throw new HttpsError('already-exists', 'La observación ya existe; requiere revisión de auditoría.');
    const now = FieldValue.serverTimestamp();
    tx.create(noteRef, { contractId, tenantId: contract.data().tenantId || null, note, actorUid: actor.uid,
      actorRole: actor.operator.role, createdAt: now });
    tx.create(operationRef, { fingerprint, noteId, actorUid: actor.uid, createdAt: now });
    audit(db, tx, actor, 'billing.internal_note.add', noteRef.path, { contractId, noteId });
    return { success: true, noteId, idempotent: false };
  });
}

async function listBillingInternalNotes(db, request) {
  const actor = await platformActor(db, request);
  if (!actor.permissions.some(permission => ['plans.manage', 'finance.read'].includes(permission))) {
    throw new HttpsError('permission-denied', 'El operador no puede consultar observaciones de facturación.');
  }
  const contractId = cleanText(request.data?.contractId, 'Contrato', 1, 120);
  const limit = Number(request.data?.limit ?? 50);
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new HttpsError('invalid-argument', 'Límite de observaciones inválido.');
  let query = db.collection('platformBillingNotes').where('contractId', '==', contractId)
    .orderBy('createdAt', 'desc').orderBy(FieldPath.documentId(), 'desc');
  const cursor = request.data?.cursor;
  if (cursor != null) {
    const milliseconds = Number(cursor.createdAtMillis);
    const id = cleanText(cursor.id, 'Cursor', 1, 150);
    if (!Number.isSafeInteger(milliseconds) || milliseconds < 0) throw new HttpsError('invalid-argument', 'Cursor de observaciones inválido.');
    query = query.startAfter(Timestamp.fromMillis(milliseconds), id);
  }
  const snapshot = await query.limit(limit + 1).get();
  const page = snapshot.docs.slice(0, limit);
  const last = page[page.length - 1];
  const lastDate = last?.get('createdAt');
  return { notes: page.map(document => ({ id: document.id, ...document.data() })),
    hasMore: snapshot.docs.length > limit,
    nextCursor: snapshot.docs.length > limit && lastDate?.toMillis ? { createdAtMillis: lastDate.toMillis(), id: last.id } : null };
}

async function correctBillingCharge(db, request) {
  const actor = await platformActor(db, request);
  if (actor.operator.role !== 'platform_owner') throw new HttpsError('permission-denied', 'Solo Platform Owner puede corregir el importe de un cargo.');
  const chargeId = cleanText(request.data?.chargeId, 'Cargo', 1, 120);
  const requestId = requestUuid(request.data?.requestId);
  const correctedAmountMinor = moneyMinor(request.data?.correctedAmount, 'Importe corregido', { allowZero: false });
  const reason = cleanText(request.data?.reason, 'Motivo de corrección', 12, 500);
  const chargeRef = db.doc(`platformBillingCharges/${chargeId}`);
  const operationRef = db.doc(`platformBillingOperations/${requestKey(actor, 'billing.charge.correct', requestId)}`);
  const correctionId = `bc_${requestKey(actor, 'billing.charge.correct', requestId).slice(0, 40)}`;
  const correctionRef = db.doc(`platformBillingCorrections/${correctionId}`);
  const fingerprint = digest(JSON.stringify({ chargeId, correctedAmountMinor, reason }));
  return db.runTransaction(async tx => {
    const chargeSnap = await tx.get(chargeRef);
    if (!chargeSnap.exists) throw new HttpsError('not-found', 'Cargo no encontrado.');
    const charge = chargeSnap.data();
    const contractRef = db.doc(`platformContracts/${charge.contractId}`);
    const subscriptionRef = db.doc(`platformSubscriptions/${charge.contractId}`);
    const [contractSnap, subscriptionSnap, operation, correction] = await Promise.all([
      tx.get(contractRef), tx.get(subscriptionRef), tx.get(operationRef), tx.get(correctionRef),
    ]);
    if (operation.exists) {
      if (operation.data().fingerprint !== fingerprint) throw new HttpsError('already-exists', 'El identificador de corrección ya se usó con otros datos.');
      return { success: true, correctionId: operation.data().correctionId, idempotent: true };
    }
    if (!contractSnap.exists || !subscriptionSnap.exists || charge.contractId !== contractSnap.id) throw new HttpsError('failed-precondition', 'Cargo sin contrato y suscripción íntegros.');
    if (correction.exists || !['due', 'partial'].includes(charge.status) || Number(charge.paidMinor) !== 0
      || Number(charge.pendingMinor) !== 0 || correctedAmountMinor === Number(charge.amountMinor)) {
      throw new HttpsError('failed-precondition', 'Solo se corrige un cargo sin pagos ni referencias pendientes y con un importe distinto.');
    }
    if (charge.kind === 'initial' && (contractSnap.data().status !== 'pending_payment' || subscriptionSnap.data().tenantId)) {
      throw new HttpsError('failed-precondition', 'El cargo inicial ya está asociado a una activación o requiere revisión especializada.');
    }
    if (charge.kind === 'renewal' && ['suspended', 'cancelled'].includes(subscriptionSnap.data().status)) {
      throw new HttpsError('failed-precondition', 'No se corrige una renovación suspendida o cancelada; requiere revisión contractual.');
    }
    const now = FieldValue.serverTimestamp();
    const previousAmountMinor = Number(charge.amountMinor);
    tx.create(correctionRef, { chargeId, contractId: charge.contractId, tenantId: charge.tenantId || null,
      previousAmountMinor, correctedAmountMinor, currency: charge.currency, reason, actorUid: actor.uid,
      actorRole: actor.operator.role, createdAt: now });
    tx.update(chargeRef, { originalAmountMinor: Number.isSafeInteger(charge.originalAmountMinor)
      ? charge.originalAmountMinor : previousAmountMinor, amountMinor: correctedAmountMinor,
    correctionCount: (Number(charge.correctionCount) || 0) + 1, lastCorrectionId: correctionId,
    lastCorrectedBy: actor.uid, lastCorrectedAt: now, updatedAt: now });
    tx.create(operationRef, { fingerprint, correctionId, actorUid: actor.uid, createdAt: now });
    audit(db, tx, actor, 'billing.charge.correct', chargeRef.path, { correctionId, previousAmountMinor, correctedAmountMinor, currency: charge.currency, reason });
    return { success: true, correctionId, idempotent: false };
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
  const sortField = kind === 'payments' ? 'recordedAt' : 'createdAt';
  let query = db.collection(collections[kind])
    .orderBy(sortField, 'desc')
    .orderBy(FieldPath.documentId(), 'desc');
  const cursor = request.data?.cursor;
  if (cursor != null) {
    const milliseconds = Number(cursor.createdAtMillis);
    const id = cleanText(cursor.id, 'Cursor', 1, 150);
    if (!Number.isSafeInteger(milliseconds) || milliseconds < 0) throw new HttpsError('invalid-argument', 'Cursor de paginación inválido.');
    query = query.startAfter(Timestamp.fromMillis(milliseconds), id);
  }
  const snapshot = await query.limit(limit + 1).get();
  const page = snapshot.docs.slice(0, limit);
  const now = Date.now();
  const last = page[page.length - 1];
  const lastDate = last?.get(sortField);
  return { records: page.map(doc => {
    const record = { id: doc.id, ...doc.data() };
    if (kind !== 'subscriptions') return record;
    const effectiveStatus = effectiveBillingStatus(record, now);
    const periodEnd = record.currentPeriodEnd?.toDate?.() || null;
    return { ...record, effectiveStatus, daysRemaining: daysUntilBillingDate(periodEnd, now) };
  }), hasMore: snapshot.docs.length > limit, nextCursor: snapshot.docs.length > limit && lastDate?.toMillis
    ? { createdAtMillis: lastDate.toMillis(), id: last.id } : null };
}

module.exports = {
  BILLING_STATUSES, BILLING_GRACE_PERIOD_DAYS, moneyMinor,
  createManualCommercialIntent, saveCommercialQuote, offerCommercialQuote, withdrawCommercialQuote, recordCommercialAcceptance,
  createCommercialContract, recordManualPaymentReference, confirmManualPayment, rejectManualPayment,
  createRenewalCharge, requestSubscriptionPlanChange, listPublishedBillingPlans, changeSubscriptionStatus,
  reactivateSuspendedSubscription, listBillingRecords, getManualPaymentMethods, saveManualPaymentMethods,
  getTenantBillingOverview, addBillingInternalNote, listBillingInternalNotes, correctBillingCharge,
};
