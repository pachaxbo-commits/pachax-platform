const test = require('node:test');
const assert = require('node:assert/strict');
const { assertPublicCommercialInterestEnabled, submitPublicCommercialInterest } = require('../commercialOnboarding.cjs');

test('public commercial intake remains closed server-side until an explicit code release', async () => {
  assert.throws(
    () => assertPublicCommercialInterestEnabled(),
    error => error.code === 'failed-precondition' && /aún no está habilitada/.test(error.message),
  );

  let firestoreOperations = 0;
  const db = {
    doc() { firestoreOperations += 1; throw new Error('Firestore must not be touched while intake is closed'); },
    runTransaction() { firestoreOperations += 1; throw new Error('Transaction must not run while intake is closed'); },
  };

  await assert.rejects(
    () => submitPublicCommercialInterest(db, { data: { consent: true } }, 'x'.repeat(32), { emulator: false }),
    error => error.code === 'failed-precondition' && /aún no está habilitada/.test(error.message),
  );
  assert.equal(firestoreOperations, 0);
  assert.equal(assertPublicCommercialInterestEnabled({ emulator: true }), true);
});
