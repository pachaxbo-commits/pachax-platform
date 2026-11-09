const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const fs = require('node:fs');
const { initializeTestEnvironment, assertFails } = require('@firebase/rules-unit-testing');
const { getBytes, ref, uploadBytes } = require('firebase/storage');

const projectId = process.env.GCLOUD_PROJECT || '';
if (!projectId.startsWith('demo-')) throw new Error('QR storage tests require an isolated demo Firebase project.');
if (!process.env.FIRESTORE_EMULATOR_HOST || !process.env.FIREBASE_AUTH_EMULATOR_HOST) throw new Error('Run this test with Auth and Firestore emulators.');
process.env.STORAGE_EMULATOR_HOST ||= '127.0.0.1:9295';

const { initializeApp, deleteApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { getStorage } = require('firebase-admin/storage');
const platform = require('../platform.cjs');
const commercialBilling = require('../commercialBilling.cjs');

const suffix = randomUUID().replace(/-/g, '');
const app = initializeApp({ projectId, storageBucket: `${projectId}.firebasestorage.app` });
const db = getFirestore(app);
const bucket = getStorage(app).bucket();
const ownerUid = `qr-owner-${suffix}`;
const financeUid = `qr-finance-${suffix}`;
const adminUid = `qr-admin-${suffix}`;
const tenantOwnerUid = `qr-tenant-owner-${suffix}`;
const tenantEmployeeUid = `qr-tenant-employee-${suffix}`;
const tenantId = `qr-tenant-${suffix}`;
const platformConfig = db.doc('platformBillingConfig/manualMethods');
let rulesEnv;
const pathsToDelete = new Set();
let assertions = 0;
const pass = label => { assertions += 1; console.log(`PASS ${label}`); };
const operationId = () => randomUUID();
const call = (uid, data, claims = { platform: true }) => platform.platformGateway(db, {
  auth: { uid, token: claims }, data,
});

// Small raster-signature fixtures are deliberately fictitious and never opened as a payment method.
const pngBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jzc8AAAAASUVORK5CYII=';

async function cleanup() {
  for (const path of pathsToDelete) await bucket.file(path).delete({ ignoreNotFound: true }).catch(() => undefined);
  await db.recursiveDelete(db.doc(`tenants/${tenantId}`)).catch(() => undefined);
  for (const uid of [ownerUid, financeUid, adminUid]) await db.doc(`platformOperators/${uid}`).delete().catch(() => undefined);
  for (const uid of [ownerUid, financeUid, adminUid]) {
    const operations = await db.collection('platformBillingOperations').where('actorUid', '==', uid).get().catch(() => ({ docs: [] }));
    await Promise.all(operations.docs.map(item => item.ref.delete().catch(() => undefined)));
    const audits = await db.collection('platformAuditLogs').where('operatorUid', '==', uid).get().catch(() => ({ docs: [] }));
    await Promise.all(audits.docs.map(item => item.ref.delete().catch(() => undefined)));
  }
  await platformConfig.delete().catch(() => undefined);
  if (rulesEnv) await rulesEnv.cleanup().catch(() => undefined);
  await deleteApp(app).catch(() => undefined);
}

async function run() {
  try {
    rulesEnv = await initializeTestEnvironment({
      projectId,
      storage: { rules: fs.readFileSync('firebase/storage.rules', 'utf8'), host: '127.0.0.1', port: 9295 },
    });
    await Promise.all([
      db.doc(`platformOperators/${ownerUid}`).set({ uid: ownerUid, role: 'platform_owner', active: true }),
      db.doc(`platformOperators/${financeUid}`).set({ uid: financeUid, role: 'platform_finance', active: true }),
      db.doc(`platformOperators/${adminUid}`).set({ uid: adminUid, role: 'platform_admin', active: true }),
      db.doc(`tenants/${tenantId}`).set({ id: tenantId, name: 'Empresa QR ficticia', billingEnforcement: false }),
      db.doc(`tenants/${tenantId}/members/${tenantOwnerUid}`).set({ uid: tenantOwnerUid, roleId: 'owner', status: 'active', branchIds: ['main'] }),
      db.doc(`tenants/${tenantId}/members/${tenantEmployeeUid}`).set({ uid: tenantEmployeeUid, roleId: 'cashier', status: 'active', branchIds: ['main'] }),
    ]);

    const upload = { mimeType: 'image/png', base64: pngBase64 };
    const methods = { available: true, qrEnabled: true, transferEnabled: false, qrImageUrl: '', bankName: '', accountHolder: '', accountIdentifier: '', instructions: 'Fixture de prueba. No realizar pagos.', whatsappNumber: '' };
    await assert.rejects(call(adminUid, { action: 'saveManualPaymentMethods', requestId: operationId(), expectedVersion: 0, methods, qrImageUpload: upload }), error => error.code === 'permission-denied');
    await assert.rejects(call(financeUid, { action: 'saveManualPaymentMethods', requestId: operationId(), expectedVersion: 0, methods, qrImageUpload: upload }), error => error.code === 'permission-denied');
    await assert.rejects(call(ownerUid, { action: 'saveManualPaymentMethods', requestId: operationId(), methods: { ...methods, qrEnabled: false, transferEnabled: true,
      bankName: 'Banco QA', accountHolder: 'Titular QA', accountIdentifier: 'CUENTA-QA-01' } }), error => error.code === 'invalid-argument');
    pass('solo Platform Owner puede cambiar los métodos oficiales; Finance conserva lectura únicamente');

    const invalidMime = { ...upload, mimeType: 'image/svg+xml' };
    await assert.rejects(call(ownerUid, { action: 'saveManualPaymentMethods', requestId: operationId(), expectedVersion: 0, methods, qrImageUpload: invalidMime }), error => error.code === 'invalid-argument');
    await assert.rejects(call(ownerUid, { action: 'saveManualPaymentMethods', requestId: operationId(), expectedVersion: 0, methods, qrImageUpload: { ...upload, base64: Buffer.from('not png').toString('base64') } }), error => error.code === 'invalid-argument');
    await assert.rejects(call(ownerUid, { action: 'saveManualPaymentMethods', requestId: operationId(), expectedVersion: 0, methods, qrImageUpload: { ...upload, base64: Buffer.alloc(513 * 1024, 1).toString('base64') } }), error => error.code === 'invalid-argument');
    pass('la callable rechaza SVG, firma MIME incongruente y archivos mayores a 512 KB');

    const saveRequest = { action: 'saveManualPaymentMethods', requestId: operationId(), expectedVersion: 0, methods, qrImageUpload: upload };
    const saved = await call(ownerUid, saveRequest);
    assert.equal(saved.success, true);
    assert.equal(saved.version, 1);
    const config = (await platformConfig.get()).data();
    assert.match(config.qrImagePath, /^platformBilling\/manualMethods\/qr\/[a-f0-9]{64}-[a-f0-9]{16}\.png$/);
    assert.equal(Object.hasOwn(config, 'qrImageDataUrl'), false);
    assert.equal(config.qrImageUrl, '');
    pathsToDelete.add(config.qrImagePath);
    const [metadata] = await bucket.file(config.qrImagePath).getMetadata();
    assert.equal(metadata.contentType, 'image/png');
    assert.equal(metadata.metadata?.firebaseStorageDownloadTokens, undefined, 'The private object must not carry a public download token.');
    pass('el QR se guarda como objeto privado, raster, sin URL pública ni token de descarga');

    const adminRead = await call(ownerUid, { action: 'getManualPaymentMethods' });
    const financeRead = await call(financeUid, { action: 'getManualPaymentMethods' });
    const expectedDataUrl = `data:image/png;base64,${pngBase64}`;
    assert.equal(adminRead.methods.qrImageDataUrl, expectedDataUrl);
    assert.equal(financeRead.methods.qrImageDataUrl, expectedDataUrl);
    const ownerOverview = await commercialBilling.getTenantBillingOverview(db, { auth: { uid: tenantOwnerUid, token: {} }, data: { tenantId } });
    assert.equal(ownerOverview.paymentMethods.qrImageDataUrl, expectedDataUrl);
    await assert.rejects(commercialBilling.getTenantBillingOverview(db, { auth: { uid: tenantEmployeeUid, token: {} }, data: { tenantId } }), error => error.code === 'permission-denied');
    pass('la imagen solo se devuelve por callable a Platform Owner/Finance y al propietario activo; otro rol tenant queda denegado');

    const clientStorage = rulesEnv.authenticatedContext(ownerUid, { platform: true, platformRole: 'platform_owner' }).storage();
    await assertFails(getBytes(ref(clientStorage, config.qrImagePath)));
    await assertFails(uploadBytes(ref(clientStorage, `platformBilling/manualMethods/qr/direct-${suffix}.png`), Buffer.from(pngBase64, 'base64'), { contentType: 'image/png' }));
    const tenantStorage = rulesEnv.authenticatedContext(tenantOwnerUid).storage();
    await assertFails(getBytes(ref(tenantStorage, config.qrImagePath)));
    pass('las reglas Storage mantienen denegado el acceso directo incluso a los roles autorizados por callable');

    await assert.rejects(call(ownerUid, { action: 'saveManualPaymentMethods', requestId: operationId(), expectedVersion: 0, methods, qrImageUpload: upload }), error => error.code === 'aborted');
    pass('la revisión del formulario impide sobrescribir una configuración guardada desde otra sesión');

    const replacement = await call(ownerUid, { action: 'saveManualPaymentMethods', requestId: operationId(), expectedVersion: 1,
      methods, qrImageUpload: upload });
    assert.equal(replacement.version, 2);
    const replacementPath = (await platformConfig.get()).data().qrImagePath;
    assert.notEqual(replacementPath, config.qrImagePath);
    pathsToDelete.add(replacementPath);
    const [oldStillExistsAfterReplacement] = await bucket.file(config.qrImagePath).exists();
    assert.equal(oldStillExistsAfterReplacement, false);
    pathsToDelete.delete(config.qrImagePath);
    pass('la sustitución versionada cambia la imagen y retira el objeto anterior');
    const disabled = await call(ownerUid, { action: 'saveManualPaymentMethods', requestId: operationId(), expectedVersion: 2,
      methods: { ...methods, available: false, qrEnabled: false, qrImagePath: '', qrImageUrl: '' } });
    assert.equal(disabled.version, 3);
    assert.equal((await platformConfig.get()).data().qrImagePath, '');
    const [oldStillExists] = await bucket.file(replacementPath).exists();
    assert.equal(oldStillExists, false);
    pathsToDelete.delete(replacementPath);
    pass('retirar el QR desconecta y elimina el objeto anterior sin activar el método');

    console.log(`RESULT ${assertions} commercial QR storage assertions passed`);
  } finally {
    await cleanup();
  }
}

run().catch(error => { console.error(error); process.exitCode = 1; });
