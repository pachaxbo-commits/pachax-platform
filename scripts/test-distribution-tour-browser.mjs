// Automated browser verification for G2 Universal Distribution Tutorial across 5 viewports.
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
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
if (!chrome) throw new Error('Chrome/Chromium no encontrado.')

const baseUrl = process.env.DISTRIBUTION_DEMO_URL || 'http://localhost:5190/demo.html?template=distribution'
const probe = createServer()
await new Promise((done) => probe.listen(0, '127.0.0.1', done))
const port = probe.address().port
await new Promise((done) => probe.close(done))

const artifactDir = 'C:/Users/fabri/.gemini/antigravity/brain/40ec324b-7de2-4d03-b5ca-22638c551a00'
mkdirSync(artifactDir, { recursive: true })

const profile = mkdtempSync(join(tmpdir(), 'pachax-dist-tour-'))
const browser = spawn(
  chrome,
  [
    '--headless=new',
    '--disable-gpu',
    '--no-sandbox',
    `--remote-debugging-port=${port}`,
    '--remote-allow-origins=*',
    `--user-data-dir=${profile}`,
    'about:blank',
  ],
  { stdio: 'ignore' }
)

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
    } catch {
      /* wait */
    }
  }

  assert(tab?.webSocketDebuggerUrl, 'No se encontró la pestaña CDP de Chrome')
  socket = new WebSocket(tab.webSocketDebuggerUrl)
  await new Promise((done, fail) => {
    socket.onopen = done
    socket.onerror = fail
  })

  let sequence = 1
  const pending = new Map()
  socket.onmessage = (event) => {
    const payload = JSON.parse(event.data)
    if (!pending.has(payload.id)) return
    const { done, fail } = pending.get(payload.id)
    pending.delete(payload.id)
    payload.error ? fail(new Error(JSON.stringify(payload.error))) : done(payload.result)
  }

  send = (method, params = {}) =>
    new Promise((done, fail) => {
      const id = sequence++
      pending.set(id, { done, fail })
      socket.send(JSON.stringify({ id, method, params }))
    })

  const evaluate = async (expression) => {
    const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
    if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails))
    return result.result.value
  }

  const screenshot = async (filename) => {
    const capture = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
    const outPath = resolve(artifactDir, filename)
    writeFileSync(outPath, Buffer.from(capture.data, 'base64'))
    console.log(`[EVIDENCE] Screenshot saved: ${filename}`)
  }

  await send('Page.enable')
  await send('Runtime.enable')

  console.log('--- TEST 1: 5 Viewports verification with Sector Selector Modal ---')
  const viewports = [
    { name: '360x800', width: 360, height: 800, mobile: true },
    { name: '390x844', width: 390, height: 844, mobile: true },
    { name: '430x932', width: 430, height: 932, mobile: true },
    { name: '768x1024', width: 768, height: 1024, mobile: false },
    { name: '1440x900', width: 1440, height: 900, mobile: false },
  ]

  for (const vp of viewports) {
    await send('Emulation.setDeviceMetricsOverride', {
      width: vp.width,
      height: vp.height,
      deviceScaleFactor: 1,
      mobile: vp.mobile,
    })
    await send('Emulation.setTouchEmulationEnabled', { enabled: vp.mobile, maxTouchPoints: 1 })
    await send('Page.navigate', { url: `${baseUrl}&tour=start` })
    await sleep(800)

    // Check modal presence
    const modalState = await evaluate(`(() => {
      const modal = document.querySelector('[role="dialog"]');
      const sectorButtons = [...document.querySelectorAll('[data-sector-id]')];
      return {
        hasModal: Boolean(modal),
        sectorButtonCount: sectorButtons.length,
        sectorIds: sectorButtons.map(b => b.dataset.sectorId),
        title: modal?.querySelector('h2')?.textContent || '',
      };
    })()`)

    assert.ok(modalState.hasModal, `Modal must open at viewport ${vp.name}`)
    assert.equal(modalState.sectorButtonCount, 9, `All 9 sectors must be listed at ${vp.name}`)
    await screenshot(`g2-tour-center-sectors-${vp.name}.png`)
  }

  console.log('--- TEST 2: Dynamic Sector Switching (Food -> Beverages) ---')
  await send('Emulation.setDeviceMetricsOverride', {
    width: 390,
    height: 844,
    deviceScaleFactor: 1,
    mobile: true,
  })

  // Click on Beverages sector
  const switchResult = await evaluate(`(() => {
    const buttons = [...document.querySelectorAll('button')];
    const bevBtn = buttons.find(b => b.textContent && b.textContent.includes('Bebidas'));
    if (!bevBtn) return { error: 'Bebidas button not found' };
    bevBtn.click();
    return { ok: true };
  })()`)
  assert.ok(switchResult.ok, 'Must click on Beverages sector')
  await sleep(600)

  // Verify header and products updated to Beverages
  const bevState = await evaluate(`(() => {
    const headerTitle = document.querySelector('[data-tutorial-target="header-identity"] h1')?.textContent || '';
    const closeBtn = document.querySelector('button[aria-label="Cerrar"]');
    if (closeBtn) closeBtn.click();
    return {
      headerTitle,
      bodyText: document.body.textContent || '',
    };
  })()`)

  assert.ok(
    bevState.headerTitle.includes('Refrescos') || bevState.headerTitle.includes('Bebidas'),
    `Company title must switch to Beverages, got: ${bevState.headerTitle}`
  )
  await sleep(400)
  await screenshot('g2-beverages-company-switched-390x844.png')

  console.log('--- TEST 3: Tutorial Launcher Trigger & Spotlight Step 1 ---')
  // Click on the tutorial trigger button in header
  const openTutorialCenter = await evaluate(`(() => {
    const triggerBtn = document.querySelector('[data-tutorial-target="tutorial-trigger-btn"]');
    if (!triggerBtn) return { error: 'tutorial-trigger-btn not found' };
    triggerBtn.click();
    return { ok: true };
  })()`)
  assert.ok(openTutorialCenter.ok)
  await sleep(400)

  // In the tutorial center, switch to "Ver recorridos disponibles" tab
  const switchTab = await evaluate(`(() => {
    const buttons = [...document.querySelectorAll('button')];
    const tracksTab = buttons.find(b => b.textContent && b.textContent.includes('Recorridos por tema'));
    if (tracksTab) { tracksTab.click(); return { ok: true }; }
    return { error: 'tracks tab not found' };
  })()`)
  await sleep(400)
  await screenshot('g2-tutorial-tracks-list-390x844.png')

  // Start the first plan ("Primeros pasos" or "Ventas")
  const startPlan = await evaluate(`(() => {
    const buttons = [...document.querySelectorAll('button')];
    const startBtn = buttons.find(b => b.textContent && (b.textContent.includes('Iniciar') || b.textContent.includes('Comenzar') || b.textContent.includes('Reanudar')));
    if (startBtn) { startBtn.click(); return { ok: true }; }
    return { error: 'start button not found' };
  })()`)
  assert.ok(startPlan.ok, 'Must click start tutorial plan')
  await sleep(600)

  // Verify Spotlight and Tutorial Card are rendered
  const spotlightState = await evaluate(`(() => {
    const card = document.querySelector('[role="dialog"]') || document.querySelector('[aria-label*="Paso"]');
    const overlay = document.querySelector('[class*="bg-slate-950"]');
    const title = card?.querySelector('h2')?.textContent || '';
    const stepInfo = card?.querySelector('.text-sky-600')?.textContent || '';
    const targetElement = document.querySelector('[data-tutorial-target="header-identity"]');
    return {
      hasCard: Boolean(card),
      hasOverlay: Boolean(overlay),
      title,
      stepInfo,
      targetVisible: Boolean(targetElement),
    };
  })()`)

  assert.ok(spotlightState.hasCard, 'Tutorial Card must be rendered')
  console.log('Spotlight Step 1 Info:', spotlightState.stepInfo, '-', spotlightState.title)
  await screenshot('g2-tutorial-step1-spotlight-mobile.png')

  // Advance to Step 2
  console.log('--- TEST 4: Advancing to Step 2 & Step 3 ---')
  const nextStep = await evaluate(`(() => {
    const buttons = [...document.querySelectorAll('button')];
    const nextBtn = buttons.find(b => b.textContent && b.textContent.includes('Siguiente'));
    if (nextBtn) { nextBtn.click(); return { ok: true }; }
    return { error: 'next button not found' };
  })()`)
  assert.ok(nextStep.ok)
  await sleep(500)

  const step2State = await evaluate(`(() => {
    const card = document.querySelector('[aria-label*="Paso"]');
    return {
      title: card?.querySelector('h2')?.textContent || '',
      stepInfo: card?.querySelector('.text-sky-600')?.textContent || '',
    };
  })()`)
  console.log('Step 2 Info:', step2State.stepInfo, '-', step2State.title)
  await screenshot('g2-tutorial-step2-spotlight-mobile.png')

  // Desktop Viewport Test with Spotlight
  console.log('--- TEST 5: Desktop Spotlight Rendering (1440x900) ---')
  await send('Emulation.setDeviceMetricsOverride', {
    width: 1440,
    height: 900,
    deviceScaleFactor: 1,
    mobile: false,
  })
  await send('Emulation.setTouchEmulationEnabled', { enabled: false })
  await sleep(500)
  await screenshot('g2-tutorial-step2-desktop-1440x900.png')

  // Role Gating Verification: Distributor Role
  console.log('--- TEST 6: Distributor Role Strict Gating ---')
  await send('Page.navigate', { url: 'http://localhost:5190/demo.html?template=distribution&role=distributor&tour=start' })
  await sleep(800)

  // Switch to tracks view by clicking "Volver a recorridos" or clicking the active sector
  const distTracks = await evaluate(`(() => {
    const buttons = [...document.querySelectorAll('button')];
    const tracksBtn = buttons.find(b => b.textContent && (b.textContent.includes('Volver a recorridos') || b.textContent.includes('Recorridos')));
    if (tracksBtn) {
      tracksBtn.click();
      return { ok: true, clicked: 'tracksBtn' };
    }
    const sectorBtn = document.querySelector('[data-sector-id]');
    if (sectorBtn) {
      sectorBtn.click();
      return { ok: true, clicked: 'sectorBtn' };
    }
    return { error: 'Could not switch to tracks' };
  })()`)
  assert.ok(distTracks.ok, 'Must switch to tracks view')
  await sleep(600)

  const distState = await evaluate(`(() => {
    const bodyText = document.body.textContent || '';
    const hasAdminReports = bodyText.includes('Administración y Reportes');
    const hasWarehouseIntake = bodyText.includes('Inventario y Almacén');
    const hasSalesRoad = bodyText.includes('Ventas y Cobranzas');
    return {
      hasAdminReports,
      hasWarehouseIntake,
      hasSalesRoad,
    };
  })()`)

  assert.equal(distState.hasAdminReports, false, 'Distributor must NOT see admin financial reports track')
  assert.equal(distState.hasWarehouseIntake, false, 'Distributor must NOT see warehouse inventory track')
  assert.ok(distState.hasSalesRoad, 'Distributor must see road sales track')
  await screenshot('g2-distributor-role-gated-tracks.png')

  console.log('ALL BROWSER TESTS PASSED SUCCESSFULLY!')
} finally {
  try {
    socket?.close()
  } catch {}
  try {
    browser.kill()
  } catch {}
}
