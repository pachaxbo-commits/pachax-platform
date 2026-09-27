const { HttpsError } = require('firebase-functions/v2/https');
const { tenantActor, hasPermission, audit, id } = require('./authorization.cjs');
const { saveNightclubMember, registerNightclubCourtesy, cancelNightclubCourtesy } = require('./generated/nightclubCourtesies.js');

const clean = value => JSON.parse(JSON.stringify(value));
const initialState = () => ({ zones: [], tables: [], products: [], accounts: [], shift: null, customers: [], reservations: [], inventory: [], inventoryMovements: [], cashMovements: [], audit: [], members: [], courtesies: [] });
const permissionFor = action => action === 'register' ? 'sales.create' : 'settings.manage';

async function nightclubCourtesyGateway(db, request) {
  const input = request.data || {};
  const action = String(input.action || '');
  if (!['initialize', 'read', 'saveMember', 'register', 'cancel'].includes(action)) throw new HttpsError('invalid-argument', 'Acción de cortesía desconocida.');
  const permission = permissionFor(action);
  const actor = await tenantActor(db, request, permission);
  if (actor.tenant.businessType !== 'nightclub_lounge') throw new HttpsError('failed-precondition', 'La operación requiere la plantilla Discoteca.');
  const stateRef = actor.root.collection('nightclubState').doc('current');
  if (action === 'read') {
    const snapshot = await stateRef.get();
    if (!snapshot.exists) throw new HttpsError('failed-precondition', 'Inicializa la operación de Discoteca antes de registrar cortesías.');
    return { state: snapshot.data() };
  }
  const operationId = id(input.operationId);
  const operationRef = actor.root.collection('nightclubOperations').doc(operationId);
  return db.runTransaction(async tx => {
    const [tenantSnap, memberSnap, operationSnap, stateSnap] = await Promise.all([
      tx.get(actor.root), tx.get(actor.root.collection('members').doc(actor.uid)), tx.get(operationRef), tx.get(stateRef),
    ]);
    if (!hasPermission(tenantSnap.data(), memberSnap.data(), permission) || tenantSnap.data()?.businessType !== 'nightclub_lounge') throw new HttpsError('permission-denied', 'Permiso de Discoteca revocado.');
    if (operationSnap.exists) {
      const done = operationSnap.data();
      if (done.actorUid !== actor.uid || done.action !== action) throw new HttpsError('already-exists', 'El identificador de operación ya está en uso.');
      return { ...done.result, replayed: true };
    }
    const at = new Date().toISOString();
    let next;
    let result;
    if (action === 'initialize') {
      if (stateSnap.exists) return { initialized: true, replayed: true };
      next = initialState();
      result = { initialized: true };
    } else {
      if (!stateSnap.exists) throw new HttpsError('failed-precondition', 'Inicializa la operación de Discoteca.');
      const current = stateSnap.data();
      try {
        if (action === 'saveMember') {
          const member = input.member || {};
          member.id = id(member.id);
          next = saveNightclubMember(current, member, actor.uid, at);
          result = { memberId: member.id };
        } else if (action === 'register') {
          const draft = { ...input.draft, memberId: id(input.draft?.memberId), productId: id(input.draft?.productId) };
          if (draft.accountId) draft.accountId = id(draft.accountId);
          next = registerNightclubCourtesy(current, draft, actor.uid, at);
          result = { courtesyId: next.courtesies.at(-1).id };
        } else {
          const courtesyId = id(input.courtesyId);
          next = cancelNightclubCourtesy(current, courtesyId, actor.uid, at);
          result = { courtesyId };
        }
      } catch (error) {
        throw new HttpsError('failed-precondition', error instanceof Error ? error.message : 'Operación de cortesía inválida.');
      }
    }
    // The existing account, inventory ledger, quotas and courtesy history share one
    // canonical document, so Firestore retries competing cashiers against fresh data.
    tx.set(stateRef, clean(next));
    tx.create(operationRef, { actorUid: actor.uid, action, result, createdAt: at });
    audit(db, tx, actor, `nightclub.courtesy.${action}`, action === 'saveMember' ? result.memberId : result.courtesyId || operationId, null, result);
    return result;
  });
}

module.exports = { nightclubCourtesyGateway, initialState };
