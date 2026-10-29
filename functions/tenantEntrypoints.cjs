const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');
const { onDocumentCreated, onDocumentWritten } = require('firebase-functions/v2/firestore');
const { getFirestore } = require('firebase-admin/firestore');
const { getAuth } = require('firebase-admin/auth');
const { processCommand, refreshCreditStatus } = require('./operations.cjs');
const tenants = require('./tenants.cjs');
const { prepareCleanDelivery, executeCleanDelivery } = require('./maintenance.cjs');
const { PACHAX_FUNCTIONS_REGION } = require('./regions.cjs');
const platform = require('./platform.cjs');
const commercialOnboarding = require('./commercialOnboarding.cjs');
const onboarding = require('./onboarding.cjs');
const { executeNightclubCommand } = require('./nightclub.cjs');
const { executeRestaurantCommand } = require('./restaurant.cjs');
const { executeRetailCommand } = require('./retailTenant.cjs');
const { isTemplateProvisioningAvailable } = require('./generated/publicTemplates.js');
const { assertPublicTenantCreationClosed } = require('./publicTenantCreation.cjs');
const { getTemplate } = require('./generated/templates.js');
const { authenticated } = require('./authorization.cjs');
const options = { region: PACHAX_FUNCTIONS_REGION, invoker: 'public', maxInstances: 3 };
const distributionEventOptions = {
  region: PACHAX_FUNCTIONS_REGION,
  serviceAccount: 'distribution-ops-runtime@pachax-platform.iam.gserviceaccount.com',
  retry: true,
  maxInstances: 3,
  concurrency: 1,
};
const ONBOARDING_FIELDS = new Set(['action', 'requestId', 'companyName', 'businessType', 'branding', 'industryProfile']);
function assertProvisionableTemplate(businessType) {
  try { getTemplate(businessType); }
  catch { throw new HttpsError('invalid-argument', 'Plantilla de negocio no reconocida.'); }
  if (!isTemplateProvisioningAvailable(businessType)) {
    throw new HttpsError('failed-precondition', 'La plantilla seleccionada todavía no está disponible para crear empresas.');
  }
}
exports.tenantGateway = onCall(options, async request => {
  const db = getFirestore(), auth = getAuth();
  switch (request.data?.action) {
    case 'retailCommand': return executeRetailCommand(db, request);
    case 'restaurantCommand': return executeRestaurantCommand(db, request);
    case 'nightclubCommand': return executeNightclubCommand(db, request);
    case 'completeOnboarding': {
      authenticated(request);
      assertPublicTenantCreationClosed();
      if (Object.keys(request.data || {}).some(key => !ONBOARDING_FIELDS.has(key))) {
        throw new HttpsError('invalid-argument', 'El onboarding contiene campos no permitidos.');
      }
      const bType = request.data?.businessType;
      assertProvisionableTemplate(bType);
      return onboarding.completeOnboarding(db, auth, request);
    }
    case 'submitCommercialInterest': return commercialOnboarding.submitCommercialInterest(db, request);
    case 'createTenant': {
      authenticated(request);
      assertPublicTenantCreationClosed();
      const bType = request.data?.businessType;
      assertProvisionableTemplate(bType);
      return tenants.createTenant(db, auth, request);
    }
    case 'listMemberships': return tenants.listMemberships(db, request);
    case 'selectTenant': return tenants.selectTenant(db, request);
    case 'updateSettings': return tenants.updateSettings(db, request);
    case 'createMember': case 'updateMember': case 'deleteMember': case 'changePassword': return tenants.manageMember(db, auth, request);
    case 'saveNightclubRolePreset': return tenants.saveNightclubRolePreset(db, request);
    case 'prepareCleanDelivery': case 'executeCleanDelivery':
      if (!request.data?.tenantId) throw new HttpsError('invalid-argument', 'Empresa requerida.');
      return request.data.action === 'prepareCleanDelivery' ? prepareCleanDelivery(db, request) : executeCleanDelivery(db, request);
    default: throw new HttpsError('invalid-argument', 'Acción no reconocida.');
  }
});
const publicCommercialRateLimitSecret = defineSecret('PUBLIC_COMMERCIAL_RATE_LIMIT_SECRET');
exports.publicCommercialGateway = onCall({
  ...options,
  // Firebase App Check has no local emulator; only bypass verification inside emulator runtime.
  enforceAppCheck: process.env.FUNCTIONS_EMULATOR !== 'true',
  secrets: [publicCommercialRateLimitSecret],
}, async request => {
  const db = getFirestore();
  switch (request.data?.action) {
    case 'getCatalog': return commercialOnboarding.getPublicCommercialCatalog(db);
    case 'submitInterest': return commercialOnboarding.submitPublicCommercialInterest(db, request, publicCommercialRateLimitSecret.value(), { emulator: process.env.FUNCTIONS_EMULATOR === 'true' });
    default: throw new HttpsError('invalid-argument', 'Acción pública comercial no reconocida.');
  }
});
exports.platformGateway = onCall(options, request => platform.platformGateway(getFirestore(), request, getAuth()));
exports.processTenantOperation = onDocumentCreated({ ...distributionEventOptions, document: 'tenants/{tenantId}/distOperations/{operationId}' }, event => event.data && processCommand(getFirestore(), event.data.ref));
exports.refreshTenantCredit = onDocumentWritten({ ...distributionEventOptions, document: 'tenants/{tenantId}/distReceivables/{id}' }, async event => {
  const root = getFirestore().doc(`tenants/${event.params.tenantId}`);
  if ((await root.collection('maintenanceState').doc('reset').get()).data()?.active) return;
  const value = event.data?.after.exists ? event.data.after.data() : event.data?.before.data();
  if (value?.customerId) await refreshCreditStatus(getFirestore(), root, value.customerId);
});
exports.initializeTenantCredit = onDocumentCreated({ ...distributionEventOptions, document: 'tenants/{tenantId}/distCustomers/{id}' }, async event => {
  const root = getFirestore().doc(`tenants/${event.params.tenantId}`);
  if ((await root.collection('maintenanceState').doc('reset').get()).data()?.active) return;
  if (event.data) await refreshCreditStatus(getFirestore(), root, event.params.id);
});
