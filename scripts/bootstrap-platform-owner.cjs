#!/usr/bin/env node
const path = require('node:path');
const { createRequire } = require('node:module');
const requireFunctions = createRequire(path.resolve(__dirname, '../functions/package.json'));
const { initializeApp, applicationDefault } = requireFunctions('firebase-admin/app');
const { getFirestore } = requireFunctions('firebase-admin/firestore');
const { getAuth } = requireFunctions('firebase-admin/auth');
const { bootstrapFirstOwner } = require('../functions/platformBootstrap.cjs');

function argument(name) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : null;
}

async function main() {
  const projectId = argument('project');
  const uid = argument('uid');
  const apply = process.argv.includes('--apply');
  const confirmation = argument('confirm');
  if (!projectId || !uid) throw new Error('Uso: node scripts/bootstrap-platform-owner.cjs --project <projectId> --uid <uid> [--apply --confirm "BOOTSTRAP <projectId> <uid>"]');
  if (!['pachax-platform', 'demo-pachax-platform'].includes(projectId)) throw new Error('Proyecto no permitido para este bootstrap.');
  const expected = `BOOTSTRAP ${projectId} ${uid}`;
  if (!apply) {
    console.log(JSON.stringify({ dryRun: true, projectId, uid, requiredConfirmation: expected }, null, 2));
    return;
  }
  if (confirmation !== expected) throw new Error(`Confirmación incorrecta. Usa exactamente: --confirm "${expected}"`);
  const emulator = Boolean(process.env.FIRESTORE_EMULATOR_HOST && process.env.FIREBASE_AUTH_EMULATOR_HOST);
  const app = initializeApp(emulator ? { projectId } : { projectId, credential: applicationDefault() }, `platform-bootstrap-${Date.now()}`);
  const result = await bootstrapFirstOwner(getFirestore(app), getAuth(app), uid);
  console.log(JSON.stringify({ ...result, projectId, emulator }, null, 2));
}

main().catch(error => { console.error(error.message || error); process.exitCode = 1; });
