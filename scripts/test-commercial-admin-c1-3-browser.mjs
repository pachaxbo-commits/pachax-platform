// C1.3 browser smoke: public catalog, anonymous lead and Admin proposal in isolated emulators.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawn } from 'node:child_process'
import { createServer } from 'node:net'

const projectId = process.env.C1_PROJECT_ID || 'demo-pachax-platform'
const authHost = process.env.FIREBASE_AUTH_EMULATOR_HOST
const firestoreHost = process.env.FIRESTORE_EMULATOR_HOST
const base = process.env.C1_ADMIN_BROWSER_URL || 'http://127.0.0.1:5297'
assert.match(projectId, /^demo-[a-z0-9-]+$/, 'Este runner solo permite project IDs ficticios demo-*.' )
assert(authHost && firestoreHost, 'Auth y Firestore deben apuntar explícitamente a emuladores.')
assert.equal((await fetch(base)).status, 200, 'El servidor Vite de emulador no responde.')

const require = createRequire(new URL('../functions/package.json', import.meta.url))
const { initializeApp, deleteApp } = require('firebase-admin/app')
const { getAuth } = require('firebase-admin/auth')
const { getFirestore } = require('firebase-admin/firestore')
const suffix = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
const credentials = {
  owner: { uid: `c12-owner-${suffix}`, email: `c12-owner-${suffix}@example.test`, password: 'C1EmulatorOnly2026!' },
  support: { uid: `c12-support-${suffix}`, email: `c12-support-${suffix}@example.test`, password: 'C1EmulatorOnly2026!' },
  ordinary: { uid: `c12-user-${suffix}`, email: `c12-user-${suffix}@example.test`, password: 'C1EmulatorOnly2026!' },
  prospect: { uid: `c12-prospect-${suffix}`, email: `c12-prospect-${suffix}@example.test`, password: 'C1EmulatorOnly2026!' },
}
const planId = `hamburger_plan_c12qa_${suffix}`
const planRefPath = `platformPlans/${planId}`
const companyName = `Prospecto C1.3 ${suffix}`
const adminApp = initializeApp({ projectId }, `c12-admin-browser-${suffix}`)
const auth = getAuth(adminApp)
const db = getFirestore(adminApp)
const chrome = [process.env.CHROME_BIN, 'C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe'].filter(Boolean).find(existsSync)
assert(chrome, 'Chrome no encontrado; define CHROME_BIN.')

let browser
let profile
let socket
let socketOpen = false
let cdpId = 0
let dialogDecision = true
let dialogCount = 0
const pending = new Map()
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
const cleanupErrors = []
const browserRequests = []

