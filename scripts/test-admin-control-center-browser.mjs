// Authenticated Admin UI smoke using only Firebase Emulators and fictitious operator data.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { spawn } from 'node:child_process'
import { createServer } from 'node:net'

const projectId = process.env.GCLOUD_PROJECT || process.env.FIREBASE_CONFIG_PROJECT_ID
assert.match(projectId || '', /^demo-[a-z0-9-]+$/, 'Admin browser QA is restricted to a demo Firebase project.')
assert(process.env.FIRESTORE_EMULATOR_HOST && process.env.FIREBASE_AUTH_EMULATOR_HOST, 'Auth and Firestore must use emulators.')
const root = process.cwd()
const require = createRequire(new URL('../functions/package.json', import.meta.url))
const { initializeApp, deleteApp } = require('firebase-admin/app')
const { getAuth } = require('firebase-admin/auth')
const { getFirestore, Timestamp } = require('firebase-admin/firestore')
const suffix = Date.now().toString(36)
const operator = { uid: `admin-ui-owner-${suffix}`, email: `admin-ui-owner-${suffix}@example.test`, password: 'AdminEmulatorOnly2026!' }
const tenantId = `admin-ui-tenant-date-${suffix}`
const app = initializeApp({ projectId }, `admin-ui-browser-${suffix}`)
const auth = getAuth(app)
const db = getFirestore(app)
const tenantRef = db.doc(`tenants/${tenantId}`)
const refsToRestore = ['platformTemplates/restaurant', 'platformConfig/publicLanding', 'platformConfig/publicCommercialCatalogMeta', 'platformConfig/publicCommercialCatalog']
const saved = new Map()
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
const listenEphemeralPort = async () => {
  const server = createServer()
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const port = server.address().port
  await new Promise(resolve => server.close(resolve))
  return port
}
let chromeProcess
let viteProcess
let browserProfile
let socket
let socketOpen = false
let sequence = 0
const pending = new Map()

async function snapshot(ref) {
  const value = await ref.get()
  return value.exists ? value.data() : null
}
async function restore(path, value) {
  const ref = db.doc(path)
  if (value === null) await ref.delete()
  else await ref.set(value)
}
async function send(method, params = {}) {
  assert(socketOpen, 'Chrome CDP is not connected.')
  const id = ++sequence
  const response = new Promise((resolve, reject) => pending.set(id, { resolve, reject }))
  socket.send(JSON.stringify({ id, method, params }))
  return response
}
async function evaluate(expression, userGesture = false) {
  const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true, userGesture })
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text)
  return result.result.value
}
async function waitFor(read, predicate, message, timeout = 12000) {
  const start = Date.now()
  let value
  while (Date.now() - start < timeout) {
    value = await read()
    if (predicate(value)) return value
    await sleep(120)
  }
  throw new Error(`${message}: ${JSON.stringify(value)}`)
}

