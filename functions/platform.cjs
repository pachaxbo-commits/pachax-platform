const { randomUUID } = require('node:crypto');
const { HttpsError } = require('firebase-functions/v2/https');
const { FieldPath, FieldValue, Timestamp } = require('firebase-admin/firestore');
const { getApps } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');

function resolveAdminAuth() {
  const apps = getApps();
  const defaultApp = apps.find(a => a.name === '[DEFAULT]');
  if (defaultApp) return getAuth(defaultApp);
  if (apps.length > 0) return getAuth(apps[0]);
  return getAuth();
}
const { BusinessTemplateRegistry } = require('./generated/templates.js');
const { PUBLIC_TEMPLATES, OFFICIAL_COMMERCIAL_TEMPLATES, PLAN_ELIGIBLE_TEMPLATE_IDS } = require('./generated/publicTemplates.js');
const { id } = require('./authorization.cjs');
const { settingsPatch } = require('./tenants.cjs');
const { platformActor, cleanText, auditPlatform } = require('./platformAuthorization.cjs');
const commercialOnboarding = require('./commercialOnboarding.cjs');

const DIRECTORY_LIMIT = 50;
// La identidad canónica técnica viene del registro público; no duplicar una lista
// parcial que confunda hamburger_shop con restaurant_pos.
const COMMERCIAL_TEMPLATE_IDS = Object.freeze([...new Set([...OFFICIAL_COMMERCIAL_TEMPLATES, ...PUBLIC_TEMPLATES.map(template => template.id)])]);
const COMMERCIAL_PLAN_TEMPLATE_IDS = Object.freeze([...new Set([...PLAN_ELIGIBLE_TEMPLATE_IDS, ...PUBLIC_TEMPLATES.map(template => template.id)])]);
const READ_SESSION_MS = 60 * 60 * 1000;
const EDIT_SESSION_MS = 15 * 60 * 1000;

async function commitCommercialBatch(db, batch, refreshPublicSnapshot) {
  if (refreshPublicSnapshot) return commercialOnboarding.commitPublicCatalogMutation(db, batch);
  return batch.commit();
}

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
  const [tenant, members, rolesSnap] = await Promise.all([
    root.get(),
    root.collection('members').orderBy('createdAt').limit(100).get(),
    root.collection('roles').get(),
  ]);
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
    roles: rolesSnap.docs.map(doc => ({ id: doc.id, name: doc.data().name || doc.id, permissions: doc.data().permissions || [] })),
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

async function listOperators(db, request) {
  await platformActor(db, request, 'operators.manage');
  const snapshot = await db.collection('platformOperators').orderBy('createdAt', 'desc').limit(50).get();
  return {
    operators: snapshot.docs.map(doc => {
      const data = doc.data();
      return {
        uid: doc.id,
        email: data.email || null,
        role: data.role,
        active: Boolean(data.active),
        createdAt: data.createdAt?.toDate?.().toISOString() || null,
        updatedAt: data.updatedAt?.toDate?.().toISOString() || null,
      };
    }),
  };
}

async function manageOperator(db, request) {
  const actor = await platformActor(db, request, 'operators.manage');
  const targetUidInput = request.data?.targetUid ? String(request.data.targetUid).trim() : '';
  const role = cleanText(request.data?.role, 'Rol', 1, 50);
  const active = Boolean(request.data?.active);
  const emailInput = typeof request.data?.email === 'string' ? request.data.email.trim().toLowerCase() : null;

  const validRoles = ['platform_owner', 'platform_admin', 'platform_support', 'platform_content', 'platform_finance'];
  if (!validRoles.includes(role)) {
    throw new HttpsError('invalid-argument', `Rol no válido: ${role}`);
  }

  const auth = resolveAdminAuth();
  let authUser;
  if (targetUidInput) {
    try {
      authUser = await auth.getUser(targetUidInput);
    } catch {
      if (emailInput) {
        try {
          authUser = await auth.getUserByEmail(emailInput);
        } catch {
          throw new HttpsError('not-found', `No se encontró usuario Firebase con correo ${emailInput}.`);
        }
      } else {
        throw new HttpsError('not-found', `No se encontró usuario Firebase con UID ${targetUidInput}.`);
      }
    }
  } else if (emailInput) {
    try {
      authUser = await auth.getUserByEmail(emailInput);
    } catch {
      throw new HttpsError('not-found', `No se encontró usuario Firebase con correo ${emailInput}.`);
    }
  } else {
    throw new HttpsError('invalid-argument', 'UID o correo de operador requerido.');
  }

  const finalUid = authUser.uid;

  // Si se intenta desactivar o degradar a sí mismo, verificar que quede al menos otro owner activo
  if (finalUid === actor.uid && (role !== 'platform_owner' || !active)) {
    const ownersSnap = await db.collection('platformOperators')
      .where('role', '==', 'platform_owner')
      .where('active', '==', true)
      .get();
    if (ownersSnap.size <= 1) {
      throw new HttpsError('failed-precondition', 'Debe existir al menos un platform_owner activo en la plataforma.');
    }
  }

  const previousClaims = authUser.customClaims || {};

  // Actualizar claims en Firebase Auth
  await auth.setCustomUserClaims(finalUid, {
    ...previousClaims,
    platform: active,
    platformRole: active ? role : null,
  });

  // Actualizar metadata en Firestore
  const opRef = db.doc(`platformOperators/${finalUid}`);
  const opSnap = await opRef.get();
  const now = FieldValue.serverTimestamp();

  await opRef.set({
    uid: finalUid,
    email: authUser.email || emailInput || '',
    role,
    active,
    updatedAt: now,
    updatedBy: actor.uid,
    createdAt: opSnap.exists ? (opSnap.data().createdAt || now) : now,
  }, { merge: true });

  const batch = db.batch();
  auditPlatform(db, batch, actor, 'operator.managed', {
    resource: `platformOperators/${finalUid}`,
    reason: `Configuración de operador platform: rol=${role}, activo=${active}`,
    metadata: { targetUid: finalUid, role, active, email: authUser.email || emailInput },
  });
  await batch.commit();

  return { success: true, uid: finalUid, email: authUser.email || emailInput, role, active };
}

