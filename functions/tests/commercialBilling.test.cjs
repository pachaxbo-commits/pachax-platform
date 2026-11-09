const assert = require('node:assert/strict');
const fs = require('node:fs');
const { randomUUID } = require('node:crypto');
const { initializeTestEnvironment, assertFails } = require('@firebase/rules-unit-testing');
const { doc, getDoc, setDoc } = require('firebase/firestore');

const projectId = process.env.GCLOUD_PROJECT || '';
if (!projectId.startsWith('demo-')) throw new Error('Billing tests may only run against a demo Firebase project.');
if (!process.env.FIRESTORE_EMULATOR_HOST || !process.env.FIREBASE_AUTH_EMULATOR_HOST) throw new Error('Run this test with isolated Firestore and Auth emulators.');

const { initializeApp, deleteApp } = require('firebase-admin/app');
const { getFirestore, Timestamp } = require('firebase-admin/firestore');
const { getAuth } = require('firebase-admin/auth');
const platform = require('../platform.cjs');
const commercialBilling = require('../commercialBilling.cjs');
const assisted = require('../assistedTenantProvisioning.cjs');
const tenants = require('../tenants.cjs');
const { hasPermission, hasTenantBillingAccess, tenantActor } = require('../authorization.cjs');
const { processCommand } = require('../operations.cjs');

const distributionCapabilities = Object.freeze({ version: 1, businessType: 'route_distribution',
  limits: { activeUsers: 3, activeProducts: 2, activeBranches: 1 },
  features: { reports: { basic: true, detailed: false, export: false }, receipts: { digital: false },
    printing: { manual: false, kitchenAutomatic: false }, adsRequired: false } });

const suffix = randomUUID().replace(/-/g, '');
const app = initializeApp({ projectId }, `billing-core-${suffix}`);
const db = getFirestore(app);
const auth = getAuth(app);
const ownerUid = `billing-owner-${suffix}`;
const adminUid = `billing-admin-${suffix}`;
const financeUid = `billing-finance-${suffix}`;
const supportUid = `billing-support-${suffix}`;
const leadEmail = `billing-customer-${suffix}@example.test`;
const planId = `billing-plan-${suffix}`;
const nextPlanId = `billing-next-plan-${suffix}`;
const extraId = `billing-extra-${suffix}`;
const extraIdTwo = `billing-extra-two-${suffix}`;
const createdPaths = [];
const createdAuthUids = [];
let rulesEnv;
let passed = 0;
let originalMethodsLoaded = false;
let originalMethodsExisted = false;
let originalMethods = null;
const pass = label => { passed += 1; console.log(`PASS ${label}`); };
const request = (uid, data) => ({ auth: { uid, token: { platform: true } }, data });
const platformCall = (uid, data) => platform.platformGateway(db, request(uid, data));
const opId = () => randomUUID();

function dateAfter(days) { return new Date(Date.now() + days * 86_400_000).toISOString(); }

async function signInOwner(email, password) {
  const host = process.env.FIREBASE_AUTH_EMULATOR_HOST;
  const response = await fetch(`http://${host}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=emulator`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password, returnSecureToken: true }),
  });
  const payload = await response.json();
  assert.equal(response.ok, true, 'Owner login should succeed through Auth Emulator.');
  return payload;
}

async function seedPlan(id, name, monthly, annual, currency = 'USD') {
  const ref = db.doc(`platformPlans/${id}`);
  createdPaths.push(ref.path);
  await ref.set({ id, templateId: 'distribution', name, planKind: 'paid', status: 'published', priceApproval: 'approved',
    monthlyPriceUSD: monthly, annualPriceUSD: annual, annualPriceUnit: 'annual_total_12_months', currency, commercialVersion: 1,
    includedFeatures: ['Inventario y rutas'], technicalEntitlements: [], capabilitiesV1: distributionCapabilities, createdAt: Timestamp.now() });
}

async function runDistributionAdjustment(tenantId, uid, label) {
  const ref = db.doc(`tenants/${tenantId}/distOperations/${label}-${opId()}`);
  await ref.set({ status: 'queued', tenantId, branchId: 'main', createdBy: uid, type: 'adjustment',
    payload: { warehouseId: 'central', note: '', line: { productId: 'billing-access-test', quantity: 1 } } });
  await processCommand(db, ref);
  return (await ref.get()).data();
}

async function runDistributionProductSave(tenantId, uid, productId, label, active = true) {
  const ref = db.doc(`tenants/${tenantId}/distOperations/${label}-${opId()}`);
  await ref.set({ status: 'queued', tenantId, branchId: 'main', createdBy: uid, type: 'saveProduct',
    payload: { product: { id: productId, name: 'Producto de cuota QA', unitType: 'unit', referencePrice: 1, active } } });
  await processCommand(db, ref);
  return (await ref.get()).data();
}

async function prepareAssistedInput(contractId, companyName, ownerEmail, operationId, ownerDisplayName = 'Propietario Billing QA', businessType = 'route_distribution') {
  const input = {
    action: 'createAssistedTenant', operationId, billingContractId: contractId,
    companyName, businessType, ownerEmail, ownerDisplayName,
    ownerEmailConfirmed: true, currency: 'BOB', currencySymbol: 'Bs',
    timezone: 'America/La_Paz', businessIdentity: { legalName: 'QA Billing', city: 'Cochabamba' },
  };
  if (businessType === 'route_distribution') input.industryProfile = 'beverages';
  return input;
}

function capabilitiesFor(businessType) {
  return { ...distributionCapabilities, businessType };
}

async function cleanup() {
  if (rulesEnv) await rulesEnv.cleanup().catch(() => undefined);
  for (const uid of [ownerUid, financeUid, adminUid, supportUid]) {
    const operations = await db.collection('platformBillingOperations').where('actorUid', '==', uid).get().catch(() => ({ docs: [] }));
    await Promise.all(operations.docs.map(item => item.ref.delete().catch(() => undefined)));
  }
  for (const path of createdPaths.filter(value => value.startsWith('platformBillingPayments/'))) {
    const payment = await db.doc(path).get().catch(() => null);
    if (payment?.exists && payment.data()?.referenceHash) await db.doc(`platformPaymentReferenceClaims/${payment.data().referenceHash}`).delete().catch(() => undefined);
  }
  for (const path of [...new Set(createdPaths)].reverse()) await db.recursiveDelete(db.doc(path)).catch(() => undefined);
  const intents = await db.collection('platformCommercialIntents').where('createdBy', '==', ownerUid).get().catch(() => ({ docs: [] }));
  for (const item of intents.docs) await db.recursiveDelete(item.ref).catch(() => undefined);
  const assistedOps = await db.collection('platformAssistedTenantOperations').where('actorUid', '==', ownerUid).get().catch(() => ({ docs: [] }));
  for (const item of assistedOps.docs) {
    const value = item.data();
    if (value.tenantId) await db.recursiveDelete(db.doc(`tenants/${value.tenantId}`)).catch(() => undefined);
    if (value.companyKey) await db.doc(`platformAssistedTenantNames/${value.companyKey}`).delete().catch(() => undefined);
    if (value.ownerUid) {
      await db.recursiveDelete(db.doc(`users/${value.ownerUid}`)).catch(() => undefined);
      await auth.deleteUser(value.ownerUid).catch(() => undefined);
    }
    await item.ref.delete().catch(() => undefined);
  }
  for (const uid of [ownerUid, adminUid, financeUid, supportUid, ...createdAuthUids]) {
    await db.doc(`platformOperators/${uid}`).delete().catch(() => undefined);
    await auth.deleteUser(uid).catch(() => undefined);
  }
  if (originalMethodsLoaded) {
    const methodsRef = db.doc('platformBillingConfig/manualMethods');
    if (originalMethodsExisted) await methodsRef.set(originalMethods).catch(() => undefined);
    else await methodsRef.delete().catch(() => undefined);
  }
  const auditRows = await db.collection('platformAuditLogs').where('operatorUid', '==', ownerUid).get().catch(() => ({ docs: [] }));
  await Promise.all(auditRows.docs.map(item => item.ref.delete().catch(() => undefined)));
  await deleteApp(app).catch(() => undefined);
}

