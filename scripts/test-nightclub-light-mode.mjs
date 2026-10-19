import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { existsSync, mkdtempSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createServer } from 'node:net'

const chrome = [process.env.CHROME_BIN, 'C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe'].filter(Boolean).find(existsSync)
if (!chrome) throw new Error('Chrome no encontrado.')
const base = process.env.ADMIN_STUDIO_TEST_URL || 'http://localhost:5192'

const probe = createServer()
await new Promise(resolve => probe.listen(0, '127.0.0.1', resolve))
const port = probe.address().port
await new Promise(resolve => probe.close(resolve))
const profile = mkdtempSync(join(tmpdir(), 'pachax-nightclub-theme-'))
const browser = spawn(chrome, ['--headless=new', '--disable-gpu', '--no-sandbox', `--remote-debugging-port=${port}`, '--remote-allow-origins=*', `--user-data-dir=${profile}`, base], { stdio: 'ignore' })
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

try {
  let page
  for (let attempt = 0; attempt < 50; attempt++) {
    await sleep(200)
    try {
      page = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find(item => item.type === 'page' && item.webSocketDebuggerUrl)
      if (page) break
    } catch {}
  }
  assert(page?.webSocketDebuggerUrl, 'No se encontró Chrome CDP.')
  const socket = new WebSocket(page.webSocketDebuggerUrl)
  await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject })

  let nextId = 1
  const pending = new Map()
  socket.onmessage = event => {
    const value = JSON.parse(event.data)
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
  await send('Emulation.setDeviceMetricsOverride', { width: 1366, height: 768, deviceScaleFactor: 1, mobile: false })

  // 1. Navegar a Studio con Nightclub Full
  await send('Page.navigate', { url: new URL('/studio?template=nightclub&data=full', base).href })
  await sleep(1500)

  // Verificar estado inicial: dark
  const initialTheme = await evalPage(`(() => {
    const doc = document.querySelector('iframe')?.contentDocument;
    const shell = doc?.querySelector('.nightclub-shell');
    return {
      exists: !!shell,
      themeAttr: shell?.getAttribute('data-theme'),
      bg: getComputedStyle(shell || document.body).backgroundColor
    }
  })()`)
  console.log('1. Initial Studio Nightclub Theme:', initialTheme)
  assert.equal(initialTheme.exists, true, 'El shell de Nightclub debe existir en el iframe')
  assert.equal(initialTheme.themeAttr, 'dark', 'Por defecto debe iniciar en modo oscuro')

  // 2. Click en botón "Claro" del StudioShell
  const toggleStudioLight = await evalPage(`(() => {
    const buttons = [...document.querySelectorAll('button')];
    const lightBtn = buttons.find(b => b.textContent.trim() === 'Claro' && b.title?.includes('Claro'));
    if (!lightBtn) return false;
    lightBtn.click();
    return true;
  })()`)
  assert(toggleStudioLight, 'Botón "Claro" en StudioShell debe existir y ser clickeable')
  await sleep(400)

  // Verificar que el iframe cambió inmediatamente a modo claro sin recargar
  const lightThemeResult = await evalPage(`(() => {
    const doc = document.querySelector('iframe')?.contentDocument;
    const shell = doc?.querySelector('.nightclub-shell');
    return {
      themeAttr: shell?.getAttribute('data-theme'),
      hasLightClass: shell?.classList.contains('theme-light'),
      textColor: getComputedStyle(shell || document.body).color
    }
  })()`)
  console.log('2. Studio Toggle -> Light Mode Result:', lightThemeResult)
  assert.equal(lightThemeResult.themeAttr, 'light', 'El shell debe tener data-theme="light"')
  assert.equal(lightThemeResult.hasLightClass, true, 'El shell debe tener clase theme-light')

  // 3. Probar navegación entre módulos en modo claro y medir contraste de textos y tarjetas
  const modules = ['Zonas', 'POS', 'Barra', 'Cuentas', 'Caja', 'Inventario', 'Historial', 'Reportes', 'Configuración']
  for (const mod of modules) {
    const navOk = await evalPage(`(() => {
      const doc = document.querySelector('iframe')?.contentDocument;
      const navButtons = [...doc.querySelectorAll('aside nav button')];
      const target = navButtons.find(b => b.textContent.includes('${mod}'));
      if (target) { target.click(); return true }
      return false
    })()`)
    await sleep(300)
    const checkStyles = await evalPage(`(() => {
      const doc = document.querySelector('iframe')?.contentDocument;
      const shell = doc?.querySelector('.nightclub-shell');
      const h1 = doc?.querySelector('h1');
      const aside = doc?.querySelector('aside');
      return {
        module: '${mod}',
        navOk: ${navOk},
        themeAttr: shell?.getAttribute('data-theme'),
        h1Color: h1 ? getComputedStyle(h1).color : null,
        asideBg: aside ? getComputedStyle(aside).backgroundColor : null
      }
    })()`)
    console.log(`   OK Modulo ${mod} en Modo Claro:`, checkStyles)
    assert.equal(checkStyles.themeAttr, 'light', `El tema claro debe persistir al cambiar a ${mod}`)
  }

  // 4. Probar el toggle del Topbar dentro de Nightclub (🌙 Oscuro)
  const toggleTopbarDark = await evalPage(`(() => {
    const doc = document.querySelector('iframe')?.contentDocument;
    const darkBtn = doc?.querySelector('button[aria-label="Modo oscuro"]');
    if (!darkBtn) return false;
    darkBtn.click();
    return true;
  })()`)
  assert(toggleTopbarDark, 'Botón de Modo Oscuro en topbar debe ser clickeable')
  await sleep(400)

  const revertedDark = await evalPage(`(() => {
    const doc = document.querySelector('iframe')?.contentDocument;
    const shell = doc?.querySelector('.nightclub-shell');
    return shell?.getAttribute('data-theme')
  })()`)
  console.log('4. Topbar Toggle -> Dark Mode Result:', revertedDark)
  assert.equal(revertedDark, 'dark', 'Debe regresar a modo oscuro al presionar Oscuro en topbar')

  // 5. Probar el toggle del Topbar dentro de Nightclub (☀️ Claro)
  const toggleTopbarLight = await evalPage(`(() => {
    const doc = document.querySelector('iframe')?.contentDocument;
    const lightBtn = doc?.querySelector('button[aria-label="Modo claro"]');
    if (!lightBtn) return false;
    lightBtn.click();
    return true;
  })()`)
  assert(toggleTopbarLight, 'Botón de Modo Claro en topbar debe ser clickeable')
  await sleep(400)

  const confirmedLight = await evalPage(`(() => {
    const doc = document.querySelector('iframe')?.contentDocument;
    const shell = doc?.querySelector('.nightclub-shell');
    return shell?.getAttribute('data-theme')
  })()`)
  console.log('5. Topbar Toggle -> Light Mode Result:', confirmedLight)
  assert.equal(confirmedLight, 'light', 'Debe volver a modo claro al presionar Claro en topbar')

  // 6. Probar en Demo público directo (/demo/nightclub)
  await send('Page.navigate', { url: new URL('/demo/nightclub', base).href })
  await sleep(1500)
  const demoPublicResult = await evalPage(`(() => {
    const shell = document.querySelector('.nightclub-shell');
    const darkBtn = document.querySelector('button[aria-label="Modo oscuro"]');
    const lightBtn = document.querySelector('button[aria-label="Modo claro"]');
    return {
      hasShell: !!shell,
      hasDarkBtn: !!darkBtn,
      hasLightBtn: !!lightBtn
    }
  })()`)
  console.log('6. Public Demo Direct /demo/nightclub:', demoPublicResult)
  assert(demoPublicResult.hasShell && demoPublicResult.hasDarkBtn && demoPublicResult.hasLightBtn, 'Public demo debe incluir shell y toggle de temas')

  console.log('\n=== TODOS LOS CHECKS DE MODO CLARO Y OSCURO COMPLETADOS CON ÉXITO ===')
  socket.close()
  browser.kill()
  process.exit(0)
} catch (err) {
  console.error('ERROR EN QA MODO CLARO:', err)
  browser.kill()
  process.exit(1)
}