async function getPlatformStats(db, request) {
  await platformActor(db, request, 'tenants.read');
  const tenantsSnap = await db.collection('tenants').get();
  const totalTenants = tenantsSnap.size;
  const tenantsByType = {
    restaurant_pos: 0,
    route_distribution: 0,
    nightclub_lounge: 0,
    gelateria_weight_cafe: 0,
    other: 0,
  };
  let activeTenants = 0;
  let trialTenants = 0;

  tenantsSnap.docs.forEach(doc => {
    const data = doc.data();
    const bType = data.businessType;
    if (bType && Object.prototype.hasOwnProperty.call(tenantsByType, bType)) {
      tenantsByType[bType] = (tenantsByType[bType] || 0) + 1;
    } else {
      tenantsByType.other = (tenantsByType.other || 0) + 1;
    }
    if (data.status === 'active') activeTenants++;
    if (data.status === 'trial') trialTenants++;
  });

  return {
    totalTenants,
    activeTenants,
    trialTenants,
    tenantsByType,
    billingIntegrated: false,
    billingNotice: 'Sin integración de facturación',
  };
}

const OFFICIAL_CANONICAL_TEMPLATE_IDS = Object.freeze([...COMMERCIAL_TEMPLATE_IDS, null]);

async function publishPlan(db, request) {
  const actor = await platformActor(db, request, 'plans.manage');
  const planId = cleanText(request.data?.planId, 'ID de plan', 1, 100);
  const status = cleanText(request.data?.status, 'Estado', 1, 20);

  if (!['published', 'draft'].includes(status)) {
    throw new HttpsError('invalid-argument', 'El estado del plan debe ser published o draft.');
  }

  const planRef = db.doc(`platformPlans/${planId}`);
  const planSnap = await planRef.get();
  if (!planSnap.exists) {
    throw new HttpsError('not-found', 'Plan no encontrado.');
  }

  const planData = planSnap.data();
  const templateId = planData.templateId;
  if (!templateId || !COMMERCIAL_PLAN_TEMPLATE_IDS.includes(templateId)) {
    throw new HttpsError('invalid-argument', `Plantilla no elegible para planes de suscripción: ${templateId}`);
  }

  const planKind = planData.planKind === 'free' ? 'free' : 'paid';

  if (status === 'published') {
    if (planData.priceApproval !== 'approved') throw new HttpsError('failed-precondition', 'La tarifa requiere aprobación explícita antes de publicarse.');
    if (Array.isArray(planData.technicalEntitlements) && planData.technicalEntitlements.length > 0) {
      throw new HttpsError('failed-precondition', 'Los entitlements técnicos todavía no están conectados a Billing Core y no se pueden publicar como capacidades activas.');
    }
    if (!Array.isArray(planData.includedFeatures) || planData.includedFeatures.length === 0
      || planData.includedFeatures.some(feature => typeof feature !== 'string' || !feature.trim() || feature.length > 180)) {
      throw new HttpsError('failed-precondition', 'El plan requiere características comerciales válidas.');
    }
    if (planKind !== 'free' && (!(Number(planData.monthlyPriceUSD) > 0) || !(Number(planData.annualPriceUSD) > 0))) {
      throw new HttpsError('failed-precondition', 'Un plan de pago requiere tarifas mensual y anual mayores que cero.');
    }
    if (planKind === 'free') {
      if (Number(planData.monthlyPriceUSD || 0) !== 0 || Number(planData.annualPriceUSD || 0) !== 0) {
        throw new HttpsError('failed-precondition', 'Un plan gratuito debe tener precio mensual y anual exactamente 0.');
      }
      if (planData.adsRequired !== true) {
        throw new HttpsError('failed-precondition', 'Un plan gratuito requiere adsRequired=true.');
      }
      const freePublishedSnap = await db.collection('platformPlans')
        .where('templateId', '==', templateId)
        .where('status', '==', 'published')
        .get();
      const otherFreePublished = freePublishedSnap.docs.filter(d => d.id !== planId && d.data().planKind === 'free');
      if (otherFreePublished.length >= 1) {
        throw new HttpsError('failed-precondition', 'Cada plantilla permite como máximo 1 Plan Gratuito publicado simultáneamente.');
      }
    } else {
      const paidPublishedSnap = await db.collection('platformPlans')
        .where('templateId', '==', templateId)
        .where('status', '==', 'published')
        .get();
      const otherPaidPublished = paidPublishedSnap.docs.filter(d => d.id !== planId && d.data().planKind !== 'free');
      if (otherPaidPublished.length >= 3) {
        throw new HttpsError('failed-precondition', 'Cada plantilla permite un máximo de 3 planes de pago activos publicados simultáneamente en el catálogo.');
      }
    }
  }

  const batch = db.batch();
  const now = FieldValue.serverTimestamp();
  const updateData = {
    status,
    updatedAt: now,
    updatedBy: actor.uid,
  };
  if (status === 'published') {
    updateData.publishedAt = now;
    updateData.publishedBy = actor.uid;
  }
  batch.update(planRef, updateData);

  auditPlatform(db, batch, actor, status === 'published' ? 'plan.publish' : 'plan.unpublish', {
    resource: `platformPlans/${planId}`,
    reason: status === 'published' ? 'Publicación explícita de plan' : 'Despublicación de plan a borrador',
    metadata: {
      planId, status, templateId, planKind,
      monthlyPriceUSD: Number(planData.monthlyPriceUSD || 0),
      annualPriceUSD: Number(planData.annualPriceUSD || 0),
      currency: planData.currency || 'USD',
      includedFeatureCount: Array.isArray(planData.includedFeatures) ? planData.includedFeatures.length : 0,
    },
  });

  await commitCommercialBatch(db, batch, status === 'published' || planData.status === 'published');
  return { success: true, planId, status };
}

