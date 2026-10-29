const assert = require('node:assert/strict');
const fs = require('node:fs');
const { randomUUID } = require('node:crypto');
const { initializeTestEnvironment, assertFails } = require('@firebase/rules-unit-testing');
const { doc, getDoc } = require('firebase/firestore');

const projectId = process.env.GCLOUD_PROJECT || 'demo-pachax-platform';
if (!projectId.startsWith('demo-')) throw new Error(`Proyecto de emulador no permitido: ${projectId}`);
process.env.FIRESTORE_EMULATOR_HOST ||= '127.0.0.1:8185';
process.env.FIREBASE_AUTH_EMULATOR_HOST ||= '127.0.0.1:9195';
const { initializeApp, deleteApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { getAuth } = require('firebase-admin/auth');
const platform = require('../platform.cjs');
const assisted = require('../assistedTenantProvisioning.cjs');

const suffix = randomUUID().replace(/-/g, '');
const app = initializeApp({ projectId }, `assisted-onboarding-${suffix}`);
const db = getFirestore(app);
const auth = getAuth(app);
const operatorUid = `platform-owner-${suffix}`;
const adminUid = `platform-admin-${suffix}`;
const ownerEmail = `qa-owner-${suffix}@example.test`;
const existingEmail = `existing-owner-${suffix}@example.test`;
const resetUrlBase = `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1`;
let env;
let passed = 0;
const pass = label => { passed += 1; console.log(`PASS ${label}`); };

async function signIn(email, password) {
  const response = await fetch(`${resetUrlBase}/accounts:signInWithPassword?key=emulator`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password, returnSecureToken: true }),
  });
  const payload = await response.json();
  assert.equal(response.ok, true, JSON.stringify(payload));
  return payload.idToken;
}

async function callGateway(token, data) {
  const origin = process.env.C1_FUNCTIONS_ORIGIN || 'http://127.0.0.1:5101';
  const response = await fetch(`${origin}/${projectId}/southamerica-west1/platformGateway`, {
    method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({ data }),
  });
  return { response, payload: await response.json() };
}

async function callTenantGateway(token, data) {
  const origin = process.env.C1_FUNCTIONS_ORIGIN || 'http://127.0.0.1:5101';
  const response = await fetch(`${origin}/${projectId}/southamerica-west1/tenantGateway`, {
    method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({ data }),
  });
  return { response, payload: await response.json() };
}

function request(operationId, overrides = {}) {
  return {
    action: 'createAssistedTenant', operationId,
    companyName: `QA Distribución ${suffix}`,
    businessType: 'route_distribution',
    ownerEmail, ownerDisplayName: 'Propietario QA', ownerEmailConfirmed: true,
    industryProfile: 'beverages', currency: 'BOB', currencySymbol: 'Bs', timezone: 'America/La_Paz',
    businessIdentity: { legalName: 'QA Distribución S.A.', city: 'Cochabamba' },
    ...overrides,
  };
}

async function paidRequest(operationId, overrides = {}) {
  const { paymentStatus, ...requestOverrides } = overrides;
  const payload = request(operationId, requestOverrides);
  const billingContractId = `qa-contract-${operationId}`;
  const initialChargeId = `qa-charge-${operationId}`;
  payload.billingContractId = billingContractId;
  const paid = paymentStatus !== 'due';
  await db.doc(`platformContracts/${billingContractId}`).set({
    contractId: billingContractId, status: 'ready_for_activation', businessType: payload.businessType,
    customer: { companyName: payload.companyName, email: payload.ownerEmail },
    terms: { companyName: payload.companyName, billingCycle: 'monthly', currency: 'USD', recurringMinor: 1200, plan: null },
    initialChargeId, createdAt: new Date(),
  });
  await db.doc(`platformBillingCharges/${initialChargeId}`).set({
    chargeId: initialChargeId, contractId: billingContractId, kind: 'initial', currency: 'USD',
    amountMinor: 1200, paidMinor: paid ? 1200 : 0, pendingMinor: 0, status: paid ? 'paid' : 'due', createdAt: new Date(),
  });
  await db.doc(`platformSubscriptions/${billingContractId}`).set({
    contractId: billingContractId, status: 'pending', tenantId: null, createdAt: new Date(),
  });
  return payload;
}

