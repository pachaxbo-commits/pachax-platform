import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { spawn } from 'node:child_process'
import { createServer } from 'node:net'

const projectId = process.env.GCLOUD_PROJECT || process.env.FIREBASE_CONFIG_PROJECT_ID
assert.match(projectId || '', /^demo-[a-z0-9-]+$/, 'Template settings QA requires a Firebase demo project.')
assert(process.env.FIRESTORE_EMULATOR_HOST && process.env.FIREBASE_AUTH_EMULATOR_HOST, 'Auth and Firestore emulators are required.')

const require = createRequire(new URL('../functions/package.json', import.meta.url))
const { initializeApp, deleteApp } = require('firebase-admin/app')
const { getAuth } = require('firebase-admin/auth')
const { getFirestore } = require('firebase-admin/firestore')
const { createTenant } = require('../functions/tenants.cjs')
const suffix = Date.now().toString(36)
const app = initializeApp({ projectId }, `template-settings-ui-${suffix}`)
const adminAuth = getAuth(app)
const db = getFirestore(app)
const fixtures = [
  { key: 'retail', type: 'gelateria_weight_cafe', email: `qa-settings-retail-${suffix}@example.test` },
  { key: 'hamburger', type: 'hamburger_shop', email: `qa-settings-hamburger-${suffix}@example.test` },
  { key: 'restaurant', type: 'restaurant_pos', email: `qa-settings-restaurant-${suffix}@example.test` },
]
for (const fixture of fixtures) {
  fixture.uid = `qa-settings-${fixture.key}-${suffix}`
  fixture.password = 'EmulatorOnlySettings2026!'
  fixture.tenantId = ''
}

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
const freePort = async () => {
  const server = createServer()
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const port = server.address().port
  await new Promise(resolve => server.close(resolve))
  return port
}
const waitFor = async (read, predicate, label, timeout = 15000) => {
  const started = Date.now()
  let value
  while (Date.now() - started < timeout) {
    value = await read()
    if (predicate(value)) return value
    await sleep(150)
  }
  throw new Error(`${label}: ${JSON.stringify(value)}`)
}
const stopChrome = async () => {
  if (!chromeProcess) return
  const processToStop = chromeProcess
  const exited = new Promise(resolve => processToStop.once('exit', resolve))
  processToStop.kill()
  await Promise.race([exited, sleep(5000)])
  chromeProcess = undefined
}
const removeProfile = async () => {
  if (!profile) return
  for (let attempt = 0; attempt < 8; attempt++) {
    try { rmSync(profile, { recursive: true, force: true }); profile = undefined; return }
    catch { await sleep(150) }
  }
  throw new Error('Chrome profile could not be removed after the browser closed.')
}

let viteProcess
let chromeProcess
let profile
let socket
let socketOpen = false
let nextId = 0
const pending = new Map()
const send = (method, params = {}) => new Promise((resolve, reject) => {
  const id = ++nextId
  pending.set(id, { resolve, reject })
  socket.send(JSON.stringify({ id, method, params }))
})
const evaluate = async expression => {
  const response = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true, userGesture: true })
  if (response.exceptionDetails) throw new Error(response.exceptionDetails.exception?.description || response.exceptionDetails.text)
  return response.result.value
}
const setInput = (id, value) => evaluate(`(() => {const e=document.getElementById(${JSON.stringify(id)});if(!e)throw new Error('Missing input '+${JSON.stringify(id)});const set=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));return true})()`)
const clickText = (text, root = 'document') => evaluate(`(() => {const root=${root};const e=[...root.querySelectorAll('button')].find(item=>item.innerText.includes(${JSON.stringify(text)}));if(!e)throw new Error('Missing button '+${JSON.stringify(text)});e.click();return true})()`)
const clickExactText = text => evaluate(`(() => {const e=[...document.querySelectorAll('button')].find(item=>item.innerText.trim()===${JSON.stringify(text)});if(!e)throw new Error('Missing exact button '+${JSON.stringify(text)});e.click();return true})()`)