async function savePlan(db, request) {
  const actor = await platformActor(db, request, 'plans.manage');
  const plan = request.data?.plan;
  if (!plan || typeof plan !== 'object' || !plan.id) {
    throw new HttpsError('invalid-argument', 'Datos de plan inválidos.');
  }
  const allowedPlanFields = new Set([
    'id', 'templateId', 'name', 'planKind', 'priceApproval', 'tierLevel', 'monthlyPriceUSD', 'annualPriceUSD',
    'currency', 'billingPeriod', 'badge', 'isPopular', 'adsRequired', 'clientProfile', 'limitsLabel',
    'includedFeatures', 'technicalEntitlements', 'ctaLabel', 'status', 'order', 'commercialVersion',
    'createdAt', 'updatedAt', 'updatedBy', 'publishedAt', 'publishedBy',
  ]);
  if (Object.keys(plan).some(key => !allowedPlanFields.has(key))) {
    throw new HttpsError('invalid-argument', 'El plan incluye campos fuera del contrato comercial; los entitlements y la suscripción se administran aparte.');
  }
  const planId = cleanText(plan.id, 'ID de plan', 1, 100);
  const name = cleanText(plan.name, 'Nombre de plan', 1, 100);
  const status = cleanText(plan.status || 'draft', 'Estado', 1, 20);
  if (!['published', 'draft'].includes(status)) {
    throw new HttpsError('invalid-argument', 'El estado del plan debe ser published o draft.');
  }

  const templateId = cleanText(plan.templateId, 'ID de plantilla', 1, 50);
  if (!COMMERCIAL_PLAN_TEMPLATE_IDS.includes(templateId)) {
    throw new HttpsError('invalid-argument', `Plantilla no elegible para planes de suscripción: ${templateId}`);
  }

  const planKind = plan.planKind === 'free' ? 'free' : 'paid';
  if (plan.planKind !== undefined && !['free', 'paid'].includes(plan.planKind)) {
    throw new HttpsError('invalid-argument', 'La modalidad de plan debe ser free o paid.');
  }
  let monthlyPrice = Number(plan.monthlyPriceUSD ?? 0);
  let annualPrice = Number(plan.annualPriceUSD ?? 0);

  if (!Number.isFinite(monthlyPrice) || monthlyPrice < 0 || !Number.isFinite(annualPrice) || annualPrice < 0) {
    throw new HttpsError('invalid-argument', 'Los precios deben ser valores numéricos válidos mayores o iguales a 0.');
  }

  let adsRequired = Boolean(plan.adsRequired);
  const currency = plan.currency || 'USD';
  if (!['USD', 'BOB'].includes(currency)) {
    throw new HttpsError('invalid-argument', 'La moneda del plan no es válida.');
  }
  const priceApproval = plan.priceApproval === 'approved' ? 'approved' : 'pending';
  if (priceApproval === 'approved' && actor.operator.role !== 'platform_owner') {
    throw new HttpsError('permission-denied', 'Solo Platform Owner puede aprobar una tarifa comercial oficial.');
  }
  if (plan.technicalEntitlements !== undefined
    && (!Array.isArray(plan.technicalEntitlements)
      || plan.technicalEntitlements.some(value => typeof value !== 'string' || !value.trim()))) {
    throw new HttpsError('invalid-argument', 'Los entitlements técnicos del plan deben ser una lista válida.');
  }
  let tierLevel = plan.tierLevel;

  if (planKind === 'free') {
    if (monthlyPrice !== 0 || annualPrice !== 0) {
      throw new HttpsError('failed-precondition', 'Un plan gratuito debe tener precio mensual y anual exactamente 0.');
    }
    adsRequired = true;
    tierLevel = undefined;
  } else {
    if (tierLevel !== undefined && ![1, 2, 3].includes(Number(tierLevel))) {
      throw new HttpsError('invalid-argument', 'El tierLevel para un plan de pago debe ser 1, 2 o 3.');
    }
  }

  if (status === 'published') {
    if (!Array.isArray(plan.includedFeatures) || plan.includedFeatures.length === 0
      || plan.includedFeatures.some(feature => typeof feature !== 'string' || !feature.trim() || feature.length > 180)) {
      throw new HttpsError('failed-precondition', 'Completa características comerciales válidas antes de publicar el plan.');
    }
    if (priceApproval !== 'approved') {
      throw new HttpsError('failed-precondition', 'El precio del plan requiere aprobación comercial explícita antes de publicarse.');
    }
    if (Array.isArray(plan.technicalEntitlements) && plan.technicalEntitlements.length > 0) {
      throw new HttpsError('failed-precondition', 'Los entitlements técnicos todavía no están conectados a Billing Core y no se pueden publicar como capacidades activas.');
    }
    if (planKind !== 'free' && (!(monthlyPrice > 0) || !(annualPrice > 0))) {
      throw new HttpsError('failed-precondition', 'Un plan de pago requiere tarifas mensual y anual mayores que cero.');
    }
    if (planKind === 'free') {
      const freePublishedSnap = await db.collection('platformPlans')
        .where('templateId', '==', templateId)
        .where('status', '==', 'published')
        .get();
      const otherFreePublished = freePublishedSnap.docs.filter(d => d.id !== planId && d.data().planKind === 'free');
      if (otherFreePublished.length >= 1) {
        throw new HttpsError('failed-precondition', 'Cada plantilla permite como máximo 1 Plan Gratuito publicado simultáneamente.');
      }
    } else {
      const paidPublishedSnap = await db.collection('platformPlans')
        .where('templateId', '==', templateId)
        .where('status', '==', 'published')
        .get();
      const otherPaidPublished = paidPublishedSnap.docs.filter(d => d.id !== planId && d.data().planKind !== 'free');
      if (otherPaidPublished.length >= 3) {
        throw new HttpsError('failed-precondition', 'Cada plantilla permite un máximo de 3 planes de pago activos publicados simultáneamente en el catálogo.');
      }
    }
  }

  const planRef = db.doc(`platformPlans/${planId}`);
  const planSnap = await planRef.get();
  const now = FieldValue.serverTimestamp();

  const payload = {
    ...plan,
    id: planId,
    name,
    templateId,
    planKind,
    monthlyPriceUSD: monthlyPrice,
    annualPriceUSD: annualPrice,
    currency,
    adsRequired,
    priceApproval,
    technicalEntitlements: Array.isArray(plan.technicalEntitlements) ? plan.technicalEntitlements : [],
    commercialVersion: (Number(planSnap.data()?.commercialVersion) || 0) + 1,
    status,
    updatedAt: now,
    updatedBy: actor.uid,
    createdAt: planSnap.exists ? (planSnap.data().createdAt || now) : now,
  };
  if (tierLevel !== undefined) {
    payload.tierLevel = Number(tierLevel);
  } else {
    delete payload.tierLevel;
  }

  const batch = db.batch();
  batch.set(planRef, payload, { merge: false });

  auditPlatform(db, batch, actor, planSnap.exists ? 'plan.update' : 'plan.create', {
    resource: `platformPlans/${planId}`,
    reason: 'Guardado de configuración de plan comercial',
    metadata: {
      planId, name: plan.name, status, templateId, planKind, priceApproval,
      monthlyPriceUSD: monthlyPrice,
      annualPriceUSD: annualPrice,
      currency,
      includedFeatureCount: Array.isArray(plan.includedFeatures) ? plan.includedFeatures.length : 0,
    },
  });

  await commitCommercialBatch(db, batch, status === 'published' || planSnap.data()?.status === 'published');
  return { success: true, planId };
}

