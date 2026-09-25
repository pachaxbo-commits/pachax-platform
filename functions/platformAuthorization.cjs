const { HttpsError } = require('firebase-functions/v2/https');
const { FieldValue } = require('firebase-admin/firestore');
const { authenticated, id } = require('./authorization.cjs');

const ROLE_PERMISSIONS = Object.freeze({
  platform_owner: ['tenants.read', 'tenants.configure', 'support.read', 'support.elevate', 'templates.preview', 'audit.read', 'finance.read'],
  platform_admin: ['tenants.read', 'tenants.configure', 'support.read', 'templates.preview', 'audit.read'],
  platform_support: ['tenants.read', 'support.read', 'templates.preview', 'audit.read'],
  platform_finance: ['tenants.read', 'finance.read'],
});

function permissionsFor(role) {
  return ROLE_PERMISSIONS[role] || [];
}

async function platformActor(db, request, permission) {
  const uid = authenticated(request);
  if (request.auth.token?.platform !== true) throw new HttpsError('permission-denied', 'La cuenta no es un operador PACHAX.');
  const snapshot = await db.doc(`platformOperators/${uid}`).get();
  const operator = snapshot.data();
  if (!snapshot.exists || operator?.active !== true || !Object.hasOwn(ROLE_PERMISSIONS, operator.role)) {
    throw new HttpsError('permission-denied', 'El operador PACHAX no está activo.');
  }
  if (permission && !permissionsFor(operator.role).includes(permission)) {
    throw new HttpsError('permission-denied', 'El operador no tiene este permiso.');
  }
  return { uid, operator, permissions: permissionsFor(operator.role) };
}

function cleanText(value, name, min = 1, max = 300) {
  const result = typeof value === 'string' ? value.trim() : '';
  if (result.length < min || result.length > max) throw new HttpsError('invalid-argument', `${name} inválido.`);
  return result;
}

function auditPlatform(db, writer, actor, action, { tenantId = null, reason = null, resource = null, metadata = null } = {}) {
  const entry = {
    operatorUid: actor.uid,
    operatorRole: actor.operator.role,
    action: cleanText(action, 'Acción', 1, 120),
    tenantId: tenantId ? id(tenantId) : null,
    reason: reason ? cleanText(reason, 'Motivo', 8, 500) : null,
    resource: resource ? cleanText(resource, 'Recurso', 1, 160) : null,
    metadata: metadata && typeof metadata === 'object' ? metadata : null,
    createdAt: FieldValue.serverTimestamp(),
  };
  writer.create(db.collection('platformAuditLogs').doc(), entry);
}

module.exports = { ROLE_PERMISSIONS, permissionsFor, platformActor, cleanText, auditPlatform };
