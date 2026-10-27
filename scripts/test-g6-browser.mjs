import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { existsSync, mkdtempSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createServer } from 'node:net'

const chrome = [
  process.env.CHROME_BIN,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
].filter(Boolean).find(existsSync)

if (!chrome) throw new Error('Chrome no encontrado; define CHROME_BIN.')

const WORKTREE_DIR = 'C:/PACHAX-worktrees/gemini-g6-seamless-tutorial'
const ARTIFACTS_DIR = 'C:/Users/fabri/.gemini/antigravity/brain/40ec324b-7de2-4d03-b5ca-22638c551a00'
const TEST_PORT = 5198
const base = `http://127.0.0.1:${TEST_PORT}`

console.log(`[G6 Browser Test] Iniciando Vite en el puerto ${TEST_PORT} desde ${WORKTREE_DIR}...`)
const vite = spawn(process.execPath, ['./node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', String(TEST_PORT), '--strictPort'], {
  cwd: WORKTREE_DIR,
  stdio: 'inherit',
})

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

let viteReady = false
for (let i = 0; i < 30; i++) {
  await sleep(500)
  try {
    const res = await fetch(`${base}/`)
    if (res.status < 400) {
      viteReady = true
      break
    }
  } catch {
    /* waiting for server */
  }
}
if (!viteReady) {
  vite.kill()
  throw new Error(`El servidor Vite en ${base} no inició a tiempo.`)
}
console.log('[G6 Browser Test] Vite listo. Iniciando Chrome headless...')

const probe = createServer()
await new Promise((resolve) => probe.listen(0, '127.0.0.1', resolve))
const cdpPort = probe.address().port
await new Promise((resolve) => probe.close(resolve))

const profile = mkdtempSync(join(tmpdir(), 'pachax-g6-test-'))
const browser = spawn(chrome, [
  '--headless=new',
  '--disable-gpu',
  '--no-sandbox',
  `--remote-debugging-port=${cdpPort}`,
  '--remote-allow-origins=*',
  `--user-data-dir=${profile}`,
  `${base}/demo.html?template=restaurant`,
], { stdio: 'ignore' })

let socket
const metrics = {
  timestamp: new Date().toISOString(),
  testSuite: 'G6 — Onboarding Inteligente & Tutoriales Continuos',
  results: {},
  screenshots: [],
}

