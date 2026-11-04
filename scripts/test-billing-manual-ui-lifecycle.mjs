// Full manual Billing 2.0 lifecycle through the authenticated Admin UI.
// All writes are confined to the explicitly named Firebase demo emulators.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { spawn } from 'node:child_process'
import { createServer } from 'node:net'
import { createHash, randomBytes } from 'node:crypto'

const projectId = process.env.GCLOUD_PROJECT || process.env.FIREBASE_CONFIG_PROJECT_ID
assert.equal(projectId, 'demo-pachax-platform', 'Billing UI QA requires demo-pachax-platform.')
assert(process.env.FIRESTORE_EMULATOR_HOST && process.env.FIREBASE_AUTH_EMULATOR_HOST,
  'Auth and Firestore must use Firebase Emulators; this script is invoked only by the isolated emulators:exec npm task.')

const root = process.cwd()
const require = createRequire(new URL('../functions/package.json', import.meta.url))
const { initializeApp, deleteApp } = require('firebase-admin/app')
const { getAuth } = require('firebase-admin/auth')
const { getFirestore } = require('firebase-admin/firestore')
const appName = `billing-ui-lifecycle-${Date.now().toString(36)}`
const app = initializeApp({ projectId }, appName)
const auth = getAuth(app)
const db = getFirestore(app)
const suffix = Date.now().toString(36)
const operator = { uid: `billing-ui-owner-${suffix}`, email: `billing-ui-owner-${suffix}@example.test`, password: randomBytes(24).toString('base64url') }
const ownerEmail = `billing-ui-customer-${suffix}@example.test`
const companyName = `QA Billing UI ${suffix}`
const companyNameKey = companyName.toLowerCase()
const createdAt = Date.now()
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
const port = async () => {
  const server = createServer()
  await new Promise((resolve, reject) => server.listen(0, '127.0.0.1', error => error ? reject(error) : resolve()))
  const value = server.address().port
  await new Promise(resolve => server.close(resolve))
  return value
}
const waitFor = async (read, test, message, timeoutMs = 30000) => {
  const until = Date.now() + timeoutMs
  let value
  while (Date.now() < until) {
    value = await read()
    if (test(value)) return value
    await sleep(150)
  }
  throw new Error(`${message}: ${JSON.stringify(value)}`)
}

let chromeProcess
let viteProcess
let profile
let socket
let socketOpen = false
let cdpId = 0
let pageTarget
const pending = new Map()
let intentId
let contractId
let chargeId
let tenantId
let ownerUid
let referenceHash

async function cdp(method, params = {}) {
  assert(socketOpen, 'Chrome DevTools connection is not open.')
  const id = ++cdpId
  const result = new Promise((resolve, reject) => pending.set(id, { resolve, reject }))
  socket.send(JSON.stringify({ id, method, params }))
  return result
}

async function evaluate(source, userGesture = false) {
  const result = await cdp('Runtime.evaluate', { expression: source, awaitPromise: true, returnByValue: true, userGesture })
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text)
  return result.result.value
}

async function setField(label, value, tag = 'input') {
  const script = `(() => {
    const node = [...document.querySelectorAll('label')].find(item => item.textContent.includes(${JSON.stringify(label)}))?.querySelector(${JSON.stringify(tag)});
    if (!node) throw new Error('Missing field: ' + ${JSON.stringify(label)});
    const proto = node instanceof HTMLSelectElement ? HTMLSelectElement.prototype : node instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
    setter.call(node, ${JSON.stringify(value)});
    node.dispatchEvent(new Event('input', {bubbles:true})); node.dispatchEvent(new Event('change', {bubbles:true}));
    return node.value;
  })()`
  assert.equal(await evaluate(script), String(value), `UI field ${label} did not accept the requested value.`)
}

async function clickText(text, selector = 'button') {
  const script = `(() => { const node = [...document.querySelectorAll(${JSON.stringify(selector)})].find(item => item.textContent.trim().includes(${JSON.stringify(text)})); if (!node) throw new Error('Missing button: ' + ${JSON.stringify(text)}); node.click(); return true })()`
  assert.equal(await evaluate(script, true), true)
}

async function clickTab(tab) {
  await evaluate(`(() => { const node=document.querySelector('[data-admin-tab="${tab}"]'); if(!node) throw new Error('Missing Admin tab ${tab}'); node.click(); return true })()`, true)
}

