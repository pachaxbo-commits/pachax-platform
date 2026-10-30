const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { initializeApp, deleteApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const {
  applyCapabilityAdjustments,
  adjustProductUsage,
  adjustUsage,
  hasPlanFeature,
  normalizeCapabilitiesV1,
  normalizeCapabilityAdjustments,
  tenantCapabilities,
} = require('../commercialCapabilities.cjs');
const { authorizeReportCapability } = require('../authorization.cjs');

const projectId = process.env.GCLOUD_PROJECT || '';
if (!projectId.startsWith('demo-')) throw new Error('Capability tests require an isolated demo Firebase project.');
if (!process.env.FIRESTORE_EMULATOR_HOST) throw new Error('Run this test with an isolated Firestore Emulator.');

const businessType = 'route_distribution';
const validCapabilities = {
  version: 1,
  businessType,
  limits: { activeUsers: 3, activeProducts: 2, activeBranches: 1 },
  features: {
    reports: { basic: true, detailed: false, export: false },
    receipts: { digital: false },
    printing: { manual: false, kitchenAutomatic: false },
    adsRequired: false,
  },
};

async function main() {
  const app = initializeApp({ projectId }, `commercial-capabilities-${randomUUID()}`);
  const db = getFirestore(app);
  const tenantId = `caps-${randomUUID()}`;
  const root = db.doc(`tenants/${tenantId}`);
  try {
    const tenant = { tenantId, businessType, billingEnforcement: true, commercialCapabilities: validCapabilities };
    assert.deepEqual(normalizeCapabilitiesV1(validCapabilities, businessType), validCapabilities);
    assert.throws(() => normalizeCapabilitiesV1({ ...validCapabilities, businessType: 'hamburger_shop' }, businessType), /capacidades V1/);
    assert.throws(() => normalizeCapabilitiesV1({ ...validCapabilities, features: {
      ...validCapabilities.features, reports: { ...validCapabilities.features.reports, basic: false },
    } }, businessType), /capacidad base de V1/);
    const documentCapabilities = normalizeCapabilitiesV1({ ...validCapabilities, features: {
      ...validCapabilities.features, printing: { manual: true, kitchenAutomatic: false },
      receipts: { digital: true },
    } }, businessType);
    assert.equal(documentCapabilities.features.receipts.digital, true);
    assert.equal(documentCapabilities.features.printing.manual, true);
    assert.equal(documentCapabilities.features.printing.kitchenAutomatic, false);
    const exportCapabilities = normalizeCapabilitiesV1({ ...validCapabilities, features: {
      ...validCapabilities.features, reports: { ...validCapabilities.features.reports, export: true },
    } }, businessType);
    assert.equal(exportCapabilities.features.reports.export, true, 'Reports Core V1 export capability is supported by a server check.');
    const adjusted = applyCapabilityAdjustments(validCapabilities, normalizeCapabilityAdjustments({ activeUsers: 1, activeProducts: 5 }));
    assert.equal(adjusted.limits.activeUsers, 4);
    assert.equal(adjusted.limits.activeProducts, 7);
    assert.throws(() => applyCapabilityAdjustments(validCapabilities, normalizeCapabilityAdjustments({ activeProducts: 199 })), /máximo técnico/);
    assert.equal(hasPlanFeature(tenant, 'reports.basic'), true);
    assert.equal(hasPlanFeature(tenant, 'receipts.digital'), false);
    assert.equal(hasPlanFeature({ ...tenant, commercialCapabilities: documentCapabilities }, 'receipts.digital'), true);
    assert.equal(hasPlanFeature({ ...tenant, commercialCapabilities: documentCapabilities }, 'printing.manual'), true);
    assert.equal(hasPlanFeature({ ...tenant, commercialCapabilities: documentCapabilities }, 'printing.kitchenAutomatic'), false);
    assert.equal(hasPlanFeature({ ...tenant, commercialCapabilities: { ...validCapabilities, features: {
      ...validCapabilities.features, reports: { ...validCapabilities.features.reports, basic: false },
    } } }, 'reports.basic'), false);
    assert.equal(tenantCapabilities({ businessType, billingEnforcement: false }), null, 'Legacy tenants do not gain enforcement implicitly.');
    assert.equal(hasPlanFeature({ businessType, billingEnforcement: false }, 'reports.basic'), true);
    for (const template of ['restaurant_pos', 'hamburger_shop', 'route_distribution', 'gelateria_weight_cafe', 'nightclub_lounge']) {
      const supported = normalizeCapabilitiesV1({ ...validCapabilities, businessType: template, features: {
        ...validCapabilities.features, receipts: { digital: true },
        printing: { manual: true, kitchenAutomatic: ['restaurant_pos', 'hamburger_shop', 'nightclub_lounge'].includes(template) },
      } }, template);
      assert.equal(supported.features.receipts.digital, true, `${template} supports digital receipts`);
      assert.equal(supported.features.printing.manual, true, `${template} supports browser/manual printing`);
      assert.equal(supported.features.printing.kitchenAutomatic, ['restaurant_pos', 'hamburger_shop', 'nightclub_lounge'].includes(template));
    }
    assert.throws(() => normalizeCapabilitiesV1({ ...validCapabilities, businessType: 'route_distribution', features: {
      ...validCapabilities.features, printing: { manual: true, kitchenAutomatic: true },
    } }, 'route_distribution'), /no está disponible/);
    console.log('PASS version, template identity, unsupported feature rejection, extra limits and legacy compatibility');
    console.log('PASS document and printing capability matrix for all five templates');

    const documentTenantId = `document-caps-${randomUUID()}`;
    const documentRoot = db.doc(`tenants/${documentTenantId}`);
    const documentTenant = { ...tenant, tenantId: documentTenantId, subscriptionStatus: 'active', billingAccessUntil: new Date(Date.now() + 60_000), commercialCapabilities: documentCapabilities };
    await documentRoot.set(documentTenant);
    const reportMemberUid = `report-owner-${randomUUID()}`;
    await documentRoot.collection('members').doc(reportMemberUid).set({ tenantId: documentTenantId, status: 'active', roleId: 'owner', branchIds: ['main'] });
    await documentRoot.update({ configuration: { features: { reports: true } } });
    const reportRequest = feature => ({ auth: { uid: reportMemberUid }, data: { tenantId: documentTenantId, branchId: 'main', feature } });
    assert.deepEqual(await authorizeReportCapability(db, reportRequest('reports.basic')), { authorized: true });
    await assert.rejects(authorizeReportCapability(db, reportRequest('reports.detailed')), error => error.code === 'permission-denied');
    await assert.rejects(authorizeReportCapability(db, reportRequest('reports.export')), error => error.code === 'permission-denied');
    const reportEnabled = { ...documentCapabilities, features: { ...documentCapabilities.features, reports: { basic: true, detailed: true, export: true } } };
    await documentRoot.update({ commercialCapabilities: reportEnabled });
    assert.deepEqual(await authorizeReportCapability(db, reportRequest('reports.detailed')), { authorized: true });
    assert.deepEqual(await authorizeReportCapability(db, reportRequest('reports.export')), { authorized: true });
    await assert.rejects(authorizeReportCapability(db, { auth: { uid: reportMemberUid }, data: { tenantId: documentTenantId, branchId: 'other', feature: 'reports.export' } }), error => error.code === 'permission-denied');
    await assert.rejects(authorizeReportCapability(db, { ...reportRequest('reports.export'), auth: null }), error => error.code === 'unauthenticated');
    await documentRoot.collection('members').doc(reportMemberUid).update({ status: 'disabled' });
    await assert.rejects(authorizeReportCapability(db, reportRequest('reports.export')), error => error.code === 'permission-denied');
    await documentRoot.collection('members').doc(reportMemberUid).update({ status: 'active' });
    console.log('PASS server report capability authorization, active member, role and plan gating');
    const documentUsageRef = documentRoot.collection('commercialUsage').doc('active');
    await documentUsageRef.set({ activeUsers: 1, activeProducts: 0, activeBranches: 1 });
    await db.runTransaction(tx => adjustProductUsage(tx, documentRoot, documentTenant, 1));
    assert.equal((await documentUsageRef.get()).data().activeProducts, 1,
      'Product quota mutations accept the same supported document capability snapshot');
    await db.recursiveDelete(documentRoot);
    console.log('PASS document capability snapshots remain compatible with product quota mutations');

    await root.set(tenant);
    const usageRef = root.collection('commercialUsage').doc('active');
    await usageRef.set({ activeUsers: 1, activeProducts: 0, activeBranches: 1 });
    const userResults = await Promise.allSettled(Array.from({ length: 6 }, () => db.runTransaction(tx => adjustUsage(tx, root, tenant, 'users', 1))));
    const userUsage = (await usageRef.get()).data();
    assert.equal(userUsage.activeUsers, 3, 'Concurrent user additions must never exceed the server-side plan cap.');
    assert.equal(userResults.filter(item => item.status === 'fulfilled').length, 2);
    assert(userResults.filter(item => item.status === 'rejected').every(item => ['resource-exhausted', 'aborted'].includes(item.reason.code)));
    console.log('PASS concurrent user quota: 2 accepted, cap held at 3');

    const productResults = await Promise.allSettled(Array.from({ length: 5 }, () => db.runTransaction(tx => adjustProductUsage(tx, root, tenant, 1))));
    const finalUsage = (await usageRef.get()).data();
    assert.equal(finalUsage.activeProducts, 2, 'Concurrent product additions must never exceed the server-side plan cap.');
    assert.equal(productResults.filter(item => item.status === 'fulfilled').length, 2);
    assert(productResults.filter(item => item.status === 'rejected').every(item => ['resource-exhausted', 'aborted'].includes(item.reason.code)));
    console.log('PASS concurrent product quota: 2 accepted, cap held at 2');

    await db.runTransaction(tx => adjustProductUsage(tx, root, tenant, -1));
    assert.equal((await usageRef.get()).data().activeProducts, 1, 'Archiving a product releases capacity.');
    await assert.rejects(db.runTransaction(tx => adjustUsage(tx, root, tenant, 'users', -4)), error => error.code === 'failed-precondition');
    await db.recursiveDelete(root);

    const legacyRoot = db.doc(`tenants/legacy-${tenantId}`);
    const legacy = { tenantId: `legacy-${tenantId}`, businessType };
    await db.runTransaction(tx => adjustProductUsage(tx, legacyRoot, legacy, 1));
    assert.equal((await legacyRoot.get()).exists, false, 'Legacy operations bypass new counters and retain existing data semantics.');
    console.log('PASS releases, fail-closed inconsistent counters and legacy no-op behavior');
  } finally {
    await db.recursiveDelete(root).catch(() => undefined);
    await db.recursiveDelete(db.doc(`tenants/legacy-${tenantId}`)).catch(() => undefined);
    await deleteApp(app);
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