async function deletePlan(db, request) {
  const actor = await platformActor(db, request, 'plans.manage');
  const planId = cleanText(request.data?.planId, 'ID de plan', 1, 100);

  const planRef = db.doc(`platformPlans/${planId}`);
  const planSnap = await planRef.get();
  if (!planSnap.exists) {
    throw new HttpsError('not-found', 'Plan no encontrado.');
  }

  const batch = db.batch();
  batch.delete(planRef);

  auditPlatform(db, batch, actor, 'plan.delete', {
    resource: `platformPlans/${planId}`,
    reason: 'Eliminación de plan comercial',
    metadata: { planId },
  });

  await commitCommercialBatch(db, batch, planSnap.data().status === 'published');
  return { success: true, planId };
}

async function saveTemplate(db, request) {
  const actor = await platformActor(db, request, 'content.manage');
  const template = request.data?.template;
  if (!template || typeof template !== 'object' || !template.id) {
    throw new HttpsError('invalid-argument', 'Datos de plantilla inválidos.');
  }
  const templateId = cleanText(template.id, 'ID de plantilla', 1, 100);
  if (!COMMERCIAL_TEMPLATE_IDS.includes(templateId)) {
    throw new HttpsError('invalid-argument', `Plantilla comercial no autorizada o no registrada: ${templateId}`);
  }

  // Invariante de identidad técnica: no permitir que una plantilla se remapee arbitrariamente
  if (template.canonicalTemplateId !== undefined) {
    if (!OFFICIAL_CANONICAL_TEMPLATE_IDS.includes(template.canonicalTemplateId)) {
      throw new HttpsError('invalid-argument', `canonicalTemplateId no válido: ${template.canonicalTemplateId}`);
    }
    if (templateId === 'custom') {
      if (template.canonicalTemplateId !== null) {
        throw new HttpsError('invalid-argument', 'Plantilla custom no tiene canonicalTemplateId.');
      }
    } else if (template.canonicalTemplateId !== templateId
      && !(templateId === 'hamburger' && template.canonicalTemplateId === 'restaurant')) {
      throw new HttpsError('invalid-argument', `Identidad técnica no coincide con la plantilla oficial: ${templateId} vs ${template.canonicalTemplateId}`);
    }
  }

  const publicDef = PUBLIC_TEMPLATES.find(p => p.id === templateId);

  if (template.status !== undefined && !['published', 'draft'].includes(template.status)) {
    throw new HttpsError('invalid-argument', 'El estado de plantilla debe ser published o draft.');
  }
  if (template.status === 'published') {
    const requiredText = ['commercialName', 'cardSubtitle', 'description', 'detailDescription', 'targetAudience', 'problemSolved'];
    if (requiredText.some(field => typeof template[field] !== 'string' || !template[field].trim())
      || !Array.isArray(template.bullets) || !Array.isArray(template.features)
      || !Number.isFinite(Number(template.order))) {
      throw new HttpsError('failed-precondition', 'Completa el contenido comercial administrado antes de publicar la plantilla.');
    }
  }

  if (template.commercialMode !== undefined && !['specialized', 'self_service'].includes(template.commercialMode)) {
    throw new HttpsError('invalid-argument', 'La modalidad comercial de plantilla no es válida.');
  }
  const expectedCommercialMode = ['restaurant', 'distribution', 'nightclub', 'custom'].includes(templateId)
    ? 'specialized'
    : 'self_service';
  if (template.commercialMode !== undefined && template.commercialMode !== expectedCommercialMode) {
    throw new HttpsError('failed-precondition', 'La modalidad comercial debe respetar la categoría canónica de esta plantilla.');
  }

  if (template.commercialAvailability !== undefined) {
    if (!['available', 'coming_soon'].includes(template.commercialAvailability)) {
      throw new HttpsError('invalid-argument', 'Estado comercial de plantilla no válido.');
    }
    const technicallyAvailable = (publicDef?.provisioningStatus || publicDef?.status) === 'available';
    if (template.commercialAvailability === 'available' && !technicallyAvailable) {
      throw new HttpsError('failed-precondition', 'La plantilla aún no está habilitada técnicamente para contratación.');
    }
  }
  if (template.implementationBasePriceUSD !== undefined && template.implementationBasePriceUSD !== null) {
    const implementationBase = Number(template.implementationBasePriceUSD);
    if (!Number.isFinite(implementationBase) || implementationBase < 0) {
      throw new HttpsError('invalid-argument', 'El costo base de implementación debe ser cero o un importe positivo.');
    }
  }

  // Invariante de ruta técnica de demo: demoRoute y demoPath no son editables libremente por Admin
  if (publicDef) {
    if (template.demoRoute && template.demoRoute !== publicDef.demoPath) {
      throw new HttpsError('invalid-argument', `La ruta de demo técnica es inmutable: ${publicDef.demoPath}`);
    }
    if (template.demoPath && template.demoPath !== publicDef.demoPath) {
      throw new HttpsError('invalid-argument', `La ruta de demo técnica es inmutable: ${publicDef.demoPath}`);
    }
  }

  const templateRef = db.doc(`platformTemplates/${templateId}`);
  const templateSnap = await templateRef.get();
  const previousTemplate = templateSnap.data() || {};
  const commercialFields = ['commercialMode', 'commercialAvailability', 'implementationBasePriceUSD'];
  if (commercialFields.some(field => template[field] !== undefined && template[field] !== previousTemplate[field])
    && !actor.permissions.includes('plans.manage')) {
    throw new HttpsError('permission-denied', 'El operador puede editar contenido, pero no precios ni disponibilidad comercial.');
  }
  const now = FieldValue.serverTimestamp();

  const payload = {
    ...template,
    id: templateId,
    canonicalTemplateId: publicDef ? publicDef.id : null,
    demoRoute: publicDef ? publicDef.demoPath : (template.demoRoute || ''),
    demoPath: publicDef ? publicDef.demoPath : (template.demoPath || ''),
    demoEnabled: templateId === 'custom' ? false : (template.demoEnabled ?? false),
    commercialMode: template.commercialMode || templateSnap.data()?.commercialMode || (['restaurant', 'distribution', 'nightclub'].includes(templateId) ? 'specialized' : 'self_service'),
    commercialAvailability: template.commercialAvailability || templateSnap.data()?.commercialAvailability || 'coming_soon',
    implementationBasePriceUSD: template.implementationBasePriceUSD !== undefined
      ? template.implementationBasePriceUSD
      : (templateSnap.data()?.implementationBasePriceUSD ?? null),
    updatedAt: now,
    updatedBy: actor.uid,
    createdAt: templateSnap.exists ? (templateSnap.data().createdAt || now) : now,
  };
  if (template.status === 'published') {
    payload.publishedAt = templateSnap.exists && templateSnap.data().publishedAt ? templateSnap.data().publishedAt : now;
    payload.publishedBy = actor.uid;
  }

  const batch = db.batch();
  batch.set(templateRef, payload, { merge: true });

  auditPlatform(db, batch, actor, templateSnap.exists ? 'template.update' : 'template.create', {
    resource: `platformTemplates/${templateId}`,
    reason: 'Guardado de configuración comercial de plantilla',
    metadata: {
      templateId,
      name: template.commercialName,
      status: template.status,
      order: Number.isFinite(Number(template.order)) ? Number(template.order) : null,
      commercialAvailability: template.commercialAvailability || 'coming_soon',
      commercialMode: template.commercialMode || null,
      implementationBasePriceUSD: template.implementationBasePriceUSD ?? null,
    },
  });

  await commitCommercialBatch(db, batch, template.status === 'published' || previousTemplate.status === 'published');
  return { success: true, templateId };
}

