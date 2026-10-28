const assert = require('node:assert/strict');
const { initializeApp, deleteApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const platform = require('../platform.cjs');
const commercial = require('../commercialOnboarding.cjs');

const projectId = process.env.GCLOUD_PROJECT || process.env.FIREBASE_CONFIG_PROJECT_ID;
if (!projectId?.startsWith('demo-')) throw new Error('This test may only run against a demo Firebase project.');
if (!process.env.FIRESTORE_EMULATOR_HOST) throw new Error('FIRESTORE_EMULATOR_HOST must point to the isolated emulator.');
const app = initializeApp({ projectId }, `platform-seed-${Date.now()}`);
const db = getFirestore(app);
const templateIds = ['restaurant', 'distribution', 'nightclub', 'hamburger', 'retail', 'custom'];
const testPlanId = 'seed-catalog-only-hamburger-plan';
const testExtraId = 'seed-catalog-only-extra';

function request(uid, role, data) {
  return { auth: { uid, token: { platform: true } }, data };
}

function seedPayload() {
  return {
    landingContent: { heroTitle: 'PACHAX público' },
    templates: templateIds.map((id, index) => ({
      id,
      commercialName: id === 'custom' ? 'Solución a medida' : `Ficha ${id}`,
      status: 'published',
      order: index + 1,
      demoPath: id === 'custom' ? '/demo/custom-private' : `/demo/${id}`,
      demoEnabled: true,
      demoEnabledConfigured: true,
      implementationBasePriceUSD: 500,
      commercialAvailability: 'available',
      commercialMode: 'self_service',
      primaryActionLabel: 'Comenzar',
      privateAdminNotes: 'no seed test',
    })),
    plans: [{
      id: testPlanId, templateId: 'hamburger', name: 'Referencial', planKind: 'paid',
      monthlyPriceUSD: 25, annualPriceUSD: 250, currency: 'USD', status: 'published',
    }],
    extras: [{ id: testExtraId, title: 'Extra de prueba', status: 'published' }],
    mediaAssets: [],
  };
}

async function main() {
  const operatorIds = ['catalog-seed-owner', 'catalog-seed-admin', 'catalog-seed-support'];
  for (const [index, role] of ['platform_owner', 'platform_admin', 'platform_support'].entries()) {
    await db.doc(`platformOperators/${operatorIds[index]}`).set({ role, active: true });
  }
  const restaurantRef = db.doc('platformTemplates/restaurant');
  const existingRestaurant = {
    status: 'published', commercialName: 'Configuración del owner', order: 99,
    privateAdminNotes: 'must stay untouched',
  };
  await restaurantRef.set(existingRestaurant);

  try {
    const attempts = await Promise.all([
      platform.platformGateway(db, request(operatorIds[0], 'platform_owner', { action: 'seedPlatformConfig', defaults: seedPayload() })),
      platform.platformGateway(db, request(operatorIds[1], 'platform_admin', { action: 'seedPlatformConfig', defaults: seedPayload() })),
    ]);
    assert(attempts.every(result => result.success));

    const preserved = (await restaurantRef.get()).data();
    assert.equal(preserved.commercialName, existingRestaurant.commercialName);
    assert.equal(preserved.status, 'published');
    assert.equal(preserved.order, 99);
    assert.equal(preserved.privateAdminNotes, existingRestaurant.privateAdminNotes);

    for (const id of templateIds.filter(value => value !== 'restaurant')) {
      const snap = await db.doc(`platformTemplates/${id}`).get();
      assert(snap.exists, `${id} should be initialized if missing`);
      assert.equal(snap.data().status, 'published');
    }
    assert.equal((await db.doc(`platformPlans/${testPlanId}`).get()).data().status, 'draft');
    assert.equal((await db.doc(`platformExtras/${testExtraId}`).get()).data().status, 'draft');
    const revisionAfterConcurrentSeed = (await db.doc('platformConfig/publicCommercialCatalogMeta').get()).data().revision;
    await platform.platformGateway(db, request(operatorIds[0], 'platform_owner', {
      action: 'seedPlatformConfig', defaults: seedPayload(),
    }));
    assert.equal((await db.doc('platformConfig/publicCommercialCatalogMeta').get()).data().revision, revisionAfterConcurrentSeed);

    await assert.rejects(
      platform.platformGateway(db, request(operatorIds[2], 'platform_support', {
        action: 'seedPlatformConfig', defaults: seedPayload(),
      })),
      error => error.code === 'permission-denied',
    );

    const catalog = await commercial.getPublicCommercialCatalog(db, {
      rawRequest: { ip: '198.51.100.245' },
    }, 'emulator-only-seed-test-secret-at-least-32-bytes', { emulator: true });
    assert.deepEqual(catalog.templates.map(template => template.id).sort(), [...templateIds].sort());
    assert.equal(catalog.plans.length, 0, 'plans seeded by defaults remain drafts');
    const custom = catalog.templates.find(template => template.id === 'custom');
    assert.equal(custom.demoEnabled, false);
    assert.equal(custom.demoPath, '');
    assert.equal(custom.commercialAvailability, 'coming_soon');
    assert.equal(custom.commercialMode, 'specialized');
    assert.equal(custom.implementationBasePriceUSD, null);
    assert.equal(custom.primaryActionLabel, 'Cotizar a medida');
    assert.equal('privateAdminNotes' in custom, false);
    console.log('PASS seed autenticado owner/admin, no sobrescribe, conserva revisión en reintento, limita roles y publica solo plantillas permitidas');
  } finally {
    for (const id of templateIds) await db.doc(`platformTemplates/${id}`).delete().catch(() => undefined);
    await db.doc('platformConfig/publicLanding').delete().catch(() => undefined);
    await db.doc(`platformPlans/${testPlanId}`).delete().catch(() => undefined);
    await db.doc(`platformExtras/${testExtraId}`).delete().catch(() => undefined);
    await db.doc('platformConfig/publicCommercialCatalogMeta').delete().catch(() => undefined);
    await db.doc('platformConfig/publicCommercialCatalog').delete().catch(() => undefined);
    for (const uid of operatorIds) await db.doc(`platformOperators/${uid}`).delete().catch(() => undefined);
    await deleteApp(app);
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
