// Browser regression for the public showcase. Run against the demo emulator
// server started with scripts/start-dario.ps1; never writes to Firestore.
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'

const chromeCandidates = [
  process.env.CHROME_BIN,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
].filter(Boolean)
const chrome = chromeCandidates.find(existsSync)
if (!chrome) throw new Error('Chrome/Chromium no encontrado. Define CHROME_BIN.')
const baseUrl = process.env.LANDING_TEST_URL || 'http://localhost:5190/'
const target = new URL(baseUrl)
const response = await fetch(baseUrl)
assert.equal(response.status, 200, `El servidor local no responde: ${baseUrl}`)
const probe = createServer()
await new Promise((done) => probe.listen(0, '127.0.0.1', done))
const port = probe.address().port
await new Promise((done) => probe.close(done))
const output = resolve('tmp/landing-regression-evidence')
mkdirSync(output, { recursive: true })
const profile = mkdtempSync(join(tmpdir(), 'pachax-landing-browser-'))
const browser = spawn(chrome, [
  '--headless=new', '--disable-gpu', '--no-sandbox',
  `--remote-debugging-port=${port}`, '--remote-allow-origins=*',
  `--user-data-dir=${profile}`,
  baseUrl,
], { stdio: 'ignore' })

const sleep = (ms) => new Promise((done) => setTimeout(done, ms))
let socket
let send
try {
  let tab
  for (let attempt = 0; attempt < 50; attempt++) {
    await sleep(200)
    try {
      const tabs = await (await fetch(`http://127.0.0.1:${port}/json`)).json()
      tab = tabs.find((item) => item.type === 'page' && new URL(item.url).hostname === target.hostname)
      if (tab?.webSocketDebuggerUrl) break
    } catch { /* Chrome is starting. */ }
  }
  assert(tab?.webSocketDebuggerUrl, 'No se encontró la pestaña CDP')
  socket = new WebSocket(tab.webSocketDebuggerUrl)
  await new Promise((done, fail) => { socket.onopen = done; socket.onerror = fail })
  let sequence = 1
  const pending = new Map()
  socket.onmessage = (event) => {
    const payload = JSON.parse(event.data)
    if (!pending.has(payload.id)) return
    const { done, fail } = pending.get(payload.id)
    pending.delete(payload.id)
    payload.error ? fail(new Error(JSON.stringify(payload.error))) : done(payload.result)
  }
  send = (method, params = {}) => new Promise((done, fail) => {
    const id = sequence++
    pending.set(id, { done, fail })
    socket.send(JSON.stringify({ id, method, params }))
  })
  const evaluate = async (expression) => {
    const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
    if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails))
    return result.result.value
  }
  const state = () => evaluate(`(() => {
    const cards = [...document.querySelectorAll('[data-coverflow-card]')];
    const active = cards.find((card) => card.dataset.active === 'true');
    const region = document.querySelector('[aria-label="Carrusel interactivo de plantillas comerciales"]');
    const rect = active?.getBoundingClientRect();
    const regionRect = region?.getBoundingClientRect();
    const saved = JSON.parse(localStorage.getItem('pachax_commercial_config_v2') || '{}');
    return {
      count: cards.length,
      ids: cards.map((card) => card.dataset.templateId),
      active: active?.dataset.templateId,
      activeVisible: !!rect && rect.width > 0 && rect.height > 0 && getComputedStyle(active).opacity !== '0',
      sideVisible: cards.filter((card) => card !== active && Number(getComputedStyle(card).opacity) > 0.4).length,
      dots: region?.querySelectorAll('button[aria-label^="Ir a plantilla"]').length,
      catalogIds: [...document.querySelectorAll('#plantillas [data-template-id]')].map((card) => card.dataset.templateId),
      detailName: document.querySelector('#hero h4')?.textContent?.trim() || null,
      cacheCount: saved.templates?.length,
      publishedPlans: saved.plans?.filter((plan) => plan.status === 'published').length || 0,
      publishedExtras: saved.extras?.filter((extra) => extra.status === 'published').length || 0,
      overflow: document.documentElement.scrollWidth > innerWidth,
      regionSize: regionRect ? { width: regionRect.width, height: regionRect.height } : null,
      regionCenter: region ? { x: region.getBoundingClientRect().x + region.getBoundingClientRect().width / 2, y: region.getBoundingClientRect().y + 170 } : null,
    };
  })()`)
  const waitFor = async (predicate, label) => {
    for (let attempt = 0; attempt < 40; attempt++) {
      const result = await state()
      if (predicate(result)) return result
      await sleep(150)
    }
    throw new Error(`Tiempo agotado: ${label}; estado ${JSON.stringify(await state())}`)
  }
  const expectShowcase = (result, label) => {
    assert.equal(result.count, 5, `${label}: tarjetas`)
    assert.deepEqual(result.catalogIds, result.ids, `${label}: catálogo y Coverflow comparten IDs`)
    assert.equal(result.dots, 5, `${label}: indicadores`)
    assert.equal(result.activeVisible, true, `${label}: tarjeta activa visible`)
    assert(result.sideVisible >= 2, `${label}: tarjetas laterales visibles`)
    assert(result.regionSize.width > 0 && result.regionSize.height > 0, `${label}: dimensiones del carrusel`)
    assert.equal(result.overflow, false, `${label}: desbordamiento horizontal`)
  }
  const screenshot = async (label) => {
    const capture = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
    writeFileSync(resolve(output, `${label}.png`), Buffer.from(capture.data, 'base64'))
  }
  await send('Page.enable')
  await send('Runtime.enable')

  for (const [width, height] of [[1440, 900], [390, 844], [430, 932]]) {
    await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 768 })
    await send('Emulation.setTouchEmulationEnabled', { enabled: width < 768, maxTouchPoints: 1 })
    await send('Page.navigate', { url: baseUrl })
    const loaded = await waitFor((result) => result.count === 5 && result.cacheCount === 5, `${width}: Firestore/fallback`)
    await sleep(400) // Verify the asynchronous query cannot erase the showcase.
    const afterQuery = await state()
    expectShowcase(afterQuery, `${width}: carga asíncrona`)
    assert.equal(afterQuery.publishedPlans, 0, 'No se deben mostrar planes sin publicar')
    assert.equal(afterQuery.publishedExtras, 0, 'No se deben mostrar extras sin publicar')
    await screenshot(`${width}-restored`)
    if (width === 1440) {
      assert.equal(loaded.active, 'nightclub')
      await evaluate(`document.querySelector('button[aria-label="Siguiente plantilla"]').click()`)
      assert.equal((await waitFor((result) => result.active === 'retail', 'flecha siguiente')).count, 5)
      await screenshot('1440-next')
      await evaluate(`document.querySelector('button[aria-label="Plantilla anterior"]').click()`)
      assert.equal((await waitFor((result) => result.active === 'nightclub', 'flecha anterior')).catalogIds.length, 5)
      await evaluate(`document.querySelector('button[aria-label="Ir a plantilla Restaurante (índice 1)"]').click()`)
      assert.equal((await waitFor((result) => result.active === 'restaurant', 'indicador')).dots, 5)
      await evaluate(`document.querySelector('[aria-label="Carrusel interactivo de plantillas comerciales"]').dispatchEvent(new KeyboardEvent('keydown', {key:'ArrowRight', bubbles:true}))`)
      assert.equal((await waitFor((result) => result.active === 'distribution', 'teclado')).count, 5)
      await screenshot('1440-keyboard')
      await evaluate(`document.querySelector('[data-coverflow-card][data-template-id="nightclub"]').click()`)
      assert.equal((await waitFor((result) => result.active === 'nightclub', 'tarjeta lateral')).count, 5)
      await evaluate(`document.querySelector('button[aria-label="Siguiente plantilla"]').click()`)
      await waitFor((result) => result.active === 'retail', 'primera flecha final')
      await evaluate(`document.querySelector('button[aria-label="Siguiente plantilla"]').click()`)
      expectShowcase(await waitFor((result) => result.active === 'custom', 'segunda flecha final'), 'dos pulsaciones Next')
      await screenshot('1440-next-twice')
      await evaluate(`document.querySelector('#plantillas').scrollIntoView()`)
      await sleep(350)
      await screenshot('1440-catalog')
    } else {
      assert.equal(afterQuery.active, 'restaurant')
      const { x, y } = afterQuery.regionCenter
      await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x + 70, y }] })
      await send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x - 10, y }] })
      await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
      const swiped = await waitFor((result) => result.active === 'distribution', `${width}: swipe`)
      expectShowcase(swiped, `${width}: swipe`)
      assert.equal(swiped.detailName, 'Distribuidora', `${width}: detalle sincronizado`)
      await screenshot(`${width}-swipe`)
    }
    console.log(`PASS ${width}×${height}: carrusel, catálogo, estado publicado y navegación`)
  }

  // A browser carrying the old empty cache must recover on reload.
  await evaluate(`(() => { const key = 'pachax_commercial_config_v2'; const saved = JSON.parse(localStorage.getItem(key)); localStorage.setItem(key, JSON.stringify({ ...saved, templates: [] })); })()`)
  await send('Page.navigate', { url: baseUrl })
  expectShowcase(await waitFor((result) => result.count === 5 && result.cacheCount === 5, 'caché antigua vacía'), 'caché antigua vacía')
  console.log('PASS caché antigua vacía: se restauran plantillas oficiales publicadas')
} finally {
  if (socket?.readyState === WebSocket.OPEN) {
    await send('Browser.close').catch(() => undefined)
    socket.close()
  }
  browser.kill()
  await sleep(1000)
  try {
    rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
  } catch (error) {
    console.warn(`Chrome aún mantiene abierto su perfil temporal: ${error.message}`)
  }
}
