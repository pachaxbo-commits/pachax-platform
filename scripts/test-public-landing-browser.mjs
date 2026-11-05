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
    const cards = [...document.querySelectorAll('#hero [data-pachax-template-card]')];
    const specialized = cards.filter(c => !c.classList.contains('pachax-template-card-light'));
    const selfService = cards.filter(c => c.classList.contains('pachax-template-card-light'));
    const active = cards.find(c => c.classList.contains('is-active'));
    const footer = document.querySelector('.pachax-public-landing > footer');
    const root = document.documentElement;
    const scrollH = root?.scrollHeight || 0;
    const footerBottom = footer ? footer.offsetTop + footer.offsetHeight : 0;
    const tutorialButtons = [...document.querySelectorAll('#tutoriales .grid button')];
    const catalogCards = [...document.querySelectorAll('#plantillas .pachax-featured-card')];
    const catalogGrid = document.querySelector('#plantillas .pachax-featured-grid');
    const catalogColumns = catalogGrid ? getComputedStyle(catalogGrid).gridTemplateColumns.split(' ').length : 0;
    return {
      count: cards.length,
      specializedCount: specialized.length,
      selfServiceCount: selfService.length,
      activeTemplate: active?.dataset.templateId,
      activeIndex: active?.dataset.templateIndex,
      title: document.querySelector('#hero h1')?.innerText,
      brandLogoLoaded: Boolean(document.querySelector('.pachax-brand-lockup img')?.naturalWidth),
      overflow: (root?.scrollWidth || 0) > innerWidth,
      footerTrailingSpace: scrollH - footerBottom,
      footerBg: footer ? getComputedStyle(footer).backgroundColor : null,
      tutorialTabCount: tutorialButtons.length,
      catalogCount: catalogCards.length,
      catalogColumns,
      catalogIds: catalogCards.map(card => card.dataset.templateId),
      hasSparklesInBanner: !!document.querySelector('#planes .rounded-3xl.bg-slate-900 svg.lucide-sparkles'),
      pricingModeCards: [...document.querySelectorAll('#planes [data-pricing-mode]')].map(card => card.dataset.pricingMode),
      pricingImagesLoaded: [...document.querySelectorAll('#planes [data-pricing-mode] img')].every(img => img.complete && img.naturalWidth > 0),
      pricingHeading: document.querySelector('#planes h2')?.innerText || '',
      pricingCardHeights: [...document.querySelectorAll('#planes [data-pricing-mode]')].map(card => Math.round(card.getBoundingClientRect().height)),
      pricingCardCopy: [...document.querySelectorAll('#planes [data-pricing-mode] p')].map(paragraph => paragraph.innerText),
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
  const screenshotElement = async (selector, label) => {
    await evaluate(`Promise.all([...document.querySelectorAll(${JSON.stringify(selector + ' img')})].map(img => { img.loading='eager'; return img.decode().catch(() => undefined); }))`)
    const rect = await evaluate(`(() => { const el=document.querySelector(${JSON.stringify(selector)}); if(!el) return null; const r=el.getBoundingClientRect(); return {x:r.x+scrollX,y:r.y+scrollY,width:r.width,height:r.height}; })()`)
    assert(rect && rect.width > 0 && rect.height > 0, `No se pudo medir ${selector} para la captura`)
    const capture = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip: { ...rect, scale: 1 } })
    writeFileSync(resolve(output, `${label}.png`), Buffer.from(capture.data, 'base64'))
  }
  await send('Page.enable')
  await send('Runtime.enable')

  for (const [width, height] of [[320, 740], [375, 812], [390, 844], [430, 932], [768, 1024], [1024, 768], [1440, 900], [1920, 1080]]) {
    await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 768 })
    await send('Emulation.setTouchEmulationEnabled', { enabled: width < 768, maxTouchPoints: 1 })
    await send('Page.navigate', { url: baseUrl })
    const loaded = await waitFor((res) => res.count === 5 && res.specializedCount === 3 && res.selfServiceCount === 2, `${width}: loaded`)
    const catalogState = await waitFor((res) => res.catalogCount === 6, `${width}: six catalog entries`)
    await sleep(400)

    assert.equal(loaded.specializedCount, 3, 'La fila debe conservar las tres fichas especializadas')
    assert.equal(loaded.selfServiceCount, 2, 'La fila debe conservar las dos fichas de autoservicio')
    assert.match(loaded.title || '', /Gestiona tu negocio[\s\S]*de forma inteligente/, 'El titular coincide con la referencia aprobada')
    assert.equal(loaded.brandLogoLoaded, true, 'El logotipo oficial debe estar disponible')
    assert.equal(loaded.overflow, false, 'No debe existir desbordamiento horizontal')
    assert.equal(loaded.footerTrailingSpace, 0, 'No debe existir espacio muerto debajo del footer')
    assert.equal(loaded.hasSparklesInBanner, false, 'No deben existir iconos Sparkles en el banner a medida')
    assert.deepEqual(loaded.pricingModeCards, ['assisted', 'direct'], 'Planes muestra las dos modalidades aprobadas')
    assert.equal(loaded.pricingImagesLoaded, true, 'Las dos fotografías comerciales están cargadas')
    assert.match(loaded.pricingHeading, /Planes adaptados a la escala real de tu empresa/)
    assert(loaded.pricingCardHeights.every(height => height > 200), 'Las dos tarjetas deben conservar una altura legible')
    assert(loaded.pricingCardCopy.every(text => !text.includes('…')), 'Las descripciones de las modalidades no se recortan')
    assert.deepEqual(catalogState.catalogIds, ['restaurant', 'distribution', 'nightclub', 'hamburger', 'retail', 'custom'])
    assert.equal(catalogState.catalogColumns, width <= 680 ? 1 : width <= 1100 ? 2 : 3, 'El catálogo debe adaptarse como grilla, sin carrusel móvil')

    await screenshot(`${width}-hero`)
    if (width === 1440 || width === 390) {
      await evaluate(`(() => { const section=document.querySelector('#plantillas'); window.scrollTo({top:section.offsetTop-180,behavior:'instant'}); })()`)
      await sleep(250)
      await screenshot(`${width}-section-transition`)
      await screenshotElement('#plantillas', `${width}-section2-full`)
      await evaluate(`(() => { const section=document.querySelector('#planes'); window.scrollTo({top:section.offsetTop-Math.round(innerHeight*.45),behavior:'instant'}); })()`)
      await sleep(200)
      await screenshot(`${width}-section2-3-transition`)
      await screenshotElement('#planes', `${width}-section3-full`)
      await evaluate(`document.querySelector('#planes [data-pricing-mode="assisted"] button')?.click()`)
      await waitForValue(`document.querySelector('[role="dialog"] h3')?.textContent.trim()`, value => value === 'Implementación Asistida', 'abre detalle implementación')
      await screenshot(`${width}-implementation-details`)
      await evaluate(`document.querySelector('.pachax-pricing-dialog-close')?.click()`)
      await evaluate(`document.querySelector('#planes [data-pricing-mode="direct"] button')?.click()`)
      await waitForValue(`document.querySelector('[role="dialog"] h3')?.textContent.trim()`, value => value === 'Activación Directa', 'abre detalle activación')
      await screenshot(`${width}-direct-details-no-published-plans`)
      await evaluate(`document.querySelector('.pachax-pricing-dialog-close')?.click()`)
      await evaluate(`window.scrollTo({top:0,behavior:'instant'})`)
    }

    // Commercial actions stay informational and select the requested public plan.
    const detailActions = {}
    for (const id of ['restaurant', 'distribution', 'nightclub', 'hamburger', 'retail', 'custom']) {
      await evaluate(`document.querySelector('#plantillas [data-template-id="${id}"] .pachax-card-detail-button')?.click()`)
      const title = await waitForValue(`document.querySelector('[role="dialog"] h2')?.textContent.trim()`, value => Boolean(value), `${id} abre detalles`)
      detailActions[id] = await evaluate(`(() => {
        const dialog=document.querySelector('[role="dialog"]');
        const result={title:dialog?.querySelector('h2')?.textContent.trim(),text:dialog?.innerText||'',primary:dialog?.querySelector('.pachax-details-primary')?.textContent.trim()};
        window.__commercialOpenedUrl=null;
        window.open=url=>{window.__commercialOpenedUrl=String(url)};
        dialog?.querySelector('.pachax-details-primary')?.click();
        result.url=window.__commercialOpenedUrl;
        return result;
      })()`)
      assert.equal(detailActions[id].title, title)
      if (id !== 'retail') await evaluate(`document.querySelector('.pachax-pricing-dialog-close')?.click()`)
    }
    for (const [id, expectedName] of [['restaurant', 'Restaurante con salón'], ['distribution', 'Producción y Distribución'], ['nightclub', 'Nightclub & Lounge']]) {
      assert.equal(detailActions[id].title, expectedName, `${id} abre detalles completos`)
      assert.match(detailActions[id].url || '', /wa\.me\/59177987776/)
      assert(decodeURIComponent(detailActions[id].url).includes(expectedName), `${id} conserva el contacto personalizado`)
    }
    assert.equal(detailActions.hamburger.title, 'Restaurante Rápido')
    assert.match(detailActions.hamburger.primary, /Ver planes/)
    assert.equal(detailActions.retail.title, 'Comercio / Venta rápida')
    assert.match(detailActions.retail.primary, /Ver planes/)
    assert.match(detailActions.custom.primary, /Cotizar a medida/)
    assert.match(detailActions.custom.url || '', /wa\.me\/59177987776/)
    assert.equal(await evaluate(`document.querySelectorAll('a[href^="/register"]').length`), 0, 'Ver planes nunca debe abrir /register')
    const catalogRetailSelection = await waitForValue(`document.querySelector('#planes')?.dataset.selectedQuickService`, value => value === 'retail', 'Comercio conserva la selección al navegar desde el catálogo')
    assert.equal(catalogRetailSelection, 'retail')
    if (!await evaluate(`Boolean(document.querySelector('[data-plan-template="retail"]'))`)) {
      await evaluate(`document.querySelector('#planes [data-pricing-mode="direct"] button')?.click()`)
    }
    assert.equal(await evaluate(`document.querySelector('[data-plan-template="retail"]')?.getAttribute('aria-pressed')`), 'true', 'El modal de planes abre Comercio como plantilla seleccionada')
    await evaluate(`document.querySelector('.pachax-pricing-dialog-close')?.click()`)
    await evaluate(`(() => { const trigger=document.querySelector('#plantillas [data-template-id="restaurant"] .pachax-card-detail-button'); trigger?.focus(); trigger?.click(); })()`)
    await waitForValue(`document.querySelector('[role="dialog"] h2')?.textContent.trim()`, value => value === 'Restaurante con salón', 'detalle accesible Restaurante')
    await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Tab', code: 'Tab', modifiers: 8 })
    await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Tab', code: 'Tab', modifiers: 8 })
    assert.equal(await evaluate(`document.activeElement?.classList.contains('pachax-details-primary')`), true, 'El foco queda dentro del diálogo al recorrer controles con Shift+Tab')
    await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape' })
    await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape' })
    await waitForValue(`Boolean(document.querySelector('[role="dialog"]'))`, value => value === false, 'Escape cierra detalles')
    assert.equal(await evaluate(`document.activeElement?.classList.contains('pachax-card-detail-button')`), true, 'Al cerrar, el foco vuelve a la ficha que abrió los detalles')
    await evaluate(`document.querySelector('.pachax-outline-button')?.click()`)
    const discoveryTarget = await waitForValue(`Math.round(document.querySelector('#plantillas')?.getBoundingClientRect().top || 99999)`, value => value < height, 'El CTA Descubrir lleva al catálogo real')
    assert(discoveryTarget < height, 'Descubrir mi plantilla debe llevar al catálogo existente')
    await evaluate(`window.scrollTo({ top: 0, behavior: 'instant' })`)
    await evaluate(`document.querySelector('.pachax-carousel-next')?.click()`)
    const nextTemplate = await waitForValue(`document.querySelector('.pachax-carousel-dots button[aria-current="true"]')?.getAttribute('aria-label')`, value => value === 'Ir a Producción y Distribución', 'La flecha avanza el carrusel')
    assert.equal(nextTemplate, 'Ir a Producción y Distribución')
    await evaluate(`document.querySelector('#planes [data-pricing-mode="direct"] button')?.click()`)
    const noOfferState = await evaluate(`document.querySelector('[role="dialog"]')?.innerText || ''`)
    assert(/Planes en preparación|Ofertas por verificar|No hay ofertas aprobadas|No se pudieron verificar/.test(noOfferState), 'El detalle distingue el estado real de la oferta')
    assert.equal(/\$(29|59|99)(\.00)?/.test(noOfferState), false, 'No deben aparecer precios de referencia')
    assert.equal(await evaluate(`document.querySelectorAll('[data-plan-template]').length`), 2, 'El selector de planes existe solo dentro del detalle')
    await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Tab', code: 'Tab', modifiers: 8 })
    await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Tab', code: 'Tab', modifiers: 8 })
    assert.equal(await evaluate(`document.activeElement?.getAttribute('data-quick-plans-inquiry')`), 'retail', 'El foco recorre el diálogo de modalidad con Shift+Tab')
    await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape' })
    await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape' })
    await waitForValue(`Boolean(document.querySelector('.pachax-pricing-dialog'))`, value => value === false, 'Escape cierra el detalle comercial')
    assert.equal(await evaluate(`document.activeElement?.closest('[data-pricing-mode="direct"]') !== null`), true, 'Al cerrar los detalles, el foco vuelve a la modalidad elegida')
    await evaluate(`document.querySelector('#planes [data-pricing-mode="direct"] button')?.click()`)
    await evaluate(`document.querySelector('[data-plan-template="retail"]')?.click()`)
    const selectedRetail = await waitForValue(`document.querySelector('[data-plan-template="retail"]')?.getAttribute('aria-pressed')`, value => value === 'true', 'Comercio selecciona sus planes')
    assert.equal(selectedRetail, 'true')
    await evaluate(`(() => {
      window.__plansInquiryUrl = null;
      window.open = (url) => { window.__plansInquiryUrl = String(url); };
      document.querySelector('[data-quick-plans-inquiry="retail"]')?.click();
    })()`)
    const plansInquiryUrl = await evaluate(`window.__plansInquiryUrl`)
    assert.match(plansInquiryUrl || '', /wa\.me\/59177987776/, 'El estado sin oferta permite consulta por WhatsApp')
    await evaluate(`document.querySelector('.pachax-pricing-dialog-close')?.click()`)

    if (width === 390) {
      await evaluate(`document.querySelector('.pachax-menu-toggle')?.click()`)
      const mobileMenu = await waitForValue(`document.querySelector('.pachax-menu-toggle')?.getAttribute('aria-expanded')`, value => value === 'true', 'El menú móvil abre')
      assert.equal(mobileMenu, 'true')
      await evaluate(`document.querySelector('.pachax-mobile-menu nav button')?.click()`)
      await waitForValue(`document.querySelector('.pachax-menu-toggle')?.getAttribute('aria-expanded')`, value => value === 'false', 'El menú móvil cierra al navegar')
    }

    console.log(`PASS ${width}×${height}: carrusel unificado, CTA, navegación móvil y sin overflow`)
  }

} finally {
  if (socket?.readyState === WebSocket.OPEN) {
    try { await send('Browser.close') } catch { /* Chrome may already be exiting. */ }
  }
  if (socket?.readyState === WebSocket.OPEN) {
    socket.close()
  }
  browser.kill()
  await sleep(1800)
  try {
    rmSync(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 250 })
  } catch (error) {
    console.warn(`Chrome perfil temporal: ${error.message}`)
  }
}
