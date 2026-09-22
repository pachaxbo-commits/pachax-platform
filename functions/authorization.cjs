const { HttpsError } = require('firebase-functions/v2/https');
const { getTemplate } = require('./generated/templates.js');
const { canUseModule } = require('./generated/platform.js');
const validId = value => typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value);
function id(value) {
  if (!validId(value)) throw new HttpsError('invalid-argument', 'Identificador inválido.');
  return value;
}
function authenticated(request) {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Inicia sesión para continuar.');
  return request.auth.uid;
}
function hasPermission(tenant, membership, permission) {
  if (membership?.status !== 'active' || membership.tenantId !== tenant.tenantId) return false;
  const template = getTemplate(tenant.businessType);
  const role = template.roles.find(item => item.id === membership.roleId);
  if (!role?.permissions.includes(permission)) return false;
  const capability = { sales: 'sales', orders: 'orders', inventory: 'inventory', products: 'inventory', customers: 'customers', credits: 'credits', reports: 'reports', users: 'users', settings: 'settings', dispatch: 'dispatch', route: 'routes', cash: 'cash' }[permission.split('.')[0]];
  return template.capabilities.includes(capability) && tenant.configuration.features[capability] === true;
}
async function tenantActor(db, request, permission) {
  const uid = authenticated(request), tenantId = id(request.data?.tenantId);
  const root = db.doc(`tenants/${tenantId}`);
  const [tenantSnap, memberSnap, platformSnap] = await Promise.all([root.get(), root.collection('members').doc(uid).get(), db.doc(`platformOperators/${uid}`).get()]);
  // Platform operators cannot bypass read-only support by also using a tenant membership.
  if (platformSnap.data()?.active === true) throw new HttpsError('permission-denied', 'Utiliza una sesión de soporte auditada.');
  const tenant = tenantSnap.data(), membership = memberSnap.data();
  if (!tenant || !membership || !hasPermission(tenant, membership, permission)) throw new HttpsError('permission-denied', 'No tienes permiso en esta empresa.');
  return { uid, tenantId, root, tenant, membership, actorType: 'tenant' };
}
function audit(db, tx, actor, action, resourceId, before = null, after = null, reason = null) {
  // Callers supply allowlisted business fields; recursively strip credentials as a second guard.
  const sanitize = value => {
    if (Array.isArray(value)) return value.map(sanitize);
    if (!value || typeof value !== 'object') return value;
    return Object.fromEntries(Object.entries(value).filter(([key]) => !/password|token|secret|credential/i.test(key)).map(([key, val]) => [key, sanitize(val)]));
  };
  const event = { actorUid: actor.uid, actorType: actor.actorType || 'platform', tenantId: actor.tenantId || null, action, resource: 'tenant', resourceId, before: sanitize(before), after: sanitize(after), reason, createdAt: new Date().toISOString() };
  if (actor.tenantId) tx.create(db.collection(`tenants/${actor.tenantId}/auditLogs`).doc(), event);
  if (event.actorType === 'platform') tx.create(db.collection('platformAuditLogs').doc(), event);
}
function legacyMember(member) {
  return { ...member, role: member.roleId === 'owner' ? 'admin' : member.roleId, active: member.status === 'active', routeId: member.routeIds?.[0] || '', warehouseId: member.warehouseId || 'central' };
}
module.exports = { id, authenticated, tenantActor, hasPermission, audit, legacyMember, canUseModule };