async function cleanup() {
  const ops = await db.collection('platformAssistedTenantOperations').where('actorUid', '==', operatorUid).get();
  for (const operation of ops.docs) {
    const data = operation.data();
    if (data.tenantId) await db.recursiveDelete(db.doc(`tenants/${data.tenantId}`));
    if (data.ownerUid) {
      await db.doc(`users/${data.ownerUid}`).delete().catch(() => undefined);
      await db.recursiveDelete(db.collection(`users/${data.ownerUid}/tenantLinks`)).catch(() => undefined);
      await db.recursiveDelete(db.collection(`users/${data.ownerUid}/onboarding`)).catch(() => undefined);
      await auth.deleteUser(data.ownerUid).catch(() => undefined);
    }
    await operation.ref.delete();
    if (data.companyKey) await db.doc(`platformAssistedTenantNames/${data.companyKey}`).delete().catch(() => undefined);
  }
  for (const uid of [operatorUid, adminUid]) {
    await db.doc(`platformOperators/${uid}`).delete().catch(() => undefined);
    await auth.deleteUser(uid).catch(() => undefined);
  }
  const audits = await db.collection('platformAuditLogs').where('operatorUid', '==', operatorUid).get();
  await Promise.all(audits.docs.map(item => item.ref.delete()));
}

