const { createHash, randomUUID } = require('node:crypto');
const { HttpsError } = require('firebase-functions/v2/https');
const { FieldValue } = require('firebase-admin/firestore');
const { getTemplate } = require('./generated/templates.js');
const { PUBLIC_TEMPLATES, isTemplateProvisioningAvailable } = require('./generated/publicTemplates.js');
const { catalogForTenant, distributionProfile } = require('./distributionCatalog.cjs');
const { readNightclubBaseInfrastructure, assertNightclubBaseInfrastructureState, createNightclubBaseInfrastructure } = require('./nightclubInfrastructure.cjs');
const { platformActor, cleanText, auditPlatform } = require('./platformAuthorization.cjs');

async function ownerPlatformActor(db, request) {
  const actor = await platformActor(db, request, 'tenants.configure');
  if (actor.operator.role !== 'platform_owner') throw new HttpsError('permission-denied', 'Solo Platform Owner puede dar de alta empresas.');
  return actor;
}

const OPERATION_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DISTRIBUTION_PROFILES = new Set(['food', 'beverages', 'cleaning', 'hardware', 'pharmacy', 'pets', 'stationery', 'spare_parts', 'mixed']);

function publicProvisionableTemplates() {
  return PUBLIC_TEMPLATES
    .filter(template => isTemplateProvisioningAvailable(template.businessType))
    .map(template => {
      const canonical = getTemplate(template.businessType);
      return { businessType: canonical.businessType, name: template.title, description: template.shortDescription, version: canonical.version };
    });
}