async function saveExtra(db, request) {
  const actor = await platformActor(db, request, 'content.manage');
  const extra = request.data?.extra;
  if (!extra || typeof extra !== 'object' || !extra.id) {
    throw new HttpsError('invalid-argument', 'Datos de servicio extra inválidos.');
  }
  const extraId = cleanText(extra.id, 'ID de extra', 1, 100);
  if (extra.status !== undefined && !['published', 'draft'].includes(extra.status)) {
    throw new HttpsError('invalid-argument', 'El estado del extra debe ser published o draft.');
  }
  if (extra.applicableTemplates !== undefined && extra.applicableTemplates !== 'all'
    && (!Array.isArray(extra.applicableTemplates) || extra.applicableTemplates.length === 0
      || extra.applicableTemplates.some(templateId => !COMMERCIAL_PLAN_TEMPLATE_IDS.includes(templateId)))) {
    throw new HttpsError('invalid-argument', 'Las plantillas aplicables al extra no son válidas.');
  }
  if (extra.status === 'published'
    && (typeof extra.title !== 'string' || !extra.title.trim()
      || typeof extra.shortDescription !== 'string' || !extra.shortDescription.trim()
      || !['recurring', 'one_time', 'custom_quote'].includes(extra.pricingType))) {
    throw new HttpsError('failed-precondition', 'Completa los datos comerciales del extra antes de publicarlo.');
  }
  const extraRef = db.doc(`platformExtras/${extraId}`);
  const extraSnap = await extraRef.get();
  const previousExtra = extraSnap.data() || {};
  const commercialFields = ['referencePriceLabel', 'pricingType', 'applicableTemplates', 'status'];
  if (commercialFields.some(field => extra[field] !== undefined
    && JSON.stringify(extra[field]) !== JSON.stringify(previousExtra[field]))
    && !actor.permissions.includes('plans.manage')) {
    throw new HttpsError('permission-denied', 'El operador puede editar contenido, pero no precios ni publicación comercial de extras.');
  }
  const now = FieldValue.serverTimestamp();

  const payload = {
    ...extra,
    updatedAt: now,
    updatedBy: actor.uid,
    createdAt: extraSnap.exists ? (extraSnap.data().createdAt || now) : now,
  };

  const batch = db.batch();
  batch.set(extraRef, payload, { merge: true });

  auditPlatform(db, batch, actor, extraSnap.exists ? 'extra.update' : 'extra.create', {
    resource: `platformExtras/${extraId}`,
    reason: 'Guardado de servicio comercial extra',
    metadata: { extraId, title: extra.title, status: extra.status, pricingType: extra.pricingType },
  });

  await commitCommercialBatch(db, batch, extra.status === 'published' || previousExtra.status === 'published');
  return { success: true, extraId };
}

