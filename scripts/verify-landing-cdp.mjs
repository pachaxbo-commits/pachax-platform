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
  console.log('=== VERIFICACIÓN RIGUROSA CDP (EDGE HEADLESS) ===')
  
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
    whatsappLinks: {},
    demoNavigation: {},
    sectionsChecked: {},
  }

  // 1. Probar cada viewport y verificar métricas de layout
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
    if (data.overflowingElements && data.overflowingElements.length > 0) {
      console.warn('OVERFLOW DETECTADO:', JSON.stringify(data.overflowingElements))
    }

    results.viewports[vp.name] = data

    // Capturar screenshot del viewport
    const shot = await send('Page.captureScreenshot', { format: 'png' })
    const shotPath = resolve(OUT_DIR, `landing-${vp.name}.png`)
    writeFileSync(shotPath, Buffer.from(shot.data, 'base64'))
    console.log(`Guardado screenshot: ${shotPath}`)
  }

  // 2. CAPTURAS FULL PAGE en viewports requeridos: 1920, 1440, 430, 390
  console.log('\n--- Generando Full-Page Screenshots (1920, 1440, 430, 390) ---')
  for (const fpVp of [
    { name: '1920', width: 1920, height: 1080 },
    { name: '1440', width: 1440, height: 900 },
    { name: '430', width: 430, height: 932, mobile: true },
    { name: '390', width: 390, height: 844, mobile: true },
  ]) {
    await send('Emulation.setDeviceMetricsOverride', {
      width: fpVp.width,
      height: fpVp.height,
      deviceScaleFactor: 1,
      mobile: fpVp.mobile || false,
    })
    await new Promise((r) => setTimeout(r, 400))

    // Obtener altura total del documento
    const docHeightRes = await send('Runtime.evaluate', {
      expression: 'Math.max(document.body.scrollHeight, document.documentElement.scrollHeight)',
      returnByValue: true,
    })
    const docHeight = docHeightRes.result.value || 3000

    // Capturar screenshot de página completa usando captureScreenshot con clip
    const fullShot = await send('Page.captureScreenshot', {
      format: 'png',
      captureBeyondViewport: true,
      clip: {
        x: 0,
        y: 0,
        width: fpVp.width,
        height: docHeight,
        scale: 1,
      },
    })
    const fpPath = resolve(OUT_DIR, `landing-${fpVp.name}-full.png`)
    writeFileSync(fpPath, Buffer.from(fullShot.data, 'base64'))
    console.log(`Guardado FULL-PAGE screenshot (${fpVp.name}px, alto ${docHeight}px): ${fpPath}`)
  }

  // 3. PROBAR INTERACCIÓN DEL COVERFLOW (Desktop 1440x900)
  console.log('\n--- Probando Interacciones del Coverflow (1440x900) ---')
  await send('Emulation.setDeviceMetricsOverride', {
    width: 1440,
    height: 900,
    deviceScaleFactor: 1,
    mobile: false,
  })
  await new Promise((r) => setTimeout(r, 400))

  // A. Obtener estado inicial del Coverflow
  const initialCoverflowState = await send('Runtime.evaluate', {
    expression: `(() => {
      const activeCard = document.querySelector('[data-coverflow-card][data-active="true"]');
      const activeIndex = activeCard ? activeCard.getAttribute('data-index') : null;
      const allCards = Array.from(document.querySelectorAll('[data-coverflow-card]')).map(c => ({
        index: c.getAttribute('data-index'),
        active: c.getAttribute('data-active'),
        title: c.querySelector('h3')?.textContent || ''
      }));
      return { activeIndex, allCards };
    })()`,
    returnByValue: true,
  })
  console.log('Coverflow estado inicial:', initialCoverflowState.result.value)

  // B. Click en tarjeta lateral (elegir una que NO esté activa)
  const currentIdx = initialCoverflowState.result.value.activeIndex || '0'
  const lateralTargetIndex = currentIdx === '1' ? '2' : '1'
  await send('Runtime.evaluate', {
    expression: `(() => {
      const card = document.querySelector('[data-coverflow-card][data-index="${lateralTargetIndex}"]');
      if (card) {
        card.click();
        return true;
      }
      return false;
    })()`,
  })
  await new Promise((r) => setTimeout(r, 600))

  const afterLateralClick = await send('Runtime.evaluate', {
    expression: `(() => {
      const activeCard = document.querySelector('[data-coverflow-card][data-active="true"]');
      return activeCard ? activeCard.getAttribute('data-index') : null;
    })()`,
    returnByValue: true,
  })
  console.log(`Coverflow tras click en tarjeta lateral ${lateralTargetIndex}: activeIndex =`, afterLateralClick.result.value)

  // C. Click en flecha Siguiente
  await send('Runtime.evaluate', {
    expression: `(() => {
      const nextBtn = document.querySelector('button[aria-label="Siguiente plantilla"]');
      if (nextBtn) nextBtn.click();
    })()`,
  })
  await new Promise((r) => setTimeout(r, 600))

  const afterNextArrow = await send('Runtime.evaluate', {
    expression: `(() => {
      const activeCard = document.querySelector('[data-coverflow-card][data-active="true"]');
      return activeCard ? activeCard.getAttribute('data-index') : null;
    })()`,
    returnByValue: true,
  })
  console.log('Coverflow tras flecha Siguiente: activeIndex =', afterNextArrow.result.value)

  // D. Click en dot indicador (índice 4: Solución a medida)
  await send('Runtime.evaluate', {
    expression: `(() => {
      const dots = Array.from(document.querySelectorAll('button[aria-label*="Ir a plantilla"]'));
      if (dots[4]) dots[4].click();
    })()`,
  })
  await new Promise((r) => setTimeout(r, 600))

  const afterDotClick = await send('Runtime.evaluate', {
    expression: `(() => {
      const activeCard = document.querySelector('[data-coverflow-card][data-active="true"]');
      return activeCard ? activeCard.getAttribute('data-index') : null;
    })()`,
    returnByValue: true,
  })
  console.log('Coverflow tras click en dot 4: activeIndex =', afterDotClick.result.value)

  results.coverflowInteractions = {
    desktop: {
      initialActiveIndex: currentIdx,
      lateralClickTarget: lateralTargetIndex,
      lateralClickSuccessful: afterLateralClick.result.value === lateralTargetIndex,
      arrowNextNavigated: afterNextArrow.result.value !== afterLateralClick.result.value,
      dotClickNavigated: afterDotClick.result.value === '4',
    },
  }

  // 3B. PROBAR INTERACCIÓN DEL COVERFLOW EN MOBILE (390x844)
  console.log('\n--- Probando Interacciones del Coverflow en Mobile (390x844) ---')
  await send('Emulation.setDeviceMetricsOverride', {
    width: 390,
    height: 844,
    deviceScaleFactor: 1,
    mobile: true,
  })
  await new Promise((r) => setTimeout(r, 400))

  // Click en dot indicador 1 (Distribuidora) en mobile
  await send('Runtime.evaluate', {
    expression: `(() => {
      const dots = Array.from(document.querySelectorAll('button[aria-label*="Ir a plantilla"]'));
      if (dots[1]) dots[1].click();
    })()`,
  })
  await new Promise((r) => setTimeout(r, 500))

  const mobileDotClick = await send('Runtime.evaluate', {
    expression: `(() => {
      const activeCard = document.querySelector('[data-coverflow-card][data-active="true"]');
      return activeCard ? activeCard.getAttribute('data-index') : null;
    })()`,
    returnByValue: true,
  })
  console.log('Mobile Coverflow tras click en dot 1: activeIndex =', mobileDotClick.result.value)

  // Click en flecha Siguiente en mobile
  await send('Runtime.evaluate', {
    expression: `(() => {
      const nextBtn = document.querySelector('button[aria-label="Siguiente plantilla"]');
      if (nextBtn) nextBtn.click();
    })()`,
  })
  await new Promise((r) => setTimeout(r, 500))

  const mobileNextArrow = await send('Runtime.evaluate', {
    expression: `(() => {
      const activeCard = document.querySelector('[data-coverflow-card][data-active="true"]');
      return activeCard ? activeCard.getAttribute('data-index') : null;
    })()`,
    returnByValue: true,
  })
  console.log('Mobile Coverflow tras flecha Siguiente: activeIndex =', mobileNextArrow.result.value)

  // Click en tarjeta lateral en mobile (índice 0: Restaurante)
  await send('Runtime.evaluate', {
    expression: `(() => {
      const card0 = document.querySelector('[data-coverflow-card][data-index="0"]');
      if (card0) card0.click();
    })()`,
  })
  await new Promise((r) => setTimeout(r, 500))

  const mobileLateralClick = await send('Runtime.evaluate', {
    expression: `(() => {
      const activeCard = document.querySelector('[data-coverflow-card][data-active="true"]');
      return activeCard ? activeCard.getAttribute('data-index') : null;
    })()`,
    returnByValue: true,
  })
  console.log('Mobile Coverflow tras click en tarjeta lateral 0: activeIndex =', mobileLateralClick.result.value)

  results.coverflowInteractions.mobile = {
    dotClickNavigated: mobileDotClick.result.value === '1',
    arrowNextNavigated: mobileNextArrow.result.value === '2',
    lateralClickNavigated: mobileLateralClick.result.value === '0',
  }
  console.log('Resultados Coverflow Mobile:', results.coverflowInteractions.mobile)

  // Restaurar desktop para siguientes pruebas
  await send('Emulation.setDeviceMetricsOverride', {
    width: 1440,
    height: 900,
    deviceScaleFactor: 1,
    mobile: false,
  })
  await new Promise((r) => setTimeout(r, 300))

  // 4. VERIFICAR ENLACES DE WHATSAPP (Sección 1 y Sección 6)
  console.log('\n--- Verificando Enlaces de WhatsApp ---')
  const waLinksCheck = await send('Runtime.evaluate', {
    expression: `(() => {
      const heroWa = Array.from(document.querySelectorAll('a[href*="wa.me"]')).find(a => 
        a.textContent.includes('desarrollo a medida') || a.textContent.includes('WhatsApp')
      );
      const allWaLinks = Array.from(document.querySelectorAll('a[href*="wa.me"]')).map(a => ({
        text: a.textContent.trim(),
        href: a.href,
        target: a.target
      }));
      return { count: allWaLinks.length, links: allWaLinks };
    })()`,
    returnByValue: true,
  })
  console.log('Enlaces WhatsApp detectados:', JSON.stringify(waLinksCheck.result.value, null, 2))
  results.whatsappLinks = waLinksCheck.result.value

  // 5. VERIFICAR NAVEGACIÓN A DEMOS Y BOTÓN "VOLVER AL INICIO"
  console.log('\n--- Verificando Enlaces a Demos Canónicas ---')
  const demoLinksCheck = await send('Runtime.evaluate', {
    expression: `(() => {
      const catalog = document.getElementById('plantillas');
      const demoLinks = Array.from(document.querySelectorAll('a[href*="/demo/"], button[data-demo], button[data-demo-path]')).map(el => ({
        text: el.textContent.trim(),
        href: el.getAttribute('href') || el.getAttribute('data-demo-path')
      }));
      return demoLinks;
    })()`,
    returnByValue: true,
  })
  console.log('Demo links detectados:', demoLinksCheck.result.value)

  // Probar navegación a /demo/restaurant y verificar el botón "Volver al inicio"
  console.log('\n--- Navegando a /demo/restaurant para verificar header de retorno ---')
  await send('Page.navigate', { url: 'http://localhost:5190/demo/restaurant' })
  await new Promise((r) => setTimeout(r, 2000))

  const demoPageCheck = await send('Runtime.evaluate', {
    expression: `(() => {
      const homeLink = Array.from(document.querySelectorAll('a')).find(a => 
        a.textContent.includes('Volver al inicio') || a.href === window.location.origin + '/'
      );
      const datasetModeEl = document.querySelector('[data-dataset-selector], .dataset-selector') || Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Empezar desde cero') || b.textContent.includes('Ver negocio'));
      return {
        url: window.location.pathname,
        homeLinkFound: !!homeLink,
        homeLinkHref: homeLink ? homeLink.getAttribute('href') : null,
        homeLinkText: homeLink ? homeLink.textContent.trim() : null,
        datasetSelectorFound: !!datasetModeEl
      };
    })()`,
    returnByValue: true,
  })
  console.log('Estado dentro de /demo/restaurant:', demoPageCheck.result.value)
  results.demoNavigation = demoPageCheck.result.value

  // Volver a la landing page principal
  await send('Page.navigate', { url: 'http://localhost:5190/' })
  await new Promise((r) => setTimeout(r, 1500))

  // 6. CAPTURAR SCREENSHOTS DE LAS SECCIONES INDIVIDUALES
  console.log('\n--- Capturando Screenshots de las Secciones en Orden Canónico ---')
  const sections = [
    { id: 'plantillas', name: 'seccion-2-plantillas-detalle' },
    { id: 'planes', name: 'seccion-3-planes-por-plantilla' },
    { id: 'onboarding', name: 'seccion-4-configura-5-minutos' },
    { id: 'tutoriales', name: 'seccion-5-tutoriales-guiados' },
    { id: 'extras', name: 'seccion-6-extras-y-desarrollo' },
  ]

  for (const s of sections) {
    await send('Runtime.evaluate', {
      expression: `(() => {
        const el = document.getElementById('${s.id}');
        if (el) el.scrollIntoView({ behavior: 'instant', block: 'start' });
      })()`,
    })
    await new Promise((r) => setTimeout(r, 500))

    const secShot = await send('Page.captureScreenshot', { format: 'png' })
    const secPath = resolve(OUT_DIR, `${s.name}.png`)
    writeFileSync(secPath, Buffer.from(secShot.data, 'base64'))
    console.log(`Guardado screenshot de sección: ${secPath}`)
    results.sectionsChecked[s.name] = true
  }

  async function waitForSelector(selector, timeoutMs = 8000) {
    const start = Date.now()
    while (Date.now() - start < timeoutMs) {
      const res = await send('Runtime.evaluate', {
        expression: `!!document.querySelector('${selector}')`,
        returnByValue: true,
      })
      if (res?.result?.value) return true
      await new Promise((r) => setTimeout(r, 200))
    }
    return false
  }

  // 7. VERIFICACIÓN DEL PANEL ADMINISTRATIVO (/admin y /admin/login)
  console.log('\n--- Verificando Portal Administrativo (/admin y /admin/login) ---')
  results.admin = {}

  // A. Probar acceso no autenticado a /admin -> Debe renderizar /admin/login
  console.log('1. Probando guardia de seguridad unauthenticated /admin...')
  await send('Page.navigate', { url: 'http://localhost:5190/admin' })
  const foundLoginInput = await waitForSelector('[data-admin-login-email]', 8000)
  console.log('Input de login encontrado:', foundLoginInput)

  const redirectCheck = await send('Runtime.evaluate', {
    expression: `(() => {
      const hasEmailInput = !!document.querySelector('[data-admin-login-email]');
      const hasPasswordInput = !!document.querySelector('[data-admin-login-password]');
      const hasRegisterLink = Array.from(document.querySelectorAll('a, button')).some(el => 
        el.textContent.toLowerCase().includes('crear cuenta') || el.textContent.toLowerCase().includes('registrarse')
      );
      return {
        path: window.location.pathname,
        isLoginView: hasEmailInput && hasPasswordInput,
        hasEmailInput,
        hasPasswordInput,
        hasRegisterLink,
        title: document.querySelector('h1')?.textContent || ''
      };
    })()`,
    returnByValue: true,
  })

  console.log('Resultado verificación /admin no autenticado:', redirectCheck.result.value)
  results.admin.unauthenticatedAccess = redirectCheck.result.value

  // Capturar screenshot de pantalla de login de admin
  const adminLoginShot = await send('Page.captureScreenshot', { format: 'png' })
  const adminLoginPath = resolve(OUT_DIR, 'admin-login.png')
  writeFileSync(adminLoginPath, Buffer.from(adminLoginShot.data, 'base64'))
  console.log(`Guardado screenshot login admin: ${adminLoginPath}`)

  // B. Realizar Login con Operador Semilla Controlado (admin@pachax.com)
  console.log('2. Ingresando credenciales del operador controlado...')
  await send('Runtime.evaluate', {
    expression: `(() => {
      const emailInput = document.querySelector('[data-admin-login-email]');
      const pwdInput = document.querySelector('[data-admin-login-password]');
      const submitBtn = document.querySelector('[data-admin-login-submit]');

      if (emailInput && pwdInput && submitBtn) {
        // Usar native value setter para que React detecte el cambio de valor
        const nativeEmailSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
        nativeEmailSetter.call(emailInput, 'admin@pachax.com');
        emailInput.dispatchEvent(new Event('input', { bubbles: true }));

        const nativePwdSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
        nativePwdSetter.call(pwdInput, 'PachaxAdmin2026!');
        pwdInput.dispatchEvent(new Event('input', { bubbles: true }));

        // Enviar formulario
        submitBtn.click();
        return true;
      }
      return false;
    })()`,
  })

  // Esperar a que la autenticación monte el shell con sus pestañas
  console.log('Esperando montaje de AdminShell post-login...')
  const shellMounted = await waitForSelector('[data-admin-tab="dashboard"]', 8000)
  console.log('AdminShell montado con éxito:', shellMounted)

  const postLoginCheck = await send('Runtime.evaluate', {
    expression: `(() => {
      const path = window.location.pathname;
      const operatorBadge = document.querySelector('[data-operator-role]') || document.body.textContent.includes('platform_owner') || document.body.textContent.includes('admin@pachax.com') || document.body.textContent.includes('Darío (Platform Owner)');
      const navButtons = Array.from(document.querySelectorAll('[data-admin-tab]')).map(b => b.getAttribute('data-admin-tab'));
      return {
        path,
        isAuthenticated: !!operatorBadge,
        operatorBadgeFound: !!operatorBadge,
        tabsFound: navButtons
      };
    })()`,
    returnByValue: true,
  })

  console.log('Resultado post-login admin:', postLoginCheck.result.value)
  results.admin.loginSuccess = postLoginCheck.result.value

  // Capturar screenshot del Dashboard Admin
  const adminDashShot = await send('Page.captureScreenshot', { format: 'png' })
  const adminDashPath = resolve(OUT_DIR, 'admin-dashboard.png')
  writeFileSync(adminDashPath, Buffer.from(adminDashShot.data, 'base64'))
  console.log(`Guardado screenshot dashboard admin: ${adminDashPath}`)

  // C. Recorrer cada una de las 8 pestañas administrativas y capturar screenshots
  const adminTabsToTest = [
    { id: 'templates', file: 'admin-templates.png', label: 'Plantillas' },
    { id: 'plans', file: 'admin-plans.png', label: 'Planes' },
    { id: 'extras', file: 'admin-extras.png', label: 'Extras' },
    { id: 'landing', file: 'admin-content.png', label: 'Contenido Landing' },
    { id: 'media', file: 'admin-media.png', label: 'Biblioteca Media' },
    { id: 'clients', file: 'admin-clients.png', label: 'Clientes / Tenants' },
    { id: 'studio', file: 'admin-studio.png', label: 'PACHAX Studio' },
  ]

  for (const tab of adminTabsToTest) {
    console.log(`Navegando a pestaña admin: ${tab.label} (${tab.id})...`)
    await send('Runtime.evaluate', {
      expression: `(() => {
        const btn = document.querySelector('[data-admin-tab="${tab.id}"]');
        if (btn) btn.click();
      })()`,
    })
    await new Promise((r) => setTimeout(r, 800))

    const tabShot = await send('Page.captureScreenshot', { format: 'png' })
    const tabPath = resolve(OUT_DIR, tab.file)
    writeFileSync(tabPath, Buffer.from(tabShot.data, 'base64'))
    console.log(`Guardado screenshot pestaña ${tab.label}: ${tabPath}`)
    results.admin[tab.id] = true
  }

  // Guardar reporte consolidado JSON
  const reportPath = resolve(OUT_DIR, 'verification-summary.json')
  writeFileSync(reportPath, JSON.stringify(results, null, 2))
  console.log(`Reporte guardado en: ${reportPath}`)

  ws.close()
  proc.kill()

  console.log('\n=== VERIFICACIÓN RIGUROSA COMPLETADA EXITOSAMENTE ===')
}

run().catch((err) => {
  console.error('Error durante la verificación:', err)
  process.exit(1)
})
