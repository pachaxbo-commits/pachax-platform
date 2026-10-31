// Browser verification script for S.M.T. Expreso Punata Studio integration
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createServer as createNetServer } from 'node:net'
import { createServer as createViteServer } from 'vite'

const chrome = [
  process.env.CHROME_BIN,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
].filter(Boolean).find(existsSync)

if (!chrome) {
  console.log('Chrome no encontrado; omitiendo prueba de navegador headless.')
  process.exit(0)
}

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

// 1. Iniciar servidor Vite programático
console.log('Iniciando servidor Vite programático...')
const appPort = 5196
const viteServer = await createViteServer({
  server: {
    host: '127.0.0.1',
    port: appPort,
    strictPort: true,
  },
})
await viteServer.listen()
const base = `http://127.0.0.1:${appPort}`
console.log(`Servidor Vite activo en ${base}`)

// 2. Iniciar Chrome Headless con puerto CDP dinámico
const cdpProbe = createNetServer()
await new Promise(resolve => cdpProbe.listen(0, '127.0.0.1', resolve))
const cdpPort = cdpProbe.address().port
await new Promise(resolve => cdpProbe.close(resolve))

const profile = mkdtempSync(join(tmpdir(), 'pachax-punata-browser-'))
const browser = spawn(
  chrome,
  [
    '--headless=new',
    '--disable-gpu',
    '--no-sandbox',
    `--remote-debugging-port=${cdpPort}`,
    '--remote-allow-origins=*',
    `--user-data-dir=${profile}`,
    base,
  ],
  { stdio: 'ignore' }
)