async function deleteExtra(db, request) {
  const actor = await platformActor(db, request, 'content.manage');
  const extraId = cleanText(request.data?.extraId, 'ID de extra', 1, 100);
  const extraRef = db.doc(`platformExtras/${extraId}`);
  const extraSnap = await extraRef.get();
  if (!extraSnap.exists) {
    throw new HttpsError('not-found', 'Servicio extra no encontrado.');
  }

  const batch = db.batch();
  batch.delete(extraRef);

  auditPlatform(db, batch, actor, 'extra.delete', {
    resource: `platformExtras/${extraId}`,
    reason: 'Eliminación de servicio comercial extra',
    metadata: { extraId },
  });

  await commitCommercialBatch(db, batch, extraSnap.data().status === 'published');
  return { success: true, extraId };
}

async function saveLandingContent(db, request) {
  const actor = await platformActor(db, request, 'content.manage');
  const content = request.data?.content;
  if (!content || typeof content !== 'object') {
    throw new HttpsError('invalid-argument', 'Contenido de landing inválido.');
  }
  const landingRef = db.doc('platformConfig/publicLanding');
  const previousLanding = await landingRef.get();
  const now = FieldValue.serverTimestamp();

  const batch = db.batch();
  batch.set(landingRef, {
    ...content,
    updatedAt: now,
    updatedBy: actor.uid,
  }, { merge: true });

  auditPlatform(db, batch, actor, 'landing.update', {
    resource: 'platformConfig/publicLanding',
    reason: 'Actualización de textos y configuración editorial de la landing pública',
  });

  await commitCommercialBatch(db, batch, content.status === 'published' || previousLanding.data()?.status === 'published');
  return { success: true };
}