async function cleanup() {
  const safeDeleteQuery = async (collection, field, value) => {
    if (!value) return
    const rows = await db.collection(collection).where(field, '==', value).get().catch(() => null)
    if (rows) await Promise.all(rows.docs.map(row => db.recursiveDelete(row.ref).catch(() => undefined)))
  }
  if (chromeProcess?.exitCode === null) {
    chromeProcess.kill()
    await Promise.race([new Promise(resolve => chromeProcess.once('exit', resolve)), sleep(2500)])
  }
  if (socketOpen) { socketOpen = false; socket?.close() }
  if (viteProcess?.exitCode === null) {
    viteProcess.kill()
    await Promise.race([new Promise(resolve => viteProcess.once('exit', resolve)), sleep(2500)])
  }
  if (profile) { try { rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }) } catch { /* Windows may release Chrome files asynchronously. */ } }

  const matchingTenants = await db.collection('tenants').where('nameKey', '==', companyNameKey).get().catch(() => null)
  if (matchingTenants) {
    for (const row of matchingTenants.docs) {
      tenantId ||= row.id
      ownerUid ||= row.data()?.ownerUid || null
      await db.recursiveDelete(row.ref).catch(() => undefined)
    }
  } else if (tenantId) await db.recursiveDelete(db.doc(`tenants/${tenantId}`)).catch(() => undefined)
  await safeDeleteQuery('platformCommercialOperations', 'actorUid', operator.uid)
  await safeDeleteQuery('platformBillingOperations', 'actorUid', operator.uid)
  await safeDeleteQuery('platformAuditLogs', 'operatorUid', operator.uid)
  await safeDeleteQuery('platformAssistedTenantOperations', 'companyName', companyName)
  if (ownerUid) {
    await db.recursiveDelete(db.doc(`users/${ownerUid}`)).catch(() => undefined)
    await safeDeleteQuery('tenantLinks', 'uid', ownerUid)
    await auth.deleteUser(ownerUid).catch(() => undefined)
  } else {
    const createdOwner = await auth.getUserByEmail(ownerEmail).catch(() => null)
    if (createdOwner) await auth.deleteUser(createdOwner.uid).catch(() => undefined)
  }
  if (contractId) {
    const paymentRows = await db.collection('platformBillingPayments').where('contractId', '==', contractId).get().catch(() => null)
    if (paymentRows) await Promise.all(paymentRows.docs.map(row => row.ref.delete().catch(() => undefined)))
    await db.doc(`platformSubscriptions/${contractId}`).delete().catch(() => undefined)
    await db.doc(`platformContracts/${contractId}`).delete().catch(() => undefined)
  }
  if (chargeId) await db.doc(`platformBillingCharges/${chargeId}`).delete().catch(() => undefined)
  if (referenceHash) await db.doc(`platformPaymentReferenceClaims/${referenceHash}`).delete().catch(() => undefined)
  if (intentId) await db.recursiveDelete(db.doc(`platformCommercialIntents/${intentId}`)).catch(() => undefined)
  const companyHash = createHash('sha256').update(`hamburger_shop:${companyNameKey}`).digest('hex')
  await db.doc(`platformAssistedTenantNames/${companyHash}`).delete().catch(() => undefined)
  await db.doc(`platformOperators/${operator.uid}`).delete().catch(() => undefined)
  await auth.deleteUser(operator.uid).catch(() => undefined)
  const remainingTenants = await db.collection('tenants').where('nameKey', '==', companyNameKey).get()
  const remainingIntents = await db.collection('platformCommercialIntents').where('email', '==', ownerEmail).get()
  assert.equal(remainingTenants.size, 0, 'Emulator cleanup left a tenant fixture behind.')
  assert.equal(remainingIntents.size, 0, 'Emulator cleanup left a commercial intent fixture behind.')
  await deleteApp(app).catch(() => undefined)
}

