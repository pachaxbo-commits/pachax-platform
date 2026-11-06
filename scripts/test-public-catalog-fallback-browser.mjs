// Visual-only Preview regression with inert fake Firebase values and no network writes.
// The production project is never initialized, and the public gateway is intentionally unavailable.
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createServer } from 'node:net'
import { previewFirebaseConfigFingerprint } from './preview-firebase-isolation.mjs'

const root = process.cwd()
const chrome = [process.env.CHROME_BIN, 'C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe', '/usr/bin/google-chrome', '/usr/bin/chromium'].filter(Boolean).find(existsSync)
assert(chrome, 'Chrome not found; set CHROME_BIN.')
Object.assign(process.env, {
  VERCEL_ENV: 'preview',
  VITE_FIREBASE_API_KEY: 'pachax-visual-preview-disabled',
  VITE_FIREBASE_AUTH_DOMAIN: 'pachax-visual-preview.invalid',
  VITE_FIREBASE_PROJECT_ID: 'pachax-visual-preview-disabled',
  VITE_FIREBASE_STORAGE_BUCKET: 'pachax-visual-preview.invalid',
  VITE_FIREBASE_MESSAGING_SENDER_ID: '0',
  VITE_FIREBASE_APP_ID: 'pachax-visual-preview-disabled',
  VITE_FIREBASE_MEASUREMENT_ID: 'DISABLED',
  VITE_FIREBASE_APPCHECK_SITE_KEY: '',
  VITE_FIREBASE_APPCHECK_DEBUG: 'false',
  VITE_USE_FIREBASE_EMULATOR: 'false',
  VITE_BOT_API_URL: '',
  VITE_PACHAX_VISUAL_PREVIEW: 'true',
})
process.env.PACHAX_PREVIEW_FIREBASE_CONFIG_SHA256 = previewFirebaseConfigFingerprint(process.env)

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
const listenEphemeralPort = async () => {
  const server = createServer()
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const port = server.address().port
  await new Promise(resolve => server.close(resolve))
  return port
}
const waitFor = async (read, predicate, label, timeout = 15000) => {
  const start = Date.now()
  let result
  while (Date.now() - start < timeout) {
    result = await read()
    if (predicate(result)) return result
    await sleep(120)
  }
  throw new Error(`${label} timed out: ${JSON.stringify(result)}`)
}

let vite
let browser
let profile
let socket
let socketOpen = false
let sequence = 0
const pending = new Map()
const requests = new Set()

