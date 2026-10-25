import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { createServer as createTcpServer } from 'node:net'
import { createServer } from 'node:http'
import { extname, join, resolve, sep } from 'node:path'
import { tmpdir } from 'node:os'

const chrome = [process.env.CHROME_BIN, 'C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe'].filter(Boolean).find(existsSync)
assert.ok(chrome, 'Chrome not found')
const root = resolve('dist')
const evidenceDir = resolve('docs/demo-app-integration-evidence')
assert.ok(existsSync(join(root, 'demo-isolated.html')), 'Run npm run build:emulator first')
mkdirSync(evidenceDir, { recursive: true })

const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.woff2': 'font/woff2', '.json': 'application/json' }
const csp = "default-src 'self'; base-uri 'self'; object-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'none'; frame-src 'none'; frame-ancestors 'none'; form-action 'self'; media-src 'self' blob:"
const requests = []
const server = createServer((req, res) => {
  const url = new URL(req.url || '/', 'http://127.0.0.1')
  let pathname
  try { pathname = decodeURIComponent(url.pathname) } catch { res.writeHead(400).end(); return }
  requests.push({ path: pathname, method: req.method })
  if (pathname === '/favicon.ico') { res.writeHead(204).end(); return }
  let filePath = pathname === '/demo/hamburger' || pathname === '/demo/retail'
    ? join(root, 'demo-isolated.html')
    : pathname === '/demo' || pathname.startsWith('/demo/')
      ? join(root, 'demo.html')
      : pathname === '/studio' || pathname.startsWith('/studio/')
        ? join(root, 'studio.html')
        : pathname === '/'
          ? join(root, 'index.html')
          : resolve(root, `.${pathname}`)
  if (!filePath.startsWith(root + sep) && filePath !== join(root, 'index.html')) { res.writeHead(403).end(); return }
  if (!existsSync(filePath)) {
    if (pathname.startsWith('/assets/') || pathname.startsWith('/demo-assets/') || extname(pathname)) { res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8', 'x-content-type-options': 'nosniff' }).end('Not found'); return }
    filePath = join(root, 'index.html')
  }
  const isIsolatedHtml = filePath === join(root, 'demo-isolated.html')
  const headers = { 'content-type': types[extname(filePath)] || 'application/octet-stream', 'x-content-type-options': 'nosniff' }
  if (isIsolatedHtml) Object.assign(headers, { 'content-security-policy': csp, 'referrer-policy': 'no-referrer', 'x-frame-options': 'DENY', 'cache-control': 'no-store' })
  else if (pathname.startsWith('/demo-assets/')) headers['cache-control'] = 'public, max-age=31536000, immutable'
  res.writeHead(200, headers)
  res.end(readFileSync(filePath))
})
await new Promise((done) => server.listen(0, '127.0.0.1', done))
const { port } = server.address()
const debugProbe = createTcpServer()
await new Promise((done) => debugProbe.listen(0, '127.0.0.1', done))
const debugPort = debugProbe.address().port
await new Promise((done) => debugProbe.close(done))
const profile = mkdtempSync(join(tmpdir(), 'pachax-main-demo-integration-'))
const browser = spawn(chrome, ['--headless=new', '--disable-gpu', '--no-sandbox', '--disable-background-networking', '--disable-sync', '--no-first-run', '--no-default-browser-check', `--remote-debugging-port=${debugPort}`, '--remote-allow-origins=*', `--user-data-dir=${profile}`, 'about:blank'], { stdio: 'ignore' })
const wait = (ms) => new Promise((done) => setTimeout(done, ms))
let socket
const browserErrors = []
const browserRequests = []
try {
  let tab
  for (let attempt = 0; attempt < 100; attempt++) {
    await wait(100)
    try { tab = (await (await fetch(`http://127.0.0.1:${debugPort}/json`)).json()).find((entry) => entry.type === 'page'); if (tab?.webSocketDebuggerUrl) break } catch {}
  }
  assert.ok(tab?.webSocketDebuggerUrl, 'Chrome CDP did not open')
  socket = new WebSocket(tab.webSocketDebuggerUrl)
  await new Promise((done, fail) => { socket.onopen = done; socket.onerror = fail })
  let sequence = 1
  const pending = new Map()
  socket.onmessage = ({ data }) => {
    const message = JSON.parse(data)
    if (!pending.has(message.id)) return
    const task = pending.get(message.id); pending.delete(message.id)
    message.error ? task.reject(new Error(JSON.stringify(message.error))) : task.resolve(message.result)
  }
  const send = (method, params = {}) => new Promise((resolvePromise, reject) => { const id = sequence++; pending.set(id, { resolve: resolvePromise, reject }); socket.send(JSON.stringify({ id, method, params })) })
  const evaluate = async (expression) => {
    const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
    if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails))
    return result.result.value
  }
  const selectValue = async (label, value) => evaluate(`(() => { const select = document.querySelector('select[aria-label=${JSON.stringify(label)}]'); if (!select) return false; const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set; setter.call(select, ${JSON.stringify(value)}); select.dispatchEvent(new Event('change', { bubbles: true })); return true })()`)
  const ready = async () => {
    for (let attempt = 0; attempt < 100; attempt++) { await wait(100); if (await evaluate("Boolean(document.querySelector('[data-demo-only-ready=\\\"true\\\"]'))")) return }
    throw new Error('Isolated demo did not signal ready')
  }
  socket.addEventListener('message', ({ data }) => {
    const message = JSON.parse(data)
    if (message.method === 'Runtime.exceptionThrown') browserErrors.push(message.params.exceptionDetails?.text || 'runtime exception')
    if (message.method === 'Log.entryAdded' && message.params.entry.level === 'error') browserErrors.push(message.params.entry.text)
    if (message.method === 'Network.requestWillBeSent') browserRequests.push(message.params.request.url)
  })
  await send('Page.enable'); await send('Runtime.enable'); await send('Log.enable'); await send('Network.enable')

  const routeResults = []
  for (const template of ['hamburger', 'retail']) for (const dataset of ['full', 'empty']) for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
    await send('Emulation.setDeviceMetricsOverride', { ...viewport, deviceScaleFactor: 1, mobile: viewport.width < 500 })
    const route = `/demo/${template}?data=${dataset}`
    const response = await fetch(`http://127.0.0.1:${port}${route}`)
    assert.equal(response.status, 200, `${route} must resolve directly`)
    assert.match(response.headers.get('content-security-policy') || '', /connect-src 'none'/)
    assert.equal(response.headers.get('cache-control'), 'no-store')
    browserRequests.length = 0
    await send('Page.navigate', { url: `http://127.0.0.1:${port}${route}` }); await ready()
    await send('Page.reload', { ignoreCache: true }); await ready(); await wait(150)
    const state = await evaluate(`(() => ({ heading: document.querySelector('header p.truncate')?.innerText || '', text: document.body.innerText, overflow: document.documentElement.scrollWidth > innerWidth || document.body.scrollWidth > innerWidth, guard: window.__PACHAX_DEMO_ISOLATION__?.attempts || null, rootChildren: document.querySelector('#root')?.children.length || 0 }))()`)
    assert.ok(state.heading.toLowerCase().includes(template === 'hamburger' ? 'restaurante rápido' : 'comercio / venta rápida'), `${route} loaded wrong app: ${state.heading}`)
    assert.equal(state.rootChildren > 0, true)
    assert.equal(state.overflow, false, `${route} ${viewport.width}x${viewport.height}: horizontal overflow`)
    assert.equal(state.guard?.length, 0, `${route}: external request blocked by guard`)
    const externalRequests = browserRequests.filter((url) => !url.startsWith(`http://127.0.0.1:${port}/`) && !/^(?:data:|blob:|about:)/.test(url))
    assert.deepEqual(externalRequests, [], `${route}: browser requested external services: ${externalRequests.join(', ')}`)
    const marker = template === 'hamburger' ? 'Hamburguesa clásica' : 'Helado artesanal'
    assert.equal(state.text.includes(marker), dataset === 'full', `${route}: wrong dataset state`)
    assert.equal(await selectValue('Rol simulado', 'cashier'), true, `${route}: role selector missing`)
    assert.equal(await selectValue('Rol simulado', 'admin'), true, `${route}: role selector could not restore admin`)
    const reset = await evaluate(`(() => { const button = [...document.querySelectorAll('button')].find(item => item.innerText.trim() === 'Reiniciar'); button?.click(); return Boolean(button) })()`)
    assert.equal(reset, true, `${route}: reset control missing`)
    await wait(150)
    routeResults.push({ route, viewport: `${viewport.width}x${viewport.height}`, refresh: 'PASS', roleChange: 'PASS', reset: 'PASS', csp: 'connect-src none', noStore: true, overflow: state.overflow, ready: true })
  }
  const demoBrowserErrors = [...browserErrors]
  assert.deepEqual(demoBrowserErrors, [], `Isolated demo browser errors: ${demoBrowserErrors.join('; ')}`)

  await send('Emulation.clearDeviceMetricsOverride')
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true })
  await send('Page.navigate', { url: `http://127.0.0.1:${port}/` })
  await wait(1600)
  await wait(1200)
  const landingButtons = await evaluate(`(() => [...document.querySelectorAll('button')].map(button => button.innerText.trim()).filter(text => text === 'Probar demo'))()`)
  assert.ok(landingButtons.length > 0, `Landing CTA missing: ${landingButtons}`)
  const landingNavigation = []
  for (const item of [{ label: 'Hamburger', route: '/demo/hamburger?data=full', marker: 'Restaurante Rápido' }, { label: 'Retail', route: '/demo/retail?data=full', marker: 'Comercio / Venta Rápida' }]) {
    if (item.label === 'Retail') {
      const next = await evaluate(`(() => { const region = document.querySelector('[aria-label="Carrusel de soluciones autoservicio"]'); const button = region?.querySelector('button[aria-label="Siguiente plantilla"]'); button?.click(); return Boolean(button) })()`)
      assert.equal(next, true, 'Self-service carousel could not select the Retail card')
      await wait(250)
    }
    const click = await evaluate(`(() => { const button = [...document.querySelectorAll('button')].find(candidate => candidate.innerText.trim() === 'Probar demo'); if (!button) return false; button.scrollIntoView(); button.click(); return true })()`)
    assert.equal(click, true, `Landing click missing for ${item.label}`)
    await ready()
    assert.equal(await evaluate('location.pathname + location.search'), item.route, `${item.label} routed incorrectly`)
    const activeDemoHeading = await evaluate("document.querySelector('header p.truncate')?.innerText || ''")
    assert.ok(activeDemoHeading.toLowerCase().includes(item.marker.toLowerCase()), `${item.label} launched wrong demo: ${activeDemoHeading}`)
    landingNavigation.push({ label: item.label, route: item.route, result: 'PASS' })
    await send('Page.navigate', { url: `http://127.0.0.1:${port}/` }); await wait(1200)
  }

  for (const [route, expectedFile] of [['/demo/restaurant', 'demo.html'], ['/studio', 'studio.html'], ['/admin/login', 'index.html']]) {
    const response = await fetch(`http://127.0.0.1:${port}${route}`)
    assert.equal(response.status, 200, `${route} legacy route should remain available`)
    const html = await response.text()
    assert.equal(html, readFileSync(join(root, expectedFile), 'utf8'), `${route} returned unexpected document`)
  }
  const missingAsset = await fetch(`http://127.0.0.1:${port}/demo-assets/__not-present__.js`)
  assert.equal(missingAsset.status, 404, 'missing isolated asset must remain a 404')
  const nonDemoNetwork = []
  const productionRequests = browserRequests.filter((url) => /(?:googleapis\.com|cloudfunctions\.net|firebaseio\.com|firebaseapp\.com)/i.test(url))
  assert.deepEqual(productionRequests, [], `Firebase Production request detected: ${productionRequests.join(', ')}`)

  const landingErrors = browserErrors.slice(demoBrowserErrors.length)
  const report = { result: 'PASS', server: `127.0.0.1:${port}`, routes: routeResults, landingNavigation, otherEntrypoints: 'demo.html, studio.html, and app fallback served', missingAsset: '404', isolatedDemoExternalRequests: nonDemoNetwork.length, isolatedDemoBrowserErrors: demoBrowserErrors.length, productionFirebaseRequests: productionRequests.length, landingConsoleErrorsWithEmulatorsStopped: landingErrors }
  writeFileSync(resolve(evidenceDir, 'integration-browser.json'), `${JSON.stringify(report, null, 2)}\n`)
  console.log(JSON.stringify(report, null, 2))
} finally {
  socket?.close()
  browser.kill()
  await new Promise((done) => server.close(done))
}
