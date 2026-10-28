const assert = require('node:assert/strict');
const { initializeApp, deleteApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const commercial = require('../commercialOnboarding.cjs');

const projectId = process.env.GCLOUD_PROJECT || process.env.FIREBASE_CONFIG_PROJECT_ID;
if (!projectId?.startsWith('demo-')) throw new Error('This test may only run against a demo Firebase project.');
if (!process.env.FIRESTORE_EMULATOR_HOST) throw new Error('FIRESTORE_EMULATOR_HOST must point to the isolated emulator.');
const app = initializeApp({ projectId }, `catalog-init-${Date.now()}`);
const db = getFirestore(app);
const suffix = Date.now().toString(36);
let transactionCount = 0;
const observedDb = new Proxy(db, {
  get(target, property) {
    if (property === 'runTransaction') return (...args) => {
      transactionCount++;
      return target.runTransaction(...args);
    };
    const value = Reflect.get(target, property, target);
    return typeof value === 'function' ? value.bind(target) : value;
  },
});

async function getCatalog() {
  return commercial.getPublicCommercialCatalog(observedDb);
}

async function clearDocuments() {
  for (const path of [
    'platformConfig/publicCommercialCatalogMeta',
    'platformConfig/publicCommercialCatalog',
    `platformTemplates/hamburger`,
    `platformTemplates/custom`,
    `platformPlans/catalog-init-plan-${suffix}`,
  ]) await db.doc(path).delete().catch(() => undefined);
}

async function main() {
  await clearDocuments();
  try {
    const firstReads = await Promise.all(Array.from({ length: 8 }, getCatalog));
    assert(firstReads.every(catalog => Array.isArray(catalog.templates)));
    assert.equal(transactionCount, 1, 'same-revision concurrent cold reads must share one transaction, including initialization');
    let meta = (await db.doc('platformConfig/publicCommercialCatalogMeta').get()).data();
    let snapshot = (await db.doc('platformConfig/publicCommercialCatalog').get()).data();
    assert.equal(meta.revision, 0);
    assert.equal(snapshot.revision, 0);
    assert.deepEqual(snapshot.catalog.templates, []);
    console.log('PASS primera consulta vacía crea meta y snapshot revision 0 de forma atómica/concurrente');

    const transactionsAfterInitialization = transactionCount;
    const laterReads = await Promise.all(Array.from({ length: 64 }, getCatalog));
    assert(laterReads.every(catalog => catalog.templates.length === 0));
    assert.equal((await db.doc('platformConfig/publicCommercialCatalogMeta').get()).data().revision, 0);
    assert.equal(transactionCount, transactionsAfterInitialization, 'warm reads must reuse the cached snapshot');
    const rateLimitDocs = await db.collection('platformCommercialRateLimits').get();
    assert(rateLimitDocs.docs.every(document => !('catalogCount' in document.data()) && !('catalogMinuteCount' in document.data())));
    console.log('PASS 64 consultas repetidas/concurrentes (incluidas visitas bajo IP compartida) reciben 200 sin cuota por IP ni reconstrucción');
    console.log('PASS lecturas estables reutilizan snapshot y no escriben contadores del catálogo');

    await db.doc('platformTemplates/hamburger').set({
      status: 'published', commercialName: 'Restaurante Rápido aprobado',
      commercialAvailability: 'coming_soon', commercialMode: 'self_service', order: 1,
      privateAdminNotes: 'no publicar',
    });
    await db.doc('platformConfig/publicCommercialCatalogMeta').delete();
    await db.doc('platformConfig/publicCommercialCatalog').set({
      revision: 0, catalog: { templates: [{ id: 'stale-draft' }], plans: [] },
    });
    const repairedReads = await Promise.all(Array.from({ length: 8 }, getCatalog));
    assert(repairedReads.every(catalog => catalog.templates.some(template => template.id === 'hamburger')));
    assert(repairedReads.every(catalog => !catalog.templates.some(template => template.id === 'stale-draft')));
    assert.equal(repairedReads[0].templates.find(template => template.id === 'hamburger').commercialName, 'Restaurante Rápido aprobado');
    assert.equal('privateAdminNotes' in repairedReads[0].templates.find(template => template.id === 'hamburger'), false);

    const customSeed = db.batch();
    customSeed.set(db.doc('platformTemplates/custom'), {
      status: 'published', commercialName: 'Solución a medida', order: 6,
      demoPath: '/demo/custom-should-never-leak', demoEnabled: true,
      implementationBasePriceUSD: 900, privateAdminNotes: 'no publicar',
    });
    await commercial.commitPublicCatalogMutation(db, customSeed);
    const customCatalog = await getCatalog();
    const custom = customCatalog.templates.find(template => template.id === 'custom');
    assert(custom, 'published custom editorial card should be present');
    assert.equal(custom.commercialName, 'Solución a medida');
    assert.equal(custom.canonicalTemplateId, null);
    assert.equal(custom.demoPath, '');
    assert.equal(custom.demoEnabled, false);
    assert.equal(custom.commercialAvailability, 'coming_soon');
    assert.equal(custom.implementationBasePriceUSD, null);
    assert.equal(custom.primaryActionLabel, 'Cotizar a medida');
    assert.equal('privateAdminNotes' in custom, false);
    assert.equal(customCatalog.plans.some(plan => plan.templateId === 'custom'), false);
    console.log('PASS custom aparece solo como ficha editorial sin demo, precio ni acceso a planes');
    meta = (await db.doc('platformConfig/publicCommercialCatalogMeta').get()).data();
    snapshot = (await db.doc('platformConfig/publicCommercialCatalog').get()).data();
    assert.equal(meta.revision, 2);
    assert.equal(snapshot.revision, 2);
    console.log('PASS repara snapshot revision 0 sin meta reconstruyendo únicamente desde fuentes publicadas');

    const planId = `catalog-init-plan-${suffix}`;
    const batch = db.batch();
    batch.set(db.doc(`platformPlans/${planId}`), {
      templateId: 'hamburger', name: 'Plan publicado QA', planKind: 'paid', tierLevel: 1,
      monthlyPriceUSD: 20, annualPriceUSD: 200, currency: 'USD', status: 'published',
      priceApproval: 'approved', technicalEntitlements: [], includedFeatures: ['Caja'], order: 1,
    });
    const publishedRevision = await commercial.commitPublicCatalogMutation(db, batch);
    assert.equal(publishedRevision, 3);
    meta = (await db.doc('platformConfig/publicCommercialCatalogMeta').get()).data();
    snapshot = (await db.doc('platformConfig/publicCommercialCatalog').get()).data();
    assert.equal(meta.revision, 3);
    assert.equal(snapshot.revision, 3);
    assert(snapshot.catalog.plans.some(plan => plan.id === planId));
    console.log('PASS publicar un plan actualiza contenido y revisión de meta/snapshot conjuntamente');

    const unpublish = db.batch();
    unpublish.set(db.doc(`platformPlans/${planId}`), { status: 'draft' }, { merge: true });
    assert.equal(await commercial.commitPublicCatalogMutation(db, unpublish), 4);
    const transactionsBeforeInvalidation = transactionCount;
    const afterUnpublish = await getCatalog();
    assert.equal(afterUnpublish.plans.some(plan => plan.id === planId), false);
    assert.equal(transactionCount, transactionsBeforeInvalidation + 1, 'revision change must bypass cached snapshot');
    meta = (await db.doc('platformConfig/publicCommercialCatalogMeta').get()).data();
    snapshot = (await db.doc('platformConfig/publicCommercialCatalog').get()).data();
    assert.equal(meta.revision, 4);
    assert.equal(snapshot.revision, 4);
    console.log('PASS despublicar plan retira la oferta y mantiene revisión coherente');

    await db.doc('platformConfig/publicCommercialCatalogMeta').set({ revision: 6 }, { merge: true });
    await db.doc('platformConfig/publicCommercialCatalog').set({ revision: 5, catalog: snapshot.catalog }, { merge: true });
    await assert.rejects(() => getCatalog(), error => error.code === 'unavailable');
    assert.equal((await db.doc('platformConfig/publicCommercialCatalogMeta').get()).data().revision, 6);
    assert.equal((await db.doc('platformConfig/publicCommercialCatalog').get()).data().revision, 5);
    console.log('PASS desfase de revisiones no recuperable se rechaza sin mutar documentos');

    await db.doc('platformConfig/publicCommercialCatalogMeta').delete();
    await db.doc('platformConfig/publicCommercialCatalog').set({ revision: 7, catalog: snapshot.catalog }, { merge: true });
    await assert.rejects(() => getCatalog(), error => error.code === 'unavailable');
    console.log('PASS ausencia de meta con snapshot fuera del estado parcial conocido falla cerrado');
  } finally {
    await clearDocuments();
    await deleteApp(app);
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
