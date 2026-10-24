// Browser regression for the public showcase. Run against the demo emulator
// server or preview server; never writes to Firestore.
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
    const specialized = [...document.querySelectorAll('[aria-label="Carrusel de soluciones especializadas"] [data-coverflow-card]')];
    const selfService = [...document.querySelectorAll('[aria-label="Carrusel de soluciones autoservicio"] [data-coverflow-card]')];
    const activeSpecialized = specialized.find(c => c.dataset.active === 'true');
    const activeSelfService = selfService.find(c => c.dataset.active === 'true');
    const footer = document.querySelector('footer');
    const scrollH = document.documentElement.scrollHeight;
    const footerBottom = footer ? footer.offsetTop + footer.offsetHeight : 0;
    const tutorialButtons = [...document.querySelectorAll('#tutoriales .grid button')];
    return {
      count: cards.length,
      specializedCount: specialized.length,
      selfServiceCount: selfService.length,
      activeSpecialized: activeSpecialized?.dataset.templateId,
      activeSelfService: activeSelfService?.dataset.templateId,
      overflow: document.documentElement.scrollWidth > innerWidth,
      footerTrailingSpace: scrollH - footerBottom,
      footerBg: footer ? getComputedStyle(footer).backgroundColor : null,
      tutorialTabCount: tutorialButtons.length,
      hasSparklesInBanner: !!document.querySelector('#planes .rounded-3xl.bg-slate-900 svg.lucide-sparkles'),
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
    const loaded = await waitFor((res) => res.count === 5 && res.specializedCount === 3 && res.selfServiceCount === 2, `${width}: loaded`)
    await sleep(400)

    assert.equal(loaded.specializedCount, 3, 'Carrusel A debe tener 3 plantillas especializadas')
    assert.equal(loaded.selfServiceCount, 2, 'Carrusel B debe tener 2 plantillas autoservicio')
    assert.equal(loaded.overflow, false, 'No debe existir desbordamiento horizontal')
    assert.equal(loaded.footerTrailingSpace, 0, 'No debe existir espacio muerto debajo del footer')
    assert.equal(loaded.hasSparklesInBanner, false, 'No deben existir iconos Sparkles en el banner a medida')

    await screenshot(`${width}-hero`)

    if (width === 1440) {
      assert.equal(loaded.activeSpecialized, 'restaurant')
      assert.equal(loaded.activeSelfService, 'hamburger')

      // Siguiente en carrusel A
      await evaluate(`document.querySelector('[aria-label="Carrusel de soluciones especializadas"] button[aria-label="Siguiente plantilla"]').click()`)
      const nextA = await waitFor((r) => r.activeSpecialized === 'distribution', 'Carrusel A next -> distribution')
      assert.equal(nextA.activeSpecialized, 'distribution')

      // Siguiente en carrusel B
      await evaluate(`document.querySelector('[aria-label="Carrusel de soluciones autoservicio"] button[aria-label="Siguiente plantilla"]').click()`)
      const nextB = await waitFor((r) => r.activeSelfService === 'retail', 'Carrusel B next -> retail')
      assert.equal(nextB.activeSelfService, 'retail')
    }

    console.log(`PASS ${width}×${height}: 2 carruseles independientes, sin overflow y footer perfecto`)
  }

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
    console.warn(`Chrome perfil temporal: ${error.message}`)
  }
}
