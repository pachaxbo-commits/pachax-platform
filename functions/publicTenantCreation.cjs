const { HttpsError } = require('firebase-functions/v2/https');

/**
 * Emulator-only tenant creation keeps isolated QA usable. Deployed callable
 * endpoints are closed until a separate, explicitly authorized assisted flow
 * is implemented. This does not disable Auth sign-in or existing tenant work.
 */
function isLocalEmulatorRuntime() {
  return process.env.FUNCTIONS_EMULATOR === 'true'
    || Boolean(process.env.FIREBASE_EMULATOR_HUB)
    || Boolean(process.env.FIRESTORE_EMULATOR_HOST)
}

function assertPublicTenantCreationClosed({ functionsEmulator = isLocalEmulatorRuntime() } = {}) {
  if (functionsEmulator) return;
  throw new HttpsError('failed-precondition', 'La creación autónoma de empresas está pausada. Contacta a PACHAX para coordinar una implementación asistida.');
}

module.exports = { assertPublicTenantCreationClosed, isLocalEmulatorRuntime };
