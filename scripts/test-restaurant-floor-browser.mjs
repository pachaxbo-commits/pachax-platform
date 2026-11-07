import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { createServer as createTcpServer } from 'node:net'
import { createServer } from 'node:http'
import { extname, join, resolve, sep } from 'node:path'
import { tmpdir } from 'node:os'

const chrome = [process.env.CHROME_BIN, 'C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe', '/usr/bin/google-chrome', '/usr/bin/chromium'].filter(Boolean).find(existsSync)
assert.ok(chrome, 'Chrome not found')
const root = resolve('dist')
const evidenceDir = resolve('docs/demo-app-integration-evidence')
const retailEvidenceDir = resolve('docs/restaurant-floor-evidence')
assert.ok(existsSync(join(root, 'demo-isolated.html')), 'Run npm run build:emulator first')
mkdirSync(evidenceDir, { recursive: true })
mkdirSync(retailEvidenceDir, { recursive: true })

const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.woff2': 'font/woff2', '.json': 'application/json' }
const csp = "default-src 'self'; base-uri 'self'; object-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'none'; frame-src 'none'; frame-ancestors 'self'; form-action 'self'; media-src 'self' blob:"
const requests = []
const server = createServer((req, res) => {
  const url = new URL(req.url || '/', 'http://127.0.0.1')
  let pathname
  try { pathname = decodeURIComponent(url.pathname) } catch { res.writeHead(400).end(); return }
  requests.push({ path: pathname, method: req.method })
  if (pathname === '/favicon.ico') { res.writeHead(204).end(); return }
  let filePath = pathname === '/demo/hamburger' || pathname === '/demo/retail'
    ? join(root, 'demo-isolated.html')
    : pathname === '/demo' || pathname.startsWith('/demo/')
      ? join(root, 'demo.html')
      : pathname === '/studio' || pathname.startsWith('/studio/')
        ? join(root, 'studio.html')
        : pathname === '/'
          ? join(root, 'index.html')
          : resolve(root, `.${pathname}`)
  if (!filePath.startsWith(root + sep) && filePath !== join(root, 'index.html')) { res.writeHead(403).end(); return }
  if (!existsSync(filePath)) {
    if (pathname.startsWith('/assets/') || pathname.startsWith('/demo-assets/') || extname(pathname)) { res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8', 'x-content-type-options': 'nosniff' }).end('Not found'); return }
    filePath = join(root, 'index.html')
  }
  const isIsolatedHtml = filePath === join(root, 'demo-isolated.html')
  const headers = { 'content-type': types[extname(filePath)] || 'application/octet-stream', 'x-content-type-options': 'nosniff' }
  if (isIsolatedHtml) Object.assign(headers, { 'content-security-policy': csp, 'referrer-policy': 'no-referrer', 'x-frame-options': 'SAMEORIGIN', 'cache-control': 'no-store' })
  else if (pathname.startsWith('/demo-assets/')) headers['cache-control'] = 'public, max-age=31536000, immutable'
  res.writeHead(200, headers)
  res.end(readFileSync(filePath))
})
await new Promise((done) => server.listen(0, '127.0.0.1', done))
const { port } = server.address()
const debugProbe = createTcpServer()
await new Promise((done) => debugProbe.listen(0, '127.0.0.1', done))
const debugPort = debugProbe.address().port
await new Promise((done) => debugProbe.close(done))
const profile = mkdtempSync(join(tmpdir(), 'pachax-main-demo-integration-'))
const browser = spawn(chrome, ['--headless=new', '--disable-gpu', '--no-sandbox', '--disable-background-networking', '--disable-sync', '--no-first-run', '--no-default-browser-check', `--remote-debugging-port=${debugPort}`, '--remote-allow-origins=*', `--user-data-dir=${profile}`, 'about:blank'], { stdio: 'ignore' })
const wait = (ms) => new Promise((done) => setTimeout(done, ms))
let socket
let completed = false
const browserErrors = []
const browserRequests = []
let activeViewportWidth = 1440
try {
  let tab
  for (let attempt = 0; attempt < 100; attempt++) {
    await wait(100)
    try { tab = (await (await fetch(`http://127.0.0.1:${debugPort}/json`)).json()).find((entry) => entry.type === 'page'); if (tab?.webSocketDebuggerUrl) break } catch {}
  }
  assert.ok(tab?.webSocketDebuggerUrl, 'Chrome CDP did not open')
  socket = new WebSocket(tab.webSocketDebuggerUrl)
  await new Promise((done, fail) => { socket.onopen = done; socket.onerror = fail })
  let sequence = 1
  const pending = new Map()
  socket.onmessage = ({ data }) => {
    const message = JSON.parse(data)
    if (!pending.has(message.id)) return
    const task = pending.get(message.id); pending.delete(message.id)
    message.error ? task.reject(new Error(JSON.stringify(message.error))) : task.resolve(message.result)
  }
  const send = (method, params = {}) => new Promise((resolvePromise, reject) => { const id = sequence++; pending.set(id, { resolve: resolvePromise, reject }); socket.send(JSON.stringify({ id, method, params })) })
  const evaluate = async (expression) => {
    const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
    if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails))
    return result.result.value
  }
  const clickWithPointer = async (selector, text = '', index = 0) => {
    await evaluate(`(() => { const element=[...document.querySelectorAll(${JSON.stringify(selector)})].filter(item => !${JSON.stringify(text)} || item.innerText.includes(${JSON.stringify(text)}))[${index}]; element?.scrollIntoView({block:'center',behavior:'instant'}); })()`)
    await wait(60)
    const point = await evaluate(`(() => { const element=[...document.querySelectorAll(${JSON.stringify(selector)})].filter(item => !${JSON.stringify(text)} || item.innerText.includes(${JSON.stringify(text)}))[${index}]; if (!element) return null; const rect=element.getBoundingClientRect(); return {x:rect.left+rect.width/2,y:rect.top+rect.height/2} })()`)
    assert.ok(point, `Pointer target ${selector}${text ? ` (${text})` : ''} exists`)
    if (activeViewportWidth < 500) {
      await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ id: 1, ...point }] }); await wait(80)
      await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await wait(300)
    } else {
      await send('Input.dispatchMouseEvent', { type: 'mouseMoved', ...point })
      await send('Input.dispatchMouseEvent', { type: 'mousePressed', ...point, button: 'left', clickCount: 1 })
      await send('Input.dispatchMouseEvent', { type: 'mouseReleased', ...point, button: 'left', clickCount: 1 })
    }
  }
  const captureScreenshot = async (label, selector = null) => {
    const clip = selector ? await evaluate(`(() => { const rect=document.querySelector(${JSON.stringify(selector)})?.getBoundingClientRect(); return rect ? {x:rect.x+scrollX,y:rect.y+scrollY,width:rect.width,height:rect.height,scale:1} : null })()`) : null
    const capture = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: Boolean(clip), ...(clip ? { clip } : {}) })
    writeFileSync(join(retailEvidenceDir, `${label}.png`), Buffer.from(capture.data, 'base64'))
  }
  socket.addEventListener('message', ({ data }) => {
    const message = JSON.parse(data)
    if (message.method === 'Runtime.exceptionThrown') browserErrors.push(message.params.exceptionDetails?.text || 'runtime exception')
    if (message.method === 'Log.entryAdded' && message.params.entry.level === 'error') browserErrors.push(message.params.entry.text)
    if (message.method === 'Network.requestWillBeSent') browserRequests.push(message.params.request.url)
  })
  await send('Page.enable'); await send('Runtime.enable'); await send('Log.enable'); await send('Network.enable')


  const waitFor = async expression => { for (let i=0;i<100;i++){ if(await evaluate(expression))return; await wait(100) } console.error(await evaluate('document.body?.innerText')); await captureScreenshot('failure'); throw Error('Missing UI: '+expression) }
  const reports=[]
  for(const width of (process.env.FLOOR_WIDTH ? [Number(process.env.FLOOR_WIDTH)] : [320,360,375,390,430,768,1024,1440,1920])){
    console.log('Floor viewport',width)
    activeViewportWidth=width
    await send('Emulation.setDeviceMetricsOverride',{width,height:width<500?844:width===1024?768:1000,deviceScaleFactor:1,mobile:width<500})
    await send('Emulation.setTouchEmulationEnabled',{enabled:width<500,maxTouchPoints:1})
    if(await evaluate("location.origin!=='null'")) await evaluate('sessionStorage.clear()')
    await send('Page.navigate',{url:`http://127.0.0.1:${port}/demo/restaurant?data=full`})
    await waitFor("document.body?.innerText?.includes('Ver plano completo')")
    await wait(600)
    if(await evaluate("document.body?.innerText.includes('Saltar por ahora')")) { await clickWithPointer('button','Saltar por ahora'); await wait(150); await clickWithPointer('button','Entendido'); await wait(150) }
    await clickWithPointer('button','Ver plano completo')
    await waitFor("Boolean(document.querySelector('.restaurant-floor-table'))")
    await evaluate("document.querySelector('.restaurant-floor').scrollIntoView({block:'start',behavior:'instant'})")
    await captureScreenshot(`${width}-floor`,'.restaurant-floor')
    assert(await evaluate("document.documentElement.scrollWidth<=innerWidth+1"),`No page overflow at ${width}`)
    const state=await evaluate("document.querySelector('.restaurant-floor-table').getAttribute('aria-label')")
    await clickWithPointer('.restaurant-floor-table')
    await waitFor("Boolean(document.querySelector('[role=dialog]'))")
    await captureScreenshot(`${width}-table-detail`)
    await clickWithPointer('[role=dialog] button[aria-label="Cerrar"]')
    assert.equal(await evaluate("document.querySelector('.restaurant-floor-table').getAttribute('aria-label')"),state,'Selecting never mutates state')
    await clickWithPointer('button','Editar distribución')
    await clickWithPointer('.restaurant-floor-table')
    assert.equal(await evaluate("document.querySelectorAll('[role=dialog]').length"),0,'Editing does not open an account')
    const before=await evaluate("document.querySelector('.restaurant-floor-table').style.top")
    if(width===1920){
      const left=await evaluate("document.querySelector('.restaurant-floor-table').style.left")
      await send('Input.dispatchKeyEvent',{type:'keyDown',key:'ArrowLeft',code:'ArrowLeft',windowsVirtualKeyCode:37})
      await send('Input.dispatchKeyEvent',{type:'keyUp',key:'ArrowLeft',code:'ArrowLeft',windowsVirtualKeyCode:37})
      assert.notEqual(await evaluate("document.querySelector('.restaurant-floor-table').style.left"),left,'Keyboard moves the selected table')
    }

    await clickWithPointer('button[aria-label="Mover mesa ↑"]')
    const after=await evaluate("document.querySelector('.restaurant-floor-table').style.top")
    assert.notEqual(after,before,'Tactile nudge moves table')
    await captureScreenshot(`${width}-editor`)
    await clickWithPointer('button','Cancelar edición')
    assert.equal(await evaluate("document.querySelector('.restaurant-floor-table').style.top"),before,'Cancel restores persisted coordinates')
    await clickWithPointer('button','Editar distribución')
    await clickWithPointer('.restaurant-floor-table')
    await clickWithPointer('button[aria-label="Mover mesa ↑"]')
    if(width===1440){
      await evaluate("document.querySelector('.restaurant-floor-table').scrollIntoView({block:'center',behavior:'instant'})")
      const p=await evaluate("(()=>{const e=document.querySelector('.restaurant-floor-table'),r=e.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()")
      const oldLeft=await evaluate("document.querySelector('.restaurant-floor-table').style.left")
      {
        await send('Input.dispatchMouseEvent',{type:'mousePressed',...p,button:'left',clickCount:1})
        await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:p.x+20,y:p.y,button:'left',buttons:1})
        await send('Input.dispatchMouseEvent',{type:'mouseReleased',x:p.x+20,y:p.y,button:'left',clickCount:1})
      }
      await wait(400)
      assert.notEqual(await evaluate("document.querySelector('.restaurant-floor-table').style.left"),oldLeft,'Pointer drag moves layout')
      assert.equal(await evaluate("document.querySelectorAll('[role=dialog]').length"),0,'Drag never opens account')
    }

    await clickWithPointer('button','Guardar distribución')
    await waitFor("!document.body?.innerText.includes('Cancelar edición')")
    assert.equal(await evaluate("document.querySelector('.restaurant-floor-table').style.top"),after,'Saved layout rendered')
    await captureScreenshot(`${width}-saved`)
    reports.push({width,selection:true,touch:width<500,layoutSaved:true})
    await send('Page.reload',{ignoreCache:true})
    await waitFor("document.body?.innerText?.includes('Ver plano completo')")
    await wait(600)
    if(await evaluate("document.body?.innerText.includes('Saltar por ahora')")) { await clickWithPointer('button','Saltar por ahora'); await wait(150); await clickWithPointer('button','Entendido'); await wait(150) }
    await clickWithPointer('button','Ver plano completo')
    await waitFor("Boolean(document.querySelector('.restaurant-floor-table'))")
    assert.equal(await evaluate("document.querySelector('.restaurant-floor-table').style.top"),after,'Demo session retains layout after reload')
    if(width===390 || width===1440){
      await clickWithPointer('[data-tour="tables-available"]')
      await clickWithPointer('button','Abrir mesa y añadir producto')
      await waitFor("Boolean(document.querySelector('[aria-label=\"Añadir producto\"]'))")
      await clickWithPointer('[aria-label="Añadir producto"] button','Lomo')
      await clickWithPointer('button','Añadir selección al pedido')
      await waitFor("!document.querySelector('[aria-label=\"Añadir producto\"]')")
      assert(await evaluate("!document.querySelector('[data-tour=table-send-kitchen]').disabled"),'New product permits kitchen batch')
      await captureScreenshot(`${width}-order-actions`)
      await clickWithPointer('[data-tour="table-request-bill"]')
      await waitFor("Boolean([...document.querySelectorAll('button')].find(b=>b.innerText.includes('Reabrir'))) ")
      await captureScreenshot(`${width}-bill-requested`)
      await clickWithPointer('button','Reabrir')
      await waitFor("Boolean(document.querySelector('[data-tour=table-add-product]'))")
      await clickWithPointer('[data-floor-details] button[aria-label="Cerrar"]')
    }

  }

  // Local demo-only data exercises large, legacy and mixed-shape floors.
  await evaluate(`(()=>{const key=Object.keys(sessionStorage).find(k=>k.endsWith(':tables'));const tables=JSON.parse(sessionStorage.getItem(key));const sectorId=tables[0].sectorId;const extras=Array.from({length:30},(_,i)=>({id:'qa-floor-'+i,name:'QA Mesa '+i,sectorId,capacity:i===2?100:(i%8)+1,shape:['round','rectangle','square'][i%3],status:'available',active:i!==1,sortOrder:100+i,...(i===0?{archivedAt:'2026-11-06T00:00:00Z'}:{})}));sessionStorage.setItem(key,JSON.stringify([...tables,...extras]));})()`)
  await send('Page.reload',{ignoreCache:true})
  await waitFor("document.body?.innerText?.includes('Ver plano completo')")
  await wait(300); await clickWithPointer('button','Ver plano completo')
  await waitFor("document.querySelectorAll('.restaurant-floor-table').length>30")
  assert(await evaluate("document.querySelector('.restaurant-floor-table.inactive').disabled"),'Inactive table cannot operate')
  assert.equal(await evaluate("document.querySelectorAll('[data-table-id=qa-floor-2] .restaurant-table-chair').length"),12,'High capacity simplified to twelve seats')
  assert(await evaluate("Boolean(document.querySelector('circle.restaurant-table-top'))"),'Round tables use circles')
  await captureScreenshot('1920-mixed-shapes-large-floor','.restaurant-floor')
  await clickWithPointer('[data-tour="tables-start-tour"]')
  await waitFor("Boolean(document.querySelector('[aria-label^=\"Tutorial Mesas:\"]'))")
  await captureScreenshot('1920-tutorial')
  await clickWithPointer('button[aria-label="Cerrar tutorial"]')
  await clickWithPointer('button','Mesero')
  await wait(300)
  if(await evaluate("document.body?.innerText.includes('Saltar por ahora')")){await clickWithPointer('button','Saltar por ahora');await wait(100);await clickWithPointer('button','Entendido')}
  // Waiter sees the shared map, with administrative controls removed.
  if(!await evaluate("Boolean(document.querySelector('.restaurant-floor'))")) await clickWithPointer('[data-tour=restaurant-nav-tables]')
  await waitFor("Boolean(document.querySelector('.restaurant-floor'))")
  assert.equal(await evaluate("[...document.querySelectorAll('button')].filter(b=>b.innerText.includes('Editar distribución')).length"),0,'No administrative layout action for waiter')
  reports.push({scenario:'large floor, mixed shapes, inactive/archived, high capacity, tutorial, waiter permissions',result:'PASS'})
  await send('Page.navigate',{url:`http://127.0.0.1:${port}/demo/restaurant?data=empty`})
  await waitFor("Boolean(document.querySelector('[data-tour=restaurant-nav-tables]'))")
  await wait(600)
  if(await evaluate("document.body?.innerText.includes('Saltar por ahora')")){await clickWithPointer('button','Saltar por ahora');await wait(150);await clickWithPointer('button','Entendido')}
  await clickWithPointer('[data-tour=restaurant-nav-tables]')
  await waitFor("Boolean(document.querySelector('.restaurant-floor'))")
  assert.equal(await evaluate("document.querySelectorAll('.restaurant-floor-table').length"),0,'Empty company never generates fictitious tables')
  assert(await evaluate("document.body.innerText.includes('Debes iniciar un turno')"),'Closed shift guard remains visible')
  await captureScreenshot('1920-empty-floor','.restaurant-floor')
  reports.push({scenario:'empty company, no sectors, closed shift',result:'PASS'})
  const production=browserRequests.filter(u=>/(googleapis\.com|cloudfunctions\.net|firebaseio\.com|firebaseapp\.com)/i.test(u))
  assert.deepEqual(production,[],'No Firebase Production requests')
  const report={result:'PASS',viewports:reports,productionRequests:production,browserErrors}
  writeFileSync(join(retailEvidenceDir,'browser.json'),JSON.stringify(report,null,2))
  console.log(JSON.stringify(report,null,2)); completed = true
} finally { if (!completed) writeFileSync(join(retailEvidenceDir,'browser.json'),JSON.stringify({result:'FAIL',message:'See command output; no successful completion was recorded.'},null,2)); socket?.close(); browser.kill(); await new Promise(done=>server.close(done)) }