async function saveMediaAsset(db, request) {
  const actor = await platformActor(db, request, 'content.manage');
  const asset = request.data?.asset;
  if (!asset || typeof asset !== 'object' || !asset.id) {
    throw new HttpsError('invalid-argument', 'Datos de asset multimedia inválidos.');
  }
  const assetId = cleanText(asset.id, 'ID de asset', 1, 100);
  const assetRef = db.doc(`platformMedia/${assetId}`);
  const previousAsset = await assetRef.get();
  const now = FieldValue.serverTimestamp();

  const batch = db.batch();
  batch.set(assetRef, {
    ...asset,
    updatedAt: now,
    updatedBy: actor.uid,
  }, { merge: true });

  auditPlatform(db, batch, actor, 'media.save', {
    resource: `platformMedia/${assetId}`,
    reason: 'Registro o actualización de asset multimedia',
    metadata: { assetId, name: asset.name, url: asset.url },
  });

  await commitCommercialBatch(db, batch, asset.status === 'published' || previousAsset.data()?.status === 'published');
  return { success: true, assetId };
}

async function deleteMediaAsset(db, request) {
  const actor = await platformActor(db, request, 'content.manage');
  const assetId = cleanText(request.data?.assetId, 'ID de asset', 1, 100);
  const assetRef = db.doc(`platformMedia/${assetId}`);
  const assetSnap = await assetRef.get();
  if (!assetSnap.exists) {
    throw new HttpsError('not-found', 'Asset multimedia no encontrado.');
  }

  const batch = db.batch();
  batch.delete(assetRef);

  auditPlatform(db, batch, actor, 'media.delete', {
    resource: `platformMedia/${assetId}`,
    reason: 'Eliminación de asset multimedia de la vitrina',
    metadata: { assetId },
  });

  await commitCommercialBatch(db, batch, assetSnap.data().status === 'published');
  return { success: true, assetId };
}