function normalizeInput(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new HttpsError('invalid-argument', 'Completa los datos de la empresa.');
  const allowed = new Set(['action', 'operationId', 'companyName', 'businessType', 'ownerEmail', 'ownerDisplayName', 'ownerEmailConfirmed', 'industryProfile', 'currency', 'currencySymbol', 'timezone', 'branding', 'businessIdentity']);
  if (Object.keys(data).some(key => !allowed.has(key))) throw new HttpsError('invalid-argument', 'La solicitud contiene campos fuera del flujo de alta asistida.');
  if (typeof data.operationId !== 'string' || !OPERATION_ID.test(data.operationId)) throw new HttpsError('invalid-argument', 'Actualiza la pantalla e intenta nuevamente con una operación nueva.');
  const companyName = cleanText(data.companyName, 'Nombre de empresa', 2, 100).replace(/\s+/g, ' ');
  const ownerEmail = cleanText(data.ownerEmail, 'Correo del propietario', 3, 160).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(ownerEmail)) throw new HttpsError('invalid-argument', 'Escribe un correo válido del propietario.');
  const ownerDisplayName = cleanText(data.ownerDisplayName, 'Nombre del propietario', 2, 80);
  if (data.ownerEmailConfirmed !== true) throw new HttpsError('failed-precondition', 'Confirma que este correo pertenece al propietario autorizado de la empresa.');
  let template;
  try { template = getTemplate(data.businessType); }
  catch { throw new HttpsError('invalid-argument', 'Selecciona una plantilla reconocida.'); }
  if (!isTemplateProvisioningAvailable(template.businessType)) throw new HttpsError('failed-precondition', 'Esta plantilla aún no está disponible para el alta asistida.');
  let industryProfile;
  try { industryProfile = distributionProfile(template.businessType, data.industryProfile); }
  catch (error) { throw new HttpsError('invalid-argument', error.message); }
  if (industryProfile && !DISTRIBUTION_PROFILES.has(industryProfile)) throw new HttpsError('invalid-argument', 'El perfil de Distribución no es válido.');

  const currency = data.currency === undefined ? 'BOB' : data.currency;
  if (!/^[A-Z]{3}$/.test(currency)) throw new HttpsError('invalid-argument', 'La moneda debe ser un código de tres letras.');
  const currencySymbol = data.currencySymbol === undefined ? (currency === 'BOB' ? 'Bs' : currency) : cleanText(data.currencySymbol, 'Símbolo monetario', 1, 6);
  const timezone = data.timezone === undefined ? 'America/La_Paz' : cleanText(data.timezone, 'Zona horaria', 1, 80);
  try { new Intl.DateTimeFormat('es', { timeZone: timezone }).format(); }
  catch { throw new HttpsError('invalid-argument', 'La zona horaria no es válida.'); }

  const brandingInput = data.branding ?? {};
  if (!brandingInput || typeof brandingInput !== 'object' || Array.isArray(brandingInput)
    || Object.keys(brandingInput).some(key => !['primary', 'accent'].includes(key))) {
    throw new HttpsError('invalid-argument', 'La configuración de marca solo admite colores iniciales.');
  }
  const branding = { primary: '#0f766e', accent: '#f59e0b' };
  for (const key of ['primary', 'accent']) {
    if (brandingInput[key] !== undefined) {
      if (typeof brandingInput[key] !== 'string' || !/^#[0-9a-f]{6}$/i.test(brandingInput[key])) throw new HttpsError('invalid-argument', 'Color de marca no válido.');
      branding[key] = brandingInput[key].toLowerCase();
    }
  }
  const rgb = branding.primary.slice(1).match(/../g).map(value => parseInt(value, 16) / 255).map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4);
  const luminance = rgb[0] * .2126 + rgb[1] * .7152 + rgb[2] * .0722;
  if (1.05 / (luminance + .05) < 4.5) throw new HttpsError('invalid-argument', 'El color principal no tiene contraste suficiente con texto blanco.');

  const identityInput = data.businessIdentity ?? {};
  const identityFields = new Set(['legalName', 'phone', 'address', 'city', 'taxId', 'website', 'receiptHeader', 'receiptFooter']);
  if (!identityInput || typeof identityInput !== 'object' || Array.isArray(identityInput)
    || Object.keys(identityInput).some(key => !identityFields.has(key))) {
    throw new HttpsError('invalid-argument', 'Los datos empresariales contienen campos no permitidos.');
  }
  const lengthLimits = { legalName: 120, phone: 30, address: 200, city: 80, taxId: 40, website: 150, receiptHeader: 120, receiptFooter: 120 };
  const identity = { tradeName: companyName, primaryColor: branding.primary, accentColor: branding.accent, logoUrl: '', email: ownerEmail, whatsapp: '', showLogo: true, showAddress: true, showPhone: true, showTaxId: true, showManagedBy: true, receiptFooter: '¡Gracias por su preferencia!' };
  for (const [field, max] of Object.entries(lengthLimits)) {
    const value = identityInput[field];
    if (value !== undefined) {
      if (typeof value !== 'string' || value.trim().length > max) throw new HttpsError('invalid-argument', `El campo ${field} supera el formato permitido.`);
      identity[field] = value.trim();
    }
  }
  return {
    operationId: data.operationId,
    companyName,
    businessType: template.businessType,
    ownerEmail,
    ownerDisplayName,
    industryProfile,
    currency,
    currencySymbol,
    timezone,
    branding,
    businessIdentity: identity,
    template,
  };
}

