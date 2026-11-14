import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { createLandingCatalogAdapterScript, getLandingCatalogFixture } from './landingCommercialTestFixture.mjs'

const chromeCandidates = [
  process.env.CHROME_BIN,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
].filter(Boolean)
const chrome = chromeCandidates.find(existsSync)
if (!chrome) throw new Error('Chrome/Chromium no encontrado. Define CHROME_BIN.')

const root = process.cwd()
const viteEntry = join(root, 'node_modules/vite/bin/vite.js')

const getFreePort = () =>
  new Promise((done, fail) => {
    const server = createServer()
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address()
      server.close(() => done(port))
    }).once('error', fail)
  })

const vitePort = await getFreePort()
const cdpPort = await getFreePort()
const baseUrl = `http://127.0.0.1:${vitePort}/`
const evidenceDir = resolve('tmp/landing-visual-evidence')
mkdirSync(evidenceDir, { recursive: true })

const vite = spawn(
  process.execPath,
  [viteEntry, '--mode', 'emulator', '--host', '127.0.0.1', '--port', String(vitePort), '--strictPort'],
  { cwd: root, env: process.env, stdio: ['ignore', 'pipe', 'pipe'] },
)

const sleep = (ms) => new Promise((done) => setTimeout(done, ms))
const profile = mkdtempSync(join(tmpdir(), 'pachax-wa-qa-'))
let browser
let socket