async function seedPlatformConfig(db, request) {
  const actor = await platformActor(db, request);
  if (!['platform_owner', 'platform_admin'].includes(actor.operator.role)) {
    throw new HttpsError('permission-denied', 'La inicialización requiere Platform Owner o Platform Admin.');
  }
  const defaults = request.data?.defaults;
  if (!defaults || typeof defaults !== 'object') {
    throw new HttpsError('invalid-argument', 'Estructura por defecto requerida.');
  }

  const now = FieldValue.serverTimestamp();
  const batch = db.batch();

  // Landing
  const landingRef = db.doc('platformConfig/publicLanding');
  const landingSnap = await landingRef.get();
  if (!landingSnap.exists && defaults.landingContent) {
    batch.set(landingRef, {
      ...defaults.landingContent,
      status: 'published',
      publishedAt: now,
      publishedBy: actor.uid,
      updatedAt: now,
      updatedBy: actor.uid,
    });
  }

  // Templates
  if (Array.isArray(defaults.templates)) {
    for (const tpl of defaults.templates) {
      if (!tpl.id || !COMMERCIAL_TEMPLATE_IDS.includes(tpl.id)) continue;
      const ref = db.doc(`platformTemplates/${tpl.id}`);
      const snap = await ref.get();
      if (!snap.exists) {
        const templateStatus = tpl.status === 'published' ? 'published' : 'draft';
        const docData = {
          ...tpl,
          id: tpl.id,
          status: templateStatus,
          updatedAt: now,
          updatedBy: actor.uid,
        };
        if (templateStatus === 'published') {
          docData.publishedAt = now;
          docData.publishedBy = actor.uid;
        }
        batch.set(ref, docData);
      }
    }
  }

  // Media
  if (Array.isArray(defaults.mediaAssets)) {
    for (const m of defaults.mediaAssets) {
      if (!m.id) continue;
      const ref = db.doc(`platformMedia/${m.id}`);
      const snap = await ref.get();
      if (!snap.exists) {
        batch.set(ref, {
          ...m,
          status: 'published',
          publishedAt: now,
          publishedBy: actor.uid,
          updatedAt: now,
          updatedBy: actor.uid,
        });
      }
    }
  }

  // Plans (Draft)
  if (Array.isArray(defaults.plans)) {
    for (const p of defaults.plans) {
      if (!p.id || !COMMERCIAL_PLAN_TEMPLATE_IDS.includes(p.templateId)) continue;
      const ref = db.doc(`platformPlans/${p.id}`);
      const snap = await ref.get();
      if (!snap.exists) {
        batch.set(ref, {
          ...p,
          id: p.id,
          planKind: p.planKind === 'free' ? 'free' : 'paid',
          status: 'draft',
          updatedAt: now,
          updatedBy: actor.uid,
        });
      }
    }
  }

  // Seeded extras are never published: a human owner/admin must review them.
  if (Array.isArray(defaults.extras)) {
    for (const e of defaults.extras) {
      if (!e.id) continue;
      const ref = db.doc(`platformExtras/${e.id}`);
      const snap = await ref.get();
      if (!snap.exists) {
        batch.set(ref, {
          ...e,
          status: 'draft',
          updatedAt: now,
          updatedBy: actor.uid,
        });
      }
    }
  }

  auditPlatform(db, batch, actor, 'platform.config.seed', {
    resource: 'platformConfig/publicLanding',
    reason: 'Inicialización de configuración oficial por defecto',
  });

  await commercialOnboarding.commitPublicCatalogMutation(db, batch);
  return { success: true, message: 'Configuración oficial inicializada en Firestore con trazabilidad server-authoritative.' };
}

async function platformGateway(db, request) {
  switch (request.data?.action) {
    case 'listCommercialIntents': return commercialOnboarding.listCommercialIntents(db, request);
    case 'prepareCommercialProposal': return commercialOnboarding.prepareCommercialProposal(db, request);
    case 'updateCommercialIntentStatus': return commercialOnboarding.updateCommercialIntentStatus(db, request);
    case 'validateOperator': return validateOperator(db, request);
    case 'listTenants': return listTenants(db, request);
    case 'tenantDetail': return tenantDetail(db, request);
    case 'listTemplates': return listTemplates(db, request);
    case 'listOperators': return listOperators(db, request);
    case 'manageOperator': return manageOperator(db, request);
    case 'publishPlan': return publishPlan(db, request);
    case 'savePlan': return savePlan(db, request);
    case 'deletePlan': return deletePlan(db, request);
    case 'saveTemplate': return saveTemplate(db, request);
    case 'saveExtra': return saveExtra(db, request);
    case 'deleteExtra': return deleteExtra(db, request);
    case 'saveLandingContent': return saveLandingContent(db, request);
    case 'saveMediaAsset': return saveMediaAsset(db, request);
    case 'deleteMediaAsset': return deleteMediaAsset(db, request);
    case 'seedPlatformConfig': return seedPlatformConfig(db, request);
    case 'getPlatformStats': return getPlatformStats(db, request);
    case 'beginSupport': return beginSupport(db, request);
    case 'supportContext': return supportContext(db, request);
    case 'elevateSupport': return elevateSupport(db, request);
    case 'supportUpdateSettings': return supportUpdateSettings(db, request);
    case 'endSupport': return endSupport(db, request);
    case 'queryAudit': return queryAudit(db, request);
    default: throw new HttpsError('invalid-argument', 'Acción Platform no reconocida.');
  }
}

module.exports = {
  platformGateway,
  listCommercialIntents: commercialOnboarding.listCommercialIntents,
  prepareCommercialProposal: commercialOnboarding.prepareCommercialProposal,
  updateCommercialIntentStatus: commercialOnboarding.updateCommercialIntentStatus,
  validateOperator,
  listTenants,
  tenantDetail,
  listTemplates,
  listOperators,
  manageOperator,
  publishPlan,
  savePlan,
  deletePlan,
  saveTemplate,
  saveExtra,
  deleteExtra,
  saveLandingContent,
  saveMediaAsset,
  deleteMediaAsset,
  seedPlatformConfig,
  getPlatformStats,
  beginSupport,
  supportContext,
  elevateSupport,
  supportUpdateSettings,
  endSupport,
  queryAudit,
  OFFICIAL_COMMERCIAL_TEMPLATES: COMMERCIAL_TEMPLATE_IDS,
  PLAN_ELIGIBLE_TEMPLATE_IDS: COMMERCIAL_PLAN_TEMPLATE_IDS,
};