async function run() {
  try {
    rulesEnv = await initializeTestEnvironment({ projectId, firestore: { rules: fs.readFileSync('firebase/firestore.rules', 'utf8') } });
    for (const [uid, role] of [[ownerUid, 'platform_owner'], [adminUid, 'platform_admin'], [financeUid, 'platform_finance'], [supportUid, 'platform_support']]) {
      await db.doc(`platformOperators/${uid}`).set({ uid, role, active: true });
      createdPaths.push(`platformOperators/${uid}`);
    }
    const methodsRef = db.doc('platformBillingConfig/manualMethods');
    const previousMethods = await methodsRef.get();
    originalMethodsLoaded = true;
    originalMethodsExisted = previousMethods.exists;
    originalMethods = previousMethods.exists ? previousMethods.data() : null;
    await seedPlan(planId, 'Plan Distribución QA', 20, 200);
    await seedPlan(nextPlanId, 'Plan Distribución QA Renovación', 30, 300);
    const bobPlanId = `billing-bob-plan-${suffix}`;
    await seedPlan(bobPlanId, 'Plan BOB QA', 150, 1500, 'BOB');
    const listedPlans = await platformCall(ownerUid, { action: 'listPublishedBillingPlans' });
    assert.deepEqual(listedPlans.plans.find(plan => plan.id === planId).capabilitiesV1, distributionCapabilities);
    assert.equal(listedPlans.plans.find(plan => plan.id === bobPlanId).annualMinor, 150000,
      'an approved BOB annual total is converted only to minor units, not multiplied by 12 or converted to USD');
    const bobIntentResult = await platformCall(ownerUid, { action: 'createManualCommercialIntent', requestId: opId(),
      contactName: 'Cliente BOB QA', companyName: `Distribuidora BOB anual ${suffix}`, email: `bob-plan-${suffix}@example.test`,
      contactPhone: '+591 70000003', templateId: 'distribution', planId: bobPlanId, extraIds: [], billingCycle: 'annual',
      needs: 'Prueba ficticia de unidad anual BOB.' });
    const bobIntentRef = db.doc(`platformCommercialIntents/${bobIntentResult.intentId}`);
    createdPaths.push(bobIntentRef.path);
    const bobPlanSnapshot = (await bobIntentRef.get()).data().planSnapshot;
    assert.equal(bobPlanSnapshot.annualPrice, 1500);
    assert.equal(bobPlanSnapshot.currency, 'BOB');
    assert.equal(bobPlanSnapshot.annualPriceUnit, 'annual_total_12_months');
    const legacyPlanId = `billing-legacy-annual-${suffix}`;
    createdPaths.push(`platformPlans/${legacyPlanId}`);
    await db.doc(`platformPlans/${legacyPlanId}`).set({ id: legacyPlanId, templateId: 'distribution', name: 'Plan legacy mensual QA',
      planKind: 'paid', status: 'published', priceApproval: 'approved', monthlyPriceUSD: 25, annualPriceUSD: 250, currency: 'USD',
      commercialVersion: 1, includedFeatures: ['Operación base'], technicalEntitlements: [], capabilitiesV1: distributionCapabilities });
    const legacyBillingPlans = await platformCall(ownerUid, { action: 'listPublishedBillingPlans' });
    const legacyBillingPlan = legacyBillingPlans.plans.find(plan => plan.id === legacyPlanId);
    assert.equal(legacyBillingPlan.monthlyMinor, 2500);
    assert.equal(legacyBillingPlan.annualMinor, 0, 'legacy annual amount without confirmed unit is not offered for billing');
    assert.equal(legacyBillingPlan.annualPriceUnit, null);
    await assert.rejects(platformCall(ownerUid, { action: 'createManualCommercialIntent', requestId: opId(),
      contactName: 'Cliente anual legacy QA', companyName: `Distribuidora anual ambigua ${suffix}`,
      email: `legacy-annual-${suffix}@example.test`, contactPhone: '+591 70000002', templateId: 'distribution',
      planId: legacyPlanId, extraIds: [], billingCycle: 'annual', needs: 'No debe cotizar anual sin unidad confirmada.' }),
    error => error.code === 'failed-precondition');
    pass('planes legacy conservan mensualidad y bloquean anualidad ambigua sin convertir ni alterar datos');
    await db.doc(`platformExtras/${extraId}`).set({ id: extraId, title: 'Configuración QA', pricingType: 'one_time',
      capabilityAdjustments: { activeUsers: 1, activeProducts: 1 },
      applicableTemplates: ['distribution'], status: 'published', commercialVersion: 1 });
    createdPaths.push(`platformExtras/${extraId}`);
    await db.doc(`platformExtras/${extraIdTwo}`).set({ id: extraIdTwo, title: 'Capacitación QA', pricingType: 'one_time',
      capabilityAdjustments: { activeUsers: 2, activeProducts: 1 },
      applicableTemplates: ['distribution'], status: 'published', commercialVersion: 1 });
    createdPaths.push(`platformExtras/${extraIdTwo}`);

    const createId = opId();
    const intake = { action: 'createManualCommercialIntent', requestId: createId,
      contactName: 'Cliente de prueba', companyName: `Distribuidora Billing QA ${suffix}`, email: leadEmail,
      contactPhone: '+591 70000000', templateId: 'distribution', planId, extraIds: [extraId],
      billingCycle: 'monthly', needs: 'Recorrido aislado de Billing Core.' };
    await assert.rejects(platformCall(supportUid, intake), error => error.code === 'permission-denied');
    const created = await platformCall(ownerUid, intake);
    const duplicate = await platformCall(ownerUid, intake);
    assert.equal(created.success, true);
    assert.equal(duplicate.intentId, created.intentId);
    assert.equal(duplicate.idempotent, true);
    const intentRef = db.doc(`platformCommercialIntents/${created.intentId}`);
    createdPaths.push(intentRef.path);
    let intent = (await intentRef.get()).data();
    assert.equal(intent.source, 'admin_whatsapp');
    assert.equal(intent.uid, null);
    assert.equal(intent.tenantId, null);
    assert.equal(intent.planSnapshot.planId, planId);
    assert.deepEqual(intent.planSnapshot.capabilitiesV1, distributionCapabilities);
    assert.deepEqual(intent.requestedExtraSnapshots.map(item => item.id), [extraId]);
    await assert.rejects(platformCall(ownerUid, { ...intake, contactName: 'Datos distintos' }), error => error.code === 'already-exists');
    pass('registro manual de WhatsApp valida catálogo, captura plan/extras, es idempotente y no crea tenant');

    for (const extraIds of [[extraId], [extraId, extraIdTwo]]) {
      const noPlanInput = { ...intake, requestId: opId(), companyName: `${intake.companyName} sin plan ${extraIds.length}`,
        email: `billing-extra-${extraIds.length}-${suffix}@example.test`, planId: null, extraIds };
      const noPlanResult = await platformCall(ownerUid, noPlanInput);
      const noPlanIntent = (await db.doc(`platformCommercialIntents/${noPlanResult.intentId}`).get()).data();
      createdPaths.push(`platformCommercialIntents/${noPlanResult.intentId}`);
      assert.equal(noPlanIntent.planSnapshot, null);
      assert.deepEqual(noPlanIntent.requestedExtraSnapshots.map(item => item.id), extraIds);
    }
    pass('solicitudes sin plan conservan el primer extra y todos los extras solicitados');

    const quoteInput = { action: 'saveCommercialQuote', requestId: opId(), intentId: created.intentId,
      implementation: '50.00', monthly: '20.00', annual: '200.00', currency: 'USD', billingCycle: 'monthly',
      discount: '5.00', discountReason: 'Descuento autorizado de prueba',
      extras: [{ id: extraId, oneTime: '10.00', monthly: '0', annual: '0' }] };
    await assert.rejects(platformCall(adminUid, { ...quoteInput, discount: '1.00' }), error => error.code === 'permission-denied');
    const quote = await platformCall(ownerUid, quoteInput);
    assert.equal(quote.initialDueMinor, 7500);
    const quoteReplay = await platformCall(ownerUid, quoteInput);
    assert.equal(quoteReplay.quoteVersion, quote.quoteVersion);
    intent = (await intentRef.get()).data();
    assert.equal(intent.quote.recurringMinor, 2000);
    assert.equal(intent.quote.technicalEntitlements.length, 0);
    assert.equal(intent.quote.capabilitiesV1.limits.activeUsers, 4);
    assert.equal(intent.quote.capabilitiesV1.limits.activeProducts, 3);
    pass('cotización usa centavos enteros, conserva una instantánea y limita descuentos a Owner');

    await platformCall(ownerUid, { action: 'offerCommercialQuote', intentId: created.intentId, requestId: opId() });
    await assert.rejects(platformCall(ownerUid, { ...quoteInput, requestId: opId() }), error => error.code === 'failed-precondition');
    await platformCall(ownerUid, { action: 'withdrawCommercialQuote', intentId: created.intentId, requestId: opId() });
    const secondQuote = await platformCall(ownerUid, { ...quoteInput, requestId: opId() });
    assert.equal(secondQuote.quoteVersion, quote.quoteVersion + 1);
    await platformCall(ownerUid, { action: 'offerCommercialQuote', intentId: created.intentId, requestId: opId() });
    await platformCall(ownerUid, { action: 'recordCommercialAcceptance', intentId: created.intentId, requestId: opId(), channel: 'whatsapp', reference: 'mensaje QA verificado 01' });
    const contractRequestId = opId();
    const contractDueAt = dateAfter(7);
    const contractResult = await platformCall(ownerUid, { action: 'createCommercialContract', intentId: created.intentId, requestId: contractRequestId, dueAt: contractDueAt });
    createdPaths.push(`platformContracts/${contractResult.contractId}`, `platformBillingCharges/${contractResult.chargeId}`, `platformSubscriptions/${contractResult.contractId}`);
    const contractReplay = await platformCall(ownerUid, { action: 'createCommercialContract', intentId: created.intentId, requestId: contractRequestId, dueAt: contractDueAt });
    assert.equal(contractResult.success, true);
    assert.equal(contractReplay.idempotent, true);
    let contract = (await db.doc(`platformContracts/${contractResult.contractId}`).get()).data();
    assert.equal(contract.status, 'pending_payment');
    assert.equal(contract.terms.initialDueMinor, 7500);
    assert.equal(contract.terms.technicalEntitlements.length, 0);
    pass('aceptación genera un único contrato, cargo y suscripción pendientes con términos inmutables');

    const firstPayment = await platformCall(financeUid, { action: 'recordManualPaymentReference', requestId: opId(), chargeId: contractResult.chargeId,
      amount: '25.00', method: 'bank_transfer', bankReference: `QA-BANK-${suffix}-1` });
    createdPaths.push(`platformBillingPayments/${firstPayment.paymentId}`);
    await assert.rejects(platformCall(financeUid, { action: 'recordManualPaymentReference', requestId: opId(), chargeId: contractResult.chargeId,
      amount: '25.00', method: 'bank_transfer', bankReference: `QA-BANK-${suffix}-1` }), error => error.code === 'already-exists');
    await assert.rejects(platformCall(adminUid, { action: 'confirmManualPayment', paymentId: firstPayment.paymentId, requestId: opId() }), error => error.code === 'permission-denied');
    const partial = await platformCall(financeUid, { action: 'confirmManualPayment', paymentId: firstPayment.paymentId, requestId: opId() });
    assert.equal(partial.status, 'partial');
    contract = (await db.doc(`platformContracts/${contractResult.contractId}`).get()).data();
    assert.equal(contract.status, 'pending_payment');
    const assistedInput = await prepareAssistedInput(contractResult.contractId, intake.companyName, leadEmail, opId());
    await assert.rejects(assisted.createAssistedTenant(db, auth, request(ownerUid, assistedInput)), error => error.code === 'failed-precondition');
    await assert.rejects(auth.getUserByEmail(leadEmail), error => error.code === 'auth/user-not-found');
    pass('pago parcial no activa el contrato ni permite crear cuenta Auth/empresa; referencia duplicada y permiso Admin se rechazan');

    const secondPayment = await platformCall(financeUid, { action: 'recordManualPaymentReference', requestId: opId(), chargeId: contractResult.chargeId,
      amount: '50.00', method: 'bank_qr', bankReference: `QA-BANK-${suffix}-2` });
    createdPaths.push(`platformBillingPayments/${secondPayment.paymentId}`);
    const completePayment = await platformCall(ownerUid, { action: 'confirmManualPayment', paymentId: secondPayment.paymentId, requestId: opId() });
    assert.equal(completePayment.status, 'confirmed');
    contract = (await db.doc(`platformContracts/${contractResult.contractId}`).get()).data();
    assert.equal(contract.status, 'ready_for_activation');
    const charge = (await db.doc(`platformBillingCharges/${contractResult.chargeId}`).get()).data();
    assert.equal(charge.status, 'paid');
    assert.equal(charge.paidMinor, 7500);
    pass('Owner/Finance concilian pagos parciales y el cargo queda pagado exactamente al completar el total');

    const operationId = opId();
    const provisionInput = await prepareAssistedInput(contractResult.contractId, intake.companyName, leadEmail, operationId);
    const [provisionA, provisionB] = await Promise.all([
      assisted.createAssistedTenant(db, auth, request(ownerUid, provisionInput)),
      assisted.createAssistedTenant(db, auth, request(ownerUid, provisionInput)),
    ]);
    assert.equal(provisionA.tenantId, provisionB.tenantId);
    assert.equal(provisionA.ownerUid, provisionB.ownerUid);
    assert.equal(provisionA.ownerAccess.method, 'one_time_password_setup');
    assert.equal(typeof provisionA.ownerAccess.setupLink, 'string');
    createdAuthUids.push(provisionA.ownerUid);
    const tenantRef = db.doc(`tenants/${provisionA.tenantId}`);
    const [tenantSnap, memberSnap, linkSnap, subscriptionSnap] = await Promise.all([
      tenantRef.get(), tenantRef.collection('members').doc(provisionA.ownerUid).get(),
      db.doc(`users/${provisionA.ownerUid}/tenantLinks/${provisionA.tenantId}`).get(),
      db.doc(`platformSubscriptions/${contractResult.contractId}`).get(),
    ]);
    assert.equal(tenantSnap.data().status, 'active');
    assert.equal(tenantSnap.data().subscriptionStatus, 'active');
    assert.equal(tenantSnap.data().billingEnforcement, true);
    assert.equal(tenantSnap.data().planKey, planId);
    assert.deepEqual(tenantSnap.data().entitlements, {});
    assert.deepEqual(tenantSnap.data().commercialCapabilities, intent.quote.capabilitiesV1);
    const initialCommercialUsage = (await tenantRef.collection('commercialUsage').doc('active').get()).data();
    assert.equal(initialCommercialUsage.activeUsers, 1);
    assert.equal(initialCommercialUsage.activeProducts, 0);
    assert.equal(initialCommercialUsage.activeBranches, 1);
    assert.equal(memberSnap.data().status, 'active');
    assert.equal(linkSnap.data().status, 'active');
    assert.equal(subscriptionSnap.data().status, 'active');
    assert(subscriptionSnap.data().nextRenewalAt);
    assert(subscriptionSnap.data().billingAccessUntil);
    assert(tenantSnap.data().billingAccessUntil);
    assert.equal(auth.getUser ? (await auth.getUser(provisionA.ownerUid)).disabled : true, false);
    const setupUrl = new URL(provisionA.ownerAccess.setupLink);
    const oobCode = setupUrl.searchParams.get('oobCode');
    assert(oobCode, 'One-time owner setup link must contain an Auth action code.');
    const resetResponse = await fetch(`http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:resetPassword?key=emulator`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ oobCode, newPassword: 'BillingOwnerQa123!' }),
    });
    assert.equal(resetResponse.ok, true, 'The one-time setup link must let the owner set a password.');
    const login = await signInOwner(leadEmail, 'BillingOwnerQa123!');
    assert.equal(login.localId, provisionA.ownerUid);
    const signedInActor = await tenantActor(db, { auth: { uid: login.localId, token: {} }, data: { tenantId: provisionA.tenantId } }, 'settings.manage');
    assert.equal(signedInActor.uid, login.localId);
    pass('solo el pago inicial íntegro habilita tenant y suscripción; el propietario configura su acceso e inicia sesión en la empresa');

    const additionalTemplateCases = [
      { businessType: 'hamburger_shop', templateId: 'hamburger', label: 'Hamburger' },
      { businessType: 'gelateria_weight_cafe', templateId: 'retail', label: 'Comercio' },
      { businessType: 'restaurant_pos', templateId: 'restaurant', label: 'Restaurante con salón' },
      { businessType: 'nightclub_lounge', templateId: 'nightclub', label: 'Nightclub' },
    ];
    for (const item of additionalTemplateCases) {
      const templateEmail = `billing-${item.templateId}-${suffix}@example.test`;
      const templateCompany = `${item.label} Billing QA ${suffix}`;
      const templateCapabilities = capabilitiesFor(item.businessType);
      const templateIntent = await platformCall(ownerUid, {
        action: 'createManualCommercialIntent', requestId: opId(), contactName: `Propietario ${item.label} QA`,
        companyName: templateCompany, email: templateEmail, contactPhone: '+591 70000000',
        templateId: item.templateId, planId: null, extraIds: [], billingCycle: 'monthly', needs: 'Alta asistida de validación en emulador.',
      });
      createdPaths.push(`platformCommercialIntents/${templateIntent.intentId}`);
      const templateQuote = await platformCall(ownerUid, {
        action: 'saveCommercialQuote', requestId: opId(), intentId: templateIntent.intentId,
        implementation: '0', monthly: '25.00', annual: '', currency: 'BOB', billingCycle: 'monthly', periodCount: 1,
        discount: '0', capabilitiesV1: templateCapabilities, extras: [],
      });
      assert.equal(templateQuote.initialDueMinor, 2500, `${item.label}: the manual monthly quote must create the exact initial charge.`);
      await platformCall(ownerUid, { action: 'offerCommercialQuote', intentId: templateIntent.intentId, requestId: opId() });
      await platformCall(ownerUid, { action: 'recordCommercialAcceptance', intentId: templateIntent.intentId,
        requestId: opId(), channel: 'whatsapp', reference: `Aceptación QA ficticia ${item.templateId}.` });
      const templateContract = await platformCall(ownerUid, { action: 'createCommercialContract', intentId: templateIntent.intentId,
        requestId: opId(), dueAt: dateAfter(7) });
      createdPaths.push(`platformContracts/${templateContract.contractId}`, `platformBillingCharges/${templateContract.chargeId}`,
        `platformSubscriptions/${templateContract.contractId}`);
      const templateCharge = (await db.doc(`platformBillingCharges/${templateContract.chargeId}`).get()).data();
      assert.equal(templateCharge.amountMinor, 2500);
      assert.equal(templateCharge.currency, 'BOB');
      const templateReference = await platformCall(financeUid, {
        action: 'recordManualPaymentReference', requestId: opId(), chargeId: templateContract.chargeId,
        amount: '25.00', method: 'bank_transfer', bankReference: `QA-${item.templateId}-${suffix}`,
      });
      createdPaths.push(`platformBillingPayments/${templateReference.paymentId}`);
      assert.equal((await db.doc(`platformBillingPayments/${templateReference.paymentId}`).get()).data().status, 'pending_review');
      assert.equal((await db.doc(`platformContracts/${templateContract.contractId}`).get()).data().status, 'pending_payment');
      const templateConfirmation = await platformCall(financeUid, { action: 'confirmManualPayment', paymentId: templateReference.paymentId, requestId: opId() });
      assert.equal(templateConfirmation.status, 'confirmed');
      const templateContractRecord = (await db.doc(`platformContracts/${templateContract.contractId}`).get()).data();
      assert.equal(templateContractRecord.status, 'ready_for_activation');
      assert.equal(templateContractRecord.terms.plan, null, `${item.label}: unpublished-plan flow must retain a manual capabilities snapshot.`);
      const templateActivation = await assisted.createAssistedTenant(db, auth, request(ownerUid,
        await prepareAssistedInput(templateContract.contractId, templateCompany, templateEmail, opId(), `Propietario ${item.label} QA`, item.businessType)));
      createdAuthUids.push(templateActivation.ownerUid);
      const templateTenantRef = db.doc(`tenants/${templateActivation.tenantId}`);
      const templateTenant = (await templateTenantRef.get()).data();
      assert.equal(templateTenant.businessType, item.businessType);
      assert.equal(templateTenant.status, 'active');
      assert.equal(templateTenant.subscriptionStatus, 'active');
      assert.equal(templateTenant.billingEnforcement, true);
      assert.equal(templateTenant.planKey, null);
      assert.deepEqual(templateTenant.commercialCapabilities, templateCapabilities);
      assert.equal((await db.doc(`platformSubscriptions/${templateContract.contractId}`).get()).data().status, 'active');

      const setupUrl = new URL(templateActivation.ownerAccess.setupLink);
      const setupCode = setupUrl.searchParams.get('oobCode');
      assert(setupCode, `${item.label}: assisted activation should create a one-time owner access link.`);
      const passwordSetup = await fetch(`http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:resetPassword?key=emulator`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ oobCode: setupCode, newPassword: `TemplateOwner${item.templateId}123!` }),
      });
      assert.equal(passwordSetup.ok, true, `${item.label}: owner should be able to set a password through the Auth Emulator.`);
      const templateLogin = await signInOwner(templateEmail, `TemplateOwner${item.templateId}123!`);
      assert.equal(templateLogin.localId, templateActivation.ownerUid);
      const templateActor = await tenantActor(db, { auth: { uid: templateLogin.localId, token: {} },
        data: { tenantId: templateActivation.tenantId } }, 'settings.manage');
      assert.equal(templateActor.uid, templateActivation.ownerUid);
      pass(`${item.label}: sin plan publicado, cotización mensual, referencia pendiente, conciliación y alta asistida con acceso Owner pasan en emulador`);
    }

    const quotaMemberUids = [];
    for (let index = 0; index < 3; index += 1) {
      const member = await tenants.manageMember(db, auth, {
        auth: { uid: provisionA.ownerUid, token: {} },
        data: { tenantId: provisionA.tenantId, action: 'createMember', operationId: opId(), roleId: 'warehouse',
          email: `cap-user-${index}-${suffix}@example.test`, displayName: `Almacén ${index}`, password: 'CapUserQa123!', branchIds: ['main'] },
      });
      createdAuthUids.push(member.uid);
      quotaMemberUids.push(member.uid);
    }
    const userUsageAtLimit = (await tenantRef.collection('commercialUsage').doc('active').get()).data();
    assert.equal(userUsageAtLimit.activeUsers, 4);
    assert.equal((await tenantRef.get()).data().userCount, 4);
    assert.notEqual(quotaMemberUids[1], provisionA.ownerUid, 'Quota test must modify a created member, never the tenant owner.');
    assert.notEqual(quotaMemberUids[1], ownerUid, 'Quota test must modify a created member, never the Platform operator.');
    await tenants.manageMember(db, auth, { auth: { uid: provisionA.ownerUid, token: {} },
      data: { tenantId: provisionA.tenantId, action: 'updateMember', uid: quotaMemberUids[1], roleId: 'distributor' } });
    assert.equal((await tenantRef.collection('commercialUsage').doc('active').get()).data().activeUsers, 4,
      'Changing an active member role must not change the active-user quota.');
    await tenants.manageMember(db, auth, { auth: { uid: provisionA.ownerUid, token: {} },
      data: { tenantId: provisionA.tenantId, action: 'updateMember', uid: quotaMemberUids[1], active: false } });
    assert.equal((await tenantRef.collection('commercialUsage').doc('active').get()).data().activeUsers, 3);
    await tenants.manageMember(db, auth, { auth: { uid: provisionA.ownerUid, token: {} },
      data: { tenantId: provisionA.tenantId, action: 'updateMember', uid: quotaMemberUids[1], active: true } });
    assert.equal((await tenantRef.collection('commercialUsage').doc('active').get()).data().activeUsers, 4);
    const rejectedEmail = `cap-user-over-${suffix}@example.test`;
    await assert.rejects(tenants.manageMember(db, auth, {
      auth: { uid: provisionA.ownerUid, token: {} },
      data: { tenantId: provisionA.tenantId, action: 'createMember', operationId: opId(), roleId: 'warehouse',
        email: rejectedEmail, displayName: 'Fuera de cupo', password: 'CapUserQa123!', branchIds: ['main'] },
    }), error => error.code === 'resource-exhausted');
    await assert.rejects(auth.getUserByEmail(rejectedEmail), error => error.code === 'auth/user-not-found');
    assert.equal((await tenantRef.collection('commercialUsage').doc('active').get()).data().activeUsers, 4);
    for (let index = 0; index < 3; index += 1) {
      const savedProduct = await runDistributionProductSave(provisionA.tenantId, provisionA.ownerUid, `cap-product-${suffix}-${index}`, `cap-product-${index}`);
      assert.equal(savedProduct.status, 'confirmed');
    }
    let productUsage = (await tenantRef.collection('commercialUsage').doc('active').get()).data();
    assert.equal(productUsage.activeProducts, 3);
    const rejectedProduct = await runDistributionProductSave(provisionA.tenantId, provisionA.ownerUid, `cap-product-extra-${suffix}`, 'cap-product-extra');
    assert.equal(rejectedProduct.status, 'rejected');
    assert.match(rejectedProduct.error, /límite de productos activos/i);
    await runDistributionProductSave(provisionA.tenantId, provisionA.ownerUid, `cap-product-${suffix}-0`, 'cap-product-archive', false);
    productUsage = (await tenantRef.collection('commercialUsage').doc('active').get()).data();
    assert.equal(productUsage.activeProducts, 2, 'Archiving a product must free one slot while retaining its document.');
    const replacementProduct = await runDistributionProductSave(provisionA.tenantId, provisionA.ownerUid, `cap-product-replacement-${suffix}`, 'cap-product-replacement');
    assert.equal(replacementProduct.status, 'confirmed');
    productUsage = (await tenantRef.collection('commercialUsage').doc('active').get()).data();
    assert.equal(productUsage.activeProducts, 3, 'A replacement product may use the released slot.');
    assert.equal((await tenantRef.collection('distProducts').doc(`cap-product-${suffix}-0`).get()).data().active, false,
      'Archiving retains the historical product document.');
    pass('cuotas de usuarios/productos se aplican en backend; cambios de rol conservan conteo, rechazo de cupo, archivo histórico y reemplazo funcionan');

    let tenant = tenantSnap.data();
    const member = memberSnap.data();
    assert.equal(hasPermission({ ...tenant, subscriptionStatus: 'pending' }, member, 'settings.manage'), false);
    const legacyTenant = { ...tenant };
    delete legacyTenant.billingEnforcement;
    delete legacyTenant.subscriptionStatus;
    assert.equal(hasPermission(legacyTenant, member, 'settings.manage'), true);
    assert.equal(hasPermission(tenant, { ...member, tenantId: 'other-tenant' }, 'settings.manage'), false);
    pass('tenants con enforcement bloquean estados no activos; empresas legacy e aislamiento de tenant conservan su semántica');

    const tenantClient = rulesEnv.authenticatedContext(provisionA.ownerUid).firestore();
    const tenantDocument = doc(tenantClient, `tenants/${provisionA.tenantId}`);
    const billingNow = Date.now();
    const graceUntil = Timestamp.fromMillis(billingNow + 3 * 86_400_000);
    await tenantRef.update({ subscriptionStatus: 'active', billingAccessUntil: graceUntil });
    assert((await getDoc(tenantDocument)).exists());
    assert(hasTenantBillingAccess((await tenantRef.get()).data()));
    await tenantRef.update({ subscriptionStatus: 'overdue', billingAccessUntil: graceUntil });
    assert((await getDoc(tenantDocument)).exists(), 'Firestore allows an overdue subscription inside grace');
    assert(hasTenantBillingAccess((await tenantRef.get()).data()));
    await tenantRef.update({ subscriptionStatus: 'active', billingAccessUntil: Timestamp.fromMillis(billingNow - 1) });
    await assertFails(getDoc(tenantDocument));
    assert.equal(hasTenantBillingAccess((await tenantRef.get()).data()), false);
    await tenantRef.update({ subscriptionStatus: 'overdue', billingAccessUntil: Timestamp.fromMillis(billingNow - 1) });
    await assertFails(getDoc(tenantDocument));
    for (const status of ['suspended', 'cancelled', 'pending']) {
      await tenantRef.update({ subscriptionStatus: status, billingAccessUntil: graceUntil });
      await assertFails(getDoc(tenantDocument));
      assert.equal(hasTenantBillingAccess((await tenantRef.get()).data()), false);
    }
    const distributionFunctionResults = [];
    for (const [status, until] of [
      ['active', graceUntil], ['overdue', graceUntil], ['active', Timestamp.fromMillis(billingNow - 1)],
      ['suspended', graceUntil], ['cancelled', graceUntil],
    ]) {
      await tenantRef.update({ subscriptionStatus: status, billingAccessUntil: until });
      distributionFunctionResults.push(await runDistributionAdjustment(provisionA.tenantId, provisionA.ownerUid, `billing-${status}`));
    }
    assert(!/suscripci[oó]n/i.test(distributionFunctionResults[0].error || ''), 'Active subscription reaches Distribution handler');
    assert(!/suscripci[oó]n/i.test(distributionFunctionResults[1].error || ''), 'Grace subscription reaches Distribution handler');
    for (const result of distributionFunctionResults.slice(2)) assert.match(result.error, /suscripci[oó]n/i);
    const legacyWithNoBillingFields = { ...tenant };
    delete legacyWithNoBillingFields.billingEnforcement;
    delete legacyWithNoBillingFields.subscriptionStatus;
    delete legacyWithNoBillingFields.billingAccessUntil;
    await tenantRef.set(legacyWithNoBillingFields);
    assert((await getDoc(tenantDocument)).exists(), 'Firestore preserves direct access for legacy tenant without billing fields');
    assert(hasTenantBillingAccess((await tenantRef.get()).data()));
    const legacyFunctionResult = await runDistributionAdjustment(provisionA.tenantId, provisionA.ownerUid, 'billing-legacy');
    assert(!/suscripci[oó]n/i.test(legacyFunctionResult.error || ''), 'Legacy tenant reaches Distribution handler');
    const validTenantFunction = await tenants.updateSettings(db, { auth: { uid: provisionA.ownerUid, token: {} }, data: { tenantId: provisionA.tenantId, name: 'Tenant QA acceso válido' } });
    assert.equal(validTenantFunction.changed, true);
    await tenantRef.update({ billingEnforcement: true, subscriptionStatus: 'suspended', billingAccessUntil: graceUntil });
    await assert.rejects(() => tenants.updateSettings(db, { auth: { uid: provisionA.ownerUid, token: {} }, data: { tenantId: provisionA.tenantId, name: 'No debe guardarse' } }), error => error.code === 'permission-denied');
    pass('Firestore Rules y Functions distinguen activa, gracia de 7 días, vencida, suspendida, cancelada, pendiente y legacy; Distribución y Function tenant bloquean acceso');

    const subscriptionRef = db.doc(`platformSubscriptions/${contractResult.contractId}`);
    await subscriptionRef.update({ status: 'overdue', currentPeriodEnd: Timestamp.fromMillis(billingNow - 1), billingAccessUntil: graceUntil });
    let listed = await platformCall(ownerUid, { action: 'listBillingRecords', kind: 'subscriptions', limit: 100 });
    assert.equal(listed.records.find(item => item.id === contractResult.contractId).effectiveStatus, 'grace');
    await subscriptionRef.update({ currentPeriodEnd: Timestamp.fromMillis(billingNow - 8 * 86_400_000), billingAccessUntil: Timestamp.fromMillis(billingNow - 1) });
    listed = await platformCall(ownerUid, { action: 'listBillingRecords', kind: 'subscriptions', limit: 100 });
    assert.equal(listed.records.find(item => item.id === contractResult.contractId).effectiveStatus, 'expired');
    await subscriptionRef.update({ status: 'active' });
    pass('Admin recibe estados efectivos de gracia y vencida sin una Function programada');

    await db.doc(`platformSubscriptions/${contractResult.contractId}`).update({ currentPeriodEnd: Timestamp.fromMillis(Date.now() + 10 * 86_400_000) });
    const changeId = opId();
    const change = await platformCall(ownerUid, { action: 'requestSubscriptionPlanChange', requestId: changeId,
      contractId: contractResult.contractId, planId: nextPlanId, billingCycle: 'monthly' });
    const changeReplay = await platformCall(ownerUid, { action: 'requestSubscriptionPlanChange', requestId: changeId,
      contractId: contractResult.contractId, planId: nextPlanId, billingCycle: 'monthly' });
    assert.equal(change.idempotent, false);
    assert.equal(changeReplay.idempotent, true);
    const scheduled = (await db.doc(`platformSubscriptions/${contractResult.contractId}`).get()).data();
    const originalScheduledTenant = (await tenantRef.get()).data();
    assert.equal(scheduled.planKey, planId, 'the current plan remains effective until next renewal');
    assert.equal(scheduled.pendingPlanChange.planSnapshot.planId, nextPlanId);
    assert.deepEqual(scheduled.pendingPlanChange.planSnapshot.capabilitiesV1.limits, { activeUsers: 4, activeProducts: 3, activeBranches: 1 });
    assert.equal((await db.doc(`platformContracts/${contractResult.contractId}`).get()).data().terms.plan.planId, planId, 'accepted terms remain immutable');
    await subscriptionRef.update({ status: 'active', currentPeriodEnd: Timestamp.fromMillis(Date.now() + 10 * 86_400_000), billingAccessUntil: Timestamp.fromMillis(Date.now() + 17 * 86_400_000) });
    const renewal = await platformCall(ownerUid, { action: 'createRenewalCharge', contractId: contractResult.contractId, requestId: opId(), dueAt: dateAfter(7) });
    createdPaths.push(`platformBillingCharges/${renewal.chargeId}`);
    const duplicateRenewal = await platformCall(ownerUid, { action: 'createRenewalCharge', contractId: contractResult.contractId, requestId: opId(), dueAt: dateAfter(7) });
    assert.equal(duplicateRenewal.chargeId, renewal.chargeId);
    assert.equal(duplicateRenewal.reusedPendingCharge, true);
    const renewalData = (await db.doc(`platformBillingCharges/${renewal.chargeId}`).get()).data();
    assert.equal(renewalData.amountMinor, 3000);
    assert.equal(renewalData.planSnapshot.planId, nextPlanId);
    pass('cambio de plan idempotente se aplica solo en la próxima renovación; no duplica el cargo');

    const renewalPayment = await platformCall(financeUid, { action: 'recordManualPaymentReference', requestId: opId(), chargeId: renewal.chargeId,
      amount: '30.00', method: 'bank_transfer', bankReference: `QA-BANK-${suffix}-3` });
    createdPaths.push(`platformBillingPayments/${renewalPayment.paymentId}`);
    await assert.rejects(platformCall(financeUid, { action: 'confirmManualPayment', paymentId: renewalPayment.paymentId, requestId: opId() }),
      error => error.code === 'failed-precondition', 'A scheduled plan payment cannot grant its destination plan before the agreed date.');
    const beforeEffectiveDate = (await subscriptionRef.get()).data();
    assert.equal(beforeEffectiveDate.planKey, planId);
    assert.deepEqual(beforeEffectiveDate.capabilitiesV1, scheduled.capabilitiesV1,
      'The current subscription capabilities remain unchanged before the effective date.');
    assert.equal(beforeEffectiveDate.pendingPlanChange.planSnapshot.planId, nextPlanId);
    assert.equal((await tenantRef.get()).data().planKey, planId);
    assert.deepEqual((await tenantRef.get()).data().commercialCapabilities, originalScheduledTenant.commercialCapabilities);
    const effectiveAt = Timestamp.fromMillis(Date.now() - 1_000);
    await subscriptionRef.update({ currentPeriodEnd: effectiveAt, nextRenewalAt: effectiveAt,
      pendingPlanChange: { ...beforeEffectiveDate.pendingPlanChange, effectiveAt },
      billingAccessUntil: Timestamp.fromMillis(Date.now() + 7 * 86_400_000) });
    await tenantRef.update({ billingAccessUntil: Timestamp.fromMillis(Date.now() + 7 * 86_400_000) });
    await platformCall(financeUid, { action: 'confirmManualPayment', paymentId: renewalPayment.paymentId, requestId: opId() });
    const updatedSubscription = (await db.doc(`platformSubscriptions/${contractResult.contractId}`).get()).data();
    assert.equal(updatedSubscription.planKey, nextPlanId);
    assert.deepEqual(updatedSubscription.capabilitiesV1.limits, { activeUsers: 4, activeProducts: 3, activeBranches: 1 });
    assert.equal(updatedSubscription.pendingPlanChange, undefined);
    assert.equal((await tenantRef.get()).data().planKey, nextPlanId);
    assert.equal((await db.doc(`platformContracts/${contractResult.contractId}`).get()).data().terms.plan.planId, planId);
    pass('renovación conciliada actualiza el plan activo sin reescribir el snapshot contractual');

    await platformCall(ownerUid, { action: 'changeSubscriptionStatus', contractId: contractResult.contractId,
      status: 'suspended', reason: 'Suspensión QA por control de acceso.', requestId: opId() });
    tenant = (await tenantRef.get()).data();
    assert.equal(tenant.subscriptionStatus, 'suspended');
    assert.equal(hasPermission(tenant, member, 'settings.manage'), false);
    pass('suspensión y autorización del servidor bloquean la operación tenant sin afectar tenants legacy');

    await Promise.all([
      db.doc(`platformPlans/${planId}`).update({ status: 'draft' }),
      db.doc(`platformPlans/${nextPlanId}`).update({ status: 'draft' }),
      db.doc(`platformPlans/${bobPlanId}`).update({ status: 'draft' }),
    ]);
    const remainingPublishedPlans = await db.collection('platformPlans').where('status', '==', 'published').get();
    assert.deepEqual(remainingPublishedPlans.docs.filter(item => item.data().templateId === 'distribution').map(item => item.id), [legacyPlanId],
      'the legacy fixture remains published only to verify monthly-only legacy compatibility below');

    const monthlyOnlyEmail = `billing-monthly-only-${suffix}@example.test`;
    const monthlyOnlyIntake = {
      action: 'createManualCommercialIntent', requestId: opId(), contactName: 'Contacto WhatsApp QA',
      companyName: `Distribuidora mensual sin plan ${suffix}`, email: monthlyOnlyEmail,
      contactPhone: '+591 70000001', templateId: 'distribution', planId: null, extraIds: [],
      billingCycle: 'monthly', needs: 'Cotización mensual sin plan publicado.',
    };
    const monthlyOnlyLead = await platformCall(ownerUid, monthlyOnlyIntake);
    const monthlyOnlyIntentRef = db.doc(`platformCommercialIntents/${monthlyOnlyLead.intentId}`);
    createdPaths.push(monthlyOnlyIntentRef.path);
    const monthlyOnlyIntent = (await monthlyOnlyIntentRef.get()).data();
    assert.equal(monthlyOnlyIntent.source, 'admin_whatsapp');
    assert.equal(monthlyOnlyIntent.planSnapshot, null);
    assert.equal(monthlyOnlyIntent.tenantId, null);

    const monthlyOnlyQuoteInput = {
      action: 'saveCommercialQuote', requestId: opId(), intentId: monthlyOnlyLead.intentId,
      implementation: '0', monthly: '30.00', annual: '', currency: 'BOB', billingCycle: 'monthly',
      periodCount: 3,
      discount: '0', capabilitiesV1: distributionCapabilities,
      extras: [{ id: extraId, oneTime: '0', monthly: '0', annual: '0' }, { id: extraIdTwo, oneTime: '0', monthly: '0', annual: '0' }],
    };
    const monthlyOnlyQuote = await platformCall(ownerUid, monthlyOnlyQuoteInput);
    const monthlyOnlyReplay = await platformCall(ownerUid, monthlyOnlyQuoteInput);
    assert.equal(monthlyOnlyQuote.quoteVersion, monthlyOnlyReplay.quoteVersion);
    assert.equal(monthlyOnlyReplay.idempotent, true);
    let monthlyQuote = (await monthlyOnlyIntentRef.get()).data().quote;
    assert.equal(monthlyQuote.monthlyMinor, 3000);
    assert.equal(monthlyQuote.annualMinor, 0);
    assert.equal(monthlyQuote.initialDueMinor, 9000);
    assert.equal(monthlyQuote.recurringMinor, 3000);
    assert.equal(monthlyQuote.periodCount, 3);
    assert.equal(monthlyQuote.monthsCovered, 3);
    assert.equal(monthlyQuote.capabilitiesV1.limits.activeUsers, distributionCapabilities.limits.activeUsers + 3,
      'Extras augment explicit capabilities when the quote has no plan snapshot.')
    assert.equal(monthlyQuote.capabilitiesV1.limits.activeProducts, distributionCapabilities.limits.activeProducts + 2)
    await assert.rejects(platformCall(ownerUid, {
      ...monthlyOnlyQuoteInput, requestId: opId(), billingCycle: 'annual', annual: '0',
    }), error => error.code === 'failed-precondition');
    assert.equal((await monthlyOnlyIntentRef.get()).data().quote.version, monthlyOnlyQuote.quoteVersion);
    await platformCall(ownerUid, { action: 'offerCommercialQuote', intentId: monthlyOnlyLead.intentId, requestId: opId() });
    await platformCall(ownerUid, { action: 'recordCommercialAcceptance', intentId: monthlyOnlyLead.intentId,
      requestId: opId(), channel: 'whatsapp', reference: 'Aceptación mensual QA verificada.' });
    const monthlyOnlyContract = await platformCall(ownerUid, { action: 'createCommercialContract', intentId: monthlyOnlyLead.intentId,
      requestId: opId(), dueAt: dateAfter(7) });
    createdPaths.push(`platformContracts/${monthlyOnlyContract.contractId}`, `platformBillingCharges/${monthlyOnlyContract.chargeId}`,
      `platformSubscriptions/${monthlyOnlyContract.contractId}`);
    const monthlyContract = (await db.doc(`platformContracts/${monthlyOnlyContract.contractId}`).get()).data();
    assert.equal(monthlyContract.terms.plan, null);
    assert.equal(monthlyContract.terms.billingCycle, 'monthly');
    assert.equal(monthlyContract.terms.periodCount, 3);
    assert.equal(monthlyContract.terms.monthsCovered, 3);
    assert.equal(monthlyContract.terms.annualMinor, 0);
    assert.equal(monthlyContract.terms.capabilitiesV1.limits.activeUsers, distributionCapabilities.limits.activeUsers + 3)
    assert.equal(monthlyContract.terms.capabilitiesV1.limits.activeProducts, distributionCapabilities.limits.activeProducts + 2)
    assert.equal(monthlyContract.terms.initialDueMinor, 9000);
    const noteRequest = { action: 'addBillingInternalNote', requestId: opId(), contractId: monthlyOnlyContract.contractId,
      note: 'Validar datos comerciales enviados por WhatsApp antes de emitir la siguiente renovación.' };
    const noteSaved = await platformCall(financeUid, noteRequest);
    createdPaths.push(`platformBillingNotes/${noteSaved.noteId}`);
    const noteReplay = await platformCall(financeUid, noteRequest);
    assert.equal(noteReplay.noteId, noteSaved.noteId);
    assert.equal(noteReplay.idempotent, true);
    const listedNotes = await platformCall(ownerUid, { action: 'listBillingInternalNotes', contractId: monthlyOnlyContract.contractId, limit: 10 });
    assert.equal(listedNotes.notes.length, 1);
    assert.equal(listedNotes.notes[0].actorRole, 'platform_finance');
    await assert.rejects(platformCall(supportUid, { action: 'listBillingInternalNotes', contractId: monthlyOnlyContract.contractId }), error => error.code === 'permission-denied');
    await assert.rejects(platformCall(supportUid, { action: 'addBillingInternalNote', requestId: opId(), contractId: monthlyOnlyContract.contractId, note: 'Nota no autorizada.' }), error => error.code === 'permission-denied');
    pass('observaciones internas son privadas, paginables, auditadas e idempotentes; Support no puede leerlas ni crearlas');
    const monthlyPayment = await platformCall(financeUid, { action: 'recordManualPaymentReference', requestId: opId(),
      chargeId: monthlyOnlyContract.chargeId, amount: '30.00', method: 'bank_transfer', bankReference: `QA-MONTHLY-${suffix}-1` });
    createdPaths.push(`platformBillingPayments/${monthlyPayment.paymentId}`);
    const monthlyPartial = await platformCall(ownerUid, { action: 'confirmManualPayment', paymentId: monthlyPayment.paymentId, requestId: opId() });
    assert.equal(monthlyPartial.status, 'partial');
    assert.equal((await db.doc(`platformContracts/${monthlyOnlyContract.contractId}`).get()).data().status, 'pending_payment');
    const monthlyPaymentTwo = await platformCall(financeUid, { action: 'recordManualPaymentReference', requestId: opId(),
      chargeId: monthlyOnlyContract.chargeId, amount: '60.00', method: 'bank_qr', bankReference: `QA-MONTHLY-${suffix}-2` });
    createdPaths.push(`platformBillingPayments/${monthlyPaymentTwo.paymentId}`);
    const monthlyPaymentConfirmation = await platformCall(ownerUid, { action: 'confirmManualPayment', paymentId: monthlyPaymentTwo.paymentId, requestId: opId() });
    assert.equal(monthlyPaymentConfirmation.status, 'confirmed');
    const monthlyProvisionInput = await prepareAssistedInput(monthlyOnlyContract.contractId, monthlyOnlyIntake.companyName,
      monthlyOnlyEmail, opId(), 'Propietario mensual QA');
    const monthlyProvision = await assisted.createAssistedTenant(db, auth, request(ownerUid, monthlyProvisionInput));
    createdAuthUids.push(monthlyProvision.ownerUid);
    const monthlyTenant = (await db.doc(`tenants/${monthlyProvision.tenantId}`).get()).data();
    assert.equal(monthlyTenant.businessType, 'route_distribution');
    assert.equal(monthlyTenant.status, 'active');
    assert.equal(monthlyTenant.subscriptionStatus, 'active');
    assert.equal(monthlyTenant.planKey, null);
    assert.deepEqual(monthlyTenant.entitlements, {});
    const monthlySubscription = (await db.doc(`platformSubscriptions/${monthlyOnlyContract.contractId}`).get()).data();
    assert.equal(monthlySubscription.monthsCovered, 3);
    assert.equal(monthlySubscription.periodCount, 3);
    assert(monthlySubscription.currentPeriodEnd.toMillis() > monthlySubscription.currentPeriodStart.toMillis() + 80 * 86_400_000,
      'Three confirmed monthly periods cover at least 80 calendar days.');
    const fakeMethods = { available: true, qrEnabled: false, transferEnabled: true, qrImageUrl: '', bankName: 'Banco QA Emulador',
      accountHolder: 'PACHAX QA Ficticio', accountIdentifier: 'CUENTA-QA-000', transferCurrency: 'BOB', instructions: 'Datos ficticios. No transferir.', whatsappNumber: '+59170000000' };
    await assert.rejects(platformCall(adminUid, { action: 'saveManualPaymentMethods', requestId: opId(), methods: fakeMethods }), error => error.code === 'permission-denied');
    const methodsSaved = await platformCall(ownerUid, { action: 'saveManualPaymentMethods', requestId: opId(), methods: fakeMethods });
    assert.equal(methodsSaved.success, true);
    const methodsRead = await platformCall(financeUid, { action: 'getManualPaymentMethods' });
    assert.equal(methodsRead.methods.available, true);
    assert.equal(methodsRead.methods.accountIdentifier, fakeMethods.accountIdentifier);
    const tenantOverview = await commercialBilling.getTenantBillingOverview(db, { auth: { uid: monthlyProvision.ownerUid, token: {} },
      data: { tenantId: monthlyProvision.tenantId } });
    assert.equal(tenantOverview.enrolled, true);
    assert.equal(tenantOverview.subscription.companyName, monthlyOnlyIntake.companyName);
    assert.equal(tenantOverview.subscription.monthsCovered, 3);
    assert.equal(tenantOverview.paymentMethods.accountIdentifier, fakeMethods.accountIdentifier);
    await assert.rejects(() => commercialBilling.getTenantBillingOverview(db, { auth: { uid: monthlyProvision.ownerUid, token: {} },
      data: { tenantId: provisionA.tenantId } }), error => error.code === 'permission-denied');
    const billingEmployeeUid = `billing-employee-${suffix}`;
    const billingEmployeeRef = db.doc(`tenants/${monthlyProvision.tenantId}/members/${billingEmployeeUid}`);
    await billingEmployeeRef.set({ uid: billingEmployeeUid, roleId: 'cashier', status: 'active', branchIds: ['main'] });
    createdPaths.push(billingEmployeeRef.path);
    await assert.rejects(() => commercialBilling.getTenantBillingOverview(db, { auth: { uid: billingEmployeeUid, token: {} },
      data: { tenantId: monthlyProvision.tenantId } }), error => error.code === 'permission-denied');
    await assert.rejects(() => commercialBilling.recordManualPaymentReference(db, { auth: { uid: billingEmployeeUid, token: {} }, data: {
      tenantId: monthlyProvision.tenantId, requestId: opId(), chargeId: monthlyOnlyContract.chargeId,
      amount: '1.00', method: 'bank_transfer', bankReference: `QA-EMPLOYEE-${suffix}` } }), error => error.code === 'permission-denied');
    pass('propietario consulta solo su facturación; empleado activo y propietario no autorizado de otra empresa quedan denegados');
    await assert.rejects(platformCall(adminUid, { action: 'saveManualPaymentMethods', requestId: opId(), methods: { ...fakeMethods, available: false } }), error => error.code === 'permission-denied');
    pass('métodos ficticios configurables solo por Platform Owner; Finance consulta; portal tenant restringe la empresa al propietario');

    const monthlySubscriptionRef = db.doc(`platformSubscriptions/${monthlyOnlyContract.contractId}`);
    const dueEnd = Timestamp.fromMillis(Date.now() + 10 * 86_400_000);
    await monthlySubscriptionRef.update({ currentPeriodEnd: dueEnd, nextRenewalAt: dueEnd, billingAccessUntil: Timestamp.fromMillis(dueEnd.toMillis() + 7 * 86_400_000), billingAnchorDay: 14 });
    await db.doc(`tenants/${monthlyProvision.tenantId}`).update({ billingAccessUntil: Timestamp.fromMillis(dueEnd.toMillis() + 7 * 86_400_000) });
    const prepaidRenewal = await platformCall(ownerUid, { action: 'createRenewalCharge', contractId: monthlyOnlyContract.contractId,
      requestId: opId(), dueAt: dateAfter(7), periodCount: 2 });
    createdPaths.push(`platformBillingCharges/${prepaidRenewal.chargeId}`);
    const prepaidCharge = (await db.doc(`platformBillingCharges/${prepaidRenewal.chargeId}`).get()).data();
    assert.equal(prepaidCharge.amountMinor, 6000);
    assert.equal(prepaidCharge.periodCount, 2);
    assert.equal(prepaidCharge.monthsCovered, 2);
    assert(prepaidCharge.periodEnd.toMillis() > prepaidCharge.periodStart.toMillis() + 55 * 86_400_000);
    const tenantReference = await commercialBilling.recordManualPaymentReference(db, { auth: { uid: monthlyProvision.ownerUid, token: {} }, data: {
      tenantId: monthlyProvision.tenantId, requestId: opId(), chargeId: prepaidRenewal.chargeId, amount: '30.00', method: 'bank_transfer', bankReference: `QA-OWNER-${suffix}-1` } });
    createdPaths.push(`platformBillingPayments/${tenantReference.paymentId}`);
    await assert.rejects(() => commercialBilling.recordManualPaymentReference(db, { auth: { uid: monthlyProvision.ownerUid, token: {} }, data: {
      tenantId: monthlyProvision.tenantId, requestId: opId(), chargeId: prepaidRenewal.chargeId, amount: '30.00', method: 'bank_transfer', bankReference: `QA-OWNER-${suffix}-1` } }), error => error.code === 'already-exists');
    await assert.rejects(platformCall(monthlyProvision.ownerUid, { action: 'confirmManualPayment', paymentId: tenantReference.paymentId, requestId: opId() }), error => error.code === 'permission-denied');
    const tenantPartialConfirmation = await platformCall(financeUid, { action: 'confirmManualPayment', paymentId: tenantReference.paymentId, requestId: opId() });
    assert.equal(tenantPartialConfirmation.status, 'partial');
    assert.equal((await db.doc(`platformBillingCharges/${prepaidRenewal.chargeId}`).get()).data().status, 'partial');
    const tenantReferenceTwo = await commercialBilling.recordManualPaymentReference(db, { auth: { uid: monthlyProvision.ownerUid, token: {} }, data: {
      tenantId: monthlyProvision.tenantId, requestId: opId(), chargeId: prepaidRenewal.chargeId, amount: '30.00', method: 'bank_transfer', bankReference: `QA-OWNER-${suffix}-2` } });
    createdPaths.push(`platformBillingPayments/${tenantReferenceTwo.paymentId}`);
    const confirmedPrepaid = await platformCall(financeUid, { action: 'confirmManualPayment', paymentId: tenantReferenceTwo.paymentId, requestId: opId() });
    assert.equal(confirmedPrepaid.status, 'confirmed');
    const extendedSubscription = (await monthlySubscriptionRef.get()).data();
    assert.equal(extendedSubscription.monthsCovered, 2);
    assert(extendedSubscription.currentPeriodEnd.toMillis() > dueEnd.toMillis() + 55 * 86_400_000, 'Early payment extends from the already paid end date.');
    pass('renovación prepagada de 2 meses, referencia duplicada rechazada, pago parcial y pago final extienden desde el vencimiento vigente');

    for (const daysUntilExpiry of [15, 45, 90, 180]) {
      const paidThrough = Timestamp.fromMillis(Date.now() + daysUntilExpiry * 86_400_000);
      await monthlySubscriptionRef.update({ currentPeriodEnd: paidThrough, nextRenewalAt: paidThrough,
        billingAccessUntil: Timestamp.fromMillis(paidThrough.toMillis() + 7 * 86_400_000) });
      await db.doc(`tenants/${monthlyProvision.tenantId}`).update({ billingAccessUntil: Timestamp.fromMillis(paidThrough.toMillis() + 7 * 86_400_000) });
      if (daysUntilExpiry > 30) {
        await assert.rejects(platformCall(ownerUid, { action: 'createRenewalCharge', contractId: monthlyOnlyContract.contractId,
          requestId: opId(), dueAt: dateAfter(7), periodCount: 1 }), error => error.code === 'failed-precondition');
      }
      const advance = await platformCall(ownerUid, { action: 'createRenewalCharge', contractId: monthlyOnlyContract.contractId,
        requestId: opId(), dueAt: dateAfter(7), periodCount: 6 });
      createdPaths.push(`platformBillingCharges/${advance.chargeId}`);
      const advanceCharge = (await db.doc(`platformBillingCharges/${advance.chargeId}`).get()).data();
      assert.equal(advanceCharge.periodStart.toMillis(), paidThrough.toMillis(), 'Advance period starts exactly at the already-paid boundary.');
      assert.equal(advanceCharge.amountMinor, monthlyContract.terms.recurringMinor * 6, 'Advance prepayment uses the agreed contract price.');
      assert(advanceCharge.periodEnd.toMillis() > paidThrough.toMillis() + 170 * 86_400_000);
      const reusedAdvance = await platformCall(ownerUid, { action: 'createRenewalCharge', contractId: monthlyOnlyContract.contractId,
        requestId: opId(), dueAt: dateAfter(7), periodCount: 6 });
      assert.equal(reusedAdvance.chargeId, advance.chargeId, 'Another operator request cannot create a second active renewal charge.');
      assert.equal(reusedAdvance.reusedPendingCharge, true);
      const advanceReference = await platformCall(financeUid, { action: 'recordManualPaymentReference', requestId: opId(),
        chargeId: advance.chargeId, amount: (advanceCharge.amountMinor / 100).toFixed(2), method: 'bank_transfer',
        bankReference: `QA-ADVANCE-${daysUntilExpiry}-${suffix}` });
      createdPaths.push(`platformBillingPayments/${advanceReference.paymentId}`);
      await platformCall(financeUid, { action: 'confirmManualPayment', paymentId: advanceReference.paymentId, requestId: opId() });
      const appliedAdvance = (await db.doc(`platformSubscriptions/${monthlyOnlyContract.contractId}`).get()).data();
      assert.equal(appliedAdvance.currentPeriodStart.toMillis(), paidThrough.toMillis());
      assert.equal(appliedAdvance.currentPeriodEnd.toMillis(), advanceCharge.periodEnd.toMillis());
    }
    pass('prepago mensual de seis meses permitido a 15/45/90/180 días; renovación ordinaria conserva ventana, período sin solapamiento y precio contractual');

    const annualIntentResult = await platformCall(ownerUid, { action: 'createManualCommercialIntent', requestId: opId(),
      contactName: 'Cliente anual QA', companyName: `Distribuidora Anual QA ${suffix}`, email: `annual-${suffix}@example.test`,
      contactPhone: '+591 70000000', templateId: 'distribution', planId: null, extraIds: [], billingCycle: 'annual', needs: 'Contrato anual de prueba.' });
    createdPaths.push(`platformCommercialIntents/${annualIntentResult.intentId}`);
    const annualIntent = (await db.doc(`platformCommercialIntents/${annualIntentResult.intentId}`).get()).data();
    const annualQuote = { action: 'saveCommercialQuote', requestId: opId(), intentId: annualIntentResult.intentId,
      implementation: '0', monthly: '150.00', annual: '1500.00', currency: 'BOB', billingCycle: 'annual', periodCount: 2,
      discount: '0', capabilitiesV1: distributionCapabilities, extras: [] };
    await platformCall(ownerUid, annualQuote);
    const annualQuoteRecord = (await db.doc(`platformCommercialIntents/${annualIntentResult.intentId}`).get()).data().quote;
    assert.equal(annualQuoteRecord.recurringMinor, 150000, 'The contractual annual price is explicit and is not derived from 12 monthly payments.');
    assert.equal(annualQuoteRecord.initialDueMinor, 300000, 'Two prepaid annual periods charge the approved annual amount twice.');
    assert.equal(annualQuoteRecord.monthsCovered, 24);
    await platformCall(ownerUid, { action: 'offerCommercialQuote', intentId: annualIntentResult.intentId, requestId: opId() });
    await platformCall(ownerUid, { action: 'recordCommercialAcceptance', intentId: annualIntentResult.intentId,
      requestId: opId(), channel: 'signed_document', reference: 'Aceptación anual QA verificada.' });
    const annualContract = await platformCall(ownerUid, { action: 'createCommercialContract', intentId: annualIntentResult.intentId,
      requestId: opId(), dueAt: dateAfter(7) });
    createdPaths.push(`platformContracts/${annualContract.contractId}`, `platformBillingCharges/${annualContract.chargeId}`, `platformSubscriptions/${annualContract.contractId}`);
    const annualPayment = await platformCall(financeUid, { action: 'recordManualPaymentReference', requestId: opId(),
      chargeId: annualContract.chargeId, amount: '3000.00', method: 'bank_transfer', bankReference: `QA-ANNUAL-${suffix}` });
    createdPaths.push(`platformBillingPayments/${annualPayment.paymentId}`);
    const concurrentConfirmations = await Promise.allSettled([
      platformCall(ownerUid, { action: 'confirmManualPayment', paymentId: annualPayment.paymentId, requestId: opId() }),
      platformCall(financeUid, { action: 'confirmManualPayment', paymentId: annualPayment.paymentId, requestId: opId() }),
    ]);
    assert.equal(concurrentConfirmations.filter(result => result.status === 'fulfilled').length, 1,
      'Concurrent operators cannot both apply the same confirmation with separate operation IDs.');
    assert.equal((await db.doc(`platformBillingCharges/${annualContract.chargeId}`).get()).data().paidMinor, 300000);
    assert.equal((await db.doc(`platformContracts/${annualContract.contractId}`).get()).data().status, 'ready_for_activation');
    const annualActivation = await assisted.createAssistedTenant(db, auth, request(ownerUid, await prepareAssistedInput(
      annualContract.contractId, annualIntent.companyName, annualIntent.email, opId(), 'Propietario anual QA')));
    createdAuthUids.push(annualActivation.ownerUid);
    const annualSubscription = (await db.doc(`platformSubscriptions/${annualContract.contractId}`).get()).data();
    assert.equal(annualSubscription.billingCycle, 'annual');
    assert.equal(annualSubscription.periodCount, 2);
    assert.equal(annualSubscription.monthsCovered, 24);
    assert(annualSubscription.currentPeriodEnd.toMillis() > annualSubscription.currentPeriodStart.toMillis() + 720 * 86_400_000,
      'The activated two-year term remains fully covered.');
    pass('contrato anual conserva precio negociado; dos años prepagados se activan completos y la doble conciliación concurrente solo aplica una vez');

    const annualPaidThrough = annualSubscription.currentPeriodEnd;
    await assert.rejects(platformCall(ownerUid, { action: 'createRenewalCharge', contractId: annualContract.contractId,
      requestId: opId(), dueAt: dateAfter(7), periodCount: 1 }), error => error.code === 'failed-precondition',
    'An ordinary one-year renewal remains inside the 30-day window even when the current paid term spans years.');
    await assert.rejects(platformCall(ownerUid, { action: 'createRenewalCharge', contractId: annualContract.contractId,
      requestId: opId(), dueAt: dateAfter(7), periodCount: 4 }), error => error.code === 'invalid-argument',
    'Annual advance payment durations outside the published policy remain rejected.');
    const annualPrepayRequestIds = [opId(), opId()];
    const annualPrepayDueAt = dateAfter(7);
    const annualPrepayAttempts = await Promise.all(annualPrepayRequestIds.map(requestId => platformCall(ownerUid, {
      action: 'createRenewalCharge', contractId: annualContract.contractId, requestId, dueAt: annualPrepayDueAt, periodCount: 5,
    })));
    assert.equal(annualPrepayAttempts[0].chargeId, annualPrepayAttempts[1].chargeId,
      'Concurrent annual prepayment requests share one active charge.');
    assert.equal(annualPrepayAttempts.filter(result => result.reusedPendingCharge).length, 1);
    assert.equal(annualPrepayAttempts[0].renewalMode, 'advance_prepayment');
    const annualPrepayChargeId = annualPrepayAttempts[0].chargeId;
    createdPaths.push(`platformBillingCharges/${annualPrepayChargeId}`);
    const annualPrepayChargeRef = db.doc(`platformBillingCharges/${annualPrepayChargeId}`);
    const annualPrepayCharge = (await annualPrepayChargeRef.get()).data();
    assert.equal(annualPrepayCharge.renewalMode, 'advance_prepayment');
    assert.equal(annualPrepayCharge.cycle, 'annual');
    assert.equal(annualPrepayCharge.periodCount, 5);
    assert.equal(annualPrepayCharge.monthsCovered, 60);
    assert.equal(annualPrepayCharge.amountMinor, annualQuoteRecord.recurringMinor * 5,
      'Annual advance payment uses the signed annual price for the maximum permitted duration.');
    assert.equal(annualPrepayCharge.periodStart.toMillis(), annualPaidThrough.toMillis(),
      'Annual advance period starts at the already-paid boundary.');
    assert(annualPrepayCharge.periodEnd.toMillis() > annualPaidThrough.toMillis() + 1_790 * 86_400_000,
      'Annual advance periods append five full years without overlap.');
    const annualSameRequestReplay = await platformCall(ownerUid, { action: 'createRenewalCharge', contractId: annualContract.contractId,
      requestId: annualPrepayRequestIds[0], dueAt: annualPrepayDueAt, periodCount: 5 });
    assert.equal(annualSameRequestReplay.chargeId, annualPrepayChargeId);
    assert.equal(annualSameRequestReplay.idempotent, true);
    await assert.rejects(platformCall(ownerUid, { action: 'createRenewalCharge', contractId: annualContract.contractId,
      requestId: opId(), dueAt: annualPrepayDueAt, periodCount: 3 }), error => error.code === 'failed-precondition',
    'A second annual duration cannot replace a partially reconciled pending prepayment.');
    const annualTenantRef = db.doc(`tenants/${annualActivation.tenantId}`);
    const annualOriginalCapabilities = (await annualTenantRef.get()).data().commercialCapabilities;
    const annualPaymentOne = await platformCall(financeUid, { action: 'recordManualPaymentReference', requestId: opId(),
      chargeId: annualPrepayChargeId, amount: '3750.00', method: 'bank_transfer', bankReference: `QA-ANNUAL-ADVANCE-1-${suffix}` });
    createdPaths.push(`platformBillingPayments/${annualPaymentOne.paymentId}`);
    const annualPartialConfirmation = await platformCall(financeUid, { action: 'confirmManualPayment', paymentId: annualPaymentOne.paymentId, requestId: opId() });
    assert.equal(annualPartialConfirmation.status, 'partial');
    assert.equal((await db.doc(`platformSubscriptions/${annualContract.contractId}`).get()).data().currentPeriodEnd.toMillis(), annualPaidThrough.toMillis(),
      'A partial annual prepayment cannot extend coverage.');
    assert.deepEqual((await annualTenantRef.get()).data().commercialCapabilities, annualOriginalCapabilities,
      'A partial annual prepayment cannot change tenant capabilities.');
    const annualPaymentTwo = await platformCall(financeUid, { action: 'recordManualPaymentReference', requestId: opId(),
      chargeId: annualPrepayChargeId, amount: '3750.00', method: 'bank_transfer', bankReference: `QA-ANNUAL-ADVANCE-2-${suffix}` });
    createdPaths.push(`platformBillingPayments/${annualPaymentTwo.paymentId}`);
    const annualFullConfirmation = await platformCall(ownerUid, { action: 'confirmManualPayment', paymentId: annualPaymentTwo.paymentId, requestId: opId() });
    assert.equal(annualFullConfirmation.status, 'confirmed');
    const annualExtendedSubscription = (await db.doc(`platformSubscriptions/${annualContract.contractId}`).get()).data();
    assert.equal(annualExtendedSubscription.currentPeriodStart.toMillis(), annualPaidThrough.toMillis());
    assert.equal(annualExtendedSubscription.currentPeriodEnd.toMillis(), annualPrepayCharge.periodEnd.toMillis());
    assert.equal((await annualPrepayChargeRef.get()).data().periodApplicationId, `renewal:${annualPrepayChargeId}`);
    const annualRenewalRows = await db.collection('platformBillingCharges').where('contractId', '==', annualContract.contractId).get();
    assert.equal(annualRenewalRows.docs.filter(item => item.data().kind === 'renewal').length, 1,
      'Retries and concurrent operators do not create duplicate annual charges.');
    pass('prepago anual anticipado máximo de cinco años conserva cobertura, precio, ciclo e idempotencia; pago parcial no extiende ni cambia capacidades');

    const annualOrdinaryEnd = Timestamp.fromMillis(Date.now() + 15 * 86_400_000);
    await db.doc(`platformSubscriptions/${annualContract.contractId}`).update({ currentPeriodEnd: annualOrdinaryEnd,
      nextRenewalAt: annualOrdinaryEnd, billingAccessUntil: Timestamp.fromMillis(annualOrdinaryEnd.toMillis() + 7 * 86_400_000) });
    await annualTenantRef.update({ billingAccessUntil: Timestamp.fromMillis(annualOrdinaryEnd.toMillis() + 7 * 86_400_000) });
    const annualOrdinaryRenewal = await platformCall(ownerUid, { action: 'createRenewalCharge', contractId: annualContract.contractId,
      requestId: opId(), dueAt: dateAfter(7), periodCount: 1 });
    createdPaths.push(`platformBillingCharges/${annualOrdinaryRenewal.chargeId}`);
    const annualOrdinaryCharge = (await db.doc(`platformBillingCharges/${annualOrdinaryRenewal.chargeId}`).get()).data();
    assert.equal(annualOrdinaryRenewal.renewalMode, 'ordinary');
    assert.equal(annualOrdinaryCharge.periodCount, 1);
    assert.equal(annualOrdinaryCharge.amountMinor, annualQuoteRecord.recurringMinor);
    pass('renovación anual ordinaria de un período se habilita dentro de los 30 días y conserva la tarifa anual');

    const correctionIntentResult = await platformCall(ownerUid, { action: 'createManualCommercialIntent', requestId: opId(),
      contactName: 'Cliente corrección QA', companyName: `Cliente Corrección QA ${suffix}`, email: `correction-${suffix}@example.test`,
      contactPhone: '+591 70000000', templateId: 'distribution', planId: null, extraIds: [], billingCycle: 'monthly', needs: 'Corrección auditada.' });
    createdPaths.push(`platformCommercialIntents/${correctionIntentResult.intentId}`);
    const correctionIntent = (await db.doc(`platformCommercialIntents/${correctionIntentResult.intentId}`).get()).data();
    const correctionQuote = { action: 'saveCommercialQuote', requestId: opId(), intentId: correctionIntentResult.intentId,
      implementation: '0', monthly: '40.00', annual: '', currency: 'BOB', billingCycle: 'monthly', periodCount: 1,
      discount: '0', capabilitiesV1: distributionCapabilities, extras: [] };
    await platformCall(ownerUid, correctionQuote);
    await platformCall(ownerUid, { action: 'offerCommercialQuote', intentId: correctionIntentResult.intentId, requestId: opId() });
    await platformCall(ownerUid, { action: 'recordCommercialAcceptance', intentId: correctionIntentResult.intentId,
      requestId: opId(), channel: 'email', reference: 'Aceptación de cotización para prueba de corrección.' });
    const correctionContract = await platformCall(ownerUid, { action: 'createCommercialContract', intentId: correctionIntentResult.intentId,
      requestId: opId(), dueAt: dateAfter(7) });
    createdPaths.push(`platformContracts/${correctionContract.contractId}`, `platformBillingCharges/${correctionContract.chargeId}`, `platformSubscriptions/${correctionContract.contractId}`);
    const correctionRequest = { action: 'correctBillingCharge', requestId: opId(), chargeId: correctionContract.chargeId,
      correctedAmount: '42.00', reason: 'Corrección aprobada del importe de implementación acordado.' };
    const correctionResult = await platformCall(ownerUid, correctionRequest);
    createdPaths.push(`platformBillingCorrections/${correctionResult.correctionId}`);
    const correctionReplay = await platformCall(ownerUid, correctionRequest);
    assert.equal(correctionReplay.correctionId, correctionResult.correctionId);
    assert.equal(correctionReplay.idempotent, true);
    const correctedCharge = (await db.doc(`platformBillingCharges/${correctionContract.chargeId}`).get()).data();
    assert.equal(correctedCharge.originalAmountMinor, 4000);
    assert.equal(correctedCharge.amountMinor, 4200);
    assert.equal(correctedCharge.correctionCount, 1);
    assert.equal((await db.doc(`platformBillingCorrections/${correctionResult.correctionId}`).get()).data().reason, correctionRequest.reason);
    await assert.rejects(platformCall(adminUid, { ...correctionRequest, requestId: opId(), correctedAmount: '43.00' }), error => error.code === 'permission-denied');
    const correctionPendingReference = await platformCall(financeUid, { action: 'recordManualPaymentReference', requestId: opId(),
      chargeId: correctionContract.chargeId, amount: '5.00', method: 'bank_transfer', bankReference: `QA-CORRECTION-PENDING-${suffix}` });
    createdPaths.push(`platformBillingPayments/${correctionPendingReference.paymentId}`);
    await assert.rejects(platformCall(ownerUid, { ...correctionRequest, requestId: opId(), correctedAmount: '44.00' }), error => error.code === 'failed-precondition');
    pass('corrección de cargo inicial pendiente se limita a Owner, conserva importe original y motivo inmutable, y es idempotente');

    await monthlySubscriptionRef.update({ currentPeriodEnd: Timestamp.fromMillis(Date.now() + 10 * 86_400_000), billingAnchorDay: 14,
      billingAccessUntil: Timestamp.fromMillis(Date.now() + 17 * 86_400_000) });
    await db.doc(`tenants/${monthlyProvision.tenantId}`).update({ billingAccessUntil: Timestamp.fromMillis(Date.now() + 17 * 86_400_000) });
    const rejectedRenewal = await platformCall(ownerUid, { action: 'createRenewalCharge', contractId: monthlyOnlyContract.contractId,
      requestId: opId(), dueAt: dateAfter(7), periodCount: 1 });
    createdPaths.push(`platformBillingCharges/${rejectedRenewal.chargeId}`);
    const rejectedReference = await platformCall(financeUid, { action: 'recordManualPaymentReference', requestId: opId(),
      chargeId: rejectedRenewal.chargeId, amount: '15.00', method: 'bank_transfer', bankReference: `QA-REJECT-${suffix}` });
    createdPaths.push(`platformBillingPayments/${rejectedReference.paymentId}`);
    await platformCall(financeUid, { action: 'confirmManualPayment', paymentId: rejectedReference.paymentId, requestId: opId() });
    const secondPendingReference = await platformCall(financeUid, { action: 'recordManualPaymentReference', requestId: opId(),
      chargeId: rejectedRenewal.chargeId, amount: '15.00', method: 'bank_transfer', bankReference: `QA-REJECT-PARTIAL-${suffix}` });
    createdPaths.push(`platformBillingPayments/${secondPendingReference.paymentId}`);
    const concurrentRejections = await Promise.allSettled([
      platformCall(ownerUid, { action: 'rejectManualPayment', paymentId: secondPendingReference.paymentId,
        reason: 'No se encontró el segundo abono QA.', requestId: opId() }),
      platformCall(financeUid, { action: 'rejectManualPayment', paymentId: secondPendingReference.paymentId,
        reason: 'No se encontró el segundo abono QA.', requestId: opId() }),
    ]);
    assert.equal(concurrentRejections.filter(result => result.status === 'fulfilled').length, 1,
      'Concurrent rejection attempts must release a reservation exactly once.');
    const partiallyPaidAfterReject = (await db.doc(`platformBillingCharges/${rejectedRenewal.chargeId}`).get()).data();
    assert.equal(partiallyPaidAfterReject.paidMinor, 1500, 'Rejecting a second reference cannot erase the confirmed first payment.');
    assert.equal(partiallyPaidAfterReject.pendingMinor, 0);
    assert.equal(partiallyPaidAfterReject.status, 'partial');
    assert.equal((await db.doc(`platformSubscriptions/${monthlyOnlyContract.contractId}`).get()).data().pendingRenewalChargeId, rejectedRenewal.chargeId,
      'An unpaid partial renewal remains linked after a reference is rejected.');
    assert.equal((await db.doc(`platformBillingPayments/${rejectedReference.paymentId}`).get()).data().status, 'confirmed');
    assert.equal((await db.doc(`platformBillingPayments/${secondPendingReference.paymentId}`).get()).data().status, 'rejected');
    const finalPayment = await platformCall(financeUid, { action: 'recordManualPaymentReference', requestId: opId(),
      chargeId: rejectedRenewal.chargeId, amount: '15.00', method: 'bank_transfer', bankReference: `QA-REJECT-FINAL-${suffix}` });
    createdPaths.push(`platformBillingPayments/${finalPayment.paymentId}`);
    await platformCall(financeUid, { action: 'confirmManualPayment', paymentId: finalPayment.paymentId, requestId: opId() });
    const fullyPaidAfterReject = (await db.doc(`platformBillingCharges/${rejectedRenewal.chargeId}`).get()).data();
    assert.equal(fullyPaidAfterReject.paidMinor, fullyPaidAfterReject.amountMinor);
    assert.equal(fullyPaidAfterReject.pendingMinor, 0);
    assert.equal((await db.doc(`platformSubscriptions/${monthlyOnlyContract.contractId}`).get()).data().pendingRenewalChargeId, undefined);

    const corruptRenewalWindowEnd = Timestamp.fromMillis(Date.now() + 10 * 86_400_000);
    const corruptRenewalAccessUntil = Timestamp.fromMillis(corruptRenewalWindowEnd.toMillis() + 7 * 86_400_000);
    await monthlySubscriptionRef.update({ currentPeriodEnd: corruptRenewalWindowEnd, nextRenewalAt: corruptRenewalWindowEnd,
      billingAccessUntil: corruptRenewalAccessUntil });
    await db.doc(`tenants/${monthlyProvision.tenantId}`).update({ billingAccessUntil: corruptRenewalAccessUntil });
    const corruptRenewal = await platformCall(ownerUid, { action: 'createRenewalCharge', contractId: monthlyOnlyContract.contractId,
      requestId: opId(), dueAt: dateAfter(7), periodCount: 1 });
    createdPaths.push(`platformBillingCharges/${corruptRenewal.chargeId}`);
    const corruptReference = await platformCall(financeUid, { action: 'recordManualPaymentReference', requestId: opId(),
      chargeId: corruptRenewal.chargeId, amount: '5.00', method: 'bank_transfer', bankReference: `QA-CORRUPT-${suffix}` });
    createdPaths.push(`platformBillingPayments/${corruptReference.paymentId}`);
    const corruptChargeRef = db.doc(`platformBillingCharges/${corruptRenewal.chargeId}`);
    await corruptChargeRef.update({ pendingMinor: 499, status: 'under_review' });
    await assert.rejects(platformCall(ownerUid, { action: 'rejectManualPayment', paymentId: corruptReference.paymentId,
      reason: 'Validar saldo inconsistente QA.', requestId: opId() }), error => error.code === 'failed-precondition');
    await corruptChargeRef.update({ pendingMinor: 500, status: 'under_review' });
    await platformCall(ownerUid, { action: 'rejectManualPayment', paymentId: corruptReference.paymentId,
      reason: 'Liberar referencia ficticia QA.', requestId: opId() });
    const recoveredReference = await platformCall(financeUid, { action: 'recordManualPaymentReference', requestId: opId(),
      chargeId: corruptRenewal.chargeId, amount: '30.00', method: 'bank_transfer', bankReference: `QA-CORRUPT-RECOVER-${suffix}` });
    createdPaths.push(`platformBillingPayments/${recoveredReference.paymentId}`);
    await platformCall(financeUid, { action: 'confirmManualPayment', paymentId: recoveredReference.paymentId, requestId: opId() });
    pass('rechazo concurrente y parcial conserva ingresos confirmados y vínculo de renovación; saldo imposible se rechaza explícitamente sin Math.max');

    const monthlySetupUrl = new URL(monthlyProvision.ownerAccess.setupLink);
    const monthlyOobCode = monthlySetupUrl.searchParams.get('oobCode');
    assert(monthlyOobCode);
    const monthlyReset = await fetch(`http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:resetPassword?key=emulator`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ oobCode: monthlyOobCode, newPassword: 'MonthlyOwnerQa123!' }),
    });
    assert.equal(monthlyReset.ok, true);
    const monthlyLogin = await signInOwner(monthlyOnlyEmail, 'MonthlyOwnerQa123!');
    assert.equal(monthlyLogin.localId, monthlyProvision.ownerUid);
    const monthlyTenantActor = await tenantActor(db, { auth: { uid: monthlyLogin.localId, token: {} },
      data: { tenantId: monthlyProvision.tenantId } }, 'settings.manage');
    assert.equal(monthlyTenantActor.uid, monthlyProvision.ownerUid);
    await db.doc(`platformPlans/${nextPlanId}`).update({ status: 'published', currency: 'BOB' })
    const manualContractChangeId = opId()
    const manualContractChange = await platformCall(ownerUid, { action: 'requestSubscriptionPlanChange', requestId: manualContractChangeId,
      contractId: monthlyOnlyContract.contractId, planId: nextPlanId, billingCycle: 'monthly' })
    const manualContractChangeReplay = await platformCall(ownerUid, { action: 'requestSubscriptionPlanChange', requestId: manualContractChangeId,
      contractId: monthlyOnlyContract.contractId, planId: nextPlanId, billingCycle: 'monthly' })
    assert.equal(manualContractChange.idempotent, false)
    assert.equal(manualContractChangeReplay.idempotent, true)
    assert.equal((await db.doc(`platformSubscriptions/${monthlyOnlyContract.contractId}`).get()).data().pendingPlanChange.planSnapshot.capabilitiesV1.businessType, 'route_distribution')
    assert.equal((await db.doc(`platformSubscriptions/${monthlyOnlyContract.contractId}`).get()).data().pendingPlanChange.planSnapshot.capabilitiesV1.limits.activeUsers, 6,
      'Contract extras are applied once to the destination plan.')
    assert.equal((await db.doc(`platformSubscriptions/${monthlyOnlyContract.contractId}`).get()).data().pendingPlanChange.planSnapshot.capabilitiesV1.limits.activeProducts, 4)
    await assert.rejects(platformCall(ownerUid, { action: 'requestSubscriptionPlanChange', requestId: opId(),
      contractId: monthlyOnlyContract.contractId, planId: legacyPlanId, billingCycle: 'annual' }),
    error => error.code === 'failed-precondition', 'an ambiguous legacy annual amount cannot be scheduled as an annual plan change')
    const wrongBusinessPlanId = `billing-wrong-business-${suffix}`
    createdPaths.push(`platformPlans/${wrongBusinessPlanId}`)
    await db.doc(`platformPlans/${wrongBusinessPlanId}`).set({ id: wrongBusinessPlanId, templateId: 'retail', name: 'Plan Comercio QA',
      planKind: 'paid', status: 'published', priceApproval: 'approved', monthlyPriceUSD: 20, annualPriceUSD: 200, annualPriceUnit: 'annual_total_12_months', currency: 'BOB',
      commercialVersion: 1, includedFeatures: [], technicalEntitlements: [],
      capabilitiesV1: { ...distributionCapabilities, businessType: 'gelateria_weight_cafe' } })
    await assert.rejects(platformCall(ownerUid, { action: 'requestSubscriptionPlanChange', requestId: opId(),
      contractId: monthlyOnlyContract.contractId, planId: wrongBusinessPlanId, billingCycle: 'monthly' }),
    error => error.code === 'failed-precondition')
    const scheduledChangeBeforePayment = (await monthlySubscriptionRef.get()).data()
    const scheduledPrepaymentEnd = scheduledChangeBeforePayment.pendingPlanChange.effectiveAt
    assert(scheduledPrepaymentEnd.toMillis() > Date.now(), 'The scheduled plan change must still have a future contractual date.')
    const originalScheduledPlanKey = scheduledChangeBeforePayment.planKey
    const originalScheduledSubscriptionCapabilities = scheduledChangeBeforePayment.commercialCapabilities
    const monthlyTenantRef = db.doc(`tenants/${monthlyProvision.tenantId}`)
    const originalScheduledTenantCapabilities = (await monthlyTenantRef.get()).data().commercialCapabilities
    const scheduledPrepayment = await platformCall(ownerUid, { action: 'createRenewalCharge', contractId: monthlyOnlyContract.contractId,
      requestId: opId(), dueAt: dateAfter(7), periodCount: 6 })
    createdPaths.push(`platformBillingCharges/${scheduledPrepayment.chargeId}`)
    const scheduledCharge = (await db.doc(`platformBillingCharges/${scheduledPrepayment.chargeId}`).get()).data()
    const pendingPlanChangeBeforePrepay = (await monthlySubscriptionRef.get()).data().pendingPlanChange
    assert.equal(scheduledPrepayment.renewalMode, 'advance_prepayment')
    assert.equal(scheduledCharge.planSnapshot.planId, nextPlanId)
    assert.equal(scheduledCharge.amountMinor, pendingPlanChangeBeforePrepay.recurringMinor * 6,
      'Advance prepayment uses the scheduled destination plan price, not the old recurring price.')
    assert.equal(scheduledCharge.periodStart.toMillis(), scheduledPrepaymentEnd.toMillis(),
      'The scheduled plan is priced at and anchored to its future contractual date.')
    const scheduledReference = await platformCall(financeUid, { action: 'recordManualPaymentReference', requestId: opId(),
      chargeId: scheduledPrepayment.chargeId, amount: (scheduledCharge.amountMinor / 200).toFixed(2),
      method: 'bank_transfer', bankReference: `QA-SCHEDULED-PREPAY-PARTIAL-${suffix}` })
    createdPaths.push(`platformBillingPayments/${scheduledReference.paymentId}`)
    await assert.rejects(platformCall(financeUid, { action: 'confirmManualPayment', paymentId: scheduledReference.paymentId, requestId: opId() }),
      error => error.code === 'failed-precondition', 'A payment cannot apply scheduled capabilities before the agreed effective date.')
    assert.equal((await db.doc(`platformBillingCharges/${scheduledPrepayment.chargeId}`).get()).data().paidMinor, 0)
    assert.equal((await monthlySubscriptionRef.get()).data().planKey, originalScheduledPlanKey)
    assert.deepEqual((await monthlyTenantRef.get()).data().commercialCapabilities, originalScheduledTenantCapabilities)
    const effectivePlanDate = Timestamp.fromMillis(Date.now() - 86_400_000)
    const expiredGraceDeadline = Timestamp.fromMillis(effectivePlanDate.toMillis() + 7 * 86_400_000)
    await monthlySubscriptionRef.update({ currentPeriodEnd: effectivePlanDate, nextRenewalAt: effectivePlanDate,
      billingAccessUntil: expiredGraceDeadline, pendingPlanChange: { ...scheduledChangeBeforePayment.pendingPlanChange,
        effectiveAt: effectivePlanDate } })
    await monthlyTenantRef.update({ billingAccessUntil: expiredGraceDeadline })
    assert.equal((await platformCall(financeUid, { action: 'confirmManualPayment', paymentId: scheduledReference.paymentId, requestId: opId() })).status, 'partial')
    const afterScheduledPartial = (await monthlySubscriptionRef.get()).data()
    assert.equal(afterScheduledPartial.planKey, originalScheduledPlanKey)
    assert.deepEqual(afterScheduledPartial.commercialCapabilities, originalScheduledSubscriptionCapabilities)
    assert.ok(afterScheduledPartial.pendingPlanChange, 'The destination plan remains scheduled until the full amount is reconciled.')
    assert.deepEqual((await monthlyTenantRef.get()).data().commercialCapabilities, originalScheduledTenantCapabilities)
    const scheduledReferenceTwo = await platformCall(financeUid, { action: 'recordManualPaymentReference', requestId: opId(),
      chargeId: scheduledPrepayment.chargeId, amount: (scheduledCharge.amountMinor / 200).toFixed(2),
      method: 'bank_transfer', bankReference: `QA-SCHEDULED-PREPAY-FINAL-${suffix}` })
    createdPaths.push(`platformBillingPayments/${scheduledReferenceTwo.paymentId}`)
    await platformCall(financeUid, { action: 'confirmManualPayment', paymentId: scheduledReferenceTwo.paymentId, requestId: opId() })
    assert.equal((await monthlySubscriptionRef.get()).data().planKey, nextPlanId)
    assert.deepEqual((await monthlySubscriptionRef.get()).data().commercialCapabilities, pendingPlanChangeBeforePrepay.planSnapshot.capabilitiesV1)
    assert.deepEqual((await monthlyTenantRef.get()).data().commercialCapabilities, pendingPlanChangeBeforePrepay.planSnapshot.capabilitiesV1)
    assert.equal((await monthlySubscriptionRef.get()).data().pendingPlanChange, undefined)
    pass('cambio programado factura la tarifa destino en su fecha contractual; antes de esa fecha no concilia pagos ni aplica capacidades, y luego requiere el importe completo');
    await platformCall(ownerUid, { action: 'changeSubscriptionStatus', contractId: monthlyOnlyContract.contractId,
      status: 'suspended', reason: 'Suspensión administrativa QA autorizada.', requestId: opId() })
    const suspendedRenewal = await platformCall(ownerUid, { action: 'createRenewalCharge', contractId: monthlyOnlyContract.contractId,
      requestId: opId(), dueAt: dateAfter(7), periodCount: 1 })
    createdPaths.push(`platformBillingCharges/${suspendedRenewal.chargeId}`)
    const suspendedCharge = (await db.doc(`platformBillingCharges/${suspendedRenewal.chargeId}`).get()).data()
    const suspendedPayment = await platformCall(financeUid, { action: 'recordManualPaymentReference', requestId: opId(),
      chargeId: suspendedRenewal.chargeId, amount: (suspendedCharge.amountMinor / 100).toFixed(2), method: 'bank_transfer', bankReference: `QA-SUSPENDED-${suffix}` })
    createdPaths.push(`platformBillingPayments/${suspendedPayment.paymentId}`)
    await platformCall(financeUid, { action: 'confirmManualPayment', paymentId: suspendedPayment.paymentId, requestId: opId() })
    assert.equal((await monthlySubscriptionRef.get()).data().status, 'suspended', 'A paid renewal never auto-reactivates an administrative suspension.')
    assert.equal((await db.doc(`tenants/${monthlyProvision.tenantId}`).get()).data().subscriptionStatus, 'suspended')
    const reactivationRequestIds = [opId(), opId()]
    const reactivationAttempts = await Promise.allSettled(reactivationRequestIds.map(requestId =>
      platformCall(ownerUid, { action: 'reactivateSuspendedSubscription', contractId: monthlyOnlyContract.contractId,
        chargeId: suspendedRenewal.chargeId, reason: 'Pago conciliado y autorización QA.', requestId })))
    assert.equal(reactivationAttempts.filter(result => result.status === 'fulfilled').length, 1,
      'Concurrent distinct request IDs can apply a paid renewal period only once.')
    const successfulReactivationIndex = reactivationAttempts.findIndex(result => result.status === 'fulfilled')
    const sameRequestReplay = await platformCall(ownerUid, { action: 'reactivateSuspendedSubscription', contractId: monthlyOnlyContract.contractId,
      chargeId: suspendedRenewal.chargeId, reason: 'Pago conciliado y autorización QA.', requestId: reactivationRequestIds[successfulReactivationIndex] })
    assert.equal(sameRequestReplay.idempotent, true, 'Retrying the same reactivation request returns its stored result.')
    assert.equal((await monthlySubscriptionRef.get()).data().status, 'active')
    assert.equal((await db.doc(`tenants/${monthlyProvision.tenantId}`).get()).data().subscriptionStatus, 'active')
    const appliedSuspendedCharge = (await db.doc(`platformBillingCharges/${suspendedRenewal.chargeId}`).get()).data()
    assert.equal(appliedSuspendedCharge.periodApplicationId, `renewal:${suspendedRenewal.chargeId}`)
    const appliedEnd = (await monthlySubscriptionRef.get()).data().currentPeriodEnd.toMillis()
    await platformCall(ownerUid, { action: 'changeSubscriptionStatus', contractId: monthlyOnlyContract.contractId,
      status: 'suspended', reason: 'Segunda suspensión QA para detectar reutilización.', requestId: opId() })
    const repeatedReactivation = await Promise.allSettled([
      platformCall(ownerUid, { action: 'reactivateSuspendedSubscription', contractId: monthlyOnlyContract.contractId,
        chargeId: suspendedRenewal.chargeId, reason: 'Intento repetido QA con otro ID.', requestId: opId() }),
      platformCall(ownerUid, { action: 'reactivateSuspendedSubscription', contractId: monthlyOnlyContract.contractId,
        chargeId: suspendedRenewal.chargeId, reason: 'Intento repetido concurrente QA.', requestId: opId() }),
    ])
    assert.equal(repeatedReactivation.filter(result => result.status === 'fulfilled').length, 0,
      'An already-applied charge cannot reactivate again, even concurrently and under new request IDs.')
    assert.equal((await monthlySubscriptionRef.get()).data().currentPeriodEnd.toMillis(), appliedEnd,
      'A failed repeated activation retains the legitimate paid coverage end.')
    // Keep a future paid-through date while testing cancellation with a pending charge.
    const cancellationWindowEnd = Timestamp.fromMillis(Date.now() + 10 * 86_400_000)
    const cancellationAccessUntil = Timestamp.fromMillis(cancellationWindowEnd.toMillis() + 7 * 86_400_000)
    await monthlySubscriptionRef.update({ currentPeriodEnd: cancellationWindowEnd, nextRenewalAt: cancellationWindowEnd,
      billingAccessUntil: cancellationAccessUntil })
    await db.doc(`tenants/${monthlyProvision.tenantId}`).update({ billingAccessUntil: cancellationAccessUntil })
    const cancellationPendingRenewal = await platformCall(ownerUid, { action: 'createRenewalCharge', contractId: monthlyOnlyContract.contractId,
      requestId: opId(), dueAt: dateAfter(7), periodCount: 1 })
    createdPaths.push(`platformBillingCharges/${cancellationPendingRenewal.chargeId}`)
    const cancellationPendingCharge = (await db.doc(`platformBillingCharges/${cancellationPendingRenewal.chargeId}`).get()).data()
    const cancellationPendingPayment = await platformCall(financeUid, { action: 'recordManualPaymentReference', requestId: opId(),
      chargeId: cancellationPendingRenewal.chargeId, amount: (cancellationPendingCharge.amountMinor / 100).toFixed(2),
      method: 'bank_transfer', bankReference: `QA-CANCELLED-${suffix}` })
    createdPaths.push(`platformBillingPayments/${cancellationPendingPayment.paymentId}`)
    await platformCall(ownerUid, { action: 'changeSubscriptionStatus', contractId: monthlyOnlyContract.contractId,
      status: 'cancelled', reason: 'Cancelación contractual QA.', requestId: opId() })
    await platformCall(financeUid, { action: 'confirmManualPayment', paymentId: cancellationPendingPayment.paymentId, requestId: opId() })
    assert.equal((await monthlySubscriptionRef.get()).data().status, 'cancelled', 'Reconciling a previously issued charge cannot revive a cancelled contract.');
    assert.equal((await db.doc(`tenants/${monthlyProvision.tenantId}`).get()).data().subscriptionStatus, 'cancelled')
    await assert.rejects(platformCall(ownerUid, { action: 'reactivateSuspendedSubscription', contractId: monthlyOnlyContract.contractId,
      chargeId: suspendedRenewal.chargeId, reason: 'Intento de reactivar cancelada.', requestId: opId() }), error => error.code === 'failed-precondition')
    pass('suspensión exige autorización Owner; renovación conciliada se aplica una vez aun con concurrencia; reintentos nuevos no duplican meses y el pago tardío no revierte cancelación');

    const firstContractsPage = await platformCall(ownerUid, { action: 'listBillingRecords', kind: 'contracts', limit: 1 })
    assert.equal(firstContractsPage.records.length, 1)
    assert.equal(firstContractsPage.hasMore, true)
    const secondContractsPage = await platformCall(ownerUid, { action: 'listBillingRecords', kind: 'contracts', limit: 1, cursor: firstContractsPage.nextCursor })
    assert.equal(secondContractsPage.records.length, 1)
    assert.notEqual(firstContractsPage.records[0].id, secondContractsPage.records[0].id)
    pass('paginación por cursor mantiene orden estable sin repetir contratos con marcas de tiempo coincidentes');
    pass('sin plan de Distribución publicado: contacto WhatsApp, cotización mensual idempotente, aceptación, pago confirmado, alta asistida y acceso del propietario');

    const anonymous = rulesEnv.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(anonymous, `platformContracts/${contractResult.contractId}`)));
    await assertFails(getDoc(doc(anonymous, `platformBillingCharges/${contractResult.chargeId}`)));
    const platformClient = rulesEnv.authenticatedContext(ownerUid, { platform: true, platformRole: 'platform_owner' }).firestore();
    await assertFails(getDoc(doc(platformClient, `platformBillingPayments/${firstPayment.paymentId}`)));
    await assertFails(getDoc(doc(platformClient, 'platformBillingConfig/manualMethods')));
    await assertFails(getDoc(doc(platformClient, `platformBillingNotes/${noteSaved.noteId}`)));
    await assertFails(getDoc(doc(platformClient, `platformBillingCorrections/${correctionResult.correctionId}`)));
    await assertFails(setDoc(doc(platformClient, 'platformBillingConfig/manualMethods'), { available: true }));
    const monthlyTenantClient = rulesEnv.authenticatedContext(monthlyProvision.ownerUid).firestore();
    await assertFails(getDoc(doc(monthlyTenantClient, `platformBillingCharges/${prepaidRenewal.chargeId}`)));
    await assertFails(setDoc(doc(monthlyTenantClient, `platformBillingCharges/${prepaidRenewal.chargeId}`), { amountMinor: 1 }));
    const auditRows = await db.collection('platformAuditLogs').where('operatorUid', '==', ownerUid).get();
    assert(auditRows.docs.some(item => item.data().action === 'billing.payment.confirm'));
    assert(auditRows.docs.some(item => item.data().action === 'tenant.assistedProvision.completed'));
    pass('Rules niegan acceso cliente a Billing Core y la auditoría enlaza conciliación con activación');

    console.log(`RESULT ${passed} Billing Core emulator assertions passed`);
  } finally {
    await cleanup();
  }
}

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