async function waitFor(read, predicate, message, timeout = 12000) {
  const started = Date.now()
  let value
  while (Date.now() - started < timeout) {
    value = await read()
    if (predicate(value)) return value
    await sleep(120)
  }
  throw new Error(`${message}: ${JSON.stringify(value)}`)
}
async function cleanup() {
  for (const [name, user] of Object.entries(credentials)) {
    try { await auth.deleteUser(user.uid) } catch (error) { if (error.code !== 'auth/user-not-found') cleanupErrors.push(`${name}: Auth ${error.message}`) }
  }
  try { await db.doc(`platformOperators/${credentials.owner.uid}`).delete() } catch (error) { cleanupErrors.push(`owner operator: ${error.message}`) }
  try { await db.doc(`platformOperators/${credentials.support.uid}`).delete() } catch (error) { cleanupErrors.push(`support operator: ${error.message}`) }
  try {
    const intentId = (await db.collection('platformCommercialIntents').where('companyName', '==', companyName).get()).docs
    for (const document of intentId) {
      for (const collection of ['proposalOperations', 'statusOperations']) { const sub = await document.ref.collection(collection).get(); for (const operation of sub.docs) await operation.ref.delete() }
      const intentAudits = await db.collection('platformAuditLogs').where('resource', '==', `platformCommercialIntents/${document.id}`).get()
      for (const audit of intentAudits.docs) await audit.ref.delete()
      await document.ref.delete()
    }
  } catch (error) { cleanupErrors.push(`commercial intent: ${error.message}`) }
  try {
    const audits = await db.collection('platformAuditLogs').where('resource', '==', planRefPath).get()
    for (const audit of audits.docs) await audit.ref.delete()
  } catch (error) { cleanupErrors.push(`audit logs: ${error.message}`) }
  try { await db.doc(planRefPath).delete() } catch (error) { cleanupErrors.push(`plan: ${error.message}`) }
  for (const [name, user] of Object.entries(credentials)) {
    try {
      await auth.getUser(user.uid)
      cleanupErrors.push(`${name}: cuenta Auth QA sigue existiendo`)
    } catch (error) { if (error.code !== 'auth/user-not-found') cleanupErrors.push(`${name}: no se pudo verificar Auth (${error.message})`) }
  }
  for (const path of [planRefPath, `platformOperators/${credentials.owner.uid}`, `platformOperators/${credentials.support.uid}`]) {
    try { if ((await db.doc(path).get()).exists) cleanupErrors.push(`documento QA restante: ${path}`) }
    catch (error) { cleanupErrors.push(`no se pudo verificar ${path}: ${error.message}`) }
  }
  try {
    const remainingIntents = await db.collection('platformCommercialIntents').where('companyName', '==', companyName).get()
    if (!remainingIntents.empty) cleanupErrors.push('quedaron solicitudes QA del prospecto')
  } catch (error) { cleanupErrors.push(`no se pudo verificar solicitudes QA: ${error.message}`) }
  try {
    const remainingAudits = await db.collection('platformAuditLogs').where('resource', '==', planRefPath).get()
    if (!remainingAudits.empty) cleanupErrors.push('quedaron auditorías QA del plan')
  } catch (error) { cleanupErrors.push(`no se pudo verificar auditoría QA: ${error.message}`) }
}

async function evaluate(expression, userGesture = false) {
  const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true, userGesture })
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text)
  return result.result.value
}

async function send(method, params = {}) {
  assert(socketOpen, 'Chrome CDP no está conectado.')
  const id = ++cdpId
  const response = new Promise((resolve, reject) => pending.set(id, { resolve, reject }))
  socket.send(JSON.stringify({ id, method, params }))
  return response
}

async function navigate(path) {
  await send('Page.navigate', { url: new URL(path, base).href })
  await waitFor(() => evaluate('location.pathname'), value => value === path.split('?')[0], `No navegó a ${path}`)
}

async function fillLogin(user) {
  await navigate('/admin/login')
  await waitFor(() => evaluate('!!document.querySelector("[data-admin-login-submit]")'), Boolean, 'El formulario de login no está listo')
  const encodedEmail = JSON.stringify(user.email)
  const encodedPassword = JSON.stringify(user.password)
  await evaluate(`(() => {
    const set = (selector, value) => { const element = document.querySelector(selector); if (!element) throw new Error('Missing ' + selector); const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; setter.call(element, value); element.dispatchEvent(new Event('input', { bubbles: true })); element.dispatchEvent(new Event('change', { bubbles: true })); };
    set('input[autocomplete="username"]', ${encodedEmail});
    set('[data-admin-login-password]', ${encodedPassword});
    document.querySelector('[data-admin-login-submit]').click();
  })()`, true)
}

async function logout() {
  await evaluate(`(() => { const button=[...document.querySelectorAll('button')].find(item=>item.textContent.trim()==='Salir'); if(button)button.click(); else throw new Error('No se encontró Salir en Admin'); })()`, true)
  await waitFor(() => evaluate('location.pathname'), value => value === '/admin/login', 'No volvió al login al cerrar sesión')
}

