const { randomUUID } = require('node:crypto');
const { HttpsError } = require('firebase-functions/v2/https');
const { FieldPath, FieldValue, Timestamp } = require('firebase-admin/firestore');
const { BusinessTemplateRegistry } = require('./generated/templates.js');
const { id } = require('./authorization.cjs');
const { settingsPatch } = require('./tenants.cjs');
const { platformActor, cleanText, auditPlatform } = require('./platformAuthorization.cjs');

const DIRECTORY_LIMIT = 50;
const READ_SESSION_MS = 60 * 60 * 1000;
const EDIT_SESSION_MS = 15 * 60 * 1000;

function limit(value, fallback = 25) {
  const parsed = Number(value ?? fallback);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > DIRECTORY_LIMIT) throw new HttpsError('invalid-argument', 'Límite inválido.');
  return parsed;
}

function encodeCursor(value) {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

function decodeCursor(value) {
  if (!value) return null;
  try {
    const parsed = JSON.parse(Buffer.from(String(value), 'base64url').toString('utf8'));
    if (typeof parsed.nameKey !== 'string' || typeof parsed.tenantId !== 'string') throw new Error();
    return { nameKey: parsed.nameKey, tenantId: id(parsed.tenantId) };
  } catch { throw new HttpsError('invalid-argument', 'Cursor inválido.'); }
}

function tenantSummary(data) {
  return {
    tenantId: data.tenantId,
    name: data.name,
    businessType: data.businessType,
    status: data.status,
    subscriptionStatus: data.subscriptionStatus,
    planKey: data.planKey ?? null,
    userCount: data.userCount ?? null,
    branchCount: data.branchCount ?? null,
    createdAt: data.createdAt ?? null,
    updatedAt: data.updatedAt ?? null,
  };
}

async function validateOperator(db, request) {
  const actor = await platformActor(db, request);
  return { uid: actor.uid, role: actor.operator.role, permissions: actor.permissions };
}

async function listTenants(db, request) {
  await platformActor(db, request, 'tenants.read');
  const pageSize = limit(request.data?.limit);
  const cursor = decodeCursor(request.data?.cursor);
  let query = db.collection('tenants').orderBy('nameKey').orderBy(FieldPath.documentId()).limit(pageSize + 1);
  if (cursor) query = query.startAfter(cursor.nameKey, cursor.tenantId);
  const snapshot = await query.get();
  const docs = snapshot.docs.slice(0, pageSize);
  const last = docs.at(-1);
  return {
    tenants: docs.map(doc => tenantSummary(doc.data())),
    nextCursor: snapshot.size > pageSize && last ? encodeCursor({ nameKey: last.data().nameKey || '', tenantId: last.id }) : null,
  };
}

async function tenantDetail(db, request) {
  const actor = await platformActor(db, request, 'tenants.read');
  const tenantId = id(request.data?.tenantId);
  const root = db.doc(`tenants/${tenantId}`);
  const [tenant, members] = await Promise.all([root.get(), root.collection('members').orderBy('createdAt').limit(100).get()]);
  if (!tenant.exists) throw new HttpsError('not-found', 'Empresa no encontrada.');
  const batch = db.batch();
  auditPlatform(db, batch, actor, 'tenant.detail.read', { tenantId, resource: `tenants/${tenantId}` });
  await batch.commit();
  return {
    tenant: { ...tenantSummary(tenant.data()), branding: tenant.data().branding, configuration: tenant.data().configuration, templateVersion: tenant.data().templateVersion },
    members: members.docs.map(doc => {
      const row = doc.data();
      return { uid: doc.id, displayName: row.displayName || '', email: row.email || '', roleId: row.roleId, status: row.status, branchIds: row.branchIds || [], routeIds: row.routeIds || [] };
    }),
  };
}

async function listTemplates(db, request) {
  await platformActor(db, request, 'templates.preview');
  return Object.values(BusinessTemplateRegistry).map(template => ({
    businessType: template.businessType,
    name: template.name,
    description: template.description,
    version: template.version,
    capabilities: template.capabilities,
    modules: template.modules,
    roles: template.roles.map(role => ({ id: role.id, name: role.name })),
    units: template.units,
  }));
}

async function beginSupport(db, request) {
  const actor = await platformActor(db, request, 'support.read');
  const tenantId = id(request.data?.tenantId);
  const viewedRoleId = id(request.data?.viewedRoleId);
  const [tenant, role] = await Promise.all([db.doc(`tenants/${tenantId}`).get(), db.doc(`tenants/${tenantId}/roles/${viewedRoleId}`).get()]);
  if (!tenant.exists || !role.exists) throw new HttpsError('not-found', 'Empresa o rol no encontrado.');
  const sessionId = randomUUID();
  const now = Date.now();
  const session = {
    id: sessionId,
    operatorUid: actor.uid,
    tenantId,
    viewedRoleId,
    mode: 'read-only',
    reason: null,
    startedAt: FieldValue.serverTimestamp(),
    expiresAt: Timestamp.fromMillis(now + READ_SESSION_MS),
    updatedAt: FieldValue.serverTimestamp(),
  };
  const batch = db.batch();
  batch.set(db.doc(`supportSessions/${actor.uid}`), session);
  auditPlatform(db, batch, actor, 'support.started', { tenantId, resource: `supportSessions/${actor.uid}`, metadata: { sessionId, viewedRoleId, mode: 'read-only' } });
  await batch.commit();
  return { id: sessionId, tenantId, viewedRoleId, mode: 'read-only', expiresAt: new Date(now + READ_SESSION_MS).toISOString() };
}

async function supportContext(db, request) {
  const actor = await platformActor(db, request, 'support.read');
  const session = await db.doc(`supportSessions/${actor.uid}`).get();
  const data = session.data();
  if (!session.exists || data?.id !== request.data?.sessionId || data.expiresAt?.toMillis() <= Date.now()) throw new HttpsError('failed-precondition', 'La sesión de soporte no está activa.');
  const [tenant, role] = await Promise.all([db.doc(`tenants/${data.tenantId}`).get(), db.doc(`tenants/${data.tenantId}/roles/${data.viewedRoleId}`).get()]);
  if (!tenant.exists || !role.exists) throw new HttpsError('not-found', 'El contexto de soporte ya no existe.');
  return {
    operatorUid: actor.uid,
    tenant: tenantSummary(tenant.data()),
    viewedRole: { id: role.id, name: role.data().name || role.id, permissions: role.data().permissions || [] },
    mode: data.mode,
    expiresAt: data.expiresAt.toDate().toISOString(),
  };
}

async function elevateSupport(db, request) {
  const actor = await platformActor(db, request, 'support.elevate');
  if (request.data?.confirmed !== true) throw new HttpsError('failed-precondition', 'Confirma expresamente la elevación.');
  const reason = cleanText(request.data?.reason, 'Motivo', 8, 500);
  const ref = db.doc(`supportSessions/${actor.uid}`);
  let result;
  await db.runTransaction(async tx => {
    const current = await tx.get(ref);
    const session = current.data();
    if (!current.exists || session?.id !== request.data?.sessionId || session.expiresAt?.toMillis() <= Date.now()) throw new HttpsError('failed-precondition', 'La sesión de soporte no está activa.');
    const expiresAt = Timestamp.fromMillis(Date.now() + EDIT_SESSION_MS);
    tx.update(ref, { mode: 'editing', reason, expiresAt, elevatedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
    auditPlatform(db, tx, actor, 'support.elevated', { tenantId: session.tenantId, reason, resource: `supportSessions/${actor.uid}`, metadata: { sessionId: session.id } });
    result = { id: session.id, tenantId: session.tenantId, mode: 'editing', expiresAt: expiresAt.toDate().toISOString() };
  });
  return result;
}

async function supportUpdateSettings(db, request) {
  const actor = await platformActor(db, request, 'support.elevate');
  const sessionRef = db.doc(`supportSessions/${actor.uid}`);
  await db.runTransaction(async tx => {
    const sessionSnap = await tx.get(sessionRef);
    const session = sessionSnap.data();
    if (!sessionSnap.exists || session?.id !== request.data?.sessionId || session.mode !== 'editing' || !session.reason || session.expiresAt?.toMillis() <= Date.now()) {
      throw new HttpsError('permission-denied', 'La sesión elevada no está vigente.');
    }
    const tenantRef = db.doc(`tenants/${session.tenantId}`);
    const tenantSnap = await tx.get(tenantRef);
    if (!tenantSnap.exists) throw new HttpsError('not-found', 'Empresa no encontrada.');
    const patch = settingsPatch(tenantSnap.data(), request.data?.changes || {});
    patch.updatedAt = FieldValue.serverTimestamp();
    tx.update(tenantRef, patch);
    auditPlatform(db, tx, actor, 'support.tenantSettings.updated', { tenantId: session.tenantId, reason: session.reason, resource: `tenants/${session.tenantId}` });
  });
  return { changed: true };
}

async function endSupport(db, request) {
  const actor = await platformActor(db, request, 'support.read');
  const ref = db.doc(`supportSessions/${actor.uid}`);
  await db.runTransaction(async tx => {
    const current = await tx.get(ref);
    if (!current.exists || current.data()?.id !== request.data?.sessionId) throw new HttpsError('not-found', 'Sesión no encontrada.');
    auditPlatform(db, tx, actor, 'support.ended', { tenantId: current.data().tenantId, resource: `supportSessions/${actor.uid}`, metadata: { sessionId: current.data().id } });
    tx.delete(ref);
  });
  return { ended: true };
}

async function queryAudit(db, request) {
  await platformActor(db, request, 'audit.read');
  const pageSize = limit(request.data?.limit);
  const snapshot = await db.collection('platformAuditLogs').orderBy('createdAt', 'desc').limit(pageSize).get();
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data(), createdAt: doc.data().createdAt?.toDate?.().toISOString() || null }));
}

async function platformGateway(db, request) {
  switch (request.data?.action) {
    case 'validateOperator': return validateOperator(db, request);
    case 'listTenants': return listTenants(db, request);
    case 'tenantDetail': return tenantDetail(db, request);
    case 'listTemplates': return listTemplates(db, request);
    case 'beginSupport': return beginSupport(db, request);
    case 'supportContext': return supportContext(db, request);
    case 'elevateSupport': return elevateSupport(db, request);
    case 'supportUpdateSettings': return supportUpdateSettings(db, request);
    case 'endSupport': return endSupport(db, request);
    case 'queryAudit': return queryAudit(db, request);
    default: throw new HttpsError('invalid-argument', 'Acción Platform no reconocida.');
  }
}

module.exports = { platformGateway, validateOperator, listTenants, tenantDetail, listTemplates, beginSupport, supportContext, elevateSupport, supportUpdateSettings, endSupport, queryAudit };
