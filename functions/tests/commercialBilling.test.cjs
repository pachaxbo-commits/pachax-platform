const assert = require('node:assert/strict');
const fs = require('node:fs');
const { randomUUID } = require('node:crypto');
const { initializeTestEnvironment, assertFails } = require('@firebase/rules-unit-testing');
const { doc, getDoc } = require('firebase/firestore');

const projectId = process.env.GCLOUD_PROJECT || '';
if (!projectId.startsWith('demo-')) throw new Error('Billing tests may only run against a demo Firebase project.');
if (!process.env.FIRESTORE_EMULATOR_HOST || !process.env.FIREBASE_AUTH_EMULATOR_HOST) throw new Error('Run this test with isolated Firestore and Auth emulators.');

const { initializeApp, deleteApp } = require('firebase-admin/app');
const { getFirestore, Timestamp } = require('firebase-admin/firestore');
const { getAuth } = require('firebase-admin/auth');
const platform = require('../platform.cjs');
const assisted = require('../assistedTenantProvisioning.cjs');
const { hasPermission, tenantActor } = require('../authorization.cjs');

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
const createdPaths = [];
const createdAuthUids = [];
let rulesEnv;
let passed = 0;
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

async function seedPlan(id, name, monthly, annual) {
  const ref = db.doc(`platformPlans/${id}`);
  createdPaths.push(ref.path);
  await ref.set({ id, templateId: 'distribution', name, planKind: 'paid', status: 'published', priceApproval: 'approved',
    monthlyPriceUSD: monthly, annualPriceUSD: annual, currency: 'USD', commercialVersion: 1,
    includedFeatures: ['Inventario y rutas'], technicalEntitlements: [], createdAt: Timestamp.now() });
}

async function prepareAssistedInput(contractId, companyName, ownerEmail, operationId, ownerDisplayName = 'Propietario Billing QA') {
  return {
    action: 'createAssistedTenant', operationId, billingContractId: contractId,
    companyName, businessType: 'route_distribution', ownerEmail, ownerDisplayName,
    ownerEmailConfirmed: true, industryProfile: 'beverages', currency: 'BOB', currencySymbol: 'Bs',
    timezone: 'America/La_Paz', businessIdentity: { legalName: 'QA Billing', city: 'Cochabamba' },
  };
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
    await seedPlan(planId, 'Plan Distribución QA', 20, 200);
    await seedPlan(nextPlanId, 'Plan Distribución QA Renovación', 30, 300);
    await db.doc(`platformExtras/${extraId}`).set({ id: extraId, title: 'Configuración QA', pricingType: 'one_time',
      applicableTemplates: ['distribution'], status: 'published', commercialVersion: 1 });
    createdPaths.push(`platformExtras/${extraId}`);

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
    assert.deepEqual(intent.requestedExtraSnapshots.map(item => item.id), [extraId]);
    await assert.rejects(platformCall(ownerUid, { ...intake, contactName: 'Datos distintos' }), error => error.code === 'already-exists');
    pass('registro manual de WhatsApp valida catálogo, captura plan/extras, es idempotente y no crea tenant');

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
    assert.equal(memberSnap.data().status, 'active');
    assert.equal(linkSnap.data().status, 'active');
    assert.equal(subscriptionSnap.data().status, 'active');
    assert(subscriptionSnap.data().nextRenewalAt);
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

    let tenant = tenantSnap.data();
    const member = memberSnap.data();
    assert.equal(hasPermission({ ...tenant, subscriptionStatus: 'pending' }, member, 'settings.manage'), false);
    const legacyTenant = { ...tenant };
    delete legacyTenant.billingEnforcement;
    delete legacyTenant.subscriptionStatus;
    assert.equal(hasPermission(legacyTenant, member, 'settings.manage'), true);
    assert.equal(hasPermission(tenant, { ...member, tenantId: 'other-tenant' }, 'settings.manage'), false);
    pass('billingEnforcement bloquea tenants pendientes, conserva el acceso legacy y mantiene aislamiento de tenant');

    await db.doc(`platformSubscriptions/${contractResult.contractId}`).update({ currentPeriodEnd: Timestamp.fromMillis(Date.now() + 10 * 86_400_000) });
    const changeId = opId();
    const change = await platformCall(ownerUid, { action: 'requestSubscriptionPlanChange', requestId: changeId,
      contractId: contractResult.contractId, planId: nextPlanId, billingCycle: 'monthly' });
    const changeReplay = await platformCall(ownerUid, { action: 'requestSubscriptionPlanChange', requestId: changeId,
      contractId: contractResult.contractId, planId: nextPlanId, billingCycle: 'monthly' });
    assert.equal(change.idempotent, false);
    assert.equal(changeReplay.idempotent, true);
    const scheduled = (await db.doc(`platformSubscriptions/${contractResult.contractId}`).get()).data();
    assert.equal(scheduled.planKey, planId, 'the current plan remains effective until next renewal');
    assert.equal(scheduled.pendingPlanChange.planSnapshot.planId, nextPlanId);
    assert.equal((await db.doc(`platformContracts/${contractResult.contractId}`).get()).data().terms.plan.planId, planId, 'accepted terms remain immutable');
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
    await platformCall(financeUid, { action: 'confirmManualPayment', paymentId: renewalPayment.paymentId, requestId: opId() });
    const updatedSubscription = (await db.doc(`platformSubscriptions/${contractResult.contractId}`).get()).data();
    assert.equal(updatedSubscription.planKey, nextPlanId);
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

    const anonymous = rulesEnv.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(anonymous, `platformContracts/${contractResult.contractId}`)));
    await assertFails(getDoc(doc(anonymous, `platformBillingCharges/${contractResult.chargeId}`)));
    const platformClient = rulesEnv.authenticatedContext(ownerUid, { platform: true, platformRole: 'platform_owner' }).firestore();
    await assertFails(getDoc(doc(platformClient, `platformBillingPayments/${firstPayment.paymentId}`)));
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
