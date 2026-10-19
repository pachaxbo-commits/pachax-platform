import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createServer } from 'node:net'

const chrome = [process.env.CHROME_BIN, 'C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe'].filter(Boolean).find(existsSync)
if (!chrome) throw new Error('Chrome no encontrado; define CHROME_BIN.')

const TEST_PORT = 5194
const base = `http://127.0.0.1:${TEST_PORT}`

console.log(`Iniciando Vite en el puerto ${TEST_PORT}...`)
const vite = spawn(process.execPath, ['./node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', String(TEST_PORT), '--strictPort'], {
  cwd: process.cwd(),
  stdio: 'inherit'
})

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

// Wait for Vite to be ready
let viteReady = false
for (let i = 0; i < 30; i++) {
  await sleep(500)
  try {
    const res = await fetch(`${base}/`)
    if (res.status < 400) {
      viteReady = true
      break
    }
  } catch (err) {
    // waiting for server
  }
}
if (!viteReady) {
  vite.kill()
  throw new Error(`El servidor Vite en ${base} no inició a tiempo.`)
}
console.log('Vite listo. Iniciando Chrome headless...')

const probe = createServer()
await new Promise(resolve => probe.listen(0, '127.0.0.1', resolve))
const cdpPort = probe.address().port
await new Promise(resolve => probe.close(resolve))

const profile = mkdtempSync(join(tmpdir(), 'pachax-restaurant-test-'))
const browser = spawn(chrome, [
  '--headless=new',
  '--disable-gpu',
  '--no-sandbox',
  `--remote-debugging-port=${cdpPort}`,
  '--remote-allow-origins=*',
  `--user-data-dir=${profile}`,
  `${base}/demo.html?template=restaurant`
], { stdio: 'ignore' })

