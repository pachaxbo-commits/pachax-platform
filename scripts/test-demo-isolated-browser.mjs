import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { createServer as createTcpServer } from 'node:net'
import { createServer } from 'node:http'
import { extname, join, resolve, sep } from 'node:path'
import { tmpdir } from 'node:os'

const chrome = [process.env.CHROME_BIN, 'C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe']
  .filter(Boolean).find(existsSync)
assert.ok(chrome, 'Chrome no encontrado')

const root = resolve('dist-demo-isolated')
const output = resolve('docs/demo-isolation-d5-evidence')
assert.ok(existsSync(join(root, 'demo-isolated.html')), 'Ejecuta antes npm run build:demos-only')
mkdirSync(output, { recursive: true })
const contentTypes = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.woff2': 'font/woff2', '.json': 'application/json' }
const csp = "default-src 'self'; base-uri 'self'; object-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'none'; frame-src 'none'; frame-ancestors 'none'; form-action 'self'; media-src 'self' blob:"
const staticServer = createServer((req, res) => {
  const pathname = new URL(req.url || '/', 'http://localhost').pathname
  if (pathname === '/favicon.ico') { res.writeHead(204).end(); return }
  if (pathname.startsWith('/demo/') && !['/demo/hamburger', '/demo/retail'].includes(pathname)) { res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }).end('Not found'); return }
  let file = ['/', '/demo', '/demo/hamburger', '/demo/retail'].includes(pathname)
    ? join(root, 'demo-isolated.html')
    : resolve(root, `.${decodeURIComponent(pathname)}`)
  if (!file.startsWith(root + sep) && file !== join(root, 'demo-isolated.html')) { res.writeHead(403).end(); return }
  if (!existsSync(file)) { res.writeHead(404).end(); return }
  try {
    const isHtml = extname(file) === '.html'
    res.writeHead(200, {
      'content-type': contentTypes[extname(file)] || 'application/octet-stream',
      'cache-control': isHtml ? 'no-store' : 'public, max-age=31536000, immutable',
      'content-security-policy': csp,
      'referrer-policy': 'no-referrer',
      'x-content-type-options': 'nosniff',
      'x-frame-options': 'DENY',
    })
    res.end(readFileSync(file))
  } catch { res.writeHead(500).end() }
})
await new Promise((done) => staticServer.listen(0, '127.0.0.1', done))
const { port } = staticServer.address()
const localHttpEvidence = []
for (const path of ['/', '/demo', '/demo/hamburger?data=full', '/demo/hamburger?data=empty', '/demo/retail?data=full', '/demo/retail?data=empty']) {
  const response = await fetch(`http://127.0.0.1:${port}${path}`)
  assert.equal(response.status, 200, `${path}: ruta directa debía servir la app`)
  assert.match(response.headers.get('content-type') || '', /text\/html/i, `${path}: MIME HTML esperado`)
  assert.match(response.headers.get('content-security-policy') || '', /connect-src 'none'/, `${path}: CSP de red ausente`)
  assert.equal(response.headers.get('x-frame-options'), 'DENY', `${path}: protección anti-iframe ausente`)
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff', `${path}: nosniff ausente`)
  assert.equal(response.headers.get('cache-control'), 'no-store', `${path}: HTML de ruta debe evitar caché`)
  localHttpEvidence.push({ path, status: response.status, contentType: response.headers.get('content-type'), csp: response.headers.get('content-security-policy') })
}
for (const path of ['/assets/__missing_d5_probe__.js', '/demo/__missing_d5_probe__']) {
  const response = await fetch(`http://127.0.0.1:${port}${path}`)
  assert.equal(response.status, 404, `${path}: no debe resolverse como aplicación HTML`)
  assert.doesNotMatch(response.headers.get('content-type') || '', /text\/html/i, `${path}: un recurso ausente devolvió HTML`)
  localHttpEvidence.push({ path, status: response.status, contentType: response.headers.get('content-type') })
}
const debugPortProbe = createTcpServer()
await new Promise((done) => debugPortProbe.listen(0, '127.0.0.1', done))
const debugPort = debugPortProbe.address().port
await new Promise((done) => debugPortProbe.close(done))
const profileDir = mkdtempSync(join(tmpdir(), 'pachax-demo-isolation-'))
const browser = spawn(chrome, [
  '--headless=new', '--disable-gpu', '--no-sandbox', '--disable-background-networking', '--disable-sync',
  '--no-first-run', '--no-default-browser-check', `--remote-debugging-port=${debugPort}`,
  '--remote-allow-origins=*', `--user-data-dir=${profileDir}`, 'about:blank',
], { stdio: 'ignore' })
const wait = (ms) => new Promise((done) => setTimeout(done, ms))
let socket
const cases = []
const blockedRequests = []
const browserErrors = []
const failedResponses = []
const browserRequests = []