try {
  const vitePort = await listenEphemeralPort()
  const debugPort = await listenEphemeralPort()
  const base = `http://127.0.0.1:${vitePort}/`
  let viteOutput = ''
  vite = spawn(process.execPath, [join(root, 'node_modules/vite/bin/vite.js'), '--mode', 'emulator', '--host', '127.0.0.1', '--port', String(vitePort), '--strictPort'], { cwd: root, env: process.env, stdio: ['ignore', 'pipe', 'pipe'] })
  vite.stdout.on('data', chunk => { viteOutput += chunk.toString() })
  vite.stderr.on('data', chunk => { viteOutput += chunk.toString() })
  try {
    await waitFor(async () => { try { return (await fetch(base)).status } catch { return 0 } }, value => value === 200, 'Vite did not start')
  } catch (error) {
    throw new Error(`${error.message}\n${viteOutput}`)
  }
  profile = mkdtempSync(join(tmpdir(), 'pachax-public-catalog-fallback-'))
  browser = spawn(chrome, ['--headless=new', '--disable-gpu', '--no-sandbox', '--disable-background-networking', `--remote-debugging-port=${debugPort}`, '--remote-allow-origins=*', `--user-data-dir=${profile}`, base], { stdio: 'ignore' })

  let tab
  for (let attempt = 0; attempt < 60; attempt++) {
    await sleep(150)
    try { tab = (await (await fetch(`http://127.0.0.1:${debugPort}/json`)).json()).find(item => item.type === 'page' && item.webSocketDebuggerUrl); if (tab) break } catch { /* Chrome is starting. */ }
  }
  assert(tab?.webSocketDebuggerUrl, 'Chrome CDP page was not found.')
  socket = new WebSocket(tab.webSocketDebuggerUrl)
  await new Promise((resolve, reject) => { socket.onopen = () => { socketOpen = true; resolve() }; socket.onerror = reject })
  socket.onmessage = event => {
    const message = JSON.parse(event.data)
    if (message.method === 'Runtime.exceptionThrown') console.error('BROWSER_EXCEPTION', message.params.exceptionDetails.exception?.description || message.params.exceptionDetails.text)
    if (message.method === 'Log.entryAdded' && message.params.entry.level === 'error') console.error('BROWSER_LOG', message.params.entry.text)
    if (message.method === 'Network.requestWillBeSent') requests.add(new URL(message.params.request.url).origin)
    if (!pending.has(message.id)) return
    const operation = pending.get(message.id)
    pending.delete(message.id)
    message.error ? operation.reject(new Error(JSON.stringify(message.error))) : operation.resolve(message.result)
  }
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    assert(socketOpen, 'Chrome CDP is not connected.')
    const id = ++sequence
    pending.set(id, { resolve, reject })
    socket.send(JSON.stringify({ id, method, params }))
  })
  const evaluate = async expression => {
    const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text)
    return result.result.value
  }
  await send('Page.enable')
  await send('Runtime.enable')
  await send('Log.enable')
  await send('Network.enable')

  for (const [width, height] of [[1440, 900], [390, 844]]) {
    await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 768 })
    await send('Page.navigate', { url: base })
    await waitFor(() => evaluate(`(() => { const items=[...document.querySelectorAll('#plantillas img')]; items.forEach(item=>item.loading='eager'); return items.length; })()`), count => count === 6, `${width}x${height} catalog cards rendered`)
    const view = await waitFor(() => evaluate(`(() => {
      const cards=[...document.querySelectorAll('#plantillas [data-template-id]')];
      const heroCards=[...document.querySelectorAll('#hero [data-pachax-template-card]')];
      const a=heroCards.filter(card=>!card.classList.contains('pachax-template-card-light'));
      const b=heroCards.filter(card=>card.classList.contains('pachax-template-card-light'));
      const root=document.documentElement;
      return {cards:cards.map(card=>card.dataset.templateId),a:a.length,b:b.length,overflow:root.scrollWidth-innerWidth,
        fallback:document.querySelector('#plantillas [data-catalog-state="error"]')?.textContent||'',
        plans:document.querySelector('#planes')?.innerText||'',
        modeCards:[...document.querySelectorAll('#planes [data-pricing-mode]')].map(card=>card.dataset.pricingMode),
        heading:document.querySelector('#planes h2')?.innerText||'',
        images:cards.map(card=>({id:card.dataset.templateId,loaded:!!card.querySelector('img')?.complete&&card.querySelector('img').naturalWidth>0})),
        actions:cards.map(card=>({id:card.dataset.templateId,buttons:[...card.querySelectorAll('button')].map(button=>({text:button.textContent.trim(),disabled:button.disabled}))})),
        planButtons:[...document.querySelectorAll('#planes [data-plan-template]')].map(button=>button.dataset.planTemplate),
        referenceLabel:!!document.querySelector('#hero [data-catalog-state="error"]'),
        noZero:!document.body.innerText.includes('0 plantillas publicadas')};
    })()`), result => result.cards.length === 6 && result.a === 3 && result.b === 2
      && result.images.every(image => image.loaded)
      && /Catálogo editorial de referencia/i.test(result.fallback), `${width}x${height} catalog fallback`)

    assert.deepEqual(view.cards.sort(), ['custom', 'distribution', 'hamburger', 'nightclub', 'restaurant', 'retail'])
    assert.equal(view.a, 3)
    assert.equal(view.b, 2)
    assert(view.overflow <= 0, `Horizontal overflow at ${width}x${height}: ${view.overflow}px`)
    assert(view.images.every(image => image.loaded), `A catalog image did not load: ${JSON.stringify(view.images)}`)
    for (const id of ['restaurant', 'distribution', 'nightclub', 'hamburger', 'retail']) {
      const card = view.actions.find(item => item.id === id)
      assert(card && card.buttons.length === 1 && card.buttons.every(button => !button.disabled), `${id} should expose its accessible details action`)
      await evaluate(`document.querySelector('#plantillas [data-template-id="${id}"] .pachax-card-detail-button')?.click()`)
      const details = await waitFor(() => evaluate(`(() => { const dialog=document.querySelector('[role="dialog"]'); return {title:dialog?.querySelector('h2')?.textContent||'', features:dialog?.innerText||''}; })()`), result => Boolean(result.title), `${width}x${height} ${id} details`)
      assert(details.features.length > details.title.length + 40, `${id} should provide full information in the accessible details view`)
      await evaluate(`document.querySelector('.pachax-details-close')?.click()`)
    }
    const customActions = view.actions.find(item => item.id === 'custom')?.buttons || []
    assert.equal(customActions.length, 1)
    assert.match(customActions[0].text, /Cotizar a medida/)
    assert.equal(view.actions.find(item => item.id === 'custom')?.buttons.length, 1, 'Custom development is represented by one service quote action')
    assert.deepEqual(view.modeCards, ['assisted', 'direct'], 'The pricing overview contains exactly two commercial modalities')
    assert.match(view.heading, /Planes adaptados a la escala real de tu empresa/)
    assert(!view.plans.includes('$29') && !view.plans.includes('$59') && !view.plans.includes('$99'), 'No reference prices appear in the summary')
    assert(!view.plans.includes('Restaurante Rápido') && !view.plans.includes('Comercio'), 'Quick-service selectors remain hidden until details are requested')
    await evaluate(`document.querySelector('#planes [data-pricing-mode="direct"] button')?.click()`)
    const directDetails = await waitFor(() => evaluate(`(() => { const dialog=document.querySelector('[role="dialog"]'); return {text:dialog?.innerText||'',cycle:!!dialog?.querySelector('[data-plan-cycle-control]'),tiers:dialog?.querySelectorAll('[data-plan-tier]').length||0,demo:!!dialog?.querySelector('[data-quick-demo="hamburger"]'),inquiry:!!dialog?.querySelector('[data-quick-plans-inquiry="hamburger"]')}; })()`), result => result.text.includes('Activación Directa'), `${width}x${height} direct activation details`)
    assert(directDetails.text.includes('Restaurante Rápido') && directDetails.text.includes('Pedidos de mostrador y para llevar'), 'Hamburger details describe canonical capabilities')
    assert(directDetails.text.includes('Ofertas por verificar'), 'An unavailable gateway must not claim there are no offers')
    assert.equal(directDetails.cycle, false, 'Monthly/annual controls must be hidden without approved plans')
    assert.equal(directDetails.tiers, 0, 'Tier controls must be hidden without approved plans')
    assert(directDetails.demo && directDetails.inquiry, 'The no-offer details retain demo and inquiry actions')
    const hamburgerInquiryUrl = await evaluate(`(() => { window.__quickInquiryUrl=null; window.open=url=>{window.__quickInquiryUrl=String(url)}; document.querySelector('[data-quick-plans-inquiry="hamburger"]')?.click(); return window.__quickInquiryUrl })()`)
    assert.match(decodeURIComponent(hamburgerInquiryUrl||''), /wa\.me\/59177987776/)
    assert.match(decodeURIComponent(hamburgerInquiryUrl||''), /Restaurante Rápido/)
    await evaluate(`document.querySelector('.pachax-pricing-dialog-close')?.click()`)
    assert(/no se pudo verificar el catálogo|no hay precios ni planes confirmados/i.test(view.plans), 'A gateway error must not be shown as a confirmed empty offer list')
    assert(!/\$(19|24|25|29|35|39|49|59|69|89|99)(\.00)?/.test(view.plans), 'Static reference prices must not be shown as official offers')
    assert(view.noZero, 'A failed or pending request must not claim zero published templates')

    await evaluate(`document.querySelector('#planes [data-pricing-mode="direct"] button')?.click()`)
    await evaluate(`document.querySelector('[data-plan-template="retail"]')?.click()`)
    const retailSelected = await evaluate(`document.querySelector('[data-plan-template="retail"]')?.getAttribute('aria-pressed')`)
    assert.equal(retailSelected, 'true', 'Retail plan selector remains interactive')
    const retailCard = await waitFor(() => evaluate(`document.querySelector('.pachax-pricing-commercial-detail')?.innerText||''`), text => text.includes('Venta por peso'), `${width}x${height} Retail editorial card`)
    assert(retailCard.includes('Venta por peso') && retailCard.includes('Venta por unidad'), 'Retail card should expose only its documented weight/unit capabilities')
    const inquiryUrl = await evaluate(`(() => { window.__quickInquiryUrl=null; window.open=url=>{window.__quickInquiryUrl=String(url)}; document.querySelector('[data-quick-plans-inquiry="retail"]')?.click(); return window.__quickInquiryUrl })()`)
    assert.match(decodeURIComponent(inquiryUrl||''), /wa\.me\/59177987776/)
    assert.match(decodeURIComponent(inquiryUrl||''), /Comercio \/ Venta rápida/)
    await evaluate(`document.querySelector('.pachax-pricing-dialog-close')?.click()`)
    console.log(`PASS ${width}x${height}: six editorial cards, 3+2 carousels, images, plan selection, no price and no overflow`)
  }

  assert([...requests].every(origin => origin === `http://127.0.0.1:${new URL(base).port}`), `Unexpected external request in no-config fallback test: ${[...requests].join(', ')}`)
  console.log('PASS gateway-unavailable Preview state used no Firebase or external requests')
} finally {
  socket?.close()
  browser?.kill()
  vite?.kill()
  await sleep(300)
  if (profile) { try { rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }) } catch { /* Chrome may still release its profile. */ } }
}