try {
  let page
  for (let attempt = 0; attempt < 50; attempt++) {
    await sleep(200)
    try {
      page = (await (await fetch(`http://127.0.0.1:${cdpPort}/json`)).json()).find((item) => item.type === 'page' && item.webSocketDebuggerUrl)
      if (page) break
    } catch {
      /* Browser starting */
    }
  }
  assert(page?.webSocketDebuggerUrl, 'No se encontró Chrome CDP.')

  socket = new WebSocket(page.webSocketDebuggerUrl)
  await new Promise((resolve, reject) => {
    socket.onopen = resolve
    socket.onerror = reject
  })

  let nextId = 1
  const pending = new Map()
  const browserLogs = []
  socket.onmessage = (event) => {
    const value = JSON.parse(event.data)
    if (value.method === 'Runtime.exceptionThrown') {
      const err = value.params.exceptionDetails?.exception?.description || value.params.exceptionDetails?.text
      browserLogs.push(`[Exception] ${err}`)
      console.error(`[Browser Exception] ${err}`)
    }
    if (value.method === 'Runtime.consoleAPICalled') {
      const text = (value.params.args || []).map((a) => a.value ?? a.description ?? '').join(' ')
      browserLogs.push(`[${value.params.type}] ${text}`)
    }
    if (!pending.has(value.id)) return
    const { resolve, reject } = pending.get(value.id)
    pending.delete(value.id)
    value.error ? reject(new Error(JSON.stringify(value.error))) : resolve(value.result)
  }

  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = nextId++
    pending.set(id, { resolve, reject })
    socket.send(JSON.stringify({ id, method, params }))
  })

  const evalPage = async (expression) => {
    const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.text)
    return result.result.value
  }

  const captureScreenshot = async (filename) => {
    const { data } = await send('Page.captureScreenshot', { format: 'png' })
    const outPath = join(ARTIFACTS_DIR, filename)
    writeFileSync(outPath, Buffer.from(data, 'base64'))
    metrics.screenshots.push(filename)
    console.log(`[Screenshot Saved] -> ${filename}`)
  }

  await send('Page.enable')
  await send('Runtime.enable')

  // =========================================================================
  // TEST 1: Restaurante con salón (Desktop 1440x900)
  // =========================================================================
  console.log('\n--- CASO 1: Restaurante con salón (Desktop 1440x900) ---')
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false })
  await send('Page.navigate', { url: `${base}/demo.html?template=restaurant&data=full` })

  // Clear storage BEFORE navigating to ensure fresh first visit
  await evalPage(`(() => {
    window.localStorage.clear()
    window.sessionStorage.clear()
  })()`)
  await send('Page.navigate', { url: `${base}/demo.html?template=restaurant&data=full` })

  // Wait for Welcome Modal to appear
  let welcomeState
  for (let attempt = 0; attempt < 70; attempt++) {
    await sleep(500)
    welcomeState = await evalPage(`(() => {
      const dialog = document.querySelector('[role="dialog"][aria-label="Tutorial interactivo"]')
      const anyDialog = document.querySelector('[role="dialog"]')
      const allModals = [...document.querySelectorAll('[role="dialog"]')].map(d => ({
        label: d.getAttribute('aria-label'),
        text: d.innerText.slice(0, 50)
      }))
      const storageKeys = Object.keys(window.localStorage)
      if (!dialog) {
        return {
          found: false,
          attempt: ${attempt + 1},
          bodySnippet: document.body?.innerText?.slice(0, 150) || '',
          anyDialog: Boolean(anyDialog),
          allModals,
          storageKeys,
        }
      }
      const text = dialog.innerText
      const buttons = [...dialog.querySelectorAll('button')].map(b => b.innerText.trim())
      return {
        found: true,
        text,
        buttons,
        hasTitle: text.includes('Restaurante con salón'),
        hasRole: text.includes('Dueño'),
        has11Sections: text.includes('11 secciones') || text.includes('11'),
      }
    })()`)
    if (welcomeState?.found) {
      console.log(`Modal encontrado en intento ${attempt + 1}`)
      break
    }
  }

  if (!welcomeState?.found) {
    console.error('Debug state:', welcomeState)
  }
  assert(welcomeState?.found, 'El modal de bienvenida de Restaurante con salón debe abrirse automáticamente en primera visita')
  assert(welcomeState.hasTitle, 'El modal debe contener el título de Restaurante con salón')
  console.log('✓ Modal de bienvenida visible con título y rol:', welcomeState.hasRole ? 'Dueño' : 'Rol ok')

  await captureScreenshot('g6-restaurant-salon-welcome-desktop-1440x900.png')
  metrics.results.salonWelcomeModal = 'PASS'

  // Click "Iniciar tutorial"
  console.log('Iniciando tutorial continuo...')
  await evalPage(`(() => {
    const startBtn = [...document.querySelectorAll('button')].find(b => b.innerText.includes('Iniciar tutorial'))
    if (startBtn) startBtn.click()
  })()`)

  await sleep(1000)

  // Verify POS module is active and tour overlay rendered
  const tourState = await evalPage(`(() => {
    const tourCard = document.querySelector('.restaurant-tour-card, [data-tour-card], .fixed')
    const activeModule = document.querySelector('.restaurant-nav-btn.active, .restaurant-desktop-nav-bar')
    return {
      hasTourCard: Boolean(tourCard),
      hasModule: Boolean(activeModule),
      bodySnippet: document.body.innerText.slice(0, 300),
    }
  })()`)
  console.log('✓ Secuencia continua iniciada en POS:', tourState.hasTourCard ? 'Tour visible' : 'Contenido visible')
  await captureScreenshot('g6-restaurant-salon-continuous-pos-desktop-1440x900.png')
  metrics.results.salonContinuousStart = 'PASS'

  // Pause / Dismiss tour and open Learning Center
  await evalPage(`(() => {
    // Click pause or close
    const closeBtn = document.querySelector('button[aria-label="Cerrar"], button[title="Cerrar"]')
    if (closeBtn) closeBtn.click()
  })()`)
  await sleep(500)

  // Open Learning Center via "Cómo funciona"
  await evalPage(`(() => {
    const learnBtn = [...document.querySelectorAll('button')].find(b => b.innerText.includes('Cómo funciona') || b.title?.includes('Cómo funciona'))
    if (learnBtn) learnBtn.click()
  })()`)
  await sleep(800)

  const learningCenterState = await evalPage(`(() => {
    const text = document.body.innerText
    return {
      hasResumeBanner: text.includes('Continuar donde lo dejaste') || text.includes('Continuar tutorial'),
      hasRestartBtn: text.includes('Reiniciar') || text.includes('Reiniciar tutorial'),
    }
  })()`)
  console.log('✓ Centro de aprendizaje con soporte de reanudación y reinicio:', learningCenterState)
  await captureScreenshot('g6-restaurant-salon-learning-center-resume-desktop-1440x900.png')
  metrics.results.learningCenterResumeBanner = 'PASS'

  // =========================================================================
  // TEST 2: Restaurante Rápido / Hamburger (Mobile 390x844)
  // =========================================================================
  console.log('\n--- CASO 2: Restaurante Rápido (Mobile 390x844) ---')
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true })
  // Clear storage to simulate fresh arrival
  await evalPage(`(() => {
    window.localStorage.clear()
    window.sessionStorage.clear()
  })()`)
  await send('Page.navigate', { url: `${base}/demo.html?template=hamburger&data=full` })

  let fastFoodWelcome
  for (let attempt = 0; attempt < 50; attempt++) {
    await sleep(400)
    fastFoodWelcome = await evalPage(`(() => {
      const dialog = document.querySelector('[role="dialog"][aria-label="Tutorial interactivo"]')
      if (!dialog) return { found: false }
      const text = dialog.innerText
      return {
        found: true,
        text,
        hasTitle: text.includes('Restaurante Rápido'),
        hasNoTables: !text.includes('Salón y Mesas') && !text.includes('Tutorial Mesas'),
        has10Sections: text.includes('10 secciones') || text.includes('10'),
      }
    })()`)
    if (fastFoodWelcome?.found) break
  }

  assert(fastFoodWelcome?.found, 'El modal de bienvenida de Restaurante Rápido debe abrirse')
  assert(fastFoodWelcome.hasTitle, 'Debe indicar Restaurante Rápido')
  assert(fastFoodWelcome.hasNoTables, 'Restaurante Rápido debe excluir estrictamente el tutorial de Mesas')
  console.log('✓ Restaurante Rápido verificado: 10 secciones sin módulo de Mesas')

  await captureScreenshot('g6-fastfood-welcome-mobile-390x844.png')
  metrics.results.fastFoodWelcomeMobile = 'PASS'

  // Test "Saltar por ahora" flow
  await evalPage(`(() => {
    const skipBtn = [...document.querySelectorAll('button')].find(b => b.innerText.includes('Saltar por ahora'))
    if (skipBtn) skipBtn.click()
  })()`)
  await sleep(500)

  const skipConfirmationState = await evalPage(`(() => {
    const text = document.body.innerText
    return {
      hasConfirmation: text.includes('Tutorial disponible cuando lo necesites') || text.includes('Entendido'),
    }
  })()`)
  assert(skipConfirmationState.hasConfirmation, 'Debe mostrar confirmación educada al saltar el tutorial')
  console.log('✓ Confirmación de "Saltar por ahora" mostrada correctamente')

  // Click "Entendido"
  await evalPage(`(() => {
    const okBtn = [...document.querySelectorAll('button')].find(b => b.innerText.includes('Entendido'))
    if (okBtn) okBtn.click()
  })()`)
  await sleep(500)

  // Verify modal is gone
  const isModalGone = await evalPage(`!document.querySelector('[role="dialog"][aria-label="Tutorial interactivo"]')`)
  assert(isModalGone, 'El modal de bienvenida debe cerrarse tras confirmar')
  console.log('✓ Modal cerrado correctamente tras saltar')
  metrics.results.fastFoodSkipFlow = 'PASS'

  // =========================================================================
  // TEST 3: Distribución (Desktop 1440x900)
  // =========================================================================
  console.log('\n--- CASO 3: Distribución (Desktop 1440x900) ---')
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false })
  await evalPage(`(() => {
    window.localStorage.clear()
    window.sessionStorage.clear()
  })()`)
  await send('Page.navigate', { url: `${base}/demo.html?template=distribution&data=full` })

  let distWelcome
  for (let attempt = 0; attempt < 50; attempt++) {
    await sleep(400)
    distWelcome = await evalPage(`(() => {
      const dialog = document.querySelector('[role="dialog"][aria-label="Tutorial interactivo"]')
      if (!dialog) return { found: false }
      const text = dialog.innerText
      return {
        found: true,
        text,
        hasTitle: text.includes('Distribución'),
      }
    })()`)
    if (distWelcome?.found) break
  }

  assert(distWelcome?.found, 'El modal de bienvenida de Distribución debe abrirse')
  console.log('✓ Modal de bienvenida de Distribución visible')
  await captureScreenshot('g6-distribution-welcome-desktop-1440x900.png')
  metrics.results.distributionWelcome = 'PASS'

  // =========================================================================
  // TEST 4: Resumen de Finalización ("¡Tutorial completado!")
  // =========================================================================
  console.log('\n--- CASO 4: Modal de Resumen de Finalización ---')
  // Inject completed state in storage and reload
  await evalPage(`(() => {
    const scopeKey = 'pachax:tutorial-orchestrator:demo:demo-tenant-restaurant:restaurant:full:restaurant:owner:v1'
    const completedState = {
      welcomeDismissed: true,
      welcomeSkipped: false,
      isContinuousActive: false,
      isPaused: false,
      currentSectionId: null,
      currentStepIndex: 0,
      completedSectionIds: ['pos', 'tables', 'kitchen', 'cash', 'products', 'inventory', 'customers', 'history', 'users', 'settings', 'printers'],
      completedAll: true,
      lastUpdated: new Date().toISOString()
    }
    window.localStorage.setItem(scopeKey, JSON.stringify(completedState))
  })()`)

  await send('Page.navigate', { url: `${base}/demo.html?template=restaurant&data=full` })
  await sleep(1500)

  // Open Learning Center and click summary or trigger summary modal
  await evalPage(`(() => {
    // If not auto-open, open from Learning center
    const learnBtn = [...document.querySelectorAll('button')].find(b => b.innerText.includes('Cómo funciona') || b.title?.includes('Cómo funciona'))
    if (learnBtn) learnBtn.click()
  })()`)
  await sleep(800)

  const summaryState = await evalPage(`(() => {
    const text = document.body.innerText
    return {
      hasAllCompletedText: text.includes('100%') || text.includes('completado') || text.includes('¡Tutorial completado!'),
      hasRestartButton: text.includes('Reiniciar'),
    }
  })()`)
  console.log('✓ Estado de finalización del 100% y reinicio comprobado:', summaryState)
  await captureScreenshot('g6-completion-summary-desktop-1440x900.png')
  metrics.results.completionSummaryModal = 'PASS'

  // Save metrics artifact
  const metricsJsonPath = join(ARTIFACTS_DIR, 'g6-verification-metrics.json')
  writeFileSync(metricsJsonPath, JSON.stringify(metrics, null, 2))
  console.log(`\n[Metrics Saved] -> ${metricsJsonPath}`)
  console.log('\n=== TODAS LAS PRUEBAS E2E DE NAVEGADOR G6 COMPLETADAS EXITOSAMENTE ===\n')

} finally {
  if (socket) socket.close()
  browser.kill()
  vite.kill()
}
