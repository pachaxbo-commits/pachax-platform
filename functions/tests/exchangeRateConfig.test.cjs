const assert = require('node:assert/strict');
const { initializeApp, deleteApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const platform = require('../platform.cjs');
const commercial = require('../commercialOnboarding.cjs');

const projectId = process.env.GCLOUD_PROJECT || process.env.FIREBASE_CONFIG_PROJECT_ID;
if (!projectId?.startsWith('demo-')) {
  throw new Error('This test may only run against a demo Firebase project.');
}
if (!process.env.FIRESTORE_EMULATOR_HOST) {
  throw new Error('FIRESTORE_EMULATOR_HOST must point to an isolated emulator.');
}

const app = initializeApp({ projectId }, `exchange-rate-test-${Date.now()}`);
const db = getFirestore(app);
const nonce = Date.now().toString(36);
const ownerUid = `fx-owner-${nonce}`;
const adminUid = `fx-admin-${nonce}`;
const financeUid = `fx-finance-${nonce}`;
const contentUid = `fx-content-${nonce}`;
const planId = `fx-bob-plan-${nonce}`;

const backupRefs = [
  db.doc('platformConfig/exchangeRate'),
  db.doc('platformConfig/publicCommercialCatalogMeta'),
  db.doc('platformConfig/publicCommercialCatalog'),
  db.doc(`platformPlans/${planId}`),
];
const saved = new Map();

function rpc(uid, email, data) {
  return platform.platformGateway(db, {
    auth: { uid, token: { platform: true, email } },
    data,
  });
}

function calcUsdReference(amountBob, rateConfig) {
  if (!rateConfig || rateConfig.status !== 'valid' || !Number.isFinite(rateConfig.rateBsPerUsd) || rateConfig.rateBsPerUsd <= 0) {
    return null;
  }
  return Number((amountBob / rateConfig.rateBsPerUsd).toFixed(2));
}

async function snapshot(ref) {
  const snap = await ref.get();
  return snap.exists ? snap.data() : null;
}

async function restore(ref, value) {
  if (value === null) await ref.delete();
  else await ref.set(value);
}

async function main() {
  for (const ref of backupRefs) saved.set(ref.path, await snapshot(ref));

  await Promise.all([
    db.doc(`platformOperators/${ownerUid}`).set({ role: 'platform_owner', active: true }),
    db.doc(`platformOperators/${adminUid}`).set({ role: 'platform_admin', active: true }),
    db.doc(`platformOperators/${financeUid}`).set({ role: 'platform_finance', active: true }),
    db.doc(`platformOperators/${contentUid}`).set({ role: 'platform_content', active: true }),
  ]);

  try {
    // 1. Solo platform_owner puede configurar el tipo de cambio referencial.
    for (const [uid, roleName] of [[adminUid, 'platform_admin'], [financeUid, 'platform_finance'], [contentUid, 'platform_content']]) {
      await assert.rejects(
        () => rpc(uid, `${roleName}@pachax.test`, {
          action: 'saveExchangeRateConfig',
          expectedRevision: 0,
          exchangeRate: {
            rateBsPerUsd: 6.96,
            source: 'BCB referencial',
            effectiveAt: '2026-11-14T12:00:00.000Z',
            status: 'valid',
          },
        }),
        error => error.code === 'permission-denied' && /Solo Platform Owner/.test(error.message),
      );
    }

    // 2. Estado pendiente o sin tasa aprobada nunca inventa una referencia USD fija.
    const initialExchangeSnap = await db.doc('platformConfig/exchangeRate').get();
    const initialRevision = initialExchangeSnap.exists ? Number(initialExchangeSnap.data().revision || 0) : 0;

    const pendingResult = await rpc(ownerUid, 'owner@pachax.test', {
      action: 'saveExchangeRateConfig',
      expectedRevision: initialRevision,
      exchangeRate: {
        rateBsPerUsd: null,
        source: 'Sin configurar',
        effectiveAt: null,
        status: 'pending',
      },
    });
    assert.equal(pendingResult.success, true);
    const catalogPending = await commercial.getPublicCommercialCatalog(db);
    assert.equal(catalogPending.exchangeRate.status, 'pending');
    assert.equal(calcUsdReference(340, catalogPending.exchangeRate), null);

    // 3. platform_owner guarda tasa válida -> audita y proyecta en el catálogo público.
    const validResult = await rpc(ownerUid, 'owner@pachax.test', {
      action: 'saveExchangeRateConfig',
      expectedRevision: pendingResult.revision,
      exchangeRate: {
        rateBsPerUsd: 6.96,
        source: 'Banco Central de Bolivia (referencial)',
        effectiveAt: '2026-11-14T14:30:00.000Z',
        status: 'valid',
      },
    });
    assert.equal(validResult.success, true);
    assert.equal(validResult.exchangeRate.rateBsPerUsd, 6.96);

    const auditSnap = await db.collection('platformAuditLogs')
      .where('action', '==', 'platform.commercial.exchange_rate.updated')
      .where('operatorUid', '==', ownerUid)
      .get();
    assert.ok(auditSnap.size >= 2, 'Debe registrar auditoría en platformAuditLogs al actualizar el tipo de cambio.');

    const catalogValid = await commercial.getPublicCommercialCatalog(db);
    assert.equal(catalogValid.exchangeRate.status, 'valid');
    assert.equal(catalogValid.exchangeRate.rateBsPerUsd, 6.96);
    assert.equal(catalogValid.exchangeRate.source, 'Banco Central de Bolivia (referencial)');
    assert.equal(calcUsdReference(340, catalogValid.exchangeRate), 48.85);
    assert.equal(calcUsdReference(3400, catalogValid.exchangeRate), 488.51);

    // 4. Estado desactualizado oculta la referencia USD sin afectar planes contractuales en BOB.
    const outdatedResult = await rpc(ownerUid, 'owner@pachax.test', {
      action: 'saveExchangeRateConfig',
      expectedRevision: validResult.revision,
      exchangeRate: {
        rateBsPerUsd: 6.96,
        source: 'Banco Central de Bolivia (referencial)',
        effectiveAt: '2026-11-14T14:30:00.000Z',
        status: 'outdated',
      },
    });
    assert.equal(outdatedResult.success, true);
    const catalogOutdated = await commercial.getPublicCommercialCatalog(db);
    assert.equal(catalogOutdated.exchangeRate.status, 'outdated');
    assert.equal(calcUsdReference(340, catalogOutdated.exchangeRate), null);

    // 5. Invarianza contractual: plan en BOB conserva currency = 'BOB' y monto exacto en Bs.
    const planSaveRes = await rpc(ownerUid, 'owner@pachax.test', {
      action: 'savePlan',
      expectedRevision: 0,
      plan: {
        id: planId,
        templateId: 'hamburger',
        name: 'Plan Mostrador Bolivia',
        planKind: 'paid',
        priceApproval: 'approved',
        tierLevel: 1,
        monthlyPriceUSD: 340,
        annualPriceUSD: 3400,
        annualPriceUnit: 'annual_total_12_months',
        currency: 'BOB',
        billingPeriod: 'monthly',
        clientProfile: 'Negocio de comida rápida en Bolivia',
        limitsLabel: '1 sucursal · 4 usuarios',
        includedFeatures: ['POS de mostrador', 'Comanda KDS'],
        technicalEntitlements: [],
        capabilitiesV1: {
          version: 1,
          businessType: 'hamburger_shop',
          limits: { activeUsers: 4, activeProducts: 60, activeBranches: 1 },
          features: {
            reports: { basic: true, detailed: true, export: true },
            receipts: { digital: true },
            printing: { manual: true, kitchenAutomatic: true },
            adsRequired: false,
          },
        },
        ctaLabel: 'Elegir Plan',
        status: 'published',
        order: 1,
      },
    });
    assert.equal(planSaveRes.success, true);
    const catalogWithPlan = await commercial.getPublicCommercialCatalog(db);
    const publishedBobPlan = catalogWithPlan.plans.find(item => item.id === planId);
    assert.ok(publishedBobPlan, 'El plan BOB publicado debe aparecer en el catálogo público.');
    assert.equal(publishedBobPlan.currency, 'BOB');
    assert.equal(publishedBobPlan.monthlyPriceUSD, 340);
    assert.equal(publishedBobPlan.annualPriceUSD, 3400);

    console.log('exchangeRateConfig.test.cjs: PASS (5/5 checks)');
  } finally {
    await Promise.all([
      db.doc(`platformOperators/${ownerUid}`).delete(),
      db.doc(`platformOperators/${adminUid}`).delete(),
      db.doc(`platformOperators/${financeUid}`).delete(),
      db.doc(`platformOperators/${contentUid}`).delete(),
      ...backupRefs.map(ref => restore(ref, saved.get(ref.path))),
    ]);
    await deleteApp(app);
  }
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
