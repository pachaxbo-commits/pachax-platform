const { HttpsError } = require('firebase-functions/v2/https');
const { FieldValue } = require('firebase-admin/firestore');

const MARKER_PATH = 'platformBootstrap/firstOwner';

async function reserveFirstOwner(db, uid) {
  await db.runTransaction(async tx => {
    const markerRef = db.doc(MARKER_PATH);
    const marker = await tx.get(markerRef);
    if (marker.exists) {
      const data = marker.data();
      if (data.uid !== uid || !['pending', 'complete'].includes(data.status)) throw new HttpsError('already-exists', 'El bootstrap inicial ya fue reservado.');
      if (data.status === 'complete') throw new HttpsError('already-exists', 'El primer platform_owner ya existe.');
      return;
    }
    const owners = await tx.get(db.collection('platformOperators').where('role', '==', 'platform_owner').limit(1));
    if (!owners.empty) throw new HttpsError('already-exists', 'Ya existe un platform_owner; el bootstrap está cerrado.');
    tx.create(markerRef, { uid, status: 'pending', createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
  });
}

async function finalizeFirstOwner(db, uid) {
  await db.runTransaction(async tx => {
    const markerRef = db.doc(MARKER_PATH);
    const operatorRef = db.doc(`platformOperators/${uid}`);
    const [marker, existingOwner, operator] = await Promise.all([
      tx.get(markerRef),
      tx.get(db.collection('platformOperators').where('role', '==', 'platform_owner').limit(1)),
      tx.get(operatorRef),
    ]);
    if (!marker.exists || marker.data().uid !== uid || marker.data().status !== 'pending') throw new HttpsError('failed-precondition', 'La reserva de bootstrap no es válida.');
    if (!existingOwner.empty && existingOwner.docs[0].id !== uid) throw new HttpsError('already-exists', 'Ya existe otro platform_owner.');
    if (operator.exists && (operator.data().role !== 'platform_owner' || operator.data().active !== true)) throw new HttpsError('already-exists', 'El UID ya pertenece a otro operador Platform.');
    tx.set(operatorRef, {
      uid,
      role: 'platform_owner',
      active: true,
      bootstrap: true,
      createdAt: operator.data()?.createdAt || FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    tx.update(markerRef, { status: 'complete', completedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
    tx.create(db.collection('platformAuditLogs').doc(), {
      operatorUid: uid,
      operatorRole: 'platform_owner',
      action: 'platform.bootstrap.completed',
      tenantId: null,
      reason: 'Creación administrativa del primer propietario Platform',
      resource: `platformOperators/${uid}`,
      metadata: { bootstrap: true },
      createdAt: FieldValue.serverTimestamp(),
    });
  });
}

/**
 * One-use bootstrap. A pending reservation is recoverable only by the same UID;
 * a platform claim alone never grants access without the active protected doc.
 */
async function bootstrapFirstOwner(db, auth, uid) {
  if (typeof uid !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(uid)) throw new HttpsError('invalid-argument', 'UID inválido.');
  const user = await auth.getUser(uid);
  await reserveFirstOwner(db, uid);
  const previousClaims = user.customClaims || {};
  await auth.setCustomUserClaims(uid, { ...previousClaims, platform: true });
  await finalizeFirstOwner(db, uid);
  return { uid, role: 'platform_owner', active: true };
}

module.exports = { MARKER_PATH, bootstrapFirstOwner };