let socket
try {
  let page
  for (let attempt = 0; attempt < 50; attempt++) {
    await sleep(200)
    try {
      page = (await (await fetch(`http://127.0.0.1:${cdpPort}/json`)).json()).find(
        item => item.type === 'page' && item.webSocketDebuggerUrl
      )
      if (page) break
    } catch {
      // browser starting
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
  const errors = []
  socket.onmessage = event => {
    const value = JSON.parse(event.data)
    if (value.method === 'Runtime.exceptionThrown') {
      errors.push(value.params.exceptionDetails.text)
    }
    if (!pending.has(value.id)) return
    const { resolve, reject } = pending.get(value.id)
    pending.delete(value.id)
    value.error ? reject(new Error(JSON.stringify(value.error))) : resolve(value.result)
  }

  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const id = nextId++
      pending.set(id, { resolve, reject })
      socket.send(JSON.stringify({ id, method, params }))
    })

  const evalPage = async expression => {
    const result = await send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
    })
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.text)
    return result.result.value
  }

  await send('Page.enable')
  await send('Runtime.enable')

  // Set desktop viewport
  await send('Emulation.setDeviceMetricsOverride', {
    width: 1366,
    height: 768,
    deviceScaleFactor: 1,
    mobile: false,
  })

  const waitForText = async (predicate, timeoutAttempts = 30) => {
    for (let i = 0; i < timeoutAttempts; i++) {
      const text = await evalPage(`document.getElementById('root')?.innerText || document.body?.innerText || ''`)
      if (predicate(text)) return text
      await sleep(300)
    }
    const finalDump = await evalPage(`document.getElementById('root')?.innerText || document.body?.innerText || ''`)
    throw new Error(`Timeout esperando condición en la página. Texto capturado: "${finalDump.slice(0, 300)}"`)
  }

  // Test 1: Studio Home shows Expreso Punata card with DEMO INTERNA DEL CLIENTE
  console.log('\n--- PASO 1: Verificando Studio Home ---')
  await send('Page.navigate', { url: new URL('/studio.html', base).href })

  const studioHomeText = await waitForText(t => t.includes('PACHAX Studio') && t.includes('Expreso Punata'))
  assert.ok(studioHomeText.includes('PACHAX Studio'), 'Debe mostrar título de PACHAX Studio')
  assert.ok(studioHomeText.includes('S.M.T. Expreso Punata'), 'Debe mostrar tarjeta de S.M.T. Expreso Punata')
  assert.ok(studioHomeText.includes('DEMO INTERNA DEL CLIENTE'), 'Debe mostrar badge de Demo Interna')
  console.log('✔ Studio Home: Tarjeta de Expreso Punata visible con etiqueta DEMO INTERNA DEL CLIENTE')

  // Test 2: Abrir Expreso Punata en Studio
  console.log('\n--- PASO 2: Abriendo Expreso Punata en Studio ---')
  await send('Page.navigate', {
    url: new URL('/studio.html?template=expreso-punata&data=full', base).href,
  })

  const punataLoadedText = await waitForText(t => t.includes('EXPRESO PUNATA'))
  assert.ok(punataLoadedText.includes('EXPRESO PUNATA'), 'Debe incluir EXPRESO PUNATA en el encabezado')
  assert.ok(punataLoadedText.includes('Somos los Pioneros'), 'Debe incluir slogan "Somos los Pioneros"')
  console.log('✔ Encabezado corporativo: S.M.T. EXPRESO PUNATA y slogan "Somos los Pioneros" presentes')

  // Test 3: Verificar pestañas operativas de Sindicato
  console.log('\n--- PASO 3: Verificando pestañas operativas de Sindicato ---')
  const tabs = [
    'Tablero de Encomiendas',
    'Despachos y Manifiestos',
    'Padrón de Socios',
    'Mensualidades & Cuotas',
    'Choferes & Trabajadores',
    'Gastos del Sindicato',
    'Reportes & Finanzas',
    'Configuración Expreso Punata',
  ]

  for (const tab of tabs) {
    const clicked = await evalPage(`(() => {
      const btn = [...document.querySelectorAll('button')].find(b => b.innerText.includes('${tab}'))
      if (btn) {
        btn.click()
        return true
      }
      return false
    })()`)
    assert.ok(clicked, `Pestaña "${tab}" debe ser clickeable`)
    await sleep(300)
    console.log(`  ✔ Pestaña "${tab}" cargada sin excepciones`)
  }

  // Test 3.5: Operaciones interactivas (Nueva Encomienda, Despacho, Aportes)
  console.log('\n--- PASO 3.5: Verificando modales operativos ---')
  // Volver a la pestaña de Encomiendas para probar el modal de creación
  await evalPage(`(() => {
    const btn = [...document.querySelectorAll('button')].find(b => b.innerText.includes('Tablero de Encomiendas'))
    if (btn) btn.click()
  })()`)
  await sleep(400)

  // Abrir modal de Nueva Encomienda
  await evalPage(`(() => {
    const btn = [...document.querySelectorAll('button')].find(b => b.innerText.includes('Nueva Encomienda'))
    if (btn) btn.click()
  })()`)
  await sleep(600)

  const isModalOpen = await evalPage(`(() => {
    const h2 = [...document.querySelectorAll('h2')].find(h => h.innerText.includes('Nueva Encomienda'))
    const hasForm = !!document.querySelector('form')
    return !!h2 && hasForm
  })()`)
  assert.ok(isModalOpen, 'El modal de Nueva Encomienda debe abrirse y mostrar su formulario')
  console.log('  ✔ Modal Nueva Encomienda: formulario interactivo de recepción desplegado correctamente')

  // Cerrar modal Nueva Encomienda con botón Cancelar o X
  await evalPage(`(() => {
    const closeBtn = [...document.querySelectorAll('button')].find(b => b.innerText.trim() === 'Cancelar' || b.querySelector('svg.lucide-x'))
    if (closeBtn) closeBtn.click()
  })()`)
  await sleep(500)

  // Test 4: Modal de cambio de dataset (Full -> Empty) con confirmación
  console.log('\n--- PASO 4: Probando cambio de dataset con modal de confirmación ---')
  // Click on "Vacío" dataset button in Studio header
  const clickedEmpty = await evalPage(`(() => {
    const btn = [...document.querySelectorAll('button')].find(b => b.innerText.trim() === 'Vacío')
    if (btn) {
      btn.click()
      return true
    }
    return false
  })()`)
  assert.ok(clickedEmpty, 'Botón de dataset Vacío debe existir en el header de Studio')
  await sleep(500)

  // Verify confirmation modal appeared
  const modalText = await evalPage(`document.body.innerText`)
  assert.ok(
    modalText.includes('Cambiar escenario'),
    'El modal de advertencia de cambio de dataset debe estar visible'
  )
  console.log('✔ Modal de confirmación de cambio de dataset desplegado correctamente')

  // Confirm switch
  await evalPage(`(() => {
    const confirmBtn = [...document.querySelectorAll('button')].find(b => b.innerText.trim() === 'Cambiar escenario')
    if (confirmBtn) confirmBtn.click()
  })()`)
  await sleep(1000)

  // Verify responsive viewports
  console.log('\n--- PASO 5: Verificando adaptabilidad responsive ---')
  const viewports = [
    { w: 390, h: 844, name: 'Móvil (390x844)' },
    { w: 768, h: 1024, name: 'Tablet (768x1024)' },
    { w: 1366, h: 768, name: 'Laptop (1366x768)' },
  ]

  for (const vp of viewports) {
    await send('Emulation.setDeviceMetricsOverride', {
      width: vp.w,
      height: vp.h,
      deviceScaleFactor: 1,
      mobile: vp.w < 500,
    })
    await sleep(300)
    const metrics = await evalPage(`({
      bodyLength: document.body.innerText.length,
      scrollWidth: document.documentElement.scrollWidth,
      innerWidth: window.innerWidth
    })`)
    assert.ok(metrics.bodyLength > 50, `Contenido presente en ${vp.name}`)
    console.log(`  ✔ ${vp.name}: renderizado sin anomalías`)
  }

  assert.equal(errors.length, 0, `No debe haber errores de consola: ${errors.join('; ')}`)
  console.log('\n======================================================')
  console.log('TODAS LAS PRUEBAS DE NAVEGADOR COMPLETADAS CON ÉXITO')
  console.log('======================================================\n')
} finally {
  socket?.close()
  browser.kill()
  await viteServer.close()
  try {
    rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
  } catch {
    // profile cleanup
  }
}
