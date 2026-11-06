import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { createServer as createTcpServer } from 'node:net'
import { createServer } from 'node:http'
import { extname, join, resolve, sep } from 'node:path'
import { tmpdir } from 'node:os'
import { createLandingCatalogAdapterScript, getLandingCatalogFixture } from './landingCommercialTestFixture.mjs'

const chrome = [process.env.CHROME_BIN, 'C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe', '/usr/bin/google-chrome', '/usr/bin/chromium'].filter(Boolean).find(existsSync)
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
let activeViewportWidth = 1440
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
  const clickWithPointer = async (selector, text = '', index = 0) => {
    await evaluate(`(() => { const element=[...document.querySelectorAll(${JSON.stringify(selector)})].filter(item => !${JSON.stringify(text)} || item.innerText.includes(${JSON.stringify(text)}))[${index}]; element?.scrollIntoView({block:'center',behavior:'instant'}); })()`)
    await wait(60)
    const point = await evaluate(`(() => { const element=[...document.querySelectorAll(${JSON.stringify(selector)})].filter(item => !${JSON.stringify(text)} || item.innerText.includes(${JSON.stringify(text)}))[${index}]; if (!element) return null; const rect=element.getBoundingClientRect(); return {x:rect.left+rect.width/2,y:rect.top+rect.height/2} })()`)
    assert.ok(point, `Pointer target ${selector}${text ? ` (${text})` : ''} exists`)
    if (activeViewportWidth < 500) {
      await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ id: 1, ...point }] })
      await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
    } else {
      await send('Input.dispatchMouseEvent', { type: 'mouseMoved', ...point })
      await send('Input.dispatchMouseEvent', { type: 'mousePressed', ...point, button: 'left', clickCount: 1 })
      await send('Input.dispatchMouseEvent', { type: 'mouseReleased', ...point, button: 'left', clickCount: 1 })
    }
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
  const allWidths = [320, 360, 375, 390, 430, 768, 1024, 1440, 1920]
  const selectedWidth = process.env.DEMO_INTEGRATION_WIDTH ? Number(process.env.DEMO_INTEGRATION_WIDTH) : null
  assert(selectedWidth === null || allWidths.includes(selectedWidth), `Unsupported DEMO_INTEGRATION_WIDTH: ${selectedWidth}`)
  const viewportWidths = selectedWidth === null ? allWidths : [selectedWidth]
  for (const template of ['hamburger', 'retail']) for (const dataset of ['full', 'empty']) for (const width of viewportWidths) {
    const viewport = { width, height: width < 500 ? 844 : 1000 }
    activeViewportWidth = width
    await send('Emulation.setDeviceMetricsOverride', { ...viewport, deviceScaleFactor: 1, mobile: viewport.width < 500 })
    await send('Emulation.setTouchEmulationEnabled', { enabled: viewport.width < 500, maxTouchPoints: 1 })
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
      if ([320, 375, 390, 430].includes(width)) await captureScreenshot(`${width}-${dataset}-tutorial-center`, '[aria-label="Centro de tutoriales de Comercio"]')
      if (width === 390 && dataset === 'full') {
        await selectValue('Rol simulado', 'inventory')
        assert.match(await evaluate(`document.querySelector('[aria-label="Centro de tutoriales de Comercio"]')?.innerText||''`), /El rol actual no tiene acceso/)
        await selectValue('Rol simulado', 'admin')
        assert.match(await evaluate(`document.querySelector('[aria-label="Recorridos disponibles"]')?.innerText||''`), /Venta por unidad/)
      }
      if (width === 390 && dataset === 'empty') {
        const clickEmptyTourStep = async (label) => evaluate(`(() => [...document.querySelectorAll('button')].find(button => button.innerText.trim().includes(${JSON.stringify(label)}))?.click())()`)
        await clickEmptyTourStep('Conocer el punto de venta')
        await evaluate(`document.querySelector('[data-tutorial-target="catalog"]')?.click()`)
        assert.equal(await evaluate(`Boolean([...document.querySelectorAll('span')].some(node => node.innerText.trim() === 'Acción completada'))`), true, 'empty catalog orientation can inspect the catalog')
        await clickEmptyTourStep('Siguiente')
        await clickEmptyTourStep('Omitir paso')
        await clickEmptyTourStep('Siguiente')
        await clickEmptyTourStep('Omitir paso')
        await clickEmptyTourStep('Siguiente')
        await evaluate(`document.querySelector('[data-tutorial-target="cart"]')?.click()`)
        await clickEmptyTourStep('Siguiente')
        await evaluate(`document.querySelector('[data-tutorial-target="total"]')?.click()`)
        assert.equal(await evaluate(`document.querySelector('[role="progressbar"][aria-label="Progreso del recorrido"]')?.getAttribute('aria-valuenow')`), '5', 'empty catalog orientation completes with unavailable product step skipped')
        await captureScreenshot('390-empty-orientation', '[aria-label="Centro de tutoriales de Comercio"]')
      }
      if (dataset === 'full' && (width === 1440 || width === 390)) {
        const evidencePrefix = `${width}`
        const clickText = async (text) => evaluate(`(() => { const button=[...document.querySelectorAll('button')].find(item => item.innerText.trim().includes(${JSON.stringify(text)})); button?.click(); return Boolean(button) })()`)
        const progress = async () => evaluate(`document.querySelector('[role="progressbar"][aria-label="Progreso del recorrido"]')?.getAttribute('aria-valuenow') || ''`)
        const completeCurrentStep = async (label) => { await wait(120); const state = await evaluate(`(() => ({ completed:Boolean([...document.querySelectorAll('span')].some(node => node.innerText.trim() === 'Acción completada')), step:document.querySelector('[aria-label="Centro de tutoriales de Comercio"] h3')?.innerText||'', dialogs:[...document.querySelectorAll('[role="dialog"]')].map(node=>node.innerText.slice(0,120)), events:window.__retailTutorialEvents||[], visibleText:document.body.innerText.slice(-300) }))()`); assert.equal(state.completed, true, `${label}: action event completes the current step; ${JSON.stringify(state)}`); assert.ok(await clickText('Siguiente'), `${label}: next is enabled after the real action`) }
        const startFreshTutorial = async (title) => {
          await send('Page.reload', { ignoreCache: true })
          await ready()
          await evaluate(`(() => [...document.querySelectorAll('button')].find(button => button.innerText.includes('Abrir Centro de tutoriales'))?.click())()`)
          assert.match(await evaluate(`document.body.innerText`), /Centro de tutoriales/)
          await clickText(title)
          await wait(300)
          assert.match(await evaluate(`document.querySelector('[aria-label="Centro de tutoriales de Comercio"] h3')?.innerText||''`), /Paso 1 de/)
          assert.ok(await evaluate(`Boolean(document.querySelector('[data-tutorial-target="catalog"]'))`), `${title}: POS is available after choosing the route`)
          await evaluate(`window.__retailTutorialEvents=[];window.addEventListener('quick-retail-tutorial-action',event=>window.__retailTutorialEvents.push(event.detail.action))`)
        }

        await startFreshTutorial('Conocer el punto de venta')
        await evaluate(`document.querySelector('[data-tutorial-target="catalog"]')?.click()`)
        await completeCurrentStep('Orientation catalog')
        if (width === 390) {
          await evaluate(`document.querySelector('[aria-label="Cerrar Centro de tutoriales"]')?.click()`)
          assert.equal(await evaluate(`Boolean(document.querySelector('[aria-label="Centro de tutoriales de Comercio"]'))`), false, 'mobile tutorial can close')
          await evaluate(`(() => [...document.querySelectorAll('button')].find(button => button.innerText.includes('Abrir Centro de tutoriales'))?.click())()`)
          assert.match(await evaluate(`document.querySelector('[aria-label="Centro de tutoriales de Comercio"] h3')?.innerText||''`), /Paso 2 de 5 · Búsqueda/, 'mobile tutorial reopens with its current progress')
          assert.equal(await progress(), '1', 'mobile tutorial retains the completed action after closing and reopening')
        }
        await clickText('Siguiente')
        await clickText('Omitir paso')
        assert.equal(await progress(), '2', 'orientation records one completed action and one omitted step')
        await clickText('Siguiente')
        await clickWithPointer('[data-tutorial-target="product"]', 'Café Latte')
        await completeCurrentStep('Orientation product selection')
        await clickWithPointer('[data-tutorial-target="cart"]')
        await completeCurrentStep('Orientation cart')
        await clickWithPointer('[data-tutorial-target="total"]')
        await wait(120)
        assert.equal(await progress(), '5', 'orientation resolves all five steps, including one explicit skip')
        await captureScreenshot(`${evidencePrefix}-orientation`)
        await clickText('Cambiar recorrido')
        assert.match(await evaluate(`document.querySelector('[aria-label="Recorridos disponibles"]')?.innerText||''`), /Venta por unidad/)

        await startFreshTutorial('Venta por unidad')
        if (width === 390) await captureScreenshot(`${evidencePrefix}-selected-tutorial`)
        await wait(100)
        await clickWithPointer('[data-tutorial-target="search"]')
        await send('Input.insertText', { text: 'Café Latte' })
        assert.equal(await evaluate(`document.querySelector('[data-tutorial-target="search"]')?.value`), 'Café Latte', 'Unit sale product search uses browser keyboard input')
        await completeCurrentStep('Unit sale search')
        await clickWithPointer('[data-tutorial-target="product"]', 'Café Latte')
        await completeCurrentStep('Unit product add')
        await clickWithPointer('[data-tutorial-target="quantity"] button[aria-label^="Aumentar"]')
        await completeCurrentStep('Unit quantity update')
        await clickWithPointer('[data-tutorial-target="total"]')
        await wait(150)
        assert.equal(await progress(), '4', 'Unit sale tutorial records four real actions')
        await captureScreenshot(`${evidencePrefix}-unit-sale`)
        await evaluate(`document.querySelector('[aria-label="Reiniciar recorrido"]')?.click()`)
        assert.equal(await progress(), '0', 'unit tutorial restart clears its resolved progress')
        await clickWithPointer('[data-tutorial-target="search"]')
        await send('Input.insertText', { text: 'Café Latte' })
        assert.equal(await evaluate(`document.querySelector('[data-tutorial-target="search"]')?.value`), 'Café Latte')
        await completeCurrentStep('Unit sale search after restart')
        await clickWithPointer('[data-tutorial-target="product"]', 'Café Latte')
        await completeCurrentStep('Unit product after restart')
        await clickWithPointer('[data-tutorial-target="quantity"] button[aria-label^="Aumentar"]')
        await completeCurrentStep('Unit quantity after restart')
        await clickWithPointer('[data-tutorial-target="total"]')
        await wait(150)
        assert.equal(await progress(), '4', 'unit tutorial can be completed again after restart')

        await startFreshTutorial('Venta por peso')
        await clickWithPointer('[data-tutorial-target="product"]', 'Helado artesanal')
        assert.ok((await evaluate(`window.__retailTutorialEvents||[]`)).includes('weight-opened'), 'A real pointer click opens the selected weight product')
        await completeCurrentStep('Weight product open')
        if (width === 390) {
          const inputBounds = await evaluate(`(() => { const input=document.querySelector('[data-tutorial-target="weight-input"]'); const rect=input?.getBoundingClientRect(); const hit=rect&&document.elementFromPoint(rect.left+rect.width/2,rect.top+rect.height/2); return {viewport:innerHeight,input:rect&&{top:rect.top,bottom:rect.bottom},isTopHit:hit===input} })()`)
          assert.equal(Boolean(inputBounds.input && inputBounds.input.top >= 0 && inputBounds.input.bottom <= inputBounds.viewport && inputBounds.isTopHit), true, `At 390px the manual weight input remains visible and receives pointer input: ${JSON.stringify(inputBounds)}`)
        }
        await clickWithPointer('[data-tutorial-target="weight-input"]')
        await evaluate(`(() => { const input=document.querySelector('[data-tutorial-target="weight-input"]'); input?.focus(); input?.select(); })()`)
        await send('Input.insertText', { text: '250' })
        assert.equal(await evaluate(`document.querySelector('[data-tutorial-target="weight-input"]')?.value`), '250', 'Manual grams are entered through browser keyboard input')
        if (width === 390) await captureScreenshot(`${evidencePrefix}-weight-input`)
        await completeCurrentStep('Manual grams entry')
        await clickWithPointer('[data-tutorial-target="weight-subtotal"]')
        await completeCurrentStep('Weight calculation review')
        await clickWithPointer('[data-tutorial-target="weight-add"]')
        await completeCurrentStep('Weight item add')
        await clickWithPointer('[data-tutorial-target="total"]')
        assert.equal(await progress(), '5', 'Weight tutorial records five real actions')
        await captureScreenshot(`${evidencePrefix}-weight-sale`)
        if (width === 390) {
          await evaluate(`document.querySelector('[data-tutorial-target="cart"]')?.scrollIntoView({block:'center',behavior:'instant'})`)
          await captureScreenshot(`${evidencePrefix}-cart`)
        }
        assert.equal(await evaluate(`Boolean(document.querySelector('[data-tutorial-target="checkout"]')?.disabled)`), false, 'weight tutorial leaves a usable cart before leaving its fresh run')

        await startFreshTutorial('Cobro demostrativo')
        assert.equal(await evaluate(`Boolean(document.querySelector('[data-tutorial-target="checkout"]')?.disabled)`), true, 'a freshly started payment tutorial begins with the expected empty cart')
        await clickWithPointer('[data-tutorial-target="product"]', 'Café Latte')
        await completeCurrentStep('Payment product added from empty cart')
        assert.equal(await evaluate(`Boolean(document.querySelector('[data-tutorial-target="checkout"]')?.disabled)`), false, 'adding an item enables checkout')
        await clickWithPointer('[data-tutorial-target="cart"]')
        await completeCurrentStep('Payment cart review')
        await clickWithPointer('[data-tutorial-target="checkout"]')
        await completeCurrentStep('Payment checkout open')
        await clickWithPointer('[data-tutorial-target="payment-method"]', '', 1)
        await completeCurrentStep('Payment method selection')
        await captureScreenshot(`${evidencePrefix}-demo-payment`)
        await clickWithPointer('[data-tutorial-target="confirm-payment"]')
        assert.equal(await progress(), '5', 'Payment tutorial records item preparation, cart, checkout, method and local confirmation')
        await captureScreenshot(`${evidencePrefix}-demo-payment-confirmed`)

        await startFreshTutorial('Comprobante y nueva venta')
        await clickWithPointer('[data-tutorial-target="product"]', 'Café Latte')
        await completeCurrentStep('Receipt sale setup')
        await clickWithPointer('[data-tutorial-target="checkout"]')
        await completeCurrentStep('Receipt checkout')
        await clickWithPointer('[data-tutorial-target="payment-method"]')
        await completeCurrentStep('Receipt payment method')
        await clickWithPointer('[data-tutorial-target="confirm-payment"]')
        await completeCurrentStep('Receipt generated')
        assert.match(await evaluate(`document.querySelector('[data-tutorial-target="receipt"]')?.innerText||''`), /Comprobante TCK-\d{4}[\s\S]*Total: Bs/, 'local receipt summary contains a folio and total')
        await evaluate(`document.querySelector('[data-tutorial-target="receipt"]')?.scrollIntoView({block:'center',behavior:'instant'})`)
        await wait(100)
        await captureScreenshot(`${evidencePrefix}-receipt`)
        await clickWithPointer('[data-tutorial-target="receipt"] button')
        await completeCurrentStep('Receipt review')
        await clickWithPointer('[data-tutorial-target="new-sale"]')
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
  await send('Page.addScriptToEvaluateOnNewDocument', {
    source: createLandingCatalogAdapterScript({ scenario: 'synthetic', fixture: getLandingCatalogFixture('synthetic'), functionsPort: 5101 }),
  })
  await send('Page.navigate', { url: `http://127.0.0.1:${port}/` })
  let landingButtons = []
  for (let attempt = 0; attempt < 100; attempt++) {
    landingButtons = await evaluate(`(() => [...document.querySelectorAll('#plantillas [data-template-id] .pachax-card-detail-button')].map(button => button.getAttribute('aria-label')) )()`)
    if (landingButtons.length) break
    await wait(100)
  }
  assert.ok(landingButtons.length > 0, `Landing catalog details actions missing: ${landingButtons}; browserErrors=${JSON.stringify(browserErrors)}`)
  let landingFixtureState
  let landingCatalogStatus = ''
  for (let attempt = 0; attempt < 80; attempt++) {
    landingFixtureState = await evaluate('window.__PACHAX_LANDING_TEST_CATALOG__')
    landingCatalogStatus = await evaluate(`document.querySelector('#plantillas [data-catalog-state]')?.dataset.catalogState || ''`)
    if (landingFixtureState?.calls > 0 || landingCatalogStatus === 'error') break
    await wait(100)
  }
  assert.equal(landingFixtureState?.scenario, 'synthetic', 'Landing commercial state comes only from the isolated synthetic fixture')
  assert.deepEqual(landingFixtureState.blocked, [], 'No unsupported or external callable reached the landing test adapter')
  const landingCommercialState = await evaluate(`(() => ({
    prices: [...document.querySelectorAll('#plantillas, #planes, #extras')].some(section => /(?:Bs\\s?\\d|\\$\\s?\\d)/.test(section.innerText)),
    planSelectors: document.querySelectorAll('[data-plan-template], [data-plan-tier]').length,
    registerLinks: [...document.querySelectorAll('#plantillas, #planes, #extras')].some(section => section.querySelector('a[href^="/register"]')),
    extraCards: document.querySelectorAll('#extras .pachax-extra-card').length,
    catalogState: document.querySelector('#plantillas [data-catalog-state]')?.dataset.catalogState || '',
    catalogStatus: document.querySelector('#plantillas [data-catalog-state]')?.innerText || '',
  }))()`)
  assert(landingFixtureState.calls > 0 || landingCatalogStatus === 'error',
    `Landing either consumed the synthetic API fixture or rendered the authorized unavailable-catalog editorial fallback; calls=${landingFixtureState.calls}, state=${JSON.stringify(landingCommercialState)}`)
  if (landingFixtureState.calls === 0) assert.match(landingCommercialState.catalogStatus, /No pudimos verificar el catálogo/)
  assert.equal(landingCommercialState.prices, false, 'Demo integration never invents a public price')
  assert.equal(landingCommercialState.planSelectors, 0, 'Demo integration does not expose an offer without opening an authorized detail')
  assert.equal(landingCommercialState.registerLinks, false, 'Demo integration cannot activate self-service enrollment')
  assert.equal(landingCommercialState.extraCards, 0, 'Draft extras stay unpublished in the local integration environment')
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
  const report = { result: 'PASS', server: `127.0.0.1:${port}`, routes: routeResults, landingCatalogMode: landingFixtureState.calls > 0 ? 'synthetic API fixture' : 'editorial fallback (API unavailable)', landingCatalogAdapterCalls: landingFixtureState.calls, landingCommercialState, landingNavigation, embeddedTutorials, otherEntrypoints: 'demo.html, studio.html, and app fallback served', missingAsset: '404', isolatedDemoExternalRequests: nonDemoNetwork.length, isolatedDemoBrowserErrors: demoBrowserErrors.length, productionFirebaseRequests: productionRequests.length, landingConsoleErrorsWithEmulatorsStopped: landingErrors }
  writeFileSync(resolve(evidenceDir, 'integration-browser.json'), `${JSON.stringify(report, null, 2)}\n`)
  console.log(JSON.stringify(report, null, 2))
} finally {
  socket?.close()
  browser.kill()
  await new Promise((done) => server.close(done))
}
