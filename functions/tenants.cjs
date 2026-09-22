const { createHash } = require('node:crypto');
const { HttpsError } = require('firebase-functions/v2/https');
const { getTemplate } = require('./generated/templates.js');
const { authenticated, id, tenantActor, audit, hasPermission } = require('./authorization.cjs');
const hash = value => createHash('sha256').update(value).digest('hex').slice(0, 36);
function text(value, max = 100) {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max) throw new HttpsError('invalid-argument', 'Texto inválido.');
  return value.trim();
}
function configuration(input, existing) {
  const result = structuredClone(existing);
  if (input.currency !== undefined) {
    if (!/^[A-Z]{3}$/.test(input.currency)) throw new HttpsError('invalid-argument', 'Moneda inválida.');
    result.currency = input.currency;
  }
  if (input.currencySymbol !== undefined) result.currencySymbol = text(input.currencySymbol, 6);
  if (input.timezone !== undefined) {
    try { new Intl.DateTimeFormat('es', { timeZone: input.timezone }).format(); } catch { throw new HttpsError('invalid-argument', 'Zona horaria inválida.'); }
    result.timezone = input.timezone;
  }
  return result;
}
function branding(input = {}, existing = { primary: '#20383A', accent: '#B58A55' }) {
  const result = { ...existing };
  for (const key of ['primary', 'accent']) {
    if (input[key] !== undefined) {
      if (!/^#[0-9a-f]{6}$/i.test(input[key])) throw new HttpsError('invalid-argument', 'Color inválido.');
      result[key] = input[key];
    }
  }
  // White text is used on primary buttons. Require WCAG AA contrast.
  const channels = result.primary.slice(1).match(/../g).map(v => parseInt(v, 16) / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4);
  const luminance = channels[0] * .2126 + channels[1] * .7152 + channels[2] * .0722;
  if (1.05 / (luminance + .05) < 4.5) throw new HttpsError('invalid-argument', 'El color principal necesita más contraste con texto blanco.');
  return result;
}
async function createTenant(db, auth, request) {
  const uid = authenticated(request), input = request.data || {};
  const operationId = id(input.operationId), name = text(input.name), template = getTemplate(input.businessType);
  const tenantId = `t_${hash(`${uid}:${operationId}`)}`, root = db.doc(`tenants/${tenantId}`);
  const user = await auth.getUser(uid);
  const now = new Date().toISOString();
  const tenant = { tenantId, name, nameKey: name.toLowerCase(), businessType: template.businessType, ownerUid: uid,
    ownerEmail: user.email || '', status: 'active', branding: branding(input.branding), configuration: configuration(input, template.defaults),
    entitlements: {}, planKey: null, subscriptionStatus: 'trial', schemaVersion: 1, templateVersion: template.version,
    createdAt: now, updatedAt: now, userCount: 1, branchCount: 1 };
  await db.runTransaction(async tx => {
    const [current, profile, op] = await Promise.all([tx.get(root), tx.get(db.doc(`users/${uid}`)), tx.get(db.doc(`platformOperators/${uid}`))]);
    if (op.data()?.active === true) throw new HttpsError('permission-denied', 'La creación de empresas requiere una cuenta de dueño.');
    if (current.exists) {
      if (current.data().ownerUid !== uid) throw new HttpsError('permission-denied', 'Operación no autorizada.');
      return;
    }
    const membership = { uid, tenantId, displayName: user.displayName || user.email || 'Dueño', email: user.email || '', roleId: 'owner', status: 'active', branchIds: ['main'], routeIds: [], createdAt: now, createdBy: uid };
    tx.create(root, tenant);
    tx.create(root.collection('members').doc(uid), membership);
    tx.create(root.collection('branches').doc('main'), { tenantId, id: 'main', name: 'Sucursal principal', active: true, createdAt: now });
    for (const role of template.roles) tx.create(root.collection('roles').doc(role.id), { ...role, tenantId });
    tx.set(db.doc(`users/${uid}`), { uid, displayName: user.displayName || '', email: user.email || '', defaultTenantId: profile.data()?.defaultTenantId || tenantId, createdAt: profile.data()?.createdAt || now, updatedAt: now }, { merge: true });
    tx.create(db.doc(`users/${uid}/tenantLinks/${tenantId}`), { tenantId, name, businessType: template.businessType });
    audit(db, tx, { uid, tenantId, actorType: 'tenant' }, 'tenant.created', tenantId, null, { name, businessType: template.businessType });
  });
  return { tenantId };
}
async function listMemberships(db, request) {
  const uid = authenticated(request);
  const links = await db.collection(`users/${uid}/tenantLinks`).limit(100).get();
  const memberships = await Promise.all(links.docs.map(async link => {
    const root = db.doc(`tenants/${link.id}`), [tenant, member] = await Promise.all([root.get(), root.collection('members').doc(uid).get()]);
    return tenant.exists && member.data()?.status === 'active' ? { tenant: tenant.data(), membership: member.data() } : null;
  }));
  return memberships.filter(Boolean);
}
async function selectTenant(db, request) {
  const uid = authenticated(request), tenantId = id(request.data?.tenantId);
  await db.runTransaction(async tx => {
    const membership = await tx.get(db.doc(`tenants/${tenantId}/members/${uid}`));
    if (membership.data()?.status !== 'active') throw new HttpsError('permission-denied', 'No tienes acceso a esa empresa.');
    tx.set(db.doc(`users/${uid}`), { defaultTenantId: tenantId, updatedAt: new Date().toISOString() }, { merge: true });
  });
  return { tenantId };
}
function settingsPatch(tenant, input) {
  const patch = { updatedAt: new Date().toISOString() };
  if (input.name !== undefined) { patch.name = text(input.name); patch.nameKey = patch.name.toLowerCase(); }
  if (input.branding !== undefined) patch.branding = branding(input.branding, tenant.branding);
  patch.configuration = configuration(input, tenant.configuration);
  if (input.features !== undefined) {
    const template = getTemplate(tenant.businessType);
    for (const [key, value] of Object.entries(input.features)) {
      if (!template.capabilities.includes(key) || typeof value !== 'boolean') throw new HttpsError('invalid-argument', 'Capacidad no válida para esta plantilla.');
      patch.configuration.features[key] = value;
    }
  }
  if (input.businessType !== undefined && input.businessType !== tenant.businessType) throw new HttpsError('failed-precondition', 'La plantilla requiere una migración explícita.');
  return patch;
}
async function updateSettings(db, request) {
  const actor = await tenantActor(db, request, 'settings.manage');
  await db.runTransaction(async tx => {
    const [tenant, member] = await Promise.all([tx.get(actor.root), tx.get(actor.root.collection('members').doc(actor.uid))]);
    if (!hasPermission(tenant.data(), member.data(), 'settings.manage')) throw new HttpsError('permission-denied', 'Permiso revocado.');
    const patch = settingsPatch(tenant.data(), request.data);
    tx.update(actor.root, patch); audit(db, tx, actor, 'settings.updated', actor.tenantId, tenant.data(), { ...tenant.data(), ...patch });
  });
  return { changed: true };
}
async function manageMember(db, auth, request) {
  const actor = await tenantActor(db, request, 'users.manage'), input = request.data;
  const roleId = input.roleId || input.role;
  if (input.action === 'createMember') {
    if (!getTemplate(actor.tenant.businessType).roles.some(role => role.id === roleId && role.id !== 'owner')) throw new HttpsError('invalid-argument', 'Rol no válido.');
    const email = text(input.email, 160).toLowerCase(), displayName = text(input.displayName, 80);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || typeof input.password !== 'string' || input.password.length < 8 || input.password.length > 72) throw new HttpsError('invalid-argument', 'Correo o contraseña inválidos.');
    const uid = `u_${hash(`${actor.tenantId}:${id(input.operationId)}`)}`;
    const branchIds = input.branchIds || ['main'], routeIds = input.routeIds || (input.routeId ? [input.routeId] : []);
    if (!Array.isArray(branchIds) || !branchIds.length || !Array.isArray(routeIds) || branchIds.length > 20 || routeIds.length > 20) throw new HttpsError('invalid-argument', 'Asignación inválida.');
    for (const branch of branchIds) if (!(await actor.root.collection('branches').doc(id(branch)).get()).exists) throw new HttpsError('invalid-argument', 'Sucursal desconocida.');
    for (const route of routeIds) if (!(await actor.root.collection('distRoutes').doc(id(route)).get()).exists) throw new HttpsError('invalid-argument', 'Ruta desconocida.');
    if (roleId === 'distributor' && routeIds.length !== 1) throw new HttpsError('invalid-argument', 'Asigna una ruta al distribuidor.');
    try { await auth.createUser({ uid, email, password: input.password, displayName }); }
    catch (error) { if (error.code !== 'auth/uid-already-exists') throw error; }
    await db.runTransaction(async tx => {
      const ref = actor.root.collection('members').doc(uid);
      const [tenant, fresh, current] = await Promise.all([tx.get(actor.root), tx.get(actor.root.collection('members').doc(actor.uid)), tx.get(ref)]);
      if (!hasPermission(tenant.data(), fresh.data(), 'users.manage')) throw new HttpsError('permission-denied', 'Permiso revocado.');
      if (current.exists) return;
      const now = new Date().toISOString();
      const member = { uid, tenantId: actor.tenantId, email, displayName, roleId, status: 'active', branchIds, routeIds, warehouseId: input.warehouseId ? id(input.warehouseId) : 'central', createdAt: now, createdBy: actor.uid };
      tx.create(ref, member);
      tx.create(db.doc(`users/${uid}`), { uid, email, displayName, defaultTenantId: actor.tenantId, managedByTenantId: actor.tenantId, createdAt: now, updatedAt: now });
      tx.create(db.doc(`users/${uid}/tenantLinks/${actor.tenantId}`), { tenantId: actor.tenantId, name: actor.tenant.name, businessType: actor.tenant.businessType });
      tx.update(actor.root, { userCount: (tenant.data().userCount || 0) + 1 });
      audit(db, tx, actor, 'member.created', uid, null, member);
    });
    return { uid };
  }
  const uid = id(input.uid), ref = actor.root.collection('members').doc(uid);
  if (input.action === 'changePassword') {
    const [profile, links, member] = await Promise.all([db.doc(`users/${uid}`).get(), db.collection(`users/${uid}/tenantLinks`).limit(2).get(), ref.get()]);
    if (!member.exists || profile.data()?.managedByTenantId !== actor.tenantId || links.size !== 1 || uid === actor.tenant.ownerUid) throw new HttpsError('permission-denied', 'La cuenta global debe recuperar su acceso personalmente.');
    if (typeof input.password !== 'string' || input.password.length < 8 || input.password.length > 72) throw new HttpsError('invalid-argument', 'Contraseña inválida.');
    await auth.updateUser(uid, { password: input.password });
    const batch = db.batch(); audit(db, batch, actor, 'member.passwordReset', uid); await batch.commit();
    return { changed: true };
  }
  await db.runTransaction(async tx => {
    const [tenant, current, fresh] = await Promise.all([tx.get(actor.root), tx.get(ref), tx.get(actor.root.collection('members').doc(actor.uid))]);
    if (!hasPermission(tenant.data(), fresh.data(), 'users.manage')) throw new HttpsError('permission-denied', 'Permiso revocado.');
    if (!current.exists) throw new HttpsError('not-found', 'Miembro no encontrado.');
    if (uid === tenant.data().ownerUid || uid === actor.uid) throw new HttpsError('failed-precondition', 'No se puede retirar ni modificar al dueño o tu propio acceso.');
    if (!['updateMember', 'deleteMember'].includes(input.action)) throw new HttpsError('invalid-argument', 'Acción inválida.');
    const patch = { updatedAt: new Date().toISOString() };
    if (input.action === 'deleteMember' || input.active === false) patch.status = 'disabled';
    else if (input.active === true) patch.status = 'active';
    if (roleId) {
      if (!getTemplate(tenant.data().businessType).roles.some(role => role.id === roleId && role.id !== 'owner')) throw new HttpsError('invalid-argument', 'Rol inválido.');
      patch.roleId = roleId;
    }
    if (input.displayName) patch.displayName = text(input.displayName, 80);
    // Auth email/disabled are global: never change them when modifying one membership.
    if (input.email && input.email !== current.data().email) throw new HttpsError('failed-precondition', 'El correo global se cambia desde el perfil del usuario.');
    tx.update(ref, patch); audit(db, tx, actor, 'member.updated', uid, current.data(), { ...current.data(), ...patch });
  });
  return { changed: true, deleted: input.action === 'deleteMember' };
}
module.exports = { createTenant, listMemberships, selectTenant, updateSettings, manageMember, settingsPatch };
