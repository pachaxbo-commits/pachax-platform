// Browser regression for the public showcase. Run against the demo emulator
// server or preview server; never writes to Firestore.
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { createLandingCatalogAdapterScript, getLandingCatalogFixture, LANDING_TEST_CONTACT } from './landingCommercialTestFixture.mjs'

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
assert.equal(target.protocol, 'http:', 'Landing regression only runs against the local emulator-mode server.')
assert(['localhost', '127.0.0.1'].includes(target.hostname), 'Landing regression refuses non-local hosts to prevent Production requests.')
const scenario = process.env.LANDING_TEST_CATALOG_SCENARIO || 'synthetic'
const fixture = getLandingCatalogFixture(scenario)
const functionsPort = Number(process.env.LANDING_TEST_FUNCTIONS_PORT || 5101)
assert(Number.isInteger(functionsPort) && functionsPort > 0 && functionsPort < 65536)
const response = await fetch(baseUrl)
assert.equal(response.status, 200, `El servidor local no responde: ${baseUrl}`)
const probe = createServer()
await new Promise((done) => probe.listen(0, '127.0.0.1', done))
const port = probe.address().port
await new Promise((done) => probe.close(done))
const output = resolve('tmp/landing-regression-evidence', scenario)
const viewportCases = [[320, 740], [360, 800], [375, 812], [390, 844], [430, 932], [768, 1024], [1024, 768], [1440, 900], [1920, 1080]]
  .filter(([width]) => !process.env.LANDING_TEST_WIDTH || width === Number(process.env.LANDING_TEST_WIDTH))
