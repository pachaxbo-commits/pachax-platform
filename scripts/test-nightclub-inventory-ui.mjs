import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { spawn } from 'node:child_process'
import { createServer as createNetServer } from 'node:net'
import { createServer as createViteServer } from 'vite'

const projectId = process.env.GCLOUD_PROJECT || process.env.FIREBASE_CONFIG_PROJECT_ID
assert.equal(projectId, 'demo-pachax-platform', 'Nightclub UI QA only allows demo-pachax-platform.')
assert.equal(process.env.FIRESTORE_EMULATOR_HOST, '127.0.0.1:8185')
assert.equal(process.env.FIREBASE_AUTH_EMULATOR_HOST, '127.0.0.1:9195')

const require = createRequire(new URL('../functions/package.json', import.meta.url))
const { initializeApp, deleteApp } = require('firebase-admin/app')
const { getAuth } = require('firebase-admin/auth')
const { getFirestore } = require('firebase-admin/firestore')
const { createTenant } = require('../functions/tenants.cjs')
const { getTemplate } = require('./generated/templates.js')
const suffix = Date.now().toString(36)
const ownerUid = `qa_nightclub_owner_${suffix}`
const ownerEmail = `${ownerUid}@example.test`
const password = 'EmulatorOnlyNightclub2026!'
const tenantName = `Nightclub QA ${suffix}`
const inventoryId = `qa-bottle-${suffix}`
const tenantApp = initializeApp({ projectId }, `nightclub-inventory-ui-${suffix}`)
const auth = getAuth(tenantApp)
const db = getFirestore(tenantApp)
const fixtureRefs = []
const authUserIds = []
let tenantId = ''
let vite
let browser
let profile
let socket
let socketOpen = false
let nextId = 0
const pending = new Map()
const browserErrors = []
const failedRequests = []
const networkResponses = []
const networkHosts = new Set()
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
const waitFor = async (read, predicate, label, timeout = 20000) => {
  const started = Date.now()
  let value
  while (Date.now() - started < timeout) {
    value = await read()
    if (predicate(value)) return value
    await sleep(150)
  }
  throw new Error(`${label}: ${JSON.stringify(value)}`)
}
const freePort = async () => {
  const server = createNetServer()
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const port = server.address().port
  await new Promise(resolve => server.close(resolve))
  return port
}
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
const clickButton = (label, exact = true, scope = 'document') => evaluate(`(() => {
  const root = ${scope};
  const button = [...root.querySelectorAll('button')].find(item => ${exact ? `item.innerText.trim() === ${JSON.stringify(label)}` : `item.innerText.includes(${JSON.stringify(label)})`} && !item.disabled);
  if (!button) throw new Error('Button not found: ' + ${JSON.stringify(label)} + '; visibleText=' + root.body?.innerText?.slice(-900) + '; buttons=' + JSON.stringify([...root.querySelectorAll('button')].map(item => item.innerText.trim()).filter(Boolean)));
  button.scrollIntoView({ block: 'center' }); button.click(); return true;
})()`)
const setInput = (selector, value) => evaluate(`(() => {
  const input = document.querySelector(${JSON.stringify(selector)});
  if (!input) throw new Error('Input not found: ' + ${JSON.stringify(selector)});
  const setter = Object.getOwnPropertyDescriptor(input.constructor.prototype, 'value').set;
  setter.call(input, ${JSON.stringify(String(value))});
  input.dispatchEvent(new Event('input', { bubbles: true })); input.dispatchEvent(new Event('change', { bubbles: true })); return true;
})()`)
const setSelectByOptionText = text => evaluate(`(() => {
  const select = [...document.querySelectorAll('select')].find(item => [...item.options].some(option => option.textContent.trim() === ${JSON.stringify(text)}));
  if (!select) throw new Error('Select option not found: ' + ${JSON.stringify(text)} + '; options=' + JSON.stringify([...document.querySelectorAll('select')].map(item => [...item.options].map(option => option.textContent.trim()))) + '; buttons=' + JSON.stringify([...document.querySelectorAll('button')].map(item => item.innerText.trim()).filter(Boolean)));
  const option = [...select.options].find(item => item.textContent.trim() === ${JSON.stringify(text)});
  const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set;
  setter.call(select, option.value); select.dispatchEvent(new Event('input', { bubbles: true })); select.dispatchEvent(new Event('change', { bubbles: true })); return true;
})()`)
const hasText = text => evaluate(`document.body.innerText.includes(${JSON.stringify(text)})`)
const screenshot = async name => {
  const value = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, fromSurface: true })
  writeFileSync(join(evidenceDir, `${name}.png`), Buffer.from(value.data, 'base64'))
}
const nav = async label => {
  const direct = await evaluate(`[...document.querySelectorAll('button')].some(item => item.innerText.trim() === ${JSON.stringify(label)})`)
  if (!direct) await clickButton('Más', true)
  await clickButton(label)
  await waitFor(() => evaluate('document.body.innerText'), text => text.includes(label) || text.includes(label === 'POS' ? 'POS · enviar ronda' : label), `${label} module rendered`)
}
const assertNoHorizontalOverflow = async (width, height, mobile) => {
  await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile })
  await sleep(300)
  const layout = await evaluate('({width:innerWidth,scrollWidth:document.documentElement.scrollWidth,overflow:document.documentElement.scrollWidth-innerWidth})')
  assert(layout.overflow <= 12, `Nightclub horizontal overflow ${width}x${height}: ${JSON.stringify(layout)}`)
  return layout.overflow
}
const gateway = async (token, data) => {
  const response = await fetch('http://127.0.0.1:5101/demo-pachax-platform/southamerica-west1/tenantGateway', {
    method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify({ data }),
  })
  const body = await response.json()
  if (!response.ok || body.error) throw new Error(`Tenant gateway failed (${response.status}): ${JSON.stringify(body.error || body)}`)
  return body.result?.data || body.result
}