try {
  for (const path of refsToRestore) saved.set(path, await snapshot(db.doc(path)))
  await auth.createUser({ uid: operator.uid, email: operator.email, password: operator.password })
  await auth.setCustomUserClaims(operator.uid, { platform: true, platformRole: 'platform_owner' })
  await db.doc(`platformOperators/${operator.uid}`).set({ uid: operator.uid, role: 'platform_owner', active: true, email: operator.email })
  assert.equal((await tenantRef.get()).exists, false, 'Unique emulator-only tenant fixture must not already exist.')
  await tenantRef.create({
    tenantId,
    name: 'QA Registro Timestamp',
    nameKey: `qa registro timestamp ${suffix}`,
    businessType: 'restaurant_pos',
    status: 'active',
    subscriptionStatus: 'trial',
    userCount: 1,
    branchCount: 1,
    createdAt: Timestamp.fromDate(new Date('2024-02-03T12:00:00.000Z')),
  })

  const vitePort = await listenEphemeralPort()
  const base = `http://127.0.0.1:${vitePort}`
  viteProcess = spawn(process.execPath, [join(root, 'node_modules/vite/bin/vite.js'), '--mode', 'emulator', '--host', '127.0.0.1', '--port', String(vitePort), '--strictPort'], { cwd: root, stdio: 'ignore' })
  await waitFor(async () => { try { return (await fetch(base)).status } catch { return 0 } }, status => status === 200, 'Vite emulator server did not start')

  const chrome = [process.env.CHROME_BIN, 'C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe'].filter(Boolean).find(existsSync)
  assert(chrome, 'Chrome not found; set CHROME_BIN.')
  const debugPort = await listenEphemeralPort()
  browserProfile = mkdtempSync(join(tmpdir(), 'pachax-admin-control-center-'))
  chromeProcess = spawn(chrome, ['--headless=new', '--disable-gpu', '--no-sandbox', `--remote-debugging-port=${debugPort}`, '--remote-allow-origins=*', `--user-data-dir=${browserProfile}`, `${base}/admin/login`], { stdio: 'ignore' })
  let page
  for (let attempt = 0; attempt < 60; attempt++) {
    await sleep(150)
    try { page = (await (await fetch(`http://127.0.0.1:${debugPort}/json`)).json()).find(item => item.type === 'page' && item.webSocketDebuggerUrl); if (page) break } catch { /* Chrome is starting. */ }
  }
  assert(page?.webSocketDebuggerUrl, 'Chrome CDP page was not found.')
  socket = new WebSocket(page.webSocketDebuggerUrl)
  await new Promise((resolve, reject) => { socket.onopen = () => { socketOpen = true; resolve() }; socket.onerror = reject })
  socket.onmessage = event => {
    const message = JSON.parse(event.data)
    if (!pending.has(message.id)) return
    const operation = pending.get(message.id)
    pending.delete(message.id)
    message.error ? operation.reject(new Error(JSON.stringify(message.error))) : operation.resolve(message.result)
  }
  await send('Page.enable')
  await send('Runtime.enable')

  await waitFor(() => evaluate(`!!document.querySelector('[data-admin-login-submit]')`), Boolean, 'Admin login form did not render')
  await evaluate(`(() => {
    const set=(selector,value)=>{const element=document.querySelector(selector);if(!element)throw new Error('Missing '+selector);const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;setter.call(element,value);element.dispatchEvent(new Event('input',{bubbles:true}));element.dispatchEvent(new Event('change',{bubbles:true}));};
    set('input[autocomplete="username"]',${JSON.stringify(operator.email)});
    set('[data-admin-login-password]',${JSON.stringify(operator.password)});
    document.querySelector('[data-admin-login-submit]').click();
  })()`, true)
  await waitFor(() => evaluate(`!!document.querySelector('[data-admin-tab="templates"]')`), Boolean, 'Platform Owner did not enter Admin')
  await evaluate(`document.querySelector('[data-admin-tab="templates"]').click()`, true)
  await waitFor(() => evaluate('document.body.innerText'), text => text.includes('Gestión de Plantillas Comerciales'), 'Template management section did not open')

  for (const [width, height, mobile] of [[390, 844, true], [1440, 900, false]]) {
    await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile })
    const layout = await evaluate(`({width:innerWidth,scrollWidth:document.documentElement.scrollWidth,overflow:document.documentElement.scrollWidth-innerWidth,section:document.body.innerText.includes('Gestión de Plantillas Comerciales')})`)
    assert(layout.section && layout.overflow < 12, `Admin layout overflow at ${width}x${height}: ${JSON.stringify(layout)}`)
    console.log(`PASS Admin UI viewport ${width}x${height}, horizontal overflow ${layout.overflow}px`)
  }

  const fieldSet = await evaluate(`(() => {const label=[...document.querySelectorAll('label')].find(item=>item.textContent.includes('Nombre comercial'));const input=label?.parentElement?.querySelector('input');if(!input)throw new Error('Commercial name input missing');const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;setter.call(input,'Restaurante QA Admin UI');input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));return true})()`)
  assert(fieldSet)
  await evaluate(`([...document.querySelectorAll('button')].find(item=>item.textContent.includes('Guardar cambios en plantilla'))).click()`, true)
  const savedTemplate = await waitFor(async () => snapshot(db.doc('platformTemplates/restaurant')), value => value?.commercialName === 'Restaurante QA Admin UI', 'Admin form save did not persist to the Firestore Emulator')
  assert.equal(savedTemplate.demoRoute, '/demo/restaurant')
  assert.equal(savedTemplate.primaryActionLabel, 'Solicitar implementación')
  assert(Number.isSafeInteger(savedTemplate.revision) && savedTemplate.revision > 0)
  await waitFor(() => evaluate('document.body.innerText'), text => text.includes('Cambios guardados en Firestore'), 'Admin did not confirm successful save')
  console.log('PASS Chrome authenticated owner edits a template; canonical route, CTA and revision persist server-side')

  await evaluate(`document.querySelector('[data-admin-tab="clients"]').click()`, true)
  const tenantList = await waitFor(() => evaluate('document.body.innerText'), text => text.includes('QA Registro Timestamp'), 'Admin tenant list did not render the emulator fixture')
  assert(tenantList.includes('2024-02-03'), 'Tenant list did not format the Firestore createdAt timestamp.')
  console.log('PASS Chrome authenticated owner lists the fictitious emulator tenant and formats its Firestore createdAt timestamp')
} finally {
  socket?.close()
  chromeProcess?.kill()
  viteProcess?.kill()
  await sleep(300)
  if (browserProfile) { try { rmSync(browserProfile, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }) } catch { /* Chrome may still release its profile. */ } }
  for (const [path, value] of saved) await restore(path, value).catch(() => undefined)
  await tenantRef.delete().catch(() => undefined)
  const audits = await db.collection('platformAuditLogs').where('operatorUid', '==', operator.uid).get().catch(() => null)
  if (audits) await Promise.all(audits.docs.map(item => item.ref.delete().catch(() => undefined)))
  await db.doc(`platformOperators/${operator.uid}`).delete().catch(() => undefined)
  await auth.deleteUser(operator.uid).catch(() => undefined)
  await deleteApp(app)
}
