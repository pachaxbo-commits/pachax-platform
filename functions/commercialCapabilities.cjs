const { HttpsError } = require('firebase-functions/v2/https');
const { FieldValue } = require('firebase-admin/firestore');

const CAPABILITIES_VERSION = 1;
const MAX_ACTIVE_USERS = 100;
const MAX_ACTIVE_PRODUCTS = 200;
const MAX_ACTIVE_BRANCHES = 1;

function integer(value, label, min, max) {
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    throw new HttpsError('invalid-argument', `${label} debe estar entre ${min} y ${max}.`);
  }
  return value;
}

function normalizeCapabilitiesV1(raw, businessType) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw) || raw.version !== CAPABILITIES_VERSION
    || raw.businessType !== businessType || !raw.limits || !raw.features) {
    throw new HttpsError('invalid-argument', 'Completa el contrato de capacidades V1 para la plantilla seleccionada.');
  }
  const limits = {
    activeUsers: integer(raw.limits.activeUsers, 'Usuarios activos', 1, MAX_ACTIVE_USERS),
    activeProducts: integer(raw.limits.activeProducts, 'Productos activos', 1, MAX_ACTIVE_PRODUCTS),
    activeBranches: integer(raw.limits.activeBranches, 'Sucursales', 1, MAX_ACTIVE_BRANCHES),
  };
  const reports = raw.features.reports || {};
  const receipts = raw.features.receipts || {};
  const printing = raw.features.printing || {};
  const adsRequired = raw.features.adsRequired;
  for (const [name, value] of Object.entries({
    'reportes básicos': reports.basic,
    'reportes detallados': reports.detailed,
    'exportación de reportes': reports.export,
    'recibos digitales': receipts.digital,
    'impresión manual': printing.manual,
    'impresión automática de cocina': printing.kitchenAutomatic,
    'publicidad obligatoria': adsRequired,
  })) {
    if (typeof value !== 'boolean') throw new HttpsError('invalid-argument', `Configura si ${name} está incluido.`);
  }
  // Reports Core has not yet separated read permissions from operational data reads
  // for every template. V1 therefore keeps the basic summary as a baseline instead
  // of selling a restriction that cannot be enforced consistently everywhere.
  if (reports.basic !== true) throw new HttpsError('failed-precondition', 'Los reportes básicos son una capacidad base de V1; su exclusión requiere integrar Reports Core.');
  // These capabilities have no end-to-end entitlement adapter yet. Keeping them false
  // prevents a commercial plan from promising behavior the backend cannot enforce.
  if (reports.detailed || reports.export || receipts.digital || printing.manual || printing.kitchenAutomatic) {
    throw new HttpsError('failed-precondition', 'Una capacidad solicitada todavía no tiene control técnico completo y no se puede incluir en un plan.');
  }
  return {
    version: CAPABILITIES_VERSION,
    businessType,
    limits,
    features: {
      reports: { basic: reports.basic, detailed: false, export: false },
      receipts: { digital: false },
      printing: { manual: false, kitchenAutomatic: false },
      adsRequired,
    },
  };
}

function normalizeCapabilityAdjustments(raw) {
  if (raw === undefined || raw === null) return { activeUsers: 0, activeProducts: 0 };
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)
    || Object.keys(raw).some(key => !['activeUsers', 'activeProducts'].includes(key))) {
    throw new HttpsError('invalid-argument', 'El extra incluye ajustes de capacidad no reconocidos.');
  }
  return {
    activeUsers: integer(raw.activeUsers ?? 0, 'Ampliación de usuarios del extra', 0, MAX_ACTIVE_USERS),
    activeProducts: integer(raw.activeProducts ?? 0, 'Ampliación de productos del extra', 0, MAX_ACTIVE_PRODUCTS),
  };
}

function applyCapabilityAdjustments(snapshot, adjustments) {
  const next = structuredClone(snapshot);
  next.limits.activeUsers += adjustments.activeUsers;
  next.limits.activeProducts += adjustments.activeProducts;
  if (next.limits.activeUsers > MAX_ACTIVE_USERS || next.limits.activeProducts > MAX_ACTIVE_PRODUCTS) {
    throw new HttpsError('failed-precondition', 'El plan y sus extras superan el máximo técnico verificable de este bloque.');
  }
  return next;
}

function tenantCapabilities(tenant) {
  if (tenant?.billingEnforcement !== true) return null;
  return normalizeCapabilitiesV1(tenant.commercialCapabilities, tenant.businessType);
}

function hasPlanFeature(tenant, feature) {
  if (tenant?.billingEnforcement !== true) return true;
  let capabilities;
  try { capabilities = tenantCapabilities(tenant); } catch { return false; }
  if (feature === 'reports.basic') return capabilities.features.reports.basic;
  return false;
}

async function adjustUsage(tx, root, tenant, kind, delta) {
  if (tenant?.billingEnforcement !== true || delta === 0) return;
  const capabilities = tenantCapabilities(tenant);
  const adapters = {
    users: { field: 'activeUsers', limit: capabilities.limits.activeUsers },
    products: { field: 'activeProducts', limit: capabilities.limits.activeProducts },
    branches: { field: 'activeBranches', limit: capabilities.limits.activeBranches },
  };
  const selected = adapters[kind];
  if (!selected || !Number.isSafeInteger(delta)) throw new HttpsError('internal', 'No se pudo validar el uso contratado.');
  const ref = root.collection('commercialUsage').doc('active');
  const snapshot = await tx.get(ref);
  if (!snapshot.exists) throw new HttpsError('failed-precondition', 'El contador de capacidades no está inicializado; solicita revisión antes de continuar.');
  const current = snapshot.data()?.[selected.field];
  if (!Number.isSafeInteger(current) || current < 0) throw new HttpsError('failed-precondition', 'El contador de capacidades es inconsistente; no se aplicó la operación.');
  const next = current + delta;
  if (next < 0) throw new HttpsError('failed-precondition', 'El contador de uso requiere conciliación; no se aplicó la operación.');
  if (delta > 0 && next > selected.limit) throw new HttpsError('resource-exhausted', `El plan alcanzó el límite de ${kind === 'users' ? 'usuarios activos' : kind === 'products' ? 'productos activos' : 'sucursales'}.`);
  tx.set(ref, { [selected.field]: next, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
}

async function adjustProductUsage(tx, root, tenant, delta) {
  return adjustUsage(tx, root, tenant, 'products', delta);
}

function initialUsage() {
  return { activeUsers: 1, activeProducts: 0, activeBranches: 1, updatedAt: FieldValue.serverTimestamp() };
}

module.exports = {
  CAPABILITIES_VERSION, MAX_ACTIVE_USERS, MAX_ACTIVE_PRODUCTS, MAX_ACTIVE_BRANCHES,
  normalizeCapabilitiesV1, normalizeCapabilityAdjustments, applyCapabilityAdjustments,
  tenantCapabilities, hasPlanFeature, adjustUsage, adjustProductUsage, initialUsage,
};