async function openChrome(url) {
  const debugPort = await freePort()
  profile = mkdtempSync(join(tmpdir(), `pachax-template-settings-${suffix}-`))
  const chrome = [process.env.CHROME_BIN, 'C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe'].filter(Boolean).find(existsSync)
  assert(chrome, 'Chrome not found; set CHROME_BIN.')
  chromeProcess = spawn(chrome, ['--headless=new', '--disable-gpu', '--no-sandbox', `--remote-debugging-port=${debugPort}`, '--remote-allow-origins=*', `--user-data-dir=${profile}`, url], { stdio: 'ignore' })
  let page
  for (let attempt = 0; attempt < 80; attempt++) {
    await sleep(150)
    try { page = (await (await fetch(`http://127.0.0.1:${debugPort}/json`)).json()).find(item => item.type === 'page' && item.webSocketDebuggerUrl); if (page) break } catch { /* Chrome is starting. */ }
  }
  assert(page?.webSocketDebuggerUrl, 'Chrome CDP page did not start.')
  socket = new WebSocket(page.webSocketDebuggerUrl)
  await new Promise((resolve, reject) => { socket.onopen = () => { socketOpen = true; resolve() }; socket.onerror = reject })
  socket.onmessage = event => {
    const message = JSON.parse(event.data)
    if (!pending.has(message.id)) return
    const operation = pending.get(message.id)
    pending.delete(message.id)
    message.error ? operation.reject(new Error(JSON.stringify(message.error))) : operation.resolve(message.result)
  }
  await send('Runtime.enable')
  await send('Page.enable')
  return { send, evaluate }
}

async function login(fixture, base) {
  await waitFor(() => evaluate("!!document.querySelector('#login-email')"), Boolean, 'Tenant login did not render')
  await setInput('login-email', fixture.email)
  await setInput('login-password', fixture.password)
  await clickText('Ingresar')
  await waitFor(() => evaluate('document.body.innerText'), text => text.includes(fixture.tenantName), 'Authenticated tenant shell did not load')
  const localUrls = await evaluate(`performance.getEntriesByType('resource').map(entry=>entry.name).filter(name=>/^https?:/.test(name)).map(name=>new URL(name).hostname)`)
  assert(localUrls.every(host => host === '127.0.0.1' || host === 'localhost'), `Unexpected non-emulator network host: ${JSON.stringify(localUrls)}`)
  return base
}