const evidenceDir = mkdtempSync(join(tmpdir(), `pachax-nightclub-qa-${suffix}-`))
const screenshotDir = join(evidenceDir, 'screenshots')
mkdirSync(screenshotDir, { recursive: true })
try {
  await auth.createUser({ uid: ownerUid, email: ownerEmail, password, displayName: 'Owner QA Nightclub' })
  authUserIds.push(ownerUid)
  fixtureRefs.push(`users/${ownerUid}`)
  const created = await createTenant(db, auth, { auth: { uid: ownerUid, token: {} }, data: { operationId: `nightclub-ui-${suffix}`, name: tenantName, businessType: 'nightclub_lounge' } })
  tenantId = created.tenantId
  fixtureRefs.push(`tenants/${tenantId}`)
  const root = db.doc(`tenants/${tenantId}`)
  const template = getTemplate('nightclub_lounge')

  const signInResponse = await fetch('http://127.0.0.1:9195/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=emulator', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: ownerEmail, password, returnSecureToken: true }),
  })
  assert.equal(signInResponse.ok, true, 'Owner must authenticate through Auth Emulator.')
  const ownerToken = (await signInResponse.json()).idToken
  await gateway(ownerToken, { action: 'nightclubCommand', tenantId, branchId: 'main', commandType: 'saveInventory', operationId: `seed-item-${suffix}`, payload: { item: { id: inventoryId, name: 'Botella QA', unit: 'unit', displayUnit: 'unidad', current: 0, minimum: 0, unitCost: 12, category: 'QA' } } })
  const restrictedUid = `qa_nightclub_waiter_${suffix}`
  const restrictedEmail = `${restrictedUid}@example.test`
  await auth.createUser({ uid: restrictedUid, email: restrictedEmail, password, displayName: 'Mesero QA' })
  authUserIds.push(restrictedUid)
  fixtureRefs.push(`users/${restrictedUid}`)
  await root.collection('members').doc(restrictedUid).set({ uid: restrictedUid, tenantId, displayName: 'Mesero QA', email: restrictedEmail, roleId: 'waiter', status: 'active', branchIds: ['main'] })
  await db.doc(`users/${restrictedUid}`).set({ uid: restrictedUid, email: restrictedEmail, displayName: 'Mesero QA', defaultTenantId: tenantId })
  await db.doc(`users/${restrictedUid}/tenantLinks/${tenantId}`).set({ tenantId, name: tenantName, businessType: 'nightclub_lounge' })

  const waiterSignIn = await fetch('http://127.0.0.1:9195/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=emulator', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: restrictedEmail, password, returnSecureToken: true }),
  })
  assert.equal(waiterSignIn.ok, true)
  const waiterToken = (await waiterSignIn.json()).idToken
  const denied = await fetch('http://127.0.0.1:5101/demo-pachax-platform/southamerica-west1/tenantGateway', {
    method: 'POST', headers: { authorization: `Bearer ${waiterToken}`, 'content-type': 'application/json' },
    body: JSON.stringify({ data: { action: 'nightclubCommand', tenantId, branchId: 'main', commandType: 'saveInventory', operationId: `waiter-denied-${suffix}`, payload: { item: { id: `unauthorized-${suffix}`, name: 'No debe guardarse', unit: 'unit' } } } }),
  })
  const deniedBody = await denied.json()
  assert(deniedBody.error, 'Waiter inventory write must be rejected by tenantGateway.')
  assert.equal((await root.collection('nightclubInventory').doc(`unauthorized-${suffix}`).get()).exists, false)
  console.log('PASS authenticated owner fixture; restricted waiter inventory write rejected by backend')

  const chrome = [process.env.CHROME_BIN, 'C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe'].filter(Boolean).find(existsSync)
  assert(chrome, 'Chrome not found; set CHROME_BIN.')
  const vitePortServer = createNetServer()
  await new Promise(resolve => vitePortServer.listen(0, '127.0.0.1', resolve))
  const vitePort = vitePortServer.address().port
  await new Promise(resolve => vitePortServer.close(resolve))
  vite = await createViteServer({ configFile: './vite.config.ts', mode: 'emulator', server: { host: '127.0.0.1', port: vitePort, strictPort: true } })
  await vite.listen()
  const base = `http://127.0.0.1:${vitePort}`
  const debugPort = await freePort()
  profile = mkdtempSync(join(tmpdir(), `pachax-nightclub-chrome-${suffix}-`))
  browser = spawn(chrome, ['--headless=new', '--disable-gpu', '--no-sandbox', `--remote-debugging-port=${debugPort}`, '--remote-allow-origins=*', `--user-data-dir=${profile}`, `${base}/login`], { stdio: 'ignore' })
  let page
  for (let attempt = 0; attempt < 100; attempt++) {
    await sleep(150)
    try { page = (await (await fetch(`http://127.0.0.1:${debugPort}/json`)).json()).find(item => item.type === 'page' && item.webSocketDebuggerUrl); if (page) break } catch { /* Chrome starting */ }
  }
  assert(page?.webSocketDebuggerUrl, 'Chrome CDP page did not start.')
  socket = new WebSocket(page.webSocketDebuggerUrl)
  await new Promise((resolve, reject) => { socket.onopen = () => { socketOpen = true; resolve() }; socket.onerror = reject })
  socket.onmessage = event => {
    const message = JSON.parse(event.data)
    if (message.method === 'Runtime.exceptionThrown') browserErrors.push(message.params.exceptionDetails.text)
    if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error') browserErrors.push(message.params.args.map(arg => arg.value || arg.description || '').join(' '))
    if (message.method === 'Network.requestWillBeSent' && message.params.request.url.startsWith('http')) networkHosts.add(new URL(message.params.request.url).hostname)
    if (message.method === 'Network.responseReceived' && message.params.response.url.startsWith('http')) networkResponses.push({ url: message.params.response.url, status: message.params.response.status })
    if (message.method === 'Network.loadingFailed') failedRequests.push(message.params.errorText)
    if (!pending.has(message.id)) return
    const operation = pending.get(message.id); pending.delete(message.id)
    message.error ? operation.reject(new Error(JSON.stringify(message.error))) : operation.resolve(message.result)
  }
  await send('Runtime.enable')
  await send('Network.enable')
  await send('Page.enable')
  await waitFor(() => evaluate("!!document.querySelector('#login-email')"), Boolean, 'Nightclub tenant login form')
  await setInput('#login-email', ownerEmail)
  await setInput('#login-password', password)
  await clickButton('Ingresar', false)
  await waitFor(() => evaluate('document.body.innerText'), text => text.includes(tenantName), 'Authenticated Nightclub tenant shell')
  await waitFor(() => evaluate('document.body.innerText'), text => text.includes('Nightclub'), 'Nightclub tenant loaded')
  const nonLocalHosts = await evaluate(`performance.getEntriesByType('resource').map(item=>item.name).filter(name=>/^https?:/.test(name)).map(name=>new URL(name).hostname).filter(host=>!['127.0.0.1','localhost'].includes(host))`)
  assert.deepEqual(nonLocalHosts, [], `Browser made a non-emulator request: ${JSON.stringify(nonLocalHosts)}`)
  assert((await db.doc(`tenants/${tenantId}`).get()).exists)
  console.log('PASS tenant owner authenticated in Chrome; all app network requests remain local to Firebase/Vite emulators')

  await assertNoHorizontalOverflow(1440, 900, false)
  await screenshot('desktop-owner-start')

  await nav('Inventario')
  await waitFor(() => evaluate('document.body.innerText'), text => text.includes('Inventario por ubicación'), 'Productive location inventory')
  const locationSnapshots = await root.collection('nightclubLocations').get()
  assert(locationSnapshots.docs.some(doc => doc.id === 'warehouse-general' && doc.data().name === 'Almacén general'), 'Tenant setup must persist the warehouse location before browser inventory QA.')
  try {
    await waitFor(() => evaluate('[...document.querySelectorAll("select")].flatMap(select => [...select.options].map(option => option.textContent.trim()))'), options => options.includes('Almacén general'), 'Nightclub locations loaded in UI', 12000)
  } catch (error) {
    console.error('UI_DIAGNOSTICS', JSON.stringify({ locations: locationSnapshots.docs.map(doc => ({ id: doc.id, name: doc.data().name })), browserErrors, failedRequests }))
    throw error
  }
  await setSelectByOptionText('Almacén general')
  await clickButton('Registrar entrada al depósito', false)
  await waitFor(() => evaluate("!!document.querySelector('[aria-label=\"Registrar entrada al depósito\"]')"), Boolean, 'Warehouse intake dialog')
  await setSelectByOptionText('Botella QA')
  await clickButton('Añadir', true, "document.querySelector('[role=dialog]')")
  await setInput('[aria-label="Cantidad Botella QA"]', 6)
  await setInput('[aria-label="Costo unitario Botella QA"]', 12)
  await clickButton('Confirmar entrada', true)
  const intakeText = await waitFor(() => evaluate('document.body.innerText'), text => text.includes('Entrada confirmada por el servidor.') || text.includes('No se pudo confirmar la entrada.') || text.includes('Revisa cantidad y costo'), 'Warehouse intake result visible')
  if (!intakeText.includes('Entrada confirmada por el servidor.')) {
    const balances = await root.collection('nightclubInventoryBalances').get()
    const movements = await root.collection('nightclubInventoryMovements').get()
    console.error('INTAKE_DIAGNOSTICS', JSON.stringify({ visibleText: intakeText.slice(-900), balances: balances.docs.map(doc => ({ id: doc.id, data: doc.data() })), movements: movements.docs.map(doc => ({ id: doc.id, data: doc.data() })), browserErrors, failedRequests, networkResponses }))
    assert.fail('Warehouse intake did not report a successful server confirmation.')
  }
  await waitFor(async () => (await root.collection('nightclubInventoryBalances').doc(`warehouse-general:${inventoryId}`).get()).data()?.availableQuantity, value => value === 6, 'Warehouse intake persisted 6 physical units')
  assert.equal((await root.collection('nightclubInventoryLots').where('locationId', '==', 'warehouse-general').where('inventoryId', '==', inventoryId).get()).size, 1)
  assert.equal(await hasText('Entrada confirmada por el servidor.'), true)
  console.log('PASS UI warehouse intake: physical balance 0→6 and a FIFO lot is persisted')
  await clickButton('Cancelar', true)

  // A transfer request targets the cashbox selected in authenticated operator context.
  await nav('Caja')
  await clickButton('Caja principal', true)
  const selectedContext = await waitFor(async () => (await root.collection('nightclubOperatorContexts').doc(ownerUid).get()).data(), context => context?.cashboxId === 'cashbox-1', 'Owner cashbox selection persisted')
  try {
    await waitFor(() => evaluate('document.body.innerText'), text => text.includes('No hay turno abierto en esta caja.'), 'Cashbox context rendered')
  } catch (error) {
    console.error('CASHBOX_CONTEXT_DIAGNOSTICS', JSON.stringify({ context: selectedContext, visibleText: await evaluate('document.body.innerText'), browserErrors, failedRequests, networkResponses }))
    throw error
  }
  await setInput('[data-tutorial-target="cash-opening-float"]', 100)
  await clickButton('Abrir turno de Caja principal', true)
  await waitFor(async () => (await root.collection('nightclubOperatorContexts').doc(ownerUid).get()).data()?.activeShiftId, Boolean, 'Owner shift opened')
  let shiftId = (await root.collection('nightclubOperatorContexts').doc(ownerUid).get()).data().activeShiftId
  assert.equal((await root.collection('nightclubShifts').doc(shiftId).get()).data().status, 'open')
  console.log('PASS UI owner selected Caja principal and opened shift with Bs100 float')

  await nav('Inventario')
  await setSelectByOptionText('Caja principal')
  await clickButton('Solicitar reposición', false)
  await waitFor(() => evaluate("!!document.querySelector('[aria-label=\"Solicitar reposición\"]')"), Boolean, 'Restock request dialog')
  await setSelectByOptionText('Botella QA')
  await clickButton('Añadir', true, "document.querySelector('[aria-label=\"Solicitar reposición\"]')")
  await setInput('[aria-label="Cantidad solicitada Botella QA"]', 6)
  await clickButton('Enviar solicitud', true)
  const transferResultText = await waitFor(() => evaluate('document.body.innerText'), text => text.includes('Solicitud enviada al depósito.') || text.includes('no se pudo enviar') || text.includes('no está autorizada') || text.includes('no tienes acceso'), 'Inventory transfer result visible')
  if (!transferResultText.includes('Solicitud enviada al depósito.')) {
    const transfers = await root.collection('nightclubTransfers').get()
    console.error('TRANSFER_DIAGNOSTICS', JSON.stringify({ visibleText: transferResultText.slice(-700), transfers: transfers.docs.map(doc => ({ id: doc.id, data: doc.data() })), browserErrors, failedRequests, networkResponses }))
    assert.fail('Inventory transfer request did not report a successful server confirmation.')
  }
  await waitFor(async () => (await root.collection('nightclubTransfers').where('status', '==', 'requested').get()).size, value => value === 1, 'Transfer request persisted')
  await clickButton('Cancelar', true)
  await setSelectByOptionText('Almacén general')
  await clickButton('Despachar', false)
  const transferSnap = await waitFor(async () => { const snap = await root.collection('nightclubTransfers').get(); return snap.docs.find(doc => ['in_transit', 'prepared'].includes(doc.data().status))?.id }, Boolean, 'Transfer dispatched')
  await setSelectByOptionText('Caja principal')
  await waitFor(() => evaluate("[...document.querySelectorAll('button')].some(button => button.innerText.trim() === 'Confirmar recepción' && !button.disabled)"), Boolean, 'Transfer receipt action rendered for destination cashbox')
  await clickButton('Confirmar recepción', false)
  await waitFor(async () => (await root.collection('nightclubTransfers').doc(transferSnap).get()).data()?.status, status => status === 'received', 'Transfer received by cashbox')
  assert.equal((await root.collection('nightclubInventoryBalances').doc(`warehouse-general:${inventoryId}`).get()).data().availableQuantity, 0)
  assert.equal((await root.collection('nightclubInventoryBalances').doc(`cashbox-1:${inventoryId}`).get()).data().availableQuantity, 6)
  assert.equal((await root.collection('nightclubInventoryLots').where('locationId', '==', 'cashbox-1').where('inventoryId', '==', inventoryId).get()).size, 1)
  console.log('PASS UI transfer request → dispatch → receive: warehouse 6→0, cashbox 0→6 with FIFO lot preserved')

  await nav('Productos')
  await clickButton('Nuevo producto', true)
  await waitFor(() => evaluate("!!document.querySelector('[role=dialog][aria-label=\"Producto\"]')"), Boolean, 'Product editor')
  await evaluate(`(() => { const labels=[...document.querySelectorAll('[role=dialog] label')]; const field=(text)=>labels.find(item=>item.textContent.includes(text))?.querySelector('input'); const set=(el,v)=>{const d=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value');d.set.call(el,String(v));el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}))}; set(field('Nombre'),'Botella QA'); set(field('Categoría'),'QA'); set(field('Precio de venta'),30); return true })()`)
  await clickButton('Producto por unidad', true)
  await setSelectByOptionText('Botella QA · 6 unidad en esta caja')
  await clickButton('Guardar producto', true)
  // The product id is generated by the UI, so retrieve by its unique QA name.
  const productSnap = await waitFor(async () => root.collection('nightclubProducts').where('name', '==', 'Botella QA').get(), snap => snap.size === 1, 'Unit product saved by tenantGateway')
  assert.equal(productSnap.size, 1)
  const savedProduct = productSnap.docs[0].data()
  assert.equal(savedProduct.inventoryId, inventoryId)
  assert.equal(savedProduct.inventoryMode, 'unit')
  console.log('PASS UI product configuration: unit product linked to the physical inventory item')

  await nav('POS')
  await clickButton('Pedido en barra', true)
  await setInput('[aria-label="Nombre del cliente (opcional)"]', 'Cliente QA')
  await clickButton('Abrir pedido en barra', true)
  await waitFor(() => evaluate('document.body.innerText'), text => text.includes('Cliente QA'), 'Bar account opened from POS')
  await clickButton('Botella QA', false)
  await clickButton('Botella QA', false)
  await clickButton('ENVIAR RONDA', false)
  await waitFor(async () => (await root.collection('nightclubInventoryBalances').doc(`cashbox-1:${inventoryId}`).get()).data()?.availableQuantity, value => value === 4, 'First 2-unit round consumed stock 6→4')
  let accountSnap = await root.collection('nightclubAccounts').where('branchId', '==', 'main').where('locationId', '==', 'cashbox-1').get()
  assert.equal(accountSnap.size, 1)
  let accountId = accountSnap.docs[0].id
  let roundSnap = await root.collection('nightclubRounds').where('accountId', '==', accountId).get()
  assert.equal(roundSnap.size, 1)
  const firstRoundDoc = roundSnap.docs[0].data()
  assert.equal(firstRoundDoc.items[0].quantity, 2)
  assert.equal(firstRoundDoc.inventoryConsumptionStatus, 'consumed')
  assert.equal(firstRoundDoc.items[0].fifoAllocations.reduce((sum, allocation) => sum + allocation.quantity, 0), 2)
  assert.equal((await root.collection('nightclubInventoryMovements').where('roundId', '==', firstRoundDoc.id).where('type', '==', 'sale').get()).size, 1)
  await screenshot('desktop-first-round-after')
  console.log('PASS UI first round: 2 units sold, persisted round + FIFO allocation + one sale movement, balance 4')

  await nav('Barra')
  await clickButton('Iniciar preparación', true)
  await waitFor(async () => (await root.collection('nightclubRounds').where('accountId', '==', accountId).get()).docs.map(doc => doc.data().status), statuses => statuses.includes('preparing'), 'Bar round entered preparation in Firestore')
  await waitFor(() => evaluate('document.body.innerText'), text => text.includes('Marcar listo'), 'Bar preparation action rendered')
  await clickButton('Marcar listo', true)
  await waitFor(async () => (await root.collection('nightclubRounds').where('accountId', '==', accountId).get()).docs.map(doc => doc.data().status), statuses => statuses.includes('ready'), 'Bar round marked ready in Firestore')
  await nav('Cuentas')
  try { await waitFor(() => evaluate('document.body.innerText'), text => text.includes('Marcar entregado'), 'Owner can deliver ready round') }
  catch (error) { const rounds = await root.collection('nightclubRounds').where('accountId', '==', accountId).get(); console.error('DELIVERY_DIAGNOSTICS', JSON.stringify({ rounds: rounds.docs.map(doc => ({ id: doc.id, status: doc.data().status })), browserErrors, failedRequests, visibleText: await evaluate('document.body.innerText') })); throw error }
  await clickButton('Marcar entregado', true)
  await waitFor(async () => (await root.collection('nightclubRounds').where('accountId', '==', accountId).get()).docs.map(doc => doc.data().status), statuses => statuses.includes('delivered'), 'First round delivery persisted')
  await waitFor(() => evaluate('document.body.innerText'), text => text.includes('Pedido entregado.'), 'Delivery result displayed')
  await sleep(100)
  await clickButton('Solicitar cobro', true)
  try { await waitFor(async () => (await root.collection('nightclubAccounts').doc(accountId).get()).data()?.status, status => status === 'bill_requested', 'Account requested settlement in Firestore') }
  catch (error) { console.error('BILL_REQUEST_DIAGNOSTICS', JSON.stringify({ account: (await root.collection('nightclubAccounts').doc(accountId).get()).data(), browserErrors, failedRequests, visibleText: await evaluate('document.body.innerText') })); throw error }
  await waitFor(() => evaluate('document.body.innerText'), text => text.includes('Registrar pago'), 'Account settlement action rendered')
  await clickButton('Registrar pago', true)
  await waitFor(() => hasText('Cobrar cuenta'), Boolean, 'Partial payment dialog')
  await evaluate("document.querySelector('input[type=checkbox]').click()")
  await setInput('input[type="number"]', 20)
  await setInput('input[type="number"]:nth-of-type(2)', 20).catch(() => false)
  await evaluate(`(() => { const labels=[...document.querySelectorAll('label')]; const received=labels.find(item=>item.textContent.includes('Recibido'))?.querySelector('input'); if(received){const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;setter.call(received,'20');received.dispatchEvent(new Event('input',{bubbles:true}));received.dispatchEvent(new Event('change',{bubbles:true}))} return true })()`)
  await clickButton('Confirmar pago', true)
  await waitFor(async () => (await root.collection('nightclubAccounts').doc(accountId).get()).data()?.paidTotal, value => value === 20, 'Partial payment persisted')
  assert.equal((await root.collection('nightclubAccounts').doc(accountId).get()).data().balance, 40)
  const partialPayment = await root.collection('nightclubPayments').where('accountId', '==', accountId).get()
  assert.equal(partialPayment.size, 1)
  assert.equal(partialPayment.docs[0].data().amount, 20)
  await nav('Caja')
  await waitFor(() => evaluate("/\\+Bs 20[.,]00/.test(document.body.innerText)"), Boolean, 'Cash history shows partial sale as positive inflow')
  console.log('PASS partial cash payment: Bs20 recorded once and displayed positive; account balance remains Bs40')

  await nav('Cuentas')
  await clickButton('Reabrir', true)
  await waitFor(async () => (await root.collection('nightclubAccounts').doc(accountId).get()).data()?.status, status => status === 'open', 'Account reopened for another round')
  await waitFor(() => evaluate('document.body.innerText'), text => text.includes('Nueva ronda'), 'Reopened account action rendered')
  await sleep(100)
  await clickButton('Nueva ronda', true)
  await waitFor(() => hasText('POS · enviar ronda'), Boolean, 'Reopened account returned to POS')
  await clickButton('Pedido en barra', true)
  await waitFor(() => hasText('Cliente QA'), Boolean, 'Reopened account selected')
  await clickButton('Botella QA', false)
  await clickButton('ENVIAR RONDA', false)
  await waitFor(async () => (await root.collection('nightclubInventoryBalances').doc(`cashbox-1:${inventoryId}`).get()).data()?.availableQuantity, value => value === 3, 'Second 1-unit round consumed stock 4→3')
  roundSnap = await root.collection('nightclubRounds').where('accountId', '==', accountId).get()
  assert.equal(roundSnap.size, 2)
  assert.deepEqual(roundSnap.docs.map(doc => doc.data().items[0].quantity).sort(), [1, 2])
  const secondRound = roundSnap.docs.find(doc => doc.data().items[0].quantity === 1).data()
  assert.equal(secondRound.status, 'pending')
  assert.equal(secondRound.authorization, 'account_charge')
  assert.equal(secondRound.items[0].preparationArea, 'Barra')
  assert.equal((await root.collection('nightclubInventoryMovements').where('accountId', '==', accountId).where('type', '==', 'sale').get()).size, 2)
  await nav('Barra')
  try { await waitFor(() => evaluate("[...document.querySelectorAll('button')].some(button => button.innerText.trim() === 'Iniciar preparación')"), Boolean, 'Second round visible in bar queue') }
  catch (error) { console.error('SECOND_ROUND_QUEUE_DIAGNOSTICS', JSON.stringify({ account: (await root.collection('nightclubAccounts').doc(accountId).get()).data(), secondRound, visibleText: await evaluate('document.body.innerText'), browserErrors, failedRequests })); throw error }
  await clickButton('Iniciar preparación', true)
  await waitFor(async () => (await root.collection('nightclubRounds').where('accountId', '==', accountId).get()).docs.map(doc => doc.data().status).filter(status => status === 'preparing').length, count => count === 1, 'Second bar round entered preparation in Firestore')
  await waitFor(() => evaluate('document.body.innerText'), text => text.includes('Marcar listo'), 'Second preparation action rendered')
  await clickButton('Marcar listo', true)
  await waitFor(async () => (await root.collection('nightclubRounds').where('accountId', '==', accountId).get()).docs.map(doc => doc.data().status).filter(status => status === 'ready').length, count => count === 1, 'Second bar round marked ready in Firestore')
  await nav('Cuentas')
  await clickButton('Marcar entregado', true)
  await waitFor(async () => (await root.collection('nightclubRounds').where('accountId', '==', accountId).get()).docs.map(doc => doc.data().status).filter(status => status === 'delivered').length, count => count === 2, 'Second round delivery persisted')
  await waitFor(() => evaluate('document.body.innerText'), text => text.includes('Pedido entregado.'), 'Second delivery result displayed')
  await sleep(100)
  await clickButton('Solicitar cobro', true)
  await waitFor(async () => (await root.collection('nightclubAccounts').doc(accountId).get()).data()?.status, status => status === 'bill_requested', 'Account requested final settlement in Firestore')
  await waitFor(() => evaluate('document.body.innerText'), text => text.includes('Registrar pago'), 'Final settlement action rendered')
  await clickButton('Registrar pago', true)
  await waitFor(() => hasText('Cobrar cuenta'), Boolean, 'Final payment dialog')
  await evaluate(`(() => { const labels=[...document.querySelectorAll('label')]; const amount=labels.find(item=>item.textContent.includes('Monto a cobrar'))?.querySelector('input'); const received=labels.find(item=>item.textContent.includes('Recibido'))?.querySelector('input'); const set=(el,v)=>{const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;setter.call(el,String(v));el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}))}; if(amount)set(amount,'70');if(received)set(received,'70');return true })()`)
  await clickButton('Confirmar pago', true)
  await waitFor(async () => (await root.collection('nightclubAccounts').doc(accountId).get()).data()?.balance, value => value === 0, 'Final payment persisted')
  const payments = await root.collection('nightclubPayments').where('accountId', '==', accountId).get()
  assert.equal(payments.size, 2)
  assert.equal(payments.docs.reduce((sum, doc) => sum + doc.data().amount, 0), 90)
  await nav('Caja')
  await waitFor(() => evaluate("/\\+Bs 70[.,]00/.test(document.body.innerText)"), Boolean, 'Cash history shows final sale as positive inflow')
  assert.equal((await root.collection('nightclubCashMovements').where('accountId', '==', accountId).where('type', '==', 'sale').get()).size, 2)
  await nav('Cuentas')
  await clickButton('Reabrir', true)
  await waitFor(async () => (await root.collection('nightclubAccounts').doc(accountId).get()).data()?.status, status => status === 'open', 'Fully paid account reopened for final close')
  await waitFor(() => evaluate('document.body.innerText'), text => text.includes('Cerrar pedido'), 'Final close action rendered')
  await sleep(100)
  await clickButton('Cerrar pedido', true)
  await waitFor(async () => (await root.collection('nightclubAccounts').doc(accountId).get()).data()?.status, status => status === 'closed', 'Account closed after zero balance and delivery')
  await screenshot('desktop-account-closed')
  console.log('PASS final payment and account close: payments Bs20+70=90, stock=3, cash movements=2, no duplicates')

  await nav('Caja')
  await setInput('[aria-label="Efectivo contado"]', 190)
  assert.equal(await hasText('Caja cuadrada. El turno puede cerrarse.'), true)
  await clickButton('Cerrar turno de Caja principal', true)
  await waitFor(async () => (await root.collection('nightclubShifts').doc(shiftId).get()).data()?.status, status => status === 'closed', 'Cashbox shift closed')
  const shiftData = (await root.collection('nightclubShifts').doc(shiftId).get()).data()
  assert.equal(shiftData.expectedCash, 190)
  assert.equal(shiftData.countedCash, 190)
  assert.equal(shiftData.difference, 0)
  console.log('PASS balanced cash close: opening Bs100 + cash sales Bs90 = counted Bs190')

  await nav('Reportes')
  await waitFor(() => evaluate('document.body.innerText'), text => text.includes('Reportes'), 'Nightclub reports view')
  const reportText = await evaluate('document.body.innerText')
  assert(reportText.length > 0)
  await screenshot('desktop-reports')
  await assertNoHorizontalOverflow(390, 844, true)
  await screenshot('mobile-reports')
  await nav('Caja')
  const mobileCashOverflow = await assertNoHorizontalOverflow(390, 844, true)
  await nav('POS')
  const mobilePosOverflow = await assertNoHorizontalOverflow(390, 844, true)
  await screenshot('mobile-pos')
  const desktopOverflow = await assertNoHorizontalOverflow(1440, 900, false)
  assert.deepEqual([...networkHosts].filter(host => !['127.0.0.1', 'localhost'].includes(host)), [])
  assert.equal(browserErrors.length, 0, browserErrors.join('\n'))
  console.log(`PASS responsive overflow mobile reports=0 cash=${mobileCashOverflow}px POS=${mobilePosOverflow}px, desktop=${desktopOverflow}px`)

  const [finalInventory, finalBalance, finalLots, allRounds, allMovements] = await Promise.all([
    root.collection('nightclubInventory').doc(inventoryId).get(),
    root.collection('nightclubInventoryBalances').doc(`cashbox-1:${inventoryId}`).get(),
    root.collection('nightclubInventoryLots').where('locationId', '==', 'cashbox-1').where('inventoryId', '==', inventoryId).get(),
    root.collection('nightclubRounds').where('accountId', '==', accountId).get(),
    root.collection('nightclubInventoryMovements').where('accountId', '==', accountId).get(),
  ])
  assert.equal(finalInventory.data().current, 0, 'Legacy master current is not the stock source of truth.')
  assert.equal(finalBalance.data().availableQuantity, 3)
  assert.equal(finalLots.docs.reduce((sum, lot) => sum + lot.data().remainingQuantity, 0), 3)
  assert.equal(allRounds.size, 2)
  assert.equal(allMovements.docs.filter(doc => doc.data().type === 'sale').length, 2)
  const movementRows = await root.collection('nightclubCashMovements').where('accountId', '==', accountId).get()
  assert.equal(movementRows.docs.reduce((sum, row) => sum + Number(row.data().amount), 0), 90)
  console.log('EVIDENCE', JSON.stringify({ tenantId, businessType: template.businessType, stock: { received: 6, afterFirstRound: 4, afterSecondRound: 3, remainingLotQuantity: 3 }, payments: payments.docs.map(doc => doc.data().amount).sort((a, b) => a - b), rounds: allRounds.size, inventorySaleMovements: allMovements.docs.filter(doc => doc.data().type === 'sale').length, cashMovementAmounts: movementRows.docs.map(row => row.data().amount), shift: { openingFloat: shiftData.openingFloat, expectedCash: shiftData.expectedCash, countedCash: shiftData.countedCash, difference: shiftData.difference }, screenshots: screenshotDir }))
  console.log('BROWSER_ERRORS', JSON.stringify(browserErrors))
  console.log('NETWORK_HOSTS', JSON.stringify([...networkHosts]))
  console.log('PASS authenticated Nightclub physical inventory, account, cash and responsive UI gate')
} finally {
  if (socketOpen) { socket.close(); socketOpen = false }
  if (browser) {
    const exited = new Promise(resolve => browser.once('exit', resolve))
    browser.kill()
    await Promise.race([exited, sleep(5000)])
  }
  if (vite) await vite.close()
  if (profile) {
    for (let attempt = 0; attempt < 8; attempt++) {
      try { rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); profile = undefined; break }
      catch { await sleep(150) }
    }
  }
  if (tenantId) await db.recursiveDelete(db.doc(`tenants/${tenantId}`)).catch(() => undefined)
  for (const path of fixtureRefs) await db.recursiveDelete(db.doc(path)).catch(() => undefined)
  for (const uid of authUserIds) await auth.deleteUser(uid).catch(() => undefined)
  await deleteApp(tenantApp)
}
