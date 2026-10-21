const assert = require('node:assert/strict');
const tenantEntrypoints = require('../tenantEntrypoints.cjs');
const { tenantGateway } = tenantEntrypoints;

const expectedServiceAccount = 'distribution-ops-runtime@pachax-platform.iam.gserviceaccount.com';
for (const name of ['processTenantOperation', 'refreshTenantCredit', 'initializeTenantCredit']) {
  const endpoint = tenantEntrypoints[name]?.__endpoint;
  assert.ok(endpoint, `${name} must expose a Firebase Functions endpoint`);
  assert.equal(endpoint.serviceAccountEmail, expectedServiceAccount, `${name} must run as the dedicated Distribution service account`);
  assert.deepEqual(endpoint.region, ['southamerica-west1'], `${name} must remain in the Firestore region`);
}

assert.notEqual(tenantGateway.__endpoint.serviceAccountEmail, expectedServiceAccount, 'tenantGateway runtime identity must remain unchanged');
console.log('Distribution runtime identity: 7 checks passed');