try {
  let tab
  for (let tries = 0; tries < 100; tries++) {
    await wait(200)
    try {
      tab = (await (await fetch(`http://127.0.0.1:${debugPort}/json`)).json()).find((item) => item.type === 'page')
      if (tab?.webSocketDebuggerUrl) break
    } catch { /* Chromium todavía inicia. */ }
  }
  assert.ok(tab?.webSocketDebuggerUrl, 'Chrome CDP no abrió una pestaña')
  socket = new WebSocket(tab.webSocketDebuggerUrl)
  await new Promise((done, fail) => { socket.onopen = done; socket.onerror = fail })
  let sequence = 1
  const pending = new Map()
  socket.onmessage = ({ data }) => {
    const message = JSON.parse(data)
    const task = pending.get(message.id)
    if (!task) return
    pending.delete(message.id)
    message.error ? task.reject(new Error(JSON.stringify(message.error))) : task.resolve(message.result)
  }
  const send = (method, params = {}) => new Promise((resolvePromise, reject) => {
    const id = sequence++
    pending.set(id, { resolve: resolvePromise, reject })
    socket.send(JSON.stringify({ id, method, params }))
  })
  const evaluate = async (expression) => {
    const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
    if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails))
    return result.result.value
  }
  const clickButton = async (label, match = 'exact') => evaluate(`(() => { const button = [...document.querySelectorAll('button')].find(item => ${match === 'starts' ? `item.innerText.trim().startsWith(${JSON.stringify(label)})` : `item.innerText.trim() === ${JSON.stringify(label)}`}); if (!button) return false; button.click(); return true })()`)
  const waitReady = async () => {
    for (let attempt = 0; attempt < 100; attempt++) {
      await wait(150)
      if (await evaluate("Boolean(document.querySelector('[data-demo-only-ready=\\\"true\\\"]'))")) return
    }
    throw new Error('La aplicación aislada no llegó al estado listo.')
  }
  const selectValue = async (ariaLabel, value) => evaluate(`(() => { const select = document.querySelector('select[aria-label="${ariaLabel}"]'); if (!select) return false; const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set; setter.call(select, ${JSON.stringify(value)}); select.dispatchEvent(new Event('change', { bubbles: true })); return true })()`)

  socket.addEventListener('message', ({ data }) => {
    const message = JSON.parse(data)
    if (message.method === 'Runtime.exceptionThrown') browserErrors.push(message.params.exceptionDetails?.text || 'runtime exception')
    if (message.method === 'Log.entryAdded' && message.params.entry.level === 'error') browserErrors.push(message.params.entry.text)
    if (message.method === 'Network.responseReceived' && message.params.response.status >= 400) failedResponses.push({ status: message.params.response.status, url: message.params.response.url })
    if (message.method === 'Network.requestWillBeSent') browserRequests.push({ url: message.params.request.url, type: message.params.type || 'unknown', method: message.params.request.method })
    if (message.method === 'Fetch.requestPaused') {
      const requestId = message.params.requestId
      const url = message.params.request.url
      let local = false
      try { local = new URL(url).origin === `http://127.0.0.1:${port}` } catch { /* URLs inválidas se bloquean. */ }
      if (local) {
        void send('Fetch.continueRequest', { requestId })
      } else {
        blockedRequests.push({ url, resourceType: message.params.resourceType })
        void send('Fetch.failRequest', { requestId, errorReason: 'BlockedByClient' })
      }
    }
  })

  await send('Page.enable')
  await send('Runtime.enable')
  await send('Log.enable')
  await send('Network.enable')
  await send('Fetch.enable', { patterns: [{ urlPattern: '*' }] })

  const viewports = [
    { name: 'desktop', width: 1440, height: 900, mobile: false },
    { name: 'mobile', width: 390, height: 844, mobile: true },
  ]
  for (const template of ['hamburger', 'retail']) {
    for (const dataset of ['full', 'empty']) {
      for (const viewport of viewports) {
        await send('Emulation.setDeviceMetricsOverride', { width: viewport.width, height: viewport.height, deviceScaleFactor: 1, mobile: viewport.mobile })
        const url = `http://127.0.0.1:${port}/demo/${template}?data=${dataset}`
        await send('Page.navigate', { url })
        await waitReady()
        await evaluate('localStorage.clear(); sessionStorage.clear(); true')
        await send('Page.reload', { ignoreCache: true })
        await waitReady()
        await wait(300)
        const snapshot = await evaluate(`(() => ({
          text: document.body.innerText.slice(0, 14000),
          buttons: [...document.querySelectorAll('button')].map(b => b.innerText.trim()).filter(Boolean).slice(0, 90),
          selects: [...document.querySelectorAll('select')].map(s => ({ label: s.getAttribute('aria-label'), value: s.value })),
          overflow: document.documentElement.scrollWidth > innerWidth || document.body.scrollWidth > innerWidth,
          guard: window.__PACHAX_DEMO_ISOLATION__?.attempts || null,
          rootChildren: document.querySelector('#root')?.children.length || 0,
          routeHeading: document.querySelector('header p.truncate')?.innerText || '',
        }))()`)
        assert.equal(snapshot.rootChildren > 0, true, `${url}: React root vacía`)
        assert.ok(snapshot.routeHeading.toLocaleLowerCase().includes(template === 'hamburger' ? 'restaurante rápido' : 'comercio / venta rápida'), `${url}: se montó otra plantilla: ${snapshot.routeHeading}`)
        assert.equal(snapshot.overflow, false, `${url} ${viewport.name}: overflow horizontal`)
        assert.equal(snapshot.guard?.length, 0, `${url}: el guard registró salida de red: ${JSON.stringify(snapshot.guard)}`)
        assert.ok(snapshot.text.includes('datos ficticios') || snapshot.text.includes('Datos ficticios') || snapshot.text.includes('demo'), `${url}: faltó identificación de entorno demo`)
        const fullFixtureMarker = template === 'hamburger' ? 'Hamburguesa clásica' : 'Helado artesanal'
        assert.equal(snapshot.text.includes(fullFixtureMarker), dataset === 'full', `${url}: el conjunto ${dataset} no coincide con sus datos visibles`)

        const roleSelect = snapshot.selects.find((item) => item.label === 'Rol simulado')
        assert.ok(roleSelect, `${url}: selector de rol ausente`)
        const file = `${template}-${dataset}-${viewport.name}.png`
        const initialCapture = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
        writeFileSync(join(output, file), Buffer.from(initialCapture.data, 'base64'))
        const otherDataset = dataset === 'full' ? 'empty' : 'full'
        assert.equal(await selectValue('Conjunto de datos', otherDataset), true, `${url}: selector de datos no respondió`)
        await wait(150)
        const switchedText = await evaluate('document.body.innerText')
        assert.equal(switchedText.includes(fullFixtureMarker), otherDataset === 'full', `${url}: cambiar el conjunto no actualizó los datos`)
        assert.equal(await evaluate("new URLSearchParams(window.location.search).get('data')"), otherDataset, `${url}: cambiar el conjunto no actualizó la ruta`)
        assert.equal(await selectValue('Conjunto de datos', dataset), true, `${url}: no pudo restaurar el conjunto original`)
        await wait(150)
        assert.equal(await selectValue('Rol simulado', 'cashier'), true, `${url}: no seleccionó Caja`)
        await wait(150)
        assert.equal(await selectValue('Rol simulado', 'admin'), true, `${url}: no volvió a Administrador`)
        await wait(150)
        assert.equal(await clickButton('Reiniciar'), true, `${url}: faltó reinicio local`)
        await wait(250)
        assert.equal(await clickButton('Galería'), true, `${url}: no regresó a la galería`)
        await waitReady()
        assert.ok((await evaluate('document.body.innerText')).includes('Restaurante Rápido'), 'La galería no mostró Restaurante Rápido')
        const openFromCard = await evaluate(`(() => { const article = [...document.querySelectorAll('article')].find(item => item.innerText.includes(${JSON.stringify(template === 'hamburger' ? 'Restaurante Rápido' : 'Comercio / Venta Rápida')})); const button = [...(article?.querySelectorAll('button') || [])].find(item => item.innerText.trim() === ${JSON.stringify(dataset === 'full' ? 'Abrir datos completos' : 'Abrir desde cero')}); button?.click(); return Boolean(button) })()`)
        assert.equal(openFromCard, true, `${url}: no reabrió la tarjeta correcta desde la galería`)
        await wait(200)
        await waitReady()
        const returnedHeading = await evaluate("document.querySelector('header p.truncate')?.innerText || ''")
        assert.ok(returnedHeading.toLocaleLowerCase().includes(template === 'hamburger' ? 'restaurante rápido' : 'comercio / venta rápida'), `${url}: la galería abrió una plantilla incorrecta: ${returnedHeading}`)

        cases.push({ template, dataset, viewport: `${viewport.width}x${viewport.height}`, path: `/demo/${template}?data=${dataset}`, overflow: snapshot.overflow, roleSwitch: 'PASS', reset: 'PASS', galleryReturn: 'PASS', screenshot: file, initialButtons: snapshot.buttons, initialSelects: snapshot.selects, routeHeading: snapshot.routeHeading })
        await send('Page.reload', { ignoreCache: true })
        await waitReady()
      }
    }
  }

  await send('Page.navigate', { url: `http://127.0.0.1:${port}/` })
  await waitReady()
  assert.ok((await evaluate('document.body.innerText')).includes('Demostraciones interactivas'), 'La raíz no montó la galería de demos.')

  const hamburgerUrl = `http://127.0.0.1:${port}/demo/hamburger?data=full`
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false })
  await send('Page.navigate', { url: hamburgerUrl })
  await waitReady()
  const hamburgerProduct = await evaluate(`(() => { const button = [...document.querySelectorAll('button[aria-label^="Agregar "]')].find(item => item.getAttribute('aria-label').endsWith('al pedido')); button?.click(); return button?.getAttribute('aria-label') || null })()`)
  assert.ok(hamburgerProduct, 'Restaurante Rápido no expuso productos ficticios en POS')
  await wait(150)
  assert.equal(await clickButton('PAGADO'), true, 'Restaurante Rápido no permitió marcar el pedido como pagado')
  assert.equal(await clickButton('QR'), true, 'Restaurante Rápido no permitió elegir QR simulado')
  assert.equal(await clickButton('Cobrar ', 'starts'), true, 'Restaurante Rápido no permitió confirmar la venta simulada')
  await wait(450)
  const hamburgerSale = await evaluate(`(() => ({ text: document.body.innerText.slice(-5000), dialog: Boolean(document.querySelector('[role="dialog"]')) }))()`)
  assert.ok(hamburgerSale.text.includes(hamburgerProduct.replace('Agregar ', '').replace(' al pedido', '')), `Restaurante Rápido no conservó el producto en el pedido: ${hamburgerSale.text}`)
  await clickButton('Pedidos')
  await wait(200)
  const hamburgerOrdersText = await evaluate('document.body.innerText.slice(-7000)')
  assert.ok(hamburgerOrdersText.includes(hamburgerProduct.replace('Agregar ', '').replace(' al pedido', '')) && hamburgerOrdersText.includes('Bs 38.00'), `Restaurante Rápido no mostró la venta simulada en pedidos/historial: ${hamburgerOrdersText}`)
  await clickButton('Caja')
  await wait(200)
  const hamburgerCashText = await evaluate('document.body.innerText.slice(-7000)')
  assert.ok(/Bs|Bolivianos/.test(hamburgerCashText), 'Restaurante Rápido Caja no mostró importes simulados')
  assert.ok(hamburgerCashText.includes('TOTAL VENTAS\nBs 76,00') && hamburgerCashText.includes('EFECTIVO\nBs 38,00') && hamburgerCashText.includes('QR\nBs 38,00'), `Restaurante Rápido no concilió la venta QR ficticia con Caja: ${hamburgerCashText.slice(0, 1400)}`)
  const hamburgerCashEvidence = hamburgerCashText.slice(0, 1600)
  const hamburgerGuard = await evaluate('window.__PACHAX_DEMO_ISOLATION__')

  const retailUrl = `http://127.0.0.1:${port}/demo/retail?data=full`
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false })
  await send('Page.navigate', { url: retailUrl })
  await waitReady()
  await evaluate(`(() => { const nav = [...document.querySelectorAll('button')].find(item => item.innerText.trim() === 'Inicio')?.parentElement; const cash = [...(nav?.querySelectorAll('button') || [])].find(item => item.innerText.trim() === 'Caja'); cash?.click(); return Boolean(cash) })()`)
  await wait(200)
  if (await evaluate("document.body.innerText.includes('Abrir turno')")) {
    const entered = await evaluate(`(() => { const input = document.querySelector('input[type="number"]'); if (!input) return false; const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; setter.call(input, '200'); input.dispatchEvent(new Event('input', { bubbles: true })); input.dispatchEvent(new Event('change', { bubbles: true })); return true })()`)
    assert.equal(entered, true, 'Retail Caja no expuso el fondo inicial simulado')
    assert.equal(await clickButton('Abrir caja de demostración'), true, 'Retail no abrió su caja ficticia')
    await wait(250)
  }
  await evaluate(`(() => { const nav = [...document.querySelectorAll('button')].find(item => item.innerText.trim() === 'Inicio')?.parentElement; const pos = [...(nav?.querySelectorAll('button') || [])].find(item => item.innerText.trim() === 'Nueva venta / POS'); pos?.click(); return Boolean(pos) })()`)
  await wait(250)
  const retailProduct = await evaluate(`(() => { const item = [...document.querySelectorAll('button')].find(button => button.innerText.toLowerCase().includes('por unidad') && button.innerText.includes('Bs')); item?.click(); return Boolean(item) })()`)
  assert.equal(retailProduct, true, 'Retail no expuso producto ficticio por unidad en el POS')
  await wait(150)
  assert.equal(await clickButton('Cobrar Venta', 'starts'), true, 'Retail no abrió el modal de cobro simulado')
  await wait(100)
  assert.equal(await clickButton('QR simulado'), true, 'Retail no permitió seleccionar QR simulado')
  await clickButton('Confirmar Cobro')
  await wait(300)
  const retailReceipt = await evaluate("document.body.innerText.match(/¡Venta registrada con éxito! Comprobante: ([^\\s]+)/)?.[1] || null")
  assert.ok(retailReceipt, 'Retail no confirmó la venta local simulada')
  assert.equal(await clickButton('Caja'), true, 'Retail no abrió Caja después de la venta')
  await wait(200)
  const retailCashText = await evaluate('document.body.innerText.slice(-8000)')
  assert.ok(/Bs|Bolivianos/.test(retailCashText) && /Ventas|Caja/.test(retailCashText), 'Retail Caja no mostró importes simulados')

  const finalGuard = await evaluate('window.__PACHAX_DEMO_ISOLATION__')
  const expectedPrintPolicyWarnings = browserErrors.filter((error) => error.includes("frame-src 'none'"))
  const unexpectedBrowserErrors = browserErrors.filter((error) => !error.includes('Failed to load resource') && !error.includes("frame-src 'none'"))
  const externalGuardAttempts = finalGuard.attempts.filter((attempt) => attempt.kind !== 'window.open')
  const externalHttpRequests = browserRequests.filter((request) => {
    try { return ['http:', 'https:'].includes(new URL(request.url).protocol) && new URL(request.url).origin !== `http://127.0.0.1:${port}` } catch { return false }
  })
  writeFileSync(join(output, 'results.json'), JSON.stringify({ builtArtifact: 'dist-demo-isolated', origin: `http://127.0.0.1:${port}`, csp, localHttpEvidence, browserRequests, externalHttpRequests, browserErrors, expectedPrintPolicyWarnings, failedResponses, blockedRequests, networkGuardAttempts: finalGuard.attempts, cspViolations: finalGuard.cspViolations, printCalls: finalGuard.printCalls, hamburgerNetworkGuardAttempts: hamburgerGuard.attempts, hamburgerCspViolations: hamburgerGuard.cspViolations, hamburgerPrintCalls: hamburgerGuard.printCalls, hamburgerSale: hamburgerProduct, hamburgerOrders: 'PASS', hamburgerCash: 'PASS', hamburgerCashEvidence, retailReceipt, retailCash: 'PASS', retailCashEvidence: retailCashText.slice(0, 1400), cases }, null, 2))
  assert.deepEqual(unexpectedBrowserErrors, [], `Errores JavaScript/console del navegador: ${JSON.stringify(unexpectedBrowserErrors)}`)
  assert.deepEqual(externalGuardAttempts, [], `El guard registró intentos de red externos: ${JSON.stringify(externalGuardAttempts)}`)
  assert.deepEqual(failedResponses, [], `Recursos locales fallidos: ${JSON.stringify(failedResponses)}`)
  assert.deepEqual(blockedRequests, [], `El navegador intentó peticiones externas: ${JSON.stringify(blockedRequests)}`)
  assert.deepEqual(externalHttpRequests, [], `El navegador pidió recursos HTTP externos: ${JSON.stringify(externalHttpRequests)}`)
  console.log(JSON.stringify({ unexpectedBrowserErrors, expectedPrintPolicyWarnings, cspViolations: finalGuard.cspViolations, networkGuardAttempts: finalGuard.attempts, failedResponses, blockedRequests, externalHttpRequests, browserRequests: browserRequests.length, hamburgerSale: hamburgerProduct, hamburgerOrders: 'PASS', hamburgerCash: 'PASS', retailReceipt, retailCash: 'PASS', cases: cases.length, evidence: output }, null, 2))
} finally {
  socket?.close()
  browser.kill()
  staticServer.close()
}
