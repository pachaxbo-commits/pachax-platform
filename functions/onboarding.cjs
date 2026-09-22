const { createHash } = require('node:crypto');
const { HttpsError } = require('firebase-functions/v2/https');
const { FieldValue } = require('firebase-admin/firestore');
const { getTemplate } = require('./generated/templates.js');
const { authenticated, id } = require('./authorization.cjs');

const ALLOWED_FIELDS = new Set(['action', 'requestId', 'companyName', 'businessType', 'branding']);

function initialTenantId(uid) {
  const digest = createHash('sha256').update(`initial-tenant:${uid}`).digest('hex').slice(0, 36);
  return `t_${digest}`;
}

function companyName(value) {
  if (typeof value !== 'string') throw new HttpsError('invalid-argument', 'Nombre comercial inválido.');
  const result = value.trim().replace(/\s+/g, ' ');
  if (result.length < 2 || result.length > 100 || /[\u0000-\u001f\u007f]/.test(result)) {
    throw new HttpsError('invalid-argument', 'El nombre comercial debe tener entre 2 y 100 caracteres.');
  }
  return result;
}

function initialBranding(value) {
  if (value === undefined) return { primary: '#20383a', accent: '#b58a55' };
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new HttpsError('invalid-argument', 'Branding inválido.');
  if (Object.keys(value).some(key => !['primary', 'accent'].includes(key))) throw new HttpsError('invalid-argument', 'El onboarding solo admite colores iniciales.');
  const result = { primary: '#20383a', accent: '#b58a55' };
  for (const key of ['primary', 'accent']) {
    if (value[key] !== undefined) {
      if (typeof value[key] !== 'string' || !/^#[0-9a-f]{6}$/i.test(value[key])) throw new HttpsError('invalid-argument', 'Color inválido.');
      result[key] = value[key].toLowerCase();
    }
  }
  const channels = result.primary.slice(1).match(/../g).map(part => parseInt(part, 16) / 255)
    .map(channel => channel <= .04045 ? channel / 12.92 : ((channel + .055) / 1.055) ** 2.4);
  const luminance = channels[0] * .2126 + channels[1] * .7152 + channels[2] * .0722;
  if (1.05 / (luminance + .05) < 4.5) throw new HttpsError('invalid-argument', 'El color principal necesita más contraste con texto blanco.');
  return result;
}

function templateFor(value) {
  try { return getTemplate(value); }
  catch { throw new HttpsError('invalid-argument', 'Plantilla de negocio no reconocida.'); }
}

function response(tenantId, template) {
  return {
    tenantId,
    membership: { roleId: 'owner', status: 'active', branchIds: ['main'], routeIds: [] },
    template: { businessType: template.businessType, version: template.version },
    onboarding: { status: 'complete' },
  };
}

async function completeOnboarding(db, auth, request) {
  const uid = authenticated(request);
  const input = request.data || {};
  if (Object.keys(input).some(key => !ALLOWED_FIELDS.has(key))) {
    throw new HttpsError('invalid-argument', 'El onboarding contiene campos no permitidos.');
  }
  const requestId = id(input.requestId);
  const name = companyName(input.companyName);
  const template = templateFor(input.businessType);
  const branding = initialBranding(input.branding);
  const user = await auth.getUser(uid);
  const tenantId = initialTenantId(uid);
  const root = db.doc(`tenants/${tenantId}`);
  const memberRef = root.collection('members').doc(uid);
  const branchRef = root.collection('branches').doc('main');
  const profileRef = db.doc(`users/${uid}`);
  const linkRef = db.doc(`users/${uid}/tenantLinks/${tenantId}`);
  const onboardingRef = db.doc(`users/${uid}/onboarding/initialTenant`);
  const operatorRef = db.doc(`platformOperators/${uid}`);

  return db.runTransaction(async tx => {
    const [marker, tenant, member, profile, link, operator, links, branch, roles] = await Promise.all([
      tx.get(onboardingRef), tx.get(root), tx.get(memberRef), tx.get(profileRef),
      tx.get(linkRef), tx.get(operatorRef), tx.get(db.collection(`users/${uid}/tenantLinks`).limit(1)),
      tx.get(branchRef), tx.get(root.collection('roles')),
    ]);
    if (operator.data()?.active === true) throw new HttpsError('permission-denied', 'Una cuenta Platform no puede usar onboarding tenant.');

    if (marker.exists) {
      const saved = marker.data();
      const savedTemplate = tenant.exists ? templateFor(tenant.data().businessType) : null;
      const expectedRoles = new Set(savedTemplate?.roles.map(role => role.id) || []);
      const complete = saved.status === 'complete' && saved.tenantId === tenantId
        && tenant.data()?.ownerUid === uid && member.data()?.roleId === 'owner'
        && member.data()?.status === 'active' && profile.exists && link.exists && branch.data()?.active === true
        && roles.size === expectedRoles.size && roles.docs.every(role => expectedRoles.has(role.id));
      if (!complete) throw new HttpsError('failed-precondition', 'El onboarding existente está incompleto y requiere revisión administrativa.');
      return response(tenantId, savedTemplate);
    }

    if (!links.empty) throw new HttpsError('failed-precondition', 'La cuenta ya tiene acceso a una empresa; utiliza el selector de empresas.');
    if (tenant.exists || member.exists || link.exists || branch.exists || !roles.empty) {
      throw new HttpsError('failed-precondition', 'Se detectó un onboarding parcial; no se crearán documentos adicionales.');
    }

    const now = FieldValue.serverTimestamp();
    const tenantData = {
      tenantId, name, nameKey: name.toLowerCase(), businessType: template.businessType,
      ownerUid: uid, ownerEmail: user.email || '', status: 'active', branding,
      configuration: structuredClone(template.defaults), entitlements: {}, planKey: null,
      subscriptionStatus: 'trial', schemaVersion: 1, templateVersion: template.version,
      createdAt: now, updatedAt: now, userCount: 1, branchCount: 1,
    };
    const membership = {
      uid, tenantId, displayName: user.displayName || user.email || 'Dueño', email: user.email || '',
      roleId: 'owner', status: 'active', branchIds: ['main'], routeIds: [], createdAt: now, createdBy: uid,
    };

    tx.create(root, tenantData);
    tx.create(memberRef, membership);
    tx.create(branchRef, { tenantId, id: 'main', name: 'Sucursal principal', active: true, createdAt: now });
    for (const role of template.roles) tx.create(root.collection('roles').doc(role.id), { ...role, tenantId, createdAt: now });
    tx.set(profileRef, {
      uid, displayName: user.displayName || '', email: user.email || '',
      defaultTenantId: profile.data()?.defaultTenantId || tenantId,
      createdAt: profile.data()?.createdAt || now, updatedAt: now,
    }, { merge: true });
    tx.create(linkRef, { tenantId, name, businessType: template.businessType, roleId: 'owner', status: 'active', createdAt: now });
    tx.create(onboardingRef, { status: 'complete', tenantId, businessType: template.businessType, requestId, createdAt: now, completedAt: now });
    tx.create(root.collection('auditLogs').doc(), {
      actorUid: uid, actorType: 'tenant', tenantId, action: 'onboarding.completed',
      resource: 'tenant', resourceId: tenantId, before: null,
      after: { name, businessType: template.businessType }, reason: null, createdAt: now,
    });
    return response(tenantId, template);
  });
}

module.exports = { completeOnboarding, initialTenantId };