try {
  for (const fixture of fixtures) {
    await adminAuth.createUser({ uid: fixture.uid, email: fixture.email, password: fixture.password, displayName: `QA ${fixture.key}` })
    const result = await createTenant(db, adminAuth, { auth: { uid: fixture.uid, token: {} }, data: { action: 'createTenant', operationId: `settings-${fixture.key}-${suffix}`, name: `Empresa QA ${fixture.key}`, businessType: fixture.type } })
    fixture.tenantId = result.tenantId
    fixture.tenantName = `Empresa QA ${fixture.key}`
    if (fixture.key === 'hamburger') {
      const shiftId = `qa-cash-shift-${suffix}`
      fixture.shiftId = shiftId
      await db.doc(`tenants/${fixture.tenantId}/restaurantOperationalState/main`).set({ tenantId: fixture.tenantId, branchId: 'main', activeShiftId: shiftId })
      await db.doc(`tenants/${fixture.tenantId}/restaurantShifts/${shiftId}`).set({ id: shiftId, tenantId: fixture.tenantId, branchId: 'main', openedAt: new Date().toISOString(), openedBy: fixture.uid, openingFloat: 100 })
    }
  }

  const vitePort = await freePort()
  const base = `http://127.0.0.1:${vitePort}`
  viteProcess = spawn(process.execPath, [join(process.cwd(), 'node_modules/vite/bin/vite.js'), '--mode', 'emulator', '--host', '127.0.0.1', '--port', String(vitePort), '--strictPort'], { cwd: process.cwd(), stdio: 'ignore' })
  await waitFor(async () => { try { return (await fetch(base)).status } catch { return 0 } }, status => status === 200, 'Vite emulator app did not start')

  await openChrome(`${base}/login`)
  await login(fixtures[0], base)
  await clickText('Configuración')
  await waitFor(() => evaluate('document.body.innerText'), text => text.includes('Configuración de la empresa') && text.includes('Impresora de tickets'), 'Retail settings section did not load')
  for (const [width, height, mobile] of [[390, 844, true], [1440, 900, false]]) {
    await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile })
    const layout = await evaluate('({width:innerWidth,scrollWidth:document.documentElement.scrollWidth,overflow:document.documentElement.scrollWidth-innerWidth})')
    assert(layout.overflow < 12, `Retail settings horizontal overflow at ${width}x${height}: ${JSON.stringify(layout)}`)
    console.log(`PASS Retail authenticated owner settings ${width}x${height}, overflow ${layout.overflow}px`)
  }

  const identityInput = await evaluate(`(() => {const label=[...document.querySelectorAll('label')].find(item=>item.textContent.includes('Nombre comercial'));return label?.nextElementSibling?.tagName==='INPUT'})()`)
  assert(identityInput, 'Retail business identity input is missing.')
  await evaluate(`(() => {const label=[...document.querySelectorAll('label')].find(item=>item.textContent.includes('Nombre comercial'));const input=label.nextElementSibling;const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;setter.call(input,'Retail UI Guardado');input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));return true})()`)
  await clickText('Guardar empresa y documentos')
  await waitFor(async () => (await db.doc(`tenants/${fixtures[0].tenantId}`).get()).data()?.businessIdentity?.tradeName, value => value === 'Retail UI Guardado', 'Retail identity save did not persist through tenantGateway')
  await waitFor(() => evaluate('document.body.innerText'), text => text.includes('Retail UI Guardado'), 'Retail header did not reflect persisted identity')

  await clickText('Configurar Nueva Impresora')
  await waitFor(() => evaluate("document.body.innerText.includes('Vincular Impresora')"), Boolean, 'Retail printer editor did not open')
  await evaluate(`(() => {const e=document.querySelector('input[placeholder="Ej. Impresora Barra 1"]');if(!e)throw new Error('Printer name input missing');const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;setter.call(e,'Ticket QA Browser');e.dispatchEvent(new Event('input',{bubbles:true}));return true})()`)
  assert.equal(await evaluate("document.body.innerText.includes('La plantilla usa impresión manual')"), true)
  assert.equal(await evaluate("document.body.innerText.includes('Imprimir automáticamente al crear pedido')"), false)
  assert.equal(await evaluate("document.body.innerText.includes('Imprimir automáticamente al confirmar pago')"), false)
  await clickExactText('Guardar')
  await waitFor(() => evaluate("document.body.innerText.includes('Ticket QA Browser')"), Boolean, 'Retail printer profile did not appear after local save')
  const storedProfile = await evaluate(`Object.entries(localStorage).filter(([key,value])=>key.includes(${JSON.stringify(fixtures[0].tenantId)})&&value.includes('Ticket QA Browser')).length`)
  assert(storedProfile > 0, 'Retail printer profile was not saved in tenant-scoped local storage.')
  await send('Page.reload', { ignoreCache: true })
  await waitFor(() => evaluate('document.body.innerText'), text => text.includes('Retail UI Guardado'), 'Retail identity did not survive refresh')
  await clickText('Configuración')
  await waitFor(() => evaluate('document.body.innerText'), text => text.includes('Ticket QA Browser'), 'Retail device printer profile did not survive refresh')
  console.log('PASS Retail identity persists via tenantGateway; manual printer profile is tenant/branch/device scoped, survives refresh, and automatic controls are absent')

  socket.close()
  socketOpen = false
  await stopChrome()
  await removeProfile()

  await openChrome(`${base}/login`)
  await login(fixtures[1], base)
  await waitFor(() => evaluate('document.body.innerText'), text => text.includes('NUEVO PEDIDO'), 'Hamburger tenant POS did not load')
  await clickExactText('Caja')
  await waitFor(() => evaluate('document.body.innerText'), text => text.includes('Movimientos de caja'), 'Hamburger cash screen did not load')
  assert.equal(await evaluate('document.body.innerText.includes("Ingreso QA en vivo")'), false)
  await db.doc(`tenants/${fixtures[1].tenantId}/restaurantCashMovements/cash-ui-${suffix}`).set({
    id: `cash-ui-${suffix}`, tenantId: fixtures[1].tenantId, branchId: 'main', shiftId: fixtures[1].shiftId,
    type: 'income', category: 'additional_cash', description: 'Ingreso QA en vivo', amount: 7,
    paymentMethod: 'cash', createdAt: new Date().toISOString(), createdBy: 'QA Hamburger', active: true,
  })
  await waitFor(() => evaluate('document.body.innerText'), text => text.includes('Ingreso QA en vivo'), 'Hamburger live cash listener did not show a movement for its branch')
  await send('Page.reload', { ignoreCache: true })
  await waitFor(() => evaluate('document.body.innerText'), text => text.includes('NUEVO PEDIDO'), 'Hamburger POS did not return after refresh')
  await clickExactText('Caja')
  await waitFor(() => evaluate('document.body.innerText'), text => text.includes('Ingreso QA en vivo'), 'Hamburger cash movement did not persist across refresh')
  console.log('PASS authenticated Hamburger cash listener displays the active-branch movement live and after refresh')
  for (const [width, height, mobile] of [[390, 844, true], [1440, 900, false]]) {
    await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile })
    const layout = await evaluate('({width:innerWidth,scrollWidth:document.documentElement.scrollWidth,overflow:document.documentElement.scrollWidth-innerWidth})')
    assert(layout.overflow < 12, `Hamburger navigation horizontal overflow at ${width}x${height}: ${JSON.stringify(layout)}`)
  }
  await evaluate(`(() => {const button=[...document.querySelectorAll('button')].find(item=>['Menú','Más'].includes(item.innerText.trim()));if(!button)throw new Error('Hamburger navigation menu button missing');button.click();return true})()`)
  await clickText('Configuración')
  await waitFor(() => evaluate('document.body.innerText'), text => text.includes('Impresoras y dispositivos'), 'Hamburger configuration did not expose printer entry')
  await clickText('Configurar impresoras')
  await waitFor(() => evaluate('document.body.innerText'), text => text.includes('Impresoras del restaurante'), 'Hamburger printer module did not open')
  console.log('PASS Hamburger owner opens business settings and printer configuration through the authenticated tenant experience')

  socket.close()
  socketOpen = false
  await stopChrome()
  await removeProfile()
  await openChrome(`${base}/login`)
  await login(fixtures[2], base)
  await evaluate(`(() => {const button=[...document.querySelectorAll('button')].find(item=>['Menú','Más'].includes(item.innerText.trim()));if(!button)throw new Error('Restaurant navigation menu button missing');button.click();return true})()`)
  await clickText('Configuración')
  await waitFor(() => evaluate('document.body.innerText'), text => text.includes('Impresoras y dispositivos'), 'Restaurant dining configuration did not expose printer entry')
  await clickText('Configurar impresoras')
  await waitFor(() => evaluate('document.body.innerText'), text => text.includes('Impresoras del restaurante'), 'Restaurant dining printer module did not open')
  console.log('PASS Restaurant with dining owner opens business settings and printer configuration through the authenticated tenant experience')
} finally {
  if (socketOpen) socket?.close()
  await stopChrome()
  viteProcess?.kill()
  await sleep(250)
  await removeProfile().catch(() => undefined)
  for (const fixture of fixtures) {
    if (fixture.tenantId) await db.recursiveDelete(db.doc(`tenants/${fixture.tenantId}`)).catch(() => undefined)
    await db.recursiveDelete(db.doc(`users/${fixture.uid}`)).catch(() => undefined)
    await adminAuth.deleteUser(fixture.uid).catch(() => undefined)
  }
  await deleteApp(app)
}