function requestFingerprint(input) {
  const { template, ...payload } = input;
  return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

function setupUrlResponse(input, setupLink, error = false, accountDisabled = false) {
  return {
    success: true,
    tenantId: input.tenantId,
    businessType: input.businessType,
    ownerUid: input.ownerUid,
    ownerAccess: input.createdAuthUser
      ? { method: 'one_time_password_setup', setupLink: setupLink || null, setupLinkPending: error || !setupLink, accountDisabled }
      : { method: 'existing_account', setupLink: null, setupLinkPending: false },
  };
}

async function getOrCreateOwnerAuth(auth, operation) {
  if (!operation.createdAuthUser) {
    const existing = await auth.getUser(operation.ownerUid).catch(() => null);
    if (!existing || existing.email?.toLowerCase() !== operation.ownerEmail) {
      throw new HttpsError('failed-precondition', 'La cuenta existente del propietario cambió; revisa el correo antes de continuar.');
    }
    if (existing.disabled) throw new HttpsError('failed-precondition', 'La cuenta Firebase Auth del propietario está deshabilitada. Reactívala por el procedimiento autorizado antes de vincularla.');
    return { user: existing, createdNow: false };
  }

  const existingByUid = await auth.getUser(operation.ownerUid).catch(() => null);
  if (existingByUid) {
    if (existingByUid.email?.toLowerCase() !== operation.ownerEmail) throw new HttpsError('already-exists', 'El identificador de la operación ya pertenece a otra identidad.');
    return { user: existingByUid, createdNow: false };
  }
  try {
    const user = await auth.createUser({ uid: operation.ownerUid, email: operation.ownerEmail, displayName: operation.ownerDisplayName, emailVerified: false, disabled: true });
    return { user, createdNow: true };
  } catch (error) {
    if (error?.code === 'auth/email-already-exists') {
      throw new HttpsError('already-exists', 'Ese correo ya tiene una cuenta Firebase Auth. Inicia otra operación para vincular la cuenta existente.');
    }
    if (error?.code === 'auth/uid-already-exists') {
      const retryUser = await auth.getUser(operation.ownerUid).catch(() => null);
      if (retryUser?.email?.toLowerCase() === operation.ownerEmail) return { user: retryUser, createdNow: false };
    }
    throw new HttpsError('unavailable', 'No se pudo preparar la identidad del propietario. Puedes reintentar la misma operación.');
  }
}

async function reserveOperation(db, actor, input, digest, ownerLookup) {
  const operationRef = db.doc(`platformAssistedTenantOperations/${input.operationId}`);
  const tenantId = `t_${randomUUID().replace(/-/g, '')}`;
  const candidateOwnerUid = ownerLookup?.uid || randomUUID().replace(/-/g, '');
  const createdAuthUser = !ownerLookup;
  const companyKey = createHash('sha256').update(`${input.businessType}:${input.companyName.toLowerCase()}`).digest('hex');
  const companyRef = db.doc(`platformAssistedTenantNames/${companyKey}`);
  let operation;
  await db.runTransaction(async tx => {
    const existingTenantQuery = db.collection('tenants').where('nameKey', '==', input.companyName.toLowerCase()).limit(20);
    const [current, existingName, existingTenants] = await Promise.all([tx.get(operationRef), tx.get(companyRef), tx.get(existingTenantQuery)]);
    if (current.exists) {
      const saved = current.data();
      if (saved.actorUid !== actor.uid || saved.requestHash !== digest || saved.ownerEmail !== input.ownerEmail) {
        throw new HttpsError('already-exists', 'Este identificador de operación ya se usó con otros datos. No se creó otra empresa.');
      }
      operation = saved;
      if (saved.status === 'failed') {
        if (existingName.exists && existingName.data()?.operationId !== input.operationId) {
          throw new HttpsError('already-exists', 'Ya existe una empresa con el mismo nombre y plantilla. Revisa Clientes / Tenants antes de iniciar otra alta.');
        }
        tx.set(operationRef, { status: 'pending', failureCode: FieldValue.delete(), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
        if (!existingName.exists || existingName.data()?.operationId === input.operationId) {
          tx.set(companyRef, { operationId: input.operationId, tenantId: saved.tenantId, status: 'pending', updatedAt: FieldValue.serverTimestamp() }, { merge: true });
        }
        operation = { ...saved, status: 'pending' };
      }
      return;
    }
    if (existingName.exists && existingName.data()?.status !== 'failed') {
      throw new HttpsError('already-exists', 'Ya existe una empresa con el mismo nombre y plantilla. Revisa Clientes / Tenants antes de iniciar otra alta.');
    }
    if (existingTenants.docs.some(item => item.data().businessType === input.businessType)) {
      throw new HttpsError('already-exists', 'Ya existe una empresa con el mismo nombre y plantilla. Revisa Clientes / Tenants antes de iniciar otra alta.');
    }
    operation = {
      operationId: input.operationId,
      actorUid: actor.uid,
      actorRole: actor.operator.role,
      requestHash: digest,
      companyName: input.companyName,
      businessType: input.businessType,
      ownerEmail: input.ownerEmail,
      ownerUid: candidateOwnerUid,
      createdAuthUser,
      tenantId,
      companyKey,
      status: 'pending',
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    };
    tx.create(operationRef, operation);
    tx.set(companyRef, { operationId: input.operationId, tenantId, status: 'pending', createdAt: FieldValue.serverTimestamp() });
  });
  return { operationRef, companyRef, operation };
}

async function failUnprovisionedOperation(db, reservation, actor, code) {
  await db.runTransaction(async tx => {
    const [operation, company] = await Promise.all([tx.get(reservation.operationRef), tx.get(reservation.companyRef)]);
    if (!operation.exists || operation.data()?.status === 'complete' || operation.data()?.status === 'provisioned') return;
    tx.set(reservation.operationRef, { status: 'failed', failureCode: code, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    if (company.data()?.operationId === reservation.operationRef.id) tx.delete(reservation.companyRef);
    auditPlatform(db, tx, actor, 'tenant.assistedProvision.failed', {
      resource: reservation.operationRef.path,
      reason: 'Alta asistida no completada; no se activó una empresa.',
      metadata: { operationId: reservation.operationRef.id, failureCode: code },
    });
  });
}

function tenantDataFor(input, tenantId, ownerUid, now) {
  const template = input.template;
  const configuration = structuredClone(template.defaults);
  configuration.currency = input.currency;
  configuration.currencySymbol = input.currencySymbol;
  configuration.timezone = input.timezone;
  return {
    tenantId,
    name: input.companyName,
    nameKey: input.companyName.toLowerCase(),
    businessType: template.businessType,
    ownerUid,
    ownerEmail: input.ownerEmail,
    status: 'provisioning',
    branding: input.branding,
    businessIdentity: input.businessIdentity,
    configuration,
    entitlements: {},
    planKey: null,
    subscriptionStatus: 'trial',
    schemaVersion: 1,
    templateVersion: template.version,
    provisioningOperationId: input.operationId,
    createdAt: now,
    updatedAt: now,
    userCount: 1,
    branchCount: 1,
  };
}

async function createProvisioningRecords(db, actor, input, operation, reservation) {
  const root = db.doc(`tenants/${operation.tenantId}`);
  const membershipRef = root.collection('members').doc(operation.ownerUid);
  const branchRef = root.collection('branches').doc('main');
  const profileRef = db.doc(`users/${operation.ownerUid}`);
  const linkRef = db.doc(`users/${operation.ownerUid}/tenantLinks/${operation.tenantId}`);
  const catalogRef = root.collection('distSettings').doc('catalog');
  await db.runTransaction(async tx => {
    const [freshOperation, tenant, member, profile, link, branch, roles, catalog, targetPlatformOperator] = await Promise.all([
      tx.get(reservation.operationRef), tx.get(root), tx.get(membershipRef), tx.get(profileRef), tx.get(linkRef),
      tx.get(branchRef), tx.get(root.collection('roles')),
      input.industryProfile ? tx.get(catalogRef) : Promise.resolve(null),
      tx.get(db.doc(`platformOperators/${operation.ownerUid}`)),
    ]);
    if (!freshOperation.exists || freshOperation.data()?.actorUid !== actor.uid) throw new HttpsError('permission-denied', 'La operación ya no pertenece al operador actual.');
    if (freshOperation.data()?.status === 'complete' || freshOperation.data()?.status === 'provisioned') return;
    const infrastructure = input.businessType === 'nightclub_lounge' ? await readNightclubBaseInfrastructure(tx, root) : null;
    if (tenant.exists || member.exists || link.exists || branch.exists || !roles.empty || catalog?.exists) {
      throw new HttpsError('failed-precondition', 'Se detectó una configuración previa o parcial; no se sobrescribieron datos. Revisa la operación con soporte.');
    }
    if (infrastructure) assertNightclubBaseInfrastructureState(infrastructure, operation.tenantId);
    if (targetPlatformOperator.data()?.active === true) throw new HttpsError('failed-precondition', 'Una cuenta Platform activa no puede vincularse como propietario de una empresa. Usa una identidad de cliente separada.');

    const now = FieldValue.serverTimestamp();
    const createdTenant = tenantDataFor(input, operation.tenantId, operation.ownerUid, now);
    const membership = {
      uid: operation.ownerUid,
      tenantId: operation.tenantId,
      displayName: input.ownerDisplayName,
      email: input.ownerEmail,
      roleId: 'owner',
      status: 'pending',
      branchIds: ['main'],
      routeIds: [],
      createdAt: now,
      createdBy: actor.uid,
    };
    tx.create(root, createdTenant);
    tx.create(membershipRef, membership);
    tx.create(branchRef, { tenantId: operation.tenantId, id: 'main', name: 'Sucursal principal', active: true, createdAt: now });
    for (const role of input.template.roles) tx.create(root.collection('roles').doc(role.id), { ...role, tenantId: operation.tenantId, createdAt: now });
    if (infrastructure) createNightclubBaseInfrastructure(tx, root, operation.tenantId, now);
    if (input.industryProfile) tx.create(catalogRef, catalogForTenant(operation.tenantId, input.industryProfile, new Date().toISOString()));
    tx.set(profileRef, {
      uid: operation.ownerUid,
      displayName: profile.data()?.displayName || input.ownerDisplayName,
      email: input.ownerEmail,
      defaultTenantId: profile.data()?.defaultTenantId || operation.tenantId,
      createdAt: profile.data()?.createdAt || now,
      updatedAt: now,
    }, { merge: true });
    tx.create(linkRef, { tenantId: operation.tenantId, name: input.companyName, businessType: input.businessType, roleId: 'owner', status: 'pending', createdAt: now });
    tx.create(root.collection('auditLogs').doc(), {
      actorUid: actor.uid, actorType: 'platform', tenantId: operation.tenantId, action: 'tenant.assistedProvision.started',
      resource: 'tenant', resourceId: operation.tenantId, before: null,
      after: { name: input.companyName, businessType: input.businessType, ownerUid: operation.ownerUid },
      reason: 'Alta guiada autorizada desde PACHAX Admin.', createdAt: now,
    });
    tx.set(reservation.operationRef, { status: 'provisioned', updatedAt: now }, { merge: true });
    tx.set(reservation.companyRef, { status: 'provisioned', updatedAt: now }, { merge: true });
    auditPlatform(db, tx, actor, 'tenant.assistedProvision.started', {
      tenantId: operation.tenantId,
      resource: `tenants/${operation.tenantId}`,
      reason: 'Alta guiada de empresa autorizada por Platform Owner.',
      metadata: { operationId: input.operationId, businessType: input.businessType, ownerUid: operation.ownerUid },
    });
  });
}

async function activateProvisionedTenant(db, actor, operation, reservation) {
  const root = db.doc(`tenants/${operation.tenantId}`);
  const memberRef = root.collection('members').doc(operation.ownerUid);
  const linkRef = db.doc(`users/${operation.ownerUid}/tenantLinks/${operation.tenantId}`);
  await db.runTransaction(async tx => {
    const [freshOperation, tenant, member, link, company] = await Promise.all([
      tx.get(reservation.operationRef), tx.get(root), tx.get(memberRef), tx.get(linkRef), tx.get(reservation.companyRef),
    ]);
    if (!freshOperation.exists || freshOperation.data()?.actorUid !== actor.uid) throw new HttpsError('permission-denied', 'La operación ya no pertenece al operador actual.');
    const current = freshOperation.data();
    if (current.status === 'complete') return;
    if (current.status !== 'provisioned' || !tenant.exists || tenant.data()?.provisioningOperationId !== operation.operationId
      || !member.exists || !link.exists || member.data()?.status !== 'pending' || link.data()?.status !== 'pending') {
      throw new HttpsError('failed-precondition', 'El aprovisionamiento está incompleto y requiere revisión; no se activó el acceso del propietario.');
    }
    const now = FieldValue.serverTimestamp();
    tx.update(root, { status: 'active', updatedAt: now });
    tx.update(memberRef, { status: 'active', updatedAt: now });
    tx.update(linkRef, { status: 'active', updatedAt: now });
    tx.set(reservation.operationRef, { status: 'complete', completedAt: now, updatedAt: now }, { merge: true });
    if (company.exists && company.data()?.operationId === operation.operationId) tx.set(reservation.companyRef, { status: 'complete', updatedAt: now }, { merge: true });
    auditPlatform(db, tx, actor, 'tenant.assistedProvision.completed', {
      tenantId: operation.tenantId,
      resource: `tenants/${operation.tenantId}`,
      reason: 'Empresa y acceso del propietario activados desde PACHAX Admin.',
      metadata: { operationId: operation.operationId, businessType: current.businessType, ownerUid: operation.ownerUid },
    });
    tx.create(root.collection('auditLogs').doc(), {
      actorUid: actor.uid, actorType: 'platform', tenantId: operation.tenantId, action: 'tenant.assistedProvision.completed',
      resource: 'tenant', resourceId: operation.tenantId, before: { status: 'provisioning' }, after: { status: 'active', businessType: current.businessType },
      reason: 'Activación final después de verificar la identidad.', createdAt: now,
    });
  });
}

async function listAssistedTenantTemplates(db, request) {
  await ownerPlatformActor(db, request);
  return { templates: publicProvisionableTemplates() };
}

async function createAssistedTenant(db, auth, request, hooks = {}) {
  const actor = await ownerPlatformActor(db, request);
  const input = normalizeInput(request.data);
  const digest = requestFingerprint(input);
  const operationRef = db.doc(`platformAssistedTenantOperations/${input.operationId}`);
  let existingOperation = await operationRef.get();
  if (existingOperation.exists && (existingOperation.data()?.actorUid !== actor.uid || existingOperation.data()?.requestHash !== digest)) {
    throw new HttpsError('already-exists', 'Este identificador de operación ya se usó con otros datos. No se creó otra empresa.');
  }
  let ownerLookup = null;
  if (!existingOperation.exists) {
    try { ownerLookup = await auth.getUserByEmail(input.ownerEmail); }
    catch (error) { if (error?.code !== 'auth/user-not-found') throw new HttpsError('unavailable', 'No se pudo verificar la identidad del propietario.'); }
  }
  const reservation = await reserveOperation(db, actor, input, digest, ownerLookup);
  let operation = reservation.operation;

  if (operation.status === 'complete') {
    if (operation.createdAuthUser) {
      let link = null;
      try {
        const account = await auth.getUser(operation.ownerUid);
        if (account.disabled) return setupUrlResponse({ ...input, ...operation }, null, true, true);
        link = await auth.generatePasswordResetLink(operation.ownerEmail);
      } catch { return setupUrlResponse({ ...input, ...operation }, null, true); }
      return setupUrlResponse({ ...input, ...operation }, link);
    }
    return setupUrlResponse({ ...input, ...operation }, null);
  }

  let owner;
  try {
    owner = await getOrCreateOwnerAuth(auth, operation);
  } catch (error) {
    if (operation.status === 'pending') await failUnprovisionedOperation(db, reservation, actor, error.code || 'owner_identity_unavailable');
    throw error;
  }

  try {
    if (operation.status === 'pending') {
      await createProvisioningRecords(db, actor, input, operation, reservation);
      operation = { ...operation, status: 'provisioned' };
    }
    if (hooks.afterProvisioningRecords) await hooks.afterProvisioningRecords({ db, auth, operation, input });
    if (operation.createdAuthUser && owner.user.disabled) await auth.updateUser(operation.ownerUid, { disabled: false });
    await activateProvisionedTenant(db, actor, operation, reservation);
  } catch (error) {
    const freshOperation = await reservation.operationRef.get();
    if (freshOperation.data()?.status === 'pending') {
      if (owner.createdNow && operation.createdAuthUser) await auth.deleteUser(operation.ownerUid).catch(() => undefined);
      await failUnprovisionedOperation(db, reservation, actor, error.code || 'tenant_provisioning_failed').catch(() => undefined);
    }
    throw error instanceof HttpsError ? error : new HttpsError('unavailable', 'La empresa todavía no se activó; reintenta la misma operación o revisa el estado en Admin.');
  }

  let setupLink = null;
  let setupLinkPending = false;
  if (operation.createdAuthUser) {
    try {
      setupLink = await auth.generatePasswordResetLink(operation.ownerEmail);
    } catch {
      setupLinkPending = true;
    }
  }
  return setupUrlResponse({ ...input, ...operation }, setupLink, setupLinkPending);
}

module.exports = { publicProvisionableTemplates, normalizeInput, listAssistedTenantTemplates, createAssistedTenant };
