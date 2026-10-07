// Read-only smoke test for the local Vite server. Studio uses the development
// sandbox; production access is verified separately with an operator session.
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createServer } from 'node:net'

const chrome = [process.env.CHROME_BIN, 'C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe'].filter(Boolean).find(existsSync)
if (!chrome) throw new Error('Chrome no encontrado; define CHROME_BIN.')
const base = process.env.ADMIN_STUDIO_TEST_URL || 'http://127.0.0.1:5192'
assert.equal((await fetch(base)).status, 200, 'El servidor local no responde.')
const probe = createServer()
await new Promise(resolve => probe.listen(0, '127.0.0.1', resolve))
const port = probe.address().port
await new Promise(resolve => probe.close(resolve))
const profile = mkdtempSync(join(tmpdir(), 'pachax-admin-studio-'))
const browser = spawn(chrome, ['--headless=new', '--disable-gpu', '--no-sandbox', `--remote-debugging-port=${port}`, '--remote-allow-origins=*', `--user-data-dir=${profile}`, base], { stdio: 'ignore' })
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
let socket
try {
  let page
  for (let attempt = 0; attempt < 50; attempt++) {
    await sleep(200)
    try {
      page = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find(item => item.type === 'page' && item.webSocketDebuggerUrl)
      if (page) break
    } catch { /* Browser starting. */ }
  }
  assert(page?.webSocketDebuggerUrl, 'No se encontró Chrome CDP.')
  socket = new WebSocket(page.webSocketDebuggerUrl)
  await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject })
  let nextId = 1
  const pending = new Map()
  const errors = []
  socket.onmessage = event => {
    const value = JSON.parse(event.data)
    if (value.method === 'Runtime.exceptionThrown') errors.push(value.params.exceptionDetails.text)
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
  const sizes = [[390, 844], [768, 1024], [1366, 768], [1920, 1080]]
  const studioRoutes = ['restaurant', 'distribution', 'nightclub', 'retail'].flatMap(template => ['full', 'empty'].map(data => `/studio?template=${template}&data=${data}`))
  const routes = ['/admin/login', '/admin', '/studio', ...studioRoutes, '/demo', '/demo/restaurant', '/demo/distribution', '/demo/nightclub', '/demo/retail']
  for (const [width, height] of sizes) {
    await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 500 })
    for (const route of routes) {
      errors.length = 0
      await send('Page.navigate', { url: new URL(route, base).href })
      await sleep(850)
      const result = await evalPage(`(() => { const root=document.getElementById('root'); const frame=document.querySelector('iframe'); return { text:(root?.innerText||'').slice(0,250), frameText:(frame?.contentDocument?.body?.innerText||'').slice(0,250), overflow:document.documentElement.scrollWidth-innerWidth, frame:!!frame, viteError:!!document.querySelector('vite-error-overlay') } })()`)
      assert(result.text.length > 20, `${route} vacío en ${width}×${height}`)
      assert(!result.viteError, `${route} tiene overlay de Vite`)
      assert(!errors.length, `${route} excepción en ${width}×${height}: ${errors.join('; ')}`)
      assert(result.overflow < 12, `${route} desborda ${result.overflow}px en ${width}×${height}`)
      if (route.startsWith('/studio?')) {
        assert(result.frame, `Studio sin preview para ${route}`)
        assert(result.frameText.length > 20, `Preview de Studio vacío para ${route}`)
      }
      console.log(`OK ${width}x${height} ${route}`)
    }
  }
  await send('Emulation.setDeviceMetricsOverride', { width: 1366, height: 768, deviceScaleFactor: 1, mobile: false })
  await send('Page.navigate', { url: new URL('/studio?template=nightclub&data=empty', base).href })
  await sleep(1000)
  const controls = await evalPage(`(() => { const doc=document.querySelector('iframe')?.contentDocument; const button=[...doc.querySelectorAll('button')].find(item=>item.textContent.trim()==='Configuración'); if (!button) return {found:false, labels:[...doc.querySelectorAll('button')].map(item=>item.textContent.trim()).filter(Boolean).slice(0,25)}; button.click(); return {found:true} })()`)
  assert(controls.found, `No se puede abrir Configuración en Nightclub: ${JSON.stringify(controls.labels)}`)
  await sleep(200)
  const settings = await evalPage(`(() => { const doc=document.querySelector('iframe').contentDocument; return {identity:doc.body.innerText.includes('Identidad del negocio'), floor:doc.body.innerText.includes('Zonas y mesas'), products:doc.body.innerText.includes('Productos')} })()`)
  assert(settings.identity && settings.floor, 'Nightclub vacío no ofrece identidad o creación de zonas y mesas.')
  console.log('OK Nightclub Empty → Configuración → identidad y zonas/mesas')
} finally {
  socket?.close()
  browser.kill()
  await sleep(500)
  try { rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }) } catch { /* Chrome may still own its profile on Windows. */ }
}
