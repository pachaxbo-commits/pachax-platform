import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { existsSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createServer } from 'node:net'

const baseUrl = 'http://127.0.0.1:5190/demo/nightclub'
assert.equal((await fetch(baseUrl)).status, 200, 'El servidor local debe estar activo')
const chrome = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe'].find(existsSync)
assert(chrome, 'Chrome no encontrado')
const probe = createServer()
await new Promise(resolve => probe.listen(0, '127.0.0.1', resolve))
const port = probe.address().port
await new Promise(resolve => probe.close(resolve))
const profile = mkdtempSync(join(tmpdir(), 'pachax-nightclub-theme-'))
const browser = spawn(chrome, ['--headless=new', '--disable-gpu', '--no-sandbox', `--remote-debugging-port=${port}`, '--remote-allow-origins=*', `--user-data-dir=${profile}`, baseUrl], { stdio: 'ignore' })
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
let socket
try {
  let page
  for (let attempt = 0; attempt < 50; attempt++) {
    await sleep(200)
    try { page = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find(item => item.type === 'page' && item.webSocketDebuggerUrl); if (page) break } catch { /* Chrome starting. */ }
  }
  assert(page?.webSocketDebuggerUrl, 'No se encontró Chrome CDP')
  socket = new WebSocket(page.webSocketDebuggerUrl)
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
  const send = (method, params = {}) => new Promise((resolve, reject) => { const id = nextId++; pending.set(id, { resolve, reject }); socket.send(JSON.stringify({ id, method, params })) })
  const evaluate = async expression => {
    const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.text)
    return result.result.value
  }
  const waitFor = async expression => {
    for (let attempt = 0; attempt < 80; attempt++) { if (await evaluate(expression)) return; await sleep(125) }
    throw new Error(`No apareció: ${expression}`)
  }
  const click = async selector => {
    await waitFor(`!!document.querySelector(${JSON.stringify(selector)})`)
    await evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`)
    await sleep(220)
  }
  await send('Runtime.enable')
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false })
  await waitFor("!!document.querySelector('.nightclub-shell h1')")
  const contrast = expression => `(()=>{const e=document.querySelector(${JSON.stringify(expression)});if(!e)return null;const c=getComputedStyle(e).color;const bg=e.closest('[role=dialog]')||e.closest('section')||e.parentElement;return {text:e.textContent.trim().slice(0,70),color:c,background:getComputedStyle(bg).backgroundColor,theme:document.querySelector('.nightclub-shell')?.dataset.theme}})()`
  const darkShell = await evaluate("(()=>{const s=document.querySelector('.nightclub-shell');return {color:getComputedStyle(s).color,theme:s.dataset.theme,placeholder:getComputedStyle(s.querySelector('input')||s,'::placeholder').color}})()")
  assert.equal(darkShell.theme, 'dark', 'La demo abre en tema oscuro')
  assert.equal(darkShell.color, 'rgb(248, 250, 252)', 'El shell debe heredar texto claro en tema oscuro')
  const darkScreens = []
  for (const module of ['dashboard', 'inventory', 'products', 'pos', 'bar', 'cash', 'floor', 'users', 'reports', 'accounts', 'customers', 'promoters', 'members', 'history', 'settings']) {
    const nav = `[data-tutorial-target="nav-${module}"]`
    if (!(await evaluate(`!!document.querySelector(${JSON.stringify(nav)})`))) continue
    await click(nav)
    const screen = await evaluate("(()=>{const h=document.querySelector('.nightclub-shell h1');return {title:h?.textContent.trim(),color:h?getComputedStyle(h).color:null,background:h?getComputedStyle(h.parentElement).backgroundColor:null}})()")
    assert(screen.title, `La pantalla ${module} debe mostrar encabezado`)
    assert.notEqual(screen.color, 'rgb(23, 32, 51)', `${module}: no debe heredar el texto global oscuro`)
    darkScreens.push({ module, ...screen })
    if (module === 'inventory') {
      await click('[data-tutorial-target="inventory-new-item"]')
      await click('[data-tutorial-target="inventory-category-spirits"]')
      const form = await evaluate("(()=>{const d=[...document.querySelectorAll('[role=dialog]')].find(x=>x.getAttribute('aria-label')==='Nuevo licor')||document.querySelector('[role=dialog]');if(!d)return null;const label=d.querySelector('label'),input=d.querySelector('input:not([type=number]):not([type=checkbox])'),option=d.querySelector('select option');if(input)input.setAttribute('placeholder','Prueba');return {label:label&&getComputedStyle(label).color,input:input&&getComputedStyle(input).color,placeholder:input&&getComputedStyle(input,'::placeholder').color,option:option&&{color:getComputedStyle(option).color,background:getComputedStyle(option).backgroundColor},button:[...d.querySelectorAll('button')].map(b=>({text:b.textContent.trim(),color:getComputedStyle(b).color,background:getComputedStyle(b).backgroundColor})),labels:[...d.querySelectorAll('label')].map(x=>x.textContent.trim())}})()")
      assert(form?.labels.some(label => label.includes('Nombre')), 'El formulario de inventario debe mostrar sus etiquetas')
      assert.equal(form.input, 'rgb(248, 250, 252)', 'El valor escrito en formulario es claro')
      assert.equal(form.placeholder, 'rgb(148, 163, 184)', 'Placeholder distinguible sobre fondo oscuro')
      assert.equal(form.option.color, 'rgb(248, 250, 252)', 'Las opciones de select usan texto claro en modo oscuro')
      await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false }).then(result => writeFileSync(join(tmpdir(), 'pachax-nightclub-inventory-dark.png'), Buffer.from(result.data, 'base64')))
      await click('[role="dialog"] button.sr-only')
    }
  }
  await evaluate("[...document.querySelectorAll('button')].find(button=>button.textContent.trim()==='Tutorial')?.click()")
  await waitFor("!!document.querySelector('[data-nightclub-tutorial-panel] h2')")
  const tutorialDark = await evaluate("(()=>{const p=document.querySelector('[data-nightclub-tutorial-panel]'),h=p?.querySelector('h2');return {title:h?.textContent.trim(),panelColor:p&&getComputedStyle(p).color,titleColor:h&&getComputedStyle(h).color,background:p&&getComputedStyle(p).backgroundColor}})()")
  assert(tutorialDark.title, 'El tutorial debe abrirse en la experiencia')
  assert.equal(tutorialDark.titleColor, 'rgb(241, 245, 249)', 'El título del tutorial debe ser claro en modo oscuro')
  await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false }).then(result => writeFileSync(join(tmpdir(), 'pachax-nightclub-tutorial-dark.png'), Buffer.from(result.data, 'base64')))
  await click('button[aria-label="Modo claro"]')
  await sleep(250)
  const light = await evaluate("(()=>{const s=document.querySelector('.nightclub-shell'),h=s.querySelector('h1'),option=s.querySelector('select option');return {theme:s.dataset.theme,color:getComputedStyle(s).color,heading:h&&getComputedStyle(h).color,background:getComputedStyle(s).backgroundColor,option:option&&{color:getComputedStyle(option).color,background:getComputedStyle(option).backgroundColor}}})()")
  assert.equal(light.theme, 'light', 'El botón cambia a tema claro')
  assert.equal(light.color, 'rgb(15, 23, 42)', 'El tema claro mantiene texto oscuro')
  assert.equal(light.option.color, 'rgb(15, 23, 42)', 'Las opciones de select regresan a texto oscuro en modo claro')
  await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false }).then(result => writeFileSync(join(tmpdir(), 'pachax-nightclub-light.png'), Buffer.from(result.data, 'base64')))
  await click('button[aria-label="Modo oscuro"]')
  const switchedBack = await evaluate("document.querySelector('.nightclub-shell')?.dataset.theme")
  assert.equal(switchedBack, 'dark', 'El tema oscuro se restaura sin estilos retenidos del modo claro')
  console.log(JSON.stringify({ darkScreens, tutorialDark, light, screenshots: [join(tmpdir(), 'pachax-nightclub-inventory-dark.png'), join(tmpdir(), 'pachax-nightclub-tutorial-dark.png'), join(tmpdir(), 'pachax-nightclub-light.png')] }, null, 2))
} finally {
  socket?.close()
  browser.kill()
}
