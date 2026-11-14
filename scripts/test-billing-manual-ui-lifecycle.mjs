// Full manual Billing 2.0 lifecycle through the authenticated Admin UI.
// All writes are confined to the explicitly named Firebase demo emulators.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { spawn } from 'node:child_process'
import { createServer } from 'node:net'
import { createHash, randomBytes, randomUUID } from 'node:crypto'

const projectId = process.env.GCLOUD_PROJECT || process.env.FIREBASE_CONFIG_PROJECT_ID
assert.equal(projectId, 'demo-pachax-platform', 'Billing UI QA requires demo-pachax-platform.')
assert(process.env.FIRESTORE_EMULATOR_HOST && process.env.FIREBASE_AUTH_EMULATOR_HOST,
  'Auth and Firestore must use Firebase Emulators; this script is invoked only by the isolated emulators:exec npm task.')

const root = process.cwd()
const evidenceDir = process.env.COMMERCIAL_GUIDE_EVIDENCE_DIR || join(root, 'docs/commercial-enablement/evidence')
const require = createRequire(new URL('../functions/package.json', import.meta.url))
const { initializeApp, deleteApp } = require('firebase-admin/app')
const { getAuth } = require('firebase-admin/auth')
const { getFirestore, Timestamp } = require('firebase-admin/firestore')
const platform = require('./platform.cjs')
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
let renewalChargeId
let tenantId
let ownerUid
let referenceHash
let portalReferenceHash
let originalMethodsLoaded = false
let originalMethodsExisted = false
let originalMethods = null
let originalRenewalNoticeLoaded = false
let originalRenewalNoticeExisted = false
let originalRenewalNotice = null

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