try {
  for (const [name, user] of Object.entries(credentials)) {
    await auth.createUser({ uid: user.uid, email: user.email, password: user.password })
    if (name === 'owner' || name === 'support') {
      const role = name === 'owner' ? 'platform_owner' : 'platform_support'
      await auth.setCustomUserClaims(user.uid, { platform: true, platformRole: role })
      await db.doc(`platformOperators/${user.uid}`).set({ uid: user.uid, role, active: true, email: user.email })
    }
  }
  await db.doc(planRefPath).set({
    id: planId, templateId: 'hamburger', name: `Plan QA C1.2 ${suffix}`, planKind: 'paid', tierLevel: 1,
    monthlyPriceUSD: 37, annualPriceUSD: 370, currency: 'USD', billingPeriod: 'monthly',
    clientProfile: 'Plan de prueba ficticio en Firebase Emulator.', limitsLabel: 'Solo QA',
    includedFeatures: ['Caja de prueba verificada'], technicalEntitlements: [], ctaLabel: 'Consultar disponibilidad',
    status: 'draft', priceApproval: 'approved', order: 1, commercialVersion: 1,
  })

  const debugPortProbe = createServer()
  await new Promise(resolve => debugPortProbe.listen(0, '127.0.0.1', resolve))
  const debugPort = debugPortProbe.address().port
  await new Promise(resolve => debugPortProbe.close(resolve))
  profile = mkdtempSync(join(tmpdir(), 'pachax-c13-admin-'))
  browser = spawn(chrome, ['--headless=new', '--disable-gpu', '--no-sandbox', `--remote-debugging-port=${debugPort}`, '--remote-allow-origins=*', `--user-data-dir=${profile}`, `${base}/admin/login`], { stdio: 'ignore' })
  let page
  for (let attempt = 0; attempt < 60; attempt++) {
    await sleep(200)
    try { page = (await (await fetch(`http://127.0.0.1:${debugPort}/json`)).json()).find(item => item.type === 'page' && item.webSocketDebuggerUrl); if (page) break } catch { /* Chrome starting. */ }
  }
  assert(page?.webSocketDebuggerUrl, 'No se encontró Chrome CDP.')
  socket = new WebSocket(page.webSocketDebuggerUrl)
  await new Promise((resolve, reject) => { socket.onopen = () => { socketOpen = true; resolve() }; socket.onerror = reject })
  socket.onmessage = event => {
    const message = JSON.parse(event.data)
    if (message.method === 'Network.requestWillBeSent') browserRequests.push(message.params.request.url)
    if (message.method === 'Page.javascriptDialogOpening') {
      dialogCount += 1
      void send('Page.handleJavaScriptDialog', { accept: dialogDecision })
    }
    if (!pending.has(message.id)) return
    const operation = pending.get(message.id)
    pending.delete(message.id)
    if (message.error) operation.reject(new Error(JSON.stringify(message.error)))
    else operation.resolve(message.result)
  }
  await send('Page.enable')
  await send('Runtime.enable')
  await send('Log.enable')
  await send('Network.enable')
  await fillLogin(credentials.owner)
  try {
    await waitFor(() => evaluate(`!!document.querySelector('[data-admin-tab="commercial-intents"]')`), Boolean, 'Owner no autenticó o no recibió su menú autorizado')
  } catch (cause) {
    const state = await evaluate(`JSON.stringify({path:location.pathname,body:document.body.innerText.slice(0,1200),auth:localStorage.getItem('firebase:authUser:${projectId}:[DEFAULT]')})`)
    const authRequests = browserRequests.filter(url => /identitytoolkit|accounts:signInWithPassword|emulator/gi.test(url))
    const functionRequests = browserRequests.filter(url => /cloudfunctions|18797|5101/.test(url))
    throw new Error(`Owner no autenticó o no recibió su menú autorizado. Estado=${state}; Auth requests=${JSON.stringify(authRequests)}; Functions requests=${JSON.stringify(functionRequests)}. ${cause instanceof Error ? cause.message : String(cause)}`)
  }
  console.log('PASS Chrome: login real Owner y acceso a Admin')

  await evaluate(`document.querySelector('[data-admin-tab="plans"]').click()`, true)
  await waitFor(() => evaluate('document.body.innerText'), value => value.includes('Gestión de Planes Comerciales'), 'No abrió Planes')
  await evaluate(`([...document.querySelectorAll('button')].find(button=>button.textContent.trim()==='Restaurante Rápido')).click()`, true)
  const planName = `Plan QA C1.2 ${suffix}`
  await waitFor(() => evaluate('document.body.innerText'), value => value.includes(planName), 'El plan QA no cargó en el formulario')
  await evaluate(`([...document.querySelectorAll('h4')].find(item=>item.textContent.trim()===${JSON.stringify(planName)}))?.click()`, true)
  await waitFor(() => evaluate('document.body.innerText'), value => value.includes('Publicar en landing'), 'No se habilitó publicación del borrador')

  const publishButton = `([...document.querySelectorAll('button')].find(item=>item.textContent.includes('Publicar en landing')))`
  dialogDecision = false
  const beforeCancel = dialogCount
  await evaluate(`${publishButton}.click()`, true)
  await waitFor(() => dialogCount, value => value > beforeCancel, 'Chrome no mostró confirmación de publicación')
  await sleep(200)
  assert.equal((await db.doc(planRefPath).get()).data().status, 'draft', 'Cancelar la confirmación debe conservar el borrador.')
  console.log('PASS Chrome: cancelar publicación conserva el borrador')

  dialogDecision = true
  const beforeAccept = dialogCount
  await evaluate(`${publishButton}.click()`, true)
  await waitFor(() => dialogCount, value => value > beforeAccept, 'Chrome no volvió a mostrar confirmación')
  await waitFor(async () => (await db.doc(planRefPath).get()).data()?.status, value => value === 'published', 'Owner no publicó el plan desde la UI')
  await waitFor(() => evaluate('document.body.innerText'), value => value.includes('publicado en la landing'), 'Admin no mostró confirmación visible de publicación.')
  assert((await db.collection('platformAuditLogs').where('resource', '==', planRefPath).get()).docs.some(doc => doc.data().action === 'plan.publish'), 'No se registró auditoría de publicación.')
  const emulatorCatalog = (await db.doc('platformConfig/publicCommercialCatalog').get()).data()?.catalog
  assert(emulatorCatalog?.plans?.some(plan => plan.id === planId && plan.monthlyPriceUSD === 37), 'El snapshot publicado no incluyó el plan publicado.')
  await navigate('/')
  const visiblePublishedOffer = await waitFor(() => evaluate(`document.querySelector('#planes')?.innerText || ''`), value => value.includes(planName), 'La oferta publicada no llegó a la landing')
  assert(visiblePublishedOffer.includes(planName) && visiblePublishedOffer.includes('37'), 'El plan publicado desde Admin no se reflejó con su precio en landing.')
  console.log('PASS Chrome: landing anónima muestra el plan y precio publicados desde Admin')
  await navigate('/admin')
  await waitFor(() => evaluate(`!!document.querySelector('[data-admin-tab="plans"]')`), Boolean, 'Admin no volvió a cargar después de validar la landing')
  console.log('PASS Chrome: Owner publica y Firestore Emulator/auditoría persisten')

  const beforeReload = await evaluate('performance.timeOrigin')
  await send('Page.reload')
  await waitFor(() => evaluate('performance.timeOrigin'), value => value > beforeReload, 'La página de Admin no terminó el refresh')
  await waitFor(() => evaluate(`!!document.querySelector('[data-admin-tab="plans"]')`), Boolean, 'La sesión de Owner no persistió en refresh')
  await evaluate(`document.querySelector('[data-admin-tab="plans"]').click()`, true)
  await evaluate(`([...document.querySelectorAll('button')].find(button=>button.textContent.trim()==='Restaurante Rápido')).click()`, true)
  await waitFor(() => evaluate('document.body.innerText'), value => value.includes(planName) && value.includes('Despublicar a borrador'), 'Estado publicado no persistió tras refresh')
  await evaluate(`([...document.querySelectorAll('button')].find(item=>item.textContent.includes('Despublicar a borrador'))).click()`, true)
  await waitFor(async () => (await db.doc(planRefPath).get()).data()?.status, value => value === 'draft', 'La despublicación no persistió')
  assert((await evaluate('document.body.innerText')).includes('despublicado'), 'Admin no confirmó visualmente la despublicación.')
  assert((await db.collection('platformAuditLogs').where('resource', '==', planRefPath).get()).docs.some(doc => doc.data().action === 'plan.unpublish'), 'No se registró auditoría de despublicación.')
  console.log('PASS Chrome: refresh conserva publicación; Owner despublica y audita')

  // Prospect submission goes through the anonymous public callable from the real landing UI.
  await navigate('/')
  await waitFor(() => evaluate(`!!document.querySelector('#planes button')`), Boolean, 'Landing no cargó planes publicados')
  const initialPublicPlans = await evaluate(`document.querySelector('#planes')?.innerText || ''`)
  assert(!initialPublicPlans.includes(planName), 'La oferta despublicada no debe permanecer en landing.')
  assert(!/Mostrador Inicial|Fast Food Pro|Cadena Fast Food|Comercio Básico|Comercio Pro/i.test(initialPublicPlans), 'La landing no debe presentar planes de referencia estáticos cuando no hay publicación aprobada.')
  const requestButtons = await evaluate(`([...document.querySelectorAll('#planes button')].filter(button=>button.textContent.includes('Solicitar información')).length)`)
  assert(requestButtons >= 1, 'No apareció el formulario comercial público.')
  await evaluate(`([...document.querySelectorAll('#planes button')].filter(button=>button.textContent.includes('Solicitar información')).at(-1)).click()`, true)
  await waitFor(() => evaluate(`!!document.querySelector('[role="dialog"] input[name="companyName"]')`), Boolean, 'No abrió el diálogo de solicitud pública')
  const setField = (name, value) => evaluate(`(() => {const input=document.querySelector('[role="dialog"] [name=${JSON.stringify(name)}]');if(!input)throw new Error('Missing '+${JSON.stringify(name)});const proto=input instanceof HTMLTextAreaElement?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;const setter=Object.getOwnPropertyDescriptor(proto,'value').set;setter.call(input,${JSON.stringify(value)});input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));})()`)
  await setField('contactName', 'QA Comercial C1.3')
  await setField('companyName', companyName)
  await setField('contactPhone', '+591 70000000')
  await setField('businessType', 'Comercio ficticio de emulador')
  await setField('needs', 'Solicitud de prueba C1.3')
  await evaluate(`document.querySelector('[role="dialog"] input[name="consent"]').click()`, true)
  await evaluate(`([...document.querySelectorAll('[role="dialog"] button')].find(button=>button.textContent.includes('Enviar solicitud'))).click()`, true)
  await waitFor(() => evaluate('document.querySelector("[role=dialog]")?.innerText || ""'), value => value.includes('Solicitud recibida'), 'La UI no confirmó recepción pública')
  const intentDoc = await waitFor(async () => (await db.collection('platformCommercialIntents').where('companyName', '==', companyName).get()).docs[0], value => Boolean(value), 'La solicitud anónima no persistió')
  assert.equal(intentDoc.data().uid, null)
  assert.equal(intentDoc.data().tenantId, null)
  assert.equal(intentDoc.data().planSnapshot, null)
  assert.equal(intentDoc.data().subscriptionStatus, null)
  assert.equal(intentDoc.data().entitlements, null)
  console.log('PASS Chrome: visitante anónimo envía solicitud por formulario real; plan snapshot y sin tenant/pago/entitlements')
  const intentRef = intentDoc
  // Owner reviews the same lead and prepares a non-binding proposal in Admin UI.
  await navigate('/admin/login')
  await fillLogin(credentials.owner)
  await waitFor(() => evaluate(`!!document.querySelector('[data-admin-tab="commercial-intents"]')`), Boolean, 'Owner no volvió a entrar')
  await evaluate(`document.querySelector('[data-admin-tab="commercial-intents"]').click()`, true)
  await waitFor(() => evaluate('document.body.innerText'), value => value.includes(companyName), 'La solicitud no aparece en el Admin')
  await evaluate(`([...document.querySelectorAll('button')].find(button=>button.textContent.includes(${JSON.stringify(companyName)}))?.click())`, true)
  await waitFor(() => evaluate('document.body.innerText'), value => value.includes('Solicitud de prueba C1.3'), 'No cargó el detalle de la solicitud')
  await evaluate(`(() => {const select=[...document.querySelectorAll('select')].find(item=>[...item.options].some(option=>option.value==='contacted'));if(!select)throw new Error('Missing follow-up status select');const setter=Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set;setter.call(select,'contacted');select.dispatchEvent(new Event('input',{bubbles:true}));select.dispatchEvent(new Event('change',{bubbles:true}));})()`)
  await evaluate(`([...document.querySelectorAll('button')].find(button=>button.textContent.includes('Actualizar estado'))).click()`, true)
  await waitFor(() => evaluate('document.querySelector("[role=status]")?.textContent || ""'), value => value.includes('Estado de solicitud actualizado'), 'Admin no confirmó el cambio de estado')
  assert.equal((await db.doc(`platformCommercialIntents/${intentRef.id}`).get()).data().status, 'contacted')
  console.log('PASS Chrome: Owner actualiza estado de la solicitud y el cambio persiste')
  await evaluate(`(() => {
    const values = [['Implementación única', '450'], ['Mensualidad', '37'], ['Anualidad', '370']];
    for(const [labelText,value] of values){const label=[...document.querySelectorAll('label')].find(item=>item.textContent.includes(labelText));const input=label?.querySelector('input');if(!input)throw new Error('Missing '+labelText);const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;setter.call(input,value);input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));}
    [...document.querySelectorAll('button')].find(button=>button.textContent.includes('Guardar propuesta en borrador')).click();
  })()`, true)
  await waitFor(() => evaluate('document.querySelector("[role=status]")?.textContent || ""'), value => value.includes('Propuesta guardada como borrador'), 'No confirmó propuesta en el Admin')
  const persistedIntent = (await db.doc(`platformCommercialIntents/${intentRef.id}`).get()).data()
  assert.equal(persistedIntent.proposal.status, 'draft')
  assert.equal(persistedIntent.proposal.implementationOneTime, 450)
  assert.equal(persistedIntent.proposal.monthlyPrice, 37)
  assert.equal(persistedIntent.proposal.annualPrice, 370)
  assert.equal(persistedIntent.tenantId, null)
  console.log('PASS Chrome: Owner consulta lead y persiste propuesta con implementación/mensualidad separadas')

  await logout()
  await fillLogin(credentials.support)
  await waitFor(() => evaluate(`!!document.querySelector('[data-admin-tab="dashboard"]')`), Boolean, 'Support no pudo abrir su sesión autorizada')
  assert.equal(await evaluate(`!!document.querySelector('[data-admin-tab="commercial-intents"]')`), false, 'Support no debe ver la sección de leads.')
  const supportAttempt = await evaluate(`(async()=>{try{const {gateway}=await import('/src/services/gateway.ts');await gateway('platformGateway',{action:'listCommercialIntents',limit:5});return {denied:false}}catch(error){return {denied:true,code:error.code||'',message:error.message||''}}})()`)
  assert(supportAttempt.denied && supportAttempt.code.includes('permission-denied'), `Support debía ser rechazado por el gateway: ${JSON.stringify(supportAttempt)}`)
  console.log('PASS Chrome: Support no ve leads y gateway rechaza la lectura')

  await logout()
  await fillLogin(credentials.ordinary)
  await waitFor(() => evaluate('document.body.innerText'), value => /denegado|no posee rol/i.test(value), 'Usuario común no recibió rechazo visible de Admin')
  assert.equal(await evaluate(`!!document.querySelector('[data-admin-tab]')`), false, 'Usuario común no debe acceder al panel.')
  console.log('PASS Chrome: usuario ordinario autenticado es rechazado por Admin')

  const publicCatalogAfterUnpublish = (await db.doc('platformConfig/publicCommercialCatalog').get()).data()?.catalog
  assert(!publicCatalogAfterUnpublish?.plans?.some(plan => plan.id === planId), 'El snapshot debe omitir la oferta despublicada.')
  console.log('PASS callable público: catálogo actualizado omite oferta despublicada; ninguna acción creó tenant, suscripción o entitlement')
} finally {
  if (socketOpen) { try { socket.close() } catch { /* Browser teardown. */ } }
  if (browser) { browser.kill(); await sleep(400) }
  if (profile) rmSync(profile, { recursive: true, force: true })
  await cleanup()
  try { await deleteApp(adminApp) } catch (error) { cleanupErrors.push(`Admin app: ${error.message}`) }
  if (cleanupErrors.length) throw new Error(`Falló la limpieza de fixtures Emulator: ${cleanupErrors.join('; ')}`)
}