mkdirSync(output, { recursive: true })
const profile = mkdtempSync(join(tmpdir(), 'pachax-landing-browser-'))
const browser = spawn(chrome, [
  '--headless=new', '--disable-gpu', '--no-sandbox',
  `--remote-debugging-port=${port}`, '--remote-allow-origins=*',
  `--user-data-dir=${profile}`,
  'about:blank',
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
      tab = tabs.find((item) => item.type === 'page')
      if (tab?.webSocketDebuggerUrl) break
    } catch { /* Chrome is starting. */ }
  }
  assert(tab?.webSocketDebuggerUrl, 'No se encontró la pestaña CDP')
  socket = new WebSocket(tab.webSocketDebuggerUrl)
  await new Promise((done, fail) => { socket.onopen = done; socket.onerror = fail })
  let sequence = 1
  const pending = new Map()
  const browserRequests = []
  socket.onmessage = (event) => {
    const payload = JSON.parse(event.data)
    if (!pending.has(payload.id)) return
    const { done, fail } = pending.get(payload.id)
    pending.delete(payload.id)
    payload.error ? fail(new Error(JSON.stringify(payload.error))) : done(payload.result)
  }
  socket.addEventListener('message', ({ data }) => {
    const message = JSON.parse(data)
    if (message.method === 'Network.requestWillBeSent') browserRequests.push(message.params.request.url)
  })
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
  const clickInFrameWithPointer = async (frameSelector, targetSelector) => {
    await evaluate(`(() => {
      const frame=document.querySelector(${JSON.stringify(frameSelector)});
      const target=frame?.contentDocument?.querySelector(${JSON.stringify(targetSelector)});
      frame?.scrollIntoView({block:'center',behavior:'instant'});
      target?.scrollIntoView({block:'center',behavior:'instant'});
    })()`)
    await sleep(100)
    const point = await evaluate(`(() => {
      const frame=document.querySelector(${JSON.stringify(frameSelector)});
      const target=frame?.contentDocument?.querySelector(${JSON.stringify(targetSelector)});
      const frameRect=frame?.getBoundingClientRect();
      const targetRect=target?.getBoundingClientRect();
      if (!frameRect || !targetRect) return null;
      const localX=targetRect.left+targetRect.width/2, localY=targetRect.top+targetRect.height/2;
      const x=frameRect.left+frame.clientLeft+localX, y=frameRect.top+frame.clientTop+localY;
      const hit=document.elementFromPoint(x,y);
      const innerHit=frame.contentDocument?.elementFromPoint(localX,localY);
      return {x,y,pointValid:hit===frame && Boolean(innerHit && (innerHit===target || target.contains(innerHit)))};
    })()`)
    assert(point?.pointValid, `El punto calculado no alcanza ${targetSelector} dentro de ${frameSelector}: ${JSON.stringify(point)}`)
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', ...point })
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', ...point, button: 'left', clickCount: 1 })
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', ...point, button: 'left', clickCount: 1 })
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
    const tutorialButtons = [...document.querySelectorAll('#tutoriales [data-tutorial-template]')];
    const tutorialFrame = document.querySelector('#tutoriales .pachax-tutorials-frame');
    const tutorialWorkspace = document.querySelector('#tutoriales .pachax-tutorials-workspace');
    const tutorialSelector = document.querySelector('#tutoriales .pachax-tutorials-selector');
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
      tutorialSelected: document.querySelector('#tutoriales [data-tutorial-template][aria-selected="true"]')?.dataset.tutorialTemplate,
      tutorialFrameUrl: tutorialFrame?.getAttribute('src') || '',
      tutorialFrameLoaded: tutorialFrame?.contentDocument?.readyState === 'complete',
      tutorialAppReady: Boolean(tutorialFrame?.contentDocument?.querySelector('[data-demo-runtime-ready="true"], [data-demo-only-ready="true"]')),
      tutorialErrorVisible: Boolean(document.querySelector('#tutoriales .pachax-tutorials-load-error')),
      tutorialWorkspaceColumns: tutorialWorkspace ? getComputedStyle(tutorialWorkspace).gridTemplateColumns.split(' ').length : 0,
      tutorialSelectorWidth: tutorialSelector?.clientWidth || 0,
      tutorialSelectorScrollWidth: tutorialSelector?.scrollWidth || 0,
      catalogCount: catalogCards.length,
      catalogEmpty: Boolean(document.querySelector('#plantillas [data-catalog-state="empty"]')),
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
    for (let attempt = 0; attempt < 100; attempt++) {
      const result = await state()
      if (predicate(result)) return result
      await sleep(150)
    }
    throw new Error(`Tiempo agotado: ${label}; estado ${JSON.stringify(await state())}`)
  }
  const waitForValue = async (expression, predicate, label) => {
    for (let attempt = 0; attempt < 100; attempt++) {
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
  const screenshotFullPage = async (label) => {
    await evaluate(`window.scrollTo({top:0,behavior:'instant'})`)
    await sleep(120)
    const { contentSize } = await send('Page.getLayoutMetrics')
    const capture = await send('Page.captureScreenshot', {
      format: 'png', captureBeyondViewport: true,
      clip: { x: 0, y: 0, width: contentSize.width, height: contentSize.height, scale: 1 },
    })
    writeFileSync(resolve(output, `${label}.png`), Buffer.from(capture.data, 'base64'))
  }
  const screenshotElement = async (selector, label) => {
    await evaluate(`Promise.all([...document.querySelectorAll(${JSON.stringify(selector + ' img')})].map(img => { img.loading='eager'; return img.decode().catch(() => undefined); }))`)
    const rect = await evaluate(`(() => { const el=document.querySelector(${JSON.stringify(selector)}); if(!el) return null; const r=el.getBoundingClientRect(); return {x:r.x+scrollX,y:r.y+scrollY,width:r.width,height:r.height}; })()`)
    assert(rect && rect.width > 0 && rect.height > 0, `No se pudo medir ${selector} para la captura`)
    const capture = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip: { ...rect, scale: 1 } })
    writeFileSync(resolve(output, `${label}.png`), Buffer.from(capture.data, 'base64'))
  }
  await send('Network.enable')
  await send('Page.enable')
  await send('Runtime.enable')
  await send('Page.addScriptToEvaluateOnNewDocument', {
    source: createLandingCatalogAdapterScript({ scenario, fixture, functionsPort }),
  })

  // The tutorials tab selector must stay within its own scroller on initial load.
  await send('Page.navigate', { url: baseUrl })
  await waitForValue('document.querySelectorAll("#hero [data-pachax-template-card]").length', value => value === 5, 'scroll reset: landing cards mounted')
  await waitForValue('Boolean(document.querySelector(".pachax-brand-lockup img")?.naturalWidth)', value => value === true, 'landing brand asset loaded')
  await waitForValue('window.__PACHAX_LANDING_TEST_CATALOG__?.calls || 0', value => value > 0, 'la landing consulta el contrato público por el adaptador local')
  const initialFixtureState = await evaluate('window.__PACHAX_LANDING_TEST_CATALOG__')
  assert.equal(initialFixtureState?.scenario, scenario, 'El adaptador local reporta el escenario solicitado')
  assert(initialFixtureState.calls > 0, 'La landing consultó el contrato público mediante el adaptador local')
  assert.deepEqual(initialFixtureState.blocked, [], 'La landing no intenta llamar servicios externos o acciones de escritura')
  await sleep(400)
  const initialScrollY = await evaluate('window.scrollY')
  assert(initialScrollY <= 1, `La home no debe desplazarse al cargar; scrollY=${initialScrollY}`)

  for (const [width, height] of viewportCases) {
    await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 768 })
    await send('Emulation.setTouchEmulationEnabled', { enabled: width < 768, maxTouchPoints: 1 })
    const viewportUrl = new URL(baseUrl)
    viewportUrl.searchParams.set('__landingTestWidth', String(width))
    await send('Page.navigate', { url: viewportUrl.toString() })
    const loaded = scenario === 'synthetic'
      ? await waitFor((res) => res.count === 5 && res.specializedCount === 3 && res.selfServiceCount === 2 && res.brandLogoLoaded, `${width}: loaded synthetic catalog`)
      : await waitFor((res) => res.count === 0 && res.catalogEmpty && res.brandLogoLoaded, `${width}: loaded confirmed empty catalog`)
    const pageScrollY = await evaluate('window.scrollY')
    assert(pageScrollY <= 1, `${width}: la landing no debe desplazarse al cargar; scrollY=${pageScrollY}`)
    const catalogState = scenario === 'synthetic'
      ? await waitFor((res) => res.catalogCount === 6, `${width}: synthetic catalog entries`)
      : await waitFor((res) => res.catalogCount === 0 && res.catalogEmpty, `${width}: confirmed empty catalog`)
    const fixtureState = await evaluate('window.__PACHAX_LANDING_TEST_CATALOG__')
    assert.equal(fixtureState?.scenario, scenario)
    // Chromium can restore the same document between viewport navigations, so
    // the adapter counter is asserted on the initial document above. Each
    // viewport still verifies the exact scenario-specific catalog projection.
    assert.deepEqual(fixtureState.blocked, [], `${width}: no se intentaron funciones ni endpoints externos`)
    await evaluate(`document.querySelectorAll('#planes img').forEach(image=>{image.loading='eager'})`)
    const pricingImages = await waitFor((res) => res.pricingImagesLoaded, `${width}: commercial images loaded`)
    await sleep(400)

    if (scenario === 'synthetic') {
      assert.equal(loaded.specializedCount, 3, 'La fila debe conservar las tres fichas especializadas')
      assert.equal(loaded.selfServiceCount, 2, 'La fila debe conservar las dos fichas de autoservicio')
    } else {
      assert.equal(loaded.specializedCount + loaded.selfServiceCount, 0, 'El catálogo vacío no publica ofertas en el hero')
    }
    assert.match(loaded.title || '', /Gestiona tu negocio[\s\S]*de forma inteligente/, 'El titular coincide con la referencia aprobada')
    assert.equal(loaded.brandLogoLoaded, true, 'El logotipo oficial debe estar disponible')
    assert.equal(loaded.tutorialTabCount, 5, 'Tutoriales presenta las cinco demos públicas disponibles')
    assert.equal(loaded.tutorialSelected, 'restaurant', 'Tutoriales inicia en Restaurante con salón')
    if (width > 1100) assert.equal(loaded.tutorialSelectorScrollWidth, loaded.tutorialSelectorWidth, 'Las cinco plantillas quedan visibles en escritorio')
    assert.equal(loaded.overflow, false, 'No debe existir desbordamiento horizontal')
    assert(Math.abs(loaded.footerTrailingSpace) <= 1, 'No debe existir espacio muerto debajo del footer')
    assert.equal(loaded.hasSparklesInBanner, false, 'No deben existir iconos Sparkles en el banner a medida')
    assert.deepEqual(loaded.pricingModeCards, ['assisted', 'direct'], 'Planes muestra las dos modalidades aprobadas')
    assert.equal(pricingImages.pricingImagesLoaded, true, 'Las dos fotografías comerciales están cargadas')
    assert.match(loaded.pricingHeading, /Planes adaptados a la escala real de tu empresa/)
    assert(loaded.pricingCardHeights.every(height => height > 200), 'Las dos tarjetas deben conservar una altura legible')
    assert(loaded.pricingCardCopy.every(text => !text.includes('…')), 'Las descripciones de las modalidades no se recortan')
    if (scenario === 'synthetic') {
      assert.deepEqual(catalogState.catalogIds, ['restaurant', 'distribution', 'nightclub', 'hamburger', 'retail', 'custom'])
      assert.equal(catalogState.catalogColumns, width <= 680 ? 1 : width <= 1100 ? 2 : 3, 'El catálogo debe adaptarse como grilla, sin carrusel móvil')
    } else {
      assert.equal(catalogState.catalogEmpty, true, 'El catálogo confirma el estado vacío sin sembrar ofertas')
      assert.equal(catalogState.catalogCount, 0, 'Un catálogo vacío no genera fichas comerciales')
    }

    if ([320, 375].includes(width)) {
      await evaluate(`(() => { const section=document.querySelector('#tutoriales'); window.scrollTo({top:section.offsetTop-Math.round(innerHeight*.4),behavior:'instant'}); })()`)
      await waitForValue(`document.querySelector('#tutoriales .pachax-tutorials-frame')?.contentDocument?.readyState`, value => value === 'complete', 'carga el demo para captura integral')
    }
    await evaluate(`(() => { const section=document.querySelector('#extras'); window.scrollTo({top:section.offsetTop-Math.round(innerHeight*.4),behavior:'instant'}); const image=section.querySelector('.pachax-extras-contact-photo'); if(image) image.loading='eager'; return image?.decode().catch(()=>undefined); })()`)
    const extrasState = await evaluate(`(() => {
      const section=document.querySelector('#extras');
      return {
        title: section?.querySelector('h2')?.innerText || '',
        services: section?.querySelectorAll('.pachax-extra-card').length || 0,
        empty: section?.querySelector('.pachax-extras-empty')?.innerText || '',
        photoLoaded: Boolean(section?.querySelector('.pachax-extras-contact-photo')?.naturalWidth),
        contactActions: section?.querySelectorAll('.pachax-extras-contact-actions button').length || 0,
        contactActionsDisabled: [...section?.querySelectorAll('.pachax-extras-contact-actions button') || []].every(button => button.disabled),
        footerLinks: [...document.querySelectorAll('.pachax-footer-navigation a')].map(link=>link.getAttribute('href')),
        registerLinks: document.querySelectorAll('.pachax-trust-footer a[href^="/register"], .pachax-trust-footer button[data-register]').length,
      };
    })()`)
    assert.match(extrasState.title, /Potencia tu operación con módulos y servicios especializados/)
    assert(extrasState.services >= 0)
    if (extrasState.services === 0) assert.match(extrasState.empty, /Servicios en preparación/, 'No se muestran servicios de borrador')
    assert.equal(extrasState.photoLoaded, true, 'El asset editorial del cierre se carga')
    assert.equal(extrasState.contactActions, 2, 'El cierre separa WhatsApp y solicitud de propuesta')
    if (scenario === 'empty') assert.equal(extrasState.contactActionsDisabled, true, 'Sin número publicable, las acciones de contacto permanecen deshabilitadas')
    else assert.equal(extrasState.contactActionsDisabled, false, 'El fixture habilita las acciones para probarlas sin abrir servicios externos')
    assert.deepEqual(extrasState.footerLinks, ['#plantillas', '#planes', '#tutoriales', '#extras'])
    assert.equal(extrasState.registerLinks, 0, 'El footer no anuncia alta autónoma pausada')

    await evaluate(`(() => {
      window.__extrasContactUrls=[];
      window.open=(url)=>window.__extrasContactUrls.push(String(url));
      document.querySelector('.pachax-contact-action')?.click();
      document.querySelector('.pachax-proposal-action')?.click();
    })()`)
    const extrasContactUrls = await evaluate(`window.__extrasContactUrls`)
    if (scenario === 'empty') {
      assert.equal(extrasContactUrls.length, 0, 'El estado vacío no abre consultas sin número configurado')
    } else {
      assert.equal(extrasContactUrls.length, 2)
      assert(extrasContactUrls.every(url => new URL(url).pathname === `/${LANDING_TEST_CONTACT.number}`), 'Ambas acciones usan exclusivamente el contacto reservado para QA')
      assert.notEqual(new URL(extrasContactUrls[0]).searchParams.get('text'), new URL(extrasContactUrls[1]).searchParams.get('text'), 'WhatsApp y propuesta tienen mensajes distintos')
    }

    await screenshot(`${width}-hero`)
    if ([320, 375, 390, 1440, 1920].includes(width)) await screenshotFullPage(`${width}-landing-full`)
    if (width === 1440 || width === 390 || width === 1920) {
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
      if (scenario === 'empty') {
        assert.equal(await evaluate(`document.querySelectorAll('[data-specialized-template]').length`), 0, 'El detalle vacío no inventa soluciones de implementación')
        assert.match(await evaluate(`document.querySelector('[role="dialog"]')?.innerText||''`), /No hay soluciones de implementación publicadas/)
      }
      await screenshot(`${width}-implementation-details`)
      await evaluate(`document.querySelector('.pachax-pricing-dialog-close')?.click()`)
      await evaluate(`document.querySelector('#planes [data-pricing-mode="direct"] button')?.click()`)
      await waitForValue(`document.querySelector('[role="dialog"] h3')?.textContent.trim()`, value => value === 'Activación Directa', 'abre detalle activación')
      if (scenario === 'empty') {
        const emptyPricing = await evaluate(`document.querySelector('[role="dialog"]')?.innerText||''`)
        assert.match(emptyPricing, /No hay soluciones de activación directa publicadas/)
        assert.equal(await evaluate(`document.querySelectorAll('[data-plan-template]').length`), 0, 'Sin catálogo no se habilita la selección de una plantilla comercial')
        assert.equal(/(?:Bs\s?\d|\$\s?\d)/.test(emptyPricing), false, 'El catálogo vacío no muestra precios')
      }
      await screenshot(`${width}-direct-details-no-published-plans`)
      await evaluate(`document.querySelector('.pachax-pricing-dialog-close')?.click()`)

      const onboardingState = await evaluate(`(() => {
        const section=document.querySelector('#onboarding');
        const layout=section?.querySelector('.pachax-onboarding-layout');
        const device=section?.querySelector('.pachax-onboarding-device');
        const cta=section?.querySelector('.pachax-onboarding-cta');
        return {
          title: section?.querySelector('h2')?.innerText || '',
          steps: section?.querySelectorAll('[data-onboarding-step-trigger]').length || 0,
          activeStep: Number(device?.getAttribute('data-onboarding-step')),
          progress: section?.querySelector('[data-onboarding-progress-label]')?.textContent.trim(),
          cta: cta?.getAttribute('href') || '',
          layoutAreas: layout ? getComputedStyle(layout).gridTemplateAreas : '',
          deviceWidth: Math.round(device?.getBoundingClientRect().width || 0),
          deviceHeight: Math.round(device?.getBoundingClientRect().height || 0),
        };
      })()`)
      assert.match(onboardingState.title, /Configura y prepara tu empresa[\s\S]*paso a paso/)
      assert.equal(onboardingState.steps, 4, 'La sección conserva los cuatro pasos navegables')
      assert.equal(onboardingState.activeStep, 1, 'La demostración inicia en el primer paso')
      assert.equal(onboardingState.progress, 'Paso 1 de 4', 'El dispositivo muestra el paso activo')
      assert.match(onboardingState.cta, /^https:\/\/wa\.me\/\d+\?/, 'El CTA conserva un enlace WhatsApp válido; el runner nunca lo abre')
      assert(onboardingState.deviceWidth > 200 && onboardingState.deviceHeight > 300, 'El dispositivo conserva proporciones visibles')
      assert.equal(await evaluate(`document.querySelectorAll('#onboarding a[href^="/register"]').length`), 0, 'La demostración no inicia el registro autónomo pausado')
      if (width <= 1100) assert.match(onboardingState.layoutAreas, /"intro" "steps" "device" "action"/, 'En móvil/tablet, el recorrido precede al teléfono y al CTA')

      await evaluate(`(() => { const section=document.querySelector('#onboarding'); window.scrollTo({top:section.offsetTop-Math.round(innerHeight*.45),behavior:'instant'}); })()`)
      await sleep(200)
      await screenshot(`${width}-section3-4-transition`)
      await screenshotElement('#onboarding', `${width}-onboarding-full`)
      await screenshotElement('#onboarding', `${width}-onboarding-step-1`)

      assert.equal(await evaluate(`document.querySelector('.pachax-onboarding-app-controls > button:first-child')?.disabled`), true, 'Anterior queda deshabilitado en el primer paso')
      await evaluate(`document.querySelector('.pachax-onboarding-app-controls > button:last-child')?.click()`)
      await waitForValue(`document.querySelector('.pachax-onboarding-device')?.getAttribute('data-onboarding-step')`, value => value === '2', 'Siguiente avanza al paso dos')
      await evaluate(`document.querySelector('.pachax-onboarding-app-controls > button:first-child')?.click()`)
      await waitForValue(`document.querySelector('.pachax-onboarding-device')?.getAttribute('data-onboarding-step')`, value => value === '1', 'Anterior vuelve al primer paso')
      await evaluate(`window.__onboardingErrors=[]; window.addEventListener('error',event=>window.__onboardingErrors.push(event.message)); window.addEventListener('unhandledrejection',event=>window.__onboardingErrors.push(String(event.reason)));`)

      await evaluate(`(() => {
        window.__onboardingServiceRequests=[];
        const originalFetch=window.fetch.bind(window);
        window.fetch=(input,init)=>{
          const url=typeof input==='string'?input:input?.url||'';
          if(/firebase|googleapis|tenantGateway|functions/i.test(url)) window.__onboardingServiceRequests.push(url);
          return originalFetch(input,init);
        };
        const originalOpen=XMLHttpRequest.prototype.open;
        XMLHttpRequest.prototype.open=function(method,url,...rest){
          if(/firebase|googleapis|tenantGateway|functions/i.test(String(url))) window.__onboardingServiceRequests.push(String(url));
          return originalOpen.call(this,method,url,...rest);
        };
      })()`)
      await evaluate(`document.querySelector('[data-onboarding-step-trigger="2"]')?.click()`)
      await waitForValue(`document.querySelector('.pachax-onboarding-device')?.getAttribute('data-onboarding-step')`, value => value === '2', 'el stepper actualiza el simulador')
      await evaluate(`document.querySelector('[data-demo-template="nightclub_lounge"]')?.click()`)
      assert.equal(await evaluate(`document.querySelector('[data-demo-template="nightclub_lounge"]')?.getAttribute('aria-pressed')`), 'true', 'La plantilla de ejemplo se puede seleccionar')
      assert.match(await evaluate(`document.querySelector('.pachax-onboarding-selection-note')?.textContent||''`), /Nightclub & Lounge/)
      await evaluate(`document.activeElement?.blur()`)
      await screenshotElement('#onboarding', `${width}-onboarding-step-2`)

      await evaluate(`document.querySelector('[data-onboarding-step-trigger="3"]')?.click()`)
      await waitForValue(`document.querySelector('.pachax-onboarding-device')?.getAttribute('data-onboarding-step')`, value => value === '3', 'el tercer paso queda sincronizado')
      await evaluate(`document.querySelector('[data-demo-palette="emerald"]')?.click()`)
      assert.equal(await evaluate(`document.querySelector('[data-demo-palette="emerald"]')?.getAttribute('aria-pressed')`), 'true', 'La paleta de marca se puede seleccionar')
      assert.equal(await evaluate(`document.querySelector('.pachax-onboarding-brand-preview')?.style.getPropertyValue('--demo-brand-primary')`), '#0F766E')
      await evaluate(`document.activeElement?.blur()`)
      await screenshotElement('#onboarding', `${width}-onboarding-step-3`)

      await evaluate(`document.querySelector('[data-onboarding-step-trigger="4"]')?.click()`)
      await waitForValue(`document.querySelector('.pachax-onboarding-device')?.getAttribute('data-onboarding-step')`, value => value === '4', 'el paso final queda sincronizado')
      const illustrativeProvisioning = await evaluate(`document.querySelector('[data-onboarding-step-content="4"]')?.innerText||''`)
      assert.match(illustrativeProvisioning, /Resultado ilustrativo · no ejecutado/)
      assert.match(illustrativeProvisioning, /no crea|no se crea|no ejecutado/i)
      assert.equal(await evaluate(`document.querySelector('.pachax-onboarding-app-controls > button:last-child')?.disabled`), true, 'Siguiente queda deshabilitado en el último paso')
      await evaluate(`document.activeElement?.blur()`)
      await screenshotElement('#onboarding', `${width}-onboarding-step-4`)
      await evaluate(`document.querySelector('.pachax-onboarding-app-controls > button:first-child')?.click()`)
      assert.equal(await evaluate(`document.querySelector('.pachax-onboarding-device')?.getAttribute('data-onboarding-step')`), '3', 'Anterior retrocede manteniendo sincronizado el simulador')
      assert.deepEqual(await evaluate(`window.__onboardingServiceRequests`), [], 'La demostración no llama Firebase, Functions ni servicios de aprovisionamiento')
      assert.deepEqual(await evaluate(`window.__onboardingErrors`), [], 'La demostración no genera errores de navegador')

      await evaluate(`(() => { const section=document.querySelector('#tutoriales'); window.scrollTo({top:section.offsetTop-Math.round(innerHeight*.45),behavior:'instant'}); })()`)
      await sleep(250)
      await screenshot(`${width}-section4-5-transition`)
      await waitForValue(`document.querySelector('#tutoriales .pachax-tutorials-frame')?.contentDocument?.readyState`, value => value === 'complete', 'demo real de tutoriales cargada')
      const tutorialState = await state()
      assert.equal(tutorialState.tutorialSelected, 'restaurant')
      assert.equal(tutorialState.tutorialFrameLoaded, true)
      assert.equal(tutorialState.tutorialAppReady, true, 'La demo inicial confirma que React montó su experiencia')
      assert.equal(tutorialState.tutorialWorkspaceColumns, width > 1100 ? 2 : 1, 'El espacio real de tutorial se adapta entre escritorio y móvil')
      assert.match(tutorialState.tutorialFrameUrl, /\/demo\/restaurant\?/)
      await sleep(1500)
      await waitForValue(`Boolean(document.querySelector('#tutoriales iframe')?.contentDocument?.querySelector('[role="dialog"][aria-label="Tutorial interactivo"]'))`, value => !value, 'la introducción inicial no cubre el espacio de operación')
      await screenshotElement('#tutoriales', `${width}-tutorials-full`)
      await evaluate(`document.querySelector('#tutoriales [data-tutorial-open-guide]')?.click()`)
      await waitForValue(`Boolean(document.querySelector('#tutoriales iframe')?.contentDocument?.querySelector('[role="dialog"][aria-label="Aprender a usar PACHAX"]'))`, value => value, 'abre el Centro de aprendizaje real de Restaurante')
      assert.match(await evaluate(`document.querySelector('#tutoriales iframe')?.contentDocument?.querySelector('[role="dialog"][aria-label="Aprender a usar PACHAX"]')?.innerText||''`), /Aprender a usar PACHAX|tutoriales disponibles/i)
      await screenshotElement('#tutoriales', `${width}-tutorials-restaurant-learning-center`)
      await evaluate(`document.querySelector('#tutoriales .pachax-tutorials-reset')?.click()`)
      assert.match(await evaluate(`document.querySelector('#tutoriales .pachax-tutorials-feedback')?.textContent||''`), /restauró su dataset/i, 'El control propio confirma el reinicio de la demo')
      await evaluate(`(() => { const buttons=document.querySelector('#tutoriales iframe')?.contentDocument?.querySelectorAll('[role="dialog"][aria-label="Aprender a usar PACHAX"] button[aria-label="Cerrar"]'); buttons?.item(buttons.length-1)?.click(); })()`)
      await waitForValue(`Boolean(document.querySelector('#tutoriales iframe')?.contentDocument?.querySelector('[role="dialog"][aria-label="Aprender a usar PACHAX"]'))`, value => !value, 'el usuario puede cerrar el Centro de aprendizaje real')
      await evaluate(`document.querySelector('#tutoriales [data-tutorial-template="distribution"]')?.click()`)
      const distributionTutorial = await waitFor((res) => res.tutorialSelected === 'distribution' && res.tutorialFrameLoaded && res.tutorialAppReady && /\/demo\/distribution\?.*tour=start/.test(res.tutorialFrameUrl), 'abre demo y recorrido nativo de Distribución')
      assert.match(distributionTutorial.tutorialFrameUrl, /tour=start/)
      await waitForValue(`Boolean(document.querySelector('#tutoriales iframe')?.contentDocument?.querySelector('[aria-label="Centro de aprendizaje y tutoriales"]'))`, value => value, 'el recorrido soportado de Distribución abre el tutorial real')
      await screenshotElement('#tutoriales', `${width}-tutorials-distribution-guide`)
      await evaluate(`document.querySelector('#tutoriales [data-tutorial-template="nightclub"]')?.click()`)
      await waitFor((res) => res.tutorialSelected === 'nightclub' && res.tutorialFrameLoaded && res.tutorialAppReady, 'abre demo de Nightclub')
      await waitForValue(`Boolean(document.querySelector('#tutoriales iframe')?.contentDocument?.querySelector('button[data-tutorial-trigger]'))`, value => value, 'aparece el acceso de tutorial de Nightclub')
      assert.equal(await evaluate(`document.querySelector('#tutoriales iframe')?.contentDocument?.querySelector('button[data-tutorial-trigger]')?.disabled`), false, 'Nightclub conserva disponible su acceso nativo al tutorial')
      await screenshotElement('#tutoriales', `${width}-tutorials-nightclub-guide`)
      await evaluate(`document.querySelector('#tutoriales [data-tutorial-template="hamburger"]')?.click()`)
      await waitFor((res) => res.tutorialSelected === 'hamburger' && res.tutorialFrameLoaded && res.tutorialAppReady, 'abre demo de Restaurante Rápido').catch(async (error) => {
        const details = await evaluate(`(() => { const child=document.querySelector('#tutoriales iframe')?.contentDocument; return { body:child?.body?.innerText.slice(0,1000)||'', root:child?.querySelector('#root')?.innerHTML.slice(0,700)||'', html:child?.documentElement?.outerHTML.slice(0,700)||'' } })()`)
        throw new Error(`${error.message}; Hamburger iframe=${JSON.stringify(details)}`)
      })
      await sleep(1500)
      await waitForValue(`Boolean(document.querySelector('#tutoriales iframe')?.contentDocument?.querySelector('[role="dialog"][aria-label="Tutorial interactivo"]'))`, value => !value, 'la introducción inicial no cubre el POS de Restaurante Rápido')
      await evaluate(`document.querySelector('#tutoriales [data-tutorial-open-guide]')?.click()`)
      await waitForValue(`Boolean(document.querySelector('#tutoriales iframe')?.contentDocument?.querySelector('[role="dialog"][aria-label="Aprender a usar PACHAX"]'))`, value => value, 'abre guía real de Restaurante Rápido')
      assert.equal((await state()).tutorialErrorVisible, false, 'Restaurante Rápido no muestra fallo de carga')
      await evaluate(`document.querySelector('#tutoriales [data-tutorial-template="retail"]')?.click()`)
      const retailTutorial = await waitFor((res) => res.tutorialSelected === 'retail' && res.tutorialFrameLoaded && res.tutorialAppReady && /\/demo\/retail\?/.test(res.tutorialFrameUrl), 'abre POS interactivo de Comercio')
      assert.equal(retailTutorial.tutorialErrorVisible, false, 'Comercio no muestra fallo de carga')
      assert.match(retailTutorial.tutorialFrameUrl, /\/demo\/retail\?/)
      assert.equal(await evaluate(`Boolean(document.querySelector('#tutoriales [data-tutorial-open-guide]'))`), true, 'Comercio anuncia el Centro integrado')
      await waitForValue(`document.querySelector('#tutoriales [data-tutorial-open-guide]')?.disabled`, value => value === false, 'el acceso se habilita cuando la demo está lista')
      await evaluate(`document.querySelector('#tutoriales [data-tutorial-open-guide]')?.click()`)
      await waitForValue(`Boolean(document.querySelector('#tutoriales iframe')?.contentDocument?.querySelector('[aria-label="Centro de tutoriales de Comercio"]'))`, value => value, 'abre el Centro de tutoriales de Comercio').catch(async error => {
        const details = await evaluate(`(() => { const child=document.querySelector('#tutoriales iframe')?.contentDocument; return {feedback:document.querySelector('#tutoriales .pachax-tutorials-feedback')?.innerText||'', buttonDisabled:document.querySelector('#tutoriales [data-tutorial-open-guide]')?.disabled, trigger:child?.querySelector('button[data-tutorial-target="tutorial-trigger-btn"]')?.getAttribute('aria-expanded')} })()`)
        throw new Error(`${error.message}; Retail guide debug=${JSON.stringify(details)}`)
      })
      assert.match(await evaluate(`document.querySelector('#tutoriales iframe')?.contentDocument?.querySelector('[aria-label="Recorridos disponibles"]')?.innerText||''`), /Venta por unidad[\s\S]*Venta por peso[\s\S]*Cobro demostrativo/)
      await screenshotElement('#tutoriales', `${width}-tutorials-retail-center`)
      await evaluate(`document.querySelector('#tutoriales iframe')?.contentDocument?.querySelector('[aria-label="Recorridos disponibles"] button')?.click()`)
      await waitForValue(`Boolean(document.querySelector('#tutoriales iframe')?.contentDocument?.querySelector('h3')?.innerText.includes('Catálogo'))`, value => value, 'inicia el recorrido interactivo de orientación de Comercio')
      await clickInFrameWithPointer('#tutoriales iframe', '[data-tutorial-target="catalog"]')
      await waitForValue(`document.querySelector('#tutoriales iframe')?.contentDocument?.querySelector('[role="progressbar"][aria-label="Progreso del recorrido"]')?.getAttribute('aria-valuenow')`, value => value === '1', 'un clic real en el POS completa el primer paso del recorrido de Comercio')
      await screenshotElement('#tutoriales', `${width}-tutorials-retail-orientation`)
      if (width === 390) {
        await evaluate(`document.querySelector('#tutoriales iframe').src='/__tutorial_failure_no_runtime__'`)
        let loadStatus = ''
        for (let attempt = 0; attempt < 110; attempt++) {
          loadStatus = await evaluate(`document.querySelector('#tutoriales .pachax-tutorials-live-state')?.innerText.trim()||''`)
          if (loadStatus === 'No se pudo cargar la demo') break
          await sleep(150)
        }
        assert.equal(loadStatus, 'No se pudo cargar la demo', 'El runtime ausente vence el timeout y se anuncia')
        assert.equal(await evaluate(`Boolean(document.querySelector('#tutoriales .pachax-tutorials-load-error[role="alert"] button'))`), true, 'El estado fallido permite reintentar')
        assert.equal(await evaluate(`Boolean(document.querySelector('#tutoriales .pachax-tutorials-load-error a[href^="/demo/retail"]'))`), true, 'El estado fallido permite abrir la demo completa')
        await evaluate(`document.querySelector('#tutoriales .pachax-tutorials-load-error button')?.click()`)
        await waitFor((res) => res.tutorialSelected === 'retail' && res.tutorialAppReady && !res.tutorialErrorVisible, 'Retail recupera el montaje al reintentar')
      }
      await evaluate(`(() => { const section=document.querySelector('#extras'); window.scrollTo({top:section.offsetTop-Math.round(innerHeight*.42),behavior:'instant'}); })()`)
      await sleep(200)
      await screenshot(`${width}-section5-6-transition`)
      await screenshotElement('#extras', `${width}-services-full`)
      await evaluate(`(() => { const footer=document.querySelector('.pachax-trust-footer'); window.scrollTo({top:footer.offsetTop-Math.round(innerHeight*.55),behavior:'instant'}); })()`)
      await sleep(180)
      await screenshot(`${width}-footer`)

      if (width === 390) {
        await evaluate(`document.querySelector('#tutoriales [data-tutorial-template="restaurant"]')?.focus()`)
        await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'ArrowRight', code: 'ArrowRight', windowsVirtualKeyCode: 39 })
        await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'ArrowRight', code: 'ArrowRight', windowsVirtualKeyCode: 39 })
        assert.equal((await state()).tutorialSelected, 'distribution', 'Las plantillas se recorren con flecha derecha')
        // The new iframe may autofocus during mounting; finish that navigation before testing the parent document keyboard control.
        await waitFor((res) => res.tutorialSelected === 'distribution' && res.tutorialAppReady, 'Distribución termina de montar antes de probar el teclado del onboarding')
        await send('DOM.enable')
        const documentNode = await send('DOM.getDocument')
        const triggerNode = await send('DOM.querySelector', { nodeId: documentNode.root.nodeId, selector: '[data-onboarding-step-trigger="2"]' })
        assert.ok(triggerNode.nodeId, 'Existe el control de paso 2')
        await send('DOM.focus', { nodeId: triggerNode.nodeId })
        assert.equal(await evaluate(`document.activeElement?.getAttribute('data-onboarding-step-trigger')`), '2', 'El foco del navegador está en el control de paso 2')
        await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, text: '\r' })
        await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 })
        await waitForValue(`document.querySelector('.pachax-onboarding-device')?.getAttribute('data-onboarding-step')`, value => value === '2', 'Los pasos se pueden seleccionar con teclado')
      }
      await evaluate(`window.scrollTo({top:0,behavior:'instant'})`)
    }

    if (scenario === 'synthetic') {
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
      assert.match(detailActions[id].url || '', /^https:\/\/wa\.me\/\d+\?text=/, `${id} conserva una URL WhatsApp bien formada; window.open está interceptado`)
      assert(decodeURIComponent(detailActions[id].url).includes(expectedName), `${id} conserva el contacto personalizado`)
    }
    assert.equal(detailActions.hamburger.title, 'Restaurante Rápido')
    assert.match(detailActions.hamburger.primary, /Ver planes/)
    assert.equal(detailActions.retail.title, 'Comercio / Venta rápida')
    assert.match(detailActions.retail.primary, /Ver planes/)
    assert.match(detailActions.custom.primary, /Cotizar a medida/)
    assert.match(detailActions.custom.url || '', /^https:\/\/wa\.me\/\d+\?text=/, 'La ficha personalizada conserva una URL WhatsApp bien formada; window.open está interceptado')
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
    assert((plansInquiryUrl || '').includes(`wa.me/${LANDING_TEST_CONTACT.number}`), 'El estado sin oferta usa el contacto reservado del escenario sintético')
    await evaluate(`document.querySelector('.pachax-pricing-dialog-close')?.click()`)
    } else {
      assert.equal(await evaluate(`document.querySelectorAll('#plantillas .pachax-featured-card').length`), 0, 'Sin datos publicados no se fabrican fichas ni acciones de detalle')
      assert.equal(await evaluate(`document.querySelectorAll('a[href^="/register"]').length`), 0, 'El escenario vacío nunca habilita contratación')
      await evaluate(`document.querySelector('#planes [data-pricing-mode="direct"] button')?.click()`)
      await waitForValue(`document.querySelector('[role="dialog"] h3')?.textContent.trim()`, value => value === 'Activación Directa', 'el detalle vacío se puede consultar')
      assert.equal(await evaluate(`document.querySelectorAll('[data-plan-template], [data-plan-tier], [data-quick-plans-inquiry]').length`), 0, 'No se habilitan selección de planes ni consultas sin configuración')
      assert.equal(await evaluate(`document.querySelector('[role="dialog"] .pachax-pricing-editorial')?.textContent || ''`), '', 'No se presenta contenido editorial como oferta publicada')
      await evaluate(`document.querySelector('.pachax-pricing-dialog-close')?.click()`)
    }

    if (width === 390) {
      await evaluate(`document.querySelector('.pachax-menu-toggle')?.click()`)
      const mobileMenu = await waitForValue(`document.querySelector('.pachax-menu-toggle')?.getAttribute('aria-expanded')`, value => value === 'true', 'El menú móvil abre')
      assert.equal(mobileMenu, 'true')
      await evaluate(`document.querySelector('.pachax-mobile-menu nav button')?.click()`)
      await waitForValue(`document.querySelector('.pachax-menu-toggle')?.getAttribute('aria-expanded')`, value => value === 'false', 'El menú móvil cierra al navegar')
    }

    console.log(`PASS ${width}×${height}: carrusel unificado, CTA, navegación móvil y sin overflow`)
  }

  const finalFixtureState = await evaluate('window.__PACHAX_LANDING_TEST_CATALOG__')
  assert.equal(finalFixtureState?.scenario, scenario)
  assert(finalFixtureState.calls > 0)
  assert.deepEqual(finalFixtureState.blocked, [])
  const productionRequests = browserRequests.filter(url => /(?:googleapis\.com|cloudfunctions\.net|firebaseio\.com|firebaseapp\.com)/i.test(url))
  const unexpectedExternalRequests = browserRequests.filter(url => {
    if (/^(?:data:|blob:|about:)/i.test(url)) return false
    return !['localhost', '127.0.0.1'].includes(new URL(url).hostname)
  })
  assert.deepEqual(productionRequests, [], `Landing must not request Firebase Production: ${productionRequests.join(', ')}`)
  assert.deepEqual(unexpectedExternalRequests, [], `Landing test must remain offline: ${unexpectedExternalRequests.join(', ')}`)
  console.log(`Landing browser regression passed · ${scenario} catalog · ${viewportCases.length} viewport(s) · local callable calls=${finalFixtureState.calls} · Firebase Production requests=${productionRequests.length} · external requests=${unexpectedExternalRequests.length} · blocked unsupported calls=${finalFixtureState.blocked.length}`)

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
