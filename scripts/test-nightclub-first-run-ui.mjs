import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createServer } from 'vite'
import { createServer as createNetServer } from 'node:net'

const chrome = [process.env.CHROME_BIN, 'C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe'].filter(Boolean).find(existsSync)
if (!chrome) throw new Error('Chrome no encontrado; define CHROME_BIN.')
const vite = await createServer({ configFile: './vite.config.ts', mode: 'test', server: { host: '127.0.0.1', port: 5196, strictPort: true } })
await vite.listen()
const probe = createNetServer()
await new Promise(resolve => probe.listen(0, '127.0.0.1', resolve))
const debugPort = probe.address().port
await new Promise(resolve => probe.close(resolve))
const profile = mkdtempSync(join(tmpdir(), 'pachax-nightclub-settings-'))
const browser = spawn(chrome, ['--headless=new', '--disable-gpu', '--no-sandbox', `--remote-debugging-port=${debugPort}`, '--remote-allow-origins=*', `--user-data-dir=${profile}`, 'http://127.0.0.1:5196/tests/fixtures/nightclub-settings-first-run.html'], { stdio: 'ignore' })
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
let socket
try {
  let page
  for (let attempt = 0; attempt < 60; attempt++) {
    await sleep(250)
    try { page = (await (await fetch(`http://127.0.0.1:${debugPort}/json`)).json()).find(item => item.type === 'page' && item.webSocketDebuggerUrl); if (page) break } catch { /* Chrome starting. */ }
  }
  assert(page?.webSocketDebuggerUrl, 'No se encontró Chrome CDP.')
  socket = new WebSocket(page.webSocketDebuggerUrl)
  await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject })
  let nextId = 1
  const pending = new Map()
  const browserErrors = []
  socket.onmessage = event => {
    const value = JSON.parse(event.data)
    if (value.method === 'Runtime.exceptionThrown') browserErrors.push(value.params.exceptionDetails.text)
    if (!pending.has(value.id)) return
    const { resolve, reject } = pending.get(value.id)
    pending.delete(value.id)
    value.error ? reject(new Error(JSON.stringify(value.error))) : resolve(value.result)
  }
  const send = (method, params = {}) => new Promise((resolve, reject) => { const id = nextId++; pending.set(id, { resolve, reject }); socket.send(JSON.stringify({ id, method, params })) })
  const evaluate = async expression => {
    const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.text)
    return result.result.value
  }
  await send('Runtime.enable')
  for (let attempt = 0; attempt < 50; attempt++) {
    if (await evaluate("document.body.innerText.includes('Configurar almacén y Caja principal')")) break
    await sleep(200)
  }
  assert.equal(await evaluate("document.body.innerText.includes('Debes configurar las cajas y el almacén antes de comenzar a operar.')"), true, 'debe indicar que el tenant necesita configuración')
  await evaluate("[...document.querySelectorAll('button')].find(button => button.innerText.includes('Configurar almacén y Caja principal')).click()")
  for (let attempt = 0; attempt < 50; attempt++) {
    if (await evaluate("document.body.innerText.includes('Añadir caja')")) break
    await sleep(100)
  }
  assert.equal(await evaluate("document.body.innerText.includes('Almacén general') && document.body.innerText.includes('Caja principal')"), true, 'la inicialización debe actualizar la lista')
  await evaluate("[...document.querySelectorAll('button')].find(button => button.innerText.includes('Añadir caja')).click()")
  await evaluate("document.querySelector('[role=dialog] input').focus()")
  await send('Input.insertText', { text: 'Caja 2' })
  await evaluate("document.querySelector('[role=dialog] button[type=submit]').click()")
  for (let attempt = 0; attempt < 50; attempt++) {
    if (await evaluate("window.__nightclubCalls.some(call => call.type === 'create')")) break
    await sleep(100)
  }
  const calls = await evaluate('window.__nightclubCalls')
  assert.deepEqual(calls.map(call => call.type), ['initialize', 'create'])
  assert.equal(calls[1].name, 'Caja 2')
  assert(calls.every(call => call.operationId.length > 20), 'cada acción debe enviar operationId')
  assert.equal(await evaluate("document.body.innerText.includes('Caja 2')"), true, 'Caja 2 debe aparecer tras respuesta y actualización realtime simulada')
  assert.equal(browserErrors.length, 0, browserErrors.join('\n'))
  console.log('PASS: Configuración muestra primer uso, inicializa y crea Caja 2 desde el formulario con operationId.')
} finally {
  socket?.close()
  browser.kill()
  await Promise.race([new Promise(resolve => browser.once('exit', resolve)), sleep(3000)])
  try { rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 250 }) } catch { /* Chromium may retain a temporary lock briefly on Windows. */ }
  await vite.close()
}