let socket
try {
  let page
  for (let attempt = 0; attempt < 50; attempt++) {
    await sleep(200)
    try {
      page = (await (await fetch(`http://127.0.0.1:${cdpPort}/json`)).json()).find(item => item.type === 'page' && item.webSocketDebuggerUrl)
      if (page) break
    } catch { /* Browser starting */ }
  }
  assert(page?.webSocketDebuggerUrl, 'No se encontró Chrome CDP.')

  socket = new WebSocket(page.webSocketDebuggerUrl)
  await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject })

  let nextId = 1
  const pending = new Map()
  const errors = []
  socket.onmessage = event => {
    const value = JSON.parse(event.data)
    if (value.method === 'Runtime.exceptionThrown') errors.push(value.params.exceptionDetails.text || value.params.exceptionDetails.exception?.description)
    if (value.method === 'Runtime.consoleAPICalled') {
      const text = (value.params.args || []).map(a => a.value ?? a.description ?? '').join(' ')
      errors.push(`[${value.params.type}] ${text}`)
    }
    if (value.method === 'Network.loadingFailed') {
      errors.push(`[NetworkFailed] ${value.params.errorText} (${value.params.type})`)
    }
    if (value.method === 'Console.messageAdded') errors.push(`[Console] ${value.params.message.text}`)
    if (value.method === 'Log.entryAdded') errors.push(`[Log] ${value.params.entry.text}`)
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

  const evalPage = async expression => {
    const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.text)
    return result.result.value
  }

  await send('Page.enable')
  await send('Runtime.enable')
  await send('Log.enable')
  await send('Console.enable')
  await send('Network.enable')

  // 1. Test Desktop 1366x768
  console.log('\n--- Probando resolución Escritorio (1366x768) ---')
  await send('Emulation.setDeviceMetricsOverride', { width: 1366, height: 768, deviceScaleFactor: 1, mobile: false })
  await send('Page.navigate', { url: `${base}/demo/restaurant` })

  // Wait for React to render (Vite first module compile can take ~10-15s)
  console.log('Esperando renderizado de la aplicación (compilación Vite en curso)...')
  let navStatus
  for (let attempt = 0; attempt < 70; attempt++) {
    await sleep(500)
    navStatus = await evalPage(`(() => {
      const nav = document.querySelector('.restaurant-desktop-nav-bar')
      if (!nav) {
        return {
          found: false,
          href: window.location.href,
          bodySnippet: document.body.innerText.slice(0, 150),
          htmlSnippet: document.body.innerHTML
        }
      }
      const rect = nav.getBoundingClientRect()
      const style = window.getComputedStyle(nav)
      const buttons = [...nav.querySelectorAll('.restaurant-nav-btn')].map(b => b.textContent.trim())
      return {
        found: true,
        visible: rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden',
        rect: { width: rect.width, height: rect.height, top: rect.top },
        buttons
      }
    })()`)
    if (navStatus.found) {
      console.log(`Renderizado completado en el intento ${attempt + 1}.`)
      break
    }
  }

  if (!navStatus.found) {
    console.error('Debug URL:', navStatus.href)
    console.error('Debug: No se encontró nav. Estado del body:', navStatus.bodySnippet)
    console.error('Debug HTML:', navStatus.htmlSnippet)
    console.error('Debug Errors:', errors)
  }
  assert(navStatus.found, 'La barra de navegación .restaurant-desktop-nav-bar no se encontró.')
  assert(navStatus.visible, 'La barra de navegación de escritorio NO está visible de forma fija.')
  console.log('OK: Menú superior de escritorio está SIEMPRE VISIBLE y fijo.')
  console.log('Botones detectados:', navStatus.buttons.join(' | '))

  assert(navStatus.buttons.includes('Inicio'), 'Falta botón Inicio')
  assert(navStatus.buttons.includes('POS'), 'Falta botón POS')
  assert(navStatus.buttons.includes('Pedidos'), 'Falta botón Pedidos')
  assert(navStatus.buttons.includes('Mesas'), 'Falta botón Mesas')
  assert(navStatus.buttons.includes('Cocina'), 'Falta botón Cocina')
  assert(navStatus.buttons.includes('Caja'), 'Falta botón Caja')
  assert(navStatus.buttons.includes('Inventario'), 'Falta botón Inventario')
  assert(navStatus.buttons.includes('Productos'), 'Falta botón Productos')
  assert(navStatus.buttons.includes('Clientes'), 'Falta botón Clientes')
  assert(navStatus.buttons.includes('Reportes'), 'Falta botón Reportes')
  assert(navStatus.buttons.some(b => b.includes('Más')), 'Falta botón Más')

  // Click on "Más" and verify dropdown items
  console.log('Probando apertura del menú desplegable "Más"...')
  await evalPage(`(() => {
    const moreBtn = [...document.querySelectorAll('.restaurant-nav-btn')].find(b => b.textContent.includes('Más'))
    if (moreBtn) moreBtn.click()
  })()`)
  await sleep(300)

  const moreMenuStatus = await evalPage(`(() => {
    const popover = document.querySelector('.restaurant-more-dropdown')
    if (!popover) return { error: 'No se abrió el menú Más (.restaurant-more-dropdown)' }
    const items = [...popover.querySelectorAll('.restaurant-dropdown-item')].map(b => b.textContent.trim())
    return { ok: true, items }
  })()`)

  assert(moreMenuStatus.ok, moreMenuStatus.error)
  console.log('Submódulos en Más:', moreMenuStatus.items.join(', '))
  assert(moreMenuStatus.items.some(i => i.includes('Historial')), 'Falta Historial en Más')
  assert(moreMenuStatus.items.some(i => i.includes('Usuarios')), 'Falta Usuarios en Más')
  assert(moreMenuStatus.items.some(i => i.includes('Configuración')), 'Falta Configuración en Más')
  assert(moreMenuStatus.items.some(i => i.includes('Impresoras')), 'Falta Impresoras en Más')
  console.log('OK: Menú "Más" despliega correctamente los módulos secundarios.')

  // Click module views to verify rendering without errors
  const testModules = ['Pedidos', 'Mesas', 'Cocina', 'Caja', 'Inventario', 'Configuración']
  for (const mod of testModules) {
    console.log(`Navegando a módulo: ${mod}...`)
    let isDirect = await evalPage(`(() => {
      let btn = [...document.querySelectorAll('.restaurant-nav-btn')].find(b => b.textContent.trim() === '${mod}')
      if (btn) { btn.click(); return true }
      return false
    })()`)

    if (!isDirect) {
      // Must be in secondary modules ("Más")
      await evalPage(`(() => {
        let moreBtn = [...document.querySelectorAll('.restaurant-nav-btn')].find(b => b.textContent.includes('Más'))
        if (moreBtn) moreBtn.click()
      })()`)
      await sleep(300)
      let clickedSecondary = await evalPage(`(() => {
        let popBtn = [...document.querySelectorAll('.restaurant-dropdown-item')].find(b => b.textContent.includes('${mod}'))
        if (popBtn) { popBtn.click(); return true }
        return false
      })()`)
      assert(clickedSecondary, `No se encontró ${mod} ni en barra directa ni en Más`)
    }
    await sleep(400)
    const viewStatus = await evalPage(`(() => {
      return {
        hasViteError: !!document.querySelector('vite-error-overlay'),
        bodyLength: document.body.innerText.length,
        overflow: document.documentElement.scrollWidth - window.innerWidth
      }
    })()`)
    assert(!viewStatus.hasViteError, `Error de Vite al abrir vista ${mod}`)
    assert(viewStatus.bodyLength > 50, `Vista ${mod} parece vacía`)
    console.log(`  ✓ ${mod} cargado correctamente (overflow: ${viewStatus.overflow}px)`)
  }

  // 2. Test Mobile 390x844
  console.log('\n--- Probando resolución Móvil (390x844) ---')
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true })
  await sleep(1000)

  const mobileStatus = await evalPage(`(() => {
    const desktopNav = document.querySelector('.restaurant-desktop-nav-bar')
    const desktopNavVisible = desktopNav ? (window.getComputedStyle(desktopNav).display !== 'none') : false
    const mobileBtn = document.querySelector('.restaurant-menu-toggle')
    const overflow = document.documentElement.scrollWidth - window.innerWidth
    return {
      desktopNavVisible,
      mobileBtnExists: !!mobileBtn,
      overflow,
      title: document.title
    }
  })()`)

  assert(!mobileStatus.desktopNavVisible, 'La barra de navegación de escritorio NO debe ser visible en móvil.')
  console.log('OK: Barra de escritorio oculta en móvil.')
  assert(mobileStatus.mobileBtnExists, 'El selector móvil .restaurant-mobile-module-button debe existir.')
  console.log('OK: Selector móvil presente.')
  assert(mobileStatus.overflow <= 5, `Desbordamiento horizontal en móvil: ${mobileStatus.overflow}px`)
  console.log(`OK: Sin desbordamiento horizontal en móvil (${mobileStatus.overflow}px).`)

  console.log('\n=== TODAS LAS PRUEBAS VISUALES EN NAVEGADOR HEADLESS PASARON EXITOSAMENTE ===\n')

} finally {
  socket?.close()
  browser.kill()
  vite.kill()
  await sleep(600)
  try { rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }) } catch { /* cleanup */ }
}
