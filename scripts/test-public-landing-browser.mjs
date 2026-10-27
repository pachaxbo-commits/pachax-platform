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
    const root = document.documentElement;
    const scrollH = root?.scrollHeight || 0;
    const footerBottom = footer ? footer.offsetTop + footer.offsetHeight : 0;
    const tutorialButtons = [...document.querySelectorAll('#tutoriales .grid button')];
    return {
      count: cards.length,
      specializedCount: specialized.length,
      selfServiceCount: selfService.length,
      activeSpecialized: activeSpecialized?.dataset.templateId,
      activeSelfService: activeSelfService?.dataset.templateId,
      overflow: (root?.scrollWidth || 0) > innerWidth,
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
  const waitForValue = async (expression, predicate, label) => {
    for (let attempt = 0; attempt < 40; attempt++) {
      const value = await evaluate(expression)
      if (predicate(value)) return value
      await sleep(150)
    }
    throw new Error(`Tiempo agotado: ${label}; valor ${JSON.stringify(await evaluate(expression))}`)
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

    // Commercial actions stay informational and select the requested public plan.
    const actionChecks = await evaluate(`(() => {
      const findCard = (id) => document.querySelector('#plantillas [data-template-id="' + id + '"]');
      const labels = (id) => [...(findCard(id)?.querySelectorAll('button') || [])].map(button => button.textContent.trim());
      window.__commercialOpenedUrl = null;
      window.open = (url) => { window.__commercialOpenedUrl = String(url); };
      const implementationUrls = {};
      for (const id of ['restaurant', 'distribution', 'nightclub']) {
        findCard(id)?.querySelector('[data-commercial-action="contact"]')?.click();
        implementationUrls[id] = window.__commercialOpenedUrl;
      }
      const implementationUrl = window.__commercialOpenedUrl;
      const planCtas = {};
      for (const id of ['retail']) {
        const button = findCard(id)?.querySelector('[data-commercial-action="view-plans"]');
        planCtas[id] = button?.textContent.trim();
        button?.click();
      }
      const customLabels = labels('custom');
      const registerLinks = [...document.querySelectorAll('a[href^="/register"], button')]
        .filter(el => el.textContent.toLowerCase().includes('ver planes'))
        .map(el => el.getAttribute('href'));
      return { implementationUrl, implementationUrls, planCtas, customLabels, registerLinks };
    })()`)
    assert.match(actionChecks.implementationUrl || '', /wa\.me\/59177987776/)
    for (const [id, expectedName] of [['restaurant', 'Restaurante con salón'], ['distribution', 'Producción y Distribución'], ['nightclub', 'Nightclub & Lounge']]) {
      assert.match(actionChecks.implementationUrls[id] || '', /wa\.me\/59177987776/)
      assert(decodeURIComponent(actionChecks.implementationUrls[id]).includes(expectedName), `${id} debe llevar mensaje de WhatsApp personalizado`)
    }
    assert.equal(actionChecks.planCtas.retail, 'Ver planes')
    const catalogRetailSelection = await waitForValue(`document.querySelector('[data-plan-template="retail"]')?.getAttribute('aria-pressed')`, value => value === 'true', 'tarjeta Comercio selecciona sus planes')
    assert.equal(catalogRetailSelection, 'true')
    assert(actionChecks.customLabels.includes('Cotizar a medida'))
    assert.equal(actionChecks.customLabels.some(label => /Demo próximamente/i.test(label)), false)
    assert.equal(actionChecks.registerLinks.some(Boolean), false, 'Ver planes nunca debe abrir /register')
    await evaluate(`(() => {
      window.__heroOpenedUrl = null;
      window.open = (url) => { window.__heroOpenedUrl = String(url); };
      [...document.querySelectorAll('#hero button')].find(button => button.textContent.includes('Solicitar implementación'))?.click();
      return window.__heroOpenedUrl;
    })()`)
    const heroImplementationUrl = await evaluate(`window.__heroOpenedUrl`)
    assert(decodeURIComponent(heroImplementationUrl || '').includes('Restaurante con salón'))
    await evaluate(`([...document.querySelectorAll('#hero button')].find(button => button.textContent.includes('Ver planes')))?.click()`)
    const heroPlanSelection = await waitForValue(`document.querySelector('[data-plan-template="hamburger"]')?.getAttribute('aria-pressed')`, value => value === 'true', 'CTA principal selecciona Restaurante rápido')
    assert.equal(heroPlanSelection, 'true')
    const noOfferState = await evaluate(`document.querySelector('#planes')?.innerText || ''`)
    assert(/Sin oferta publicada|Ofertas no disponibles/.test(noOfferState), 'Sin catálogo confirmado debe mostrarse un estado explícito de ofertas')
    assert.equal(/\$(29|59|99)(\.00)?/.test(noOfferState), false, 'No deben aparecer precios de referencia')
    await evaluate(`(() => {
      window.__plansInquiryUrl = null;
      window.open = (url) => { window.__plansInquiryUrl = String(url); };
      [...document.querySelectorAll('#planes button')].find(button => button.textContent.includes('Solicitar información'))?.click();
    })()`)
    const plansInquiryUrl = await evaluate(`window.__plansInquiryUrl`)
    assert.match(plansInquiryUrl || '', /wa\.me\/59177987776/, 'El estado sin oferta permite consulta por WhatsApp')

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
      await evaluate(`([...document.querySelectorAll('#hero button')].find(button => button.textContent.includes('Ver planes')))?.click()`)
      const heroRetailSelection = await waitForValue(`document.querySelector('[data-plan-template="retail"]')?.getAttribute('aria-pressed')`, value => value === 'true', 'CTA principal selecciona Comercio')
      assert.equal(heroRetailSelection, 'true')
    }

    console.log(`PASS ${width}×${height}: 2 carruseles independientes, sin overflow y footer perfecto`)
  }

} finally {
  if (socket?.readyState === WebSocket.OPEN) {
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
