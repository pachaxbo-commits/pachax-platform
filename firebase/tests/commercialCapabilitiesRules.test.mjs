import assert from 'node:assert/strict';
import fs from 'node:fs';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, setDoc } from 'firebase/firestore';

const projectId = process.env.GCLOUD_PROJECT || '';
if (!projectId.startsWith('demo-') || !process.env.FIRESTORE_EMULATOR_HOST) {
  throw new Error('Plan capability Rules tests require the isolated Firestore Emulator.');
}

const env = await initializeTestEnvironment({
  projectId,
  firestore: { rules: fs.readFileSync('firebase/firestore.rules', 'utf8') },
});
const fields = tenantId => ({
  tenantId, unitType: 'unit', referencePrice: 0, productionCost: 0, minimumStock: 0,
  photoDataUrl: '', sku: '', saleUnitLabel: '',
});

try {
  await env.withSecurityRulesDisabled(async context => {
    const db = context.firestore();
    for (const [tenantId, billingEnforcement] of [['caps-enforced', true], ['caps-legacy', false]]) {
      await setDoc(doc(db, `tenants/${tenantId}`), {
        tenantId, businessType: 'route_distribution', billingEnforcement,
        configuration: { features: { inventory: true } },
      });
      await setDoc(doc(db, `tenants/${tenantId}/members/plan-owner`), {
        uid: 'plan-owner', tenantId, roleId: 'owner', status: 'active', branchIds: ['main'], routeIds: [],
      });
      await setDoc(doc(db, `tenants/${tenantId}/roles/owner`), { id: 'owner', permissions: ['inventory.manage'] });
    }
  });

  const client = env.authenticatedContext('plan-owner').firestore();
  await assertFails(setDoc(doc(client, 'tenants/caps-enforced/distProducts/new-product'), fields('caps-enforced')));
  await assertSucceeds(setDoc(doc(client, 'tenants/caps-legacy/distProducts/new-product'), fields('caps-legacy')));
  console.log('PASS enforced Distribution tenants cannot bypass product quotas with direct Firestore writes');
  console.log('PASS legacy tenants retain their existing direct product-write behavior');
} finally {
  await env.cleanup();
}
