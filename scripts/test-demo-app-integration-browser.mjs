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
const retailEvidenceDir = resolve('docs/retail-learning-center-evidence')
assert.ok(existsSync(join(root, 'demo-isolated.html')), 'Run npm run build:emulator first')
mkdirSync(evidenceDir, { recursive: true })
mkdirSync(retailEvidenceDir, { recursive: true })

const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.woff2': 'font/woff2', '.json': 'application/json' }
const csp = "default-src 'self'; base-uri 'self'; object-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'none'; frame-src 'none'; frame-ancestors 'self'; form-action 'self'; media-src 'self' blob:"
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
  if (isIsolatedHtml) Object.assign(headers, { 'content-security-policy': csp, 'referrer-policy': 'no-referrer', 'x-frame-options': 'SAMEORIGIN', 'cache-control': 'no-store' })
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
  const captureScreenshot = async (label, selector = null) => {
    const clip = selector ? await evaluate(`(() => { const rect=document.querySelector(${JSON.stringify(selector)})?.getBoundingClientRect(); return rect ? {x:rect.x,y:rect.y,width:rect.width,height:rect.height,scale:1} : null })()`) : null
    const capture = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: Boolean(clip), ...(clip ? { clip } : {}) })
    writeFileSync(join(retailEvidenceDir, `${label}.png`), Buffer.from(capture.data, 'base64'))
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
  for (const template of ['hamburger', 'retail']) for (const dataset of ['full', 'empty']) for (const width of [320, 360, 375, 390, 430, 768, 1024, 1440, 1920]) {
    const viewport = { width, height: width < 500 ? 844 : 1000 }
    await send('Emulation.setDeviceMetricsOverride', { ...viewport, deviceScaleFactor: 1, mobile: viewport.width < 500 })
    const route = `/demo/${template}?data=${dataset}`
    const response = await fetch(`http://127.0.0.1:${port}${route}`)
    assert.equal(response.status, 200, `${route} must resolve directly`)
    assert.match(response.headers.get('content-security-policy') || '', /connect-src 'none'/)
    assert.match(response.headers.get('content-security-policy') || '', /frame-ancestors 'self'/)
    assert.equal(response.headers.get('x-frame-options'), 'SAMEORIGIN')
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
    if (template === 'retail') {
      await evaluate(`(() => [...document.querySelectorAll('button')].find(button => button.innerText.includes('Abrir Centro de tutoriales'))?.click())()`)
      assert.match(await evaluate(`document.querySelector('[aria-label="Centro de tutoriales de Comercio"]')?.innerText||''`), /Centro de tutoriales/)
      const availableTours = await evaluate(`(() => [...document.querySelectorAll('[aria-label="Recorridos disponibles"] button')].map(button => ({ title: button.querySelector('span')?.innerText || '', disabled: button.disabled })) )()`)
      assert.equal(availableTours.length, 5, `${route}: all five guides are visible`)
      assert.equal(availableTours[0].disabled, false, `${route}: orientation stays available with any dataset`)
      assert.equal(availableTours.slice(1).every((tour) => tour.disabled === (dataset === 'empty')), true, `${route}: sale guides respect empty catalog state`)
      if (width === 390 || width === 320) await captureScreenshot(`${width}-${dataset}-tutorial-center`, '[aria-label="Centro de tutoriales de Comercio"]')
      if (width === 390 && dataset === 'full') {
        await selectValue('Rol simulado', 'inventory')
        assert.match(await evaluate(`document.querySelector('[aria-label="Centro de tutoriales de Comercio"]')?.innerText||''`), /El rol actual no tiene acceso/)
        await selectValue('Rol simulado', 'admin')
        assert.match(await evaluate(`document.querySelector('[aria-label="Recorridos disponibles"]')?.innerText||''`), /Venta por unidad/)
      }
      if (dataset === 'full' && (width === 1440 || width === 390)) {
        const evidencePrefix = `${width}`
        const clickText = async (text) => evaluate(`(() => { const button=[...document.querySelectorAll('button')].find(item => item.innerText.trim().includes(${JSON.stringify(text)})); button?.click(); return Boolean(button) })()`)
        const progress = async () => evaluate(`document.querySelector('[role="progressbar"][aria-label="Progreso del recorrido"]')?.getAttribute('aria-valuenow') || ''`)
        const completeCurrentStep = async (label) => { await wait(120); const state = await evaluate(`(() => ({ completed:Boolean([...document.querySelectorAll('span')].some(node => node.innerText.trim() === 'Acción completada')), step:document.querySelector('[aria-label="Centro de tutoriales de Comercio"] h3')?.innerText||'', dialogs:[...document.querySelectorAll('[role="dialog"]')].map(node=>node.innerText.slice(0,120)), events:window.__retailTutorialEvents||[], visibleText:document.body.innerText.slice(-300) }))()`); assert.equal(state.completed, true, `${label}: action event completes the current step; ${JSON.stringify(state)}`); assert.ok(await clickText('Siguiente'), `${label}: next is enabled after the real action`) }

        await clickText('Venta por unidad')
        if (width === 390) await captureScreenshot(`${evidencePrefix}-selected-tutorial`)
        await wait(100)
        await evaluate(`(() => { const input=document.querySelector('[data-tutorial-target="search"]'); input.focus(); const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set; setter.call(input,'Café Latte'); input.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'insertText',data:'Café Latte'})); })()`)
        await completeCurrentStep('Unit sale search')
        await evaluate(`(() => [...document.querySelectorAll('[data-tutorial-target="product"]')].find(button => button.innerText.includes('Café Latte'))?.click())()`)
        await completeCurrentStep('Unit product add')
        await evaluate(`document.querySelector('[data-tutorial-target="quantity"] button[aria-label^="Aumentar"]')?.click()`)
        await completeCurrentStep('Unit quantity update')
        await evaluate(`document.querySelector('[data-tutorial-target="total"]')?.click()`)
        await wait(150)
        assert.equal(await progress(), '4', 'Unit sale tutorial records four real actions')
        await captureScreenshot(`${evidencePrefix}-unit-sale`)
        await evaluate(`document.querySelector('[aria-label="Reiniciar recorrido"]')?.click()`)

        await clickText('Cambiar recorrido')
        await clickText('Venta por peso')
        await wait(180)
        await evaluate(`window.__retailTutorialEvents=[];window.addEventListener('quick-retail-tutorial-action',event=>window.__retailTutorialEvents.push(event.detail.action))`)
        await evaluate(`(() => [...document.querySelectorAll('[data-tutorial-target="product"]')].find(button => button.innerText.includes('Helado artesanal'))?.click())()`)
        await completeCurrentStep('Weight product open')
        if (width === 390) {
          const guideVisible = await evaluate(`(() => { const rect=document.querySelector('[aria-label="Centro de tutoriales de Comercio"]')?.getBoundingClientRect(); return Boolean(rect && rect.top >= 170 && rect.top < innerHeight && rect.bottom < innerHeight) })()`)
          assert.equal(guideVisible, true, 'At 390px the active tutorial panel stays visible while the weight input is open')
          await captureScreenshot(`${evidencePrefix}-weight-input`)
        }
        await evaluate(`(() => { const input=document.querySelector('[data-tutorial-target="weight-input"]'); const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set; setter.call(input,'250'); input.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'insertText',data:'250'})); })()`)
        await completeCurrentStep('Manual grams entry')
        await evaluate(`document.querySelector('[data-tutorial-target="weight-subtotal"]')?.click()`)
        await completeCurrentStep('Weight calculation review')
        await evaluate(`document.querySelector('[data-tutorial-target="weight-add"]')?.click()`)
        await completeCurrentStep('Weight item add')
        await evaluate(`document.querySelector('[data-tutorial-target="total"]')?.click()`)
        assert.equal(await progress(), '5', 'Weight tutorial records five real actions')
        await captureScreenshot(`${evidencePrefix}-weight-sale`)
        if (width === 390) await captureScreenshot(`${evidencePrefix}-cart`)
        await clickText('Cambiar recorrido')
        await clickText('Cobro demostrativo')
        await evaluate(`document.querySelector('[data-tutorial-target="cart"]')?.click()`)
        await completeCurrentStep('Payment cart review')
        await evaluate(`document.querySelector('[data-tutorial-target="checkout"]')?.click()`)
        await completeCurrentStep('Payment checkout open')
        await evaluate(`document.querySelectorAll('[data-tutorial-target="payment-method"]')[1]?.click()`)
        await completeCurrentStep('Payment method selection')
        await evaluate(`document.querySelector('[data-tutorial-target="confirm-payment"]')?.click()`)
        assert.equal(await progress(), '4', 'Payment tutorial records cart, checkout, method and local confirmation')
        await captureScreenshot(`${evidencePrefix}-demo-payment`)

        await clickText('Cambiar recorrido')
        await clickText('Comprobante y nueva venta')
        await evaluate(`(() => [...document.querySelectorAll('[data-tutorial-target="product"]')].find(button => button.innerText.includes('Café Latte'))?.click())()`)
        await completeCurrentStep('Receipt sale setup')
        await evaluate(`document.querySelector('[data-tutorial-target="checkout"]')?.click()`)
        await completeCurrentStep('Receipt checkout')
        await evaluate(`document.querySelector('[data-tutorial-target="payment-method"]')?.click()`)
        await completeCurrentStep('Receipt payment method')
        await evaluate(`document.querySelector('[data-tutorial-target="confirm-payment"]')?.click()`)
        await completeCurrentStep('Receipt generated')
        assert.match(await evaluate(`document.querySelector('[data-tutorial-target="receipt"]')?.innerText||''`), /Comprobante TCK-\d{4}[\s\S]*Total: Bs/, 'local receipt summary contains a folio and total')
        await captureScreenshot(`${evidencePrefix}-receipt`)
        await evaluate(`document.querySelector('[data-tutorial-target="receipt"] button')?.click()`)
        await completeCurrentStep('Receipt review')
        await evaluate(`document.querySelector('[data-tutorial-target="new-sale"]')?.click()`)
        assert.equal(await progress(), '6', 'Receipt tutorial reaches the start-new-sale action')
        await captureScreenshot(`${evidencePrefix}-receipt-new-sale`)
      }
      await evaluate(`document.querySelector('[aria-label="Cerrar Centro de tutoriales"]')?.click()`)
    }
    assert.equal(await selectValue('Rol simulado', 'cashier'), true, `${route}: role selector missing`)
    assert.equal(await selectValue('Rol simulado', 'admin'), true, `${route}: role selector could not restore admin`)
    const reset = await evaluate(`(() => { const button = [...document.querySelectorAll('button')].find(item => item.innerText.trim() === 'Reiniciar'); button?.click(); return Boolean(button) })()`)
    assert.equal(reset, true, `${route}: reset control missing`)
    await wait(150)
    if (template === 'retail' && dataset === 'full' && viewport.width === 1440) {
      await evaluate(`(() => [...document.querySelectorAll('button')].find(button => button.innerText.includes('Nueva venta / POS'))?.click())()`)
      await wait(100)
      await evaluate(`(() => [...document.querySelectorAll('button')].find(button => button.innerText.includes('Café Latte'))?.click())()`)
      await evaluate(`(() => [...document.querySelectorAll('button')].find(button => button.innerText.includes('Helado artesanal'))?.click())()`)
      assert.match(await evaluate(`document.body.innerText`), /Peso en balanza \(Gramos\)/, 'Retail abre el diálogo de peso')
      await evaluate(`(() => [...document.querySelectorAll('button')].find(button => button.innerText.trim() === 'Agregar al Carrito')?.click())()`)
      assert.match(await evaluate(`document.body.innerText`), /Total a Pagar:[\s\S]*Bs 37\.50/, 'Retail suma artículos por unidad y peso manual')
      await evaluate(`(() => [...document.querySelectorAll('button')].find(button => button.innerText.includes('Cobrar Venta'))?.click())()`)
      assert.match(await evaluate(`document.body.innerText`), /Confirmar Pago/, 'Retail abre el cobro de demostración')
      await evaluate(`(() => [...document.querySelectorAll('button')].find(button => button.innerText.trim() === 'Confirmar Cobro')?.click())()`)
      const receipt = await evaluate(`document.body.innerText`)
      assert.match(receipt, /Venta registrada con éxito! Comprobante: TCK-\d{4}/, 'Retail completa el cobro local y genera comprobante')
    }
    routeResults.push({ route, viewport: `${viewport.width}x${viewport.height}`, refresh: 'PASS', roleChange: 'PASS', reset: 'PASS', csp: 'connect-src none', noStore: true, overflow: state.overflow, ready: true })
  }
  const demoBrowserErrors = [...browserErrors]
  assert.deepEqual(demoBrowserErrors, [], `Isolated demo browser errors: ${demoBrowserErrors.join('; ')}`)

  await send('Emulation.clearDeviceMetricsOverride')
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true })
  await send('Page.navigate', { url: `http://127.0.0.1:${port}/` })
  let landingButtons = []
  for (let attempt = 0; attempt < 100; attempt++) {
    landingButtons = await evaluate(`(() => [...document.querySelectorAll('#plantillas [data-template-id] .pachax-card-detail-button')].map(button => button.getAttribute('aria-label')) )()`)
    if (landingButtons.length) break
    await wait(100)
  }
  assert.ok(landingButtons.length > 0, `Landing catalog details actions missing: ${landingButtons}; browserErrors=${JSON.stringify(browserErrors)}`)
  const landingNavigation = []
  for (const item of [{ label: 'Hamburger', templateId: 'hamburger', route: '/demo/hamburger?data=full', marker: 'Restaurante Rápido' }, { label: 'Retail', templateId: 'retail', route: '/demo/retail?data=full', marker: 'Comercio / Venta Rápida' }]) {
    const detail = await evaluate(`(() => { const button = document.querySelector('#plantillas [data-template-id="${item.templateId}"] .pachax-card-detail-button'); button?.click(); return Boolean(button) })()`)
    assert.equal(detail, true, `Landing details action missing for ${item.label}`)
    await wait(100)
    const click = await evaluate(`(() => { const button = document.querySelector('[role="dialog"] .pachax-details-secondary'); button?.click(); return Boolean(button) })()`)
    assert.equal(click, true, `Landing demo action missing for ${item.label}`)
    await ready()
    assert.equal(await evaluate('location.pathname + location.search'), item.route, `${item.label} routed incorrectly`)
    const activeDemoHeading = await evaluate("document.querySelector('header p.truncate')?.innerText || ''")
    assert.ok(activeDemoHeading.toLowerCase().includes(item.marker.toLowerCase()), `${item.label} launched wrong demo: ${activeDemoHeading}`)
    landingNavigation.push({ label: item.label, route: item.route, result: 'PASS' })
    await send('Page.navigate', { url: `http://127.0.0.1:${port}/` }); await wait(1200)
  }

  await evaluate(`document.querySelector('#tutoriales')?.scrollIntoView({ block: 'start' })`)
  const embeddedTutorials = []
  for (const item of [{ templateId: 'hamburger', marker: 'Servicio Rápido Demo' }, { templateId: 'retail', marker: 'Comercio / Venta Rápida' }]) {
    const clicked = await evaluate(`(() => { const tab = document.querySelector('#tutoriales [data-tutorial-template="${item.templateId}"]'); tab?.click(); return Boolean(tab) })()`)
    assert.equal(clicked, true, `Landing tutorial tab missing for ${item.templateId}`)
    let embeddedState
    for (let attempt = 0; attempt < 150; attempt++) {
      await wait(100)
      embeddedState = await evaluate(`(() => { const frame = document.querySelector('#tutoriales iframe'); const child = frame?.contentDocument; return { ready: Boolean(child?.querySelector('[data-demo-only-ready="true"], [data-demo-runtime-ready="true"]')), status: document.querySelector('#tutoriales [role="status"]')?.innerText || '', title: frame?.title || '', body: child?.body?.innerText || '' } })()`)
      if (embeddedState.ready && embeddedState.status === 'Demo lista' && embeddedState.body.includes(item.marker)) break
    }
    assert.equal(embeddedState.ready, true, `Landing iframe runtime did not become ready for ${item.templateId}: ${embeddedState.status}`)
    assert.equal(embeddedState.status, 'Demo lista', `Landing did not report ready for ${item.templateId}`)
    assert.ok(embeddedState.body.includes(item.marker), `Landing embedded the wrong demo for ${item.templateId}`)
    embeddedTutorials.push({ templateId: item.templateId, sameOriginCsp: true, runtimeReady: true, result: 'PASS' })
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
  const report = { result: 'PASS', server: `127.0.0.1:${port}`, routes: routeResults, landingNavigation, embeddedTutorials, otherEntrypoints: 'demo.html, studio.html, and app fallback served', missingAsset: '404', isolatedDemoExternalRequests: nonDemoNetwork.length, isolatedDemoBrowserErrors: demoBrowserErrors.length, productionFirebaseRequests: productionRequests.length, landingConsoleErrorsWithEmulatorsStopped: landingErrors }
  writeFileSync(resolve(evidenceDir, 'integration-browser.json'), `${JSON.stringify(report, null, 2)}\n`)
  console.log(JSON.stringify(report, null, 2))
} finally {
  socket?.close()
  browser.kill()
  await new Promise((done) => server.close(done))
}