async function run() {
try {
  env = await initializeTestEnvironment({ projectId, firestore: { rules: fs.readFileSync('firebase/firestore.rules', 'utf8') } });
  const operator = await auth.createUser({ uid: operatorUid, email: `${operatorUid}@example.test`, password: 'Emulator123!', displayName: 'Platform QA Owner' });
  await auth.setCustomUserClaims(operator.uid, { platform: true, platformRole: 'platform_owner' });
  await db.doc(`platformOperators/${operatorUid}`).set({ uid: operatorUid, role: 'platform_owner', active: true });
  const admin = await auth.createUser({ uid: adminUid, email: `${adminUid}@example.test`, password: 'Emulator123!', displayName: 'Platform QA Admin' });
  await auth.setCustomUserClaims(admin.uid, { platform: true, platformRole: 'platform_admin' });
  await db.doc(`platformOperators/${adminUid}`).set({ uid: adminUid, role: 'platform_admin', active: true });
  const ownerToken = await signIn(`${operatorUid}@example.test`, 'Emulator123!');
  const adminToken = await signIn(`${adminUid}@example.test`, 'Emulator123!');

  const templates = await callGateway(ownerToken, { action: 'listAssistedTenantTemplates' });
  assert.equal(templates.response.ok, true, JSON.stringify(templates.payload));
  const templateTypes = templates.payload.result.templates.map(template => template.businessType);
  assert.deepEqual(templateTypes.sort(), ['nightclub_lounge', 'restaurant_pos', 'route_distribution'].sort());
  pass('la lista solo incluye las plantillas técnicamente disponibles');

  const denied = await callGateway(adminToken, { action: 'listAssistedTenantTemplates' });
  assert.equal(denied.response.ok, false);
  assert.equal(denied.payload.error?.status, 'PERMISSION_DENIED');
  const deniedCreate = await callGateway(adminToken, request(randomUUID()));
  assert.equal(deniedCreate.payload.error?.status, 'PERMISSION_DENIED');
  pass('Platform Admin no puede consultar ni crear altas asistidas');

  const invalid = await callGateway(ownerToken, request(randomUUID(), { businessType: 'hamburger_shop' }));
  assert.equal(invalid.response.ok, false);
  assert.equal(invalid.payload.error?.status, 'FAILED_PRECONDITION');
  await assert.rejects(auth.getUserByEmail(ownerEmail), error => error.code === 'auth/user-not-found');
  pass('una plantilla no habilitada se rechaza antes de crear identidad Auth');

  const unpaidEmail = `unpaid-${suffix}@example.test`;
  const unpaidPayload = await paidRequest(randomUUID(), { ownerEmail: unpaidEmail, paymentStatus: 'due' });
  const unpaid = await callGateway(ownerToken, unpaidPayload);
  assert.equal(unpaid.response.ok, false);
  assert.equal(unpaid.payload.error?.status, 'FAILED_PRECONDITION', JSON.stringify(unpaid.payload.error));
  await assert.rejects(auth.getUserByEmail(unpaidEmail), error => error.code === 'auth/user-not-found');
  const noContractEmail = `no-contract-${suffix}@example.test`;
  const noContract = await callGateway(ownerToken, request(randomUUID(), { ownerEmail: noContractEmail }));
  assert.equal(noContract.response.ok, false);
  assert.equal(noContract.payload.error?.status, 'FAILED_PRECONDITION');
  await assert.rejects(auth.getUserByEmail(noContractEmail), error => error.code === 'auth/user-not-found');
  pass('alta asistida rechaza contrato ausente o saldo inicial no pagado antes de crear Auth');

  const operationId = randomUUID();
  const payload = await paidRequest(operationId);
  const [createdA, createdB] = await Promise.all([callGateway(ownerToken, payload), callGateway(ownerToken, payload)]);
  assert.equal(createdA.response.ok, true, JSON.stringify(createdA.payload));
  assert.equal(createdB.response.ok, true, JSON.stringify(createdB.payload));
  const resultA = createdA.payload.result;
  const resultB = createdB.payload.result;
  assert.equal(resultA.tenantId, resultB.tenantId);
  assert.equal(resultA.ownerUid, resultB.ownerUid);
  assert.equal(resultA.ownerAccess.method, 'one_time_password_setup');
  assert.equal(typeof resultA.ownerAccess.setupLink, 'string');
  const tenantRef = db.doc(`tenants/${resultA.tenantId}`);
  const [tenantSnap, memberSnap, branchSnap, ownerProfile, linkSnap] = await Promise.all([
    tenantRef.get(), tenantRef.collection('members').doc(resultA.ownerUid).get(), tenantRef.collection('branches').doc('main').get(),
    db.doc(`users/${resultA.ownerUid}`).get(), db.doc(`users/${resultA.ownerUid}/tenantLinks/${resultA.tenantId}`).get(),
  ]);
  assert.equal(tenantSnap.data().status, 'active');
  assert.equal(tenantSnap.data().businessType, 'route_distribution');
  assert.equal(tenantSnap.data().planKey, null);
  assert.deepEqual(tenantSnap.data().entitlements, {});
  assert.equal(memberSnap.data().roleId, 'owner');
  assert.equal(memberSnap.data().status, 'active');
  assert.equal(branchSnap.data().active, true);
  assert.equal(ownerProfile.exists, true);
  assert.equal(linkSnap.data().status, 'active');
  const allForName = await db.collection('tenants').where('nameKey', '==', payload.companyName.toLowerCase()).get();
  assert.equal(allForName.size, 1);
  const createdAuth = await auth.getUser(resultA.ownerUid);
  assert.equal(createdAuth.disabled, false);
  pass('alta concurrente e idempotente crea tenant, owner, sucursal, perfil y enlace una sola vez');

  const resetLink = new URL(resultA.ownerAccess.setupLink);
  assert.equal(resetLink.searchParams.get('mode'), 'resetPassword');
  const reset = await fetch(`${resetUrlBase}/accounts:resetPassword?key=emulator`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ oobCode: resetLink.searchParams.get('oobCode'), newPassword: 'OwnerQaPass123!' }),
  });
  assert.equal(reset.ok, true, await reset.text());
  const ownerSessionToken = await signIn(ownerEmail, 'OwnerQaPass123!');
  const memberships = await callTenantGateway(ownerSessionToken, { action: 'listMemberships' });
  assert.equal(memberships.response.ok, true, JSON.stringify(memberships.payload));
  assert.equal(memberships.payload.result.length, 1);
  assert.equal(memberships.payload.result[0].tenant.tenantId, resultA.tenantId);
  pass('el enlace temporal permite al propietario configurar contraseña e ingresar a su tenant');

  const existing = await auth.createUser({ email: existingEmail, password: 'ExistingOwner123!', displayName: 'Propietario existente' });
  const linkedId = randomUUID();
  const linkedPayload = await paidRequest(linkedId, {
    companyName: `QA Empresa vinculada ${suffix}`, ownerEmail: existingEmail,
    ownerDisplayName: 'Propietario existente', businessType: 'restaurant_pos', industryProfile: undefined,
  });
  const linked = await callGateway(ownerToken, linkedPayload);
  assert.equal(linked.response.ok, true, JSON.stringify(linked.payload));
  assert.equal(linked.payload.result.ownerUid, existing.uid);
  assert.deepEqual(linked.payload.result.ownerAccess, { method: 'existing_account', setupLink: null, setupLinkPending: false });
  const existingToken = await signIn(existingEmail, 'ExistingOwner123!');
  const linkedMemberships = await callTenantGateway(existingToken, { action: 'listMemberships' });
  assert.equal(linkedMemberships.response.ok, true, JSON.stringify(linkedMemberships.payload));
  assert.equal(linkedMemberships.payload.result[0].tenant.tenantId, linked.payload.result.tenantId);
  pass('la identidad Auth existente se vincula sin cambiar su contraseña y conserva acceso');

  const failingId = randomUUID();
  const failingRequest = await paidRequest(failingId, { companyName: `QA Reintento ${suffix}`, ownerEmail: `retry-${suffix}@example.test` });
  const syntheticRequest = { auth: { uid: operatorUid, token: { platform: true } }, data: failingRequest };
  await assert.rejects(assisted.createAssistedTenant(db, auth, syntheticRequest, { afterProvisioningRecords: async () => { throw new Error('forced-qa-interruption'); } }));
  const failedOperation = (await db.doc(`platformAssistedTenantOperations/${failingId}`).get()).data();
  assert.equal(failedOperation.status, 'provisioned');
  assert.equal((await db.doc(`tenants/${failedOperation.tenantId}`).get()).data().status, 'provisioning');
  assert.equal((await db.doc(`tenants/${failedOperation.tenantId}/members/${failedOperation.ownerUid}`).get()).data().status, 'pending');
  assert.equal((await auth.getUser(failedOperation.ownerUid)).disabled, true);
  const recovered = await callGateway(ownerToken, failingRequest);
  assert.equal(recovered.response.ok, true, JSON.stringify(recovered.payload));
  assert.equal(recovered.payload.result.tenantId, failedOperation.tenantId);
  assert.equal((await db.doc(`tenants/${failedOperation.tenantId}`).get()).data().status, 'active');
  pass('una interrupción deja el tenant y la identidad pendientes, sin acceso; el mismo reintento los completa');

  const changedRetry = await callGateway(ownerToken, request(operationId, { companyName: 'Nombre cambiado', billingContractId: payload.billingContractId }));
  assert.equal(changedRetry.response.ok, false);
  assert.equal(changedRetry.payload.error?.status, 'ALREADY_EXISTS');
  pass('reutilizar operationId con datos diferentes se rechaza sin duplicar empresa');

  const operatorClient = env.authenticatedContext(operatorUid, { platform: true }).firestore();
  await assertFails(getDoc(doc(operatorClient, 'platformAssistedTenantOperations', operationId)));
  const companyKey = (await db.doc(`platformAssistedTenantOperations/${operationId}`).get()).data().companyKey;
  await assertFails(getDoc(doc(operatorClient, 'platformAssistedTenantNames', companyKey)));
  pass('Rules bloquean lectura directa de operaciones y reservas internas de nombres');

  const activeTenants = await db.collection('tenants').where('status', '==', 'active').where('provisioningOperationId', '==', operationId).get();
  assert.equal(activeTenants.size, 1);
  const audit = await db.collection('platformAuditLogs').where('operatorUid', '==', operatorUid).get();
  assert(audit.docs.some(item => item.data().action === 'tenant.assistedProvision.completed'));
  assert(!audit.docs.some(item => JSON.stringify(item.data()).includes('setupLink')));
  pass('auditoría Platform registra la operación sin guardar el enlace de acceso');

  console.log(`RESULT ${passed} assisted-tenant emulator assertions passed`);
} finally {
  await cleanup().catch(() => undefined);
  await env?.cleanup().catch(() => undefined);
  await deleteApp(app).catch(() => undefined);
}
}

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
