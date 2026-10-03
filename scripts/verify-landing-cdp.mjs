import { spawn } from 'child_process'
import { existsSync, mkdirSync, writeFileSync } from 'fs'
import { resolve } from 'path'

const EDGE_PATH = existsSync('C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe')
  ? 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
  : 'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'

const OUT_DIR = resolve('public/brand/verification')
if (!existsSync(OUT_DIR)) {
  mkdirSync(OUT_DIR, { recursive: true })
}

const VIEWPORTS = [
  { name: '1920x1080', width: 1920, height: 1080 },
  { name: '1440x900', width: 1440, height: 900 },
  { name: '768x1024', width: 768, height: 1024 },
  { name: '430x932', width: 430, height: 932 },
  { name: '390x844', width: 390, height: 844 },
  { name: '360x800', width: 360, height: 800 },
]

async function run() {
  console.log('=== VERIFICACIÓN AUTOMATIZADA CDP (EDGE HEADLESS) ===')
  
  const profileDir = resolve('.unique_debug_profile')
  const proc = spawn(EDGE_PATH, [
    '--headless=new',
    '--disable-gpu',
    '--no-sandbox',
    '--remote-debugging-port=9333',
    '--remote-allow-origins=*',
    `--user-data-dir=${profileDir}`,
    'http://localhost:5190/',
  ])

  // Esperar a que el puerto responda
  let pageTab = null
  for (let i = 0; i < 25; i++) {
    await new Promise((r) => setTimeout(r, 300))
    try {
      const res = await fetch('http://127.0.0.1:9333/json')
      const tabs = await res.json()
      pageTab = tabs.find((t) => t.type === 'page' && t.url.includes('5190'))
      if (pageTab && pageTab.webSocketDebuggerUrl) break
    } catch {}
  }

  if (!pageTab || !pageTab.webSocketDebuggerUrl) {
    proc.kill()
    throw new Error('No se encontró tab de página en CDP')
  }

  console.log('Conectado a CDP página:', pageTab.webSocketDebuggerUrl)
  const ws = new WebSocket(pageTab.webSocketDebuggerUrl)

  await new Promise((res, rej) => {
    ws.onopen = res
    ws.onerror = rej
  })

  let msgId = 1
  const pending = new Map()

  ws.onmessage = (event) => {
    const data = JSON.parse(event.data)
    if (data.id && pending.has(data.id)) {
      const { resolve, reject } = pending.get(data.id)
      pending.delete(data.id)
      if (data.error) reject(data.error)
      else resolve(data.result)
    }
  }

  function send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = msgId++
      pending.set(id, { resolve, reject })
      ws.send(JSON.stringify({ id, method, params }))
    })
  }

  await send('Page.enable')
  await send('DOM.enable')
  await send('Runtime.enable')

  // Esperar hidratación completa de React
  await new Promise((r) => setTimeout(r, 1500))

  const results = {
    viewports: {},
    coverflowInteractions: {},
    sectionsChecked: {},
  }

  // 1. Probar cada viewport y medir getBoundingClientRect()
  for (const vp of VIEWPORTS) {
    console.log(`\n--- Probando Viewport: ${vp.name} (${vp.width}x${vp.height}) ---`)
    
    await send('Emulation.setDeviceMetricsOverride', {
      width: vp.width,
      height: vp.height,
      deviceScaleFactor: 1,
      mobile: vp.width < 768,
    })

    await new Promise((r) => setTimeout(r, 400))

    const evalRes = await send('Runtime.evaluate', {
      expression: `(() => {
        const sw = document.documentElement.scrollWidth;
        const iw = window.innerWidth;
        const header = document.querySelector('header');
        const logo = header ? header.querySelector('img') : null;
        
        // Elementos interactivos en el header
        const allButtons = Array.from(header ? header.querySelectorAll('button') : []);
        const loginBtn = allButtons.find(b => b.textContent.includes('Iniciar sesión') && b.offsetParent !== null);
        const regBtn = allButtons.find(b => b.textContent.includes('Registrarse') && b.offsetParent !== null);
        const menuBtn = allButtons.find(b => b.getAttribute('aria-label') && b.getAttribute('aria-label').includes('menú') && b.offsetParent !== null);

        const getBox = (el, name) => {
          if (!el) return { name, exists: false, visible: false };
          const r = el.getBoundingClientRect();
          return {
            name,
            exists: true,
            x: Math.round(r.x),
            y: Math.round(r.y),
            width: Math.round(r.width),
            height: Math.round(r.height),
            right: Math.round(r.right),
            visible: r.width > 0 && r.height > 0,
            fitsInViewport: r.left >= 0 && r.right <= iw
          };
        };

        // Identificar elementos que causan overflow horizontal si sw > iw
        let overflowingElements = [];
        if (sw > iw) {
          const all = document.querySelectorAll('*');
          for (const el of all) {
            const r = el.getBoundingClientRect();
            if (r.right > iw + 1) {
              overflowingElements.push({
                tag: el.tagName,
                className: (el.className || '').toString().slice(0, 50),
                right: Math.round(r.right),
                excess: Math.round(r.right - iw)
              });
              if (overflowingElements.length >= 5) break;
            }
          }
        }

        return {
          scrollWidth: sw,
          innerWidth: iw,
          noHorizontalOverflow: sw <= iw,
          logo: getBox(logo, 'logo'),
          loginBtn: getBox(loginBtn, 'loginBtn'),
          regBtn: getBox(regBtn, 'regBtn'),
          menuBtn: getBox(menuBtn, 'menuBtn'),
          overflowingElements
        };
      })()`,
      returnByValue: true,
    })

    const data = evalRes.result.value
    console.log(`Scroll Metrics: scrollWidth=${data.scrollWidth}, innerWidth=${data.innerWidth}, noOverflow=${data.noHorizontalOverflow}`)
    console.log('Logo:', JSON.stringify(data.logo))
    console.log('Login Btn:', JSON.stringify(data.loginBtn))
    console.log('Register Btn:', JSON.stringify(data.regBtn))
    console.log('Menu Btn:', JSON.stringify(data.menuBtn))
    if (data.overflowingElements && data.overflowingElements.length > 0) {
      console.warn('OVERFLOW DETECTADO EN ELEMENTOS:', JSON.stringify(data.overflowingElements))
    }

    results.viewports[vp.name] = data

    // Capturar screenshot nítido del viewport
    const shot = await send('Page.captureScreenshot', { format: 'png' })
    const shotPath = resolve(OUT_DIR, `landing-${vp.name}.png`)
    writeFileSync(shotPath, Buffer.from(shot.data, 'base64'))
    console.log(`Guardado screenshot: ${shotPath}`)
  }

  // 2. Probar Interacciones del Coverflow (Flechas, Tarjetas laterales, Dots)
  console.log('\n--- Probando Interacciones del Coverflow ---')
  await send('Emulation.setDeviceMetricsOverride', {
    width: 1440,
    height: 900,
    deviceScaleFactor: 1,
    mobile: false,
  })
  await new Promise((r) => setTimeout(r, 400))

  // Click en Flecha Derecha
  const clickNext = await send('Runtime.evaluate', {
    expression: `(() => {
      const btn = document.querySelector('button[aria-label="Siguiente plantilla"]');
      if (btn) {
        btn.click();
        return true;
      }
      return false;
    })()`,
    returnByValue: true,
  })
  await new Promise((r) => setTimeout(r, 500))

  // Click en Tarjeta Lateral
  const clickLateral = await send('Runtime.evaluate', {
    expression: `(() => {
      const cards = Array.from(document.querySelectorAll('[data-coverflow-card]'));
      const lateral = cards.find(c => c.getAttribute('data-active') === 'false');
      if (lateral) {
        lateral.click();
        return true;
      }
      return false;
    })()`,
    returnByValue: true,
  })
  await new Promise((r) => setTimeout(r, 500))

  results.coverflowInteractions = {
    arrowRightClicked: clickNext.result.value,
    lateralCardClicked: clickLateral.result.value,
  }
  console.log('Coverflow Interactions:', results.coverflowInteractions)

  // 3. Capturar Screenshots de las 5 Nuevas Secciones
  console.log('\n--- Capturando Screenshots de las 5 Nuevas Secciones ---')
  const sections = [
    { id: 'plantillas', name: 'seccion-1-plantillas' },
    { id: 'planes', name: 'seccion-2-planes' },
    { id: 'extras', name: 'seccion-3-extras' },
    { id: 'onboarding', name: 'seccion-4-onboarding' },
    { id: 'tutoriales', name: 'seccion-5-tutoriales' },
  ]

  for (const s of sections) {
    await send('Runtime.evaluate', {
      expression: `(() => {
        const el = document.getElementById('${s.id}');
        if (el) el.scrollIntoView({ behavior: 'instant' });
      })()`,
    })
    await new Promise((r) => setTimeout(r, 400))

    const secShot = await send('Page.captureScreenshot', { format: 'png' })
    const secPath = resolve(OUT_DIR, `${s.name}.png`)
    writeFileSync(secPath, Buffer.from(secShot.data, 'base64'))
    console.log(`Guardado screenshot: ${secPath}`)
    results.sectionsChecked[s.name] = true
  }

  // Cierre y reporte
  ws.close()
  proc.kill()

  console.log('\n=== VERIFICACIÓN COMPLETADA CON ÉXITO ===')
}

run().catch((err) => {
  console.error('Error durante la verificación:', err)
  process.exit(1)
})