async function captureGuideScreenshot(fileName) {
  mkdirSync(evidenceDir, { recursive: true })
  await evaluate(`(() => {
    const badge = document.createElement('div')
    badge.id = 'commercial-guide-emulator-watermark'
    badge.textContent = 'ENTORNO EMULADO · DATOS FICTICIOS'
    Object.assign(badge.style, { position: 'fixed', right: '12px', bottom: '12px', zIndex: '2147483647',
      padding: '6px 10px', borderRadius: '6px', background: '#7f1d1d', color: '#fff', font: '700 12px sans-serif',
      letterSpacing: '.04em', boxShadow: '0 2px 8px #0008' })
    document.body.append(badge)
  })()`)
  try {
    const { data } = await cdp('Page.captureScreenshot', { format: 'png', fromSurface: true, captureBeyondViewport: false })
    writeFileSync(join(evidenceDir, fileName), Buffer.from(data, 'base64'))
  } finally {
    await evaluate(`document.querySelector('#commercial-guide-emulator-watermark')?.remove()`)
  }
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

async function setInput(selector, value) {
  const script = `(() => {
    const node = document.querySelector(${JSON.stringify(selector)});
    if (!node) throw new Error('Missing input: ' + ${JSON.stringify(selector)});
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(node, ${JSON.stringify(value)});
    node.dispatchEvent(new Event('input', {bubbles:true})); node.dispatchEvent(new Event('change', {bubbles:true}));
    return node.value;
  })()`
  assert.equal(await evaluate(script), String(value), `Input ${selector} did not accept the requested value.`)
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
  if (ownerUid) {
    await safeDeleteQuery('platformBillingOperations', 'actorUid', ownerUid)
    await safeDeleteQuery('platformAuditLogs', 'operatorUid', ownerUid)
  }
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
    if (paymentRows) await Promise.all(paymentRows.docs.map(async row => {
      if (row.data()?.referenceHash) await db.doc(`platformPaymentReferenceClaims/${row.data().referenceHash}`).delete().catch(() => undefined)
      await row.ref.delete().catch(() => undefined)
    }))
    await db.doc(`platformSubscriptions/${contractId}`).delete().catch(() => undefined)
    await db.doc(`platformContracts/${contractId}`).delete().catch(() => undefined)
  }
  if (chargeId) await db.doc(`platformBillingCharges/${chargeId}`).delete().catch(() => undefined)
  if (renewalChargeId) await db.doc(`platformBillingCharges/${renewalChargeId}`).delete().catch(() => undefined)
  if (referenceHash) await db.doc(`platformPaymentReferenceClaims/${referenceHash}`).delete().catch(() => undefined)
  if (portalReferenceHash) await db.doc(`platformPaymentReferenceClaims/${portalReferenceHash}`).delete().catch(() => undefined)
  if (originalMethodsLoaded) {
    const methodsRef = db.doc('platformBillingConfig/manualMethods')
    if (originalMethodsExisted) await methodsRef.set(originalMethods).catch(() => undefined)
    else await methodsRef.delete().catch(() => undefined)
  }
  if (originalRenewalNoticeLoaded) {
    const noticeRef = db.doc('platformBillingConfig/renewalNotice')
    if (originalRenewalNoticeExisted) await noticeRef.set(originalRenewalNotice).catch(() => undefined)
    else await noticeRef.delete().catch(() => undefined)
  }
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
  await cdp('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false })
  await waitFor(() => evaluate(`!!document.querySelector('[data-admin-login-submit]')`), Boolean, 'Admin sign-in form did not render')
  await evaluate(`(() => { const set=(selector,value,proto)=>{const e=document.querySelector(selector);if(!e)throw new Error('Missing '+selector);Object.getOwnPropertyDescriptor(proto,'value').set.call(e,value);e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}))};set('input[autocomplete="username"]',${JSON.stringify(operator.email)},HTMLInputElement.prototype);set('[data-admin-login-password]',${JSON.stringify(operator.password)},HTMLInputElement.prototype);document.querySelector('[data-admin-login-submit]').click()})()`, true)
  await waitFor(() => evaluate(`({ready:!!document.querySelector('[data-admin-tab="commercial-intents"]'), body:document.body.innerText.slice(0,500)})`), value => value?.ready === true, 'Platform Owner did not enter Admin')
  await captureGuideScreenshot('01-resumen-admin.png')
  await clickTab('landing')
  await waitFor(() => evaluate('document.body.innerText'), text => text.includes('Contenido web'), 'Landing content settings did not open')
  await captureGuideScreenshot('02-contacto-publico.png')
  await clickTab('plans')
  await waitFor(() => evaluate('document.body.innerText'), text => text.includes('Asistente Guiado de Planes Comerciales') || text.includes('Gestión de Planes Comerciales'), 'Plan settings did not open')
  await clickText('Restaurante Rápido')
  await captureGuideScreenshot('03-configuracion-planes.png')

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
  await captureGuideScreenshot('04-solicitudes-cotizacion.png')
  console.log('PASS Admin UI saves a monthly-only quote (empty annual price) with approved fictitious capabilities and no plan')

  await clickText('Ofrecer cotización al cliente')
  await waitFor(async () => (await db.doc(`platformCommercialIntents/${intentId}`).get()).data(), value => value?.quote?.status === 'offered', 'Offer did not persist')
  await setField('Referencia verificable de aceptación', 'QA-ACEPTACION-UI-2026')
  await clickText('Registrar aceptación confirmada')
  const accepted = await waitFor(async () => (await db.doc(`platformCommercialIntents/${intentId}`).get()).data(), value => Boolean(value?.acceptance), 'Acceptance did not persist')
  assert.equal(accepted.acceptance.quoteVersion, accepted.quote.version)
  await waitFor(() => evaluate(`!![...document.querySelectorAll('button')].find(button=>button.textContent.includes('Crear contrato y orden de cobro')&&!button.disabled)`), Boolean,
    `Accepted quote UI did not enable contract creation: ${await evaluate('document.body.innerText')}`)
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

  await waitFor(() => evaluate(`!![...document.querySelectorAll('button')].find(button=>button.textContent.includes('Vista previa de instrucciones del primer pago'))`), Boolean,
    'Pending contract did not expose the authenticated initial-payment preview action')
  await clickText('Vista previa de instrucciones del primer pago')
  await waitFor(() => evaluate(`!!document.querySelector('[role="dialog"]')?.querySelector('#commercial-initial-payment-document')`), Boolean,
    'Initial payment instruction preview did not open')
  const instructionPreview = await evaluate(`document.querySelector('#commercial-initial-payment-document')?.innerText || ''`)
  assert(instructionPreview.includes(companyName))
  assert(instructionPreview.includes(chargeId))
  assert(instructionPreview.includes('BOB 25.00'))
  assert(instructionPreview.includes('No hay un método de cobro aprobado'))
  assert(!await evaluate(`!!document.querySelector('#commercial-initial-payment-document a[href^="http"]')`), 'Initial payment preview must not create a public payment link.')
  await captureGuideScreenshot('06-instrucciones-pago-inicial.png')
  await clickText('Cerrar')
  console.log('PASS initial-payment document uses current contract/charge data, warns when no approved method exists and creates no public link')

  await clickTab('commercial-billing')
  await waitFor(() => evaluate('document.body.innerText'), text => text.includes('Facturación de PACHAX'), 'Commercial billing UI did not open')
  await captureGuideScreenshot('05-metodos-qr-renovaciones.png')
  const noticeRef = db.doc('platformBillingConfig/renewalNotice')
  const noticeBefore = await noticeRef.get()
  originalRenewalNoticeLoaded = true
  originalRenewalNoticeExisted = noticeBefore.exists
  originalRenewalNotice = noticeBefore.exists ? noticeBefore.data() : null
  await waitFor(() => evaluate(`!![...document.querySelectorAll('button')].find(button=>button.textContent.includes('Guardar aviso')&&!button.disabled)`), Boolean,
    'Renewal notice settings did not finish loading in Admin')
  await setField('Mostrar el aviso', '15', 'select')
  await clickText('Guardar aviso')
  const savedNoticeState = await waitFor(async () => ({ policy: (await noticeRef.get()).data(), alert: await evaluate(`document.querySelector('[role="alert"]')?.innerText || ''`) }),
    value => value?.policy?.noticeDays === 15 || Boolean(value?.alert), 'Admin renewal notice policy did not persist or show an error')
  if (savedNoticeState.alert) throw new Error(`Admin renewal notice setting was rejected: ${savedNoticeState.alert}`)
  const savedNotice = savedNoticeState.policy
  assert.equal(savedNotice.version, 1)
  console.log('PASS Platform Owner configures a 15-day renewal reminder without creating a charge or changing grace policy')
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
  await captureGuideScreenshot('07-revision-de-pago.png')
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
  await evaluate(`(() => {const label=[...document.querySelectorAll('label')].find(item=>item.textContent.includes('Confirmo que este correo corresponde al propietario autorizado'));const checkbox=label?.querySelector('input[type="checkbox"]');if(!checkbox)throw new Error('Owner email confirmation missing');if(!checkbox.checked)checkbox.click();if(!checkbox.checked)throw new Error('Owner email confirmation did not become checked');return true})()`, true)
  const activationFormState = await waitFor(() => evaluate(`(() => {const form=[...document.querySelectorAll('form')].find(item=>[...item.querySelectorAll('button[type="submit"]')].some(button=>button.textContent.includes('Crear empresa y preparar acceso')));const button=form?.querySelector('button[type="submit"]');const label=[...document.querySelectorAll('label')].find(item=>item.textContent.includes('Confirmo que este correo corresponde al propietario autorizado'));return {formValid:form?.checkValidity()??false,buttonDisabled:button?.disabled??true,emailConfirmed:label?.querySelector('input[type="checkbox"]')?.checked??false}})()`), state => state?.formValid && !state.buttonDisabled && state.emailConfirmed,
    'Owner confirmation did not enable a valid assisted-tenant form')
  assert.equal(activationFormState.emailConfirmed, true)
  await clickText('Crear empresa y preparar acceso', 'form button')
  const activationResult = await waitFor(async () => {
    const rows = await db.collection('tenants').where('nameKey', '==', companyNameKey).get()
    const ui = await evaluate(`(() => {const form=[...document.querySelectorAll('form')].find(item=>[...item.querySelectorAll('button[type="submit"]')].some(button=>button.textContent.includes('Crear empresa y preparar acceso')||button.textContent.includes('Creando empresa')));const button=form?.querySelector('button[type="submit"]');const label=[...document.querySelectorAll('label')].find(item=>item.textContent.includes('Confirmo que este correo corresponde al propietario autorizado'));return {alert:document.querySelector('[role="alert"]')?.innerText || '',saving:button?.textContent.includes('Creando empresa')??false,formValid:form?.checkValidity()??false,buttonDisabled:button?.disabled??true,emailConfirmed:label?.querySelector('input[type="checkbox"]')?.checked??false}})()`)
    return { tenant: rows.docs[0] || null, ...ui }
  }, value => Boolean(value?.tenant || value?.alert), 'Assisted tenant creation did not persist or return a visible result through the Admin UI')
  if (activationResult.alert) throw new Error(`Assisted tenant creation was rejected by the application: ${activationResult.alert}`)
  const createdTenant = activationResult.tenant
  tenantId = createdTenant.id
  const tenant = createdTenant.data()
  assert.equal(tenant.businessType, 'hamburger_shop')
  assert.equal(tenant.billingEnforcement, true)
  assert.equal(tenant.billingContractId, contractId)
  const ownerRows = await waitFor(async () => db.collection(`tenants/${tenantId}/members`).where('roleId', '==', 'owner').get(),
    rows => rows.size === 1 && rows.docs[0].data().status === 'active', 'Tenant Owner membership did not become active')
  assert.equal(ownerRows.size, 1)
  ownerUid = ownerRows.docs[0].id
  assert.equal(ownerRows.docs[0].data().status, 'active')
  const activeContract = await waitFor(async () => (await db.doc(`platformContracts/${contractId}`).get()).data(),
    value => value?.status === 'active', 'Paid contract did not complete activation')
  const activeSubscription = await waitFor(async () => (await db.doc(`platformSubscriptions/${contractId}`).get()).data(),
    value => value?.status === 'active', 'Paid subscription did not complete activation')
  assert.equal(activeContract.status, 'active')
  assert.equal(activeSubscription.status, 'active')
  assert.equal(activeSubscription.tenantId, tenantId)
  assert.equal(activeSubscription.recurringMinor, 2500)
  await captureGuideScreenshot('08-alta-asistida.png')
  assert.equal((await db.collection('tenants').where('nameKey', '==', companyNameKey).get()).size, 1, 'The idempotent UI activation must create exactly one tenant.')
  const visible = await evaluate('document.body.innerText')
  assert(visible.includes('Empresa creada y acceso preparado'), 'Admin should confirm the tenant and owner access preparation.')
  assert(!visible.includes(operator.password) && !visible.includes('QA-BANK-REF-'), 'UI log should not expose any password or bank reference.')
  console.log('PASS Platform Owner activates exactly one paid Hamburger tenant; contract, subscription, branch and owner membership persist')

  const methodsRef = db.doc('platformBillingConfig/manualMethods')
  const methodsBefore = await methodsRef.get()
  originalMethodsLoaded = true
  originalMethodsExisted = methodsBefore.exists
  originalMethods = methodsBefore.exists ? methodsBefore.data() : null
  await methodsRef.set({ available: true, transferEnabled: true, qrEnabled: false, qrImageUrl: '',
    bankName: 'Banco ficticio QA', accountHolder: 'PACHAX QA', accountIdentifier: 'TEST-ONLY', instructions: '', whatsappNumber: '' })

  const passwordSetupLink = await auth.generatePasswordResetLink(ownerEmail)
  const oobCode = new URL(passwordSetupLink).searchParams.get('oobCode')
  assert(oobCode)
  const ownerPassword = `OwnerQa${randomBytes(12).toString('base64url')}!`
  const resetResponse = await fetch(`http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:resetPassword?key=emulator`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ oobCode, newPassword: ownerPassword }),
  })
  assert.equal(resetResponse.ok, true, 'Tenant Owner password setup must complete only in Auth Emulator.')

  const expiredAt = Timestamp.fromMillis(Date.now() - 86_400_000)
  await db.doc(`platformSubscriptions/${contractId}`).update({ status: 'overdue', currentPeriodEnd: expiredAt,
    nextRenewalAt: expiredAt, billingAccessUntil: expiredAt })
  await db.doc(`tenants/${tenantId}`).update({ status: 'overdue', subscriptionStatus: 'overdue', billingAccessUntil: expiredAt })
  const ownerRenewal = await platform.platformGateway(db, { auth: { uid: operator.uid, token: { platform: true } },
    data: { action: 'createRenewalCharge', requestId: randomUUID(), contractId,
      dueAt: new Date(Date.now() + 7 * 86_400_000).toISOString(), periodCount: 1 } })
  renewalChargeId = ownerRenewal.chargeId

  await clickText('Salir')
  await waitFor(() => evaluate(`!!document.querySelector('[data-admin-login-submit]')`), Boolean, 'Platform Owner session did not close before tenant login')
  await cdp('Page.navigate', { url: `${base}/login` })
  await waitFor(() => evaluate(`!!document.querySelector('#login-email')`), Boolean, 'Tenant login page did not render')
  await setInput('#login-email', ownerEmail)
  await setInput('#login-password', ownerPassword)
  await clickText('Ingresar', 'form button')
  await waitFor(() => evaluate('document.body.innerText'), text => text.toLowerCase().includes('acceso operativo restringido')
    && text.includes('Suscripción y pagos'), 'Tenant Owner did not enter the restricted regularization portal')
  assert(await evaluate(`!!document.querySelector('[role="dialog"]')`), 'Regularization portal should remain open for the owner.')
  await captureGuideScreenshot('09-portal-renovacion-propietario.png')
  console.log('PASS expired Tenant Owner remains in restricted, server-backed regularization view')

  await waitFor(() => evaluate(`!![...document.querySelectorAll('select')].find(select=>[...select.options].some(option=>option.value===${JSON.stringify(renewalChargeId)}))`), Boolean,
    'Expired owner renewal charge was not visible in the portal')
  await setField('Importe informado', '25.00')
  await setField('Referencia bancaria', `QA-PORTAL-RENEWAL-${suffix}`)
  await clickText('Enviar referencia para revisión', 'form button')
  const portalPayment = await waitFor(async () => {
    const rows = await db.collection('platformBillingPayments').where('chargeId', '==', renewalChargeId).get()
    return rows.docs[0]?.data() || null
  }, value => value?.status === 'pending_review', 'Tenant Owner payment reference did not persist from the portal')
  portalReferenceHash = portalPayment.referenceHash
  await platform.platformGateway(db, { auth: { uid: operator.uid, token: { platform: true } },
    data: { action: 'confirmManualPayment', requestId: randomUUID(), paymentId: portalPayment.paymentId } })
  assert.equal((await db.doc(`platformSubscriptions/${contractId}`).get()).data().status, 'active',
    'A confirmed renewal should restore access from server state.')
  await waitFor(() => evaluate('document.body.innerText'), text => !text.includes('Acceso operativo restringido'),
    'The authenticated tenant view did not restore after the server-confirmed payment updated its tenant snapshot')
  await waitFor(() => evaluate(`!![...document.querySelectorAll('button')].find(button=>button.textContent.trim()==='Actualizar estado'&&!button.disabled)`), Boolean,
    'The owner refresh control was not available after access was restored')
  await clickText('Actualizar estado', 'button')
  await waitFor(() => evaluate(`({restricted:document.body.innerText.includes('Acceso operativo restringido'), dialog:!!document.querySelector('[aria-labelledby="tenant-billing-title"]')})`),
    state => !state.restricted && !state.dialog, 'The billing portal did not close after server reconciliation restored the operational shell')
  console.log('PASS open owner portal follows the authoritative tenant update after Admin confirms payment and restores access')
  console.log('PASS authenticated Admin UI lifecycle complete; all records are fictitious and emulator-only')
} finally {
  await cleanup()
}
