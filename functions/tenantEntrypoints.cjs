const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { onDocumentCreated, onDocumentWritten } = require('firebase-functions/v2/firestore');
const { getFirestore } = require('firebase-admin/firestore');
const { getAuth } = require('firebase-admin/auth');
const { processCommand, refreshCreditStatus } = require('./operations.cjs');
const tenants = require('./tenants.cjs');
const { prepareCleanDelivery, executeCleanDelivery } = require('./maintenance.cjs');
const options = { region: 'us-central1', invoker: 'public', maxInstances: 3 };
exports.tenantGateway = onCall(options, async request => {
  const db = getFirestore(), auth = getAuth();
  switch (request.data?.action) {
    case 'createTenant': return tenants.createTenant(db, auth, request);
    case 'listMemberships': return tenants.listMemberships(db, request);
    case 'selectTenant': return tenants.selectTenant(db, request);
    case 'updateSettings': return tenants.updateSettings(db, request);
    case 'createMember': case 'updateMember': case 'deleteMember': case 'changePassword': return tenants.manageMember(db, auth, request);
    case 'prepareCleanDelivery': case 'executeCleanDelivery':
      if (!request.data?.tenantId) throw new HttpsError('invalid-argument', 'Empresa requerida.');
      return request.data.action === 'prepareCleanDelivery' ? prepareCleanDelivery(db, request) : executeCleanDelivery(db, request);
    default: throw new HttpsError('invalid-argument', 'Acción no reconocida.');
  }
});
exports.processTenantOperation = onDocumentCreated({ document: 'tenants/{tenantId}/distOperations/{operationId}', region: 'us-central1', retry: true }, event => event.data && processCommand(getFirestore(), event.data.ref));
exports.refreshTenantCredit = onDocumentWritten({ document: 'tenants/{tenantId}/distReceivables/{id}', region: 'us-central1', retry: true }, async event => {
  const root = getFirestore().doc(`tenants/${event.params.tenantId}`);
  if ((await root.collection('maintenanceState').doc('reset').get()).data()?.active) return;
  const value = event.data?.after.exists ? event.data.after.data() : event.data?.before.data();
  if (value?.customerId) await refreshCreditStatus(getFirestore(), root, value.customerId);
});
exports.initializeTenantCredit = onDocumentCreated({ document: 'tenants/{tenantId}/distCustomers/{id}', region: 'us-central1', retry: true }, async event => {
  const root = getFirestore().doc(`tenants/${event.params.tenantId}`);
  if ((await root.collection('maintenanceState').doc('reset').get()).data()?.active) return;
  if (event.data) await refreshCreditStatus(getFirestore(), root, event.params.id);
});
