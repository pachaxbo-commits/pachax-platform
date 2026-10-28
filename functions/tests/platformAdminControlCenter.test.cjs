const assert = require('node:assert/strict');
const { initializeApp, deleteApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const platform = require('../platform.cjs');
const commercial = require('../commercialOnboarding.cjs');

const projectId = process.env.GCLOUD_PROJECT || process.env.FIREBASE_CONFIG_PROJECT_ID;
if (!projectId?.startsWith('demo-')) throw new Error('This test may only run against a demo Firebase project.');
if (!process.env.FIRESTORE_EMULATOR_HOST) throw new Error('FIRESTORE_EMULATOR_HOST must point to an isolated emulator.');

const app = initializeApp({ projectId }, `admin-control-center-${Date.now()}`);
const db = getFirestore(app);
const nonce = Date.now().toString(36);
const owner = `acc-owner-${nonce}`;
const content = `acc-content-${nonce}`;
const support = `acc-support-${nonce}`;
const planId = `acc-plan-${nonce}`;
const extraId = `acc-extra-${nonce}`;
const mediaId = `acc-media-${nonce}`;
const publicRefs = [
  db.doc('platformConfig/publicCommercialCatalogMeta'),
  db.doc('platformConfig/publicCommercialCatalog'),
  db.doc('platformConfig/publicLanding'),
  db.doc('platformTemplates/distribution'),
  db.doc('platformTemplates/custom'),
];
const saved = new Map();

function request(uid, data) {
  return { auth: { uid, token: { platform: true } }, data };
}

async function saveAs(uid, data) {
  return platform.platformGateway(db, request(uid, data));
}

async function snapshot(ref) {
  const result = await ref.get();
  return result.exists ? result.data() : null;
}

async function restore(ref, value) {
  if (value === null) await ref.delete();
  else await ref.set(value);
}

async function main() {
  for (const ref of publicRefs) saved.set(ref.path, await snapshot(ref));
  for (const [uid, role] of [[owner, 'platform_owner'], [content, 'platform_content'], [support, 'platform_support']]) {
    await db.doc(`platformOperators/${uid}`).set({ role, active: true });
  }

  try {
    const templateRef = db.doc('platformTemplates/distribution');
    const currentTemplate = (await templateRef.get()).data() || {};
    const templateRevision = Number(currentTemplate.revision || 0);
    const templateDraft = {
      ...currentTemplate,
      id: 'distribution',
      status: 'draft',
      commercialName: 'Distribución QA Admin',
      cardSubtitle: 'Ficha controlada de emulador',
      description: 'Contenido ficticio de prueba',
      detailDescription: 'Descripción ficticia para verificar guardado y lectura pública.',
      targetAudience: 'Distribuidores QA',
      problemSolved: 'Prueba de configuración administrativa',
      bullets: ['Inventario de prueba'],
      features: ['Contenido ficticio'],
      order: 2,
      commercialMode: 'specialized',
      demoRoute: '/demo/distribution',
      demoPath: '/demo/distribution',
      primaryActionLabel: 'Crear empresa',
      privateAdminNotes: 'campo no permitido',
    };
    await assert.rejects(saveAs(owner, {
      action: 'saveTemplate', template: { ...templateDraft, demoRoute: '/register' },
      expectedRevision: templateRevision,
    }), error => error.code === 'invalid-argument');
    const savedTemplate = await saveAs(owner, {
      action: 'saveTemplate', template: templateDraft, expectedRevision: templateRevision,
    });
    assert.equal(savedTemplate.success, true);
    assert.equal(savedTemplate.revision, templateRevision + 1);
    let storedTemplate = (await templateRef.get()).data();
    assert.equal(storedTemplate.demoRoute, '/demo/distribution', 'route must remain canonical');
    assert.equal(storedTemplate.primaryActionLabel, 'Solicitar implementación', 'security CTA must remain canonical');
    assert.equal(storedTemplate.privateAdminNotes, undefined);

    await assert.rejects(saveAs(content, {
      action: 'saveTemplate', template: { ...templateDraft, status: 'published' },
      expectedRevision: savedTemplate.revision,
    }), error => error.code === 'permission-denied');

    const customRef = db.doc('platformTemplates/custom');
    const existingCustom = (await customRef.get()).data() || {};
    const savedCustom = await saveAs(owner, {
      action: 'saveTemplate', expectedRevision: Number(existingCustom.revision || 0),
      template: {
        id: 'custom', templateId: 'custom', canonicalTemplateId: null,
        commercialName: 'Solución a medida QA', status: 'draft', order: 6,
        commercialMode: 'specialized', demoRoute: '/register', demoPath: '/register',
        demoEnabled: true, demoEnabledConfigured: true, primaryActionLabel: 'Crear empresa',
      },
    });
    assert.equal(savedCustom.success, true);
    const custom = (await customRef.get()).data();
    assert.equal(custom.demoRoute, '');
    assert.equal(custom.demoPath, '');
    assert.equal(custom.demoEnabled, false);
    assert.equal(custom.primaryActionLabel, 'Cotizar a medida');

    const draftPlan = {
      id: planId, templateId: 'hamburger', name: 'Plan ficticio', planKind: 'paid',
      priceApproval: 'pending', monthlyPriceUSD: 50, annualPriceUSD: 500,
      currency: 'USD', billingPeriod: 'monthly', clientProfile: 'Emulador',
      includedFeatures: ['Función ficticia'], technicalEntitlements: [], ctaLabel: 'Consultar',
      status: 'draft', order: 1,
    };
    const savedPlan = await saveAs(owner, { action: 'savePlan', plan: draftPlan, expectedRevision: 0 });
    assert.equal(savedPlan.success, true);
    await assert.rejects(saveAs(owner, {
      action: 'publishPlan', planId, status: 'published', expectedRevision: savedPlan.revision,
    }), error => error.code === 'failed-precondition');
    assert.equal((await db.doc(`platformPlans/${planId}`).get()).data().status, 'draft');

    const draftExtra = {
      id: extraId, title: 'Extra QA', category: 'support', shortDescription: 'Dato ficticio',
      referencePriceLabel: 'No publicado', pricingType: 'custom_quote', iconKey: 'headset',
      applicableTemplates: ['hamburger'], status: 'draft', order: 1,
    };
    const simultaneous = await Promise.allSettled([
      saveAs(owner, { action: 'saveExtra', extra: draftExtra, expectedRevision: 0 }),
      saveAs(owner, { action: 'saveExtra', extra: { ...draftExtra, title: 'Edición concurrente' }, expectedRevision: 0 }),
    ]);
    assert.equal(simultaneous.filter(result => result.status === 'fulfilled').length, 1);
    const rejectedConcurrent = simultaneous.find(result => result.status === 'rejected');
    assert.equal(rejectedConcurrent.reason.code, 'aborted');
    const extraSaved = simultaneous.find(result => result.status === 'fulfilled').value;
    assert.equal((await db.doc(`platformExtras/${extraId}`).get()).data().revision, extraSaved.revision);

    await assert.rejects(saveAs(support, {
      action: 'saveExtra', extra: { ...draftExtra, id: `${extraId}-unauthorized` }, expectedRevision: 0,
    }), error => error.code === 'permission-denied');

    const media = {
      id: mediaId, name: 'Imagen QA', url: '/brand/qa.webp', category: 'showcase',
      focalPointDefault: '50% 50%', status: 'draft', createdAt: 'spoofed',
    };
    await saveAs(owner, { action: 'saveMediaAsset', asset: media, expectedRevision: 0 });
    const savedMedia = (await db.doc(`platformMedia/${mediaId}`).get()).data();
    assert.notEqual(savedMedia.createdAt, 'spoofed');
    assert.equal(savedMedia.status, 'draft');

    const beforePublish = await commercial.getPublicCommercialCatalog(db,
      { rawRequest: { ip: `198.51.100.${Number(nonce.slice(-2), 36) % 200 + 1}` } },
      'admin-control-center-test-secret-at-least-32-bytes', { emulator: true });
    assert.equal(beforePublish.plans.some(plan => plan.id === planId), false, 'draft plan must remain private');
    assert.equal(beforePublish.extras.some(extra => extra.id === extraId), false, 'draft extra must remain private');
    assert.equal(beforePublish.mediaAssets.some(asset => asset.id === mediaId), false, 'draft media must remain private');

    const publishRevision = Number(storedTemplate.revision || 0);
    const publishTemplate = {
      ...storedTemplate,
      status: 'published',
      commercialName: 'Distribución QA publicada',
      demoRoute: '/demo/distribution',
      primaryActionLabel: 'Comenzar',
    };
    const publishResult = await saveAs(owner, {
      action: 'saveTemplate', template: publishTemplate, expectedRevision: publishRevision,
    });
    storedTemplate = (await templateRef.get()).data();
    assert.equal(storedTemplate.revision, publishResult.revision);
    assert.equal(storedTemplate.demoRoute, '/demo/distribution');
    assert.equal(storedTemplate.primaryActionLabel, 'Solicitar implementación');

    const publicCatalog = await commercial.getPublicCommercialCatalog(db,
      { rawRequest: { ip: `203.0.113.${Number(nonce.slice(-1), 36) % 200 + 1}` } },
      'admin-control-center-test-secret-at-least-32-bytes', { emulator: true });
    const publicDistribution = publicCatalog.templates.find(template => template.id === 'distribution');
    assert.equal(publicDistribution.commercialName, 'Distribución QA publicada');
    assert.equal(publicCatalog.plans.some(plan => plan.id === planId), false);
    assert.equal(publicCatalog.extras.some(extra => extra.id === extraId), false);

    await assert.rejects(saveAs(owner, {
      action: 'saveTemplate', template: { ...storedTemplate, commercialName: 'Sobrescrito obsoleto' },
      expectedRevision: publishRevision,
    }), error => error.code === 'aborted');

    console.log('PASS Admin Control Center: content save, canonical template identity/route, draft privacy, owner publication, price approval gate, role rejection, stale-write protection, public snapshot refresh and concurrent revision safety');
  } finally {
    for (const path of [`platformPlans/${planId}`, `platformExtras/${extraId}`, `platformMedia/${mediaId}`]) {
      await db.doc(path).delete().catch(() => undefined);
    }
    for (const [path, value] of saved) await restore(db.doc(path), value).catch(() => undefined);
    for (const uid of [owner, content, support]) {
      const audit = await db.collection('platformAuditLogs').where('operatorUid', '==', uid).get().catch(() => null);
      if (audit) await Promise.all(audit.docs.map(document => document.ref.delete().catch(() => undefined)));
    }
    for (const uid of [owner, content, support]) await db.doc(`platformOperators/${uid}`).delete().catch(() => undefined);
    await deleteApp(app);
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
