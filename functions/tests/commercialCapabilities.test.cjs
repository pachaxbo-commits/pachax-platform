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
    assert.throws(() => normalizeCapabilitiesV1({ ...validCapabilities, features: {
      ...validCapabilities.features, printing: { manual: true, kitchenAutomatic: false },
    } }, businessType), /no tiene control técnico completo/);
    const adjusted = applyCapabilityAdjustments(validCapabilities, normalizeCapabilityAdjustments({ activeUsers: 1, activeProducts: 5 }));
    assert.equal(adjusted.limits.activeUsers, 4);
    assert.equal(adjusted.limits.activeProducts, 7);
    assert.throws(() => applyCapabilityAdjustments(validCapabilities, normalizeCapabilityAdjustments({ activeProducts: 199 })), /máximo técnico/);
    assert.equal(hasPlanFeature(tenant, 'reports.basic'), true);
    assert.equal(hasPlanFeature({ ...tenant, commercialCapabilities: { ...validCapabilities, features: {
      ...validCapabilities.features, reports: { ...validCapabilities.features.reports, basic: false },
    } } }, 'reports.basic'), false);
    assert.equal(tenantCapabilities({ businessType, billingEnforcement: false }), null, 'Legacy tenants do not gain enforcement implicitly.');
    assert.equal(hasPlanFeature({ businessType, billingEnforcement: false }, 'reports.basic'), true);
    console.log('PASS version, template identity, unsupported feature rejection, extra limits and legacy compatibility');

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