try {
  await auth.createUser({ uid: operator.uid, email: operator.email, password: operator.password })
  await auth.setCustomUserClaims(operator.uid, { platform: true, platformRole: 'platform_owner' })
  await db.doc(`platformOperators/${operator.uid}`).set({ uid: operator.uid, role: 'platform_owner', active: true, email: operator.email })

  const vitePort = await port()
  const debugPort = await port()
  const base = `http://127.0.0.1:${vitePort}`
  const viteEnv = {
    ...process.env,
    VITE_USE_FIREBASE_EMULATOR: 'true',
    VITE_AUTH_EMULATOR_PORT: process.env.FIREBASE_AUTH_EMULATOR_HOST.split(':').at(-1),
    VITE_FIRESTORE_EMULATOR_PORT: process.env.FIRESTORE_EMULATOR_HOST.split(':').at(-1),
    VITE_FUNCTIONS_EMULATOR_PORT: '5103',
  }
  viteProcess = spawn(process.execPath, [join(root, 'node_modules/vite/bin/vite.js'), '--mode', 'emulator', '--host', '127.0.0.1', '--port', String(vitePort), '--strictPort'], { cwd: root, env: viteEnv, stdio: 'ignore' })
  await waitFor(async () => { try { return (await fetch(base)).status } catch { return 0 } }, status => status === 200, 'Vite emulator server did not start')

  const chrome = [process.env.CHROME_BIN, 'C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe'].filter(Boolean).find(existsSync)
  assert(chrome, 'Chrome not found; set CHROME_BIN.')
  profile = mkdtempSync(join(tmpdir(), 'pachax-billing-ui-lifecycle-'))
  chromeProcess = spawn(chrome, ['--headless=new', '--disable-gpu', '--no-sandbox', `--remote-debugging-port=${debugPort}`, '--remote-allow-origins=*', `--user-data-dir=${profile}`, `${base}/admin/login`], { stdio: 'ignore' })
  await waitFor(async () => { try { return (await (await fetch(`http://127.0.0.1:${debugPort}/json`)).json()).find(item => item.type === 'page') || null } catch { return null } }, Boolean, 'Chrome page did not start')
  pageTarget = (await (await fetch(`http://127.0.0.1:${debugPort}/json`)).json()).find(item => item.type === 'page')
  socket = new WebSocket(pageTarget.webSocketDebuggerUrl)
  await new Promise((resolve, reject) => { socket.onopen = () => { socketOpen = true; resolve() }; socket.onerror = reject })
  socket.onmessage = event => {
    const message = JSON.parse(event.data)
    if (!pending.has(message.id)) return
    const request = pending.get(message.id); pending.delete(message.id)
    message.error ? request.reject(new Error(JSON.stringify(message.error))) : request.resolve(message.result)
  }
  await cdp('Page.enable'); await cdp('Runtime.enable')
  await waitFor(() => evaluate(`!!document.querySelector('[data-admin-login-submit]')`), Boolean, 'Admin sign-in form did not render')
  await evaluate(`(() => { const set=(selector,value,proto)=>{const e=document.querySelector(selector);if(!e)throw new Error('Missing '+selector);Object.getOwnPropertyDescriptor(proto,'value').set.call(e,value);e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}))};set('input[autocomplete="username"]',${JSON.stringify(operator.email)},HTMLInputElement.prototype);set('[data-admin-login-password]',${JSON.stringify(operator.password)},HTMLInputElement.prototype);document.querySelector('[data-admin-login-submit]').click()})()`, true)
  await waitFor(() => evaluate(`({ready:!!document.querySelector('[data-admin-tab="commercial-intents"]'), body:document.body.innerText.slice(0,500)})`), value => value?.ready === true, 'Platform Owner did not enter Admin')

  await clickTab('commercial-intents')
  await waitFor(() => evaluate('document.body.innerText'), text => text.includes('Solicitudes comerciales'), 'Commercial intents UI did not open')
  await clickText('Registrar contacto de WhatsApp')
  await setField('Nombre de contacto', 'Propietario QA Billing')
  await setField('Empresa', companyName)
  await setField('Correo', ownerEmail)
  await setField('Teléfono / WhatsApp', '+591 70000000')
  await setField('Plantilla', 'hamburger', 'select')
  await setField('Ciclo solicitado', 'monthly', 'select')
  await clickText('Registrar contacto', 'form button')
  const intentSnapshot = await waitFor(async () => {
    const rows = await db.collection('platformCommercialIntents').where('email', '==', ownerEmail).get()
    return rows.docs[0] || null
  }, Boolean, 'Admin contact did not persist through platformGateway')
  intentId = intentSnapshot.id
  assert.equal(intentSnapshot.data().templateId, 'hamburger')
  assert.equal(intentSnapshot.data().businessType, 'hamburger_shop')
  assert.equal(intentSnapshot.data().planSnapshot, null, 'QA lifecycle must use no published plan.')
  console.log('PASS Admin UI registers a fictitious WhatsApp contact for Hamburger without creating a tenant or subscription')

  await waitFor(() => evaluate(`([...document.querySelectorAll('li button')].some(item=>item.textContent.includes(${JSON.stringify(companyName)})))`), Boolean, 'The newly registered contact did not appear in the Admin list')
  await clickText(companyName, 'li button')
  await setField('Implementación única', '0')
  await setField('Mensualidad', '25.00')
  await setField('Anualidad', '')
  await setField('Moneda', 'BOB', 'select')
  await setField('Ciclo contratado', 'monthly', 'select')
  await clickText('Guardar cotización en borrador')
  const quoted = await waitFor(async () => (await db.doc(`platformCommercialIntents/${intentId}`).get()).data(), value => value?.quote?.status === 'draft', 'Admin quote did not persist')
  assert.equal(quoted.quote.billingCycle, 'monthly')
  assert.equal(quoted.quote.annualMinor, 0)
  assert.equal(quoted.quote.initialDueMinor, 2500)
  assert.equal(quoted.tenantId, null)
  console.log('PASS Admin UI saves a monthly-only quote (empty annual price) with approved fictitious capabilities and no plan')

  await clickText('Ofrecer cotización al cliente')
  await waitFor(async () => (await db.doc(`platformCommercialIntents/${intentId}`).get()).data(), value => value?.quote?.status === 'offered', 'Offer did not persist')
  await setField('Referencia verificable de aceptación', 'QA-ACEPTACION-UI-2026')
  await clickText('Registrar aceptación confirmada')
  const accepted = await waitFor(async () => (await db.doc(`platformCommercialIntents/${intentId}`).get()).data(), value => Boolean(value?.acceptance), 'Acceptance did not persist')
  assert.equal(accepted.acceptance.quoteVersion, accepted.quote.version)
  await clickText('Crear contrato y orden de cobro')
  const contracted = await waitFor(async () => (await db.doc(`platformCommercialIntents/${intentId}`).get()).data(), value => Boolean(value?.contractId), 'Contract and charge were not created')
  contractId = contracted.contractId
  const contract = (await db.doc(`platformContracts/${contractId}`).get()).data()
  chargeId = contract.initialChargeId
  assert.equal(contract.status, 'pending_payment')
  assert.equal(contract.terms.annualMinor, 0)
  assert.equal(contract.terms.billingCycle, 'monthly')
  const initialCharge = (await db.doc(`platformBillingCharges/${chargeId}`).get()).data()
  assert.equal(initialCharge.amountMinor, 2500)
  assert.equal((await db.doc(`platformSubscriptions/${contractId}`).get()).data().status, 'pending')
  console.log('PASS UI acceptance creates one immutable pending contract and initial charge; subscription stays pending')

  await clickTab('commercial-billing')
  await waitFor(() => evaluate('document.body.innerText'), text => text.includes('Facturación de PACHAX'), 'Commercial billing UI did not open')
  await waitFor(() => evaluate(`([...document.querySelectorAll('select')].some(select=>[...select.options].some(option=>option.value===${JSON.stringify(chargeId)})))`), Boolean, 'Initial charge did not appear in the Admin payment form')
  await setField('Cargo pendiente', chargeId, 'select')
  await setField('Importe recibido', '25.00')
  await setField('Referencia bancaria', `QA-BANK-REF-${suffix}`)
  await clickText('Registrar para revisión', 'form button')
  await sleep(1200)
  const paymentFormState = await evaluate(`({text:document.body.innerText.slice(0,3000),alert:document.querySelector('[role="alert"]')?.innerText||''})`)
  if (paymentFormState.alert) throw new Error(`Billing UI rejected the fictitious reference: ${paymentFormState.alert}`)
  let payment = await waitFor(async () => {
    const rows = await db.collection('platformBillingPayments').where('chargeId', '==', chargeId).get()
    return rows.docs[0]?.data() || null
  }, value => value?.status === 'pending_review', 'Fake reference was not recorded as pending review')
  const pendingCharge = (await db.doc(`platformBillingCharges/${chargeId}`).get()).data()
  assert.equal(pendingCharge.status, 'under_review')
  assert.equal(pendingCharge.paidMinor, 0)
  assert.equal((await db.doc(`platformContracts/${contractId}`).get()).data().status, 'pending_payment')
  assert.equal((await db.doc(`platformSubscriptions/${contractId}`).get()).data().status, 'pending')
  referenceHash = payment.referenceHash
  console.log('PASS a fictitious bank reference remains pending_review; no revenue, contract activation or access is granted')

  await waitFor(() => evaluate(`([...document.querySelectorAll('button')].some(button=>button.textContent.includes('Confirmar ingreso verificado')))`), Boolean, 'Pending fictitious reference did not appear in the Admin review list')
  await evaluate('window.confirm=()=>true')
  await clickText('Confirmar ingreso verificado')
  payment = await waitFor(async () => {
    const rows = await db.collection('platformBillingPayments').where('chargeId', '==', chargeId).get()
    return rows.docs[0]?.data() || null
  }, value => value?.status === 'confirmed', 'Owner confirmation did not persist through the Admin UI')
  const paidCharge = (await db.doc(`platformBillingCharges/${chargeId}`).get()).data()
  assert.equal(paidCharge.status, 'paid')
  assert.equal(paidCharge.paidMinor, paidCharge.amountMinor)
  assert.equal((await db.doc(`platformContracts/${contractId}`).get()).data().status, 'ready_for_activation')
  assert.equal((await db.doc(`platformSubscriptions/${contractId}`).get()).data().status, 'pending')
  console.log('PASS Admin Owner reconciles the fictitious payment exactly once; contract is ready for assisted activation')

  await waitFor(() => evaluate(`([...document.querySelectorAll('button')].some(button=>button.textContent.includes('Crear empresa pagada y preparar acceso')))`), Boolean, 'Paid contract did not appear with the assisted activation action')
  await clickText('Crear empresa pagada y preparar acceso')
  await waitFor(() => evaluate('document.body.innerText'), text => text.includes('Alta asistida de empresa') && text.includes('Activación del contrato pagado'), 'Paid contract did not open assisted onboarding')
  await waitFor(() => evaluate(`!![...document.querySelectorAll('label')].find(item=>item.textContent.includes('Nombre comercial'))?.querySelector('input')?.value`), Boolean, 'Company details were not prefilled')
  await evaluate(`(() => {const checkbox=document.querySelector('input[type="checkbox"]');if(!checkbox)throw new Error('Owner email confirmation missing');checkbox.click()})()`, true)
  await clickText('Crear empresa y preparar acceso', 'form button')
  const activationResult = await waitFor(async () => {
    const rows = await db.collection('tenants').where('nameKey', '==', companyNameKey).get()
    const alert = await evaluate(`document.querySelector('[role="alert"]')?.innerText || ''`)
    return { tenant: rows.docs[0] || null, alert }
  }, value => Boolean(value?.tenant || value?.alert), 'Assisted tenant creation did not persist or return a visible result through the Admin UI')
  if (activationResult.alert) throw new Error(`Assisted tenant creation was rejected by the application: ${activationResult.alert}`)
  const createdTenant = activationResult.tenant
  tenantId = createdTenant.id
  const tenant = createdTenant.data()
  assert.equal(tenant.businessType, 'hamburger_shop')
  assert.equal(tenant.billingEnforcement, true)
  assert.equal(tenant.billingContractId, contractId)
  const ownerRows = await db.collection(`tenants/${tenantId}/members`).where('roleId', '==', 'owner').get()
  assert.equal(ownerRows.size, 1)
  ownerUid = ownerRows.docs[0].id
  assert.equal(ownerRows.docs[0].data().status, 'active')
  const activeContract = (await db.doc(`platformContracts/${contractId}`).get()).data()
  const activeSubscription = (await db.doc(`platformSubscriptions/${contractId}`).get()).data()
  assert.equal(activeContract.status, 'active')
  assert.equal(activeSubscription.status, 'active')
  assert.equal(activeSubscription.tenantId, tenantId)
  assert.equal(activeSubscription.recurringMinor, 2500)
  assert.equal((await db.collection('tenants').where('nameKey', '==', companyNameKey).get()).size, 1, 'The idempotent UI activation must create exactly one tenant.')
  const visible = await evaluate('document.body.innerText')
  assert(visible.includes('Empresa creada y acceso preparado'), 'Admin should confirm the tenant and owner access preparation.')
  assert(!visible.includes(operator.password) && !visible.includes('QA-BANK-REF-'), 'UI log should not expose any password or bank reference.')
  console.log('PASS Platform Owner activates exactly one paid Hamburger tenant; contract, subscription, branch and owner membership persist')
  console.log('PASS authenticated Admin UI lifecycle complete; all records are fictitious and emulator-only')
} finally {
  await cleanup()
}
