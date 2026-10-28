// Visual regression for the public catalog fallback, using no Firebase config
// and no network writes. The gateway is intentionally unavailable in this run.
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createServer } from 'node:net'

const root = process.cwd()
const chrome = [process.env.CHROME_BIN, 'C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe'].filter(Boolean).find(existsSync)
assert(chrome, 'Chrome not found; set CHROME_BIN.')
for (const key of ['VITE_FIREBASE_API_KEY', 'VITE_FIREBASE_AUTH_DOMAIN', 'VITE_FIREBASE_PROJECT_ID', 'VITE_FIREBASE_STORAGE_BUCKET', 'VITE_FIREBASE_MESSAGING_SENDER_ID', 'VITE_FIREBASE_APP_ID']) {
  process.env[key] = ''
}
process.env.VITE_USE_FIREBASE_EMULATOR = 'false'

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
  await send('Network.enable')

  for (const [width, height] of [[1440, 900], [390, 844]]) {
    await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 768 })
    await send('Page.navigate', { url: base })
    await waitFor(() => evaluate(`(() => { const items=[...document.querySelectorAll('#plantillas img')]; items.forEach(item=>item.loading='eager'); return items.length; })()`), count => count === 6, `${width}x${height} catalog cards rendered`)
    const view = await waitFor(() => evaluate(`(() => {
      const cards=[...document.querySelectorAll('#plantillas [data-template-id]')];
      const a=document.querySelectorAll('[aria-label="Carrusel de soluciones especializadas"] [data-coverflow-card]');
      const b=document.querySelectorAll('[aria-label="Carrusel de soluciones autoservicio"] [data-coverflow-card]');
      const root=document.documentElement;
      return {cards:cards.map(card=>card.dataset.templateId),a:a.length,b:b.length,overflow:root.scrollWidth-innerWidth,
        fallback:document.querySelector('[data-catalog-state="error"]')?.textContent||'',
        plans:document.querySelector('#planes')?.innerText||'',
        quickCard:document.querySelector('[data-quick-editorial-card="hamburger"]')?.innerText||'',
        quickCardHeight:document.querySelector('[data-quick-editorial-card="hamburger"]')?.scrollHeight||0,
        cycleControl:!!document.querySelector('[data-plan-cycle-control]'),
        tierControls:document.querySelectorAll('[data-plan-tier]').length,
        quickDemo:!!document.querySelector('[data-quick-demo="hamburger"]'),
        quickInquiry:!!document.querySelector('[data-quick-plans-inquiry="hamburger"]'),
        images:cards.map(card=>({id:card.dataset.templateId,loaded:!!card.querySelector('img')?.complete&&card.querySelector('img').naturalWidth>0})),
        actions:cards.map(card=>({id:card.dataset.templateId,buttons:[...card.querySelectorAll('button')].map(button=>({text:button.textContent.trim(),disabled:button.disabled}))})),
        planButtons:[...document.querySelectorAll('#planes [data-plan-template]')].map(button=>button.dataset.planTemplate),
        referenceLabel:[...document.querySelectorAll('#hero span')].some(span=>span.textContent.includes('Fichas editoriales de referencia')),
        noZero:!document.body.innerText.includes('0 plantillas publicadas')};
    })()`), result => result.cards.length === 6 && result.a === 3 && result.b === 2
      && result.images.every(image => image.loaded)
      && /fichas editoriales de referencia/i.test(result.fallback), `${width}x${height} catalog fallback`)

    assert.deepEqual(view.cards.sort(), ['custom', 'distribution', 'hamburger', 'nightclub', 'restaurant', 'retail'])
    assert.equal(view.a, 3)
    assert.equal(view.b, 2)
    assert(view.overflow <= 0, `Horizontal overflow at ${width}x${height}: ${view.overflow}px`)
    assert(view.images.every(image => image.loaded), `A catalog image did not load: ${JSON.stringify(view.images)}`)
    for (const id of ['restaurant', 'distribution', 'nightclub', 'hamburger', 'retail']) {
      const card = view.actions.find(item => item.id === id)
      assert(card && card.buttons.length >= 2 && card.buttons.every(button => !button.disabled), `${id} should retain its demo and commercial action buttons`)
    }
    const customActions = view.actions.find(item => item.id === 'custom')?.buttons || []
    assert.equal(customActions.length, 1)
    assert.match(customActions[0].text, /Cotizar a medida/)
    assert(view.planButtons.includes('hamburger') && view.planButtons.includes('retail'), 'Both self-service plan selectors should remain visible')
    assert(view.quickCard.includes('Restaurante Rápido') && view.quickCard.includes('Pedidos de mostrador y para llevar'), 'Hamburger editorial offer card should describe canonical capabilities')
    assert(view.quickCard.includes('Ofertas por verificar'), 'An unavailable gateway must not claim that no offers exist')
    assert(view.quickCardHeight > 200 && view.quickCardHeight < 720, `Editorial offer card should be complete without a large empty area: ${view.quickCardHeight}px`)
    assert.equal(view.cycleControl, false, 'Monthly/annual controls must be hidden without approved plans')
    assert.equal(view.tierControls, 0, 'Tier controls must be hidden without approved plans')
    assert(view.quickDemo && view.quickInquiry, 'The no-offer card must retain demo and inquiry actions')
    const hamburgerInquiryUrl = await evaluate(`(() => { window.__quickInquiryUrl=null; window.open=url=>{window.__quickInquiryUrl=String(url)}; document.querySelector('[data-quick-plans-inquiry="hamburger"]')?.click(); return window.__quickInquiryUrl })()`)
    assert.match(decodeURIComponent(hamburgerInquiryUrl||''), /wa\.me\/59177987776/)
    assert.match(decodeURIComponent(hamburgerInquiryUrl||''), /Restaurante Rápido/)
    assert(/ofertas por verificar|no hay precios ni planes confirmados/i.test(view.plans), 'A gateway error must not be shown as a confirmed empty offer list')
    assert(!/\$(19|24|25|29|35|39|49|59|69|89|99)(\.00)?/.test(view.plans), 'Static reference prices must not be shown as official offers')
    assert(view.noZero, 'A failed or pending request must not claim zero published templates')

    await evaluate(`document.querySelector('[data-plan-template="retail"]')?.click()`)
    const retailSelected = await evaluate(`document.querySelector('[data-plan-template="retail"]')?.getAttribute('aria-pressed')`)
    assert.equal(retailSelected, 'true', 'Retail plan selector remains interactive')
    const retailCard = await waitFor(() => evaluate(`document.querySelector('[data-quick-editorial-card="retail"]')?.innerText||''`), text => text.includes('Comercio / Venta rápida'), `${width}x${height} Retail editorial card`)
    assert(retailCard.includes('Venta por peso') && retailCard.includes('Venta por unidad'), 'Retail card should expose only its documented weight/unit capabilities')
    const inquiryUrl = await evaluate(`(() => { window.__quickInquiryUrl=null; window.open=url=>{window.__quickInquiryUrl=String(url)}; document.querySelector('[data-quick-plans-inquiry="retail"]')?.click(); return window.__quickInquiryUrl })()`)
    assert.match(decodeURIComponent(inquiryUrl||''), /wa\.me\/59177987776/)
    assert.match(decodeURIComponent(inquiryUrl||''), /Comercio \/ Venta rápida/)
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