try {
  let ready = false
  for (let i = 0; i < 80; i++) {
    try {
      ready = (await fetch(baseUrl)).status === 200
    } catch {
      /* starting */
    }
    if (ready) break
    await sleep(150)
  }
  assert.equal(ready, true, 'Vite emulator server did not start')

  browser = spawn(
    chrome,
    [
      '--headless=new',
      '--disable-gpu',
      '--no-sandbox',
      `--remote-debugging-port=${cdpPort}`,
      '--remote-allow-origins=*',
      `--user-data-dir=${profile}`,
      'about:blank',
    ],
    { stdio: 'ignore' },
  )

  let tab
  for (let i = 0; i < 50; i++) {
    await sleep(150)
    try {
      const tabs = await (await fetch(`http://127.0.0.1:${cdpPort}/json`)).json()
      tab = tabs.find((t) => t.type === 'page')
      if (tab?.webSocketDebuggerUrl) break
    } catch {
      /* starting */
    }
  }
  assert(tab?.webSocketDebuggerUrl, 'No CDP tab found')

  socket = new WebSocket(tab.webSocketDebuggerUrl)
  await new Promise((done, fail) => {
    socket.onopen = done
    socket.onerror = fail
  })

  let seq = 1
  const pending = new Map()
  socket.onmessage = (event) => {
    const payload = JSON.parse(event.data)
    if (!pending.has(payload.id)) return
    const { done, fail } = pending.get(payload.id)
    pending.delete(payload.id)
    payload.error ? fail(new Error(JSON.stringify(payload.error))) : done(payload.result)
  }
  const send = (method, params = {}) =>
    new Promise((done, fail) => {
      const id = seq++
      pending.set(id, { done, fail })
      socket.send(JSON.stringify({ id, method, params }))
    })
  const evaluate = async (expression) => {
    const res = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
    if (res.exceptionDetails) throw new Error(JSON.stringify(res.exceptionDetails))
    return res.result.value
  }
  const waitFor = async (expr, pred, label) => {
    for (let i = 0; i < 60; i++) {
      const val = await evaluate(expr)
      if (pred(val)) return val
      await sleep(150)
    }
    throw new Error(`Timeout waiting for ${label}`)
  }
  const saveShot = async (filename, fullPage = false) => {
    const shot = await send('Page.captureScreenshot', {
      format: 'png',
      captureBeyondViewport: fullPage,
    })
    writeFileSync(resolve(evidenceDir, filename), Buffer.from(shot.data, 'base64'))
  }

  await send('Page.enable')
  await send('Runtime.enable')

  const fixture = getLandingCatalogFixture('synthetic')
  await send('Page.addScriptToEvaluateOnNewDocument', {
    source:
      createLandingCatalogAdapterScript({ scenario: 'synthetic', fixture, functionsPort: 5101 }) +
      `;window.__OPENED_URLS__=[];window.open=(url)=>{window.__OPENED_URLS__.push(String(url));return null;};`,
  })

  // 1. Desktop 1920x1080 Hero
  await send('Emulation.setDeviceMetricsOverride', { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false })
  await send('Page.navigate', { url: baseUrl })
  await waitFor('document.querySelectorAll("#hero [data-pachax-template-card]").length', (v) => v >= 5, 'hero cards 1920')
  await sleep(400)
  await saveShot('hero-1920.png', false)

  // 2. Desktop 1440x900 Hero & Full Landing
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false })
  await send('Page.navigate', { url: baseUrl })
  await waitFor('document.querySelectorAll("#hero [data-pachax-template-card]").length', (v) => v >= 5, 'hero cards 1440')
  await sleep(400)

  const lightCheck = await evaluate(`(() => {
    const root = document.querySelector('.pachax-public-landing');
    const bg = getComputedStyle(root).backgroundColor;
    const noOverflow = document.documentElement.scrollWidth <= window.innerWidth;
    const primaryBtn = document.querySelector('.pachax-hero-primary-btn')?.textContent?.trim();
    const contactBtn = document.querySelector('.pachax-hero-contact-btn strong')?.textContent?.trim();
    return { bg, noOverflow, primaryBtn, contactBtn };
  })()`)
  assert.equal(lightCheck.bg, 'rgb(255, 255, 255)', 'Landing root background must be white')
  assert.equal(lightCheck.noOverflow, true, 'No horizontal overflow at 1440px')
  assert.equal(lightCheck.primaryBtn, 'Probar plantillas')
  assert.equal(lightCheck.contactBtn, 'Contactar a PACHAX')

  await saveShot('hero-1440.png', false)
  await saveShot('landing-full-1440.png', true)

  // 3. Test "Probar plantillas" scrolls to #plantillas
  await evaluate('document.querySelector(".pachax-hero-primary-btn").click()')
  await sleep(500)
  const scrollAfterProbar = await evaluate('window.scrollY')
  assert(scrollAfterProbar > 200, 'Probar plantillas must scroll down to catalog')
  await evaluate('window.scrollTo(0, 0)')
  await sleep(200)

  // 4. Test "Contactar a PACHAX" opens dialog (without opening WhatsApp immediately)
  await evaluate('document.querySelector(".pachax-hero-contact-btn").click()')
  await waitFor('Boolean(document.querySelector("[role=dialog]"))', Boolean, 'WA dialog open')
  assert.equal(await evaluate('window.__OPENED_URLS__.length'), 0, 'Must not open WhatsApp before selecting business type')
  await sleep(150)
  await saveShot('dialog-desktop-1440.png', false)

  // 5. Verify all 6 options and capture selection states
  const templateIds = ['restaurant', 'hamburger', 'distribution', 'nightclub', 'retail']
  for (const id of templateIds) {
    await evaluate(`document.querySelector('[data-wa-option="${id}"]').click()`)
    await sleep(100)
    const checked = await evaluate(`document.querySelector('[data-wa-option="${id}"]').getAttribute('aria-checked')`)
    assert.equal(checked, 'true', `Option ${id} must be selectable`)
    await saveShot(`dialog-selected-${id}.png`, false)
  }

  // 6. Test "Otro tipo de negocio" validation & description
  await evaluate('document.querySelector(\'[data-wa-option="other"]\').click()')
  await sleep(100)
  await evaluate('document.querySelector(".pachax-wa-submit-btn").click()')
  await sleep(100)
  const alertText = await evaluate('document.querySelector(".pachax-wa-error")?.textContent || ""')
  assert(alertText.length > 5, 'Other option must require description')

  await evaluate(`(() => {
    const ta = document.querySelector('#pachax-wa-other-input');
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
    setter.call(ta, 'Ferretería y materiales de construcción');
    ta.dispatchEvent(new Event('input', { bubbles: true }));
  })()`)
  await sleep(100)
  await saveShot('dialog-other-description.png', false)

  // Submit and check generated WhatsApp URL
  await evaluate('document.querySelector(".pachax-wa-submit-btn").click()')
  await sleep(150)
  const openedUrls = await evaluate('window.__OPENED_URLS__')
  assert.equal(openedUrls.length, 1, 'Submitting valid option must open WhatsApp URL once')
  assert(openedUrls[0].startsWith('https://wa.me/12025550100?text='), 'Must use configured WhatsApp number')
  assert(decodeURIComponent(openedUrls[0]).includes('Ferretería y materiales de construcción'), 'Must include custom description')

  // 7. Test Escape key closes dialog
  await evaluate('document.querySelector(".pachax-hero-contact-btn").click()')
  await waitFor('Boolean(document.querySelector("[role=dialog]"))', Boolean, 'WA dialog reopen')
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape' })
  await sleep(150)
  assert.equal(await evaluate('Boolean(document.querySelector("[role=dialog]"))'), false, 'Escape must close dialog')

  // 8. Test Nightclub "Solicitar implementación" preselects nightclub in dialog
  await evaluate(`document.querySelector('[data-template-id="nightclub"] .pachax-card-detail-button').click()`)
  await waitFor('Boolean(document.querySelector(".pachax-details-dialog"))', Boolean, 'Nightclub details open')
  await evaluate('document.querySelector(".pachax-details-primary").click()')
  await waitFor('Boolean(document.querySelector(".pachax-wa-dialog"))', Boolean, 'WA dialog from Nightclub open')
  const nightclubChecked = await evaluate(`document.querySelector('[data-wa-option="nightclub"]').getAttribute('aria-checked')`)
  assert.equal(nightclubChecked, 'true', 'Nightclub must be preselected when opened from Nightclub card')
  await evaluate('document.querySelector(".pachax-wa-dialog-close").click()')
  await sleep(150)

  // 9. Mobile 390x844 Hero, Full Landing, and Contact Dialog
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true })
  await send('Page.navigate', { url: baseUrl })
  await waitFor('document.querySelectorAll("#hero [data-pachax-template-card]").length', (v) => v >= 5, 'hero cards 390')
  await sleep(400)
  const mobileOverflow = await evaluate('document.documentElement.scrollWidth <= window.innerWidth')
  assert.equal(mobileOverflow, true, 'No horizontal overflow at 390px')
  await saveShot('hero-390.png', false)
  await saveShot('landing-full-390.png', true)

  await evaluate('document.querySelector(".pachax-hero-contact-btn").click()')
  await waitFor('Boolean(document.querySelector(".pachax-wa-dialog"))', Boolean, 'Mobile WA dialog open')
  await sleep(150)
  await saveShot('dialog-mobile-390.png', false)

  console.log('WhatsApp & Light Landing browser QA passed! Screenshots saved in', evidenceDir)
} finally {
  socket?.close()
  browser?.kill()
  vite.kill()
  await new Promise((done) => vite.once('close', done))
  await sleep(250)
  try {
    rmSync(profile, { recursive: true, force: true })
  } catch {
    /* Windows Chrome profile lock cleanup */
  }
}
